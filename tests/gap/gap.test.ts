import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
	type AnalyzeGapDependencies,
	analyzeGap,
} from "../../src/apps/gap/analyze-gap.js";
import { discoverResumeInput } from "../../src/apps/gap/gap-store.js";
import { renderGapReport } from "../../src/apps/gap/render-gap-report.js";
import {
	type GapAnalysis,
	gapAnalysisSchema,
} from "../../src/schemas/gap-analysis.js";
import { type Resume, resumeSchema } from "../../src/schemas/resume.js";
import { unusedAgent } from "../market/pi-fixtures.js";

const NOW = new Date("2026-08-07T12:00:00.000Z");

const EMPTY_RESUME: Resume = resumeSchema.parse({
	hardSkills: [],
	softSkills: [],
	workExperience: [],
	education: [],
	certifications: [],
	projects: [],
	keywords: [],
	limitations: ["Resume text was mostly unreadable."],
});

const analysisWith = (overrides: Partial<GapAnalysis>): GapAnalysis =>
	gapAnalysisSchema.parse({
		schemaVersion: 1,
		generatedAt: NOW.toISOString(),
		analyzedPostingCount: 12,
		strengths: [],
		gaps: [],
		uniqueValue: [],
		limitations: [],
		...overrides,
	});

const inTemp = async (
	name: string,
	run: (root: string) => Promise<void>,
): Promise<void> => {
	const root = await mkdtemp(join(tmpdir(), name));
	try {
		await run(root);
	} finally {
		await rm(root, { force: true, recursive: true });
	}
};

describe("resume schema", () => {
	it("Given a resume with every section absent, When parsed, Then empty arrays are accepted and nulls survive", () => {
		expect(EMPTY_RESUME.hardSkills).toEqual([]);
		expect(EMPTY_RESUME.limitations).toHaveLength(1);

		const withNulls = resumeSchema.parse({
			...EMPTY_RESUME,
			workExperience: [
				{ role: "Developer", company: null, duration: null, highlights: [] },
			],
			projects: [{ name: null, summary: null, highlights: [] }],
		});

		expect(withNulls.workExperience[0]?.company).toBeNull();
		expect(withNulls.projects[0]?.name).toBeNull();
	});

	it("Given unknown keys or blank strings, When parsed, Then the resume schema rejects them", () => {
		expect(
			resumeSchema.safeParse({ ...EMPTY_RESUME, unexpected: true }).success,
		).toBe(false);
		expect(
			resumeSchema.safeParse({ ...EMPTY_RESUME, hardSkills: ["  "] }).success,
		).toBe(false);
	});
});

describe("gap analysis schema", () => {
	it("Given an unknown triage level, When parsed, Then it is rejected", () => {
		const gap = {
			skill: "Kubernetes",
			level: "someday",
			marketDemand: "5 of 12 postings",
			why: "Not present in the resume.",
			action: "Complete the CKA course, roughly 40 hours.",
			evidenceUrls: [],
		};

		expect(gapAnalysisSchema.safeParse(analysisWith({})).success).toBe(true);
		expect(
			gapAnalysisSchema.safeParse({
				...analysisWith({}),
				gaps: [gap],
			}).success,
		).toBe(false);
	});
});

describe("gap report rendering", () => {
	it("Given an analysis with no findings, When rendered, Then every section states none identified", () => {
		const report = renderGapReport(analysisWith({}));

		expect(report).toContain("# Resume Gap Analysis");
		expect(report).toContain("Compared against:** 12 analyzed job posting(s)");
		expect(report).toContain("- No supported strengths identified.");
		for (const heading of [
			"Quick wins",
			"Short term",
			"Medium term",
			"Long term",
		]) {
			expect(report).toContain(heading);
		}
		expect(report.match(/- None identified\./g)?.length).toBeGreaterThanOrEqual(
			4,
		);
	});

	it("Given gaps at different levels, When rendered, Then each appears under its own heading with its action", () => {
		const report = renderGapReport(
			analysisWith({
				gaps: [
					{
						skill: "Kubernetes",
						level: "medium-term",
						marketDemand: "5 of 12 postings",
						why: "Not present in the resume.",
						action: "Complete the CKA course, roughly 40 hours.",
						evidenceUrls: ["https://example.com/cka"],
					},
					{
						skill: "CI/CD wording",
						level: "quick-win",
						marketDemand: "5 of 12 postings",
						why: "Resume says 'build pipelines' instead of CI/CD.",
						action: "Rename the bullet to use the phrase CI/CD.",
						evidenceUrls: [],
					},
				],
			}),
		);

		const quickWinIndex = report.indexOf("Quick wins");
		const mediumIndex = report.indexOf("Medium term");
		expect(report.indexOf("CI/CD wording")).toBeGreaterThan(quickWinIndex);
		expect(report.indexOf("CI/CD wording")).toBeLessThan(mediumIndex);
		expect(report.indexOf("Kubernetes")).toBeGreaterThan(mediumIndex);
		expect(report).toContain("Complete the CKA course");
	});
});

describe("gap analysis preconditions", () => {
	it("Given no market analysis on disk, When the gap analysis runs, Then it fails with an actionable message and writes nothing", async () => {
		await inTemp("gap-missing-market-", async (root) => {
			const agent = unusedAgent();
			let wrote = false;
			const dependencies: AnalyzeGapDependencies = {
				loadMarketAnalysis: async () => ({ kind: "missing" }),
				writeGapAnalysisSafe: async () => {
					wrote = true;
				},
				writeGapReportSafe: async () => {
					wrote = true;
				},
				marketAnalysisPath: join(root, "market-analysis.json"),
				analysisPath: join(root, "gap-analysis.json"),
				reportPath: join(root, "gap-analysis.md"),
				model: agent.model,
				streamFn: agent.streamFn,
				searchTool: { search: async () => ({ kind: "unused" }) as never },
				now: () => NOW,
				logger: { debug: () => undefined },
			};

			const result = await analyzeGap(EMPTY_RESUME, dependencies);

			expect(result).toMatchObject({
				kind: "failure",
				code: "market-analysis-missing",
			});
			expect(result.kind === "failure" ? result.message : "").toContain(
				"Run the market phase first",
			);
			expect(wrote).toBe(false);
		});
	});

	it("Given a directory with no resume PDF, When discovering, Then it reports missing rather than throwing", async () => {
		await inTemp("gap-no-resume-", async (root) => {
			await writeFile(join(root, "notes.txt"), "not a resume");

			expect(await discoverResumeInput(join(root, "absent"))).toEqual({
				kind: "missing",
			});
			expect(await discoverResumeInput(root)).toEqual({ kind: "missing" });
		});
	});

	it("Given two resume PDFs, When discovering, Then it reports ambiguity instead of guessing", async () => {
		await inTemp("gap-two-resumes-", async (root) => {
			await writeFile(join(root, "a.pdf"), "one");
			await writeFile(join(root, "b.pdf"), "two");

			expect(await discoverResumeInput(root)).toEqual({
				kind: "ambiguous",
				fileNames: ["a.pdf", "b.pdf"],
			});
		});
	});
});
