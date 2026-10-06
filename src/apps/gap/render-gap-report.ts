import {
	GAP_LEVELS,
	type GapAnalysis,
	type GapLevel,
} from "../../schemas/gap-analysis.js";

const LEVEL_HEADINGS: Record<GapLevel, string> = {
	"quick-win": "Quick wins — resume wording and framing",
	"short-term": "Short term — days to weeks",
	"medium-term": "Medium term — weeks to months",
	"long-term": "Long term — significant investment",
};

const safeMarkdown = (value: string): string =>
	value
		.normalize("NFKC")
		.replace(/\p{Cc}/gu, " ")
		.replace(/\s+/g, " ")
		.trim()
		.replace(/([\\`<>|])/g, "\\$1");

const renderGapsForLevel = (
	analysis: GapAnalysis,
	level: GapLevel,
): readonly string[] => {
	const gaps = analysis.gaps.filter((gap) => gap.level === level);
	if (gaps.length === 0) {
		return [`### ${LEVEL_HEADINGS[level]}`, "", "- None identified.", ""];
	}
	return [
		`### ${LEVEL_HEADINGS[level]}`,
		"",
		...gaps.flatMap((gap) => [
			`**${safeMarkdown(gap.skill)}**`,
			"",
			`- Market demand: ${safeMarkdown(gap.marketDemand)}`,
			`- Why it is a gap: ${safeMarkdown(gap.why)}`,
			`- Next step: ${safeMarkdown(gap.action)}`,
			"",
		]),
	];
};

export const renderGapReport = (analysis: GapAnalysis): string => {
	const lines = [
		"# Resume Gap Analysis",
		"",
		`**Compared against:** ${analysis.analyzedPostingCount} analyzed job posting(s).`,
		"",
		"## Strengths",
		"",
		...(analysis.strengths.length === 0
			? ["- No supported strengths identified."]
			: analysis.strengths.flatMap((strength) => [
					`**${safeMarkdown(strength.skill)}**`,
					"",
					`- Market demand: ${safeMarkdown(strength.marketDemand)}`,
					`- Resume evidence: ${safeMarkdown(strength.resumeEvidence)}`,
					"",
				])),
		"",
		"## Gaps by effort to close",
		"",
		...GAP_LEVELS.flatMap((level) => renderGapsForLevel(analysis, level)),
		"## Unique value",
		"",
		...(analysis.uniqueValue.length === 0
			? ["- None identified."]
			: analysis.uniqueValue.map(
					(item) =>
						`- **${safeMarkdown(item.strength)}** — ${safeMarkdown(item.whyItDifferentiates)}`,
				)),
		"",
		"## Limitations",
		"",
		...(analysis.limitations.length === 0
			? ["- None identified."]
			: analysis.limitations.map((item) => `- ${safeMarkdown(item)}`)),
		"",
		"## Evidence",
		"",
		"- Supporting data for each gap: `data/analysis/gap-analysis.json`",
		"",
	];
	return `${lines.join("\n").trimEnd()}\n`;
};
