import { readFile } from "node:fs/promises";
import {
	Agent,
	type AgentTool,
	type StreamFn,
} from "@earendil-works/pi-agent-core";
import type { Api, Model } from "@earendil-works/pi-ai";
import { describeAgentRun, runAgentBounded } from "../../run-agent.js";
import type { Resume, ResumeRecord } from "../../schemas/resume.js";
import { resumeRecordSchema } from "../../schemas/resume.js";
import type { PdfExtractionResult } from "../../tools/pdf-extractor.js";
import { withToolLoggingAll } from "../../tools/tool-logging.js";
import type {
	loadCachedResume,
	ResumeInput,
	writeResumeRecordSafe,
} from "./gap-store.js";
import { createSubmitResumeTool } from "./tools/submit-resume-tool.js";

export interface ExtractResumeLogger {
	debug(message: string): void;
}

export interface ExtractResumeDependencies {
	readonly extractPdf: (path: string) => Promise<PdfExtractionResult>;
	readonly loadCachedResume: typeof loadCachedResume;
	readonly writeResumeRecordSafe: typeof writeResumeRecordSafe;
	readonly model: Model<Api>;
	readonly streamFn: StreamFn;
	readonly now: () => Date;
	readonly logger: ExtractResumeLogger;
}

export type ExtractResumeResult =
	| { readonly kind: "cached"; readonly record: ResumeRecord }
	| { readonly kind: "persisted"; readonly record: ResumeRecord }
	| {
			readonly kind: "failure";
			readonly code: "pdf" | "no-submission" | "turn-limit" | "provider";
			readonly message: string;
	  };

export const extractResume = async (
	input: ResumeInput,
	outputPath: string,
	dependencies: ExtractResumeDependencies,
): Promise<ExtractResumeResult> => {
	const cached = await dependencies.loadCachedResume(outputPath, input);
	if (cached.kind === "hit") {
		return { kind: "cached", record: cached.value };
	}

	const pdf = await dependencies.extractPdf(input.path);
	if (pdf.kind === "failure") {
		return { kind: "failure", code: "pdf", message: pdf.message };
	}

	const systemPrompt = await readFile(
		new URL("../../prompts/gap/extract-resume-system.md", import.meta.url),
		"utf8",
	);

	let submission: Resume | null = null;
	const readSubmission = (): Resume | null => submission;
	const tools: AgentTool[] = withToolLoggingAll(
		[
			createSubmitResumeTool({
				recordSubmission: (resume) => {
					submission = resume;
				},
			}),
		],
		dependencies.logger,
		"gap.resume",
	);

	const agent = new Agent({
		streamFn: dependencies.streamFn,
		initialState: { model: dependencies.model, systemPrompt, tools },
	});

	const outcome = await runAgentBounded(agent, {
		prompt: `Resume text (untrusted personal data):\n${pdf.value.text}`,
		hasResult: () => readSubmission() !== null,
		onStart: (chars) =>
			dependencies.logger.debug(
				`gap.resume request sent promptChars=${chars}; awaiting model`,
			),
	});

	const resume = readSubmission();
	dependencies.logger.debug(
		describeAgentRun("gap.resume.agent", outcome, resume !== null),
	);

	if (resume === null) {
		return {
			kind: "failure",
			code: outcome.turnLimitHit
				? "turn-limit"
				: outcome.errorMessage === undefined
					? "no-submission"
					: "provider",
			message:
				"Structured resume extraction failed; no resume JSON was written.",
		};
	}

	const record = resumeRecordSchema.parse({
		schemaVersion: 1,
		source: {
			fileName: input.fileName,
			fingerprint: input.fingerprint,
			extractedAt: dependencies.now().toISOString(),
		},
		resume,
	});
	await dependencies.writeResumeRecordSafe(outputPath, record);
	return { kind: "persisted", record };
};
