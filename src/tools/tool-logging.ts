import type { AgentTool } from "@earendil-works/pi-agent-core";

const MAX_SCALAR_LENGTH = 80;
const MAX_ARGS_LENGTH = 200;
const MAX_RESULT_LENGTH = 160;

export interface ToolLogger {
	debug(message: string): void;
}

const truncate = (value: string, limit: number): string =>
	value.length <= limit ? value : `${value.slice(0, limit - 1)}…`;

const describeValue = (value: unknown): string => {
	if (value === null) return "null";
	if (Array.isArray(value)) return `[${value.length}]`;
	if (typeof value === "object") return `{${Object.keys(value).length} keys}`;
	if (typeof value === "string")
		return JSON.stringify(truncate(value, MAX_SCALAR_LENGTH));
	return String(value);
};

const describeArgs = (params: unknown): string => {
	if (params === null || typeof params !== "object" || Array.isArray(params)) {
		return describeValue(params);
	}
	const parts = Object.entries(params).map(
		([key, value]) => `${key}=${describeValue(value)}`,
	);
	return truncate(parts.join(", "), MAX_ARGS_LENGTH);
};

const describeResult = (content: readonly unknown[]): string => {
	const text = content.find(
		(item): item is { type: "text"; text: string } =>
			typeof item === "object" &&
			item !== null &&
			"type" in item &&
			(item as { type: unknown }).type === "text",
	);
	if (text === undefined) return `${content.length} non-text block(s)`;
	return truncate(text.text.replace(/\s+/g, " ").trim(), MAX_RESULT_LENGTH);
};

export const withToolLogging = (
	tool: AgentTool,
	logger: ToolLogger,
	scope: string,
): AgentTool => ({
	...tool,
	execute: async (toolCallId, params, signal, onUpdate) => {
		logger.debug(`${scope} tool call: ${tool.name}(${describeArgs(params)})`);
		const startedAt = Date.now();
		try {
			const result = await tool.execute(toolCallId, params, signal, onUpdate);
			logger.debug(
				`${scope} tool result: ${tool.name} durationMs=${Date.now() - startedAt} -> ${describeResult(result.content)}`,
			);
			return result;
		} catch (error: unknown) {
			logger.debug(
				`${scope} tool failed: ${tool.name} durationMs=${Date.now() - startedAt} error=${error instanceof Error ? error.message : "unknown"}`,
			);
			throw error;
		}
	},
});

export const withToolLoggingAll = (
	tools: readonly AgentTool[],
	logger: ToolLogger,
	scope: string,
): AgentTool[] => tools.map((tool) => withToolLogging(tool, logger, scope));
