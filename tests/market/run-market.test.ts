import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { AnalyzeMarketResult } from "../../src/apps/market/analyze-market.js";
import type { ExtractPostingResult } from "../../src/apps/market/extract-posting.js";
import {
	type MarketRunDependencies,
	runMarket,
} from "../../src/apps/market/run-market.js";
import { executeMarketCommand } from "../../src/cli/market-command.js";
import type { JobRecord } from "../../src/schemas/job-posting.js";
import { marketAnalysisSchema } from "../../src/schemas/market-analysis.js";
import {
	createAnalysis,
	createRecord,
	dependencies,
	input,
	USAGE,
} from "./run-market-fixtures.js";

describe("market run", () => {
	it("Given twelve current caches, When rerun, Then every cache is current, output paths are unique, and aggregate cache is reused", async () => {
		const inputs = Array.from({ length: 12 }, (_, index) => input(index + 1));
		const outputPaths: string[] = [];
		const extract = async (
			request: Parameters<MarketRunDependencies["extractPosting"]>[0],
		): Promise<ExtractPostingResult> => {
			outputPaths.push(request.outputPath);
			return { kind: "cached", record: createRecord(request.input) };
		};
		const analyze = async (): Promise<AnalyzeMarketResult> => ({
			status: "cache-hit",
			completeness: "complete",
			analysis: createAnalysis(12, 0),
			failedInputCount: 0,
		});

		const result = await runMarket(inputs, dependencies(extract, analyze));
		if (result.kind !== "success") {
			throw new TypeError("Expected successful all-cache rerun");
		}

		expect(result).toMatchObject({
			kind: "success",
			aggregateReused: true,
			summary: {
				discovered: 12,
				processed: 0,
				skipped: 12,
				failed: 0,
				currentValid: 12,
			},
		});
		expect(new Set(outputPaths).size).toBe(12);
		expect(result.summary.model.calls).toBe(0);
		expect(result.summary.tavily.calls).toBe(0);
	});

	it("Given nine current PDFs with one posting failure, When the market command runs with measured fake boundaries, Then it exits zero with one stdout summary and one stderr warning", async () => {
		const root = await mkdtemp(join(tmpdir(), "market-command-partial-"));
		try {
			const inputDir = join(root, "jobs");
			await mkdir(inputDir);
			for (let index = 1; index <= 9; index += 1) {
				await writeFile(
					join(inputDir, `role-${index}.pdf`),
					`offline-${index}`,
				);
			}
			let stdout = "";
			let stderr = "";
			const exitCode = await executeMarketCommand(
				{ market: true, inputDir },
				async () => {
					const extract = async (
						request: Parameters<MarketRunDependencies["extractPosting"]>[0],
						posting: Parameters<MarketRunDependencies["extractPosting"]>[1],
					): Promise<ExtractPostingResult> => {
						if (request.input.fileName === "role-1.pdf") {
							return {
								kind: "failure",
								stage: "pdf",
								code: "invalid_pdf",
								message: "Invalid PDF",
							};
						}
						await posting.searchTool.search({ query: "Example company" });
						return {
							kind: "persisted",
							record: createRecord(request.input),
							usage: USAGE,
						};
					};
					const analyze = async (
						_records: readonly JobRecord[],
						_failed: readonly string[],
						aggregate: Parameters<MarketRunDependencies["analyzeMarket"]>[2],
					): Promise<AnalyzeMarketResult> => {
						await aggregate.client.call({
							messages: [],
							schema: marketAnalysisSchema,
							schemaName: "aggregate_usage",
						});
						return {
							status: "partial-success",
							analysis: createAnalysis(8, 1),
							failedInputCount: 1,
							usage: USAGE,
						};
					};
					return dependencies(extract, analyze);
				},
				{
					writeOut: (text) => {
						stdout += text;
					},
					writeErr: (text) => {
						stderr += text;
					},
				},
			);

			expect(exitCode).toBe(0);
			expect(stdout.trim().split("\n")).toHaveLength(1);
			expect(stdout).toMatch(
				/discovered=9 processed=8 skipped=0 failed=1 current-valid=8/,
			);
			expect(stdout).toMatch(
				/model-calls=9.*tavily-calls=8.*provider-cost=\$0\.018000/,
			);
			expect(stderr.trim().split("\n")).toHaveLength(1);
			expect(stderr).toMatch(/warning.*1 posting.*failed/i);
		} finally {
			await rm(root, { force: true, recursive: true });
		}
	});

	it("Given a missing input directory, When the market command runs, Then it exits one with an actionable stderr message and initializes no dependencies", async () => {
		let factoryCalls = 0;
		let stdout = "";
		let stderr = "";

		const exitCode = await executeMarketCommand(
			{
				market: true,
				inputDir: join(tmpdir(), "jsa-definitely-missing-runner"),
			},
			() => {
				factoryCalls += 1;
				throw new TypeError("Unexpected dependency initialization");
			},
			{
				writeOut: (text) => {
					stdout += text;
				},
				writeErr: (text) => {
					stderr += text;
				},
			},
		);

		expect(exitCode).toBe(1);
		expect(stderr).toMatch(/input directory is not readable/i);
		expect(stdout).toBe("");
		expect(factoryCalls).toBe(0);
	});
});
