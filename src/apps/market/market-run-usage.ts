import type { TavilySearchResult } from "../../tools/tavily-search.js";
import type { UsageSummary } from "../../usage.js";

export type MarketRunUsage = {
	readonly model: UsageSummary;
	readonly tavily: {
		readonly calls: number;
		readonly credits: number | null;
	};
};

export type MarketRunSummary = {
	readonly discovered: number;
	readonly processed: number;
	readonly skipped: number;
	readonly failed: number;
	readonly currentValid: number;
	readonly model: UsageSummary;
	readonly tavily: MarketRunUsage["tavily"];
	readonly outputPaths: {
		readonly jobs: string;
		readonly analysis: string;
		readonly report: string;
	};
};

const EMPTY_MODEL_USAGE: UsageSummary = {
	calls: 0,
	completionTokens: 0,
	cost: null,
	model: "unavailable",
	promptTokens: 0,
	retries: 0,
	totalTokens: 0,
};

export class MarketRunUsageAccumulator {
	private model: UsageSummary = EMPTY_MODEL_USAGE;
	private tavilyCalls = 0;
	private tavilyCredits: number | null = null;

	public addModel(usage: UsageSummary): void {
		this.model = {
			calls: this.model.calls + usage.calls,
			completionTokens: this.model.completionTokens + usage.completionTokens,
			cost:
				usage.cost === null
					? this.model.cost
					: (this.model.cost ?? 0) + usage.cost,
			model: usage.model,
			promptTokens: this.model.promptTokens + usage.promptTokens,
			retries: this.model.retries + usage.retries,
			totalTokens: this.model.totalTokens + usage.totalTokens,
		};
	}

	public addTavily(result: TavilySearchResult): void {
		this.tavilyCalls += 1;
		if (result.status === "success" && result.usage !== null) {
			this.tavilyCredits = (this.tavilyCredits ?? 0) + result.usage.credits;
		}
	}

	public summary(): MarketRunUsage {
		return {
			model: this.model,
			tavily: { calls: this.tavilyCalls, credits: this.tavilyCredits },
		};
	}
}
