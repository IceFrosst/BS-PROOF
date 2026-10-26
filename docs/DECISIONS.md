# Decisions

Founder decisions about the method: what is open, what is decided, and the
agreed work list for evidence method v2. The method itself is `docs/METHOD.md`.

**How to use this file.** A change that moves a constant (CLAUDE.md invariant 4)
or a rule is proposed here first, with its evidence, and becomes code only after
the founder decides. When an item is decided, move it to "Decided" with its
date; delete anything that no longer applies. Dated history goes to
`docs/history/project-log.md`, not here.

Last swept: 2026-10-26.

---

## Open

From the first spot audit (run 20261026_034529, 2026-10-26; project log).
Ordered by how much each moves a grade.

1. **Polarity is per outcome, not per measure.** `energy_levels` ("fatigue or
   energy", `higher_better`) pools a fatigue score as if higher were better:
   the Hooper fatigue effect of `doi:103390nu17243831` enters reversed (g -0.17
   for less fatigue). Today it is the only pooled effect affected (a check of all
   49 against S5N's `effect_favours` and measure names), but sprint times
   (`muscle_power`) and time-trial times (`exercise_endurance`) are in scope too.
   Options: split the outcome by direction; or a per-measure `lower_better`
   pattern in `vocab/outcome.json`, matched like the measure hierarchy.
2. **No timepoint rule.** `doi:103390nu17061081` was pooled at its 7-day
   creatine-only wash-in (the authors attribute the LBM change to water), not
   after the 12-week intervention, because that claim came first. Proposal: the
   latest timepoint of the randomised comparison.
3. **A reported interaction effect size taken as an SMD.** `reported_smd_p` took
   "d = 0.95" from a group x time interaction (`doi:103390nu12061880`, leg press
   endurance) and its interaction p. Proposal: accept a reported SMD only when it
   is a between-arm contrast, else refuse with its reason.

## v2 work list (agreed 2026-10-15, after the simplification)

Ordered by how much each distorts the grade (10 is clean-up, not accuracy).
Items 1, 5 and 7 were decided 2026-10-16 (below); 2, 3 (offline part), 6
and 10 are done.

| # | Problem | Proposed fix |
|---|---|---|
| 1 | One small trial earns an A | **Done 2026-10-16:** imprecision −2 below 200 participants, −3 below 100 (decided below) |
| 2 | A failed table fetch during the span check silently refuses a trial: the stored creatine run says strength k = 7 "I", a cache-only replay of the same extraction k = 9 "C−" | **Done 2026-10-16:** fetches retried; a failure is marked `table_fetch_failed` with its own refusal reason; no report while one is unresolved |
| 3 | The largest refusal is "no verified effect estimate and incomplete arm statistics" (64 trial–outcome pairs in the replayed v1.36 creatine run) | **Done 2026-10-16 (offline part).** Breakdown: 40 have no outcome values in the text read (figures / untabled text — not recoverable from text), 12 post values without an SD, 5 only a p-value, 5 numbers not verified, 2 other. Fixed: tables whose outcome label is a section-header row (4 trials recovered; strength coverage 38 → 42 %, lean mass 59 → 65 %). The refusal now names the specific gap. Left: the missing SDs (item 10's prompt bump) and open decision 1 (p-value effects) |
| 4 | Benchmark coverage too low: strength 42 % (10 pooled of 24 trials read and in scope; 7 figure-only, 4 no SD, 2 incomplete, 1 not a placebo contrast) | **Decided 2026-10-17: no abstracts, no outside sources.** Coverage already counts only trials we read, so abstract-only trials never lowered it. Run 20261017_222637 (v1.38): the SD fix recovered 2 of the 3; strength 57 % and lean mass 69 %, both PASS (that run's S5 saw a 2,225-char text slice, fixed 2026-10-18; re-run pending). Open: a reliable way to read figure-only results from the paper itself |
| 5 | Off-target populations excluded (41 refusals) | **Decided 2026-10-16: keep excluding** for healthy-adult products; revisit later as separate populations |
| 6 | v14's claim-level arm check (`_resolve_claim_arms`) never ran in v2 | **Done 2026-10-16: not ported.** It would refuse 9 of 49 pooled effects, all computed from both arms' own statistics against an ingredient-free control; its objections concern the test the paper reported (within-group, time main effect, omnibus) or a bookkeeping field v2 does not use. Porting it would drop 6 effects that point against creatine |
| 7 | Every pooled number is single-read | **Decided 2026-10-16:** S5R on by default; takes effect at the next extraction run (step 3) |
| 8 | Run-to-run stability never measured (outcome mapping moves ±2 trials per outcome) | `scripts/experiments/extraction_stability.py`, run solo |
| 9 | The benchmark has no negative controls | Each new ingredient adds a "does not work" or "harms" row (METHOD §16) |
| 10 | The extraction prompts still carry v14 wording and ask for fields only v14 read; S5N leaves the arm SD empty when it reads endpoint / post values | **Done 2026-10-16 (prompt v1.37; v1.38 after the smoke test), takes effect at the next extraction run.** S5 lists outcomes only (identity, no numbers: 440 → 108 prompt lines; the extraction prompts 1 091 → 739 lines in all); S5N is the only number reader and is told that endpoint means are the post values with the SD beside them (measured: 35 claims had post values and no mean/SD, 12 refused); S3 drops `self_declared_underpowered`, two legacy arm fields and a duplicate deficiency field; S7 is per arm only; S4, S6B, S8 lose unused fields and v14 wording. Re-pooling the stored v1.36 extractions with the new code: evidence block byte-identical |

When v2 validates (METHOD §16): connect `lib/analyze/grade-v2.ts` in
`lib/analyze/scan.ts`, build a grade card, remove the "not active yet" notice
(`docs/APP.md` §4).

## Decided

All accepted by the founder **"for now, may revisit"** unless stated.

| Date | Decision |
|---|---|
| 2026-10-26 | **Endpoint effects are ANCOVA-adjusted for the baseline difference**, for every parallel trial whose arms' baselines are verified, never only the imbalanced ones (`effect_size.RULES["ancova_r"] = 0.5`; each outcome also reports r = 0.3 and 0.7). Pre SDs are not extracted, so the post SDs stand in (S5N / S5R to read them in v1.41). Measured on run 20261026_034529: 11 of 34 pooled endpoint effects had pointed the other way from their change; strength B+ → **C Moderate** (+0.21 → +0.19 [+0.01, +0.38]; B+ at r = 0.3), lean mass D+ Low → **D Moderate** (+0.14), power I. Converting only the `baseline_imbalance` trials is biased by construction (lean mass +0.25) and was ruled out. |
| 2026-10-26 | **Eligibility per claim: arms whose known co-interventions differ are refused** (`eligibility.unmatched_claim_arms`; unknown keeps). Measured on run 20261026_034529: 5 claims refused, all one trial (`doi:103390nu13072303`, creatine + training + beef protein vs a no-training control, pooled at g 1.09-1.27); re-pooled, strength B+ (k = 12 → 11, +0.24 → +0.21), lean mass D Moderate → **D+ Low** (k = 11 → 10; its no-flaw weight falls below half), power I. |
| 2026-10-26 | **S5N / S5R contrast wording fix (v1.41), to run with the post-audit re-extraction.** S5N labels add-on controls (creatine + X vs X, X = caffeine, whey, bicarbonate, training) `vs_ingredient_arm`: 8 claims at v1.39, 21 at v1.40, which refuses the matched pair invariant 7 keeps. Tell the model the target ingredient alone decides the label, with that example. Upper bound offline (label corrected from S3 arm presence): estimates return to the v1.39 run's. |
| 2026-10-25 | **Effects from an exact p-value: built** (`effect_size` route `smd_from_p`, ranked last). Only an exact two-sided p from a two-group test of the two arms (S5N / S5R `p_test`, which both readers must agree on), on endpoint values or changes, in a parallel trial with both arm sizes and a stated favoured arm; every other test refused with its reason; each outcome that uses it also reports estimate and letter without it. Measured: 8 creatine trial-outcomes refused as "only a p-value" on run 20261023_190836. |
| 2026-10-25 | **Spot-audit pass rule:** consequential errors only; 0-1 of 20 pass, 2-3 extend to 40 (pass at ≤ 3), ≥ 4 fail; one reversed direction fails (METHOD §16). |
| 2026-10-25 | **Stability pass rule:** same letters for outcomes with k ≥ 3 (one step only where threshold-sensitive), estimates within 0.1 SD, ≥ 90 % agreement per grade-feeding fact (METHOD §16). |
| 2026-10-25 | **Grade card shows the letter at the threshold only**, with a "borderline" marker when the M/2 or 2M letter differs (APP §4). |
| 2026-10-25 | **S4 items 3, 4 and 6 stay reported only**, not graded. Measured: items 3 / 4 unknown for 21-22 of the 22 trials pooled for strength, lean mass or power, so grading them would change no creatine letter; revisit for an ingredient with registered trials. |
| 2026-10-25 | **Lean mass keeps the 0.2 SD threshold.** Searched 2026-10-20: no anchor-based MCID exists for lean or fat-free mass (a surrogate people do not feel); 0.2 SD is the standard distribution-based smallest worthwhile change, and the creatine benchmark rows sit around it (+0.11 to +0.24 SD). |
| 2026-10-25 | **Attrition: reporting gaps are not a flaw; a real attrition problem is.** S4 item 5 = 0 (per-arm numbers or reasons missing) is "unclear"; the new S4 item 7 (dropout ≥ 20 %, differing between arms, or caused by the intervention) is "concerns" (S4 v1.40). Re-pooled run 20261023_190836 before item 7 exists: strength C+ (Low) → **B+ (Moderate)**, lean mass D+ (Low) → **D (Moderate)**. |
| 2026-10-25 | **Per-agent prompt versions** (`claude_adapter.AGENT_PROMPT_VERSION`): a one-agent prompt change re-runs that agent only (CLAUDE.md invariant 3). |
| 2026-10-20 | **Risk of bias downgrades only for a reported flaw** (no blinding/placebo, incomplete attrition reporting, baseline imbalance), never for an undescribed method or an unknown item (`grade.RULES["rob_no_flaw_weight_ok"]`, `pool.rob_status` "concerns"). Replayed run 20261019_235728: strength D+ (Low) → C (Moderate), k = 12, +0.18 [+0.04, +0.31]; lean mass and power unchanged (I). |
| 2026-10-20 | **Spot audit is a validation check** (METHOD §16); pass rule open (decision 4). |
| 2026-10-20 | **S4 item 1 counts any named randomisation tool or procedure** (`PROMPT_VERSION` v1.39). Measured: 7 of 86 item-1 zeros quoted one. |
| 2026-10-20 | **S5 collapses only onto a value the paper prints** (no invented left + right or multi-test composites), drops baseline-only measures, names the test rather than its place in the session; S6B: a fresh test before a time trial is the capacity (v1.39). |
| 2026-10-16 | **Imprecision scales with information size:** −1 below 400 participants, −2 below 200, −3 below 100 (`grade.RULES` `ois_*`). Measured: the single 14-participant trials that graded A now grade I; no other creatine letter changed. |
| 2026-10-16 | **Populations:** only healthy-adult trials are graded for a healthy-adult product; other populations stay excluded (measured: including them adds 5 trials and lowers strength C− → D+). Separate population grades are for later. |
| 2026-10-17 | **Data comes only from the trial papers' own full text:** no abstract-only extraction, no outside sources (other databases, reviews' forest plots); the coverage rule is unchanged. Revisit only for a reliable way to read data from the studies themselves. |
| 2026-10-16 | **MCIDs are sourced per ingredient, as it is added** (METHOD §14): before an ingredient's run, its graded outcomes without an approved MCID get a sourced, quoted table for the founder to approve; until then the flagged 0.2 SD default stands. Natural-unit MCIDs also keep their own unit so a result can be read in it. First: vitamin C. |
| 2026-10-16 | **Second reviewer (S5R) on by default** (~25–35 Opus calls per creatine run). |
| 2026-10-15 | **v2 is the method; v14 retired** (`docs/history/v14-scoring-model.md`). The app shows no grade until v2 validates. Grok backend, SR-table route, table route and the Evidence Ledger removed. |
| 2026-10-13 | Off-target populations excluded for now (confirmed 2026-10-16, above). |
| 2026-10-12 | Risk of bias read with S4's own meanings: HIGH only when blinding/placebo is missing; an undescribed randomisation method or incomplete attrition reporting is "some concerns" (METHOD §12). |
| 2026-10-05 | Two poolability fixes: an arm's missing n taken from S3's arm with the same label (flagged, variance only); matched add-on pairs kept (METHOD §8). |
| 2026-10-04 | Benchmark pass rule (`benchmark.RULES`, METHOD §16): coverage ≥ 50 %, CI width ≤ 2× the published median, overlap > half; failing coverage or precision is "not testable". Claims the two reviewers disagree on are refused, not adjudicated. |
| 2026-10-03 | Method v2 adopted. Letter grades with the table in METHOD §13. MCID policy (METHOD §14) and the first five approved values. GRADE thresholds in `grade.RULES` (METHOD §12). A CI too wide for any benefit row grades I. `adjacent` populations reported, not downgraded. Second reviewer: a different Claude model (Opus, 1 % tolerance); a different vendor later. Registry rule: −1 publication bias when unpublished registered trials ≥ trials pooled. Dose indirectness only below half or above double the trial dose. Baseline imbalance downgrades, never refuses. Per-arm SD from SE / CI (Cochrane §6.5.2.2) and the printed-table consistency guard. Next ingredient after creatine: vitamin C. |
| 2026-08-07 | Predatory venues are flagged and counted, never weighted (METHOD §15). |
