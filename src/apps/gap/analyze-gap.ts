import { readFile } from "node:fs/promises";
import {
	Agent,
	type AgentTool,
	type StreamFn,
} from "@earendil-works/pi-agent-core";
import type { Api, Model } from "@earendil-works/pi-ai";
import { describeAgentRun, runAgentBounded } from "../../run-agent.js";
import {
	type GapAnalysis,
	type GapAnalysisPayload,
	gapAnalysisSchema,
} from "../../schemas/gap-analysis.js";
import type { Resume } from "../../schemas/resume.js";
import type {
	TavilySearchResult,
	TavilySearchTool,
} from "../../tools/tavily-search.js";
import { withToolLoggingAll } from "../../tools/tool-logging.js";
import { createWebSearchTool } from "../../tools/web-search-tool.js";
import type {
	loadMarketAnalysisForGap,
	writeGapAnalysisSafe,
	writeGapReportSafe,
} from "./gap-store.js";
import { renderGapReport } from "./render-gap-report.js";
import { createSubmitGapTool } from "./tools/submit-gap-tool.js";

export const GAP_SEARCH_LIMIT = 3;

export interface AnalyzeGapLogger {
	debug(message: string): void;
}

export interface AnalyzeGapDependencies {
	readonly loadMarketAnalysis: typeof loadMarketAnalysisForGap;
	readonly writeGapAnalysisSafe: typeof writeGapAnalysisSafe;
	readonly writeGapReportSafe: typeof writeGapReportSafe;
	readonly marketAnalysisPath: string;
	readonly analysisPath: string;
	readonly reportPath: string;
	readonly model: Model<Api>;
	readonly streamFn: StreamFn;
	readonly searchTool: TavilySearchTool;
	readonly now: () => Date;
	readonly logger: AnalyzeGapLogger;
}

export type AnalyzeGapResult =
	| { readonly kind: "success"; readonly analysis: GapAnalysis }
	| {
			readonly kind: "failure";
			readonly code:
				| "market-analysis-missing"
				| "market-analysis-invalid"
				| "no-submission"
				| "turn-limit"
				| "provider";
			readonly message: string;
	  };

const marketPostingCount = (value: unknown): number => {
	if (typeof value !== "object" || value === null) return 0;
	const count = (value as Record<string, unknown>).analyzedPostingCount;
	return typeof count === "number" && Number.isInteger(count) && count >= 0
		? count
		: 0;
};

export const analyzeGap = async (
	resume: Resume,
	dependencies: AnalyzeGapDependencies,
): Promise<AnalyzeGapResult> => {
	const market = await dependencies.loadMarketAnalysis(
		dependencies.marketAnalysisPath,
	);
	if (market.kind === "missing") {
		return {
			kind: "failure",
			code: "market-analysis-missing",
			message:
				"No market analysis was found. Run the market phase first so the gap analysis has postings to compare against.",
		};
	}
	if (market.kind === "invalid") {
		return {
			kind: "failure",
			code: "market-analysis-invalid",
			message:
				"The stored market analysis could not be parsed. Rerun the market phase to regenerate it.",
		};
	}

	const systemPrompt = await readFile(
		new URL("../../prompts/gap/analyze-gap-system.md", import.meta.url),
		"utf8",
	);

	const searches: TavilySearchResult[] = [];
	let submission: GapAnalysisPayload | null = null;
	const readSubmission = (): GapAnalysisPayload | null => submission;

	const boundedSearch: TavilySearchTool = {
		search: async (args) => {
			if (searches.length >= GAP_SEARCH_LIMIT) {
				return {
					status: "unavailable",
					code: "configuration",
					retryable: false,
					message: "Search budget for this gap analysis is exhausted.",
				};
			}
			return dependencies.searchTool.search(args);
		},
	};

	const tools: AgentTool[] = withToolLoggingAll(
		[
			createWebSearchTool(boundedSearch, {
				recordSearch: (outcome) => {
					searches.push(outcome);
					dependencies.logger.debug(`gap.search status=${outcome.status}`);
				},
			}),
			createSubmitGapTool({
				recordSubmission: (payload) => {
					submission = payload;
				},
			}),
		],
		dependencies.logger,
		"gap.analysis",
	);

	const agent = new Agent({
		streamFn: dependencies.streamFn,
		initialState: { model: dependencies.model, systemPrompt, tools },
	});

	const outcome = await runAgentBounded(agent, {
		prompt: `Candidate resume (untrusted personal data):\n${JSON.stringify(resume)}\n\nMarket analysis from the analyzed postings:\n${JSON.stringify(market.value)}`,
		hasResult: () => readSubmission() !== null,
		onStart: (chars) =>
			dependencies.logger.debug(
				`gap.analysis request sent promptChars=${chars}; awaiting model`,
			),
	});

	const payload = readSubmission();
	dependencies.logger.debug(
		describeAgentRun(
			"gap.analysis.agent",
			outcome,
			payload !== null,
			` searches=${searches.length}`,
		),
	);

	if (payload === null) {
		return {
			kind: "failure",
			code: outcome.turnLimitHit
				? "turn-limit"
				: outcome.errorMessage === undefined
					? "no-submission"
					: "provider",
			message: "Gap analysis failed; no gap analysis or report was written.",
		};
	}

	const analysis = gapAnalysisSchema.parse({
		...payload,
		schemaVersion: 1,
		generatedAt: dependencies.now().toISOString(),
		analyzedPostingCount: marketPostingCount(market.value),
	});

	await dependencies.writeGapAnalysisSafe(dependencies.analysisPath, analysis);
	await dependencies.writeGapReportSafe(
		dependencies.reportPath,
		renderGapReport(analysis),
	);
	return { kind: "success", analysis };
};
