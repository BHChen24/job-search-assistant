import { describe, expect, it } from "vitest";
import {
	calculatePostingAgeDays,
	resolvePostingAge,
} from "../../src/apps/market/posting-age.js";
import {
	companyResearchSchema,
	jobPostingSchema,
	jobRecordSchema,
} from "../../src/schemas/job-posting.js";
import { marketAnalysisSchema } from "../../src/schemas/market-analysis.js";

const completePosting = {
	title: "Senior Platform Engineer",
	company: "Example Systems",
	location: "Toronto, ON",
	remoteStatus: "hybrid",
	postingAgeDays: 9,
	postingDateEvidence: "Posted 2026-07-26",
	postingAgeLimitation: null,
	hardSkills: ["TypeScript", "AWS"],
	preferredSkills: ["Kubernetes"],
	experience: {
		seniority: "senior",
		minimumYears: 5,
		maximumYears: 8,
	},
	educationRequirements: ["Bachelor's degree or equivalent experience"],
	salary: {
		currency: "CAD",
		minimum: 130_000,
		maximum: 160_000,
		period: "year",
		rawText: "$130,000-$160,000 CAD annually",
	},
	responsibilities: ["Design reliable cloud services"],
};

const completeResearch = {
	status: "complete",
	companySize: "1,000-5,000 employees",
	industry: "Enterprise software",
	recentDevelopments: ["Opened a Toronto engineering office"],
	cultureSignals: ["Publishes engineering retrospectives"],
	applicantContext: ["Hybrid attendance is team-dependent"],
	evidenceUrls: ["https://example.com/company/news"],
	limitations: [],
};

const source = {
	fileName: "senior-platform-engineer.pdf",
	fingerprint: "a".repeat(64),
	capturedAt: "2026-08-01T10:00:00.000Z",
	extractedAt: "2026-08-04T12:00:00.000Z",
};

const trend = {
	label: "TypeScript",
	postingCount: 1,
	evidenceJobSlugs: ["senior-platform-engineer-example-systems"],
};

describe("market schemas and posting age", () => {
	it("Given complete posting, research, and market data, When parsed, Then exact structured values are accepted", () => {
		const record = jobRecordSchema.parse({
			schemaVersion: 1,
			slug: "senior-platform-engineer-example-systems",
			source,
			posting: completePosting,
			research: completeResearch,
		});
		const market = marketAnalysisSchema.parse({
			schemaVersion: 1,
			aggregateFingerprint: "b".repeat(64),
			generatedAt: "2026-08-04T12:30:00.000Z",
			analyzedPostingCount: 1,
			failedInputCount: 0,
			unavailableResearchCount: 0,
			requiredSkillTrends: [trend],
			preferredSkillTrends: [],
			experienceTrends: [],
			educationTrends: [],
			salaryTrends: [],
			responsibilityPatterns: [],
			notableTrends: [],
			industryAndCultureExpectations: [],
			roleClusters: [
				{
					name: "platform engineering",
					postingCount: 1,
					jobSlugs: ["senior-platform-engineer-example-systems"],
					requiredSkillTrends: [trend],
					preferredSkillTrends: [],
					experienceTrends: [],
					educationTrends: [],
					salaryTrends: [],
					responsibilityPatterns: [],
					notableTrends: [],
					industryAndCultureExpectations: [],
					limitations: [],
				},
			],
			limitations: [],
		});

		expect(record.posting.salary?.maximum).toBe(160_000);
		expect(record.research.evidenceUrls).toEqual([
			"https://example.com/company/news",
		]);
		expect(market.roleClusters[0]?.requiredSkillTrends[0]?.label).toBe(
			"TypeScript",
		);
	});

	it("Given explicit nulls and empty repeated fields, When minimal model output is parsed, Then missing values remain explicit", () => {
		const posting = jobPostingSchema.parse({
			title: null,
			company: null,
			location: null,
			remoteStatus: null,
			postingAgeDays: null,
			postingDateEvidence: null,
			postingAgeLimitation: "No posting date was present.",
			hardSkills: [],
			preferredSkills: [],
			experience: null,
			educationRequirements: [],
			salary: null,
			responsibilities: [],
		});
		const research = companyResearchSchema.parse({
			status: "unavailable",
			companySize: null,
			industry: null,
			recentDevelopments: [],
			cultureSignals: [],
			applicantContext: [],
			evidenceUrls: [],
			limitations: ["Research service unavailable."],
		});

		expect(posting.postingAgeDays).toBeNull();
		expect(posting.hardSkills).toEqual([]);
		expect(research.status).toBe("unavailable");
	});

	it("Given omitted salary and posting-age keys, When parsed, Then the required-field contract rejects the record", () => {
		const {
			postingAgeDays: _age,
			salary: _salary,
			...omitted
		} = completePosting;

		const result = jobPostingSchema.safeParse(omitted);

		expect(result.success).toBe(false);
	});

	it("Given wrong salary and posting-age types, When parsed, Then both malformed records are rejected", () => {
		const results = [
			jobPostingSchema.safeParse({ ...completePosting, postingAgeDays: "9" }),
			jobPostingSchema.safeParse({ ...completePosting, salary: "$130k" }),
		];

		expect(results.map((result) => result.success)).toEqual([false, false]);
	});

	it("Given UTC instants on different clock times, When absolute age is calculated, Then only calendar days determine the result", () => {
		const age = calculatePostingAgeDays(
			new Date("2026-07-31T23:59:59.999Z"),
			new Date("2026-08-04T00:00:00.001Z"),
		);

		expect(age).toBe(4);
	});

	it("Given relative, missing, unsupported, and future evidence, When ages resolve, Then capture precedence, fallback limitation, and null rules are exact", () => {
		const extractionDate = new Date("2026-08-04T12:00:00.000Z");
		const results = [
			resolvePostingAge(
				{ kind: "relative", ageDays: 3, text: "Posted 3 days ago" },
				new Date("2026-08-01T20:00:00.000Z"),
				extractionDate,
			),
			resolvePostingAge(
				{ kind: "relative", ageDays: 3, text: "Posted 3 days ago" },
				null,
				extractionDate,
			),
			resolvePostingAge({ kind: "missing" }, null, extractionDate),
			resolvePostingAge(
				{ kind: "unsupported", text: "Posted recently" },
				null,
				extractionDate,
			),
			resolvePostingAge(
				{
					kind: "absolute",
					date: new Date("2026-08-05T00:00:00.000Z"),
					text: "Posted 2026-08-05",
				},
				null,
				extractionDate,
			),
		];

		expect(results).toEqual([
			{
				postingAgeDays: 6,
				evidence:
					"Posted 3 days ago (capture date: 2026-08-01, 3 day(s) before extraction)",
				limitation: null,
			},
			{
				postingAgeDays: 3,
				evidence: "Posted 3 days ago (reference date: 2026-08-04)",
				limitation:
					"PDF capture date unavailable; extraction date used as an approximation.",
			},
			{
				postingAgeDays: null,
				evidence: null,
				limitation: "No posting date evidence was present.",
			},
			{
				postingAgeDays: null,
				evidence: "Posted recently",
				limitation: "Posting date evidence could not be resolved.",
			},
			{
				postingAgeDays: null,
				evidence: "Posted 2026-08-05",
				limitation: "Posting date is later than the extraction date.",
			},
		]);
	});
});
