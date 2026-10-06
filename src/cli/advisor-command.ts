import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { tavily } from "@tavily/core";
import type { Command } from "commander";
import { renderApplicationReport } from "../apps/advisor/render-application-report.js";
import {
	type AdvisorDependencies,
	runAdvisor,
} from "../apps/advisor/run-advisor.js";
import { type AdvisorConfig, ConfigurationError } from "../config.js";
import { writeFileSafe, writeJsonSafe } from "../file-store.js";
import {
	APPLICATION_REPORT_PATH,
	applicationHtmlPath,
	applicationJsonPath,
	MARKET_ANALYSIS_JSON_PATH,
	RESUME_JSON_PATH,
	runStamp,
} from "../paths.js";
import { resumeRecordSchema } from "../schemas/resume.js";
import {
	createPdfParseFactory,
	extractPdfDocument,
} from "../tools/pdf-extractor.js";
import { createPiOpenRouterClient } from "../tools/pi-openrouter.js";
import { slugifyPostingStem } from "../tools/source-id.js";
import { createTavilySearchTool } from "../tools/tavily-search.js";
import { createWhoisTool } from "../tools/whois.js";

export type AdvisorCommandOptions = {
	readonly advisor?: boolean;
	readonly postingPath?: string | undefined;
};

export interface AdvisorCommandOutput {
	readonly writeOut: (text: string) => void;
	readonly writeErr: (text: string) => void;
}

export type AdvisorDependenciesFactory = () =>
	| AdvisorDependencies
	| Promise<AdvisorDependencies>;

export const registerAdvisorCommand = (program: Command): void => {
	program.option(
		"--advisor <posting.pdf>",
		"Run the application advisor on a new job posting PDF",
	);
};

const readJsonFile = async (path: string): Promise<unknown | null> => {
	try {
		return JSON.parse(await readFile(path, "utf8"));
	} catch {
		return null;
	}
};

export const createProductionAdvisorDependencies = (
	config: AdvisorConfig,
	logger: { debug: (message: string) => void },
): AdvisorDependencies => {
	const client = createPiOpenRouterClient(config);
	const pdfFactory = createPdfParseFactory();
	return {
		extractPdf: (path) =>
			extractPdfDocument(path, pdfFactory, { maxCharacters: 100_000 }),
		loadResume: async () => {
			const parsed = resumeRecordSchema.safeParse(
				await readJsonFile(RESUME_JSON_PATH),
			);
			return parsed.success ? parsed.data.resume : null;
		},
		loadMarketAnalysis: () => readJsonFile(MARKET_ANALYSIS_JSON_PATH),
		writeReport: writeFileSafe,
		writeReportJson: writeJsonSafe,
		reportPath: APPLICATION_REPORT_PATH,
		model: client.model,
		streamFn: client.streamFn,
		searchTool: createTavilySearchTool(
			tavily({ apiKey: config.tavilyApiKey }),
			logger,
		),
		whois: createWhoisTool(config.whoisApiKey, logger),
		now: () => new Date(),
		logger,
	};
};

export const executeAdvisorCommand = async (
	options: AdvisorCommandOptions,
	factory: AdvisorDependenciesFactory,
	output: AdvisorCommandOutput,
): Promise<0 | 1 | null> => {
	if (options.advisor !== true || options.postingPath === undefined) {
		return null;
	}

	let dependencies: AdvisorDependencies;
	try {
		dependencies = await factory();
	} catch (error: unknown) {
		if (error instanceof ConfigurationError) {
			output.writeErr(`${error.message}\n`);
			return 1;
		}
		throw error;
	}

	const postingPath = resolve(options.postingPath);
	const result = await runAdvisor(
		postingPath,
		basename(postingPath),
		dependencies,
	);
	if (result.kind === "failure") {
		output.writeErr(`Application advisor failed: ${result.message}\n`);
		return 1;
	}

	const slug = slugifyPostingStem(basename(postingPath, ".pdf"));
	const stamp = runStamp(new Date(result.report.generatedAt));
	const jsonPath = applicationJsonPath(slug, stamp);
	const archivePath = applicationHtmlPath(slug, stamp);
	const html = renderApplicationReport(result.report);
	await dependencies.writeReport(dependencies.reportPath, html);
	await dependencies.writeReport(archivePath, html);
	await dependencies.writeReportJson(jsonPath, result.report);
	const { legitimacy, advice } = result.report;
	output.writeOut(
		`Application report: legitimacy=${legitimacy.verdict} (${legitimacy.confidence} confidence, ${legitimacy.signals.length} signal(s)) fit=${advice.fit.score}% (${advice.fit.band}) requirements=${advice.fit.requirements.length} adaptations=${advice.resumeAdaptations.length} questions=${advice.interviewQuestions.length} report=${dependencies.reportPath} archive=${archivePath} json=${jsonPath}\n`,
	);
	return 0;
};
