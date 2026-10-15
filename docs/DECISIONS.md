# Decisions

Founder decisions about the method: what is open, what is decided, and the
agreed work list for evidence method v2. The method itself is `docs/METHOD.md`.

**How to use this file.** A change that moves a constant (CLAUDE.md invariant 4)
or a rule is proposed here first, with its evidence, and becomes code only after
the founder decides. When an item is decided, move it to "Decided" with its
date; delete anything that no longer applies. Dated history goes to
`docs/history/project-log.md`, not here.

Last swept: 2026-10-15 (v14 retired; its open items were closed with it).

---

## Open

1. **Off-target populations** (from 2026-10-13). Trials in a `different`
   population (patients, clinical groups, children) are refused for a
   healthy-adult product; `adjacent` ones are reported, not downgraded
   (METHOD §8). Options: keep excluding; count `adjacent` as GRADE indirectness;
   grade other populations as their own ECU. Weight of the question (run
   20261013_072633): creatine strength lost 9 trials, lean mass 6.
2. **MCIDs for the remaining outcomes.** 5 of 31 outcomes have an approved
   threshold (METHOD §14); every other graded outcome uses the flagged 0.2 SD
   default. Needs a sourced table per outcome before those grades mean
   "noticeable".
3. **Second reviewer on by default?** S5R is opt-in, so every pooled number is
   read once (METHOD §7). Turning it on adds one Opus call per study whose
   numbers get pooled.
4. **Imprecision for tiny evidence.** A single 14-participant trial grades **A**
   today (muscle soreness, sleep quality): the 400-participant
   optimal-information-size rule costs only one level (METHOD §12). Proposal:
   −2 when far below it (e.g. under half), or at most "Low" certainty at k = 1.
   This changes `grade.RULES`.

## v2 work list (agreed 2026-10-15, after the simplification)

Ordered by how much each distorts the grade. Items 4, 5 and 9 also need the
decisions above.

| # | Problem | Proposed fix |
|---|---|---|
| 1 | One small trial earns an A | Open decision 4 |
| 2 | A failed table fetch during the span check silently refuses a trial: the stored creatine run says strength k = 7 "I", a cache-only replay of the same extraction k = 9 "C−" | Its own refusal reason, retried; no report while any verification fetch is unresolved (like the usage-limit guard) |
| 3 | The largest refusal is "no verified effect estimate and incomplete arm statistics" (68 trial–outcome pairs in the stored v1.36 creatine run) | A deterministic breakdown of causes first, then targeted fixes |
| 4 | Benchmark coverage too low (strength 29–38 %): v2 runs use `--full-text-only`, so 295 of 386 creatine RCTs (abstract-only) are never read | An abstract-inclusive run with abstract span checks and a risk-of-bias downgrade; later, per-trial effects from reviews' forest plots |
| 5 | Off-target populations excluded (41 refusals) | Open decision 1 |
| 6 | v14's claim-level arm check (`_resolve_claim_arms`) never ran in v2 | Measure offline how many pooled claims it would refuse; port it if any |
| 7 | Every pooled number is single-read | Open decision 3 |
| 8 | Run-to-run stability never measured (outcome mapping moves ±2 trials per outcome) | `scripts/experiments/extraction_stability.py`, run solo |
| 9 | The benchmark has no negative controls | Each new ingredient adds a "does not work" or "harms" row (METHOD §16) |

When v2 validates (METHOD §16): connect `lib/analyze/grade-v2.ts` in
`lib/analyze/scan.ts`, build a grade card, remove the "not active yet" notice
(`docs/APP.md` §4).

## Decided

All accepted by the founder **"for now, may revisit"** unless stated.

| Date | Decision |
|---|---|
| 2026-10-15 | **v2 is the method; v14 retired** (`docs/history/v14-scoring-model.md`). The app shows no grade until v2 validates. Grok backend, SR-table route, table route and the Evidence Ledger removed. |
| 2026-10-13 | Off-target populations excluded for now (open decision 1). |
| 2026-10-12 | Risk of bias read with S4's own meanings: HIGH only when blinding/placebo is missing; an undescribed randomisation method or incomplete attrition reporting is "some concerns" (METHOD §12). |
| 2026-10-05 | Two poolability fixes: an arm's missing n taken from S3's arm with the same label (flagged, variance only); matched add-on pairs kept (METHOD §8). |
| 2026-10-04 | Benchmark pass rule (`benchmark.RULES`, METHOD §16): coverage ≥ 50 %, CI width ≤ 2× the published median, overlap > half; failing coverage or precision is "not testable". Claims the two reviewers disagree on are refused, not adjudicated. |
| 2026-10-03 | Method v2 adopted. Letter grades with the table in METHOD §13. MCID policy (METHOD §14) and the first five approved values. GRADE thresholds in `grade.RULES` (METHOD §12). A CI too wide for any benefit row grades I. `adjacent` populations reported, not downgraded. Second reviewer: a different Claude model (Opus, 1 % tolerance); a different vendor later. Registry rule: −1 publication bias when unpublished registered trials ≥ trials pooled. Dose indirectness only below half or above double the trial dose. Baseline imbalance downgrades, never refuses. Per-arm SD from SE / CI (Cochrane §6.5.2.2) and the printed-table consistency guard. Next ingredient after creatine: vitamin C. |
| 2026-08-07 | Predatory venues are flagged and counted, never weighted (METHOD §15). |
