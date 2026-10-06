# Inputs

Put your own files here. Everything in this directory except this README and the `.gitkeep` files is gitignored, so nothing you add is committed.

- `postings/`: 8 or more related job-posting PDFs for `--market`.
- `resume/`: exactly one resume PDF for `--gap`.
- `candidates/`: optional, for postings to assess with `--advisor` that should stay out of the market set.

Only `.pdf` files are read; other formats are ignored. `--advisor` takes a PDF path as an argument, so its posting can live anywhere.
