import { z } from "zod";

const requiredTextSchema = z.string().trim().min(1);
const repeatedTextSchema = z.array(requiredTextSchema).readonly();

export const marketTrendSchema = z
	.object({
		label: requiredTextSchema.describe(
			"Concise evidence-grounded skill, requirement, pattern, range, or observation.",
		),
		postingCount: z
			.number()
			.int()
			.nonnegative()
			.describe("Number of analyzed postings supporting this trend."),
		evidenceJobSlugs: repeatedTextSchema.describe(
			"Job-record slugs that support this trend; empty when evidence is unavailable.",
		),
	})
	.strict()
	.readonly()
	.describe("One quantified, posting-grounded market trend.");

const trendListSchema = z.array(marketTrendSchema).readonly();

export const roleClusterSchema = z
	.object({
		name: requiredTextSchema.describe(
			"Concise name of the clustered role family.",
		),
		postingCount: z
			.number()
			.int()
			.nonnegative()
			.describe("Number of analyzed postings assigned to this role cluster."),
		jobSlugs: repeatedTextSchema.describe(
			"All job-record slugs assigned to this cluster.",
		),
		requiredSkillTrends: trendListSchema.describe(
			"Common required hard-skill and technology trends in this cluster.",
		),
		preferredSkillTrends: trendListSchema.describe(
			"Common preferred or nice-to-have skill trends in this cluster.",
		),
		experienceTrends: trendListSchema.describe(
			"Typical seniority and years-of-experience patterns in this cluster.",
		),
		educationTrends: trendListSchema.describe(
			"Typical education requirements in this cluster.",
		),
		salaryTrends: trendListSchema.describe(
			"Salary availability and observed range patterns in this cluster.",
		),
		responsibilityPatterns: trendListSchema.describe(
			"Common responsibility and role patterns in this cluster.",
		),
		notableTrends: trendListSchema.describe(
			"Other notable evidence-grounded observations in this cluster.",
		),
		industryAndCultureExpectations: trendListSchema.describe(
			"Industry and company-culture expectations supported by posting research.",
		),
		limitations: repeatedTextSchema.describe(
			"Cluster-specific missing data, sparse evidence, and analysis limitations.",
		),
	})
	.strict()
	.readonly()
	.describe("Market trends for a coherent cluster of related job roles.");

export const marketAnalysisSchema = z
	.object({
		schemaVersion: z
			.literal(1)
			.describe("Persisted market-analysis schema version."),
		aggregateFingerprint: z
			.string()
			.regex(/^[a-f0-9]{64}$/)
			.describe(
				"SHA-256 fingerprint of the exact sorted job-record aggregate.",
			),
		generatedAt: z.iso
			.datetime()
			.describe("UTC timestamp when this analysis was generated."),
		analyzedPostingCount: z
			.number()
			.int()
			.nonnegative()
			.describe(
				"Number of current validated job records included in analysis.",
			),
		failedInputCount: z
			.number()
			.int()
			.nonnegative()
			.describe(
				"Number of current posting inputs excluded because processing failed.",
			),
		unavailableResearchCount: z
			.number()
			.int()
			.nonnegative()
			.describe(
				"Number of analyzed postings whose company research was unavailable.",
			),
		requiredSkillTrends: trendListSchema.describe(
			"Most common required hard skills and technologies across postings.",
		),
		preferredSkillTrends: trendListSchema.describe(
			"Most common preferred or nice-to-have skills across postings.",
		),
		experienceTrends: trendListSchema.describe(
			"Typical seniority and years-of-experience requirements across postings.",
		),
		educationTrends: trendListSchema.describe(
			"Typical education requirements across postings.",
		),
		salaryTrends: trendListSchema.describe(
			"Salary availability and observed range patterns across postings.",
		),
		responsibilityPatterns: trendListSchema.describe(
			"Common responsibilities and role patterns across postings.",
		),
		notableTrends: trendListSchema.describe(
			"Other notable evidence-grounded market observations.",
		),
		industryAndCultureExpectations: trendListSchema.describe(
			"Industry and company-culture expectations supported by company research.",
		),
		roleClusters: z
			.array(roleClusterSchema)
			.readonly()
			.describe(
				"Separate analyses for coherent role families in the posting set.",
			),
		limitations: repeatedTextSchema.describe(
			"Aggregate missing data, research gaps, sparse clusters, and analysis limitations.",
		),
	})
	.strict()
	.readonly()
	.describe(
		"Strict clustered market analysis derived from validated job records.",
	);

export type MarketAnalysis = z.infer<typeof marketAnalysisSchema>;
