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
			const jobsDataDir = join(root, "data", "jobs");
			const rawInputDir = join(root, "raw_data", "jobs");
			await mkdir(jobsDataDir, { recursive: true });
			await mkdir(rawInputDir, { recursive: true });
			const analysisDir = join(root, "data", "analysis");
			const resumeDir = join(root, "data", "resume");
			const analysisPath = join(analysisDir, "market.json");
			const gapPath = join(analysisDir, "gap-analysis.json");
			const reportsDir = join(root, "reports");
			const reportPath = join(reportsDir, "market.md");
			const gapReportPath = join(reportsDir, "gap-analysis.md");
			const applicationHtmlPath = join(reportsDir, "application-report.html");
			const applicationArchivePath = join(
				reportsDir,
				"application-acme-dev-20260807-221500.html",
			);
			await mkdir(analysisDir, { recursive: true });
			await mkdir(resumeDir, { recursive: true });
			await mkdir(join(root, "reports"), { recursive: true });
			await writeFile(join(jobsDataDir, "role-1.json"), "{}");
			await writeFile(join(jobsDataDir, "role-2.json"), "{}");
			await writeFile(join(jobsDataDir, ".gitkeep"), "");
			await writeFile(analysisPath, "{}");
			await writeFile(gapPath, "{}");
			await writeFile(join(analysisDir, "application-acme-dev.json"), "{}");
			await writeFile(join(analysisDir, "application-globex-sre.json"), "{}");
			await writeFile(reportPath, "# report");
			await writeFile(gapReportPath, "# gap");
			await writeFile(applicationHtmlPath, "<!doctype html>");
			await writeFile(applicationArchivePath, "<!doctype html>");
			await writeFile(join(resumeDir, "resume.json"), "{}");
			await writeFile(join(rawInputDir, "private.pdf"), "private bytes");
			const io = collect();

			const exitCode = await executeCleanCommand(
				{ clean: true },
				{
					directories: [
						{ dir: jobsDataDir, match: (name) => name.endsWith(".json") },
						{
							dir: analysisDir,
							match: (name) =>
								name.startsWith("application-") && name.endsWith(".json"),
						},
						{
							dir: reportsDir,
							match: (name) =>
								name.startsWith("application-") && name.endsWith(".html"),
						},
					],
					filePaths: [
						analysisPath,
						reportPath,
						gapPath,
						gapReportPath,
						applicationHtmlPath,
					],
				},
				io.output,
			);

			expect(exitCode).toBe(0);
			expect(io.stdout()).toBe("Clean: removed 10 generated file(s).\n");
			expect(io.stderr()).toBe("");
			expect(await readdir(jobsDataDir)).toEqual([".gitkeep"]);
			expect(await readdir(analysisDir)).toEqual([]);
			expect(await readdir(join(root, "reports"))).toEqual([]);
			expect(await readdir(resumeDir)).toEqual(["resume.json"]);
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
