# HANDOFF — running change log for the team

> Live log of changes made outside your session, newest first. Every session
> that touches the project appends here. Read top-down until you hit a date
> you've already seen.

---

## 2026-08-23 (founder + Pi session)

### v13 measured-effects stack built (SHADOW-ONLY, default OFF) — branch merged
Founder authorized fixing the effect axis (vote counting + nulls). Built via
parallel worker agents with 12 independent review cycles, every layer
reviewer-ACCEPTED before the next:
- prompts/schemas: S5 gains arm-level stats fields (means/SDs/ns, CI level,
  p kind, design), S1 gains explicit design_kind, new S5T table-selector
  agent (Tier A). PROMPT_VERSION v1.21 -> v1.22.
- pipeline/effect_harvest.py: refusal-first deterministic table candidates
  (SE/SEM/CI never harvested as SD, no invented n, full provenance).
- pipeline/meta_effects.py: stdlib Hedges g, CI/p SE recovery, global-max
  REML, Hartung-Knapp (t, df=k-1 CI / k-2 PI).
- pipeline/v13_shadow.py: pooled measured-effect analysis; unsized labels are
  MISSING, never -0.35; strict homogeneity/dedup gates.
- workers.py: SP_V13_SHADOW=1 wiring; verified byte-identical default-off
  parity with v12. PRODUCTION SCORING UNCHANGED.
NEXT: shadow replay on cached creatine corpus (needs subscription; run SOLO,
after vitamin D/omega-3 extraction), compare pooled vs published MAs
(creatine strength SMD 0.43 [0.25,0.61]) before any headline switch (v13
promotion = founder call + SPEC/parity ceremony).


### CONSTANTS FREEZE declared + 400-study creatine run LAUNCHED (evening)
- Founder decision: all scoring constants FROZEN at current values for this
  run (K=1.5, S_VALUE null=-0.35, ROB/FORM/POP/DOSE factors, FORM_LADDER,
  H_PENALTY/H_NORM, EFFECT_MID/FULL). Rationale: Tier-3 calibration is
  blocked anyway; the run itself produces the data to retune, and re-scoring
  from cached extractions is cheap afterward.
- Run: creatine / creatine_monohydrate, --supplement-scope --full-text-only
  --with-sr --limit 400 --dose 4396 (5 g compound label dose -> elemental),
  SP_RETRIEVE_MAX_PRIMARIES=1200, Claude backend v1.21.
  Log: out/run_creatine_400_20260823.log  (launched ~21:00 local, expect
  ~4000 calls, hours; NOTHING else may use the Claude subscription while it
  runs).
- New quota survival (workers.py, commit d6afa04): a subscription-limit hit
  now requeues the STUDY and pauses the run (SP_QUOTA_WAIT_S=15 min probes,
  SP_QUOTA_MAX_WAIT_S=8 h budget) instead of burning the rest of the corpus
  against a closed window (the 2026-08-10 failure). Verified by synthetic
  drill; selftest + invariants pass.


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
