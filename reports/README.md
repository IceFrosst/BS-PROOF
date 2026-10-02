# Reports

```
runs/              runs from the CURRENT scoring model only (immutable)
archive/<model>/   created by scripts/archive_reports.py when SCORING_MODEL changes
INDEX.md           table of runs, newest first (the scripts prepend rows)
run_statuses.json  validity registry; an unlisted run is `experimental`
```

Each run writes `<id>_summary.md`, `<id>_full.md`, `<id>_context.json` and the
deployable `<id>_dashboard.json` (contract: `schemas/dashboard_run_v1.schema.json`).
The app (`/scan`, `/runs`) reads the newest non-invalid `*_dashboard.json` per
ingredient × form, so a new run changes what users see.

Every report carries a `scoring_model:` line. **Never compare numbers across
models** — the formula moved, not the evidence. After changing
`scoring.SCORING_MODEL`, run `python3 scripts/archive_reports.py --apply`.

Never edit or overwrite a run in place; generate a new one. Earlier runs
(2026-08-07 → 2026-08-25, and archives v1–v13) were removed on 2026-10-02 and
are in git history; the reasons each was invalid or superseded are recorded in
`docs/history/2026-10-02-claude-md-archive.md`.
