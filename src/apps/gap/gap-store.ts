import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { writeFileSafe, writeJsonSafe } from "../../file-store.js";
import {
	type GapAnalysis,
	gapAnalysisSchema,
} from "../../schemas/gap-analysis.js";
import { type ResumeRecord, resumeRecordSchema } from "../../schemas/resume.js";
import { fingerprintPdf } from "../../tools/source-id.js";

export type ResumeInput = {
	readonly path: string;
	readonly fileName: string;
	readonly fingerprint: string;
};

export type ResumeDiscovery =
	| { readonly kind: "found"; readonly input: ResumeInput }
	| { readonly kind: "missing" }
	| { readonly kind: "ambiguous"; readonly fileNames: readonly string[] };

const isMissingFile = (error: unknown): boolean =>
	error instanceof Error && "code" in error && error.code === "ENOENT";

export const discoverResumeInput = async (
	inputDir: string,
): Promise<ResumeDiscovery> => {
	let entries: readonly string[];
	try {
		entries = (await readdir(inputDir, { withFileTypes: true }))
			.filter((entry) => entry.isFile() && /\.pdf$/i.test(entry.name))
			.map((entry) => entry.name)
			.sort();
	} catch (error: unknown) {
		if (isMissingFile(error)) {
			return { kind: "missing" };
		}
		throw error;
	}

	const [fileName] = entries;
	if (fileName === undefined) {
		return { kind: "missing" };
	}
	if (entries.length > 1) {
		return { kind: "ambiguous", fileNames: entries };
	}

	const path = join(inputDir, fileName);
	return {
		kind: "found",
		input: {
			path,
			fileName,
			fingerprint: fingerprintPdf(await readFile(path)),
		},
	};
};

export type ResumeCacheResult =
	| { readonly kind: "hit"; readonly value: ResumeRecord }
	| { readonly kind: "miss" };

export const loadCachedResume = async (
	path: string,
	expected: Pick<ResumeInput, "fileName" | "fingerprint">,
): Promise<ResumeCacheResult> => {
	let raw: string;
	try {
		raw = await readFile(path, "utf8");
	} catch (error: unknown) {
		if (isMissingFile(error)) {
			return { kind: "miss" };
		}
		throw error;
	}

	let parsedJson: unknown;
	try {
		parsedJson = JSON.parse(raw);
	} catch {
		return { kind: "miss" };
	}

	const parsed = resumeRecordSchema.safeParse(parsedJson);
	if (!parsed.success) {
		return { kind: "miss" };
	}
	if (
		parsed.data.source.fingerprint !== expected.fingerprint ||
		parsed.data.source.fileName !== expected.fileName
	) {
		return { kind: "miss" };
	}
	return { kind: "hit", value: parsed.data };
};

export const writeResumeRecordSafe = async (
	path: string,
	record: unknown,
): Promise<void> => {
	await writeJsonSafe(path, resumeRecordSchema.parse(record));
};

export const writeGapAnalysisSafe = async (
	path: string,
	analysis: unknown,
): Promise<void> => {
	await writeJsonSafe(path, gapAnalysisSchema.parse(analysis));
};

export const writeGapReportSafe = async (
	path: string,
	report: string,
): Promise<void> => {
	await writeFileSafe(path, report);
};

export type MarketAnalysisLoad =
	| { readonly kind: "loaded"; readonly value: unknown }
	| { readonly kind: "missing" }
	| { readonly kind: "invalid" };

export const loadMarketAnalysisForGap = async (
	path: string,
): Promise<MarketAnalysisLoad> => {
	let raw: string;
	try {
		raw = await readFile(path, "utf8");
	} catch (error: unknown) {
		if (isMissingFile(error)) {
			return { kind: "missing" };
		}
		throw error;
	}
	try {
		return { kind: "loaded", value: JSON.parse(raw) };
	} catch {
		return { kind: "invalid" };
	}
};

export type { GapAnalysis };
