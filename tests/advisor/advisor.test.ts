import { describe, expect, it } from "vitest";
import { renderApplicationReport } from "../../src/apps/advisor/render-application-report.js";
import {
	type ApplicationReport,
	applicationReportSchema,
} from "../../src/schemas/application.js";
import { createWhoisTool, type WhoisFetch } from "../../src/tools/whois.js";

const logger = { debug: () => undefined };

const okFetch = (body: unknown): WhoisFetch =>
	(() =>
		Promise.resolve({
			ok: true,
			status: 200,
			json: () => Promise.resolve(body),
		})) as WhoisFetch;

const reportWith = (
	overrides: Partial<ApplicationReport> = {},
): ApplicationReport =>
	applicationReportSchema.parse({
		schemaVersion: 1,
		generatedAt: "2026-08-07T12:00:00.000Z",
		source: { fileName: "posting.pdf", fingerprint: "a".repeat(64) },
		posting: { title: "Software Engineer", company: "Example Co" },
		legitimacy: {
			verdict: "green",
			confidence: "medium",
			signals: [
				{
					signal: "Domain registered in 2003",
					polarity: "green-flag",
					evidence: "WHOIS createdDate 2003-04-15.",
				},
			],
			recommendation: "This posting appears legitimate.",
			limitations: [],
		},
		advice: {
			fit: {
				score: 72,
				band: "good",
				recommendation: "Apply and highlight your CI/CD work.",
				requirements: [
					{
						requirement: "TypeScript",
						status: "met",
						evidence: "Listed on the resume.",
					},
					{ requirement: "Kubernetes", status: "gap", evidence: "Not shown." },
				],
			},
			resumeAdaptations: [
				{ change: "Move CI/CD to the top.", reason: "Named first in posting." },
			],
			coverLetterPoints: ["Mention the Azure migration."],
			interviewQuestions: [
				{
					question: "Describe a CI/CD pipeline you built.",
					whyLikely: "The posting lists CI/CD first.",
					talkingPoints: ["GitHub Actions work"],
				},
			],
			skillsToBrushUp: ["Kubernetes basics"],
			companyResearchTopics: ["Recent funding"],
			limitations: [],
		},
		...overrides,
	});

describe("WHOIS adapter", () => {
	it("Given a record with normalized dates and a redacted registrant, When looked up, Then values normalize and redaction is flagged", async () => {
		const tool = createWhoisTool(
			"test-key",
			logger,
			okFetch({
				WhoisRecord: {
					createdDateNormalized: "2003-04-15 00:00:00 UTC",
					expiresDate: "2026-04-15T00:00:00Z",
					registrarName: "GoDaddy",
					registrant: { organization: "REDACTED FOR PRIVACY", country: "CA" },
				},
			}),
		);

		const result = await tool.lookup({ domain: "example.com" });

		expect(result).toMatchObject({ status: "success" });
		if (result.status !== "success") return;
		expect(result.registration.createdDate).toBe("2003-04-15 00:00:00 UTC");
		expect(result.registration.registrarName).toBe("GoDaddy");
		expect(result.registration.registrantOrganization).toBeNull();
		expect(result.registration.registrantCountry).toBe("CA");
		expect(result.registration.redacted).toBe(true);
	});

	it("Given missing fields, When looked up, Then every absent value becomes null rather than undefined", async () => {
		const tool = createWhoisTool(
			"test-key",
			logger,
			okFetch({ WhoisRecord: {} }),
		);

		const result = await tool.lookup({ domain: "example.com" });

		expect(result).toMatchObject({ status: "success" });
		if (result.status !== "success") return;
		expect(result.registration).toEqual({
			domain: "example.com",
			createdDate: null,
			expiresDate: null,
			registrarName: null,
			registrantOrganization: null,
			registrantCountry: null,
			redacted: true,
		});
	});

	it("Given MASKED_WHOIS_DATA, When looked up, Then registration dates survive and only the registrant is treated as redacted", async () => {
		const tool = createWhoisTool(
			"test-key",
			logger,
			okFetch({
				WhoisRecord: {
					dataError: "MASKED_WHOIS_DATA",
					createdDate: "1994-10-24T04:00:00Z",
					expiresDate: "2027-10-23T04:00:00Z",
					registrarName: "GoDaddy Corporate Domains, LLC",
				},
			}),
		);

		const result = await tool.lookup({ domain: "rbc.com" });

		expect(result).toMatchObject({ status: "success" });
		if (result.status !== "success") return;
		expect(result.registration.createdDate).toBe("1994-10-24T04:00:00Z");
		expect(result.registration.registrarName).toBe(
			"GoDaddy Corporate Domains, LLC",
		);
		expect(result.registration.redacted).toBe(true);
	});

	it("Given an invalid domain, a missing record, or an HTTP error, When looked up, Then typed non-absence failures are returned", async () => {
		const invalid = await createWhoisTool("k", logger, okFetch({})).lookup({
			domain: "https://example.com/jobs",
		});
		const noRecord = await createWhoisTool(
			"k",
			logger,
			okFetch({ WhoisRecord: { dataError: "MISSING_WHOIS_DATA" } }),
		).lookup({ domain: "example.com" });
		const noneAtAll = await createWhoisTool("k", logger, okFetch({})).lookup({
			domain: "example.com",
		});
		expect(noneAtAll).toMatchObject({
			status: "unavailable",
			code: "not_found",
		});
		const rateLimited = await createWhoisTool("k", logger, (() =>
			Promise.resolve({
				ok: false,
				status: 429,
				json: () => Promise.resolve({}),
			})) as WhoisFetch).lookup({ domain: "example.com" });

		expect(invalid).toMatchObject({
			status: "unavailable",
			code: "configuration",
		});
		expect(noRecord).toMatchObject({
			status: "unavailable",
			code: "not_found",
		});
		expect(noRecord.status === "unavailable" ? noRecord.message : "").toContain(
			"does not prove",
		);
		expect(rateLimited).toMatchObject({
			status: "unavailable",
			code: "rate_limit",
			retryable: true,
		});
	});
});

describe("application report rendering", () => {
	it("Given a complete report, When rendered, Then all five sections appear with legitimacy first", () => {
		const html = renderApplicationReport(reportWith());

		const order = [
			"1. Legitimacy assessment",
			"2. Fit assessment",
			"3. Resume adaptation",
			"4. Cover letter guidance",
			"5. Interview prep",
		].map((heading) => html.indexOf(heading));

		expect(order.every((index) => index > 0)).toBe(true);
		expect([...order].sort((a, b) => a - b)).toEqual(order);
		expect(html).toContain("<!doctype html>");
		expect(html).toContain("72%");
		expect(html).toContain("Describe a CI/CD pipeline you built.");
	});

	it("Given a red verdict, When rendered, Then the warning banner and recommendation lead the report", () => {
		const html = renderApplicationReport(
			reportWith({
				legitimacy: {
					verdict: "red",
					confidence: "high",
					signals: [],
					recommendation: "Do not submit personal information to this posting.",
					limitations: ["Company website could not be found."],
				},
			}),
		);

		expect(html).toContain("verdict-red");
		expect(html).toContain("Do not submit personal information");
		expect(html.indexOf("Do not submit personal information")).toBeLessThan(
			html.indexOf("2. Fit assessment"),
		);
	});

	it("Given hostile text in model output, When rendered, Then it is HTML-escaped rather than injected", () => {
		const html = renderApplicationReport(
			reportWith({
				advice: {
					...reportWith().advice,
					coverLetterPoints: ['<script>alert("xss")</script>'],
				},
			}),
		);

		expect(html).not.toContain("<script>alert");
		expect(html).toContain("&lt;script&gt;");
	});
});
