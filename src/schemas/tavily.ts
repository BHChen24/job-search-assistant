import { z } from "zod";

const DOMAIN_PATTERN =
	/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;

const nonblankTextSchema = z.string().trim().min(1);

export const tavilySearchArgsSchema = z
	.object({
		query: nonblankTextSchema
			.max(500)
			.describe("Focused web-search query for company or role research."),
		companyDomainHint: z
			.string()
			.trim()
			.toLowerCase()
			.regex(DOMAIN_PATTERN)
			.optional()
			.describe(
				"Optional bare company domain used to constrain results; no scheme, path, or port.",
			),
	})
	.strict()
	.readonly()
	.describe("Validated arguments for one bounded Tavily company search.");

export type TavilySearchArgs = z.infer<typeof tavilySearchArgsSchema>;

export const tavilySearchResultSchema = z
	.object({
		title: z.string(),
		url: z.url(),
		content: z.string(),
		score: z.number().finite(),
		rawContent: z.string().nullish(),
		publishedDate: z.string().nullish(),
		favicon: z.string().nullish(),
	})
	.readonly();

export type TavilySearchResult = z.infer<typeof tavilySearchResultSchema>;

const tavilyUsageSchema = z
	.object({
		credits: z.number().finite().nonnegative(),
	})
	.readonly();

export const tavilySearchResponseSchema = z
	.object({
		results: z.array(z.unknown()).readonly(),
		usage: tavilyUsageSchema.nullish(),
	})
	.readonly()
	.describe(
		"Untrusted Tavily SDK search response validated before normalization.",
	);

export type TavilySearchResponse = z.infer<typeof tavilySearchResponseSchema>;
