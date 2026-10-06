import { z } from "zod";

export type UsageSummary = {
	readonly calls: number;
	readonly completionTokens: number;
	readonly cost: number | null;
	readonly model: string;
	readonly promptTokens: number;
	readonly retries: number;
	readonly totalTokens: number;
};

const usageObjectSchema = z.record(z.string(), z.unknown());
const tokenCountSchema = z.number().int().nonnegative().finite();
const costSchema = z.number().nonnegative().finite();

export class UsageAccumulator {
	private calls = 0;
	private completionTokens = 0;
	private cost: number | null = null;
	private promptTokens = 0;
	private retries = 0;
	private totalTokens = 0;

	public constructor(private readonly model: string) {}

	public recordCall(): void {
		this.calls += 1;
	}

	public recordRetry(): void {
		this.retries += 1;
	}

	public addUsage(value: unknown): void {
		const usage = usageObjectSchema.safeParse(value);
		if (!usage.success) {
			return;
		}

		const promptTokens = tokenCountSchema.safeParse(usage.data.prompt_tokens);
		const completionTokens = tokenCountSchema.safeParse(
			usage.data.completion_tokens,
		);
		const totalTokens = tokenCountSchema.safeParse(usage.data.total_tokens);
		const cost = costSchema.safeParse(usage.data.cost);

		if (promptTokens.success) {
			this.promptTokens += promptTokens.data;
		}
		if (completionTokens.success) {
			this.completionTokens += completionTokens.data;
		}
		if (totalTokens.success) {
			this.totalTokens += totalTokens.data;
		}
		if (cost.success) {
			this.cost = (this.cost ?? 0) + cost.data;
		}
	}

	public summary(): UsageSummary {
		return {
			calls: this.calls,
			completionTokens: this.completionTokens,
			cost: this.cost,
			model: this.model,
			promptTokens: this.promptTokens,
			retries: this.retries,
			totalTokens: this.totalTokens,
		};
	}
}
