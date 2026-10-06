import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { executeCleanCommand } from "../src/cli/clean-command.js";

const collect = (): {
	readonly output: {
		readonly writeOut: (text: string) => void;
		readonly writeErr: (text: string) => void;
	};
	readonly stdout: () => string;
	readonly stderr: () => string;
} => {
	let out = "";
	let err = "";
	return {
		output: {
			writeOut: (text) => {
				out += text;
			},
			writeErr: (text) => {
				err += text;
			},
		},
		stdout: () => out,
		stderr: () => err,
	};
};

describe("clean command", () => {
	it("Given generated outputs and private inputs, When cleaned, Then only generated files are removed", async () => {
		const root = await mkdtemp(join(tmpdir(), "clean-command-"));
		try {
			const cacheDir = join(root, "output", "cache");
			const jobsDataDir = join(cacheDir, "postings");
			const rawInputDir = join(root, "input", "postings");
			const marketDir = join(root, "output", "market");
			const gapDir = join(root, "output", "gap");
			const advisorDir = join(root, "output", "advisor");
			const analysisPath = join(marketDir, "analysis.json");
			const reportPath = join(marketDir, "report.md");
			const gapPath = join(gapDir, "analysis.json");
			const gapReportPath = join(gapDir, "report.md");
			for (const dir of [
				jobsDataDir,
				rawInputDir,
				marketDir,
				gapDir,
				advisorDir,
			]) {
				await mkdir(dir, { recursive: true });
			}
			await writeFile(join(jobsDataDir, "role-1.json"), "{}");
			await writeFile(join(jobsDataDir, "role-2.json"), "{}");
			await writeFile(join(jobsDataDir, ".gitkeep"), "");
			await writeFile(analysisPath, "{}");
			await writeFile(reportPath, "# report");
			await writeFile(gapPath, "{}");
			await writeFile(gapReportPath, "# gap");
			await writeFile(join(advisorDir, "latest.html"), "<!doctype html>");
			await writeFile(
				join(advisorDir, "acme-dev-20260807-221500.html"),
				"<!doctype html>",
			);
			await writeFile(join(advisorDir, "acme-dev-20260807-221500.json"), "{}");
			await writeFile(
				join(advisorDir, "globex-sre-20260808-090000.json"),
				"{}",
			);
			await writeFile(join(advisorDir, ".gitkeep"), "");
			await writeFile(join(cacheDir, "resume.json"), "{}");
			await writeFile(join(rawInputDir, "private.pdf"), "private bytes");
			const io = collect();

			const exitCode = await executeCleanCommand(
				{ clean: true },
				{
					directories: [
						{ dir: jobsDataDir, match: (name) => name.endsWith(".json") },
						{
							dir: advisorDir,
							match: (name) => name.endsWith(".json") || name.endsWith(".html"),
						},
					],
					filePaths: [analysisPath, reportPath, gapPath, gapReportPath],
				},
				io.output,
			);

			expect(exitCode).toBe(0);
			expect(io.stdout()).toBe("Clean: removed 10 generated file(s).\n");
			expect(io.stderr()).toBe("");
			expect(await readdir(jobsDataDir)).toEqual([".gitkeep"]);
			expect(await readdir(marketDir)).toEqual([]);
			expect(await readdir(gapDir)).toEqual([]);
			expect(await readdir(advisorDir)).toEqual([".gitkeep"]);
			expect((await readdir(cacheDir)).sort()).toEqual([
				"postings",
				"resume.json",
			]);
			expect(await readdir(rawInputDir)).toEqual(["private.pdf"]);
		} finally {
			await rm(root, { force: true, recursive: true });
		}
	});

	it("Given nothing generated yet or no clean request, When invoked, Then it reports zero removals or stays inactive", async () => {
		const root = await mkdtemp(join(tmpdir(), "clean-command-empty-"));
		try {
			const targets = {
				directories: [
					{
						dir: join(root, "missing", "jobs"),
						match: (name: string) => name.endsWith(".json"),
					},
				],
				filePaths: [join(root, "missing", "market.json")],
			};
			const emptyRun = collect();
			const inactiveRun = collect();

			const emptyExitCode = await executeCleanCommand(
				{ clean: true },
				targets,
				emptyRun.output,
			);
			const inactiveExitCode = await executeCleanCommand(
				{},
				targets,
				inactiveRun.output,
			);

			expect(emptyExitCode).toBe(0);
			expect(emptyRun.stdout()).toBe("Clean: no generated files to remove.\n");
			expect(inactiveExitCode).toBeNull();
			expect(inactiveRun.stdout()).toBe("");
		} finally {
			await rm(root, { force: true, recursive: true });
		}
	});
});
