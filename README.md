# Job Search Assistant

A TypeScript CLI that turns a folder of job-posting PDFs and your resume into three reports:

1. **Market analysis** (`--market`): extracts a structured record from every posting, researches each company, and clusters the roles into a report of in-demand skills, salary ranges, and patterns.
2. **Resume gap analysis** (`--gap`): compares your resume against that market. It lists strengths and sorts each gap as `quick-win`, `short-term`, `medium-term`, or `long-term`, with one concrete next step per gap.
3. **Application advisor** (`--advisor <pdf>`): checks whether a new posting looks legitimate (WHOIS, web research), scores your fit, and writes an HTML report with tailoring advice and likely interview questions.

Every stage is a bounded tool-calling agent built on [`pi-agent-core`](https://www.npmjs.com/package/@earendil-works/pi-agent-core). Results come back through `submit_*` tools that use provider-side constrained sampling (`strict` JSON Schema) and are re-validated with Zod. The model has no way to return free-form JSON. See [`docs/design-notes.md`](docs/design-notes.md) for the reasoning, evaluation results, and known limitations.

```text
raw_data/jobs/*.pdf ──▶ --market ──▶ data/jobs/*.json
                                    data/analysis/market-analysis.json ──┐
                                    reports/market-analysis.md           │
raw_data/resume/*.pdf ─▶ --gap ────▶ data/resume/resume.json ─────────────┤
                                    data/analysis/gap-analysis.json      │
                                    reports/gap-analysis.md              │
new-posting.pdf ──────▶ --advisor ◀───────────────────────────────────────┘
                          └──▶ reports/application-report.html
```

Sample output, generated from public job postings and a **fictional** resume, is in [`examples/`](examples/).

## Requirements

- Node.js 26 or later, and pnpm 11 (`corepack enable` picks the pinned version)
- API keys:

  | Variable | Service | Used for |
  | :--- | :--- | :--- |
  | `OPENROUTER_API_KEY` | [OpenRouter](https://openrouter.ai) | Every LLM call |
  | `TAVILY_API_KEY` | [Tavily](https://tavily.com) | Company and legitimacy research |
  | `WHOIS_API_KEY` | [WhoisXML API](https://whoisxmlapi.com) | Domain registration lookups (`--advisor`) |
  | `OPENROUTER_MODEL` | | Optional. Defaults to `deepseek/deepseek-v4-flash-0731` |
  | `LOG_LEVEL` | | Optional: `trace`, `debug`, `info`, `warn`, `error`, `silent` |

## Setup

```bash
pnpm install --frozen-lockfile
cp -n .env.example .env   # then fill in the keys
pnpm start --help
```

## Usage

### Market analysis

Put 8 or more related job-posting PDFs in `raw_data/jobs/`:

```bash
pnpm start --market
pnpm start --market --verbose   # diagnostics on stderr
```

Reruns are incremental. Each posting's cached record is validated and reused, and only new or changed PDFs are re-extracted. The aggregate refreshes when the input set changes.

### Resume gap analysis

Put exactly one resume PDF in `raw_data/resume/`, then run `--market` first:

```bash
pnpm start --gap
```

The extracted resume is cached in `data/resume/resume.json`, so later runs don't re-extract an unchanged PDF.

### Application advisor

Pass a posting that was **not** part of the market set. `raw_data/postings/` is a convenient place for it:

```bash
pnpm start --advisor raw_data/postings/new-posting.pdf
```

The advisor needs `--market` and `--gap` to have run first. The report has five sections and puts legitimacy first:

| Path | Contents |
| :--- | :--- |
| `reports/application-report.html` | Latest report, overwritten each run |
| `reports/application-<slug>-<stamp>.html` | Per-run archive |
| `data/analysis/application-<slug>-<stamp>.json` | The same report as structured data |

Repeat runs never overwrite their archives, so two runs of one posting can be compared:

```bash
diff <(jq -S . data/analysis/application-<slug>-<stamp1>.json) \
     <(jq -S . data/analysis/application-<slug>-<stamp2>.json)
```

### Cleaning generated output

```bash
pnpm start --clean            # remove generated data and reports
pnpm start --clean --market   # clean, then regenerate
```

`--clean` keeps `raw_data/`, `.env`, and `data/resume/resume.json`. Delete that file by hand to force the resume to be read again. After re-running `--market`, re-run `--gap` and `--advisor` too, or they will still reflect the old market.

## Observability

`--verbose` (or `LOG_LEVEL=debug`) logs every tool call, each agent's run summary, and its decisions to `stderr`. `stdout` keeps only the summary line.

```text
market.posting tool call: web_search(query="Example Corp quantitative analytics", companyDomainHint=null)
market.posting.fields title="Quantitative Analyst" company="Example Corp" hardSkills=8 preferred=2 salary=not-found postingAgeDays=24 research=partial
market.posting.agent model=deepseek/deepseek-v4-flash-0731 turns=2 llmCalls=2 tokens=10570 cost=unavailable structuredOutput=passed searches=2
advisor.legitimacy.signal green-flag: Domain example.com registered 1994-10-24
advisor.fit.score 42% band=stretch adaptations=5 questions=4
```

Cost shows `unavailable` when OpenRouter's catalogue has no per-token rates for the model, as is the case for the default. It never shows `$0` for a cost it doesn't know.

## Privacy

Resumes and postings stay on your machine except for the text sent to OpenRouter and the company names and domains sent to Tavily and WhoisXML. Everything under `raw_data/`, `data/`, and `reports/` is gitignored, because generated reports quote your resume. API keys are never logged, and neither is the WHOIS request URL, which contains the key.

## Development

```bash
pnpm test        # unit tests; no network, no .env, no private PDFs
pnpm typecheck
pnpm lint
```

Contributor and coding-agent conventions are in [`AGENTS.md`](AGENTS.md).

## License

[MIT](LICENSE)
