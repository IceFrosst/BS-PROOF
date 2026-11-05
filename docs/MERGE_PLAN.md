# Merge plan: `origin/main` into `Jans_attempt` (via `integration`)

Temporary working document for the "big merge". Delete it in the commit that
moves `main` to `integration`. Measured 2026-11-05 by a trial
`git merge --no-commit origin/main` on `integration` (= `Jans_attempt` `ff793b5`),
then aborted; nothing pushed.

## Shape

| | |
|---|---|
| Common ancestor | `d9cedc4` (2026-09-22) |
| `Jans_attempt` since | 103 commits |
| `origin/main` since | 68 commits, last 2026-10-06 (nothing since) |
| Added cleanly from `main` | 137 files (45 tests) |
| Conflicts | 63 files |

Process (founder 2026-11-05): `main` is frozen; every conflict is resolved
on `integration` once, as one reviewable commit per area; all gates plus a Vercel
preview of `integration`; then `main` moves to `integration` in one push.

## What `main` has that we do not (all live in production since 2026-10-06)

1. **Live research**: a mainPC worker (`scripts/pc_research_worker.py`,
   `deploy/`) runs Claude CLI web research per scan and writes Supabase research
   jobs (`docs/research-jobs*.sql`, migrations 001–003 **applied** to the shared
   project); the app polls it (`app/api/scan/research/*`, `lib/scan-research/`)
   and shows a "live result card" (`components/live-result-card.tsx`, rows never
   graded). Its model boundary is `pipeline/claude_research_adapter.py`, which
   `main` allowed into `pipeline/` with a leaf-import rule in `invariants.py`.
2. **New /scan workspace**: tabs, History, resume a saved scan
   (`components/scan-workspace.tsx`, `history-tab.tsx`, `lib/saved-scans/`,
   `lib/scan-history/reader.ts`, `app/api/scan/history/*`).
3. **EN/LT localisation**: `lib/i18n/`, `app/api/scan/translate`,
   `lib/analyze/translate.ts` (through `llm.ts`, so inside our boundary).
4. Dependency bumps: next 16.3.0 → 16.3.8, ajv 8.18.0, sanitize-html 2.17.7;
   `@electric-sql/pglite` for SQL tests. Logo assets.

**The main structural clash:** items 1–2 are built on the OLD single-file
`components/scan-flow.tsx` (rewritten on `main`, +810/−1003) and on
`lib/evidence-ledger` (`result-card.ts` imports its types). We split that screen
into `components/scan/*` and deleted the Ledger with v14 (2026-10-15). Keeping
`main`'s features means porting them onto `components/scan/*`.

## Conflicts by group

### A. Mechanical (Claude resolves, no decision)

| File | Resolution |
|---|---|
| `package.json`, `package-lock.json` | `main`'s version bumps (next 16.3.8 is a patch release) + our removals; regenerate the lock |
| `app/layout.tsx` (+2 each) | both |
| `app/globals.css` | ours (v14 CSS removed) + `main`'s additions that the kept UI uses |
| `CLAUDE.md` | ours, plus a paragraph for whatever of `main` is kept |
| `docs/scan-history.sql` | **`main`'s**: it is what the production database runs |
| `lib/auth/claim.ts` (`main` rewrote, +110/−145) | `main`'s (security fix, reviewed), then our 4-line removal |
| `lib/analyze/vision.ts` (`main` +123) | both: `main`'s language handling + our label-prompt changes |
| `lib/analyze/scan.ts` (`main` +6) | ours + `main`'s 6 lines |
| `pipeline/selftest.py` (ours: now a package) | port `main`'s 7 added lines into `pipeline/selftest/` |
| 36 `docs/history/...` research-comparison files (git placed `main`'s new `docs/design/` files under our `docs/history/`) | keep, under `docs/history/` (they are archives) |
| `tests/scan*.test.ts(x)` | follow whatever the UI decision keeps |

### B. Deleted by us (v14), edited by `main` — keep deleted unless decision 2 needs them

`app/api/analyze-label/route.ts`, `app/tester/page.tsx`,
`components/label-analyzer.tsx`, `components/scan-flow.tsx`, `label_adapter.py`,
`scripts/analyze_label.py`, `lib/evidence-ledger/retained-audits.ts`,
`docs/SYSTEM_DESIGN.md`, `tests/evidence-ledger-production.test.ts`,
`tests/evidence-warnings.test.tsx`.

### C. Needs a founder decision

**Decision 1 — live research.** It shows model-written web research to users
on every scan, and runs on a teammate's PC.
- (a) Keep, inside our rules: move the adapter out of `pipeline/` into `bsproof/`
  (the layer allowed to call a model; drops `main`'s exception from the invariant),
  and badge the card "model research, unverified" as invariant 1 requires; never a
  grade. Needs the worker kept running and the Ledger types replaced.
- (b) Park it: keep the code in history, remove the routes and card; the applied
  SQL tables stay unused (harmless; dropping them is a separate, later step).
- Claude's lean: (b) until v2 grades are live, then decide whether model research
  adds anything next to them. But it is a user-visible feature that is live today,
  so it is your call, ideally with the teammate who runs the worker.

**Decision 2 — the /scan screen.**
- (a) Port `main`'s workspace, History, resume and EN/LT onto our
  `components/scan/*` (Claude's recommendation: the v2 grade card is planned there,
  and it avoids reviving the v14 screen).
- (b) Take `main`'s screen and re-delete the v14 parts from it.

**Decision 3 — localisation.** Keep (it uses our one model boundary, `llm.ts`);
assumed yes unless you say otherwise.

## Before the push to `main`

- All gates: `pipeline.invariants`, `pipeline.selftest`, Python tests, `npm run
  typecheck && npm run lint && npm test && npm run build`, Playwright e2e.
- Vercel preview for `integration` (`vercel.json` `ignoreCommand` builds `main`
  only today): test on a real phone, sign in, History, a scan.
- The teammate confirms `main` stayed frozen.
