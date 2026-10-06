import type { Agent } from "@earendil-works/pi-agent-core";

import type { UsageSummary } from "./usage.js";

export const AGENT_TURN_LIMIT = 8;

export type BoundedAgentOutcome = {
	readonly turns: number;
	readonly turnLimitHit: boolean;
	readonly errorMessage: string | undefined;
	readonly usage: UsageSummary;
	readonly promptChars: number;
};

export const summarizeAgentUsage = (agent: Agent): UsageSummary => {
	const rates = agent.state.model.cost;
	const ratesKnown = rates.input > 0 || rates.output > 0;
	let calls = 0;
	let promptTokens = 0;
	let completionTokens = 0;
	let totalTokens = 0;
	let cost: number | null = null;
	for (const message of agent.state.messages) {
		if (message.role !== "assistant") continue;
		calls += 1;
		promptTokens += message.usage.input;
		completionTokens += message.usage.output;
		totalTokens += message.usage.totalTokens;
		if (ratesKnown) {
			cost = (cost ?? 0) + message.usage.cost.total;
		}
	}
	return {
		calls,
		completionTokens,
		cost,
		model: agent.state.model.id,
		promptTokens,
		retries: 0,
		totalTokens,
	};
};

export const describeAgentRun = (
	scope: string,
	outcome: BoundedAgentOutcome,
	submitted: boolean,
	extra = "",
): string =>
	`${scope} model=${outcome.usage.model} turns=${outcome.turns} promptChars=${outcome.promptChars} llmCalls=${outcome.usage.calls} tokens=${outcome.usage.totalTokens} cost=${outcome.usage.cost === null ? "unavailable" : `$${outcome.usage.cost.toFixed(6)}`} structuredOutput=${submitted ? "passed" : "failed"}${extra}${
		outcome.errorMessage === undefined ? "" : ` error=${outcome.errorMessage}`
	}`;

export const runAgentBounded = async (
	agent: Agent,
	options: {
		readonly prompt: string;
		readonly hasResult: () => boolean;
		readonly turnLimit?: number;
		readonly onStart?: (promptChars: number) => void;
	},
): Promise<BoundedAgentOutcome> => {
	const turnLimit = options.turnLimit ?? AGENT_TURN_LIMIT;
	let turns = 0;
	let turnLimitHit = false;

	const unsubscribe = agent.subscribe((event) => {
		if (event.type !== "turn_end") return;
		turns += 1;
		if (turns >= turnLimit && !options.hasResult()) {
			turnLimitHit = true;
			agent.abort();
		}
	});

	options.onStart?.(options.prompt.length);
	try {
		await agent.prompt(options.prompt);
	} finally {
		unsubscribe();
	}

	return {
		turns,
		turnLimitHit,
		errorMessage: agent.state.errorMessage,
		usage: summarizeAgentUsage(agent),
		promptChars: options.prompt.length,
	};
};
