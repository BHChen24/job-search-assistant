import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { z } from "zod";
import {
	type ApplicationAdvicePayload,
	applicationAdvicePayloadSchema,
	type LegitimacyAssessment,
	legitimacyAssessmentSchema,
} from "../../../schemas/application.js";
import { toToolParameters } from "../../../tools/schema-bridge.js";

export const SUBMIT_LEGITIMACY_TOOL_NAME = "submit_legitimacy";
export const SUBMIT_ADVICE_TOOL_NAME = "submit_application_advice";

const createSubmitTool = <T>(
	name: string,
	label: string,
	description: string,
	schema: z.ZodType<T>,
	record: (value: T) => void,
): AgentTool => ({
	name,
	label,
	description,
	parameters: toToolParameters(schema),
	constrainedSampling: { type: "json_schema", strict: "require" },
	execute: async (_toolCallId, params) => {
		const parsed = schema.safeParse(params);
		if (!parsed.success) {
			const issues = parsed.error.issues
				.map((issue) => `${issue.path.join(".") || "(root)"}=${issue.code}`)
				.join(",");
			return {
				content: [
					{
						type: "text",
						text: `Submission rejected by schema validation [${issues}]. Correct those fields and call ${name} again.`,
					},
				],
				details: {},
			};
		}
		record(parsed.data);
		return {
			content: [{ type: "text", text: "Submission accepted." }],
			details: {},
			terminate: true,
		};
	},
});

export const createSubmitLegitimacyTool = (
	record: (value: LegitimacyAssessment) => void,
): AgentTool =>
	createSubmitTool(
		SUBMIT_LEGITIMACY_TOOL_NAME,
		"Submit Legitimacy Assessment",
		"Submit the final legitimacy verdict. Call this exactly once, after investigating.",
		legitimacyAssessmentSchema,
		record,
	);

export const createSubmitAdviceTool = (
	record: (value: ApplicationAdvicePayload) => void,
): AgentTool =>
	createSubmitTool(
		SUBMIT_ADVICE_TOOL_NAME,
		"Submit Application Advice",
		"Submit the final application advice. Call this exactly once.",
		applicationAdvicePayloadSchema,
		record,
	);
