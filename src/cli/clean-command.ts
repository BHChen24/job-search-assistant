import { readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import type { Command } from "commander";

export type CleanCommandOptions = {
	readonly clean?: boolean;
};

export type CleanDirectory = {
	readonly dir: string;
	readonly match: (fileName: string) => boolean;
};

export type CleanTargets = {
	readonly directories: readonly CleanDirectory[];
	readonly filePaths: readonly string[];
};

export type CleanCommandOutput = {
	readonly writeOut: (text: string) => void;
	readonly writeErr: (text: string) => void;
};

export const registerCleanCommand = (program: Command): void => {
	program.option(
		"--clean",
		"Delete every generated record, analysis, and report before any other work",
	);
};

const isMissingFile = (error: unknown): boolean =>
	error instanceof Error && "code" in error && error.code === "ENOENT";

const removeFile = async (path: string): Promise<boolean> => {
	try {
		await rm(path);
		return true;
	} catch (error: unknown) {
		if (isMissingFile(error)) {
			return false;
		}
		throw error;
	}
};

const generatedPathsIn = async ({
	dir,
	match,
}: CleanDirectory): Promise<readonly string[]> => {
	try {
		const entries = await readdir(dir, { withFileTypes: true });
		return entries
			.filter((entry) => entry.isFile() && match(entry.name))
			.map((entry) => join(dir, entry.name));
	} catch (error: unknown) {
		if (isMissingFile(error)) {
			return [];
		}
		throw error;
	}
};

export const executeCleanCommand = async (
	options: CleanCommandOptions,
	targets: CleanTargets,
	output: CleanCommandOutput,
): Promise<0 | 1 | null> => {
	if (options.clean !== true) {
		return null;
	}

	try {
		const discovered = await Promise.all(
			targets.directories.map((directory) => generatedPathsIn(directory)),
		);
		const candidates = [...discovered.flat(), ...targets.filePaths];
		let removed = 0;
		for (const path of candidates) {
			if (await removeFile(path)) {
				removed += 1;
			}
		}
		output.writeOut(
			removed === 0
				? "Clean: no generated files to remove.\n"
				: `Clean: removed ${removed} generated file(s).\n`,
		);
		return 0;
	} catch (error: unknown) {
		if (!(error instanceof Error)) {
			throw error;
		}
		output.writeErr(
			"Clean failed: generated outputs could not be removed; check file permissions.\n",
		);
		return 1;
	}
};
