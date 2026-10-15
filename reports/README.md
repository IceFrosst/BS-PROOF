# Reports

```
runs/       one immutable set of files per run
INDEX.md    table of runs, newest first (the report writer prepends rows)
```

Each run writes `<id>_summary.md`, `<id>_full.md` and `<id>_context.json`. The
context carries the run's `evidence_v2` block (pooled effects + GRADE per
outcome), which `scripts/benchmark_v2.py compare` and the app read.

Every report carries a `scoring_model:` line. The two runs here (2026-10-13 and
2026-10-14) were written while v14 was still the stored model: their markdown
shows v14 rows, and their context also holds `evidence_v2`. v14 itself, its
runs and the `/runs` dashboard were removed on 2026-10-15
(`docs/history/v14-scoring-model.md`, tag `v14-final`).

Never edit or overwrite a run in place; generate a new one. A run writes its
files locally; `SP_AUTO_PUSH=1` also commits and pushes them on the current
branch (a push to `main` deploys).
