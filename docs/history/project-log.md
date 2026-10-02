# Project log

Dated change notes, newest first. This replaces the running `Current state`
diary that used to live in root `CLAUDE.md` (archived verbatim, with every entry
up to 2026-10-02, in `2026-10-02-claude-md-archive.md`; the older team change
log is `2026-08-handoff-changelog.md`).

Each entry: date, what changed, what was verified, and any handoff. Record
measurements here; keep `CLAUDE.md` to rules and a short current-state snapshot.

---

## 2026-10-02 — repository cleanup, step 2

- `reports/`: 68 MB → ~2.5 MB. Kept only the current run
  `20260904_185830_creatine_creatine-monohydrate_claude-sr-ft-top5-suppl` (the
  one `/scan` and `/runs` serve). Deleted every superseded or invalid run in
  `reports/runs/` (2026-08-09 → 2026-08-25, incl. the synthetic demo run) and all
  of `reports/archive/` (scoring models v1–v13). All recoverable from git history;
  why each run was invalid is recorded in `2026-10-02-claude-md-archive.md`.
- The invalid 2026-08-07 Grok run is the dashboard test fixture: moved to
  `tests/fixtures/dashboard/` (its `run_statuses.json` entry stays, the writer
  test reads it). `run_statuses.json` otherwise keeps only the `20260825_072759`
  incident entries a test pins.
- `scripts/`: deleted 12 unreferenced files (`compare_runs`, `determinism_experiment`,
  `effect_axis_ab`, `import_predatory_xlsx`, `mixture_compare`,
  `null_numbers_experiment`, `policy_experiment`, `write_demo_artifact`,
  `watch_run.sh`, `MEETING_DEMO_RUNS.md`, `check_design_lab.mjs`,
  `check_mobile_design_lab.mjs`). Experiments cited by SPEC or pipeline comments
  were kept. `test_dashboard_artifact.py` moved to `tests/`.
- Removed `pilot_adapter.py` (superseded by `claude_adapter --safe-mode`) and
  every `--pilot` path: `run_pipeline.py --pilot` now exits with the equivalent
  production flags; `run_sr_inheritance.py` defaults to `--claude`;
  `pipeline.invariants`, the gates hook, `verify_helpers.py` and two tests updated.
  Also dropped the unused `DEFAULT_PILOT_LIMIT` / `DEFAULT_GROK_LIMIT` constants
  and the unused barrel `lib/dashboard/index.ts`. Diagram regenerated.
- Verified: invariants, selftest, 48 Python tests (`.venv`), typecheck, lint,
  491 unit tests, build, 26/26 desktop Playwright tests.

## 2026-10-02 — repository cleanup, step 1

- Deleted 13 one-off Playwright scratch scripts from the repo root
  (`netcheck*.mjs`, `e2e_*.mjs`, `abandon_draft*.mjs`; unreferenced), the stale
  `.pi/` planning notes, and the superseded `pipeline_v1.excalidraw`.
- Moved root `HANDOFF.md` (team change log, last entry 2026-08-24) to
  `docs/history/2026-08-handoff-changelog.md`; references updated.
- Deleted every image under `docs/` (135 PNG screenshots, ~39 MB) and the unused
  `public/previews/` screenshots. Doc references now point to
  `node scripts/design_shots.mjs`, which regenerates them into `/tmp`; its
  camera-fallback upload now uses `public/icon-512.png`.
- Rewrote root `CLAUDE.md` from ~1,750 lines to ~300 (rules + snapshot); the
  previous version is archived verbatim. `AGENTS.md` now points dated notes here.
- Verified: both Python gates, typecheck, lint, unit tests, build.
