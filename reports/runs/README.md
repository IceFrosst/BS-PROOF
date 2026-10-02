# Immutable run archive

Each file is one complete report. Do not edit old runs in place — generate a new one with `python3 scripts/write_demo_report.py`.

See [`../INDEX.md`](../INDEX.md) for the table of contents.

## Dashboard artifacts

Every new live report also writes an immutable `*_dashboard.json` beside its
summary, full audit and internal context. The dashboard contract is
`DashboardRunV1` in `schemas/dashboard_run_v1.schema.json`; run validity comes
only from `reports/run_statuses.json`. An unlisted run is `experimental` and is
not approved for public claims.

The dashboard projection deliberately excludes raw prompts, adapter error
output, secrets and cache keys. Every artifact carries a versioned usage block;
unknown values are `null`, never rendered as measured zeroes.

The historical 2026-08-07 Grok run (invalid) now lives only as a test fixture
in `tests/fixtures/dashboard/`.
