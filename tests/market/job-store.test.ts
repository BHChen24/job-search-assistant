import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
	discoverPdfInputs,
	loadCachedJob,
	loadCachedMarketAnalysis,
	loadCurrentJobRecords,
	type PdfInput,
	writeJobRecordSafe,
	writeMarketAnalysisSafe,
	writeMarketReportSafe,
} from "../../src/apps/market/job-store.js";
import {
	type JobRecord,
	jobRecordSchema,
} from "../../src/schemas/job-posting.js";
import { marketAnalysisSchema } from "../../src/schemas/market-analysis.js";
import {
	aggregateFingerprint,
	fingerprintPdf,
	resolveOutputSlug,
	slugifyPostingStem,
} from "../../src/tools/source-id.js";

const createJobRecord = (input: PdfInput): JobRecord =>
	jobRecordSchema.parse({
		schemaVersion: 1,
		slug: input.slug,
		source: {
			fileName: input.fileName,
			fingerprint: input.fingerprint,
			capturedAt: null,
			extractedAt: "2026-08-04T12:00:00.000Z",
		},
		posting: {
			title: "Example Engineer",
			company: "Example Company",
			location: null,
			remoteStatus: null,
			postingAgeDays: null,
			postingDateEvidence: null,
			postingAgeLimitation: "No date evidence.",
			hardSkills: [],
			preferredSkills: [],
			experience: null,
			educationRequirements: [],
			salary: null,
			responsibilities: [],
		},
		research: {
			status: "unavailable",
			companySize: null,
			industry: null,
			recentDevelopments: [],
			cultureSignals: [],
			applicantContext: [],
			evidenceUrls: [],
			limitations: ["Research was not run in this fixture."],
		},
	});

describe("market source identity", () => {
	it.each([
		["  DévOps___Engineer (Cloud)!!!  ", "devops-engineer-cloud"],
		["A".repeat(90), "a".repeat(80)],
		["全栈开发工程师", "job-posting"],
		["___!!!", "job-posting"],
		["", "job-posting"],
	])(
		"Given the stem %j, When slugified, Then it normalizes to ASCII, caps length, or falls back",
		(stem, expected) => {
			expect(slugifyPostingStem(stem)).toBe(expected);
		},
	);

	it("Given an occupied normalized slug, When output identity is resolved, Then it appends eight lowercase fingerprint characters", () => {
		const slug = resolveOutputSlug(
			"Software Engineer",
			"ABCD0123FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF",
			new Set(["software-engineer"]),
		);

		expect(slug).toBe("software-engineer-abcd0123");
	});

	it("Given three equivalent stems over identical bytes, When discovered, Then every output identity stays unique", async () => {
		const root = await mkdtemp(join(tmpdir(), "job-store-collision-"));
		try {
			const inputDir = join(root, "inputs");
			await mkdir(inputDir, { recursive: true });
			for (const name of ["Role A.pdf", "Role-A.pdf", "Role_A.pdf"]) {
				await writeFile(join(inputDir, name), "identical bytes");
			}

			const slugs = (await discoverPdfInputs(inputDir)).map(
				(discovered) => discovered.slug,
			);

			expect(new Set(slugs).size).toBe(3);
			expect(slugs.every((slug) => slug.startsWith("role-a"))).toBe(true);
		} finally {
			await rm(root, { force: true, recursive: true });
		}
	});

	it("Given stable and changed bytes plus reversed records, When fingerprinted, Then exact hashes are deterministic and order-independent", () => {
		const stableBytes = new TextEncoder().encode("same pdf bytes");
		const changedBytes = new TextEncoder().encode("changed pdf bytes");
		const records = [
			{
				slug: "zeta-role",
				fingerprint:
					"ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
			},
			{
				slug: "alpha-role",
				fingerprint:
					"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
			},
		];

		expect(fingerprintPdf(stableBytes)).toBe(
			"7625d8eae3dc53619e17755bdec8f8dfab37382c888797442f7fcc5fe0e7ee38",
		);
		expect(fingerprintPdf(new Uint8Array(stableBytes))).toBe(
			"7625d8eae3dc53619e17755bdec8f8dfab37382c888797442f7fcc5fe0e7ee38",
		);
		expect(fingerprintPdf(changedBytes)).toBe(
			"bfa4644c133e7a09263c27f8cdd0915fcb2d3c3115ee1cf2a4e4462cfb199946",
		);
		expect(aggregateFingerprint(records)).toBe(
			"c2442b3327fb79f08d67008e0aa79559eafa45f25b4f0a7c764e97690639ce4d",
		);
		expect(aggregateFingerprint([...records].reverse())).toBe(
			"c2442b3327fb79f08d67008e0aa79559eafa45f25b4f0a7c764e97690639ce4d",
		);
	});

	it("Given mixed files and a valid current record, When discovered and round-tripped, Then PDFs are sorted and the cache is a hit", async () => {
		const root = await mkdtemp(join(tmpdir(), "job-store-discovery-"));
		try {
			const inputDir = join(root, "inputs");
			const dataDir = join(root, "jobs");
			await mkdir(join(inputDir, "directory.pdf"), { recursive: true });
			await writeFile(join(inputDir, "zeta.PDF"), "zeta bytes");
			await writeFile(join(inputDir, "Alpha.pdf"), "alpha bytes");
			await writeFile(join(inputDir, "notes.txt"), "ignored");

			const inputs = await discoverPdfInputs(inputDir);
			const first = inputs[0];
			if (first === undefined) {
				throw new TypeError("Expected one discovered PDF input.");
			}
			const cachePath = join(dataDir, `${first.slug}.json`);
			await writeJobRecordSafe(cachePath, createJobRecord(first));
			const cache = await loadCachedJob(cachePath, first);

			expect(inputs.map((input) => input.fileName)).toEqual([
				"Alpha.pdf",
				"zeta.PDF",
			]);
			expect(cache).toEqual({ kind: "hit", value: createJobRecord(first) });
			expect(JSON.parse(await readFile(cachePath, "utf8"))).toEqual(
				createJobRecord(first),
			);
		} finally {
			await rm(root, { force: true, recursive: true });
		}
	});

	it("Given corrupt, stale, changed, and orphan caches, When loaded, Then misses are typed and only current identities remain", async () => {
		const root = await mkdtemp(join(tmpdir(), "job-store-stale-"));
		try {
			const dataDir = join(root, "jobs");
			await mkdir(dataDir, { recursive: true });
			const input = {
				path: join(root, "current.pdf"),
				fileName: "current.pdf",
				slug: "current",
				fingerprint: "a".repeat(64),
			};
			const cachePath = join(dataDir, "current.json");
			await writeJobRecordSafe(cachePath, createJobRecord(input));
			await writeJobRecordSafe(
				join(dataDir, "orphan.json"),
				createJobRecord({
					...input,
					fileName: "orphan.pdf",
					slug: "orphan",
				}),
			);
			const corruptPath = join(dataDir, "corrupt.json");
			const invalidPath = join(dataDir, "invalid.json");
			await writeFile(corruptPath, "{");
			await writeFile(invalidPath, JSON.stringify({ schemaVersion: 2 }));

			const results = await Promise.all([
				loadCachedJob(corruptPath, input),
				loadCachedJob(invalidPath, input),
				loadCachedJob(cachePath, {
					...input,
					fingerprint: "b".repeat(64),
				}),
				loadCachedJob(cachePath, { ...input, fileName: "renamed.pdf" }),
			]);
			const current = await loadCurrentJobRecords([input], dataDir);

			expect(results).toEqual([
				{ kind: "miss", reason: "invalid_json" },
				{ kind: "miss", reason: "invalid_schema" },
				{ kind: "miss", reason: "fingerprint_mismatch" },
				{ kind: "miss", reason: "source_filename_mismatch" },
			]);
			expect(current.map((record) => record.slug)).toEqual(["current"]);
		} finally {
			await rm(root, { force: true, recursive: true });
		}
	});

	it("Given valid aggregate output and an invalid replacement, When caches and atomic writers run, Then exact paths persist and prior valid data survives", async () => {
		const root = await mkdtemp(join(tmpdir(), "job-store-atomic-"));
		try {
			const fingerprint = "c".repeat(64);
			const analysisPath = join(root, "analysis", "market-analysis.json");
			const reportPath = join(root, "reports", "market-analysis.md");
			const analysis = marketAnalysisSchema.parse({
				schemaVersion: 1,
				aggregateFingerprint: fingerprint,
				generatedAt: "2026-08-04T12:30:00.000Z",
				analyzedPostingCount: 0,
				failedInputCount: 0,
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
			await writeMarketAnalysisSafe(analysisPath, analysis);
			await writeMarketReportSafe(reportPath, "# Market analysis\n");
			const hit = await loadCachedMarketAnalysis(fingerprint, analysisPath);
			const miss = await loadCachedMarketAnalysis("d".repeat(64), analysisPath);
			const prior = await readFile(analysisPath, "utf8");

			await expect(
				writeMarketAnalysisSafe(analysisPath, {
					...analysis,
					schemaVersion: 2,
				}),
			).rejects.toBeDefined();

			expect(hit).toEqual({ kind: "hit", value: analysis });
			expect(miss).toEqual({
				kind: "miss",
				reason: "aggregate_fingerprint_mismatch",
			});
			expect(await readFile(analysisPath, "utf8")).toBe(prior);
			expect(await readFile(reportPath, "utf8")).toBe("# Market analysis\n");
		} finally {
			await rm(root, { force: true, recursive: true });
		}
	});
});
