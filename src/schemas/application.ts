import { z } from "zod";

const textSchema = z.string().trim().min(1);

export const LEGITIMACY_VERDICTS = ["green", "yellow", "red"] as const;

const signalSchema = z
	.object({
		signal: textSchema.describe("The specific signal observed."),
		polarity: z
			.enum(["red-flag", "green-flag"])
			.describe("Whether this signal argues against or for legitimacy."),
		evidence: textSchema.describe(
			"What supports this, citing the posting text, a search result, or WHOIS data returned in this conversation.",
		),
	})
	.strict()
	.readonly();

export const legitimacyAssessmentSchema = z
	.object({
		verdict: z
			.enum(LEGITIMACY_VERDICTS)
			.describe(
				"green when the company and posting are verifiable, yellow when verification is incomplete, red when multiple fraud signals are present.",
			),
		confidence: z
			.enum(["low", "medium", "high"])
			.describe(
				"Confidence in the verdict given the evidence actually gathered.",
			),
		signals: z
			.array(signalSchema)
			.describe("Specific red and green flags found, each with its evidence."),
		recommendation: textSchema.describe(
			"Plain-language guidance for the applicant. When the verdict is red, state clearly that they should not submit personal information.",
		),
		limitations: z
			.array(textSchema)
			.describe(
				"What could not be verified. A failed lookup is a limitation, never proof of fraud.",
			),
	})
	.strict()
	.readonly()
	.describe("Structured legitimacy assessment of one posting and its company.");

const requirementMatchSchema = z
	.object({
		requirement: textSchema.describe("A requirement stated in the posting."),
		status: z
			.enum(["met", "partial", "gap"])
			.describe("Whether the candidate's resume meets this requirement."),
		evidence: textSchema.describe(
			"Resume evidence for this status, or a note that the resume does not show it.",
		),
	})
	.strict()
	.readonly();

const fitAssessmentSchema = z
	.object({
		score: z
			.number()
			.int()
			.min(0)
			.max(100)
			.describe("Overall fit as a percentage from 0 to 100."),
		band: z
			.enum(["strong", "good", "stretch", "growth-target"])
			.describe(
				"strong is 80 and above, good is 50 to 79, stretch is 30 to 49, growth-target is below 30.",
			),
		recommendation: textSchema.describe(
			"Encouraging, honest guidance. Job postings describe ideal candidates, not minimum requirements, so never tell a reasonable match not to apply.",
		),
		requirements: z
			.array(requirementMatchSchema)
			.describe("Per-requirement breakdown behind the score."),
	})
	.strict()
	.readonly();

const resumeAdaptationSchema = z
	.object({
		change: textSchema.describe(
			"One concrete edit, such as moving a section or reframing a project.",
		),
		reason: textSchema.describe("Why this helps for this specific posting."),
	})
	.strict()
	.readonly();

const interviewQuestionSchema = z
	.object({
		question: textSchema.describe("A question this posting makes likely."),
		whyLikely: textSchema.describe("What in the posting suggests it."),
		talkingPoints: z
			.array(textSchema)
			.describe("Points from the candidate's background to draw on."),
	})
	.strict()
	.readonly();

export const applicationAdvicePayloadSchema = z
	.object({
		fit: fitAssessmentSchema,
		resumeAdaptations: z
			.array(resumeAdaptationSchema)
			.describe("Specific tailoring suggestions. Never generic advice."),
		coverLetterPoints: z
			.array(textSchema)
			.describe(
				"Key points to hit, including company-specific angles drawn from research.",
			),
		interviewQuestions: z
			.array(interviewQuestionSchema)
			.describe("Likely interview questions with talking points."),
		skillsToBrushUp: z
			.array(textSchema)
			.describe("Technologies to review before an interview."),
		companyResearchTopics: z
			.array(textSchema)
			.describe("What to research about the company before interviewing."),
		limitations: z
			.array(textSchema)
			.describe("Anything the advice could not establish from evidence."),
	})
	.strict()
	.readonly()
	.describe(
		"Application advice for one posting, grounded in resume and market data.",
	);

export type LegitimacyAssessment = z.infer<typeof legitimacyAssessmentSchema>;
export type ApplicationAdvicePayload = z.infer<
	typeof applicationAdvicePayloadSchema
>;
export type LegitimacyVerdict = (typeof LEGITIMACY_VERDICTS)[number];

export const applicationReportSchema = z
	.object({
		schemaVersion: z.literal(1),
		generatedAt: z.iso.datetime(),
		source: z
			.object({
				fileName: textSchema,
				fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
			})
			.strict()
			.readonly(),
		posting: z.unknown(),
		legitimacy: legitimacyAssessmentSchema,
		advice: applicationAdvicePayloadSchema,
	})
	.strict()
	.readonly();

export type ApplicationReport = z.infer<typeof applicationReportSchema>;
