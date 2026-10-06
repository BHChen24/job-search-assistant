import { z } from "zod";

const requiredTextSchema = z.string().trim().min(1);
const repeatedTextSchema = z.array(requiredTextSchema).readonly();

const experienceSchema = z
	.object({
		seniority: requiredTextSchema
			.nullable()
			.describe(
				"Seniority label stated or clearly supported by the posting, or null.",
			),
		minimumYears: z
			.number()
			.nonnegative()
			.nullable()
			.describe("Minimum years of experience explicitly required, or null."),
		maximumYears: z
			.number()
			.nonnegative()
			.nullable()
			.describe("Maximum years of experience explicitly stated, or null."),
	})
	.strict()
	.readonly()
	.describe(
		"Experience level, seniority, and year requirements from the posting.",
	);

const salarySchema = z
	.object({
		currency: requiredTextSchema
			.nullable()
			.describe("Currency code or name shown with the salary, or null."),
		minimum: z
			.number()
			.nonnegative()
			.nullable()
			.describe("Minimum numeric compensation in the stated period, or null."),
		maximum: z
			.number()
			.nonnegative()
			.nullable()
			.describe("Maximum numeric compensation in the stated period, or null."),
		period: requiredTextSchema
			.nullable()
			.describe("Compensation period such as hour, month, or year, or null."),
		rawText: requiredTextSchema
			.nullable()
			.describe("Exact concise salary range text from the posting, or null."),
	})
	.strict()
	.readonly()
	.describe(
		"Salary range exactly as supported by the posting, or null when absent.",
	);

export const jobPostingSchema = z
	.object({
		title: requiredTextSchema
			.nullable()
			.describe("Job title stated in the posting, or null when absent."),
		company: requiredTextSchema
			.nullable()
			.describe(
				"Hiring company name stated in the posting, or null when absent.",
			),
		location: requiredTextSchema
			.nullable()
			.describe("Work location stated in the posting, or null when absent."),
		remoteStatus: z
			.enum(["remote", "hybrid", "onsite"])
			.nullable()
			.describe(
				"Supported work arrangement, or null when it cannot be determined.",
			),
		postingAgeDays: z
			.number()
			.int()
			.nonnegative()
			.nullable()
			.describe(
				"Posting age in complete UTC calendar days, or null when unresolved.",
			),
		postingDateEvidence: requiredTextSchema
			.nullable()
			.describe(
				"Posting date text and reference-date evidence used for age, or null.",
			),
		postingAgeLimitation: requiredTextSchema
			.nullable()
			.describe(
				"Age-calculation uncertainty or approximation, or null when none.",
			),
		hardSkills: repeatedTextSchema.describe(
			"Required skills and technologies explicitly requested by the posting.",
		),
		preferredSkills: repeatedTextSchema.describe(
			"Preferred or nice-to-have skills explicitly requested by the posting.",
		),
		experience: experienceSchema
			.nullable()
			.describe(
				"Structured experience requirement, or null when no experience is stated.",
			),
		educationRequirements: repeatedTextSchema.describe(
			"Education requirements explicitly stated by the posting.",
		),
		salary: salarySchema
			.nullable()
			.describe(
				"Structured listed salary range, or null when salary is absent.",
			),
		responsibilities: repeatedTextSchema.describe(
			"Key responsibilities explicitly stated by the posting.",
		),
	})
	.strict()
	.readonly()
	.describe("Strict structured extraction of one job posting.");

export type JobPosting = z.infer<typeof jobPostingSchema>;

export const companyResearchSchema = z
	.object({
		status: z
			.enum(["complete", "partial", "unavailable"])
			.describe(
				"Research completion status; unavailable never implies company absence.",
			),
		companySize: requiredTextSchema
			.nullable()
			.describe("Evidence-supported company size information, or null."),
		industry: requiredTextSchema
			.nullable()
			.describe("Evidence-supported company industry, or null."),
		recentDevelopments: repeatedTextSchema.describe(
			"Recent company news or developments supported by retrieved sources.",
		),
		cultureSignals: repeatedTextSchema.describe(
			"Company culture signals supported by reviews, posts, or company materials.",
		),
		applicantContext: repeatedTextSchema.describe(
			"Other evidence-supported company or role context useful to an applicant.",
		),
		evidenceUrls: z
			.array(z.url())
			.readonly()
			.describe("Source URLs supporting the research findings."),
		limitations: repeatedTextSchema.describe(
			"Missing evidence, source limitations, and research failures affecting findings.",
		),
	})
	.strict()
	.readonly()
	.describe("Bounded company research retained with evidence and limitations.");

export type CompanyResearch = z.infer<typeof companyResearchSchema>;

const sourceMetadataSchema = z
	.object({
		fileName: requiredTextSchema.describe(
			"Original local PDF file name, without content.",
		),
		fingerprint: z
			.string()
			.regex(/^[a-f0-9]{64}$/)
			.describe("Lowercase SHA-256 fingerprint of the source PDF bytes."),
		capturedAt: z.iso
			.datetime()
			.nullable()
			.describe("PDF capture timestamp when available, otherwise null."),
		extractedAt: z.iso
			.datetime()
			.describe("UTC timestamp when extraction completed."),
	})
	.strict()
	.readonly();

export const jobRecordSchema = z
	.object({
		schemaVersion: z
			.literal(1)
			.describe("Persisted job-record schema version."),
		slug: requiredTextSchema.describe(
			"Deterministic output identifier for this posting.",
		),
		source: sourceMetadataSchema.describe(
			"Non-content source and extraction metadata.",
		),
		posting: jobPostingSchema,
		research: companyResearchSchema,
	})
	.strict()
	.readonly();

export type JobRecord = z.infer<typeof jobRecordSchema>;
