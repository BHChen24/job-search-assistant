import type { AnalyzeMarketResult } from "./analyze-market.js";

const assertNever = (value: never): never => {
	throw new TypeError(`Unexpected aggregate result: ${String(value)}`);
};

export const aggregateFailureMessage = (
	result: AnalyzeMarketResult,
): string => {
	switch (result.status) {
		case "model-failure": {
			if (result.failure.kind === "truncated") {
				return "Aggregate market analysis exceeded the model output limit; reduce the analysis scope or raise the output limit and retry.";
			}
			const status =
				result.failure.kind === "provider" && result.failure.status !== null
					? ` status=${result.failure.status}`
					: "";
			return `Aggregate market analysis failed (${result.failure.kind}${status}); rerun with --verbose for the provider message.`;
		}
		case "storage-failure":
			return `Aggregate output ${result.failure.operation} failed; check output permissions and retry.`;
		case "cache-hit":
		case "complete":
		case "insufficient-data":
		case "partial-success":
			throw new TypeError(
				`Expected aggregate failure, received ${result.status}.`,
			);
		default:
			return assertNever(result);
	}
};
