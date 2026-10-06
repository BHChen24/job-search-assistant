import type { AgentTool } from "@earendil-works/pi-agent-core";
import { type Resume, resumeSchema } from "../../../schemas/resume.js";
import { toToolParameters } from "../../../tools/schema-bridge.js";

export const SUBMIT_RESUME_TOOL_NAME = "submit_resume";

export interface SubmittedResumeSink {
	readonly recordSubmission: (resume: Resume) => void;
}

export const createSubmitResumeTool = (
	sink: SubmittedResumeSink,
): AgentTool => ({
	name: SUBMIT_RESUME_TOOL_NAME,
	label: "Submit Resume",
	description:
		"Submit the structured resume. Call this exactly once. Use empty arrays for sections the resume does not contain.",
	parameters: toToolParameters(resumeSchema),
	constrainedSampling: { type: "json_schema", strict: "require" },
	execute: async (_toolCallId, params) => {
		const parsed = resumeSchema.safeParse(params);
		if (!parsed.success) {
			const issues = parsed.error.issues
				.map((issue) => `${issue.path.join(".") || "(root)"}=${issue.code}`)
				.join(",");
			return {
				content: [
					{
						type: "text",
						text: `Submission rejected by schema validation [${issues}]. Correct those fields and call ${SUBMIT_RESUME_TOOL_NAME} again.`,
					},
				],
				details: {},
			};
		}
		sink.recordSubmission(parsed.data);
		return {
			content: [{ type: "text", text: "Submission accepted." }],
			details: {},
			terminate: true,
		};
	},
});
