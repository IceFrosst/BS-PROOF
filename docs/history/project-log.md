# Project log

Dated change notes, newest first. This replaces the running `Current state`
diary that used to live in root `CLAUDE.md` (archived verbatim, with every entry
up to 2026-10-02, in `2026-10-02-claude-md-archive.md`; the older team change
log is `2026-08-handoff-changelog.md`).

Each entry: date, what changed, what was verified, and any handoff. Record
measurements here; keep `CLAUDE.md` to rules and a short current-state snapshot.

---

## 2026-10-16 — v2 step 1 (offline): items 2, 3, 6

Branch `v2/step1-offline`, merged into `Jans_attempt`. No model calls.

- **Item 2 (fetch failures):** `fulltext.fetch_xml` retries transport errors,
  429 and 5xx; a cited table that still cannot be fetched marks its claims
  `table_fetch_failed`, the pool refusal says so, and the run writes no report
  until a re-run fetches it (exit 3, like the usage-limit guard). While
  measuring item 3, 7 of 39 papers failed to fetch on the first try even with
  retries — the failure is common, not rare.
- **Item 3 (largest refusal), measured on the replayed v1.36 creatine run:**
  of 64 "no verified effect estimate and incomplete arm statistics": 40 have
  no outcome values in the text the reader got (20 checked to be figure- or
  text-only, 11 from non-PMC PDF/HTML copies, 7 unfetchable now, 1 in a
  table the reader missed), 12 post values without an SD, 5 only a p-value,
  5 numbers not verified. The span check now reads tables whose outcome label
  is a section-header row with one row per group underneath (4 trials
  recovered: strength k 9 → 10, power 9 → 10, lean mass 10 → 11, endurance
  1 → 2; letters unchanged; benchmark coverage strength 38 → 42 %, lean mass
  59 → 65 %, still PASS). The refusal now names the specific gap
  (`pool.unpoolable_detail`).
- **Item 6 (v14 claim-arm check):** not ported. It would refuse 9 of 49
  pooled effects, all valid between-arm contrasts computed from both arms'
  statistics; its objections concern the reported test. 6 of the 9 point
  against creatine, so porting it would bias grades upward.
- New open decision 5 (effects from an exact p-value). Item 10 now includes
  S5N leaving the SD empty for endpoint / post values.
- Gates: invariants, selftest, 166 Python tests; cache-only replay used as
  the regression check (baselines under `out/replay/`).

## 2026-10-15 — simplification: systematic reviews no longer retrieved; merged into Jans_attempt

Branch `simplify/no-sr-retrieval` (on `simplify/css`), then the whole
`simplify/*` chain fast-forwarded into `Jans_attempt`.

- Retrieval stopped searching for systematic reviews (up to 200 per
  ingredient, classified, deduplicated, publisher-looked-up and stored, but
  read by nothing since S2 was removed). A review record the trial search
  returns is now dropped after classification. Removed with it:
  `europepmc.hit_count` (unused), the review mode of `europepmc._query`,
  `SP_RETRIEVE_MAX_SYNTHESES`. If forest-plot reading is built later, it gets a
  targeted fetch of its own.
- Verified: a fresh retrieval of creatine (intervention scope) into separate
  databases before and after stores the same 390 trials with every field
  identical (only the 74 review rows are gone); the cache-only replay of the
  v1.36 run gives byte-identical `evidence_v2` and extractions. Invariants,
  selftest, 156 Python tests.
- The simplification (A–H, CSS, reviews) is complete.

## 2026-10-15 — simplification: dead CSS removed; baseline is Jans_attempt

Branch `simplify/css` (on `simplify/docs`).

- Removed every CSS rule that could no longer match (~165 class selectors left
  by the Ledger, the dashboard, the v14 dose bars and outcome tabs), 17 unused
  custom properties and the comments describing deleted rules; stylesheets
  1190 -> 722 lines. `scan-ledger-result.css` renamed `scan-result.css`.
- Verified: the computed style and box of every element in 44 page states
  (`/`, `/methodology`, 404 and every `/scan` state incl. opened details, at 390
  and 1280 px) recorded before and after — byte-identical. Typecheck, lint, 212
  vitest, knip, build, 14 Playwright / axe tests.
- Founder: work as if `origin/main` did not exist; `Jans_attempt` is the
  baseline until the big merge. Prompt clean-up (left item 4 below) moved to
  the v2 work list (`docs/DECISIONS.md` #10).

## 2026-10-15 — simplification H: docs consolidated; what is left before merging

Branch `simplify/docs` (on `simplify/app-v2-off`), not merged.

- Current docs, one per topic: `docs/METHOD.md` (new; `EVIDENCE_METHOD.md` +
  the still-valid parts of `SPEC.md`, section-numbered), `docs/PIPELINE.md`
  (rewritten), `docs/APP.md` (`SYSTEM_DESIGN.md` cut to the current app; §7 and
  §11 keep their numbers), `docs/DECISIONS.md` (`REVIEW_PENDING.md` cut to open
  v2 decisions, the v2 work list and decided items), `README.md`, `AGENTS.md`
  (its contradictory push rules reconciled: branch first, `main` deploys).
- Archived: `SPEC.md` → `history/v14-spec.md`, `ANCHORS.md` + `anchors.csv` →
  `history/v14-anchors.*` (a shopping list for v2 benchmark rows, including
  negative controls). Deleted from history: the four raw competitor briefs, the
  Ledger notes (rubric, large-effect audit, effect ladder), the launch review,
  the v14 universal-negative incident ledger + its JSON and test, the old team
  changelog (its one cited DeepSeek quirk moved into the code comments).
- Every code citation of a removed doc now points at `METHOD §N` / `APP §N` /
  `DECISIONS`; misleading v14 wording fixed in docstrings and two user-visible
  strings (site title/description, the literature-orientation disclaimer).
  `schemas/ecu.json` and `fulltext.looks_like_included_studies` (v14/SR only)
  removed; the compatibility section no longer claims an "Evidence run" basis.
  `scripts/design_shots.mjs` works again (Ledger shots removed).
- New `scripts/replay_from_cache.py` (cache-only replay + compare): confirms
  E/F/G/H left `evidence_v2` byte-identical (900 cache hits, 5 known misses).
- Corrections found while writing METHOD: the registry rule DOES downgrade
  (`registry_bias.py` docstring said it did not); the 400-participant OIS rule
  exists, but costs only one level, which is why a 14-participant trial grades A.
- Gates: invariants, selftest (178), 156 Python tests, typecheck, lint, 212
  vitest, build.

**Left before merging** (founder decisions marked):

1. **`origin/main` has moved on (founder / team).** Since the branch point
   (`d9cedc4`, 2026-09-22) `main` gained 68 commits (~52k lines: the live
   research worker, live result card, research-jobs SQL, scan-history UI,
   localisation) that `Jans_attempt` and these branches do not contain, and
   that partly build on what was removed here (the Ledger-style card,
   `research_audit` prompts, `SYSTEM_DESIGN.md`). Merging needs a decision on
   how the two lines combine before any conflict is resolved.
2. Dead CSS: ~175 class selectors no component references (`ab.css`, `scan.css`,
   `scan-ledger-result.css`, `base.css`); prune with a before/after screenshot
   comparison (`scripts/design_shots.mjs`).
3. Retrieval still fetches up to 200 systematic reviews per ingredient,
   classifies them and looks up their publishers, but nothing reads them since
   S2 was removed. Remove (replay-gated) or keep for future forest-plot work
   (founder).
4. Prompts still carry v14 wording and fields only v14 read (e.g. S5's
   direction/magnitude labels, "form arc" in `s7_form.md`). Editing them needs a
   `PROMPT_VERSION` bump = full re-extraction, so bundle it with the next
   re-extraction in the v2 work list.

## 2026-10-15 — simplification E/F/G: dashboard dropped, grading switched off in the app

Branch `simplify/app-v2-off` (on `simplify/v2-only`), not merged.

- E: `/runs` and `/runs/<id>` pages, `lib/dashboard`, the run components,
  `scripts/dashboard_artifact.py`, `schemas/dashboard_run_v1.schema.json`,
  `reports/run_statuses.json`, every `*_dashboard.json`, `archive_reports.py`
  and the v14 run `20260904_185830` deleted. Runs now write summary, full and
  context only; `benchmark_v2.py compare` and `grade-v2.ts` read `_context.json`.
  Report push is opt-in (`SP_AUTO_PUSH=1`).
- F: v14 TS ports (`scoring.ts`, `product-score.ts`, `dose-effectiveness.ts`),
  the Evidence Ledger (`lib/evidence-ledger`, its card, audits, research
  prompts/schemas), `/design-lab`, `/tests/supplements` and the grade card
  removed. `/scan` answers `not_graded` for every supported product and shows
  "Evidence grades are not active yet" on the landing screen and every result.
  The model orientation (evidence prior) now runs for every product; its dose
  reading is words only (the v14 closeness ramp is gone). `grade-v2.ts` kept,
  not connected. `/methodology` rewritten as a short "how we will grade" page.
- G: e2e routes reduced to `/`, `/scan`, `/methodology`, 404; the app CI
  workflow no longer re-runs the Python selftest and triggers on app paths
  only; `score-tracer` agent deleted, `run-triage` rewritten for v2; unused
  deps (marked, sanitize-html, zod, @testing-library/dom) removed; vocab dose
  conversion re-pinned to Python goldens (`golden_vocab_parity.json`).
- Gates: invariants, selftest, 157 Python tests, typecheck, lint, 212 vitest,
  knip clean, production build (8 routes, was 226), 14 Playwright/axe tests.

## 2026-10-15 — simplification: evidence method v2 only

Founder decision: commit to v2; retire v14. Branches `simplify/a-dead-weight`
(section A) and `simplify/v2-only` (B–D), not merged to `main`.

- A: 7 closed history docs (audits, demo plan, handoff, design notes) and the
  dead `oa.referenced_dois` alias deleted.
- v14 recorded in `docs/history/v14-scoring-model.md`; local tag `v14-final`
  (`967f997`) holds the last tree with v14 intact.
- Removed: v14 scoring (`scoring`, `arcs`, `donut`, `calibration`, `preview`,
  `effect_s`, `assemble`, `product_score`, `claim_arms`; v14 dose bands), the
  SR route (`synthesis`, `synthesis_bridge`, S2, `--with-sr`), the table route
  (S1, S5T, `worker_shadow`, `effect_harvest`), per-claim S6 (S6B was the only
  path used), Grok (`grok_adapter`, `--grok`), the CLI label scorer
  (`label_adapter`, `scripts/analyze_label.py`), `--demo`, the v14 score stage,
  ECU storage tables, `rescore_run.py`, `golden_parity.py`, six v14
  experiments. `_s7_for_claim` / `study_dose` moved to `pipeline/dose.py`
  unchanged; the arm-label helpers into `eligibility.py`.
- Report: the summary now prints the v2 grade table and refusal reasons
  (it never showed v2 before); `scoring_model:` stamps `evidence-v2`.
  Invariant-4 watcher and hook now watch the v2 rules.
- Verified: a cache-only replay of the v1.36 creatine run (model calls
  blocked; 955 cache hits) gives byte-identical `evidence_v2` and extractions
  before and after the removal. Gates: invariants, selftest (179 checks), 171
  Python tests, affected vitest suites, v2 goldens unchanged.
- Found while verifying (for the v2 algorithm pass): the replay grades
  strength k = 9 C- where the stored `20261014_185045` says k = 7 I — two
  trials' table numbers failed to verify in the original run (live table fetch
  at span-check time). A single trial can earn an A (muscle soreness, sleep
  quality: k = 1). v14's claim-level arm firewall never ran in v2.

## 2026-10-13 — repo cleanup (founder-approved list)

- Deleted: 3 superseded runs (20261005_080012, 20261005_224647,
  20261012_102130; ~14 MB, in git history) + their INDEX rows;
  `pipeline_v2_demo.excalidraw`, `scripts/write_demo_diagram.py`,
  `scripts/write_demo_report.py`; `scripts/experiments/poolability.py`,
  `pool_shadow.py`, `v2_preview.py`, `sr_table_coverage.py`; the v13 shadow
  (`pipeline/v13_shadow.py`, `SP_V13_SHADOW`, its score/dashboard writers);
  `run_coverage.py`, `run_sr_inheritance.py`; `next-env.d.ts` untracked
  (gitignored). Dashboard schemas still accept an optional `v13_shadow` key
  (old artifacts carry it); `EVIDENCE_V2_RUNS_DIR` stays as a test override.
- Table route (S1 + S5T) switched OFF by default (`SP_NUMERIC_TABLES=1` turns it
  on): 277/277 v2 claims took S5N's numbers. Code kept until the v1.36 re-run
  confirms v2 is unchanged (it still writes into v14's S5 claims).
- CLAUDE.md "Current state" / "Next" rewritten (stale Phase-1 snapshot, done
  retrieval item, overtaken S7 replay item, changelog paragraph moved out).
- Gates: 193 Python tests, selftest, invariants; typecheck, lint, 506 vitest,
  knip clean.

## 2026-10-13 — fixes #1 #3 #6 #8 (v1.36); off-target populations deferred

- #1 S4 gets the FULL text (`worker_payload.FULL_TEXT_AGENTS`): it was sent a
  6,248-char head + tail and missed the methods (randomisation, blinding).
- #3 Registry: patient trials (healthyVolunteers = False) are reported as
  `off_target_population`, not unpublished (fields now requested from
  ClinicalTrials.gov). Projected on 20261013_072633: strength unpublished 6 -> 1,
  lean 10 -> 7 (vs 7 pooled: still -1). Title matching was audited and not
  automated (too noisy; NCT05109039 likely = Brooks 2023).
- #6 Audit of 88 no-effect claims: 49 no numbers read (22 PDF/HTML text, 24 no
  numeric table, ~1 real reader miss), 21 span-check rejections -- fixed the
  glued-decimal tokenizer ("PRE33.90"), clearing 8 fully + 1 partly.
- #8 S5 v1.36 reports matched add-on pairs (ingredient + X vs X) as their own
  claims. The bump invalidates every agent's cache: next run is a full
  re-extraction.
- #7 off-target populations stay excluded; recorded as open item 0b in
  REVIEW_PENDING. 193 Python tests.

## 2026-10-12 — RoB semantics and registry publication check fixed (founder)

- `pool.rob_status` reads S4's own meanings: HIGH only when blinding/placebo is
  missing; an undescribed randomisation method or incomplete attrition
  reporting is "unclear". `REVIEW_PENDING.md` #0 amended.
- Registry: a flagged "unpublished" trial that a primary (non-review,
  non-protocol) Europe PMC paper cites by NCT id counts as `published_unlinked`
  (`europepmc.publications_for_registration`; failed lookups stay counted).
  Audit of creatine strength: 5 of 11 "unpublished" had such papers.
- 190 Python tests. Re-run 20261013_072633: **strength I -> C+** (k=9,
  +0.31 [+0.06, +0.55]; 6 unpublished vs 9 pooled); power and muscular
  endurance RoB -2 -> -1; lean D+ unchanged (10 unpublished vs 7 pooled).

## 2026-10-12 — all-outcomes run (20261012_102130); review-table route measured

- Review tables (`scripts/experiments/sr_table_coverage.py`): ~8 unreadable
  trials gain real per-arm rows (6 strength, all one review); one checked row
  used the wrong comparator. Not built; at most a sensitivity estimate later.
- All-outcomes run: strength k=9, +0.31 [+0.06, +0.55] (meaningful, Very low
  -> I); lean k=7 D+; power k=8 I; 15 more outcomes, mostly k <= 3. Benchmark:
  strength precision passes, coverage 38 %. No kidney outcome in the vocab.
- Found: `pool.rob_status` misreads S4's "method not described" (0) as
  "inadequate" (high RoB). Measured impact in the measurements note.

## 2026-10-06 — intervention-scope creatine run (20261005_224647)

- 139 studies (40 new); resumed once after a memory-pressure stop. Strength
  k=7 +0.27 [-0.13, 0.67] (I), lean k=8 +0.17 (D+), power k=8 +0.05 (I).
  Benchmark: lean SMD pass; strength not testable (coverage 33 %, 2.1x).
- 40 new studies -> 15 effect claims -> ~1 pooled trial per outcome: most new
  claims are other endpoints or off-target populations. The limit is now the
  readable open-access literature (295/386 RCTs abstract-only).

## 2026-10-05 — poolability: where the trials went; two fixes

- Offline analysis of 20261005_080012 (extractions replayed from the LLM cache
  with model calls blocked): 134 mapped claims -> 57 effects -> 33 trial-outcome
  pairs -> 17 pooled. Losses: 22 claims with no printed numbers, 13 missing an
  arm n, 13 pairs correctly refused as combinations, 3 off-target populations.
  The corpus (99 studies) is the binding limit, not extraction.
- Founder-approved fixes: arm n from S3 (`span_check.fill_arm_n`) and claim-level
  matched add-on contrasts (`eligibility.matched_addon_claim`); v2 only.
  Strength k 6, lean k 7 (letter D), power k 7. 187 Python tests.

## 2026-10-05 — first full v2 creatine run (20261005_080012)

- 98/99 studies extracted, 0 partial failures, ~18 h (usage-limit pauses);
  crash in `_agent_stats` on S5N's list `_meta` fixed (4d81a7d), re-run from
  cache. Auto-report pushed to `origin/Jans_attempt` only.
- v2: strength k=5 g=+0.17 [-0.43, 0.77], lean k=5 +0.04, power k=5 -0.04,
  endurance k=2 -0.14; every letter I. 17/17 pooled trials reviewer-agreed.
  Benchmark: lean SMD pass; strength not testable (coverage 38 %, width 3.1x).
  Details: measurements note, "First full v2 creatine run".

## 2026-10-04 — benchmark pass rule; creatine v2 re-extraction started

- Founder decisions recorded in `docs/REVIEW_PENDING.md` #0: branch only,
  benchmark pass rule (coverage ≥ 50 %, CI width ≤ 2× median published, overlap
  > half; else not testable), same scope as 20260904_185830, reviewer
  disagreements excluded.
- `pipeline/benchmark.verdicts` + `RULES`, verdict block in
  `scripts/benchmark_v2.py compare`; 5 new tests (175 Python tests).
- First full-run attempt stopped by Claude Code under memory pressure (PDF
  stage, no model calls, nothing written). Added: incomplete-run guard (a run
  still carrying usage-limit failures after the 8 h pause budget stops before
  scoring, exit 3, no report) and `out/checkpoints/<ingredient>_<form>.json`
  (per-study progress, rewritten after each study). Resume = same command
  (cache). `docs/PIPELINE.md` Step 3; `tests/test_run_checkpoint.py`
  (179 Python tests).

## 2026-10-03 — S7 max_turns fixed; v2 benchmark (step 3); effect_unit (v1.35)

- S7 `max_turns`: optional arm `confidence` / `salt_family`; S5 `effect_unit`
  cap 60 (loosen-only, no bump). Verified by RSMOKE6 `--resume`.
- Benchmark: `vocab/benchmarks.json` (19 rows, 10 meta-analyses, verbatim
  quotes), `pipeline/benchmark.py` (offline, like-for-like CI overlap),
  `scripts/benchmark_v2.py verify|compare`, `tests/test_benchmark.py`.
  `verify`: 19/19. The 2026-08-11 PUBLISHED table had 3 misattributed rows
  (10.3390/nu17020238, no meta-analysis); excluded and annotated.
- v1.35: S5N / S5R `effect_unit` = unit only (RSMOKE6 wrote measure names).
  RSMOKE7: 0 failed agents, units clean; an endpoint arm's mean is now read
  from its verified post value when only `post_*` is filled (FFM claim).
- Gates: invariants, selftest, 170 Python tests.

## 2026-10-03 — S5N per-claim numbers extractor (v1.32-v1.34)

- New agent S5N (`prompts/s5_numbers.md`, `schemas/s5_numbers.json`, tier B
  Sonnet): reviewer 1 for v2 numbers on every mapped claim, chunked 8 per call
  (`SP_S5N_CHUNK`), blind to S5's numbers and estimand; picks the estimand the
  paper prints in full. `pipeline/review.numbers_claim` replaces S5's numbers
  (never mixes); pool / reviewer read `numbers_v2.claim`. Fallback to S5's
  numbers (`reader: "S5"`) on omission or failure. On by default,
  `SP_NUMBERS_EXTRACTOR=0` off. S5R refuses S5N's model too.
- Verified: invariants, selftest, 138 Python tests (12 new in
  `tests/test_numbers_extractor.py`).
- Smoke RSMOKE4: 0/12 effects, but S5N's readings are correct; the losses are
  arm-per-row span coverage and per-arm SE / CI instead of SD. Measurements
  note, "S5N numbers extractor smoke test".
- v1.33: both arm rows quoted, single row label; per-arm SE / CI fields in
  S5N and S5R; deterministic SD derivation (Cochrane §6.5.2.2,
  `arm_stats_derived`, flagged, ranked after printed SDs). 147 Python tests.
- Smoke RSMOKE5: **7/11 effects, reviewer agreed on all 7**; the other 4 are
  correct refusals. Two open validity issues (swapped table cells; endpoint
  values under baseline imbalance) -- measurements note, "RSMOKE5".
- v1.34 (founder): printed-table consistency guard (change must equal post −
  pre; refuses) and baseline imbalance (endpoint gap > effect -> flag + RoB
  capped at "unclear"; downgrades, never refuses). Readers copy `pre_*` /
  `post_*`. 157 Python tests. RSMOKE6: the swapped DJ/CMJ cells are refused,
  FFM flagged; 5/13 effects, all agreed; 2 S7 `max_turns`.
- S7 `max_turns` root cause: arms carried the top-level `confidence` /
  `salt_family` (the prompt asks for them; the arm schema refused them) -- 6 of
  the 7 S7 failures across A, B and the smokes. Arm items now accept both,
  optional; S5 `effect_unit` cap 40 -> 60 (its one failure). Loosen-only, so no
  `PROMPT_VERSION` bump (headroom precedent). Verified: RSMOKE6 `--resume`
  re-ran the 2 failed S7 calls, 0 failures, every arm carries both fields.

## 2026-10-03 — dose rule relaxed; reviewer fixed; re-extraction held back

- Founder: dose indirectness only for `below_50` / `above_200`
  (`grade.OFF_DOSE`, TS `OFF_DOSE`, goldens regenerated).
- Second reviewer made route-aware (`review.ROUTE_FIELDS`, `MUST_CONFIRM`),
  sent only effect-making claims, told the estimand and what `found` means
  (v1.30). S5 told to copy arm values, never compute them (v1.31).
- Three smoke runs (14 studies, ~150 calls): 0 of 13 mapped claims made an
  effect after the fixes, so the full creatine re-extraction was NOT started.
  Details and the proposed per-claim numbers extractor:
  `2026-10-03-phase1-measurements.md` "Pre-re-extraction smoke tests".

## 2026-10-03 — v2 end to end: S5 claim rule (v1.29), run stage, app port, grade card

- **S5 unit** is one claim per separately reported measure (grids still
  collapse; whole-body lean mass first); `_shared.md` forbids undefined
  properties. `PROMPT_VERSION` v1.28 -> v1.29 (cache invalidated; the creatine
  re-extraction needed it anyway). Pool picks one claim per trial by a fixed
  `measure_hierarchy` (vocab/outcome.json) before primary/route/order: on the
  A/B pair, same-endpoint effects now agree 7/7 with max difference 0.0.
- **Run stage** `bsproof/run/evidence.py` -> `pipeline/evidence_v2.py`: pool +
  GRADE + registry check, stored as `evidence_v2` in the context and dashboard
  artifact (JSON schema + zod both declare it). `grade.py` split into
  `base_domains` (stored) + `indirectness` (per product); Python's own letter is
  composed from the same halves (`grade_record` / `letter_from_record`).
- **App** `lib/analyze/grade-v2.ts`: re-matches stored trials to the scanned
  form and ELEMENTAL daily dose; one run grades every form of the ingredient.
  Pinned to Python by `tests/golden_grade_v2.json` (`scripts/golden_grade_v2.py`,
  7 products, letters A/B/D-/F/I). Scan responses carry `evidence_v2`.
- **UI** `components/scan/grade-card.tsx`: letter per outcome, every downgrade
  with its reason; replaces the Ledger card only when a run carries the block.
  Dev preview: `scripts/experiments/v2_preview.py` + `EVIDENCE_V2_RUNS_DIR`
  (ignored in production).
- Found by the scan test: 5 g monohydrate = ~4.4 g creatine, which is
  `low_50_99` against 5 g trials and so counts as off-dose (one level). Raised
  in `docs/REVIEW_PENDING.md` #0.
- Gates: invariants, selftest, 123 Python tests, 506 vitest, typecheck, lint,
  production build. Playwright not run.

## 2026-10-03 — founder decisions on REVIEW_PENDING #0; run B resumed

- Founder accepted the GRADE thresholds, both policy choices and the MCID table
  "for now, may revisit" (`vocab/outcome.json` `"approved": true`); reviewer =
  Opus, 1 % tolerance; registry rule implemented: −1 publication bias when
  registered-unpublished ≥ pooled trials (`grade.RULES["registry_unpublished_ratio"]`,
  never stacked on Egger).
- `extraction_stability.py run --resume` now redoes studies with failed agents
  (successful agents replay from the run's own cache) and stops at the first
  quota hit instead of recording quota failures. Run B's first pass is kept as
  `out/stability/B_firstpass.json` / `cache_B_firstpass.sqlite`.
- **Run B completed** (18 studies, 342 s, no quota hit). Methods facts
  reproduce well (kappa 0.5–1.0); same-endpoint numbers are identical across
  runs; the instability is which endpoints become poolable (claim splitting,
  endpoint choice, S3 failure cascade). Full numbers:
  `2026-10-03-phase1-measurements.md` "Phase 1b result".

## 2026-10-03 — v2: second reviewer, MCID proposal, crossover, dose, registry (shadow)

- **Second reviewer** (`pipeline/review.py`, agent `S5R`, tier `R` =
  `claude-opus-5`, `SP_MODEL_R`): one call per study re-reads every mapped claim
  with span-verified numbers, blind to S5's numbers. Deterministic rule: any
  conflict refuses the claim for human adjudication (`review_v2.adjudication`);
  unconfirmed numbers are dropped; never averaged. `call()` refuses a reviewer
  model equal to S5's. Off by default (`SP_SECOND_REVIEWER=1`); no model calls
  were made. New prompt/schema `s5_review`; `PROMPT_VERSION` NOT bumped (a new
  agent has its own cache keys; bumping would invalidate ~1000 extractions).
- **MCIDs proposed**, unapproved, in `vocab/outcome.json`: performance outcomes
  0.2 SD (Hopkins 2004, quoted), lean mass 0.2 SD convention (Europe PMC search
  found no healthy-adult MCID); grip 5.0–6.5 kg (Bohannon 2019) recorded for
  sensitivity. `grade()` uses a value only when `"approved": true`.
- **Crossover** (`effect_size.py`): arm stats as if parallel (Cochrane §23.2.6),
  paired MD+CI kept, crossover SMD refused; pool counts crossover n once.
- **Dose indirectness** (`grade.py`, `pool.dose_match_tier`): SPEC §8 tiers
  against each trial's dose, −1 when > 50 % of the weight is off-dose.
- **Registry** (`sources/clinicaltrials.search_completed`,
  `pipeline/registry_bias.py`, `pool_shadow.py --registry`): measured on
  creatine — 207 completed hits, 112 name creatine as an intervention; possibly
  unpublished (upper bound): strength 16/21, power 6/7, lean mass 19/25,
  endurance 7/10. Reported, not downgraded (founder call).
- Gates: invariants ok, selftest ALL PASSED, 117 Python tests.

## 2026-10-03 — evidence method v2: GRADE certainty + letter grades (shadow)

`pipeline/grade.py`: GRADE certainty per outcome (start High for RCTs, Low
otherwise; downgrades for risk of bias, inconsistency, imprecision incl. the 400-
participant information size, indirectness by product form, publication bias via
Egger at ≥ 10 trials; each with its reason; domains it cannot assess are listed),
§4 benefit categories plus "inconclusive" → I, the founder-approved letter table,
re-grading at M/2 and 2M with a threshold-sensitivity flag, MCID read from
`vocab/outcome.json` (`mcid`) else 0.2 SD flagged. `pipeline/pool.py` now carries
n, risk of bias (`rob_status` from S4), the tested arm's form (`study_form` —
S7's top-level form is usually null since v1.24, found on run A) and population
tier per study. Run A: every outcome grades I (sparse, high-risk, imprecise) —
the honest result for that sample. Thresholds listed for founder review in
`docs/REVIEW_PENDING.md` #0. Tests: `tests/test_grade.py` (16), `tests/test_pool.py` (7).

## 2026-10-03 — `max_turns` failures diagnosed and fixed; v2 shadow pooling

- **Diagnosis:** unrecovered `max_turns` failures were free-text fields slightly
  over their schema `maxLength` (captured on S1 `rationale`, S7 arm
  `evidence_span`), not a transport wrapper. Fix: free-text limits raised ~1.5–2x
  in six S-schemas, identifier fields unchanged, prompts unchanged, no
  `PROMPT_VERSION` bump (looser limits cannot stale a cache; reasoning beside the
  constant). Adapter records `failure_shape` + raw stream for every unrecovered
  failure. Test: `tests/test_schema_headroom.py`.
- **Shadow pooling** `pipeline/pool.py`: per outcome, v2 eligibility (scope
  refusals minus the underpowered one), stored population policy, one effect per
  study (primary first, then route rank), REML + Hartung–Knapp (k ≥ 3), single
  study not pooled, natural-unit pool only for one shared unit, estimand mix and
  leave-one-out reported, every refusal counted. Tests `tests/test_pool.py`;
  report `scripts/experiments/pool_shadow.py`. On run A (25 studies): muscle power
  k=2, g = +0.28 [−0.37, +0.94]; strength k=0 (4 off-target populations,
  2 combinations, 3 unverified). Not a production score.
- Stability run B hit the session limit; comparison invalid, rerun pending.

## 2026-10-03 — evidence method v2, Phase 2 step 1: span check + effect sizes

Found first: the S5 schema already requires per-arm n / mean / SD / SE, CI
level, estimand and table provenance (the v1.24 contract), and the switched-off
v13 shadow path already had a conservative table route (deterministic
candidates + S5T selector + cell-for-cell validation). No prompt changed, so no
`PROMPT_VERSION` bump.

- `pipeline/span_check.py`: every numeric claim field must be printed in the
  claim's quote, in its cited table row (arm-per-row tables checked per arm), or
  — for n only — in the matching S3 arm; otherwise refused. Handles Unicode
  minus, en-dash ranges, decimal commas after 0, printed precision; a sign that
  only came from words is flagged.
- `pipeline/effect_size.py`: verified numbers → benefit-positive effect + variance
  via ranked routes (arm_stats → Hedges' g + mean difference; reported SMD + CI /
  exact p / n; reported MD + CI). Refuses non-parallel designs, ratios and
  relative percents, "favours neither", unoriented outcomes, % arm values.
- `bsproof/workers.py`: table route ON by default (`SP_NUMERIC_TABLES=0` turns it
  off); `numbers_v2` verification attached to every mapped outcome. v14 reads none
  of it — all v14 baselines unchanged.
- `bsproof/run/extract.py`: the per-study run record now keeps the arm-level
  fields and S3 arm sizes (it dropped them, which made Phase 1a part 1
  undercount).
- Live check on doi:10.1080/15502783.2022.2108683 caught two real defects, both
  fixed and pinned by tests: arm-per-row tables (control row never matched) and
  the decimal comma "0,001". After the fix all four jump outcomes produce
  Hedges' g from table-verified change scores (e.g. squat jump g = 0.30, hand
  re-computed).
Tests: `tests/test_effect_size.py` (16).

## 2026-10-03 — evidence method v2 adopted; Phase 1a measured

Founder decisions recorded in `docs/EVIDENCE_METHOD.md` §9 (adopted; §4 grade
table; MCID policy delegated → §5 source hierarchy + sensitivity, values still
need approval; Evidence Ledger keep-then-retire; second reviewer = a second
Claude model for now, different-vendor reviewer as future work; vitamin C next).
`REVIEW_PENDING.md` #0 resolved.

Phase 1a (`scripts/experiments/poolability.py`, no model calls): 79 of 85 PMC
full texts (93%) report arm-level mean ± SD/SEM or CIs, but current extractions
make only 10/37 strength, 4/32 power, 6/25 lean-mass and 1/19 endurance trials
poolable. Phase 1b harness `scripts/experiments/extraction_stability.py` built and
unit-tested; a 1-study live smoke already showed run-to-run differences (S7
`max_turns` failure, one direction flip). Full 25-study run pending (solo).
Details: `docs/history/2026-10-03-phase1-measurements.md`.

## 2026-10-03 — evidence method v2 proposed

`docs/EVIDENCE_METHOD.md`: a proposal to replace the v14 aggregation with a
Cochrane-style pipeline — arm-level numeric extraction with dual independent
extraction and span checks, Hedges' g / mean differences, REML random-effects
pooling with Hartung–Knapp CIs and prediction intervals (the existing
`pipeline/meta_effects.py`), GRADE certainty (form/dose/population mismatch as
indirectness), per-outcome MCIDs, and letter grades from a fixed
(benefit × certainty) table with "I" for insufficient evidence. Validation by
run-to-run agreement and benchmarking against published meta-analyses. Pointers
added to `CLAUDE.md`, `docs/SPEC.md`, `README.md`; the six founder decisions are
`docs/REVIEW_PENDING.md` #0. No code or score changed.

## 2026-10-03 — blank env vars no longer break the model call

A local `/scan` failed with "label read: could not reach the model API:
TypeError: Failed to parse URL from". `.env.local` had been copied from
`.env.example`, which lists `MODEL_API_URL=`, `LABEL_MODEL=`, `TEXT_MODEL=` with
empty values; `lib/analyze/llm.ts` read them with `??`, so "" won over the
DeepSeek default and fetch got an empty URL. Blank or whitespace values now
count as unset (`envValue()`), as the API keys already did. Pinned by
`tests/llm-env.test.ts`. No prompt, model choice or scoring changed.

## 2026-10-03 — /tester retired, run_pipeline split, dashboard legacy paths

**Retired `/tester` and `POST /api/analyze-label`** (the pre-/scan analyzer):
deleted the page, the route, `components/label-analyzer.tsx` and the
analyzer stylesheet. The run archive `/tester` carried moved to a new `/runs`
index (same content, run-page header); the run pages' "Runs" breadcrumb now
points there instead of the waitlist. The `.la-*` rules /scan still renders
moved into `app/styles/scan.css` in cascade order; dead census, hero and
tester rules were removed. E2E and unit tests retargeted to `/runs`; /tester
and /api/analyze-label are pinned as 404. Also added the missing
`prompts/literature_warnings.md` + schema to `/api/scan`'s file tracing (they
are read at request time). Verified: /scan screenshots 46/48 byte-identical,
the other two differ only in animation frames; page heights identical.

**`run_pipeline.py` 1,051 → 113 lines.** Stages moved to `bsproof/run/`
(options, corpus, extract, score, report); helpers and stage bodies moved
verbatim. Hand-rolled flag parsing → argparse (`--help` now exists; an unknown
flag is an error instead of becoming the ingredient). `tests/test_run_options.py`
keeps the old parser as an oracle over 16 argv cases. Verified: CLI edge cases
identical, wiring run identical bar network lines, all deterministic baselines,
and an offline smoke of the Claude production path with a fake adapter
(backend selection, S2–S8 calls, SR gate, report mode `claude-sr-top5-broad`).

**Dashboard legacy paths.** Measured with coverage over the real retained data.
Removed: rendering context-only runs (none remain; now quarantined with a
reason) and `scoringModelFromReport` (back-filled a scoring model from .md
reports and `reports/archive/` for pre-stamp contexts). Kept on purpose: the
context cross-check (every run still writes a context), `usageFromSpeedReport`
(the only usage source for a future Grok run) and the provider fallback.

**Found, not changed:** a TYPED creatine monohydrate 4000 mg × 1/day never gets
the retained Evidence Ledger audit — the manual path builds no `actives` list
and the exact matcher requires exactly one. Product decision.

## 2026-10-03 — effect-research version mismatch resolved

`prompts/effect_research.md` said `effect-research-v0.3` while
`EFFECT_RESEARCH_PROMPT_VERSION` and `schemas/effect_research.json` said `v0.2`
(the prompt was reworded and bumped in 46936c9 without the constant). The
output contract has not changed since v0.2, and the three retained files are
stamped v0.2 because that is what produced them. Fix, same pattern as
`research_audit`: prompt + constant → `effect-research-v0.4` (file references
repointed, no instruction changed); validator and schema accept exactly
`ACCEPTED_EFFECT_RESEARCH_VERSIONS` = v0.2 and the current version. New tests
pin that the retained file keeps v0.2, that the current version validates, that
v0.3 (never produced) is refused, and that the constant equals the version
printed in the prompt. No model call was made; no cache exists for this prompt.

## 2026-10-03 — repository cleanup, step 4: tooling, CI, dead code, structure

**Small items.** `reports/latest*.md` dropped (writers no longer create them;
`INDEX.md` header aligned with what the writers prepend). Unused e2e helpers
removed (lint is clean). Six experiment scripts moved to
`scripts/experiments/` with a README of what each measured; references updated.

**CI.** `dashboard.yml` skips docs-only pushes (`docs/**`, top-level `*.md`,
experiments, the diagram, `.claude/**` — never `prompts/` or `reports/`, which
the app reads), runs nightly and on demand, and prints a non-blocking `knip`
report. `selftest.yml` runs only on Python-relevant paths, now also runs the 48
`tests/*.py` (never run in CI before) and a non-blocking `vulture` report. With
one retained run the browser suite is 52 tests / ~25 s, so no smoke split.

**Dead code.** `knip` (pinned devDependency, `knip.json`, `npm run knip`) is
clean: removed 4 dead exports, 2 stale re-export groups, 2 duplicate catalog
aliases, an unused type and `@testing-library/user-event`; the `@emnapi` pins
are kept on purpose (clean `npm ci`). `vulture`: removed 5 dead helpers
(`_header_n`, `_value_n`, `_normal_cdf`, `_optional_float`,
`filter_ecu_rows_by_extracted_n`) and 3 dead assignments. Kept on purpose:
founder constants, dataclass fields, documented-but-unwired helpers
(`synthesis_contribution_cap`, `inherited_facts`, `harvest_serialized`,
`Store.ecus_for`). Left for a scoring-code pass: the unused parameters
`to_studies(dose_bands=)` and `score_ecu(n_unique=)` (still passed by callers).

**Large files split (moved verbatim).** `pipeline/selftest.py` → package
`pipeline/selftest/` (5 groups; 3 explicit hand-offs; the `-m pipeline.selftest`
command is unchanged). `pipeline/assemble.py` → + `claim_arms.py`,
`effect_s.py`, `eligibility.py` (re-exported). `workers.py` → `workers.py` +
`worker_payload.py`, `worker_shadow.py`, `worker_quota.py` (re-exported; the
shadow self-check now patches the two modules the table helpers are read
from). `claude_adapter.py` deliberately NOT split: one file per model boundary.

**Package.** Adapters and workers moved into `bsproof/`; entry points stay at
the root. `pipeline.invariants` now recognises `bsproof.<adapter>` imports in
every spelling (5 new evasion probes in the selftest); its allowlist, the
hooks, `verify_helpers.py` and the CI path filter follow the new paths. The
Grok preflight is now run as the module `bsproof.grok_adapter` (venv
interpreter). The LLM cache key holds no paths, so no cached extraction was
invalidated.

**Verified against a pre-change baseline:** selftest output identical except
the evasion count (8 → 13); `rescore_run --recompose` and `--verify` identical;
five offline experiment replays identical; invariants; 48 Python tests; the
shadow wiring self-check; a `--wiring` run (same output bar network/store
lines); typecheck, lint, knip, 491 unit tests, build, 52/52 Playwright.

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
