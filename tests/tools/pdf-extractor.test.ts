import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { InvalidPDFException } from "pdf-parse";
import { describe, expect, it } from "vitest";

import {
	extractPdfDocument,
	type PdfParser,
	type PdfParserFactory,
} from "../../src/tools/pdf-extractor.js";

const TEXT_LIMIT = 100_000;

type FakeParserState = {
	destroyed: boolean;
};

const withPdfFixture = async <T>(
	run: (path: string) => Promise<T>,
): Promise<T> => {
	const root = await mkdtemp(join(tmpdir(), "pdf-extractor-"));
	try {
		const path = join(root, "posting.pdf");
		await writeFile(path, "%PDF-1.7 fixture");
		return await run(path);
	} finally {
		await rm(root, { force: true, recursive: true });
	}
};

const createFactory = (
	createParser: (state: FakeParserState) => PdfParser,
): {
	readonly factory: PdfParserFactory;
	readonly states: FakeParserState[];
} => {
	const states: FakeParserState[] = [];
	return {
		factory: {
			create: () => {
				const state = { destroyed: false };
				states.push(state);
				return createParser(state);
			},
		},
		states,
	};
};

describe("PDF extractor", () => {
	it("Given text and a valid creation date, When extracted, Then bounded document data is returned and the parser is destroyed", async () => {
		await withPdfFixture(async (path) => {
			const { factory, states } = createFactory((state) => ({
				destroy: async () => {
					state.destroyed = true;
				},
				getInfo: async () => ({
					getDateNode: () => ({
						CreationDate: new Date("2026-07-30T14:15:00.000Z"),
						ModDate: new Date("2026-08-01T00:00:00.000Z"),
					}),
					total: 2,
				}),
				getText: async () => ({ text: "Role\0 details", total: 2 }),
			}));

			const result = await extractPdfDocument(path, factory, {
				maxCharacters: TEXT_LIMIT,
			});

			expect(result).toEqual({
				kind: "success",
				value: {
					capturedAt: "2026-07-30T14:15:00.000Z",
					characterCount: 12,
					pageCount: 2,
					text: "Role details",
					truncated: false,
				},
			});
			expect(states).toEqual([{ destroyed: true }]);
		});
	});

	it("Given text over the hard limit and an invalid creation date, When extracted, Then text is capped and original metadata is retained", async () => {
		await withPdfFixture(async (path) => {
			const sourceText = "x".repeat(TEXT_LIMIT + 7);
			const { factory, states } = createFactory((state) => ({
				destroy: async () => {
					state.destroyed = true;
				},
				getInfo: async () => ({
					getDateNode: () => ({
						CreationDate: new Date(Number.NaN),
						ModDate: new Date("2026-07-29T10:00:00.000Z"),
					}),
					total: 4,
				}),
				getText: async () => ({ text: sourceText, total: 4 }),
			}));

			const result = await extractPdfDocument(path, factory, {
				maxCharacters: TEXT_LIMIT + 50,
			});

			expect(result).toEqual({
				kind: "success",
				value: {
					capturedAt: "2026-07-29T10:00:00.000Z",
					characterCount: TEXT_LIMIT + 7,
					pageCount: 4,
					text: "x".repeat(TEXT_LIMIT),
					truncated: true,
				},
			});
			expect(states).toEqual([{ destroyed: true }]);
		});
	});

	it("Given malformed and scan-only parser outcomes, When extracted, Then typed failures are returned and every parser is destroyed", async () => {
		await withPdfFixture(async (path) => {
			const malformed = createFactory((state) => ({
				destroy: async () => {
					state.destroyed = true;
				},
				getInfo: async () => ({ getDateNode: () => ({}), total: 0 }),
				getText: async () => {
					throw new InvalidPDFException("private source content omitted");
				},
			}));
			const empty = createFactory((state) => ({
				destroy: async () => {
					state.destroyed = true;
				},
				getInfo: async () => ({ getDateNode: () => ({}), total: 1 }),
				getText: async () => ({ text: "\0", total: 1 }),
			}));

			const malformedResult = await extractPdfDocument(
				path,
				malformed.factory,
				{
					maxCharacters: TEXT_LIMIT,
				},
			);
			const emptyResult = await extractPdfDocument(path, empty.factory, {
				maxCharacters: TEXT_LIMIT,
			});

			expect([malformedResult, emptyResult]).toEqual([
				{
					code: "invalid_pdf",
					kind: "failure",
					message: "The file is not a valid readable PDF.",
				},
				{
					code: "empty_text",
					kind: "failure",
					message: "The PDF contains no extractable text and may be scan-only.",
				},
			]);
			expect([...malformed.states, ...empty.states]).toEqual([
				{ destroyed: true },
				{ destroyed: true },
			]);
		});
	});
});
