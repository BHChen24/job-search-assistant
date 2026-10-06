import OpenAI, {
	APIConnectionTimeoutError,
	APIError,
	AuthenticationError,
	OpenAIError,
	PermissionDeniedError,
	RateLimitError,
} from "openai";
import {
	ContentFilterFinishReasonError,
	LengthFinishReasonError,
} from "openai/core/error";
import { zodResponseFormat } from "openai/helpers/zod";
import type {
	ChatCompletionCreateParamsNonStreaming,
	ChatCompletionMessageParam,
} from "openai/resources/chat/completions";
import { z } from "zod";

import type { MarketConfig } from "../config.js";
import { UsageAccumulator, type UsageSummary } from "../usage.js";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const OPENROUTER_TIMEOUT_MS = 60_000;
const MODEL_ATTEMPT_LIMIT = 2;
const MAX_OUTPUT_TOKENS = 32_000;

type ProviderRequirement = {
	readonly provider: {
		readonly require_parameters: true;
	};
};

export type OpenRouterChatRequest = ChatCompletionCreateParamsNonStreaming &
	ProviderRequirement;

export interface OpenRouterParseDriver {
	parse(request: OpenRouterChatRequest): Promise<unknown>;
}

export interface OpenRouterLogger {
	debug(message: string, metadata?: unknown): void;
}

export type StructuredCallRequest<T> = {
	readonly messages: readonly ChatCompletionMessageParam[];
	readonly schema: z.ZodType<T>;
	readonly schemaName: string;
};

export type StructuredCallResult<T> =
	| {
			readonly kind: "success";
			readonly data: T;
			readonly usage: UsageSummary;
	  }
	| {
			readonly kind: "refusal";
			readonly usage: UsageSummary;
	  }
	| {
			readonly kind: "schema";
			readonly reason: "malformed_response";
			readonly usage: UsageSummary;
	  }
	| {
			readonly kind: "auth";
			readonly usage: UsageSummary;
	  }
	| {
			readonly kind: "quota";
			readonly usage: UsageSummary;
	  }
	| {
			readonly kind: "timeout";
			readonly usage: UsageSummary;
	  }
	| {
			readonly kind: "provider";
			readonly status: number | null;
			readonly usage: UsageSummary;
	  }
	| {
			readonly kind: "truncated";
			readonly usage: UsageSummary;
	  }
	| {
			readonly kind: "exhausted";
			readonly reason: "schema";
			readonly usage: UsageSummary;
	  };

const completionMessageSchema = z
	.object({
		content: z.string().nullable(),
		parsed: z.unknown().nullable(),
		refusal: z.string().nullable(),
	})
	.loose();
const completionChoiceSchema = z
	.object({ message: completionMessageSchema })
	.loose();
const completionEnvelopeSchema = z
	.object({
		choices: z.tuple([completionChoiceSchema], completionChoiceSchema),
		usage: z.unknown().optional(),
	})
	.loose();

const describeSdkError = (error: Error): string => {
	if (error instanceof z.ZodError) {
		return `ZodError issues=${error.issues.length}`;
	}
	if (error instanceof APIError) {
		return `${error.name} status=${error.status ?? "unknown"} code=${String(error.code ?? "none")} message=${error.message}`;
	}
	return `${error.name}: ${error.message}`;
};

export class OpenRouterStructuredClient {
	public constructor(
		private readonly driver: OpenRouterParseDriver,
		private readonly model: string,
		private readonly logger: OpenRouterLogger,
	) {}

	public async call<T>(
		request: StructuredCallRequest<T>,
	): Promise<StructuredCallResult<T>> {
		const usage = new UsageAccumulator(this.model);
		const sdkRequest: OpenRouterChatRequest = {
			max_tokens: MAX_OUTPUT_TOKENS,
			messages: [...request.messages],
			model: this.model,
			provider: { require_parameters: true },
			response_format: zodResponseFormat(request.schema, request.schemaName),
			temperature: 0,
		};

		for (let attempt = 0; attempt < MODEL_ATTEMPT_LIMIT; attempt += 1) {
			usage.recordCall();
			let rawCompletion: unknown;
			try {
				rawCompletion = await this.driver.parse(sdkRequest);
			} catch (error: unknown) {
				if (!(error instanceof z.ZodError) && !(error instanceof Error)) {
					throw error;
				}
				const failure = this.handleSdkError(error, usage, attempt);
				if (failure === null) {
					continue;
				}
				return failure;
			}

			const completion = completionEnvelopeSchema.safeParse(rawCompletion);
			if (!completion.success) {
				return {
					kind: "schema",
					reason: "malformed_response",
					usage: usage.summary(),
				};
			}
			usage.addUsage(completion.data.usage);
			const message = completion.data.choices[0].message;
			if (message.refusal !== null) {
				return { kind: "refusal", usage: usage.summary() };
			}

			const parsed = request.schema.safeParse(message.parsed);
			if (parsed.success) {
				const summary = usage.summary();
				this.logger.debug(
					`OpenRouter structured call completed model=${summary.model} calls=${summary.calls} promptTokens=${summary.promptTokens} completionTokens=${summary.completionTokens} totalTokens=${summary.totalTokens} retries=${summary.retries} providerCost=${summary.cost ?? "unavailable"}`,
				);
				return { data: parsed.data, kind: "success", usage: summary };
			}
			this.logger.debug(
				`OpenRouter response failed schema validation model=${this.model} attempt=${attempt + 1} issues=[${parsed.error.issues
					.map((issue) => `${issue.path.join(".") || "(root)"}=${issue.code}`)
					.join(",")}]`,
			);
			if (attempt + 1 < MODEL_ATTEMPT_LIMIT) {
				usage.recordRetry();
				continue;
			}
			return {
				kind: "exhausted",
				reason: "schema",
				usage: usage.summary(),
			};
		}

		return {
			kind: "exhausted",
			reason: "schema",
			usage: usage.summary(),
		};
	}

	private handleSdkError(
		error: Error,
		usage: UsageAccumulator,
		attempt: number,
	): Exclude<StructuredCallResult<never>, { readonly kind: "success" }> | null {
		this.logger.debug(
			`OpenRouter call failed model=${this.model} attempt=${attempt + 1} ${describeSdkError(error)}`,
		);
		if (error instanceof z.ZodError || error instanceof SyntaxError) {
			if (attempt + 1 < MODEL_ATTEMPT_LIMIT) {
				usage.recordRetry();
				return null;
			}
			return {
				kind: "exhausted",
				reason: "schema",
				usage: usage.summary(),
			};
		}
		if (error instanceof LengthFinishReasonError) {
			return { kind: "truncated", usage: usage.summary() };
		}
		if (error instanceof ContentFilterFinishReasonError) {
			return { kind: "refusal", usage: usage.summary() };
		}
		if (
			error instanceof AuthenticationError ||
			error instanceof PermissionDeniedError
		) {
			return { kind: "auth", usage: usage.summary() };
		}
		if (error instanceof APIError && error.status === 402) {
			return { kind: "quota", usage: usage.summary() };
		}

		const retryable =
			error instanceof APIConnectionTimeoutError ||
			error instanceof RateLimitError ||
			(error instanceof APIError &&
				error.status !== undefined &&
				error.status >= 500);
		if (retryable && attempt + 1 < MODEL_ATTEMPT_LIMIT) {
			usage.recordRetry();
			return null;
		}
		if (error instanceof APIConnectionTimeoutError) {
			return { kind: "timeout", usage: usage.summary() };
		}
		if (error instanceof RateLimitError) {
			return { kind: "quota", usage: usage.summary() };
		}
		if (error instanceof APIError) {
			return {
				kind: "provider",
				status: error.status ?? null,
				usage: usage.summary(),
			};
		}
		if (error instanceof OpenAIError) {
			return { kind: "provider", status: null, usage: usage.summary() };
		}
		throw error;
	}
}

export const createOpenRouterStructuredClient = (
	config: MarketConfig,
	logger: OpenRouterLogger,
): OpenRouterStructuredClient => {
	const sdk = new OpenAI({
		apiKey: config.openrouterApiKey,
		baseURL: OPENROUTER_BASE_URL,
		maxRetries: 0,
		timeout: OPENROUTER_TIMEOUT_MS,
	});
	const driver: OpenRouterParseDriver = {
		parse: async (request): Promise<unknown> =>
			sdk.chat.completions.parse(request),
	};
	return new OpenRouterStructuredClient(driver, config.openrouterModel, logger);
};
