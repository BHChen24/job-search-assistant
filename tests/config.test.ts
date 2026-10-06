import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { ConfigurationError, readMarketConfig } from "../src/config.js";
import {
	ADVISOR_DIR,
	DEFAULT_JOBS_INPUT_DIR,
	JOBS_DATA_DIR,
	MARKET_ANALYSIS_JSON_PATH,
	MARKET_REPORT_PATH,
	PROJECT_ROOT,
} from "../src/paths.js";

const EXPECTED_DEFAULT_MODEL = "deepseek/deepseek-v4-flash-0731";

describe("market runtime configuration", () => {
	it("Given required API keys, When market configuration is read, Then it accepts them and supplies the default model", () => {
		const config = readMarketConfig({
			OPENROUTER_API_KEY: "openrouter-test-value",
			TAVILY_API_KEY: "tavily-test-value",
		});

		expect(config).toMatchObject({
			openrouterApiKey: "openrouter-test-value",
			openrouterModel: EXPECTED_DEFAULT_MODEL,
			tavilyApiKey: "tavily-test-value",
		});
	});

	it("Given missing and blank required keys, When market configuration is read, Then it throws a secret-safe ConfigurationError", () => {
		const exposedValue = "must-never-appear-in-errors";
		const invalidEnvironments: readonly NodeJS.ProcessEnv[] = [
			{ OPENROUTER_API_KEY: exposedValue },
			{ OPENROUTER_API_KEY: exposedValue, TAVILY_API_KEY: "   " },
		];

		const readInvalidConfigurations = (): void => {
			for (const environment of invalidEnvironments) {
				try {
					readMarketConfig(environment);
				} catch (error: unknown) {
					if (!(error instanceof ConfigurationError)) {
						throw error;
					}
					expect(error.message).not.toContain(exposedValue);
					continue;
				}
				throw new Error("Expected invalid market configuration to fail");
			}
		};

		expect(readInvalidConfigurations).not.toThrow();
	});

	it("Given the exported project paths, When resolved, Then each is absolute and anchored to the module-derived project root", () => {
		const paths = [
			DEFAULT_JOBS_INPUT_DIR,
			JOBS_DATA_DIR,
			ADVISOR_DIR,
			MARKET_ANALYSIS_JSON_PATH,
			MARKET_REPORT_PATH,
		];

		expect(PROJECT_ROOT).toBe(
			resolve(dirname(fileURLToPath(import.meta.url)), ".."),
		);
		for (const path of paths) {
			expect(isAbsolute(path)).toBe(true);
			expect(path.startsWith(`${PROJECT_ROOT}/`)).toBe(true);
		}
	});
});
