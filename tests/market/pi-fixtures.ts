import type { StreamFn } from "@earendil-works/pi-agent-core";
import { type Api, createModels, type Model } from "@earendil-works/pi-ai";
import {
	type FauxResponseStep,
	fauxAssistantMessage,
	fauxProvider,
	fauxToolCall,
} from "@earendil-works/pi-ai/providers/faux";

export { fauxAssistantMessage, fauxToolCall };

export type ScriptedAgent = {
	readonly model: Model<Api>;
	readonly streamFn: StreamFn;
	readonly callCount: () => number;
};

export const scriptedAgent = (
	responses: readonly FauxResponseStep[],
): ScriptedAgent => {
	const faux = fauxProvider();
	const models = createModels();
	models.setProvider(faux.provider);
	faux.setResponses([...responses]);
	return {
		model: faux.getModel(),
		streamFn: (model, context, options) =>
			models.streamSimple(model, context, options),
		callCount: () => faux.state.callCount,
	};
};

export const unusedAgent = (): ScriptedAgent =>
	scriptedAgent([fauxAssistantMessage("unused")]);
