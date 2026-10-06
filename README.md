# Job Search Assistant

A TypeScript CLI that turns a folder of job-posting PDFs and your resume into three reports:

1. **Market analysis** (`--market`): extracts a structured record from every posting, researches each company, and clusters the roles into a report of in-demand skills, salary ranges, and patterns.
2. **Resume gap analysis** (`--gap`): compares your resume against that market. It lists strengths and sorts each gap as `quick-win`, `short-term`, `medium-term`, or `long-term`, with one concrete next step per gap.
3. **Application advisor** (`--advisor <pdf>`): checks whether a new posting looks legitimate (WHOIS, web research), scores your fit, and writes an HTML report with tailoring advice and likely interview questions.

Every stage is a bounded tool-calling agent built on [pi](https://pi.dev)'s [`pi-agent-core`](https://github.com/earendil-works/pi/tree/main/packages/agent) runtime. Results come back through `submit_*` tools that use provider-side constrained sampling (`strict` JSON Schema) and are re-validated with Zod. The model has no way to return free-form JSON. See [`docs/design-notes.md`](docs/design-notes.md) for the reasoning, evaluation results, and known limitations.

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

## Highlights

- **Structured output enforced by the provider.** Agents can only return results through `submit_*` tools whose JSON Schema is generated from Zod and sent with `strict: true`. Every tool argument is parsed with Zod again before use, so a lenient endpoint can't pass invalid data through. Zod is the single source of truth; there are no hand-written duplicate schemas.
- **Every loop has a limit.** Agent turn caps (6 for extraction, 8 elsewhere), per-agent tool budgets, 32k output token caps, and timeouts and bounded retries on direct API calls. A misbehaving model hits a typed failure instead of running up a bill.
- **It says what it doesn't know.** Missing posting fields come back as `null`, not guesses. A failed search or a privacy-redacted WHOIS record counts as *unavailable evidence*, never as proof that a company is fake. Code, not the model, decides whether company research succeeded. Unknown cost is printed as `unavailable`, never as a fake `$0`.
- **Legitimacy comes first.** Before scoring fit, the advisor checks a posting's domain age through WHOIS and looks for corroborating evidence on the web. That verdict leads the report, with its evidence and limitations listed.
- **Web content is treated as data.** Every prompt tells the model that posting text, search results, and WHOIS records are untrusted evidence, never instructions, which guards against prompt injection from the documents it reads.
- **Cheap reruns.** Each posting is cached under a content fingerprint and its cached JSON is validated against the current schema before reuse. Only new or edited PDFs cost another model call.
- **Fails gracefully.** PDF, OpenRouter, Tavily, and WHOIS errors become typed outcomes that end up in the report's limitations instead of crashing the run.
- **Offline tests.** The unit suite uses fakes at every external boundary: no network, no keys, no private files. It includes regression tests built from real model output that once broke the system. CI runs lint, typecheck, and tests on every push.
- **Private by default.** API keys and the WHOIS request URL are never logged. Inputs and generated reports are gitignored, since reports quote your resume.

> [!NOTE]
> This started as a final project for an applied AI course in my college program. It has since been reworked into a standalone tool.

## Built with

| Project | Role |
| :--- | :--- |
| [**pi**](https://pi.dev) ([GitHub](https://github.com/earendil-works/pi)) | Agent framework. [`pi-agent-core`](https://github.com/earendil-works/pi/tree/main/packages/agent) runs each stage's tool-calling loop. [`pi-ai`](https://github.com/earendil-works/pi/tree/main/packages/ai) provides the OpenRouter provider and its per-token cost catalogue. |
| [OpenRouter](https://openrouter.ai) | Routes every LLM call; the default model is DeepSeek V4 Flash |
| [Zod](https://zod.dev) | Schemas for every model, tool, and file boundary, converted to strict JSON Schema for the provider |
| [Tavily](https://tavily.com) | Web search for company research and legitimacy evidence |
| [WhoisXML API](https://whoisxmlapi.com) | Domain registration lookups |
| [pdf-parse](https://www.npmjs.com/package/pdf-parse) | PDF text extraction |
| [Commander](https://github.com/tj/commander.js), [Vitest](https://vitest.dev), [Biome](https://biomejs.dev) | CLI, tests, lint and format |

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
