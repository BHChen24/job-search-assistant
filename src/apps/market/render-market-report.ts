import type { JobRecord } from "../../schemas/job-posting.js";
import {
	type MarketAnalysis,
	marketAnalysisSchema,
} from "../../schemas/market-analysis.js";

type Trend = MarketAnalysis["requiredSkillTrends"][number];
type Cluster = MarketAnalysis["roleClusters"][number];
export const MINIMUM_MARKET_POSTINGS = 8;
const CLUSTER_NAMES = [
	"software",
	"data/quantitative",
	"DevOps",
	"cybersecurity",
] as const;

const emptyCluster = (name: (typeof CLUSTER_NAMES)[number]): Cluster => ({
	name,
	postingCount: 0,
	jobSlugs: [],
	requiredSkillTrends: [],
	preferredSkillTrends: [],
	experienceTrends: [],
	educationTrends: [],
	salaryTrends: [],
	responsibilityPatterns: [],
	notableTrends: [],
	industryAndCultureExpectations: [],
	limitations: ["Insufficient data for this role cluster."],
});

const normalizeClusters = (
	clusters: MarketAnalysis["roleClusters"],
): MarketAnalysis["roleClusters"] =>
	CLUSTER_NAMES.map((name) => {
		const cluster = clusters.find(
			(candidate) => candidate.name.toLowerCase() === name.toLowerCase(),
		);
		if (cluster === undefined) {
			return emptyCluster(name);
		}
		return {
			...cluster,
			name,
			limitations:
				cluster.postingCount === 0
					? [...cluster.limitations, "Insufficient data for this role cluster."]
					: cluster.limitations,
		};
	});

export const prepareMarketAnalysis = (
	modelAnalysis: MarketAnalysis,
	context: {
		readonly records: readonly JobRecord[];
		readonly failedInputCount: number;
		readonly fingerprint: string;
		readonly generatedAt: string;
	},
): MarketAnalysis => {
	const thresholdLimitation =
		context.records.length < MINIMUM_MARKET_POSTINGS
			? [
					`Insufficient current validated postings: ${context.records.length} of ${MINIMUM_MARKET_POSTINGS} required.`,
				]
			: [];
	const failedLimitation =
		context.failedInputCount > 0
			? [
					`${context.failedInputCount} current input(s) failed and were excluded from this analysis.`,
				]
			: [];
	return marketAnalysisSchema.parse({
		...modelAnalysis,
		aggregateFingerprint: context.fingerprint,
		generatedAt: context.generatedAt,
		analyzedPostingCount: context.records.length,
		failedInputCount: context.failedInputCount,
		unavailableResearchCount: context.records.filter(
			(record) => record.research.status === "unavailable",
		).length,
		roleClusters: normalizeClusters(modelAnalysis.roleClusters),
		limitations: [
			...modelAnalysis.limitations,
			...thresholdLimitation,
			...failedLimitation,
		],
	});
};

const safeMarkdown = (value: string): string =>
	value
		.normalize("NFKC")
		.replace(/\p{Cc}/gu, " ")
		.replace(/\s+/g, " ")
		.trim()
		.replace(/([\\`<>|])/g, "\\$1");

const renderTrends = (trends: readonly Trend[]): readonly string[] => {
	if (trends.length === 0) {
		return ["- No supported evidence available."];
	}
	return trends.map(
		(trend) =>
			`- ${safeMarkdown(trend.label)} — ${trend.postingCount} posting(s)`,
	);
};

const renderSection = (
	heading: string,
	trends: readonly Trend[],
): readonly string[] => [`## ${heading}`, "", ...renderTrends(trends), ""];

const renderCluster = (cluster: Cluster): readonly string[] => [
	`### ${safeMarkdown(cluster.name)}`,
	"",
	`- Evidence count: ${cluster.postingCount} posting(s).`,
	`- Job slugs: ${cluster.jobSlugs.length === 0 ? "none" : cluster.jobSlugs.map(safeMarkdown).join(", ")}.`,
	"",
	"#### Required Skills",
	...renderTrends(cluster.requiredSkillTrends),
	"",
	"#### Preferred Skills",
	...renderTrends(cluster.preferredSkillTrends),
	"",
	"#### Experience",
	...renderTrends(cluster.experienceTrends),
	"",
	"#### Education",
	...renderTrends(cluster.educationTrends),
	"",
	"#### Salary Availability and Ranges",
	...renderTrends(cluster.salaryTrends),
	"",
	"#### Responsibilities",
	...renderTrends(cluster.responsibilityPatterns),
	"",
	"#### Notable Trends",
	...renderTrends(cluster.notableTrends),
	"",
	"#### Industry and Culture",
	...renderTrends(cluster.industryAndCultureExpectations),
	"",
	"#### Cluster Limitations",
	...(cluster.limitations.length === 0
		? ["- None identified."]
		: cluster.limitations.map((item) => `- ${safeMarkdown(item)}`)),
	"",
];

export const renderMarketReport = (analysis: MarketAnalysis): string => {
	const status =
		analysis.analyzedPostingCount < MINIMUM_MARKET_POSTINGS
			? `Incomplete — ${analysis.analyzedPostingCount} of 8 required current postings were analyzed.`
			: analysis.failedInputCount > 0
				? `Partial success — ${analysis.analyzedPostingCount} current postings were analyzed with ${analysis.failedInputCount} failed input(s).`
				: "Complete.";
	const lines = [
		"# Job Market Analysis",
		"",
		`**Status:** ${status}`,
		"",
		"## Evidence Summary",
		"",
		`- Analyzed postings: ${analysis.analyzedPostingCount}`,
		`- Failed inputs: ${analysis.failedInputCount}`,
		`- Unavailable company research: ${analysis.unavailableResearchCount}`,
		"- Supporting job records for each trend: `output/market/analysis.json`",
		"",
		...renderSection(
			"Required Skills and Technologies",
			analysis.requiredSkillTrends,
		),
		...renderSection("Preferred Skills", analysis.preferredSkillTrends),
		...renderSection("Experience Levels", analysis.experienceTrends),
		...renderSection("Education Requirements", analysis.educationTrends),
		...renderSection("Salary Availability and Ranges", analysis.salaryTrends),
		...renderSection(
			"Common Responsibilities and Role Patterns",
			analysis.responsibilityPatterns,
		),
		...renderSection("Notable Trends and Observations", analysis.notableTrends),
		...renderSection(
			"Industry and Company Culture Expectations",
			analysis.industryAndCultureExpectations,
		),
		"## Role Clusters",
		"",
		...analysis.roleClusters.flatMap(renderCluster),
		"## Limitations",
		"",
		...(analysis.limitations.length === 0
			? ["- None identified."]
			: analysis.limitations.map((item) => `- ${safeMarkdown(item)}`)),
		"",
	];
	return `${lines.join("\n").trimEnd()}\n`;
};
