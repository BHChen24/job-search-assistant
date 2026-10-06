import { z } from "zod";

const DOMAIN_PATTERN =
	/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;

export const whoisArgsSchema = z
	.object({
		domain: z
			.string()
			.trim()
			.toLowerCase()
			.regex(DOMAIN_PATTERN)
			.describe(
				"Bare domain to look up, such as acmecorp.com. No scheme, path, or port.",
			),
	})
	.strict()
	.readonly();

export type WhoisArgs = z.infer<typeof whoisArgsSchema>;

const registrantSchema = z
	.object({
		organization: z.string().nullish(),
		country: z.string().nullish(),
		countryCode: z.string().nullish(),
	})
	.loose();

const whoisRecordSchema = z
	.object({
		createdDate: z.string().nullish(),
		createdDateNormalized: z.string().nullish(),
		expiresDate: z.string().nullish(),
		expiresDateNormalized: z.string().nullish(),
		registrarName: z.string().nullish(),
		registrant: registrantSchema.nullish(),
		registryData: z
			.object({
				createdDate: z.string().nullish(),
				createdDateNormalized: z.string().nullish(),
				expiresDate: z.string().nullish(),
				expiresDateNormalized: z.string().nullish(),
				registrarName: z.string().nullish(),
				registrant: registrantSchema.nullish(),
			})
			.loose()
			.nullish(),
		dataError: z.string().nullish(),
	})
	.loose();

export const whoisResponseSchema = z
	.object({
		WhoisRecord: whoisRecordSchema.nullish(),
		ErrorMessage: z
			.object({ msg: z.string().nullish(), errorCode: z.unknown().nullish() })
			.loose()
			.nullish(),
	})
	.loose();

export const whoisRegistrationSchema = z
	.object({
		domain: z.string().describe("Domain that was looked up."),
		createdDate: z
			.string()
			.nullable()
			.describe(
				"Registration date, or null when the registry did not supply one.",
			),
		expiresDate: z.string().nullable().describe("Expiry date, or null."),
		registrarName: z.string().nullable().describe("Registrar, or null."),
		registrantOrganization: z
			.string()
			.nullable()
			.describe("Registrant organization, or null when redacted or absent."),
		registrantCountry: z
			.string()
			.nullable()
			.describe("Registrant country, or null when redacted or absent."),
		redacted: z
			.boolean()
			.describe(
				"True when the registry returned privacy-redaction markers rather than real values.",
			),
	})
	.strict()
	.readonly();

export type WhoisRegistration = z.infer<typeof whoisRegistrationSchema>;
