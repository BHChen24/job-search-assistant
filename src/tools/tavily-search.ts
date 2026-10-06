import { z } from "zod";

import {
	tavilySearchArgsSchema,
	tavilySearchResponseSchema,
	tavilySearchResultSchema,
} from "../schemas/tavily.js";

const MAX_NORMALIZED_CONTENT_LENGTH = 500;

export type TavilySearchOptions = {
	readonly searchDepth: "advanced";
	readonly maxResults: 5;
	readonly maxTokens: 2000;
	readonly timeout: 10;
	readonly includeRawContent: false;
	readonly includeImages: false;
	readonly includeAnswer: false;
	readonly includeUsage: true;
	readonly includeDomains?: string[];
};

export interface TavilySearchClient {
	search(query: string, options: TavilySearchOptions): Promise<unknown>;
}

export interface TavilySearchLogger {
	debug(message: string): void;
}

export type TavilyEvidence = {
	readonly title: string;
	readonly url: string;
	readonly content: string;
	readonly score: number;
};

export type TavilyUsage = {
	readonly credits: number;
};

export type TavilySearchFailureCode =
	| "configuration"
	| "timeout"
	| "rate_limit"
	| "network"
	| "malformed_response"
	| "empty_result";

export type TavilySearchResult =
	| {
			readonly status: "success";
			readonly results: readonly TavilyEvidence[];
			readonly usage: TavilyUsage | null;
	  }
	| {
			readonly status: "unavailable";
			readonly code: TavilySearchFailureCode;
			readonly retryable: boolean;
			readonly message: string;
	  };

export interface TavilySearchTool {
	readonly search: (args: unknown) => Promise<TavilySearchResult>;
}

const sdkErrorSchema = z.object({
	status: z.number().int().optional(),
	statusCode: z.number().int().optional(),
	code: z.string().optional(),
	message: z.string().optional(),
});

const describeIssues = (error: z.ZodError): string =>
	`issues=[${error.issues
		.map((issue) => `${issue.path.join(".") || "(root)"}=${issue.code}`)
		.join(",")}]`;

const unavailable = (
	code: TavilySearchFailureCode,
	retryable: boolean,
	message: string,
): TavilySearchResult => ({
	status: "unavailable",
	code,
	retryable,
	message,
});

const classifySdkError = (error: Error): TavilySearchResult => {
	const details = sdkErrorSchema.safeParse(error);
	const structuredStatus = details.success
		? (details.data.status ?? details.data.statusCode)
		: undefined;
	const code = details.success ? details.data.code?.toUpperCase() : undefined;
	const message = error.message.toLowerCase();
	const messageStatus = error.message.match(/^(401|403|429) Error:/)?.[1];
	const isRateLimited =
		structuredStatus === 429 ||
		messageStatus === "429" ||
		code === "RATE_LIMITED" ||
		error.name === "TavilyKeylessLimitError";
	const isConfigurationFailure =
		structuredStatus === 401 ||
		structuredStatus === 403 ||
		messageStatus === "401" ||
		messageStatus === "403" ||
		code === "UNAUTHORIZED";

	if (isRateLimited) {
		return unavailable(
			"rate_limit",
			true,
			"Company search rate limit was reached; no absence conclusion can be drawn.",
		);
	}
	if (isConfigurationFailure) {
		return unavailable(
			"configuration",
			false,
			"Company search credentials are unavailable or invalid.",
		);
	}
	if (
		error.name === "TimeoutError" ||
		error.name === "AbortError" ||
		code === "ETIMEDOUT" ||
		message.includes("timeout") ||
		message.includes("timed out")
	) {
		return unavailable(
			"timeout",
			true,
			"Company search timed out; no absence conclusion can be drawn.",
		);
	}
	return unavailable(
		"network",
		true,
		"Company search network request failed; no absence conclusion can be drawn.",
	);
};

export const createTavilySearchTool = (
	client: TavilySearchClient,
	logger: TavilySearchLogger,
): TavilySearchTool => ({
	search: async (args): Promise<TavilySearchResult> => {
		const parsedArgs = tavilySearchArgsSchema.safeParse(args);
		if (!parsedArgs.success) {
			return unavailable(
				"configuration",
				false,
				"Search query and company domain hint must be valid.",
			);
		}

		const startedAt = Date.now();
		const { query, companyDomainHint } = parsedArgs.data;
		logger.debug(`Tavily search query=${query}`);
		const options: TavilySearchOptions = {
			searchDepth: "advanced",
			maxResults: 5,
			maxTokens: 2000,
			timeout: 10,
			includeRawContent: false,
			includeImages: false,
			includeAnswer: false,
			includeUsage: true,
			...(companyDomainHint === undefined
				? {}
				: { includeDomains: [companyDomainHint] }),
		};

		let rawResponse: unknown;
		try {
			rawResponse = await client.search(query, options);
		} catch (error: unknown) {
			logger.debug(
				`Tavily search query=${query} durationMs=${Date.now() - startedAt} resultCount=0`,
			);
			if (error instanceof Error) {
				return classifySdkError(error);
			}
			throw error;
		}

		const response = tavilySearchResponseSchema.safeParse(rawResponse);
		if (!response.success) {
			logger.debug(
				`Tavily search failed query=${query} durationMs=${Date.now() - startedAt} reason=malformed_response ${describeIssues(response.error)}`,
			);
			return unavailable(
				"malformed_response",
				false,
				"Company search returned an invalid response; no absence conclusion can be drawn.",
			);
		}

		const parsedResults = response.data.results.map((result) =>
			tavilySearchResultSchema.safeParse(result),
		);
		const validResults = parsedResults.flatMap((parsed) =>
			parsed.success ? [parsed.data] : [],
		);
		const dropped = parsedResults.length - validResults.length;
		const results = validResults.slice(0, 5).map((result) => ({
			title: result.title.trim(),
			url: result.url,
			content: result.content.trim().slice(0, MAX_NORMALIZED_CONTENT_LENGTH),
			score: result.score,
		}));
		logger.debug(
			`Tavily search query=${query} durationMs=${Date.now() - startedAt} resultCount=${results.length} droppedResults=${dropped}`,
		);

		if (results.length === 0) {
			if (parsedResults.length > 0) {
				const firstFailure = parsedResults.find((parsed) => !parsed.success);
				logger.debug(
					`Tavily search failed query=${query} reason=malformed_response ${firstFailure === undefined ? "" : describeIssues(firstFailure.error)}`,
				);
				return unavailable(
					"malformed_response",
					false,
					"Company search returned an invalid response; no absence conclusion can be drawn.",
				);
			}
			return unavailable(
				"empty_result",
				false,
				"Company search returned no evidence; this does not show the company is absent.",
			);
		}
		return {
			status: "success",
			results,
			usage: response.data.usage ?? null,
		};
	},
});
