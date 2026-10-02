# Project log

Dated change notes, newest first. This replaces the running `Current state`
diary that used to live in root `CLAUDE.md` (archived verbatim, with every entry
up to 2026-10-02, in `2026-10-02-claude-md-archive.md`; the older team change
log is `2026-08-handoff-changelog.md`).

Each entry: date, what changed, what was verified, and any handoff. Record
measurements here; keep `CLAUDE.md` to rules and a short current-state snapshot.

---

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
