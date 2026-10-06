import type { AgentTool } from "@earendil-works/pi-agent-core";
import { z } from "zod";
import {
	companyResearchSchema,
	jobPostingSchema,
} from "../../../schemas/job-posting.js";
import { toToolParameters } from "../../../tools/schema-bridge.js";

export const SUBMIT_POSTING_TOOL_NAME = "submit_posting";

export const submitPostingPayloadSchema = z
	.object({
		posting: jobPostingSchema.describe(
			"Structured extraction of the job posting itself.",
		),
		research: companyResearchSchema.describe(
			"Company research grounded only in web_search evidence returned in this conversation.",
		),
	})
	.strict()
	.readonly()
	.describe("Final structured result for one job posting.");

export type SubmitPostingPayload = z.infer<typeof submitPostingPayloadSchema>;

export interface SubmittedPostingSink {
	readonly recordSubmission: (payload: SubmitPostingPayload) => void;
}

export const createSubmitPostingTool = (
	sink: SubmittedPostingSink,
): AgentTool => ({
	name: SUBMIT_POSTING_TOOL_NAME,
	label: "Submit Posting",
	description:
		"Submit the final structured posting and company research. Call this exactly once, after any research is complete. Use null for fields the posting does not state.",
	parameters: toToolParameters(submitPostingPayloadSchema),
	constrainedSampling: { type: "json_schema", strict: "require" },
	execute: async (_toolCallId, params) => {
		const parsed = submitPostingPayloadSchema.safeParse(params);
		if (!parsed.success) {
			const issues = parsed.error.issues
				.map((issue) => `${issue.path.join(".") || "(root)"}=${issue.code}`)
				.join(",");
			return {
				content: [
					{
						type: "text",
						text: `Submission rejected by schema validation [${issues}]. Correct those fields and call ${SUBMIT_POSTING_TOOL_NAME} again.`,
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
