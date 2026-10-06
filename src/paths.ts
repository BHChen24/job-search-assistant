import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE_DIR = dirname(fileURLToPath(import.meta.url));

export const PROJECT_ROOT = resolve(SOURCE_DIR, "..");
export const DEFAULT_JOBS_INPUT_DIR = resolve(PROJECT_ROOT, "raw_data/jobs");
export const JOBS_DATA_DIR = resolve(PROJECT_ROOT, "data/jobs");
export const ANALYSIS_DATA_DIR = resolve(PROJECT_ROOT, "data/analysis");
export const MARKET_ANALYSIS_JSON_PATH = resolve(
	ANALYSIS_DATA_DIR,
	"market-analysis.json",
);
export const MARKET_REPORT_PATH = resolve(
	PROJECT_ROOT,
	"reports/market-analysis.md",
);
export const DEFAULT_RESUME_INPUT_DIR = resolve(
	PROJECT_ROOT,
	"raw_data/resume",
);
export const RESUME_DATA_DIR = resolve(PROJECT_ROOT, "data/resume");
export const RESUME_JSON_PATH = resolve(RESUME_DATA_DIR, "resume.json");
export const GAP_ANALYSIS_JSON_PATH = resolve(
	ANALYSIS_DATA_DIR,
	"gap-analysis.json",
);
export const GAP_REPORT_PATH = resolve(PROJECT_ROOT, "reports/gap-analysis.md");
export const REPORTS_DIR = resolve(PROJECT_ROOT, "reports");
export const APPLICATION_REPORT_PATH = resolve(
	REPORTS_DIR,
	"application-report.html",
);

export const runStamp = (at: Date): string =>
	at.toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);

export const applicationHtmlPath = (slug: string, stamp: string): string =>
	resolve(REPORTS_DIR, `application-${slug}-${stamp}.html`);

export const applicationJsonPath = (slug: string, stamp: string): string =>
	resolve(ANALYSIS_DATA_DIR, `application-${slug}-${stamp}.json`);
