import type { AgentTool } from "@earendil-works/pi-agent-core";
import { describe, expect, it } from "vitest";

import { withToolLogging } from "../../src/tools/tool-logging.js";

const collect = (): { lines: string[]; debug: (message: string) => void } => {
	const lines: string[] = [];
	return { lines, debug: (message) => lines.push(message) };
};

const toolReturning = (text: string): AgentTool => ({
	name: "web_search",
	label: "Web Search",
	description: "search",
	parameters: { type: "object" },
	execute: () =>
		Promise.resolve({ content: [{ type: "text", text }], details: {} }),
});

describe("tool call logging", () => {
	it("Given a tool call, When executed, Then the call and its result are both logged", async () => {
		const logger = collect();
		const tool = withToolLogging(
			toolReturning("Found 5 results."),
			logger,
			"market.posting",
		);

		await tool.execute("call-1", { query: "Acme Corp culture" });

		expect(logger.lines[0]).toBe(
			'market.posting tool call: web_search(query="Acme Corp culture")',
		);
		expect(logger.lines[1]).toContain("tool result: web_search");
		expect(logger.lines[1]).toContain("Found 5 results.");
	});

	it("Given arguments carrying a resume or posting body, When logged, Then only their shape is recorded", async () => {
		const logger = collect();
		const tool = withToolLogging(
			toolReturning("Accepted."),
			logger,
			"gap.resume",
		);

		await tool.execute("call-1", {
			resume: { name: "Jane Doe", email: "jane@example.com" },
			skills: ["a", "b", "c"],
		});

		expect(logger.lines[0]).toBe(
			"gap.resume tool call: web_search(resume={2 keys}, skills=[3])",
		);
		expect(logger.lines[0]).not.toContain("Jane Doe");
		expect(logger.lines[0]).not.toContain("example.com");
	});

	it("Given a throwing tool, When executed, Then the failure is logged and the error still propagates", async () => {
		const logger = collect();
		const tool = withToolLogging(
			{
				...toolReturning("unused"),
				execute: () => Promise.reject(new Error("network down")),
			},
			logger,
			"advisor.legitimacy",
		);

		await expect(
			tool.execute("call-1", { domain: "acme.com" }),
		).rejects.toThrow("network down");
		expect(logger.lines[1]).toContain("tool failed: web_search");
		expect(logger.lines[1]).toContain("network down");
	});
});
