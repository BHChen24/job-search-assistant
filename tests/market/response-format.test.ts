import { zodResponseFormat } from "openai/helpers/zod";
import { describe, expect, it } from "vitest";
import type { z } from "zod";
import { submitPostingPayloadSchema } from "../../src/apps/market/tools/submit-posting-tool.js";
import {
	applicationAdvicePayloadSchema,
	legitimacyAssessmentSchema,
} from "../../src/schemas/application.js";
import { gapAnalysisPayloadSchema } from "../../src/schemas/gap-analysis.js";
import {
	companyResearchSchema,
	jobPostingSchema,
} from "../../src/schemas/job-posting.js";
import { marketAnalysisSchema } from "../../src/schemas/market-analysis.js";
import { resumeSchema } from "../../src/schemas/resume.js";
import { whoisArgsSchema } from "../../src/schemas/whois.js";
import { toToolParameters } from "../../src/tools/schema-bridge.js";
import { webSearchToolArgsSchema } from "../../src/tools/web-search-tool.js";

const modelFacingSchemas: readonly (readonly [string, z.ZodType])[] = [
	["job_posting", jobPostingSchema],
	["company_research", companyResearchSchema],
	["market_analysis", marketAnalysisSchema],
	["submit_posting", submitPostingPayloadSchema],
	["web_search", webSearchToolArgsSchema],
	["resume", resumeSchema],
	["gap_analysis", gapAnalysisPayloadSchema],
	["legitimacy", legitimacyAssessmentSchema],
	["application_advice", applicationAdvicePayloadSchema],
	["whois_lookup", whoisArgsSchema],
];

describe("model-facing tool parameter schemas", () => {
	it.each(modelFacingSchemas)(
		"Given the %s schema, When tool parameters are built, Then strict constrained sampling is satisfiable",
		(_schemaName, schema) => {
			const parameters = toToolParameters(schema) as Record<string, unknown>;
			const properties = parameters.properties as Record<string, unknown>;

			expect(parameters.type).toBe("object");
			expect(parameters.additionalProperties).toBe(false);
			expect(Object.keys(properties).sort()).toEqual(
				[...(parameters.required as string[])].sort(),
			);
		},
	);

	it.each(modelFacingSchemas)(
		"Given the %s schema, When tool parameters are built, Then they match the provider-accepted response format exactly",
		(schemaName, schema) => {
			expect(toToolParameters(schema)).toEqual(
				zodResponseFormat(schema, schemaName).json_schema.schema,
			);
		},
	);
});
