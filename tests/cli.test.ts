import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

type CliResult = {
	readonly status: number | null;
	readonly stdout: string;
	readonly stderr: string;
};

const runCli = (args: readonly string[] = [], logLevel?: string): CliResult => {
	const environment = { ...process.env };
	delete environment.LOG_LEVEL;
	if (logLevel !== undefined) {
		environment.LOG_LEVEL = logLevel;
	}

	const result = spawnSync("pnpm", ["exec", "tsx", "src/main.ts", ...args], {
		cwd: projectRoot,
		env: environment,
		encoding: "utf8",
	});

	return {
		status: result.status,
		stdout: result.stdout,
		stderr: result.stderr,
	};
};

describe("CLI process contracts", () => {
	it("Given no arguments, When the CLI runs, Then it displays help without diagnostics", () => {
		const result = runCli();

		expect(result.status).toBe(0);
		expect(result.stdout).toContain("Usage");
		expect(result.stdout).toContain("--verbose");
		expect(result.stderr).toBe("");
	});

	it("Given --verbose, When the CLI runs, Then it emits one debug diagnostic without stdout output", () => {
		const result = runCli(["--verbose"]);

		expect(result.status).toBe(0);
		expect(result.stdout).toBe("");
		expect(
			result.stderr.split("\n").filter((line) => line.includes("[DEBUG]"))
				.length,
		).toBe(1);
	});

	it("Given an invalid LOG_LEVEL, When the CLI runs, Then it exits with a clear configuration error", () => {
		const result = runCli([], "invalid");

		expect(result.status).toBe(1);
		expect(result.stdout).toBe("");
		expect(result.stderr).toMatch(/LOG_LEVEL/i);
	});
});
