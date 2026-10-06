import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	analyzeMarket,
	type MarketAnalysisClient,
} from "../../src/apps/market/analyze-market.js";
import { renderMarketReport } from "../../src/apps/market/render-market-report.js";
import {
	type JobRecord,
	jobRecordSchema,
} from "../../src/schemas/job-posting.js";
import {
	type MarketAnalysis,
	marketAnalysisSchema,
} from "../../src/schemas/market-analysis.js";
import type {
	StructuredCallRequest,
	StructuredCallResult,
} from "../../src/tools/openrouter.js";
import { aggregateFingerprint } from "../../src/tools/source-id.js";

const usage = {
	calls: 1,
	completionTokens: 20,
	cost: 0.002,
	model: "test/model",
	promptTokens: 40,
	retries: 0,
	totalTokens: 60,
};
const NOW = new Date("2026-08-04T12:00:00.000Z");
type OutputPaths = { readonly analysis: string; readonly report: string };

const createRecord = (
	index: number,
	fingerprint = index.toString(16),
): JobRecord =>
	jobRecordSchema.parse({
		schemaVersion: 1,
		slug: `role-${index.toString().padStart(2, "0")}`,
		source: {
			fileName: `role-${index}.pdf`,
			fingerprint: fingerprint.padStart(64, "0"),
			capturedAt: null,
			extractedAt: "2026-08-04T10:00:00.000Z",
		},
		posting: {
			title: "Engineer",
			company: "Example",
			location: "Ontario",
			remoteStatus: "hybrid",
			postingAgeDays: 2,
			postingDateEvidence: "Posted two days ago",
			postingAgeLimitation: null,
			hardSkills: ["TypeScript"],
			preferredSkills: ["AWS"],
			experience: {
				seniority: "intermediate",
				minimumYears: 2,
				maximumYears: null,
			},
			educationRequirements: ["Degree or equivalent"],
			salary: null,
			responsibilities: ["Build services"],
		},
		research: {
			status: index === 1 ? "unavailable" : "complete",
			companySize: null,
			industry: "Software",
			recentDevelopments: [],
			cultureSignals: ["Collaborative"],
			applicantContext: [],
			evidenceUrls: [],
			limitations: index === 1 ? ["Research unavailable"] : [],
		},
	});

const trend = (label = "TypeScript") => ({
	label,
	postingCount: 2,
	evidenceJobSlugs: ["role-01", "role-02"],
});

const createModelAnalysis = (label = "TypeScript"): MarketAnalysis =>
	marketAnalysisSchema.parse({
		schemaVersion: 1,
		aggregateFingerprint: "a".repeat(64),
		generatedAt: "2026-01-01T00:00:00.000Z",
		analyzedPostingCount: 0,
		failedInputCount: 0,
		unavailableResearchCount: 0,
		requiredSkillTrends: [trend(label)],
		preferredSkillTrends: [trend("AWS")],
		experienceTrends: [trend("Two years")],
		educationTrends: [trend("Degree or equivalent")],
		salaryTrends: [trend("Salary unavailable in most postings")],
		responsibilityPatterns: [trend("Build services")],
		notableTrends: [trend("Hybrid work")],
		industryAndCultureExpectations: [trend("Collaborative software teams")],
		roleClusters: [],
		limitations: [],
	});

class FakeMarketClient implements MarketAnalysisClient {
	public calls = 0;

	public constructor(private readonly analyses: readonly MarketAnalysis[]) {}

	public async call(
		_request: StructuredCallRequest<MarketAnalysis>,
	): Promise<StructuredCallResult<MarketAnalysis>> {
		const analysis = this.analyses[this.calls];
		this.calls += 1;
		if (analysis === undefined) {
			throw new RangeError("Unexpected aggregate model call");
		}
		return { kind: "success", data: analysis, usage };
	}
}

const runInTemp = async <T>(
	callback: (paths: OutputPaths) => Promise<T>,
): Promise<T> => {
	const root = await mkdtemp(join(tmpdir(), "market-analysis-"));
	try {
		return await callback({
			analysis: join(root, "data/analysis/market-analysis.json"),
			report: join(root, "reports/market-analysis.md"),
		});
	} finally {
		await rm(root, { force: true, recursive: true });
	}
};

const createRecords = (count: number): readonly JobRecord[] =>
	Array.from({ length: count }, (_, index) => createRecord(index + 1));

const dependencies = (paths: OutputPaths, client: MarketAnalysisClient) => ({
	client,
	analysisPath: paths.analysis,
	reportPath: paths.report,
	now: () => NOW,
});

const recordFingerprint = (records: readonly JobRecord[]): string =>
	aggregateFingerprint(
		records.map(({ slug, source }) => ({
			slug,
			fingerprint: source.fingerprint,
		})),
	);

describe("market aggregate analysis and report", () => {
	it("Given validated records and structural model output, When analyzed, Then every report section and selected cluster is rendered safely", async () => {
		await runInTemp(async (paths) => {
			const client = new FakeMarketClient([
				createModelAnalysis("# Forged\n## Limitations"),
			]);
			const result = await analyzeMarket(
				createRecords(8),
				[],
				dependencies(paths, client),
			);
			const persisted = marketAnalysisSchema.parse(
				JSON.parse(await readFile(paths.analysis, "utf8")),
			);
			const report = await readFile(paths.report, "utf8");

			expect(result.status).toBe("complete");
			expect(persisted.roleClusters.map(({ name }) => name)).toEqual([
				"software",
				"data/quantitative",
				"DevOps",
				"cybersecurity",
			]);
			expect(report).toContain("## Salary Availability and Ranges");
			expect(report).toContain("## Industry and Company Culture Expectations");
			expect(report).not.toContain("\n# Forged");
			expect(renderMarketReport(persisted)).toBe(report);
		});
	});

	it("Given a valid matching aggregate cache, When records arrive reversed, Then the fingerprint is stable and no model call occurs", async () => {
		await runInTemp(async (paths) => {
			const records = createRecords(8);
			const client = new FakeMarketClient([createModelAnalysis()]);
			const deps = dependencies(paths, client);
			await analyzeMarket(records, [], deps);
			const result = await analyzeMarket([...records].reverse(), [], deps);
			if (result.status !== "cache-hit") {
				throw new TypeError("Expected matching aggregate cache hit");
			}

			expect(result.completeness).toBe("complete");
			expect(result.analysis.aggregateFingerprint).toBe(
				recordFingerprint(records),
			);
			expect(client.calls).toBe(1);
		});
	});

	it("Given a changed source fingerprint, When analyzed again, Then regeneration replaces both exact output paths", async () => {
		await runInTemp(async (paths) => {
			const records = createRecords(8);
			const client = new FakeMarketClient([
				createModelAnalysis(),
				createModelAnalysis("Regenerated"),
			]);
			const deps = dependencies(paths, client);
			await analyzeMarket(records, [], deps);
			const changed = [createRecord(1, "f"), ...records.slice(1)];
			const result = await analyzeMarket(changed, [], deps);
			const json = marketAnalysisSchema.parse(
				JSON.parse(await readFile(paths.analysis, "utf8")),
			);
			const report = await readFile(paths.report, "utf8");

			expect(result.status).toBe("complete");
			expect(json.aggregateFingerprint).not.toBe(recordFingerprint(records));
			expect(report).toContain("Regenerated");
			expect(client.calls).toBe(2);
		});
	});

	it("Given failures at and below the eight-record threshold, When outputs are generated, Then partial success and insufficient data are explicit", async () => {
		await runInTemp(async (paths) => {
			const partialClient = new FakeMarketClient([createModelAnalysis()]);
			const partial = await analyzeMarket(
				createRecords(8),
				["failed.pdf"],
				dependencies(paths, partialClient),
			);
			const insufficientPath = {
				analysis: join(paths.analysis, "../seven.json"),
				report: join(paths.report, "../seven.md"),
			};
			const insufficientClient = new FakeMarketClient([createModelAnalysis()]);
			const insufficient = await analyzeMarket(
				createRecords(7),
				["missing.pdf"],
				dependencies(insufficientPath, insufficientClient),
			);
			const report = await readFile(insufficientPath.report, "utf8");

			expect(partial).toMatchObject({
				status: "partial-success",
				failedInputCount: 1,
			});
			expect(insufficient).toMatchObject({
				status: "insufficient-data",
				currentValidCount: 7,
				minimumRequired: 8,
			});
			expect(report).toContain(
				"**Status:** Incomplete — 7 of 8 required current postings were analyzed.",
			);
			expect(report).toContain("Insufficient current validated postings");
		});
	});
});
