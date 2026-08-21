# Pathway Data Validation Build

A static, no-build-step site for evaluating JobSpikr as a data source for
the Pathway product. Shows exactly what we've pulled -- nothing simulated.

## Running locally

No build tools needed. Just serve the folder (browsers block `fetch()` on
`file://` URLs, so a plain double-click on `index.html` won't load the
data):

```bash
cd pathway-dashboard
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Updating the data

Replace `data/results.csv` with your latest `state_batch_results.csv` from
the JobSpikr batch-fetch pipeline (same column format), then refresh the
page. No rebuild required.

`data/jobs.json` and `data/cities.json` are the reference lists (top 20
jobs by our ranking, top 500 US cities by population) -- regenerate these
only if the underlying reference CSVs change.

## Known gaps in this build (as of 2026-08-21)

- **Job coverage**: 20 of the planned 100 prominent jobs, due to JobSpikr's
  rate-limit budget for this validation pass. The other 80 need a follow-up
  pull once we understand the real rate limit (pending Sukesh via Anna).
- **Company / employer names**: not confirmed whether JobSpikr exposes an
  employer-name field, or how to aggregate by it.
- **Remote-role flag**: not confirmed whether this field exists.
- **Education requirements**: not confirmed, likely not available at our
  current tier -- probably needs the vendor's own text-classification, not
  a raw postings field.
- **Salary and monthly trend**: the API response *does* include
  `min_salary` / `max_salary` / `average_salary` and monthly buckets, but
  the current batch-fetch script only captures `total_count`. Capturing
  and plotting these is a near-term addition, not a vendor limitation.

## Deploying to GitHub Pages

1. Push this folder to a repo (or a `docs/` subfolder / `gh-pages` branch).
2. Repo Settings -> Pages -> set source to that branch/folder.
3. Done -- it's static files, no CI needed.
