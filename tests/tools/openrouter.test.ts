import { APIConnectionTimeoutError } from "openai";
import { LengthFinishReasonError } from "openai/core/error";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
	type OpenRouterChatRequest,
	type OpenRouterParseDriver,
	OpenRouterStructuredClient,
} from "../../src/tools/openrouter.js";

const answerSchema = z.object({ answer: z.string() }).strict().readonly();
const messages = [{ role: "user", content: "opaque test input" }] as const;
const silentLogger = { debug: (_message: string): void => undefined };

class FakeOpenRouterDriver implements OpenRouterParseDriver {
	public readonly requests: OpenRouterChatRequest[] = [];

	public constructor(
		private readonly responses: readonly (
			| { readonly kind: "return"; readonly value: unknown }
			| { readonly kind: "throw"; readonly error: Error }
		)[],
	) {}

	public async parse(request: OpenRouterChatRequest): Promise<unknown> {
		this.requests.push(request);
		const response = this.responses[this.requests.length - 1];
		if (response === undefined) {
			throw new RangeError("Fake driver received an unexpected call");
		}
		if (response.kind === "throw") {
			throw response.error;
		}
		return response.value;
	}
}

const completion = (
	parsed: unknown,
	options: {
		readonly content?: string | null;
		readonly refusal?: string | null;
		readonly usage?: unknown;
	} = {},
): unknown => ({
	choices: [
		{
			message: {
				content: options.content ?? null,
				parsed,
				refusal: options.refusal ?? null,
			},
		},
	],
	usage: options.usage,
});

describe("OpenRouterStructuredClient", () => {
	it("Given an SDK Zod failure then valid output, When a structured call succeeds, Then it retries with strict routing and accounts usage", async () => {
		const driver = new FakeOpenRouterDriver([
			{
				error: new z.ZodError([
					{ code: "custom", message: "invalid structured output", path: [] },
				]),
				kind: "throw",
			},
			{
				kind: "return",
				value: completion(
					{ answer: "grounded" },
					{
						usage: {
							completion_tokens: 7,
							cost: 0.0015,
							prompt_tokens: 11,
							total_tokens: 18,
						},
					},
				),
			},
		]);
		const logs: string[] = [];
		const client = new OpenRouterStructuredClient(driver, "test/model", {
			debug: (message) => logs.push(message),
		});

		const result = await client.call({
			messages,
			schema: answerSchema,
			schemaName: "answer",
		});

		expect(result).toEqual({
			data: { answer: "grounded" },
			kind: "success",
			usage: {
				calls: 2,
				completionTokens: 7,
				cost: 0.0015,
				model: "test/model",
				promptTokens: 11,
				retries: 1,
				totalTokens: 18,
			},
		});
		expect(driver.requests).toHaveLength(2);
		expect(driver.requests[0]).toMatchObject({
			max_tokens: 32_000,
			model: "test/model",
			provider: { require_parameters: true },
			temperature: 0,
		});
		expect(driver.requests[0]?.response_format).toMatchObject({
			json_schema: { name: "answer", strict: true },
			type: "json_schema",
		});
		expect(logs).toEqual([
			"OpenRouter call failed model=test/model attempt=1 ZodError issues=1",
			"OpenRouter structured call completed model=test/model calls=2 promptTokens=11 completionTokens=7 totalTokens=18 retries=1 providerCost=0.0015",
		]);
	});

	it("Given a transient timeout followed by valid output, When a structured call runs, Then it retries once and returns accumulated usage", async () => {
		const driver = new FakeOpenRouterDriver([
			{
				error: new APIConnectionTimeoutError({ message: "timed out" }),
				kind: "throw",
			},
			{
				kind: "return",
				value: completion(
					{ answer: "recovered" },
					{
						usage: {
							completion_tokens: 2,
							prompt_tokens: 3,
							total_tokens: 5,
						},
					},
				),
			},
		]);
		const client = new OpenRouterStructuredClient(
			driver,
			"test/model",
			silentLogger,
		);

		const result = await client.call({
			messages,
			schema: answerSchema,
			schemaName: "answer",
		});

		expect(result).toMatchObject({
			data: { answer: "recovered" },
			kind: "success",
			usage: { calls: 2, retries: 1, totalTokens: 5 },
		});
		expect(driver.requests).toHaveLength(2);
	});

	it("Given a refusal containing JSON-looking prose, When a structured call runs, Then it rejects the refusal without parsing the prose", async () => {
		const driver = new FakeOpenRouterDriver([
			{
				kind: "return",
				value: completion(null, {
					content: '{"answer":"must not be accepted"}',
					refusal: "Cannot comply",
				}),
			},
		]);
		const client = new OpenRouterStructuredClient(
			driver,
			"test/model",
			silentLogger,
		);

		const result = await client.call({
			messages,
			schema: answerSchema,
			schemaName: "answer",
		});

		expect(result).toMatchObject({ kind: "refusal", usage: { calls: 1 } });
		expect(driver.requests).toHaveLength(1);
	});

	it("Given two missing parsed outputs with malformed usage, When a structured call runs, Then it exhausts at two calls with a safe summary", async () => {
		const driver = new FakeOpenRouterDriver([
			{
				kind: "return",
				value: completion(null, {
					content: '{"answer":"free text fallback is forbidden"}',
					usage: { cost: "secret", prompt_tokens: -1 },
				}),
			},
			{
				kind: "return",
				value: completion(null, { usage: { total_tokens: "invalid" } }),
			},
		]);
		const client = new OpenRouterStructuredClient(
			driver,
			"test/model",
			silentLogger,
		);

		const result = await client.call({
			messages,
			schema: answerSchema,
			schemaName: "answer",
		});

		expect(result).toEqual({
			kind: "exhausted",
			reason: "schema",
			usage: {
				calls: 2,
				completionTokens: 0,
				cost: null,
				model: "test/model",
				promptTokens: 0,
				retries: 1,
				totalTokens: 0,
			},
		});
		expect(driver.requests).toHaveLength(2);
	});

	it("Given output truncated at the token limit, When a structured call runs, Then it reports truncation once without retrying an identical request", async () => {
		const driver = new FakeOpenRouterDriver([
			{ error: new LengthFinishReasonError(), kind: "throw" },
		]);
		const logs: string[] = [];
		const client = new OpenRouterStructuredClient(driver, "test/model", {
			debug: (message: string): void => {
				logs.push(message);
			},
		});

		const result = await client.call({
			messages,
			schema: answerSchema,
			schemaName: "answer",
		});

		expect(result).toMatchObject({ kind: "truncated" });
		expect(driver.requests).toHaveLength(1);
		expect(driver.requests[0]?.max_tokens).toBe(32_000);
		expect(logs.join("\n")).toContain("length limit was reached");
	});
});
