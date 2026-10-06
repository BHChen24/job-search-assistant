import type { TSchema } from "@earendil-works/pi-ai";
import * as z from "zod";

const JSON_SCHEMA_TARGET = "draft-7" as const;
const SCHEMA_MAP_KEYWORDS = new Set(["properties", "$defs", "definitions"]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const normalizeUnions = (node: unknown): unknown => {
	if (Array.isArray(node)) {
		return node.map(normalizeUnions);
	}
	if (!isRecord(node)) {
		return node;
	}
	const normalized: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(node)) {
		if (SCHEMA_MAP_KEYWORDS.has(key) && isRecord(value)) {
			const children: Record<string, unknown> = {};
			for (const [name, child] of Object.entries(value)) {
				children[name] = normalizeUnions(child);
			}
			normalized[key] = children;
			continue;
		}
		normalized[key === "oneOf" ? "anyOf" : key] = normalizeUnions(value);
	}
	return normalized;
};

export const toToolParameters = (schema: z.ZodType): TSchema => {
	const normalized = normalizeUnions(
		z.toJSONSchema(schema, { io: "output", target: JSON_SCHEMA_TARGET }),
	);
	if (!isRecord(normalized) || normalized.type !== "object") {
		throw new TypeError(
			"Model-facing schemas must produce a JSON Schema object root.",
		);
	}
	return normalized;
};
