# HANDOFF — running change log for the team

> Live log of changes made outside your session, newest first. Every session
> that touches the project appends here. Read top-down until you hit a date
> you've already seen.

---

## 2026-08-24 (founder + Pi session — overnight run, v13 shadow repair, dose bug fixes)

### ⚠ HEADLINE SCORE CHANGED: creatine 65 → 44/100. READ WHY BEFORE PANICKING.
Two genuine production bugs were fixed (details below), both of which had been
INFLATING the dose arc:
- the observed-benefit dose band was built from PRE-routing, PRE-collapse
  claims, so off-target-population and tie-cleared claims defined the band —
  the product's closeness=1.0 was unearned;
- study doses were compared in MIXED bases (38 cached studies carried raw
  compound mg in `elemental_dose_mg`; 23 were monohydrate), so the band mixed
  5000-compound with 4396-elemental.
With both fixed, dose closeness collapses for most outcomes and the composite
drops (best outcome now muscle_power 44). THE EFFECT AXIS IS STILL v12 VOTE
COUNTING with null=-0.35 — so the score now reads honestly-low on dose while
still being distorted on effect. **The scoring arc likely needs a founder-
approved recalibration to score higher again**: either retune the frozen dose
knots / closeness weighting against the now-honest bands, or promote v13
measured effects once coverage suffices. Constants are FROZEN; proposals filed
in docs/REVIEW_PENDING.md. Recalibration = founder call, not an agent call.

### Overnight: 400-study creatine run COMPLETED (v1.22 cold re-extraction)
- 156/156 studies (155 usable), zero quota losses — the new quota-survival
  requeue worked through ~13 pauses (~3h15m waiting inside an 8h budget).
- Log: out/run_creatine_shadow_v13_20260824_c15.log (SP_MAX_CONCURRENCY=15;
  40 concurrent claude CLIs had crashed the founder's machine, 10–15 is safe).
- Report: reports/runs/20260824_021449_* (v12 scoring, pre-dose-fix: 65/100).
- The scheduled post-run PC shutdown FAILED (`systemctl poweroff` needs
  interactive auth from a background script). For next time: `sudo shutdown -h +N`.

### v13 shadow measured-effects stack REPAIRED (commits d8468e1, f176018 + this)
Diagnosed on real cached studies (60-study instrumented probe): zero table
enrichment ever fired. Root causes fixed, all shadow-only, default-off parity
kept, gates green (invariants, selftest, 3 module self-checks, shadow wiring):
- workers._shadow_arm_aliases: derives label-anchored aliases (parenthetical/
  dose-stripping + unique-prefix abbreviations, e.g. 'CR'→'Creatine') with
  whole-table ambiguity refusal (Creatine/Creatinine, 'Placebo (creatine-free)'
  cases self-checked); recovers multi-arm trials with exactly one control and
  one ingredient-alone arm; returns the SELECTED role labels (was: first
  noncontrol arm — order bug caught in review).
- pipeline/v13_shadow.py: accepts S5 contrast vocabulary (vs_ingredient_free
  eligible; vs_ingredient_arm/within_group/unclear refused); stratum key is now
  outcome|estimand|design|contrast-class (free-text measure/timepoint dropped
  from the KEY but kept per-study in a bounded audit trail) so same-construct
  records can pool; selector-None audited as adapter failure.
- Persistence: SP_V13_SHADOW=1 runs now carry run_context['v13_shadow']
  (pooled g/CI/PI/k/tau2/i2, measured/eligible, refusal counts, per-study
  audit) into *_context.json AND an optional schema-valid 'v13_shadow' block in
  *_dashboard.json (schemas/dashboard_run_v1.schema.json). Flag-off runs omit
  the key entirely.
- RESULT on the replay (reports/runs/20260824_085105_*): pooling now works —
  muscle_strength k=3 pooled g=-0.33, lean_body_mass k=2 g=+0.60. Coverage is
  the bottleneck: 9 measured / 76 eligible claims. The pooled strength sign
  still disagrees with the published MA (+0.43 [0.25,0.61]) because only 3
  studies are measurable — DO NOT read this as a creatine verdict.
- Remaining harvest gaps (documented, NOT hacked around): 28/75 real tables
  have clean 2-arm headers but most die legitimately (baseline/demographic
  tables, within-group Pre/Post grids, SE-labelled cells); two real format
  gaps remain: multi-row headers (colspan structure lost in
  sources/fulltext.extract_tables — needs colspan-aware serialisation, which
  would change S5 payloads/cache keys, so it costs a re-extraction) and
  'mean (SD)' parenthetical cells. Both filed in docs/REVIEW_PENDING.md.

### Dose arc bug fixes (PRODUCTION-SCORE-AFFECTING, founder-authorized)
- pipeline/assemble.py study_dose(): honors dose_basis; compound-basis and
  copied-field (elemental==compound, known form factor) doses convert via
  vocab; contradictory/unknown-form values refuse; per-kg × body-mass path
  preserved for elemental bases (review caught a regression that would have
  refused those).
- Band/coverage derivation moved AFTER population routing and one-study-one-
  vote collapse; n_with_dose/n_total are now study counts, not claim counts.
- pipeline/product_score.py: explicit dose-basis contract; bounded compound→
  elemental conversions refuse instead of silently taking one endpoint
  (scripts/analyze_label.py caller fixed accordingly).

### Ops notes
- Founder's in-flight viz redesign (globals.css, four-ring-score.tsx,
  normalize.ts, types.ts) was stashed during worktree work and restored —
  still uncommitted in the founder's tree, untouched.
- scripts/watch_run.sh added: live progress bar for pipeline runs.
- SP_AUTO_PUSH=0 used for verification replays (reports local-only).

NEXT: (1) founder decision on scoring recalibration (dose knots vs v13
promotion path); (2) vitamin D + omega-3 demo runs; (3) colspan-aware table
serialisation + 'mean (SD)' support to raise measured coverage past 9/76;
(4) S5 prompt tightening for timepoint/direction (blocked on PROMPT_VERSION
bump economics — costs a re-extraction).

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
