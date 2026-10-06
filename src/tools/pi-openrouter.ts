import type { StreamFn } from "@earendil-works/pi-agent-core";
import { type Api, createModels, type Model } from "@earendil-works/pi-ai";
import { openrouterProvider } from "@earendil-works/pi-ai/providers/openrouter";

import type { MarketConfig } from "../config.js";

const OPENROUTER_PROVIDER_ID = "openrouter";
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const MAX_OUTPUT_TOKENS = 32_000;
const FALLBACK_CONTEXT_WINDOW = 128_000;

export type PiOpenRouterClient = {
	readonly model: Model<Api>;
	readonly streamFn: StreamFn;
};

const syntheticModel = (id: string): Model<"openai-completions"> => ({
	id,
	name: id,
	api: "openai-completions",
	provider: OPENROUTER_PROVIDER_ID,
	baseUrl: OPENROUTER_BASE_URL,
	reasoning: false,
	input: ["text"],
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	contextWindow: FALLBACK_CONTEXT_WINDOW,
	maxTokens: MAX_OUTPUT_TOKENS,
});

export const createPiOpenRouterClient = (
	config: MarketConfig,
): PiOpenRouterClient => {
	const models = createModels();
	models.setProvider(openrouterProvider());

	const catalogModel =
		models.getModel(OPENROUTER_PROVIDER_ID, config.openrouterModel) ??
		syntheticModel(config.openrouterModel);

	const model: Model<Api> = {
		...catalogModel,
		maxTokens: Math.min(catalogModel.maxTokens, MAX_OUTPUT_TOKENS),
	};

	return {
		model,
		streamFn: (requested, context, options) =>
			models.streamSimple(requested, context, options),
	};
};
