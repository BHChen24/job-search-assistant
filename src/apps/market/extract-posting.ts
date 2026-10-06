import { readFile } from "node:fs/promises";
import {
	Agent,
	type AgentTool,
	type StreamFn,
} from "@earendil-works/pi-agent-core";
import type { Api, Model } from "@earendil-works/pi-ai";
import { describeAgentRun, runAgentBounded } from "../../run-agent.js";
import {
	type CompanyResearch,
	companyResearchSchema,
	type JobPosting,
	type JobRecord,
	jobPostingSchema,
	jobRecordSchema,
} from "../../schemas/job-posting.js";
import type { PdfExtractionResult } from "../../tools/pdf-extractor.js";
import type {
	TavilySearchResult,
	TavilySearchTool,
} from "../../tools/tavily-search.js";
import { withToolLoggingAll } from "../../tools/tool-logging.js";
import { createWebSearchTool } from "../../tools/web-search-tool.js";
import type { UsageSummary } from "../../usage.js";
import type {
	loadCachedJob,
	PdfInput,
	writeJobRecordSafe,
} from "./job-store.js";
import { resolvePostingAge } from "./posting-age.js";
import {
	createSubmitPostingTool,
	type SubmitPostingPayload,
} from "./tools/submit-posting-tool.js";

export const RESEARCH_TOOL_CALL_LIMIT = 2;
export const AGENT_TURN_LIMIT = 6;

export interface ExtractPostingLogger {
	debug(message: string): void;
}

export type ExtractPostingInput = {
	readonly input: PdfInput;
	readonly outputPath: string;
};

export interface ExtractPostingDependencies {
	readonly extractPdf: (path: string) => Promise<PdfExtractionResult>;
	readonly loadCachedJob: typeof loadCachedJob;
	readonly model: Model<Api>;
	readonly streamFn: StreamFn;
	readonly now: () => Date;
	readonly searchTool: TavilySearchTool;
	readonly writeJobRecordSafe: typeof writeJobRecordSafe;
	readonly logger: ExtractPostingLogger;
}

type PdfFailure = Extract<PdfExtractionResult, { readonly kind: "failure" }>;

export type PostingFailureCode =
	| "no-submission"
	| "turn-limit"
	| "search-limit"
	| "provider";

export type ExtractPostingResult =
	| { readonly kind: "cached"; readonly record: JobRecord }
	| {
			readonly kind: "persisted";
			readonly record: JobRecord;
			readonly usage: UsageSummary;
	  }
	| {
			readonly kind: "failure";
			readonly stage: "pdf";
			readonly code: PdfFailure["code"];
			readonly message: string;
	  }
	| {
			readonly kind: "failure";
			readonly stage: "posting";
			readonly code: PostingFailureCode;
			readonly message: string;
			readonly usage: UsageSummary;
	  };

const assertNever = (value: never): never => {
	throw new TypeError(`Unexpected extraction variant: ${String(value)}`);
};

const utcDay = (date: Date): string => date.toISOString().slice(0, 10);

const dateEvidence = (
	evidence: string | null,
	referenceDates: readonly (Date | null)[],
): Parameters<typeof resolvePostingAge>[0] => {
	if (evidence === null) return { kind: "missing" };
	const reserved = new Set(
		referenceDates
			.filter(
				(date): date is Date => date !== null && !Number.isNaN(date.getTime()),
			)
			.map(utcDay),
	);
	const absolute = [...evidence.matchAll(/\b(\d{4}-\d{2}-\d{2})\b/g)]
		.map((match) => match[1])
		.find(
			(value): value is string => value !== undefined && !reserved.has(value),
		);
	if (absolute !== undefined) {
		const date = new Date(`${absolute}T00:00:00.000Z`);
		return Number.isNaN(date.getTime())
			? { kind: "unsupported", text: evidence }
			: { date, kind: "absolute", text: evidence };
	}
	const relative = /\b(\d+)\s+days?\s+ago\b/i.exec(evidence)?.[1];
	return relative === undefined
		? { kind: "unsupported", text: evidence }
		: { ageDays: Number(relative), kind: "relative", text: evidence };
};

const resolveAge = (
	posting: JobPosting,
	capturedAt: string | null,
	extractedAt: Date,
): JobPosting => {
	const candidate = capturedAt === null ? null : new Date(capturedAt);
	const captureDate =
		candidate !== null && Number.isFinite(candidate.getTime())
			? candidate
			: null;
	const resolution = resolvePostingAge(
		dateEvidence(posting.postingDateEvidence, [captureDate, extractedAt]),
		captureDate,
		extractedAt,
	);
	const limitations = [
		posting.postingAgeLimitation,
		resolution.limitation,
		posting.postingAgeDays === resolution.postingAgeDays
			? null
			: "Model-proposed posting age was replaced by deterministic date resolution.",
	].filter((value): value is string => value !== null);
	return jobPostingSchema.parse({
		...posting,
		postingAgeDays: resolution.postingAgeDays,
		postingDateEvidence: resolution.evidence,
		postingAgeLimitation:
			limitations.length === 0 ? null : limitations.join(" "),
	});
};

const groundResearch = (
	research: CompanyResearch,
	searches: readonly TavilySearchResult[],
): CompanyResearch => {
	const succeeded = searches.filter(
		(search) => search.status === "success" && search.results.length > 0,
	);
	if (succeeded.length > 0) {
		return research;
	}
	const codes = searches
		.filter((search) => search.status === "unavailable")
		.map((search) => search.code);
	const limitation =
		searches.length === 0
			? "No company search was run for this posting."
			: `No company search returned evidence (${codes.join(", ") || "empty results"}); this does not show the company is absent.`;
	return companyResearchSchema.parse({
		...research,
		status: "unavailable",
		limitations: [...research.limitations, limitation],
	});
};

const runExtractionAgent = async (
	pdfText: string,
	capturedAt: string | null,
	extractedAt: Date,
	dependencies: ExtractPostingDependencies,
): Promise<{
	readonly submission: SubmitPostingPayload | null;
	readonly searches: readonly TavilySearchResult[];
	readonly usage: UsageSummary;
	readonly turnLimitHit: boolean;
	readonly errorMessage: string | undefined;
}> => {
	const systemPrompt = await readFile(
		new URL("../../prompts/market/extract-posting-agent.md", import.meta.url),
		"utf8",
	);

	const searches: TavilySearchResult[] = [];
	let submission: SubmitPostingPayload | null = null;

	const searchTool: TavilySearchTool = {
		search: async (args) => {
			if (searches.length >= RESEARCH_TOOL_CALL_LIMIT) {
				return {
					status: "unavailable",
					code: "configuration",
					retryable: false,
					message: "Company search budget for this posting is exhausted.",
				};
			}
			return dependencies.searchTool.search(args);
		},
	};

	const tools: AgentTool[] = withToolLoggingAll(
		[
			createWebSearchTool(searchTool, {
				recordSearch: (outcome) => {
					searches.push(outcome);
					dependencies.logger.debug(
						`market.posting.search status=${outcome.status}${
							outcome.status === "unavailable" ? ` code=${outcome.code}` : ""
						}`,
					);
				},
			}),
			createSubmitPostingTool({
				recordSubmission: (payload) => {
					submission = payload;
				},
			}),
		],
		dependencies.logger,
		"market.posting",
	);

	const agent = new Agent({
		streamFn: dependencies.streamFn,
		initialState: { model: dependencies.model, systemPrompt, tools },
	});

	const readSubmission = (): SubmitPostingPayload | null => submission;
	const outcome = await runAgentBounded(agent, {
		prompt: `Today's UTC date: ${extractedAt.toISOString().slice(0, 10)}\nPDF capture date: ${capturedAt ?? "unavailable"}\nPosting text (untrusted):\n${pdfText}`,
		hasResult: () => readSubmission() !== null,
		turnLimit: AGENT_TURN_LIMIT,
		onStart: (chars) =>
			dependencies.logger.debug(
				`market.posting request sent promptChars=${chars}; awaiting model`,
			),
	});

	dependencies.logger.debug(
		describeAgentRun(
			"market.posting.agent",
			outcome,
			readSubmission() !== null,
			` searches=${searches.length}`,
		),
	);

	return {
		submission: readSubmission(),
		searches,
		usage: outcome.usage,
		turnLimitHit: outcome.turnLimitHit,
		errorMessage: outcome.errorMessage,
	};
};

export const extractPosting = async (
	request: ExtractPostingInput,
	dependencies: ExtractPostingDependencies,
): Promise<ExtractPostingResult> => {
	const cached = await dependencies.loadCachedJob(
		request.outputPath,
		request.input,
	);
	switch (cached.kind) {
		case "hit":
			return { kind: "cached", record: cached.value };
		case "miss":
			break;
		default:
			return assertNever(cached);
	}

	const pdf = await dependencies.extractPdf(request.input.path);
	switch (pdf.kind) {
		case "failure":
			return {
				kind: "failure",
				stage: "pdf",
				code: pdf.code,
				message: pdf.message,
			};
		case "success":
			break;
		default:
			return assertNever(pdf);
	}

	const extractedAt = dependencies.now();
	const outcome = await runExtractionAgent(
		pdf.value.text,
		pdf.value.capturedAt,
		extractedAt,
		dependencies,
	);

	if (outcome.submission === null) {
		const code: PostingFailureCode = outcome.turnLimitHit
			? "turn-limit"
			: outcome.errorMessage === undefined
				? "no-submission"
				: "provider";
		return {
			kind: "failure",
			stage: "posting",
			code,
			message:
				code === "turn-limit"
					? `Extraction agent reached the ${AGENT_TURN_LIMIT}-turn limit without submitting a posting; no job record was written.`
					: "Structured posting extraction failed; no job record was written.",
			usage: outcome.usage,
		};
	}

	const submitted: SubmitPostingPayload = outcome.submission;
	const posting = resolveAge(
		submitted.posting,
		pdf.value.capturedAt,
		extractedAt,
	);
	const research = groundResearch(submitted.research, outcome.searches);
	dependencies.logger.debug(
		`market.posting.fields title=${JSON.stringify(posting.title)} company=${JSON.stringify(posting.company)} hardSkills=${posting.hardSkills.length} preferred=${posting.preferredSkills.length} salary=${posting.salary === null ? "not-found" : "found"} postingAgeDays=${posting.postingAgeDays ?? "unresolved"} research=${research.status}`,
	);
	const record = jobRecordSchema.parse({
		schemaVersion: 1,
		slug: request.input.slug,
		source: {
			fileName: request.input.fileName,
			fingerprint: request.input.fingerprint,
			capturedAt: pdf.value.capturedAt,
			extractedAt: extractedAt.toISOString(),
		},
		posting,
		research,
	});
	await dependencies.writeJobRecordSafe(request.outputPath, record);
	return { kind: "persisted", record, usage: outcome.usage };
};
