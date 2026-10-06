import type {
	ApplicationReport,
	LegitimacyVerdict,
} from "../../schemas/application.js";

const escapeHtml = (value: string): string =>
	value
		.normalize("NFKC")
		.replace(/\p{Cc}/gu, " ")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;")
		.trim();

const VERDICT_COPY: Record<
	LegitimacyVerdict,
	{ readonly label: string; readonly banner: string }
> = {
	green: { label: "Appears legitimate", banner: "verdict-green" },
	yellow: { label: "Proceed with caution", banner: "verdict-yellow" },
	red: { label: "Multiple fraud signals", banner: "verdict-red" },
};

const list = (items: readonly string[], empty: string): string =>
	items.length === 0
		? `<p class="muted">${escapeHtml(empty)}</p>`
		: `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;

const STYLES = `
:root{--bg:#ffffff;--fg:#1a1d23;--muted:#5b6472;--line:#e3e7ee;--accent:#2b5cd9;
--green:#137a4a;--green-bg:#e8f6ef;--yellow:#8a6100;--yellow-bg:#fdf4e0;--red:#a3202c;--red-bg:#fdeaec;}
@media (prefers-color-scheme:dark){:root{--bg:#14171c;--fg:#e8ebf0;--muted:#9aa3b2;--line:#2a2f38;
--accent:#7ea2ff;--green:#5cd6a0;--green-bg:#12291f;--yellow:#e8bd63;--yellow-bg:#2a2413;--red:#ff8a95;--red-bg:#2c1619;}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
main{max-width:52rem;margin:0 auto;padding:2.5rem 1.25rem 4rem}
h1{font-size:1.9rem;margin:0 0 .25rem}
h2{font-size:1.3rem;margin:2.5rem 0 .75rem;padding-bottom:.4rem;border-bottom:2px solid var(--line)}
h3{font-size:1.05rem;margin:1.5rem 0 .5rem}
.meta{color:var(--muted);font-size:.9rem;margin:0 0 2rem}
.muted{color:var(--muted)}
.verdict{border-radius:10px;padding:1rem 1.25rem;margin:0 0 1.25rem;border:1px solid transparent}
.verdict-green{background:var(--green-bg);border-color:var(--green);color:var(--green)}
.verdict-yellow{background:var(--yellow-bg);border-color:var(--yellow);color:var(--yellow)}
.verdict-red{background:var(--red-bg);border-color:var(--red);color:var(--red)}
.verdict strong{display:block;font-size:1.15rem;margin-bottom:.35rem}
.verdict p{margin:.35rem 0 0;color:var(--fg)}
.score{display:flex;align-items:baseline;gap:.75rem;margin:.5rem 0 1rem}
.score b{font-size:2.4rem;color:var(--accent);line-height:1}
.bar{height:10px;border-radius:99px;background:var(--line);overflow:hidden;margin:.5rem 0 1rem}
.bar span{display:block;height:100%;background:var(--accent)}
table{width:100%;border-collapse:collapse;margin:.5rem 0 1rem;font-size:.94rem}
th,td{text-align:left;padding:.55rem .6rem;border-bottom:1px solid var(--line);vertical-align:top}
th{color:var(--muted);font-weight:600}
.pill{display:inline-block;padding:.1rem .5rem;border-radius:99px;font-size:.78rem;font-weight:600}
.met{background:var(--green-bg);color:var(--green)}
.partial{background:var(--yellow-bg);color:var(--yellow)}
.gap{background:var(--red-bg);color:var(--red)}
.flag{border-left:3px solid var(--line);padding:.15rem 0 .15rem .75rem;margin:.6rem 0}
.flag.red-flag{border-color:var(--red)}
.flag.green-flag{border-color:var(--green)}
.flag em{display:block;color:var(--muted);font-style:normal;font-size:.9rem;margin-top:.2rem}
.q{margin:1rem 0}
.q p{margin:.2rem 0}
.wrap{overflow-x:auto}
`;

export const renderApplicationReport = (report: ApplicationReport): string => {
	const { legitimacy, advice } = report;
	const verdict = VERDICT_COPY[legitimacy.verdict];
	const posting = report.posting as {
		title?: unknown;
		company?: unknown;
	} | null;
	const title =
		typeof posting?.title === "string" ? posting.title : "Job application";
	const company =
		typeof posting?.company === "string" ? posting.company : "Unknown company";

	const requirements = advice.fit.requirements
		.map(
			(item) =>
				`<tr><td>${escapeHtml(item.requirement)}</td><td><span class="pill ${item.status}">${item.status}</span></td><td>${escapeHtml(item.evidence)}</td></tr>`,
		)
		.join("");

	const signals = legitimacy.signals
		.map(
			(signal) =>
				`<div class="flag ${signal.polarity}"><strong>${escapeHtml(signal.signal)}</strong><em>${escapeHtml(signal.evidence)}</em></div>`,
		)
		.join("");

	const questions = advice.interviewQuestions
		.map(
			(item) =>
				`<div class="q"><p><strong>${escapeHtml(item.question)}</strong></p><p class="muted">${escapeHtml(item.whyLikely)}</p>${list(item.talkingPoints, "No talking points recorded.")}</div>`,
		)
		.join("");

	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Application Report — ${escapeHtml(title)}</title>
<style>${STYLES}</style>
</head>
<body>
<main>
<h1>${escapeHtml(title)}</h1>
<p class="meta">${escapeHtml(company)} &middot; generated ${escapeHtml(report.generatedAt)} &middot; source ${escapeHtml(report.source.fileName)}</p>

<h2>1. Legitimacy assessment</h2>
<div class="verdict ${verdict.banner}">
<strong>${escapeHtml(verdict.label)} (${escapeHtml(legitimacy.verdict)}, ${escapeHtml(legitimacy.confidence)} confidence)</strong>
<p>${escapeHtml(legitimacy.recommendation)}</p>
</div>
<h3>Signals found</h3>
${signals || '<p class="muted">No specific signals were recorded.</p>'}
<h3>Limitations</h3>
${list(legitimacy.limitations, "None recorded.")}

<h2>2. Fit assessment</h2>
<div class="score"><b>${advice.fit.score}%</b><span>${escapeHtml(advice.fit.band)}</span></div>
<div class="bar"><span style="width:${Math.max(0, Math.min(100, advice.fit.score))}%"></span></div>
<p>${escapeHtml(advice.fit.recommendation)}</p>
<div class="wrap"><table><thead><tr><th>Requirement</th><th>Status</th><th>Evidence</th></tr></thead>
<tbody>${requirements || '<tr><td colspan="3" class="muted">No requirements recorded.</td></tr>'}</tbody></table></div>

<h2>3. Resume adaptation</h2>
${
	advice.resumeAdaptations.length === 0
		? '<p class="muted">No adaptations recorded.</p>'
		: advice.resumeAdaptations
				.map(
					(item) =>
						`<div class="flag"><strong>${escapeHtml(item.change)}</strong><em>${escapeHtml(item.reason)}</em></div>`,
				)
				.join("")
}

<h2>4. Cover letter guidance</h2>
${list(advice.coverLetterPoints, "No cover letter points recorded.")}

<h2>5. Interview prep</h2>
<h3>Likely questions</h3>
${questions || '<p class="muted">No questions recorded.</p>'}
<h3>Skills to brush up</h3>
${list(advice.skillsToBrushUp, "None recorded.")}
<h3>Research about the company</h3>
${list(advice.companyResearchTopics, "None recorded.")}
<h3>Limitations</h3>
${list(advice.limitations, "None recorded.")}
</main>
</body>
</html>
`;
};
