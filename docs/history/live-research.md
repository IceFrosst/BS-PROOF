# Live research (main, 2026-10-03 to 2026-10-06) — removed 2026-11

What it was, why it was removed, and what it left behind. The full worker
runbook, the SQL and the team status of the time are in `live-research/`.

## What it was

On `main` (production), each signed-in scan could queue a **research job** in
Supabase (`bsproof_research_*` tables). A worker on a team member's PC claimed it
and ran Claude Code (Sonnet, medium effort, web search and web fetch only, one
attempt per job) to write an "audit" of that product from the live web. The
worker checked that every paper id the model cited had really appeared in what
its searches returned, and that it had followed the leads it listed. The app
polled the job and drew a **live result card**: Effect / Evidence / Form / Dose
rows per outcome, every bar deliberately left empty with a named reason,
labelled experimental and ungraded.

- Released to every signed-in user on 2026-10-05 under "held-open hosting" (the
  PC awake, one terminal open, no autostart; a move to a server was planned).
- From 2026-10-05 `/scan` showed **live research only**: no model-written
  sections and no retained score next to it.
- Validation as recorded at the time: two earlier versions ran and came back
  empty; v0.5 had one successful private run (n = 1, about 100 s); the released
  code included later changes no model had run.
- The kill switch was the Vercel variable `SCAN_LIVE_RESEARCH_ENABLED`.

## Why it was removed (founder, 2026-11-07)

It was a second evidence path beside the v2 pipeline, built on search snippets
and model summaries rather than verified numbers; its model adapter lived in
`pipeline/`, the folder the project keeps free of model calls; it depended on one
PC staying on; and it was not validated. The decision was to clean `main` back to
the v2 line with v2 disconnected, and to keep `main`'s non-grading features
(workspace, History, EN/LT, sign-in fixes, label-read fixes). Live research can
come back later, once v2 grades are live, as a clearly separate "model research,
unverified" section, if it then adds anything.

## What it left behind

- **Database:** the `bsproof_research_*` tables and functions (migrations
  001–003, `live-research/research-jobs*.sql`) are still in the production
  Supabase project. They are unused and harmless; dropping them is a separate,
  deliberate step.
- **Vercel variables:** `SCAN_LIVE_RESEARCH_ENABLED`, `SCAN_LIVE_RESEARCH_OWNER_IDS`
  and `BS_PROOF_RESEARCH_WORKER_TOKEN` are read by nothing after the merge; they
  can be deleted.
- **The worker:** after the merge its routes return 404. It should be stopped on
  the PC it runs on.
- **Saved scans:** History replays a scan saved in that period with its label
  facts and the sections it stored; its research job is not shown.
- **Code:** in git history (`origin/main` up to 2026-10-06, e.g. `lib/scan-research/`,
  `components/live-result-card.tsx`, `pipeline/claude_research_adapter.py`,
  `scripts/pc_research_worker.py`, `deploy/`).
