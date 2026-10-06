import { join } from "node:path";
import { z } from "zod";

import type {
	AnalyzeMarketDependencies,
	AnalyzeMarketResult,
	analyzeMarket,
} from "./analyze-market.js";
import type {
	ExtractPostingDependencies,
	extractPosting,
} from "./extract-posting.js";
import type { PdfInput } from "./job-store.js";
import { aggregateFailureMessage } from "./market-run-errors.js";
import {
	type MarketRunSummary,
	MarketRunUsageAccumulator,
} from "./market-run-usage.js";

export type { MarketRunSummary } from "./market-run-usage.js";

export interface MarketRunLogger {
	debug(message: string): void;
}

export interface MarketRunDependencies {
	readonly extractPosting: typeof extractPosting;
	readonly analyzeMarket: typeof analyzeMarket;
	readonly jobsDataDir: string;
	readonly posting: ExtractPostingDependencies;
	readonly aggregate: AnalyzeMarketDependencies;
	readonly logger: MarketRunLogger;
}

export type MarketRunResult =
	| {
			readonly kind: "success";
			readonly completeness: "complete" | "partial";
			readonly aggregateReused: boolean;
			readonly summary: MarketRunSummary;
	  }
	| {
			readonly kind: "failure";
			readonly code: "aggregate-failure" | "insufficient-data";
			readonly message: string;
			readonly summary: MarketRunSummary | null;
	  };

const assertNever = (value: never): never => {
	throw new TypeError(`Unexpected market result: ${String(value)}`);
};

const describeUnexpectedError = (error: Error): string => {
	if (error instanceof z.ZodError) {
		const issues = error.issues
			.map((issue) => `${issue.path.join(".") || "(root)"}=${issue.code}`)
			.join(",");
		return `ZodError issues=[${issues}]`;
	}
	return `${error.name}: ${error.message}`;
};

export const runMarket = async (
	discovered: readonly PdfInput[],
	dependencies: MarketRunDependencies,
): Promise<MarketRunResult> => {
	const usage = new MarketRunUsageAccumulator();
	const postingDependencies: ExtractPostingDependencies = {
		...dependencies.posting,
		searchTool: {
			search: async (args) => {
				const result = await dependencies.posting.searchTool.search(args);
				usage.addTavily(result);
				return result;
			},
		},
	};
	const aggregateDependencies: AnalyzeMarketDependencies = {
		...dependencies.aggregate,
		client: {
			call: async (request) => {
				const result = await dependencies.aggregate.client.call(request);
				usage.addModel(result.usage);
				return result;
			},
		},
	};
	const records = [];
	const failedInputs: string[] = [];
	let processed = 0;
	let skipped = 0;

	for (const input of discovered) {
		dependencies.logger.debug(`market.posting.start file=${input.fileName}`);
		try {
			const result = await dependencies.extractPosting(
				{
					input,
					outputPath: join(dependencies.jobsDataDir, `${input.slug}.json`),
				},
				postingDependencies,
			);
			switch (result.kind) {
				case "cached":
					skipped += 1;
					records.push(result.record);
					dependencies.logger.debug(
						`market.posting.cached file=${input.fileName}`,
					);
					break;
				case "persisted":
					processed += 1;
					records.push(result.record);
					usage.addModel(result.usage);
					dependencies.logger.debug(
						`market.posting.processed file=${input.fileName}`,
					);
					break;
				case "failure":
					failedInputs.push(input.fileName);
					if (result.stage === "posting") {
						usage.addModel(result.usage);
					}
					dependencies.logger.debug(
						`market.posting.failed file=${input.fileName} stage=${result.stage} code=${result.code}`,
					);
					break;
				default:
					assertNever(result);
			}
		} catch (error: unknown) {
			if (!(error instanceof Error)) {
				throw error;
			}
			failedInputs.push(input.fileName);
			dependencies.logger.debug(
				`market.posting.failed file=${input.fileName} code=unexpected ${describeUnexpectedError(error)}`,
			);
		}
	}

	let aggregate: AnalyzeMarketResult;
	try {
		aggregate = await dependencies.analyzeMarket(
			records,
			failedInputs,
			aggregateDependencies,
		);
	} catch (error: unknown) {
		if (!(error instanceof Error)) {
			throw error;
		}
		return {
			kind: "failure",
			code: "aggregate-failure",
			message:
				"Aggregate market analysis failed unexpectedly; check diagnostics and retry.",
			summary: null,
		};
	}
	const measured = usage.summary();
	const summary: MarketRunSummary = {
		discovered: discovered.length,
		processed,
		skipped,
		failed: failedInputs.length,
		currentValid: records.length,
		model: measured.model,
		tavily: measured.tavily,
		outputPaths: {
			jobs: dependencies.jobsDataDir,
			analysis: dependencies.aggregate.analysisPath,
			report: dependencies.aggregate.reportPath,
		},
	};

	switch (aggregate.status) {
		case "cache-hit":
			return {
				kind: "success",
				completeness:
					aggregate.completeness === "complete" ? "complete" : "partial",
				aggregateReused: true,
				summary,
			};
		case "complete":
			return {
				kind: "success",
				completeness: "complete",
				aggregateReused: false,
				summary,
			};
		case "partial-success":
			return {
				kind: "success",
				completeness: "partial",
				aggregateReused: false,
				summary,
			};
		case "insufficient-data":
			return {
				kind: "failure",
				code: "insufficient-data",
				message: `Only ${aggregate.currentValidCount} current valid postings were available; at least ${aggregate.minimumRequired} are required. The incomplete report was written.`,
				summary,
			};
		case "model-failure":
		case "storage-failure":
			return {
				kind: "failure",
				code: "aggregate-failure",
				message: aggregateFailureMessage(aggregate),
				summary,
			};
		default:
			return assertNever(aggregate);
	}
};
