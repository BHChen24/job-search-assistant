import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE_DIR = dirname(fileURLToPath(import.meta.url));

export const PROJECT_ROOT = resolve(SOURCE_DIR, "..");

export const INPUT_DIR = resolve(PROJECT_ROOT, "input");
export const DEFAULT_JOBS_INPUT_DIR = resolve(INPUT_DIR, "postings");
export const DEFAULT_RESUME_INPUT_DIR = resolve(INPUT_DIR, "resume");

export const OUTPUT_DIR = resolve(PROJECT_ROOT, "output");
const CACHE_DIR = resolve(OUTPUT_DIR, "cache");
export const JOBS_DATA_DIR = resolve(CACHE_DIR, "postings");
export const RESUME_JSON_PATH = resolve(CACHE_DIR, "resume.json");

const MARKET_DIR = resolve(OUTPUT_DIR, "market");
export const MARKET_ANALYSIS_JSON_PATH = resolve(MARKET_DIR, "analysis.json");
export const MARKET_REPORT_PATH = resolve(MARKET_DIR, "report.md");

const GAP_DIR = resolve(OUTPUT_DIR, "gap");
export const GAP_ANALYSIS_JSON_PATH = resolve(GAP_DIR, "analysis.json");
export const GAP_REPORT_PATH = resolve(GAP_DIR, "report.md");

export const ADVISOR_DIR = resolve(OUTPUT_DIR, "advisor");
export const APPLICATION_REPORT_PATH = resolve(ADVISOR_DIR, "latest.html");

export const runStamp = (at: Date): string =>
	at.toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);

export const applicationHtmlPath = (slug: string, stamp: string): string =>
	resolve(ADVISOR_DIR, `${slug}-${stamp}.html`);

export const applicationJsonPath = (slug: string, stamp: string): string =>
	resolve(ADVISOR_DIR, `${slug}-${stamp}.json`);
