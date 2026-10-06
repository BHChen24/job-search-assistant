import { tavily } from "@tavily/core";
import type { Command } from "commander";
import {
	type AnalyzeGapDependencies,
	analyzeGap,
} from "../apps/gap/analyze-gap.js";
import {
	type ExtractResumeDependencies,
	extractResume,
} from "../apps/gap/extract-resume.js";
import {
	discoverResumeInput,
	loadCachedResume,
	loadMarketAnalysisForGap,
	writeGapAnalysisSafe,
	writeGapReportSafe,
	writeResumeRecordSafe,
} from "../apps/gap/gap-store.js";
import { ConfigurationError, type MarketConfig } from "../config.js";
import {
	DEFAULT_RESUME_INPUT_DIR,
	GAP_ANALYSIS_JSON_PATH,
	GAP_REPORT_PATH,
	MARKET_ANALYSIS_JSON_PATH,
	RESUME_JSON_PATH,
} from "../paths.js";
import {
	createPdfParseFactory,
	extractPdfDocument,
} from "../tools/pdf-extractor.js";
import { createPiOpenRouterClient } from "../tools/pi-openrouter.js";
import { createTavilySearchTool } from "../tools/tavily-search.js";

export type GapCommandOptions = {
	readonly gap?: boolean;
	readonly inputDir?: string;
};

export interface GapCommandOutput {
	readonly writeOut: (text: string) => void;
	readonly writeErr: (text: string) => void;
}

export interface GapDependencies {
	readonly resume: ExtractResumeDependencies;
	readonly gap: AnalyzeGapDependencies;
	readonly resumeJsonPath: string;
	readonly resumeInputDir: string;
}

export type GapDependenciesFactory = () =>
	| GapDependencies
	| Promise<GapDependencies>;

export const registerGapCommand = (program: Command): void => {
	program.option("--gap", "Run the resume gap analysis");
};

export const createProductionGapDependencies = (
	config: MarketConfig,
	logger: { debug: (message: string) => void },
): GapDependencies => {
	const client = createPiOpenRouterClient(config);
	const pdfFactory = createPdfParseFactory();
	return {
		resumeInputDir: DEFAULT_RESUME_INPUT_DIR,
		resumeJsonPath: RESUME_JSON_PATH,
		resume: {
			extractPdf: (path) =>
				extractPdfDocument(path, pdfFactory, { maxCharacters: 60_000 }),
			loadCachedResume,
			writeResumeRecordSafe,
			model: client.model,
			streamFn: client.streamFn,
			now: () => new Date(),
			logger,
		},
		gap: {
			loadMarketAnalysis: loadMarketAnalysisForGap,
			writeGapAnalysisSafe,
			writeGapReportSafe,
			marketAnalysisPath: MARKET_ANALYSIS_JSON_PATH,
			analysisPath: GAP_ANALYSIS_JSON_PATH,
			reportPath: GAP_REPORT_PATH,
			model: client.model,
			streamFn: client.streamFn,
			searchTool: createTavilySearchTool(
				tavily({ apiKey: config.tavilyApiKey }),
				logger,
			),
			now: () => new Date(),
			logger,
		},
	};
};

export const executeGapCommand = async (
	options: GapCommandOptions,
	factory: GapDependenciesFactory,
	output: GapCommandOutput,
): Promise<0 | 1 | null> => {
	if (options.gap !== true) {
		return null;
	}

	let dependencies: GapDependencies;
	try {
		dependencies = await factory();
	} catch (error: unknown) {
		if (error instanceof ConfigurationError) {
			output.writeErr(`${error.message}\n`);
			return 1;
		}
		throw error;
	}

	const inputDir = options.inputDir ?? dependencies.resumeInputDir;
	const discovery = await discoverResumeInput(inputDir);
	if (discovery.kind === "missing") {
		output.writeErr(
			`No resume PDF was found in ${inputDir}. Add one resume PDF and rerun.\n`,
		);
		return 1;
	}
	if (discovery.kind === "ambiguous") {
		output.writeErr(
			`Expected exactly one resume PDF in ${inputDir}, found ${discovery.fileNames.length}. Keep only the resume to analyze.\n`,
		);
		return 1;
	}

	const extracted = await extractResume(
		discovery.input,
		dependencies.resumeJsonPath,
		dependencies.resume,
	);
	if (extracted.kind === "failure") {
		output.writeErr(`Resume extraction failed: ${extracted.message}\n`);
		return 1;
	}

	const analysis = await analyzeGap(extracted.record.resume, dependencies.gap);
	if (analysis.kind === "failure") {
		output.writeErr(`Gap analysis failed: ${analysis.message}\n`);
		return 1;
	}

	const gapCounts = new Map<string, number>();
	for (const gap of analysis.analysis.gaps) {
		gapCounts.set(gap.level, (gapCounts.get(gap.level) ?? 0) + 1);
	}
	const countOf = (level: string): number => gapCounts.get(level) ?? 0;
	output.writeOut(
		`Gap analysis: resume=${extracted.kind} postings=${analysis.analysis.analyzedPostingCount} strengths=${analysis.analysis.strengths.length} gaps=${analysis.analysis.gaps.length} (quick-win=${countOf("quick-win")} short=${countOf("short-term")} medium=${countOf("medium-term")} long=${countOf("long-term")}) unique-value=${analysis.analysis.uniqueValue.length} resume-json=${dependencies.resumeJsonPath} analysis=${dependencies.gap.analysisPath} report=${dependencies.gap.reportPath}\n`,
	);
	return 0;
};
