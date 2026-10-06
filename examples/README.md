# Examples

Output from one real run on 2026-10-05 with the default model, `deepseek/deepseek-v4-flash-0731`:

| File | Command | Input |
| :--- | :--- | :--- |
| [`market-report.md`](market-report.md) | `--market` | 13 public job postings from the Greater Toronto Area (software, data/quant, DevOps, security) |
| [`gap-report.md`](gap-report.md) | `--gap` | The fictional resume in [`inputs/sample-resume.tex`](inputs/sample-resume.tex) |
| [`advisor-report.html`](advisor-report.html) | `--advisor` | One more full-stack posting kept out of the market set |

The candidate, their employers, and their school are invented. The job postings were real at the time of the run; their PDFs are not included.

The whole run cost about **$0.16** in OpenRouter credits. That includes one retry of the market aggregate, whose first attempt hit the output-token cap.

To reproduce with your own postings:

```bash
pdflatex -output-directory=input/resume examples/inputs/sample-resume.tex
# add 8+ posting PDFs to input/postings/ and one to input/candidates/
pnpm start --market && pnpm start --gap && pnpm start --advisor input/candidates/<posting>.pdf
```
