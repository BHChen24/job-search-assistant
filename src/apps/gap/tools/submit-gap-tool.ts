import type { AgentTool } from "@earendil-works/pi-agent-core";
import {
	type GapAnalysisPayload,
	gapAnalysisPayloadSchema,
} from "../../../schemas/gap-analysis.js";
import { toToolParameters } from "../../../tools/schema-bridge.js";

export const SUBMIT_GAP_TOOL_NAME = "submit_gap_analysis";

export interface SubmittedGapSink {
	readonly recordSubmission: (payload: GapAnalysisPayload) => void;
}

export const createSubmitGapTool = (sink: SubmittedGapSink): AgentTool => ({
	name: SUBMIT_GAP_TOOL_NAME,
	label: "Submit Gap Analysis",
	description:
		"Submit the final gap analysis. Call this exactly once, after any research is complete.",
	parameters: toToolParameters(gapAnalysisPayloadSchema),
	constrainedSampling: { type: "json_schema", strict: "require" },
	execute: async (_toolCallId, params) => {
		const parsed = gapAnalysisPayloadSchema.safeParse(params);
		if (!parsed.success) {
			const issues = parsed.error.issues
				.map((issue) => `${issue.path.join(".") || "(root)"}=${issue.code}`)
				.join(",");
			return {
				content: [
					{
						type: "text",
						text: `Submission rejected by schema validation [${issues}]. Correct those fields and call ${SUBMIT_GAP_TOOL_NAME} again.`,
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
