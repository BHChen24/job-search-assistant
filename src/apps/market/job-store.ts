import {
	mkdir,
	mkdtemp,
	readdir,
	readFile,
	rename,
	rm,
	writeFile,
} from "node:fs/promises";
import { basename, dirname, join, parse } from "node:path";

import { JOBS_DATA_DIR, MARKET_ANALYSIS_JSON_PATH } from "../../paths.js";
import { type JobRecord, jobRecordSchema } from "../../schemas/job-posting.js";
import {
	type MarketAnalysis,
	marketAnalysisSchema,
} from "../../schemas/market-analysis.js";
import { fingerprintPdf, resolveOutputSlug } from "../../tools/source-id.js";

export type PdfInput = {
	readonly path: string;
	readonly fileName: string;
	readonly slug: string;
	readonly fingerprint: string;
};

export type SourceExpectation = Pick<PdfInput, "fileName" | "fingerprint">;

export type CacheMissReason =
	| "missing"
	| "invalid_json"
	| "invalid_schema"
	| "fingerprint_mismatch"
	| "source_filename_mismatch"
	| "aggregate_fingerprint_mismatch";

export type CacheResult<T> =
	| { readonly kind: "hit"; readonly value: T }
	| { readonly kind: "miss"; readonly reason: CacheMissReason };

type JsonReadResult =
	| { readonly kind: "value"; readonly value: unknown }
	| {
			readonly kind: "miss";
			readonly reason: "missing" | "invalid_json";
	  };

const assertNever = (value: never): never => {
	throw new TypeError(`Unexpected cache result: ${String(value)}`);
};

const readJsonFile = async (path: string): Promise<JsonReadResult> => {
	try {
		const content = await readFile(path, "utf8");
		const value: unknown = JSON.parse(content);
		return { kind: "value", value };
	} catch (error: unknown) {
		if (error instanceof SyntaxError) {
			return { kind: "miss", reason: "invalid_json" };
		}
		if (error instanceof Error && "code" in error && error.code === "ENOENT") {
			return { kind: "miss", reason: "missing" };
		}
		throw error;
	}
};

const writeFileSafe = async (path: string, content: string): Promise<void> => {
	const destinationDirectory = dirname(path);
	await mkdir(destinationDirectory, { recursive: true });
	const temporaryDirectory = await mkdtemp(
		join(destinationDirectory, ".job-store-"),
	);
	const temporaryPath = join(temporaryDirectory, basename(path));

	try {
		await writeFile(temporaryPath, content, "utf8");
		await rename(temporaryPath, path);
	} finally {
		await rm(temporaryDirectory, { force: true, recursive: true });
	}
};

export const discoverPdfInputs = async (
	inputDir: string,
): Promise<readonly PdfInput[]> => {
	const entries = (await readdir(inputDir, { withFileTypes: true }))
		.filter((entry) => entry.isFile() && /\.pdf$/i.test(entry.name))
		.sort((left, right) => {
			if (left.name < right.name) {
				return -1;
			}
			if (left.name > right.name) {
				return 1;
			}
			return 0;
		});
	const occupiedSlugs = new Set<string>();
	const inputs: PdfInput[] = [];

	for (const entry of entries) {
		const path = join(inputDir, entry.name);
		const fingerprint = fingerprintPdf(await readFile(path));
		const slug = resolveOutputSlug(
			parse(entry.name).name,
			fingerprint,
			occupiedSlugs,
		);
		occupiedSlugs.add(slug);
		inputs.push({ path, fileName: entry.name, slug, fingerprint });
	}

	return inputs;
};

export const loadCachedJob = async (
	path: string,
	expectedSource: SourceExpectation,
): Promise<CacheResult<JobRecord>> => {
	const stored = await readJsonFile(path);
	switch (stored.kind) {
		case "miss":
			return stored;
		case "value": {
			const parsed = jobRecordSchema.safeParse(stored.value);
			if (!parsed.success) {
				return { kind: "miss", reason: "invalid_schema" };
			}
			if (parsed.data.source.fileName !== expectedSource.fileName) {
				return { kind: "miss", reason: "source_filename_mismatch" };
			}
			if (parsed.data.source.fingerprint !== expectedSource.fingerprint) {
				return { kind: "miss", reason: "fingerprint_mismatch" };
			}
			return { kind: "hit", value: parsed.data };
		}
		default:
			return assertNever(stored);
	}
};

export const writeJobRecordSafe = async (
	path: string,
	record: unknown,
): Promise<void> => {
	const validated = jobRecordSchema.parse(record);
	await writeFileSafe(path, `${JSON.stringify(validated, null, 2)}\n`);
};

export const loadCurrentJobRecords = async (
	inputs: readonly PdfInput[],
	dataDir: string = JOBS_DATA_DIR,
): Promise<readonly JobRecord[]> => {
	const records: JobRecord[] = [];
	for (const input of inputs) {
		const cached = await loadCachedJob(
			join(dataDir, `${input.slug}.json`),
			input,
		);
		switch (cached.kind) {
			case "hit":
				records.push(cached.value);
				break;
			case "miss":
				break;
			default:
				assertNever(cached);
		}
	}
	return records;
};

export const loadCachedMarketAnalysis = async (
	expectedAggregateFingerprint: string,
	path: string = MARKET_ANALYSIS_JSON_PATH,
): Promise<CacheResult<MarketAnalysis>> => {
	const stored = await readJsonFile(path);
	switch (stored.kind) {
		case "miss":
			return stored;
		case "value": {
			const parsed = marketAnalysisSchema.safeParse(stored.value);
			if (!parsed.success) {
				return { kind: "miss", reason: "invalid_schema" };
			}
			if (parsed.data.aggregateFingerprint !== expectedAggregateFingerprint) {
				return { kind: "miss", reason: "aggregate_fingerprint_mismatch" };
			}
			return { kind: "hit", value: parsed.data };
		}
		default:
			return assertNever(stored);
	}
};

export const writeMarketAnalysisSafe = async (
	path: string,
	analysis: unknown,
): Promise<void> => {
	const validated = marketAnalysisSchema.parse(analysis);
	await writeFileSafe(path, `${JSON.stringify(validated, null, 2)}\n`);
};

export const writeMarketReportSafe = async (
	path: string,
	report: string,
): Promise<void> => {
	await writeFileSafe(path, report);
};
