# HANDOFF — running change log for the team

> Live log of changes made outside your session, newest first. Every session
> that touches the project appends here. Read top-down until you hit a date
> you've already seen.

---

## 2026-08-24 afternoon (Claude Code session — dose bracket, catalog un-quarantine, bs-proof deploy)

Ran alongside the Pi session; that session bumped PROMPT_VERSION to v1.23
mid-way, so nothing here re-extracted. All measurements are deterministic
replays of cached extractions.

### THE DASHBOARD HAD SILENTLY STOPPED SERVING NEW RUNS (fixed, 17b90cf)
`lib/dashboard/schema.ts` validates DashboardRunV1 with a `.strict()` Zod
object. The `v13_shadow` block was added to the artifact writer and to
`schemas/dashboard_run_v1.schema.json` but NOT to the Zod schema, so every
artifact written after it was quarantined with `Unrecognized key:
"v13_shadow"`. Five runs, all of 2026-08-24. Nothing failed loudly:
- the dashboard kept rendering, newest run stuck at 02:14;
- `GET /api/analyze-label` reads a different path and kept offering
  `20260824_113359`, whose page therefore **404'd in production**.
Retained catalog 35 -> 40, quarantined 5 -> 0. `tests/catalog-quarantine.test.ts`
guards both halves (nothing quarantined; every offered product has a servable
run) — either check alone would have passed while production was broken.

### Dose axis: unspecified forms are bracketed, not discarded (cdb0dac)
Founder asked why the dose arc scored so low. It was NOT the constants. 40 of
155 studies stated a real dose (3 g, 5 g, 20 g) and lost it in
`elemental_dose_range_mg` because the paper never named the salt — while
loading-protocol trials survived precisely because they DID name monohydrate.
Every benefit band therefore rested on ONE trial, at a loading dose:
muscle_strength 3/16 dosed (band from 1), lean_body_mass 3/11 (1),
muscle_power 6/25 (2).
Now bracketed across the ingredient's known salts (creatine 0.78–1.00), the
same argument the function's own docstring already makes for hydrates. No new
constants; nothing frozen touched; `w_study` unchanged so SIGNED scores do not
move. Ported to `lib/analyze/vocab.ts`, pinned by
`tests/dose-bracket-parity.test.ts` to Python-computed values.

Measured by deterministic replay of run `20260824_113359` (the control replay,
with the change reverted, reproduces all five published composites exactly):

| outcome | before | after |
|---|--:|--:|
| muscle_power | 44 | **67** |
| lean_body_mass | 40 | 50 |
| energy_levels | 20 | 28 |
| muscle_strength | 38 | 38 |
| exercise_endurance | 9 | 9 |

**NOT YET IN ANY ARTIFACT** — the dashboard renders retained artifacts, so
those numbers appear only after a re-score. Blocked on v1.23 (cache invalid)
and on the subscription being busy. The replay script used is disposable; the
method is: rebuild `build_ecus` inputs from a run's `_context.json`
(`studies_list` + `product`), grafting `design_rank` from the `_dashboard.json`
contributions — the context artifact does not retain design rank, and without
it every study defaults to 14 and every outcome gates.

### The failed omega-3 run was reverted (1a1c776)
An omega-3 run auto-pushed with zero scored outcomes (`SP_AUTO_PUSH` was not
set to 0) and became the site's `latest`. Reverted; its artifacts and INDEX
rows removed. **Use `SP_AUTO_PUSH=0` for anything not meant to publish.**
Cause of the failure: 40/40 subagent calls failed — see CLI notes below.

### THIS WINDOWS MACHINE COULD NEVER RUN EXTRACTION (fixed)
Two independent breakages, both now understood:
1. the npm wrapper existed but the binary did not; reinstalling restored it,
   and reinstalling ALSO cleared the workspace trust flag, which made every
   call fail with "this workspace has not been trusted";
2. `claude` resolves to `claude.CMD`, and cmd.exe mangles the double quotes in
   `--json-schema`, so every call died with "not valid JSON". Bypass the shim:

   `SP_CLAUDE_BIN=$APPDATA/npm/node_modules/@anthropic-ai/claude-code/bin/claude.exe`

   Verified with a live S8 call returning valid JSON. This is NOT a version
   issue — 2.1.237 and 2.1.241 both fail through the shim.

### Deploy: bs-proof.vercel.app is now current; the vision key is NOT valid
There are TWO projects and they are not the same deployment:
- `bs-proof-dashboard.vercel.app` — icefrost account, the handoff's production.
  Analyzer OFF. **Not reachable from this machine's Vercel login.**
- `bs-proof.vercel.app` — aykhanstoic account. Deployed current `main` here
  (founder chose this target). Analyzer ON, newest run served, the 404 fixed.

**OPEN AND BLOCKING A SCAN DEMO — but not the key.** `GEMINI_API_KEY` on
`bs-proof` (ends `ZcbA`) is a VALID GEMINI key, not a DeepSeek one: pointing
`VISION_API_URL` at DeepSeek returned 401 "api key is invalid", and removing
it again moved the error to Google's own **503 "model is currently
experiencing high demand"**, i.e. it authenticated. Both overrides were
removed; the deployment is on the default Gemini free-tier path, which is
correct.

The remaining problem is CAPACITY, not configuration: 3 of 4 live attempts
returned 503 and the fourth timed out at 50 s. The free tier was unusable at
12:47 UTC. Before demoing, re-test — and have a fallback, because a 503 on
stage looks identical to a broken product. The DeepSeek key on the icefrost
account reportedly works and is the obvious fallback (`VISION_API_URL` +
`LABEL_MODEL`, see the 2026-08-23 entry).
Also: adding env vars by piping a string from PowerShell writes a **BOM** into
the value (`Failed to parse URL from ﻿https://...`). Use
`cmd /c "vercel env add NAME production < file.txt"` with a BOM-free file.

### Also fixed
- `tests/e2e/dashboard.spec.ts` asserted a rowheader named "S5" without
  `exact: true`, so it matched the new S5T row and failed Playwright strict
  mode — one of 26 mobile failures in CI run 32708558063.
- The census on an unscored product is now typeset as figures rather than a
  footnote: it is the ANSWER on that path. Counts keep their units, there is no
  denominator, and a "Counts, not a score" tag sits above them.

NEXT: (1) a valid vision key, or demo from bs-proof-dashboard; (2) re-score
creatine so the 44 -> 67 dose fix reaches an artifact; (3) the remaining
mobile e2e click/focus timeouts are NOT diagnosed — the local repro needs
`npx playwright install chromium`.

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

### Coverage-bottleneck session 2 (same day, later): S5T HAD NEVER WORKED
Dug into why enrichment stayed at zero and found the real killer: the S5T
tool schema used a top-level oneOf, and the Anthropic API rejects top-level
oneOf/allOf/anyOf in tool input schemas with a 400 — so EVERY S5T call since
v13 was built had failed before the model saw it (this was the mysterious
'selector output is not an object'). Fixed by dropping the oneOf (the
select-XOR-refuse contract was already enforced deterministically in
workers._shadow_validate_selection; schema description now forbids re-adding
it). S5T calls now reach the model and return real selections/refusals.
Also shipped, all shadow-only, gates green:
- sources/fulltext.extract_tables_structured: colspan/rowspan-expanded
  tables with merged multi-row headers ('Creatine — Post'). Used ONLY by the
  shadow harvester via workers._tables_structured — _tables_text and S5
  payloads untouched, LLM cache keys stable.
- effect_harvest: 'mean (SD)' parenthetical cells accepted ONLY when the
  table itself declares mean (SD) formatting (SE/SEM/CI refusal still runs
  first); term matching adds paren-stripped exact equality ('Handgrip
  strength' row satisfies 'Handgrip strength (kg)' claim; 'Body mass' can
  never satisfy 'Lean body mass'); qualifier-paired candidates for
  multi-timepoint grids ('Creatine — Pre'+'Placebo — Pre' pairs, never
  Pre with Post; same-label-same-qualifier ambiguity refuses the table).
- Validator outcome check mirrors the harvester contract (containment or
  paren-stripped equality vs outcome_raw/measure).
MEASURED RESULT on the cached corpus: candidates now flow (28 claims reach
S5T, was 0 forever) but measured coverage stays 9/76 — every selection was
refused for PRINCIPLED reasons, dominated by S1 design_kind=null in the
cached extractions (~15/28; the paper never said parallel explicitly, and
automatic selection requires it), plus honest endpoint-vs-change and
outcome-term mismatches. THIS IS THE CEILING OF THE CACHED v1.22 CORPUS:
further yield needs prompt-side work (S1 design_kind discipline, S5
timepoint/direction/SD capture, S5T exact-match wording) at the next
PROMPT_VERSION bump, which costs a re-extraction. The infrastructure is now
proven end-to-end and future corpora (vitamin D, omega-3) get it for free.

### PROMPT_VERSION v1.22 -> v1.23 (founder-ordered, same day): the prompt
### tightenings are IN. Every next extraction pays the re-extraction cost.
Founder call: "fix this fucking algo for once" — implemented the measured
blockers directly instead of parking them:
- prompts/s1_design.md: design_kind now uses DEFINITIONAL RECOGNITION of
  stated allocation sentences ("randomised to creatine (n=30) or placebo
  (n=30)" IS parallel; crossover markers win on conflict; cluster = non-
  individual randomised unit; null only when allocation is truly unstated).
  The old text banned all "allocation language", which is what produced the
  design_kind=null wall (~15/28 selector-eligible cases).
- prompts/s5_conclusion.md: stated-duration timepoints (45 lost claims),
  change-vs-endpoint estimand wording (13), derived_from_arms
  estimate_kind labelling (15), effect_favours required whenever any number
  is present (34) — each with its measured count in the prompt.
- prompts/s5_table_selector.md: outcome match now tolerates parenthetical
  unit suffixes and accepts claim measure, mirroring the deterministic
  validator exactly (correct selections had been refused over "(kg)").
CONSEQUENCE: the LLM cache is cold for v1.23. The next creatine run
re-extracts ~156 studies (~1500+ calls, hours); vitamin D and omega-3 were
always going to be cold anyway. Shadow measured-coverage should finally move
past 9/76 on the re-extraction; production scoring constants remain frozen
and default-off parity is untouched (verified: invariants, selftest, module
self-checks, shadow wiring all green on v1.23).

NEXT: (1) re-run creatine under v1.23 (SOLO, watch quota) and compare shadow
measured coverage + pooled strength g vs the published MA; (2) vitamin D +
omega-3 demo runs on v1.23; (3) founder decision on scoring recalibration
(dose knots vs v13 promotion path); (4) teammate aykhanstoic shipped camera
capture + mobile-first analyzer + the form-id→ingredient fix (1d637e8) and
an omega-3 v1.22 run (08dd7f1) — the omega-3 run predates both the S5T fix
and v1.23, so re-run it before the demo.

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
