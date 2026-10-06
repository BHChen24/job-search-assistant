import { z } from "zod";

const textSchema = z.string().trim().min(1);

export const GAP_LEVELS = [
	"quick-win",
	"short-term",
	"medium-term",
	"long-term",
] as const;

const strengthSchema = z
	.object({
		skill: textSchema.describe("Skill or qualification the candidate has."),
		marketDemand: textSchema.describe(
			"How this shows up across the analyzed postings, citing counts where known.",
		),
		resumeEvidence: textSchema.describe(
			"Where this appears in the resume, quoted or paraphrased briefly.",
		),
	})
	.strict()
	.readonly();

const gapSchema = z
	.object({
		skill: textSchema.describe("Skill or qualification the market wants."),
		level: z
			.enum(GAP_LEVELS)
			.describe(
				"Effort to close: quick-win is wording only, short-term is days to weeks, medium-term is weeks to months, long-term needs years or structural change.",
			),
		marketDemand: textSchema.describe(
			"How often and how strongly the postings ask for this.",
		),
		why: textSchema.describe(
			"Why this is a gap given what the resume does and does not show.",
		),
		action: textSchema.describe(
			"One specific, concrete next step. Name the course, certification, or project and its rough time cost. Never generic advice such as 'learn AWS'.",
		),
		evidenceUrls: z
			.array(z.url())
			.describe(
				"URLs from web_search that support the recommended action. Empty when no search evidence was retrieved.",
			),
	})
	.strict()
	.readonly();

const uniqueValueSchema = z
	.object({
		strength: textSchema.describe(
			"Something the candidate brings that the postings rarely ask for.",
		),
		whyItDifferentiates: textSchema.describe(
			"How this could set the candidate apart for these roles.",
		),
	})
	.strict()
	.readonly();

const gapAnalysisPayloadBase = z
	.object({
		strengths: z
			.array(strengthSchema)
			.describe("Qualifications the candidate has that the market asks for."),
		gaps: z
			.array(gapSchema)
			.describe("Market demands missing or underrepresented in the resume."),
		uniqueValue: z
			.array(uniqueValueSchema)
			.describe("Differentiators not commonly listed in the postings."),
		limitations: z
			.array(textSchema)
			.describe(
				"Concise notes about weak evidence, failed searches, or anything the analysis could not establish.",
			),
	})
	.strict();

export const gapAnalysisPayloadSchema = gapAnalysisPayloadBase
	.readonly()
	.describe("Model-facing gap analysis payload.");

export const gapAnalysisSchema = gapAnalysisPayloadBase
	.extend({
		schemaVersion: z.literal(1),
		generatedAt: z.iso.datetime(),
		analyzedPostingCount: z
			.number()
			.int()
			.nonnegative()
			.describe("Postings the market analysis was built from."),
	})
	.strict()
	.readonly()
	.describe(
		"Comparison of one resume against the aggregated job market analysis.",
	);

export type GapAnalysis = z.infer<typeof gapAnalysisSchema>;
export type GapAnalysisPayload = z.infer<typeof gapAnalysisPayloadSchema>;
export type GapLevel = (typeof GAP_LEVELS)[number];
