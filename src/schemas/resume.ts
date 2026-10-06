import { z } from "zod";

const textSchema = z.string().trim().min(1);

const workExperienceSchema = z
	.object({
		role: textSchema.nullable().describe("Job title held, or null."),
		company: textSchema.nullable().describe("Employer name, or null."),
		duration: textSchema
			.nullable()
			.describe("Duration or date range exactly as stated, or null."),
		highlights: z
			.array(textSchema)
			.describe(
				"Key responsibilities and achievements stated for this role. Empty when none are listed.",
			),
	})
	.strict()
	.readonly();

const projectSchema = z
	.object({
		name: textSchema.nullable().describe("Project name, or null."),
		summary: textSchema
			.nullable()
			.describe("What the project did, in one sentence, or null."),
		highlights: z
			.array(textSchema)
			.describe(
				"Quantifiable achievements or notable details. Empty when none are listed.",
			),
	})
	.strict()
	.readonly();

export const resumeSchema = z
	.object({
		hardSkills: z
			.array(textSchema)
			.describe(
				"Programming languages, frameworks, tools, and platforms stated in the resume.",
			),
		softSkills: z
			.array(textSchema)
			.describe(
				"Communication, leadership, collaboration, and problem-solving skills stated in the resume.",
			),
		workExperience: z
			.array(workExperienceSchema)
			.describe("Roles held, most recent first. Empty when none are listed."),
		education: z
			.array(textSchema)
			.describe(
				"Degrees, institutions, and relevant coursework. Empty when none are listed.",
			),
		certifications: z
			.array(textSchema)
			.describe(
				"Professional certifications and completed training. Empty when none are listed.",
			),
		projects: z
			.array(projectSchema)
			.describe("Notable projects and portfolio items. Empty when none exist."),
		keywords: z
			.array(textSchema)
			.describe(
				"Industry terminology and methodologies such as Agile, CI/CD, microservices, or REST API design.",
			),
		limitations: z
			.array(textSchema)
			.describe(
				"Concise notes about anything unreadable, ambiguous, or missing from the resume.",
			),
	})
	.strict()
	.readonly()
	.describe("Structured extraction of one resume, grounded only in its text.");

export type Resume = z.infer<typeof resumeSchema>;

export const resumeRecordSchema = z
	.object({
		schemaVersion: z.literal(1),
		source: z
			.object({
				fileName: textSchema,
				fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
				extractedAt: z.iso.datetime(),
			})
			.strict()
			.readonly(),
		resume: resumeSchema,
	})
	.strict()
	.readonly();

export type ResumeRecord = z.infer<typeof resumeRecordSchema>;
