import { readFile } from "node:fs/promises";
import type { JobRecord } from "../../schemas/job-posting.js";
import {
	type MarketAnalysis,
	marketAnalysisSchema,
} from "../../schemas/market-analysis.js";
import type {
	StructuredCallRequest,
	StructuredCallResult,
} from "../../tools/openrouter.js";
import { aggregateFingerprint } from "../../tools/source-id.js";
import type { UsageSummary } from "../../usage.js";
import {
	type CacheResult,
	loadCachedMarketAnalysis,
	writeMarketAnalysisSafe,
	writeMarketReportSafe,
} from "./job-store.js";
import {
	MINIMUM_MARKET_POSTINGS,
	prepareMarketAnalysis,
	renderMarketReport,
} from "./render-market-report.js";

const PROMPT_URL = new URL(
	"../../prompts/market/analyze-market-system.md",
	import.meta.url,
);

type ModelFailure = Exclude<
	StructuredCallResult<MarketAnalysis>,
	{ readonly kind: "success" }
>;
type StorageOperation =
	| "load-cache"
	| "load-prompt"
	| "write-analysis"
	| "write-report";
type StorageFailure = {
	readonly operation: StorageOperation;
	readonly message: string;
};
type StorageResult<T> =
	| { readonly ok: true; readonly value: T }
	| { readonly ok: false; readonly failure: StorageFailure };

export interface MarketAnalysisClient {
	call(
		request: StructuredCallRequest<MarketAnalysis>,
	): Promise<StructuredCallResult<MarketAnalysis>>;
}

export type AnalyzeMarketDependencies = {
	readonly client: MarketAnalysisClient;
	readonly analysisPath: string;
	readonly reportPath: string;
	readonly now: () => Date;
};

type SuccessfulResult = {
	readonly analysis: MarketAnalysis;
	readonly failedInputCount: number;
};

export type AnalyzeMarketResult =
	| (SuccessfulResult & {
			readonly status: "complete" | "partial-success";
			readonly usage: UsageSummary;
	  })
	| (SuccessfulResult & {
			readonly status: "cache-hit";
			readonly completeness: "complete" | "partial-success";
	  })
	| (SuccessfulResult & {
			readonly status: "insufficient-data";
			readonly cacheReused: boolean;
			readonly currentValidCount: number;
			readonly minimumRequired: 8;
			readonly usage: UsageSummary | null;
	  })
	| {
			readonly status: "model-failure";
			readonly failure: ModelFailure;
	  }
	| {
			readonly status: "storage-failure";
			readonly failure: StorageFailure;
	  };

const useStorage = async <T>(
	operation: StorageOperation,
	action: () => Promise<T>,
): Promise<StorageResult<T>> => {
	try {
		return { ok: true, value: await action() };
	} catch (error: unknown) {
		if (error instanceof Error) {
			return { ok: false, failure: { operation, message: error.message } };
		}
		throw error;
	}
};

const sortRecords = (records: readonly JobRecord[]): readonly JobRecord[] =>
	[...records].sort((left, right) => left.slug.localeCompare(right.slug, "en"));

const resultForAnalysis = (
	analysis: MarketAnalysis,
	cacheReused: boolean,
	usage: UsageSummary | null,
): AnalyzeMarketResult => {
	const shared = { analysis, failedInputCount: analysis.failedInputCount };
	if (analysis.analyzedPostingCount < MINIMUM_MARKET_POSTINGS) {
		return {
			...shared,
			status: "insufficient-data",
			cacheReused,
			currentValidCount: analysis.analyzedPostingCount,
			minimumRequired: MINIMUM_MARKET_POSTINGS,
			usage,
		};
	}
	if (cacheReused) {
		return {
			...shared,
			status: "cache-hit",
			completeness:
				analysis.failedInputCount > 0 ? "partial-success" : "complete",
		};
	}
	if (usage === null) {
		throw new TypeError("Generated market analysis requires usage metadata.");
	}
	return analysis.failedInputCount > 0
		? { ...shared, status: "partial-success", usage }
		: { ...shared, status: "complete", usage };
};

export const analyzeMarket = async (
	records: readonly JobRecord[],
	failedInputs: readonly string[],
	dependencies: AnalyzeMarketDependencies,
): Promise<AnalyzeMarketResult> => {
	const orderedRecords = sortRecords(records);
	const fingerprint = aggregateFingerprint(
		orderedRecords.map(({ slug, source }) => ({
			slug,
			fingerprint: source.fingerprint,
		})),
	);
	const cachedResult = await useStorage("load-cache", () =>
		loadCachedMarketAnalysis(fingerprint, dependencies.analysisPath),
	);
	if (!cachedResult.ok) {
		return { status: "storage-failure", failure: cachedResult.failure };
	}
	const cached: CacheResult<MarketAnalysis> = cachedResult.value;
	if (
		cached.kind === "hit" &&
		cached.value.failedInputCount === failedInputs.length &&
		cached.value.unavailableResearchCount ===
			orderedRecords.filter(
				(record) => record.research.status === "unavailable",
			).length
	) {
		const reportWrite = await useStorage("write-report", () =>
			writeMarketReportSafe(
				dependencies.reportPath,
				renderMarketReport(cached.value),
			),
		);
		if (!reportWrite.ok) {
			return { status: "storage-failure", failure: reportWrite.failure };
		}
		return resultForAnalysis(cached.value, true, null);
	}

	const promptResult = await useStorage("load-prompt", () =>
		readFile(PROMPT_URL, "utf8"),
	);
	if (!promptResult.ok) {
		return { status: "storage-failure", failure: promptResult.failure };
	}
	const modelResult = await dependencies.client.call({
		messages: [
			{ role: "system", content: promptResult.value },
			{
				role: "user",
				content: JSON.stringify({
					failedInputCount: failedInputs.length,
					records: orderedRecords,
				}),
			},
		],
		schema: marketAnalysisSchema,
		schemaName: "market_analysis",
	});
	if (modelResult.kind !== "success") {
		return { status: "model-failure", failure: modelResult };
	}
	const analysis = prepareMarketAnalysis(modelResult.data, {
		records: orderedRecords,
		failedInputCount: failedInputs.length,
		fingerprint,
		generatedAt: dependencies.now().toISOString(),
	});
	const analysisWrite = await useStorage("write-analysis", () =>
		writeMarketAnalysisSafe(dependencies.analysisPath, analysis),
	);
	if (!analysisWrite.ok) {
		return { status: "storage-failure", failure: analysisWrite.failure };
	}
	const reportWrite = await useStorage("write-report", () =>
		writeMarketReportSafe(
			dependencies.reportPath,
			renderMarketReport(analysis),
		),
	);
	if (!reportWrite.ok) {
		return { status: "storage-failure", failure: reportWrite.failure };
	}
	return resultForAnalysis(analysis, false, modelResult.usage);
};
