# Project log

Dated change notes, newest first. This replaces the running `Current state`
diary that used to live in root `CLAUDE.md` (archived verbatim, with every entry
up to 2026-10-02, in `2026-10-02-claude-md-archive.md`; the older team change
log is `2026-08-handoff-changelog.md`).

Each entry: date, what changed, what was verified, and any handoff. Record
measurements here; keep `CLAUDE.md` to rules and a short current-state snapshot.

---

## 2026-10-03 — repository cleanup, step 3: docs and front-end

**Docs.** Living docs are now `README.md`, `CLAUDE.md`, `docs/SPEC.md`
(method), new `docs/PIPELINE.md` (merged ARCHITECTURE + ON_MACHINE_STEPS +
GROK_CLI_SETUP), `docs/SYSTEM_DESIGN.md` (app; gained §11 design system, §12
Evidence Ledger rubric, §13 v14 backup, §14 PWA), `ANCHORS.md`,
`REVIEW_PENDING.md`. SPEC and SYSTEM_DESIGN kept their names and section
numbers because code cites them ("SPEC §13"). Dated design notes, research,
the demo plan, the Aykhan handoff, the design log and SPEC's changelog moved to
`docs/history/` (same file names). README rewritten after the intro.
`prompts/research_audit.md` → `audit-v0.5` (file references only).

**Front-end.**
- Production no longer depends on the dev-only lab: retained audits, effect
  research data and ledger logic moved to `lib/evidence-ledger/`; the lab card
  and `ab.css` to `components/evidence-ledger/`. `app/design-lab/` keeps only the
  `/ab` page and the deliberately unwired `effect.ts`; the stale 09-09 layout
  prototypes (`/design-lab`, `/design-lab/mobile`) were deleted.
- `components/scan-flow.tsx` (1,238 lines) split into `components/scan/`:
  `scan-flow.tsx` (406), `flow-state.ts` (reducer replacing 8 useStates),
  `capture-views.tsx`, `ledger-tabs.tsx`, `report-sections.tsx`,
  `primitives.tsx`, `format.ts`; the duplicated warnings JSX is one
  `WarningNotices`. Scan-only components moved alongside.
- `app/globals.css` split by surface into `app/styles/*.css`, imported in the
  original order (rule-for-rule identical, verified). CSS Modules were NOT used:
  tests pin class names (`.la-alert.la-alert-warn`, `.sc-*`, `.ab-*`) as
  contracts.
- Verified: typecheck, lint, 491 unit tests, build, both Python gates, 52/52
  Playwright (desktop + mobile), and a screenshot diff of every `/scan` state
  old vs new: 47/48 byte-identical, the 48th differs only in the fake camera's
  timestamp; page heights identical.

**Found, not fixed:** `prompts/effect_research.md` says `effect-research-v0.3`
while `EFFECT_RESEARCH_PROMPT_VERSION` and `schemas/effect_research.json` say
`v0.2`, and the prompt still cites `app/design-lab/ab/effect-contract.ts`
(now `lib/evidence-ledger/`). Left for a deliberate version decision.

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
