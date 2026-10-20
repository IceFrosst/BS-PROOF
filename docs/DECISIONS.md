# Decisions

Founder decisions about the method: what is open, what is decided, and the
agreed work list for evidence method v2. The method itself is `docs/METHOD.md`.

**How to use this file.** A change that moves a constant (CLAUDE.md invariant 4)
or a rule is proposed here first, with its evidence, and becomes code only after
the founder decides. When an item is decided, move it to "Decided" with its
date; delete anything that no longer applies. Dated history goes to
`docs/history/project-log.md`, not here.

Last swept: 2026-10-20.

---

## Open

1. **Effects from an exact p-value** (deferred 2026-10-16: the founder will
   decide later; nothing changes until then). 5 creatine trial–outcome pairs
   (endurance 2, power 1, attention 1, one other; none strength or lean mass)
   report only the between-group p-value with the arm sizes, so they are
   refused (`pool.unpoolable_detail`: "only a p-value"). Cochrane's handbook
   (§6.5.2.3) derives a standardised effect from an exact p and n: p → t →
   SMD and its variance, sign from the arm the paper says did better.
   - *Keep refusing (today).* Every pooled number comes from printed group
     statistics, no assumptions. Cost: those trials are lost, and papers that
     report only a p are often the significant ones, so estimates may lean
     slightly low (negligible at 5 pairs).
   - *Add the conversion.* A standard, published route; the variance honestly
     reflects the small samples. Cost: valid only when the p comes from a
     simple two-group test (t-test of final values or of changes). A p from
     repeated-measures ANOVA, ANCOVA or a non-parametric test gives a wrong,
     often inflated effect, so the route depends on the extracted test type
     and must refuse everything else; rounded p ("p = 0.03") adds noise;
     "p < 0.05" is unusable; the direction comes from words, not numbers.
   - *Recommendation:* not now (no creatine benchmark outcome gains). Revisit
     if an ingredient has many such trials; if adopted, only an exact p from a
     two-group test of a parallel trial, flagged as its own route.

2. **S4 risk-of-bias items 3, 4 and 6 are extracted but unused.** The
   risk-of-bias rule (METHOD §12) reads items 1 (randomisation method), 2
   (blinding / placebo) and 5 (attrition). Items 3 (prospective registration),
   4 (reported primary outcome matches the registry) and 6 (intention to treat)
   are extracted and exported, never graded. Item 4 is RoB 2's selective-
   reporting signal (domain 5) and the most informative of the three. Options:
   use item 4 (and 3) as "some concerns" in the rule, or keep them reported
   only. Kept in the v1.37 prompts so deciding later needs no re-extraction.
   Postponed again 2026-10-20. Measured on run 20261017_222637 (22 trials
   pooled for strength, lean mass or power): item 4 unknown in 22, item 3
   unknown in 21, so either option changes no creatine grade today.

3. **Lean-mass threshold** (from decision "MCIDs per ingredient", 2026-10-17).
   Searched 2026-10-20: no anchor-based MCID for lean or fat-free mass exists
   (it is a surrogate that people do not feel, so the anchor method does not
   apply); only DXA precision (least significant change about 1.1 kg for one
   person's repeat scan, not a group-mean threshold). The 0.2 SD default is
   itself the standard distribution-based "smallest worthwhile change", and the
   creatine benchmark rows sit around it (+0.11 to +0.24 SD). *Recommendation:*
   keep 0.2 SD for lean mass and say so in its `threshold_source`; no
   constant moves.

4. **Spot-audit pass rule** (METHOD §16): no single kind of error (wrong arm,
   measure, number or risk-of-bias item) in more than 2 of 20 sampled pooled
   effects. Proposed 2026-10-20.

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
| 2026-10-20 | **Risk of bias downgrades only for a reported flaw** (no blinding/placebo, incomplete attrition reporting, baseline imbalance), never for an undescribed method or an unknown item (`grade.RULES["rob_no_flaw_weight_ok"]`, `pool.rob_status` "concerns"). Replayed run 20261019_235728: strength D+ (Low) → C (Moderate), k = 12, +0.18 [+0.04, +0.31]; lean mass and power unchanged (I). |
| 2026-10-20 | **Spot audit is a validation check** (METHOD §16); pass rule open (decision 4). |
| 2026-10-20 | **S4 item 1 counts any named randomisation tool or procedure** (`PROMPT_VERSION` v1.39). Measured: 7 of 86 item-1 zeros quoted one. |
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
