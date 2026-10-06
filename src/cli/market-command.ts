import { tavily } from "@tavily/core";
import type { Command } from "commander";
import { analyzeMarket } from "../apps/market/analyze-market.js";
import { extractPosting } from "../apps/market/extract-posting.js";
import {
	discoverPdfInputs,
	loadCachedJob,
	type PdfInput,
	writeJobRecordSafe,
} from "../apps/market/job-store.js";
import {
	type MarketRunDependencies,
	type MarketRunResult,
	runMarket,
} from "../apps/market/run-market.js";
import { ConfigurationError, type MarketConfig } from "../config.js";
import {
	JOBS_DATA_DIR,
	MARKET_ANALYSIS_JSON_PATH,
	MARKET_REPORT_PATH,
} from "../paths.js";
import { createOpenRouterStructuredClient } from "../tools/openrouter.js";
import {
	createPdfParseFactory,
	extractPdfDocument,
} from "../tools/pdf-extractor.js";
import { createPiOpenRouterClient } from "../tools/pi-openrouter.js";
import { createTavilySearchTool } from "../tools/tavily-search.js";

export type MarketCommandOptions = {
	readonly market?: boolean;
	readonly inputDir: string;
};

export type MarketCommandOutput = {
	readonly writeOut: (text: string) => void;
	readonly writeErr: (text: string) => void;
};

export type MarketDependenciesFactory = () =>
	| MarketRunDependencies
	| Promise<MarketRunDependencies>;

export const registerMarketCommand = (program: Command): void => {
	program
		.option("--market", "Run the job market analysis")
		.addHelpText(
			"after",
			"\nMarket analysis:\n  Reads every job-posting PDF in input/postings/ and writes output/cache/postings/*.json,\n  output/market/analysis.json, and output/market/report.md. Reruns validate and\n  skip unchanged posting caches; aggregate analysis refreshes only when current inputs or\n  failures change. --verbose sends diagnostics to stderr. OpenRouter/Tavily calls may incur\n  costs. Never pass secrets as flags.\n",
		);
};

const formatMetric = (value: number | null, digits = 0): string =>
	value === null ? "unavailable" : value.toFixed(digits);

const formatSummary = (
	result: Extract<MarketRunResult, { readonly kind: "success" }>,
): string => {
	const { summary } = result;
	return [
		"Market analysis:",
		`discovered=${summary.discovered}`,
		`processed=${summary.processed}`,
		`skipped=${summary.skipped}`,
		`failed=${summary.failed}`,
		`current-valid=${summary.currentValid}`,
		`model-calls=${summary.model.calls}`,
		`tokens=${summary.model.totalTokens}`,
		`tavily-calls=${summary.tavily.calls}`,
		`tavily-credits=${formatMetric(summary.tavily.credits)}`,
		`provider-cost=${summary.model.cost === null ? "unavailable" : `$${formatMetric(summary.model.cost, 6)}`}`,
		`jobs=${summary.outputPaths.jobs}`,
		`analysis=${summary.outputPaths.analysis}`,
		`report=${summary.outputPaths.report}`,
	].join(" ");
};

export const executeMarketCommand = async (
	options: MarketCommandOptions,
	dependenciesFactory: MarketDependenciesFactory,
	output: MarketCommandOutput,
): Promise<0 | 1 | null> => {
	if (options.market !== true) {
		return null;
	}

	let inputs: readonly PdfInput[];
	try {
		inputs = await discoverPdfInputs(options.inputDir);
	} catch (error: unknown) {
		if (!(error instanceof Error)) {
			throw error;
		}
		output.writeErr(
			`Market analysis failed: input directory is not readable: ${options.inputDir}\n`,
		);
		return 1;
	}
	if (inputs.length === 0) {
		output.writeErr(
			`Market analysis failed: input directory contains no PDF files: ${options.inputDir}\n`,
		);
		return 1;
	}

	let dependencies: MarketRunDependencies;
	try {
		dependencies = await dependenciesFactory();
	} catch (error: unknown) {
		if (error instanceof ConfigurationError) {
			output.writeErr(`${error.message}\n`);
			return 1;
		}
		if (error instanceof Error) {
			output.writeErr(
				"Market analysis failed: dependencies could not be initialized.\n",
			);
			return 1;
		}
		throw error;
	}
	const result = await runMarket(inputs, dependencies);
	if (result.kind === "failure") {
		output.writeErr(`Market analysis failed: ${result.message}\n`);
		return 1;
	}

	output.writeOut(`${formatSummary(result)}\n`);
	if (result.summary.failed > 0) {
		output.writeErr(
			`Warning: ${result.summary.failed} posting input(s) failed; the report contains ${result.summary.currentValid} current valid posting(s).\n`,
		);
	}
	return 0;
};

export const createProductionMarketDependencies = (
	config: MarketConfig,
	logger: MarketRunDependencies["logger"],
): MarketRunDependencies => {
	const model = createOpenRouterStructuredClient(config, logger);
	const agentClient = createPiOpenRouterClient(config);
	const searchTool = createTavilySearchTool(
		tavily({ apiKey: config.tavilyApiKey }),
		logger,
	);
	const pdfFactory = createPdfParseFactory();
	return {
		extractPosting,
		analyzeMarket,
		jobsDataDir: JOBS_DATA_DIR,
		posting: {
			extractPdf: (path) =>
				extractPdfDocument(path, pdfFactory, { maxCharacters: 100_000 }),
			loadCachedJob,
			model: agentClient.model,
			streamFn: agentClient.streamFn,
			now: () => new Date(),
			searchTool,
			writeJobRecordSafe,
			logger,
		},
		aggregate: {
			client: model,
			analysisPath: MARKET_ANALYSIS_JSON_PATH,
			reportPath: MARKET_REPORT_PATH,
			now: () => new Date(),
		},
		logger,
	};
};
