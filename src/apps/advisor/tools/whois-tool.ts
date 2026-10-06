import type { AgentTool } from "@earendil-works/pi-agent-core";
import { whoisArgsSchema } from "../../../schemas/whois.js";
import { toToolParameters } from "../../../tools/schema-bridge.js";
import type { WhoisLookupResult, WhoisTool } from "../../../tools/whois.js";

export const WHOIS_TOOL_NAME = "whois_lookup";

export interface WhoisEvidenceSink {
	readonly recordLookup: (outcome: WhoisLookupResult) => void;
}

export const createWhoisAgentTool = (
	whois: WhoisTool,
	sink: WhoisEvidenceSink,
): AgentTool => ({
	name: WHOIS_TOOL_NAME,
	label: "WHOIS Lookup",
	description:
		"Look up domain registration data. The registration date is the most reliable signal. Redacted registrant details are normal privacy practice, not evidence of fraud, and a failed lookup never proves a company is fake.",
	parameters: toToolParameters(whoisArgsSchema),
	constrainedSampling: { type: "json_schema", strict: "require" },
	execute: async (_toolCallId, params) => {
		const outcome = await whois.lookup(params);
		sink.recordLookup(outcome);
		if (outcome.status === "unavailable") {
			return {
				content: [
					{
						type: "text",
						text: `WHOIS unavailable (${outcome.code}). ${outcome.message} Record this as a limitation rather than inferring anything.`,
					},
				],
				details: {},
			};
		}
		return {
			content: [
				{
					type: "text",
					text: `<whois_record>${JSON.stringify(outcome.registration)}</whois_record>`,
				},
			],
			details: {},
		};
	},
});
