import type { PdfInput } from "../../src/apps/market/job-store.js";
import type { MarketRunDependencies } from "../../src/apps/market/run-market.js";
import {
	type JobRecord,
	jobRecordSchema,
} from "../../src/schemas/job-posting.js";
import {
	type MarketAnalysis,
	marketAnalysisSchema,
} from "../../src/schemas/market-analysis.js";
import { unusedAgent } from "./pi-fixtures.js";

export const NOW = new Date("2026-08-04T12:00:00.000Z");
export const USAGE = {
	calls: 1,
	completionTokens: 20,
	cost: 0.002,
	model: "test/model",
	promptTokens: 40,
	retries: 0,
	totalTokens: 60,
} as const;

export const createRecord = (input: PdfInput): JobRecord =>
	jobRecordSchema.parse({
		schemaVersion: 1,
		slug: input.slug,
		source: {
			fileName: input.fileName,
			fingerprint: input.fingerprint,
			capturedAt: null,
			extractedAt: NOW.toISOString(),
		},
		posting: {
			title: "Engineer",
			company: "Example",
			location: "Ontario",
			remoteStatus: "hybrid",
			postingAgeDays: 1,
			postingDateEvidence: "Posted one day ago",
			postingAgeLimitation: null,
			hardSkills: ["TypeScript"],
			preferredSkills: [],
			experience: null,
			educationRequirements: [],
			salary: null,
			responsibilities: ["Build services"],
		},
		research: {
			status: "complete",
			companySize: null,
			industry: "Software",
			recentDevelopments: [],
			cultureSignals: [],
			applicantContext: [],
			evidenceUrls: [],
			limitations: [],
		},
	});

export const createAnalysis = (count: number, failed: number): MarketAnalysis =>
	marketAnalysisSchema.parse({
		schemaVersion: 1,
		aggregateFingerprint: "f".repeat(64),
		generatedAt: NOW.toISOString(),
		analyzedPostingCount: count,
		failedInputCount: failed,
		unavailableResearchCount: 0,
		requiredSkillTrends: [],
		preferredSkillTrends: [],
		experienceTrends: [],
		educationTrends: [],
		salaryTrends: [],
		responsibilityPatterns: [],
		notableTrends: [],
		industryAndCultureExpectations: [],
		roleClusters: [],
		limitations: [],
	});

export const input = (index: number, slug = `role-${index}`): PdfInput => ({
	path: `/private/role-${index}.pdf`,
	fileName: `role-${index}.pdf`,
	slug,
	fingerprint: index.toString(16).padStart(64, "0"),
});

const unusedPostingAgent = unusedAgent();

export const dependencies = (
	extract: MarketRunDependencies["extractPosting"],
	analyze: MarketRunDependencies["analyzeMarket"],
): MarketRunDependencies => ({
	extractPosting: extract,
	analyzeMarket: analyze,
	jobsDataDir: "/outputs/jobs",
	posting: {
		extractPdf: async () => {
			throw new TypeError("Unexpected PDF extraction");
		},
		loadCachedJob: async () => ({ kind: "miss", reason: "missing" }),
		model: unusedPostingAgent.model,
		streamFn: unusedPostingAgent.streamFn,
		logger: { debug: () => undefined },
		now: () => NOW,
		searchTool: {
			search: async () => ({
				status: "success",
				results: [
					{
						title: "Evidence",
						url: "https://example.com",
						content: "Evidence",
						score: 1,
					},
				],
				usage: { credits: 1 },
			}),
		},
		writeJobRecordSafe: async () => undefined,
	},
	aggregate: {
		client: {
			call: async () => ({
				kind: "schema",
				reason: "malformed_response",
				usage: USAGE,
			}),
		},
		analysisPath: "/outputs/data/analysis/market-analysis.json",
		reportPath: "/outputs/reports/market-analysis.md",
		now: () => NOW,
	},
	logger: { debug: () => undefined },
});
