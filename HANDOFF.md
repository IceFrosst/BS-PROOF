# HANDOFF — running change log for the team

> Live log of changes made outside your session, newest first. Every session
> that touches the project appends here. Read top-down until you hit a date
> you've already seen.

---

## 2026-08-23 (founder + Pi session)

### Demo plan written: docs/DEMO_PLAN.md
Full T-minus-2-days plan (scoring tune -> vocab -> 3 sequential pipeline runs
-> camera capture -> event mode -> re-enable analyzer). Includes a post-event
workstream: apply to Anthropic's AI for Science program ($20k credits),
Claude Science project calls ($30k + compute), and the research-lab Team
plan -- all need an academic collaborator; recruiting one at the conference
is an explicit event goal.


### Conference demo prep started (event in ~2 days)
Founder gameplan: 3 supplements demoed live — **creatine, vitamin D, omega-3
fish oil**. Scientists photograph a tub, get a score fast. Requires: live
camera capture, preloaded full-pipeline runs for all three, scoring tune.
Plan is in this session's notes; work split TBD.

### Quick analysis (DeepSeek vision) TOGGLED OFF — deliberate
- New kill switch: env `LABEL_ANALYZER_ENABLED=0` on Vercel production.
  `lib/analyze/vision.ts` gained `analyzerEnabled()`; the route uses it for
  both POST gating and GET `analyzer_available`. Keys stay stored; flip the
  var to `1` (or remove it) + redeploy to re-enable.
- WHY: founder wants the demo to answer from full-pipeline scored runs
  ("the normal big research"), not the quick vision read + census fallback.

### Vision provider is now DeepSeek, and it WORKS (when enabled)
- The `GEMINI_API_KEY` env var on Vercel **actually holds a DeepSeek key**
  (known, deliberate for now — code's fallback chain picks it up).
- Added on Vercel (prod + preview): `VISION_API_URL=https://api.deepseek.com/chat/completions`,
  `LABEL_MODEL=deepseek-v4-flash-vision-exp`.
- Code fix `acc0887`: DeepSeek's vision model is a reasoning model; at
  max_tokens 2048 the chain-of-thought ate the whole budget → empty content,
  finish_reason "length". Now 8192 + parts-array-tolerant parsing + the
  empty-content error names finish_reason. Verified live end-to-end
  (synthetic creatine label → correct read, high confidence, ~25 s).
- KNOWN QUIRK (open): DeepSeek returns the FORM id (`creatine_monohydrate`)
  in `ingredient_vocab_id`, so the scored-run lookup misses and falls back to
  `not_scored` + census. Fix candidate: normalize form-id→parent ingredient
  before catalog lookup. Not shipped yet.

### Deployment facts
- `IceFrosst/BS-PROOF` shows as Git-connected to Vercel project
  `bs-proof-dashboard` (icefrost account), **but pushes do NOT trigger
  deploys** — integration is broken (likely GitHub App permissions).
  All deploys this session were manual `vercel deploy --prod` from a clean
  worktree of `origin/main`. Fix the integration when there's time.
- Production alias: https://bs-proof-dashboard.vercel.app
- Note: `trailingSlash` — POST `/api/analyze-label` 308-redirects to
  `/api/analyze-label/`. Browsers follow it; curl needs the slash.

### Process rule added (in AGENTS.md + CLAUDE.md, commit `a9e0159`)
Worktree-first: make changes in a worktree, push `main` only when verified,
because a `main` push is (supposed to be) a production deploy.

### Merge note from earlier today
Founder's in-flight local edits to `scripts/dashboard_artifact.py` and
`schemas/dashboard_run_v1.schema.json` were superseded by your Aug 22
versions (yours were more complete) — resolved in favor of upstream. The
founder's viz redesign (globals.css, four-ring-score.tsx, normalize.ts,
types.ts) is still in-flight, uncommitted, in the founder's tree.
