import { readFile } from "node:fs/promises";
import {
	FormatError,
	InvalidPDFException,
	PasswordException,
	PDFParse,
} from "pdf-parse";

const PDF_TEXT_HARD_LIMIT = 100_000;

export type PdfDocumentData = {
	readonly capturedAt: string | null;
	readonly characterCount: number;
	readonly pageCount: number;
	readonly text: string;
	readonly truncated: boolean;
};

export type PdfExtractionResult =
	| { readonly kind: "success"; readonly value: PdfDocumentData }
	| {
			readonly kind: "failure";
			readonly code:
				| "missing_file"
				| "invalid_pdf"
				| "password_protected"
				| "format_error"
				| "empty_text"
				| "io_error";
			readonly message: string;
	  };

type PdfDateNode = {
	readonly CreationDate?: Date | null;
	readonly ModDate?: Date | null;
};

export interface PdfParser {
	readonly getText: () => Promise<{
		readonly text: string;
		readonly total: number;
	}>;
	readonly getInfo: () => Promise<{
		readonly total: number;
		readonly getDateNode: () => PdfDateNode;
	}>;
	readonly destroy: () => Promise<void>;
}

export interface PdfParserFactory {
	readonly create: (data: Uint8Array) => PdfParser;
}

export type PdfExtractionLimits = {
	readonly maxCharacters: number;
};

export const createPdfParseFactory = (): PdfParserFactory => ({
	create: (data) => new PDFParse({ data }),
});

const classifyFailure = (error: Error): PdfExtractionResult => {
	if (error instanceof InvalidPDFException) {
		return {
			code: "invalid_pdf",
			kind: "failure",
			message: "The file is not a valid readable PDF.",
		};
	}
	if (error instanceof PasswordException) {
		return {
			code: "password_protected",
			kind: "failure",
			message: "The PDF is password-protected and cannot be extracted.",
		};
	}
	if (error instanceof FormatError) {
		return {
			code: "format_error",
			kind: "failure",
			message: "The PDF structure is malformed or unsupported.",
		};
	}
	if ("code" in error && error.code === "ENOENT") {
		return {
			code: "missing_file",
			kind: "failure",
			message: "The PDF file does not exist.",
		};
	}
	return {
		code: "io_error",
		kind: "failure",
		message: "The PDF could not be read or extracted.",
	};
};

const validIsoDate = (date: Date | null | undefined): string | null =>
	date !== null && date !== undefined && Number.isFinite(date.getTime())
		? date.toISOString()
		: null;

export const extractPdfDocument = async (
	path: string,
	factory: PdfParserFactory,
	limits: PdfExtractionLimits,
): Promise<PdfExtractionResult> => {
	let bytes: Uint8Array;
	try {
		bytes = await readFile(path);
	} catch (error) {
		if (!(error instanceof Error)) {
			throw error;
		}
		return classifyFailure(error);
	}

	let parser: PdfParser;
	try {
		parser = factory.create(bytes);
	} catch (error) {
		if (!(error instanceof Error)) {
			throw error;
		}
		return classifyFailure(error);
	}

	try {
		const textResult = await parser.getText();
		const infoResult = await parser.getInfo();
		const normalizedText = textResult.text.replaceAll("\0", "");
		if (normalizedText.trim().length === 0) {
			return {
				code: "empty_text",
				kind: "failure",
				message: "The PDF contains no extractable text and may be scan-only.",
			};
		}

		const characterLimit = Math.min(
			PDF_TEXT_HARD_LIMIT,
			Math.max(0, Math.floor(limits.maxCharacters)),
		);
		const dates = infoResult.getDateNode();
		return {
			kind: "success",
			value: {
				capturedAt:
					validIsoDate(dates.CreationDate) ?? validIsoDate(dates.ModDate),
				characterCount: normalizedText.length,
				pageCount: infoResult.total,
				text: normalizedText.slice(0, characterLimit),
				truncated: normalizedText.length > characterLimit,
			},
		};
	} catch (error) {
		if (!(error instanceof Error)) {
			throw error;
		}
		return classifyFailure(error);
	} finally {
		await parser.destroy();
	}
};
