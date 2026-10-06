import {
	type WhoisRegistration,
	whoisArgsSchema,
	whoisResponseSchema,
} from "../schemas/whois.js";

const WHOIS_ENDPOINT = "https://www.whoisxmlapi.com/whoisserver/WhoisService";
const REQUEST_TIMEOUT_MS = 10_000;
const REDACTION_MARKERS = [
	"redacted for privacy",
	"masked_whois_data",
	"data redacted",
	"privacy service",
	"domains by proxy",
	"whoisguard",
	"not disclosed",
];

export type WhoisFailureCode =
	| "configuration"
	| "not_found"
	| "rate_limit"
	| "timeout"
	| "network"
	| "malformed_response";

export type WhoisLookupResult =
	| { readonly status: "success"; readonly registration: WhoisRegistration }
	| {
			readonly status: "unavailable";
			readonly code: WhoisFailureCode;
			readonly retryable: boolean;
			readonly message: string;
	  };

export interface WhoisLogger {
	debug(message: string): void;
}

export interface WhoisTool {
	readonly lookup: (args: unknown) => Promise<WhoisLookupResult>;
}

export type WhoisFetch = (
	url: string,
	init: { signal: AbortSignal },
) => Promise<{
	readonly ok: boolean;
	readonly status: number;
	readonly json: () => Promise<unknown>;
}>;

const isRedacted = (value: string | null): boolean =>
	value !== null &&
	REDACTION_MARKERS.some((marker) => value.toLowerCase().includes(marker));

const cleaned = (value: unknown): string | null => {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	if (trimmed.length === 0) return null;
	return isRedacted(trimmed) ? null : trimmed;
};

const unavailable = (
	code: WhoisFailureCode,
	retryable: boolean,
	message: string,
): WhoisLookupResult => ({ status: "unavailable", code, retryable, message });

export const createWhoisTool = (
	apiKey: string,
	logger: WhoisLogger,
	fetchImpl: WhoisFetch = globalThis.fetch,
): WhoisTool => ({
	lookup: async (args: unknown): Promise<WhoisLookupResult> => {
		const parsed = whoisArgsSchema.safeParse(args);
		if (!parsed.success) {
			return unavailable(
				"configuration",
				false,
				"Domain must be a bare hostname such as acmecorp.com.",
			);
		}
		const { domain } = parsed.data;

		const url = new URL(WHOIS_ENDPOINT);
		url.searchParams.set("apiKey", apiKey);
		url.searchParams.set("domainName", domain);
		url.searchParams.set("outputFormat", "JSON");
		url.searchParams.set("ignoreRawTexts", "1");

		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
		let response: Awaited<ReturnType<WhoisFetch>>;
		try {
			response = await fetchImpl(url.toString(), { signal: controller.signal });
		} catch (error: unknown) {
			const timedOut =
				error instanceof Error &&
				(error.name === "AbortError" || error.name === "TimeoutError");
			logger.debug(
				`whois lookup failed domain=${domain} reason=${timedOut ? "timeout" : "network"}`,
			);
			return timedOut
				? unavailable("timeout", true, "WHOIS lookup timed out.")
				: unavailable("network", true, "WHOIS network request failed.");
		} finally {
			clearTimeout(timer);
		}

		if (!response.ok) {
			const code: WhoisFailureCode =
				response.status === 429
					? "rate_limit"
					: response.status === 401 || response.status === 403
						? "configuration"
						: "network";
			logger.debug(
				`whois lookup failed domain=${domain} status=${response.status}`,
			);
			return unavailable(
				code,
				code === "rate_limit",
				`WHOIS service returned HTTP ${response.status}.`,
			);
		}

		let body: unknown;
		try {
			body = await response.json();
		} catch {
			return unavailable(
				"malformed_response",
				false,
				"WHOIS response was not valid JSON.",
			);
		}

		const validated = whoisResponseSchema.safeParse(body);
		if (!validated.success) {
			logger.debug(
				`whois lookup failed domain=${domain} reason=malformed_response`,
			);
			return unavailable(
				"malformed_response",
				false,
				"WHOIS response did not match the expected shape.",
			);
		}
		if (validated.data.ErrorMessage != null) {
			return unavailable(
				"configuration",
				false,
				"WHOIS service reported an error for this request.",
			);
		}

		const record = validated.data.WhoisRecord;
		const masked = record?.dataError === "MASKED_WHOIS_DATA";
		if (record == null || (record.dataError != null && !masked)) {
			logger.debug(
				`whois lookup domain=${domain} result=no_record dataError=${String(record?.dataError ?? "none")}`,
			);
			return unavailable(
				"not_found",
				false,
				"No WHOIS record was returned. This does not prove the domain or company is fake.",
			);
		}

		const registry = record.registryData ?? {};
		const pick = (
			primary: unknown,
			primaryNormalized: unknown,
			fallback: unknown,
			fallbackNormalized: unknown,
		): string | null =>
			cleaned(primaryNormalized) ??
			cleaned(primary) ??
			cleaned(fallbackNormalized) ??
			cleaned(fallback);

		const registrant = record.registrant ?? {};
		const registryRegistrant = registry.registrant ?? {};
		const organization =
			cleaned(registrant.organization) ??
			cleaned(registryRegistrant.organization);
		const country =
			cleaned(registrant.country) ??
			cleaned(registrant.countryCode) ??
			cleaned(registryRegistrant.country) ??
			cleaned(registryRegistrant.countryCode);

		const registration: WhoisRegistration = {
			domain,
			createdDate: pick(
				record.createdDate,
				record.createdDateNormalized,
				registry.createdDate,
				registry.createdDateNormalized,
			),
			expiresDate: pick(
				record.expiresDate,
				record.expiresDateNormalized,
				registry.expiresDate,
				registry.expiresDateNormalized,
			),
			registrarName:
				cleaned(record.registrarName) ?? cleaned(registry.registrarName),
			registrantOrganization: organization,
			registrantCountry: country,
			redacted: masked || organization === null,
		};

		logger.debug(
			`whois lookup domain=${domain} created=${registration.createdDate ?? "unavailable"} registrar=${registration.registrarName ?? "unavailable"} redacted=${registration.redacted}`,
		);
		return { status: "success", registration };
	},
});
