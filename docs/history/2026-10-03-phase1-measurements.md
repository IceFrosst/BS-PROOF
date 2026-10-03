# Evidence method v2 — Phase 1 measurements (2026-10-03)

Phase 1 of `docs/EVIDENCE_METHOD.md` §8: measure before changing anything.
Corpus: the retained creatine run `20260904_185830` (156 studies, 155 extracted).

## 1a. Poolability — DONE

Script: `scripts/experiments/poolability.py` (no model calls; part 2 uses the
free Europe PMC search + full-text services).

### What the CURRENT extractor captured (per mapped claim)

200 claims mapped to an outcome; 165 compare against an ingredient-free control.

| Tier | Claims | Poolable? |
|---|---|---|
| A — signed effect + 95% CI | 23 | yes |
| B — signed standardised effect + exact p | 1 | yes |
| C — raw difference + SD + n | 7 | yes |
| D — standardised effect + total n only | 3 | only by assuming equal arms |
| E — signed effect, no variance | 57 | no |
| no signed effect (unsigned, "neither", missing) | 74 | no |
| not a between-arm contrast | 35 | no (by design) |

Per outcome, trials with at least one poolable claim:

| Outcome | Trials with a mapped controlled contrast | Poolable now |
|---|---|---|
| muscle_strength | 37 | 10 (27%) |
| muscle_power | 32 | 4 (13%) |
| lean_body_mass | 25 | 6 (24%) |
| exercise_endurance | 19 | 1 (5%) |
| energy_levels | 2 | 1 |

**Caveat found in Phase 2 (same day):** the S5 schema already asks for per-arm
n / mean / SD on every claim, but the retained run's per-study record DROPPED
those fields, so this table only sees the summary-effect route and understates
what the extractor captures. The record now keeps them (`bsproof/run/extract.py`);
re-measure after the next extraction.

### What is IN THE PAPERS (deterministic scan)

| Text available | Studies | Arm-level mean ± SD/SEM or a CI | Exact p | Only "p < x" |
|---|---|---|---|---|
| PMC full text | 85 | **79 (93%)** | 66 | 15 |
| Abstract only | 52 | 28 (54%) | 19 | 10 |
| Unreadable (Europe PMC HTTP 500 on that article) | 18 | — | — | — |

### Conclusion

**The numbers needed for meta-analysis are mostly in the papers; the current
extractor does not capture them.** It extracts one summary effect per claim and
was never asked for per-arm means, SDs and group sizes. The v2 arm-level
extractor (Phase 2) should lift full-text trials from ~13–27% poolable towards
the ~90% the papers support. Abstract-only trials stay weak (~54% at best) —
another reason the method relies on full text.

Limits: the scan is a regex heuristic — a "mean ± SD" in a table may be a
baseline characteristic rather than an outcome, so it over-counts; papers whose
only full text is a PDF/HTML outside PMC were not scanned; 18 articles returned
server errors on every attempt.

## 1b. Extraction stability — harness READY, full run pending

Script: `scripts/experiments/extraction_stability.py`. Extracts the same 25
open-access creatine studies twice (selected deterministically, round-robin
across outcomes), each run with its own empty LLM cache, then compares every
field (agreement and Cohen's kappa), the outcome mapping (Jaccard), per-agent
failure rates, and the resulting scores. Unit tests:
`tests/test_extraction_stability.py`.

**Live smoke (1 study, both runs, 2026-10-03):** the production Claude path works
on this machine (~50 s per study). Even on one paper the runs differed: the S7
agent failed with `max_turns` in run B; one lean-body-mass claim flipped
"unclear" → "null_effect"; study duration, funding class and one p-value
disagreed. One study is not a measurement — the 25-study run is.

**To run (≈ 500 model calls, ~20–25 min per run, on the Claude subscription —
run SOLO, with no other Claude session or extraction active):**

```bash
.venv/bin/python scripts/experiments/extraction_stability.py run --label A
.venv/bin/python scripts/experiments/extraction_stability.py run --label B
.venv/bin/python scripts/experiments/extraction_stability.py compare A B --out out/stability/A_vs_B.json
```

### 1b result so far (2026-10-03)

Run A completed 25/25; run B hit the subscription session limit midway (91
calls failed with "You've hit your session limit"), so the A-vs-B comparison
(`out/stability/A_vs_B.json`, 5 clean study pairs) is NOT a valid measurement.
Indicative only: comparator, n randomised, registration 100% agreement; claim
direction 70%, favoured arm 60%, p 60%; 3 of 4 effect sizes present in both runs
matched within 0.05. Rerun B after a limit reset, solo.

**`max_turns` diagnosis (run A: S1 6/25, S7 4/25, S5 1/25).** Captured raw
outputs showed correct objects with one free-text field a few characters over
its schema `maxLength` (S1 `rationale` > 300; S7 arm `evidence_span` > 200);
the CLI then requests a second turn that `--max-turns 1` forbids. Intermittent:
re-running the same calls passed. Fix: free-text limits raised ~1.5–2x in
S1/S3/S5/S6/S6B/S7 schemas (prompts keep the shorter targets); no
`PROMPT_VERSION` bump because a looser limit cannot invalidate a cached answer
(reasoning beside the constant). The adapter now records the shape of every
unrecovered failure (`failure_shape` in the call meta; raw stream in
`out/claude_failures/`). Pinned by `tests/test_schema_headroom.py`. Live
confirmation: the run-B rerun.

## Phase 1b result — run B completed (2026-10-03, later)

Run B resumed with the new `--resume` (redo failed studies from its own cache):
18 studies re-extracted in 342 s, no quota hit. Comparison in
`out/stability/A_vs_B.json` (first-pass comparison kept as `A_vs_B_firstpass.json`).

- **`max_turns` fix confirmed live:** A (pre-fix) 11 failed agents, B 3. The 3
  left are not length: two invented properties (`confidence`, `n_randomised_note`)
  and one 300-char evidence span — schema refusals, correct to refuse.
- **Methods facts reproduce well** (Cohen's kappa, 24–25 studies): comparator
  1.0, n_randomised 0.91, duration 0.91, n_analysed 0.79, RoB items 0.58–1.0,
  funding 0.77, S7 doses 1.0 (form kappa ≈ 0 is the kappa paradox: 89 % agree,
  almost all one value). Weakest: ingredient_isolated 0.51 and
  self_declared_underpowered 0.58 — both eligibility gates.
- **Claims** (30 shared outcome pairs): direction kappa 0.75, effect_favours
  0.59, effect_size 0.64, CI 0.83; outcome-mapping Jaccard 0.93.
- **v2 effects: when both runs read the SAME endpoint, the numbers are
  identical** (7/7 pairs; the one 174 vs 0.53 "difference" is B reading
  appendicular lean mass where A read total fat-free mass). **The instability is
  WHICH endpoints become poolable, not misreading:** an effect in either run 13,
  in both 7. Measured causes: (1) claim splitting — A split four jump tests into
  four claims with arm SDs, B lumped three into one claim with no SDs;
  (2) endpoint choice (ALM vs total FFM); (3) a failed S3 cascading into
  unlabelled arms. Pooled grades are I in both runs, but A pools muscle_power
  k=2 and B k=0, lean_body_mass 1 vs 2.
- **Implication:** the second reviewer (`pipeline/review.py`) guards against
  misreads, which look rare; it does not fix omissions. Next lever is the S5
  claim rule (one claim per reported measure, with numbers, and a deterministic
  endpoint preference in the pool) — a prompt change, so a `PROMPT_VERSION`
  bump folded into the planned re-extraction.

## Pre-re-extraction smoke tests (2026-10-03, later) — re-extraction NOT started

Three smoke runs with the second reviewer on (`SP_SECOND_REVIEWER=1`,
`extraction_stability.py --label RSMOKE/RSMOKE2/RSMOKE3`, 2 + 6 + 6 studies):

1. **RSMOKE (v1.29):** reviewer disagreed on 7/7 claims. Cause: claims were sent
   whose verified numbers made no effect, and every categorical field was
   compared. Reviewer 2 (Opus) itself read the jump paper's printed pre/post
   mean ± SD correctly; reviewer 1 (S5) had framed the same outcomes as change
   scores. Fixed: only effect-making claims are sent; only the fields the effect
   route reads are compared (`review.ROUTE_FIELDS`); the reviewer is told the
   estimand and what `found` means (v1.30).
2. **RSMOKE2 (v1.30):** 0/13 mapped claims made an effect, so 0 reviews. Cause:
   S5 put COMPUTED change scores (post − pre, and their SDs) in arm fields; the
   span check rejected them because they are printed nowhere.
3. **RSMOKE3 (v1.31, "copy, never compute; prefer printed post values"):** still
   0/13. S5 no longer computes, but it keeps framing claims as change scores and
   leaves the arm fields empty rather than switching to the printed post values.

**Conclusion:** the binding problem is reviewer 1's arm-level extraction, not
the reviewer. A full creatine re-extraction now would give almost no poolable
trials (every grade I) and the second reviewer would almost never run. The one
extractor that read the numbers correctly was the focused, per-claim S5R prompt.
Proposed next design (not built): a dedicated per-claim NUMBERS extractor
(Sonnet) shaped like S5R, run beside S5R (Opus) as the two independent
reviewers, so S5 keeps direction/eligibility and numbers come from two focused
reads that the span check and `pipeline/review.py` reconcile.

## S5N numbers extractor smoke test (2026-10-03, later) — RSMOKE4, v1.32

The per-claim NUMBERS extractor proposed above was built (S5N, Sonnet tier B,
`prompts/s5_numbers.md`, `bsproof/workers._extract_numbers`, on by default;
S5R Opus stays reviewer 2). Same 6 studies as RSMOKE3, `SP_SECOND_REVIEWER=1`,
0 failed agents, 101 s. Report: `extraction_stability.py numbers RSMOKE4`.

**Still 0/12 mapped claims make an effect — but S5N reads correctly.** By claim:

| claims | what the paper prints | S5N read | why no effect |
|---|---|---|---|
| 4 (jump tests) | arm-per-row table: CrM row, CON row, change ± SD | all six arm numbers, correct | span quoted only the CrM row and `table_provenance.row` combined both labels ("SJ (cm) / CrM; SJ (cm) / CON"), so the span check could not find the control values |
| 3 (leg/chest press, grip) | per-arm change with **95% CI**, no SD | means, SD null (correct: never convert) | no SD; a per-arm CI -> SD conversion would make all three |
| 1 (whole-body FFM) | post mean ± **SE** (methods: "mean ± SE") | means, SD null (correct) | no SD; SE -> SD (x sqrt n) would make it |
| 4 | text only (NS / "p<0.05" / one exact p, crossover) | nothing, or p only | genuinely not poolable |

Conclusion: reviewer 1 is no longer the binding problem. Two fixes would make
8 of the 12 poolable: (a) prompt — quote every arm's row and give the row
label alone; (b) documented per-arm SE -> SD and CI -> SD conversions
(Cochrane Handbook 6.5.2.2), deterministic and flagged, which needs S5N to
report per-arm SE / CI. The second reviewer never ran live (no effect-making
claims). The nutrients paper's 3 claims are cognitive outcomes outside the
smoke run's 5-outcome allowlist.

## RSMOKE5 (v1.33): both fixes — 7/11 effects, all reviewer-agreed

Same 6 studies, `SP_SECOND_REVIEWER=1`, 120 s. Fixes: S5N quotes every arm's
row with a single row label; per-arm SE / CI copied into their own fields and
converted deterministically (`effect_size._derive_arm_sds`, Cochrane §6.5.2.2,
route `arm_stats_derived`, flagged).

- **7 of 11 mapped claims make an effect; S5R (Opus) agreed on all 7, 0
  conflicts.** 4 jump tests `arm_stats`; chest press + hand grip SD from the
  per-arm 95% CI; whole-body FFM SD from SE.
- The 4 without an effect are correct refusals: text-only results (1RM, 8
  exercises), TTE (exact p only, crossover), sprint (no ingredient-free
  contrast stated), leg press (the creatine arm's analysed n is not printed --
  "one participant ... was unable to complete the leg press" -- so S5N left it
  null). Ceiling on these papers: 7/11 reached.
- 1 failed agent: S5 `max_turns` on the cognitive paper (intermittent; it
  passed in RSMOKE4; its outcomes are outside the smoke allowlist).
- Shadow pool: muscle_power k=1 g=+0.60, muscle_strength k=1 g=-0.40,
  lean_body_mass k=1 g=-0.30; every grade I (one trial each), as expected.

**Two validity problems the double extraction cannot catch** (both readers copy
the same printed numbers faithfully):

1. **Misprinted / misparsed table cells.** In doi:10.1080/15502783.2022.2108683
   Table 2 the ∆ cells of DJ and CMJ are swapped (DJ: 1.1 -> 1.6 printed ∆ 4.1;
   CMJ: 31.1 -> 35.2 printed ∆ 0.5). Whether the paper or our table parser
   swapped them is not yet checked. Proposed guard (deterministic, not built):
   when before, after and ∆ are all printed, refuse the claim if ∆ != after -
   before at printed precision -- needs S5N to also copy the before / after
   values.
2. **Endpoint values under baseline imbalance.** Whole-body FFM: creatine
   62.9 -> 65.4 kg, placebo 68.0 -> 67.6 kg. Change favours creatine, but
   the post values (the only ones with a spread) give g = -0.30 because the
   arms started 5 kg apart (n = 10 per arm). Cochrane accepts endpoint values
   for RCTs, but with small arms this flips the sign. Needs a rule (founder
   call): e.g. refuse or downgrade an endpoint-only effect when the baseline
   difference exceeds the effect.

## RSMOKE6 (v1.34): consistency guard + baseline-imbalance flag, live

Same 6 studies, `SP_SECOND_REVIEWER=1`, 135 s. Both readers now copy each
arm's printed baseline / post values (`pre_*` / `post_*`), span-verified on
every claim that printed them.

- **Guard works on the real swap:** DJ (printed ∆ 4.1, post − pre 0.5) and
  CMJ (printed ∆ 0.5, post − pre 4.1) are refused as "printed numbers
  inconsistent"; SJ and ABJ pass and are reviewer-agreed. muscle_power now
  pools SJ (g = +0.30) instead of the swapped CMJ value.
- **Imbalance flag works:** whole-body FFM carries `baseline_imbalance`
  (baselines 62.9 vs 68 kg, endpoint difference 2.2). Its S4 risk of bias was
  already "high", so the cap changed nothing here.
- 13 mapped claims (S5 split one more), 5 effects, all reviewer-agreed; the
  other 8 are correct refusals (2 by the guard, leg press n unknown, 5 with no
  usable printed numbers or no ingredient-free contrast).
- **2 failed agents: S7 `max_turns`** (2 of 6 studies; S5 hit the same
  intermittent failure once in RSMOKE5). S7 supplies form and dose, which v2
  uses for indirectness, so a full run must `--resume` its failures.

## S7 `max_turns` root cause and the v2 benchmark (2026-10-03, later)

**S7 failures fixed.** 6 of the 7 S7 `max_turns` failures across A, B and the
smokes were arms carrying the top-level `confidence` / `salt_family` (the
prompt asks for them; the arm schema refused them). Arm items now accept both,
optional; S5 `effect_unit` cap 40 -> 60. No bump (loosen-only). RSMOKE6
`--resume`: the 2 failed S7 calls succeed, every arm carries both fields.

**Benchmark (Phase 2/4 validation).** `vocab/benchmarks.json`: 19 published
pooled estimates from **10 creatine meta-analyses** (strength 9, lean mass 8,
power 2), each with population, comparison, scale and a verbatim quote cut
programmatically from the Europe PMC abstract / PMC full text / PMC table.
`scripts/benchmark_v2.py verify`: **19/19 quotes found in the live sources,
every number in its quote.** Comparison is like for like only
(`pipeline/benchmark.py`: SMD vs our SMD pool, MD vs our MD pool in the same
unit).

**The 2026-08-11 "verbatim-verified" table was partly wrong.**
10.3390/nu17020238 is a systematic review with no meta-analysis; its three rows
were misattributed (CMJ 2.70 cm and Wingate 71.27 W are
10.3389/fnut.2026.1800546's; exercise_endurance SMD 0.05 [-0.26, 0.36] is in
none of the 12 sources). Recorded under `excluded`; the old script is
annotated, not rewritten.

**First comparison (RSMOKE6, k = 1 per outcome) is uninformative by design**:
a one-trial CI (SMD -1.24 to +0.44) overlaps almost every published CI. CI
overlap only discriminates once the full re-extraction gives real pools. It
also exposed `effect_unit` holding measure names ("DXA total body BF-FFM"),
which blocks the natural-unit pool and every kg benchmark -> v1.35.

**RSMOKE7 (v1.35)**: 0 failed agents (first clean smoke since the S7 fix);
`effect_unit` now "kg" / "cm" on every claim with a unit. One regression found
and fixed deterministically: for the FFM claim S5N chose `endpoint` and filled
only `post_*`, leaving `mean_*` null, so it lost its effect.
`effect_size` now reads an endpoint arm's mean from its verified post value
(the same printed number). Re-scored offline: 5/13 effects; every lean-mass kg
benchmark is now comparable (still k = 1, so overlap is uninformative). That
claim shows review "single" because review routing ran under the old code; a
new run sends it.
