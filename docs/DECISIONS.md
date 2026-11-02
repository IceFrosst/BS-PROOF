# Decisions

Founder decisions about the method: what is open, what is decided, and the
agreed work list for evidence method v2. The method itself is `docs/METHOD.md`.

**How to use this file.** A change that moves a constant (CLAUDE.md invariant 4)
or a rule is proposed here first, with its evidence, and becomes code only after
the founder decides. When an item is decided, move it to "Decided" with its
date; delete anything that no longer applies. Dated history goes to
`docs/history/project-log.md`, not here.

Last swept: 2026-11-02.

---

## Open

Vitamin C, proposed 2026-11-02. Neither table is in the vocabularies yet.
Every quote was checked by script against the Europe PMC abstract; PMC full text
was unavailable for the Cochrane review and Juraschek (HTTP 500), so only abstract
numbers are used. Retraction status was checked by Europe PMC publication type only.

**O1. MCIDs (METHOD §14).**

| Outcome | Proposed | Source and quote | Note |
|---|---|---|---|
| `cold_duration` | **26.1 h**, converted to SD by the median control-arm SD of the pooled trials; 25 % for severity, shown beside | Barrett 2005 (doi:10.1177/0272989x04273147): "For the scenario based on vitamin C, mean SID was estimated as 26.1 h (95% CI, 23.2 to 29.3)". Barrett 2007 (doi:10.1370/afm.698): "The scenario based on vitamin C led to a mean SID of 25% (95% confidence interval [CI] 0.23-0.27)" | Asked of adults with colds, about a vitamin C scenario. No SD is published, so the rule is fixed now and applied after extraction, using SDs only; re-pooling needs no model call |
| `blood_pressure` | 0.2 SD default, flagged; 2 mmHg shown beside | Only source opened: a preprint on nuts (doi:10.1101/2021.05.21.21257564): "with the minimal clinically important difference being considered 2 mmHg" | States a convention without its origin; too weak to set the letter |
| `cold_incidence`, `inflammation_crp`, `glycaemic_control`, `depressive_symptoms` | 0.2 SD default, flagged | None usable. CRP 0.5 mg/L appears only in a trial protocol (NCT07229781); no HbA1c source was opened | Default per METHOD §14 |

**O2. Benchmark rows.** Estimates as published; a lower value is the benefit on all but the mood row.

| Outcome | Type | Published | Population | Source | Status |
|---|---|---|---|---|---|
| `cold_incidence` | **Negative control** | RR 0.97 [0.94, 1.00] | general community, 10,708 | Cochrane, Hemilä 2013 (doi:10.1002/14651858.cd000980.pub4) | Route built; RR likely "not testable", our CI will be far wider |
| `cold_incidence` | **Negative control** | RR 0.94 [0.87, 1.01] | respiratory illness, 10 studies across the review | Keya 2022 (doi:10.2174/2772432817666211230100723) | Route built; RR likely "not testable", our CI will be far wider |
| `depressive_symptoms` | **Negative control** | g 0.09 [-0.15, 0.33] | adults, depressed and not, 10 trials, 836 | doi:10.1016/j.genhosppsych.2021.04.006 | Usable; sign unstated, read from its subgroup (negative = benefit) |
| `cold_duration` | Benefit | SMD -0.36 [-0.62, -0.09] | respiratory infection | Keya 2022 | Usable; one row, from a lower-tier journal |
| `blood_pressure` | Benefit | SBP -3.84 mmHg [-5.29, -2.38] | mixed, 29 trials, median 8 weeks | Juraschek 2012 (doi:10.3945/ajcn.111.027995) | Usable |
| `blood_pressure` | Benefit | SBP -3.0 mmHg [-4.7, -1.3] | adults, 20 studies, 890 | doi:10.1080/09637486.2023.2264549 | Usable |
| `inflammation_crp` | Benefit | CRP -0.23 mg/L [-0.44, -0.03] | 12 studies, 893 | Jafarnejad 2018 (doi:10.2174/1381612824666181017101810) | Usable; significant heterogeneity |
| `inflammation_crp` | Benefit | CRP -0.73 mg/L [-1.30, -0.15] | 11 studies, 818; includes enriched foods | doi:10.1515/jcim-2019-0151 | Usable; I² 98 % |

Left out: Ran 2018 (doi:10.1155/2018/1837634) and doi:10.1007/s00228-018-2601-7, both
retracted; doi:10.1155/2020/8573742, vitamin C added to antivirals; Mason 2021 and Guan
2020, diabetic and hypertensive populations only; doi:10.1080/10408398.2019.1703642,
vitamin C and/or E; Ashor 2017, no overall number in its abstract, so `glycaemic_control`
has no row; Cochrane's 8 % and Hemilä 2023's 15 %, relative scales we do not pool.

## Work list (2026-10-28; replaces the 2026-10-15 list, whose items are done or decided below)

Status after run 20261028_082425 and the founder rule of 2026-10-28 (Claude's
recommendation is the decision when it is the most rigorous option, ties to
the cheaper one). "Next run" = settled by the next extraction run.

| # | Item | Status |
|---|---|---|
| A1 | Claim-level arm check refused matched trials over a vehicle or the form's counter-ion | **Done** (Decided 2026-10-28) |
| A2 | S5N mislabels add-on controls `vs_ingredient_arm` (prompt fix failed) | **Done**: contrast from S3 (Decided); 5 reviewer conflicts over the label and the never-reviewed claims settle at the next run |
| A3 | Strength coverage below 50 % | **Done**: 56 %, the benchmark passes |
| A4 | Strength estimate at the low end of the published ones (+0.13 vs +0.20-0.46) | Watch: overlaps all 6, but the two largest meta-analyses only through our upper bound; the figure route added one trial and did not move it |
| A5 | Interaction d's refused (8), arm data figure-only | D1 recovered few; `doi:103390nu12061880` stays out (readers split on the bars) |
| A6 | A sport-skill count ("successful kicks") mapped to muscle power | **Done**: `exclude_measures` |
| A7 | The RA trial's S5N call fails every run (SE = 0 rejected; answer as a string) | Off-target, harmless; fix if disease populations are graded |
| A8 | Reported mean differences that are interaction MDs | Checked: none pooled |
| B1 | Spot audit | **Passed**: seed 3 on run 20261031_201501, 0 consequential errors in 20 (seeds 1 and 2 failed before S4R and the pooled-SE rule) |
| B2 | Stability test | **Passed** (2026-11-02, METHOD §16): same letter on all 5 outcomes with k >= 3, largest estimate change 0.034 SD. Below 90 %, none moving a grade here: S4 items 2, 5, 7 (S4R absorbs them: 96 % after it), `ingredient_isolated` 88 %, outcome mapping 89 % (8 outcomes mapped only in production, 1 only in the fresh run, not explained; 4 of them discarded by the fresh run). Fix these prompts at the next planned bump, not on their own |
| B4 | `baseline_imbalance` flagged trivial baseline gaps | **Done** (Decided 2026-11-02): power D+ Low → D Moderate; takes effect in the archive at the next run |
| B3 | Negative-control benchmark rows | With the next ingredient |
| C1 | **41 of 138 studies extracted from abstracts** under `--full-text-only` | **Done**: no text, skipped (Decided); takes effect at the next run, fewer calls |
| C2 | ARISTOTLE (atrial fibrillation) passed the relevance gate on "creatine clearance" | **Done**: a marker mention |
| C3 | Repository landing pages counted as full text (`doi:101113ep087886`) | Open: no rigorous detector yet; produced no pooled effect |
| C4 | Papers whose figure, table and text disagree | Recorded; counted as paper errors in audits |
| C5 | p-values from tests that do not convert (7) | Refused with reason; no route planned |
| C6 | S4's "double-blind asserted, no placebo described -> 0" | **Checked** in seed 3: the audited false zeros were all cleared by S4R; the true ones (open-label, single-blind) were kept |
| D1 | Figure route | **Built and run** (2026-10-31): 27 claims read, 4 accepted, 3 pooled |
| D2 | High-resolution figures, individual-point plots | Low priority: refusals were mostly unstated bars, not resolution |
| D2b | S6B / S7 payloads carry vocabulary keys only code reads | Strip at the next planned prompt bump (it re-runs both); guarded by a test |
| D3 | "Independently funded only" sensitivity analysis (METHOD §15) | Planned |
| D4 | Grades for other populations | Later |
| D5 | Next ingredient: vitamin C (MCID table to approve, negative controls) | After validation |
| E1 | App: connect `grade-v2.ts`, grade card, remove the notice | When v2 validates (METHOD §16) |
| E2 | Phone / Supabase / Google verification; the big merge | Founder-scheduled |

## Decided

All accepted by the founder **"for now, may revisit"** unless stated.

| Date | Decision |
|---|---|
| 2026-11-03 | **Yes/no outcomes are pooled** (founder): S5N and S5R v1.42 read participants with an event per arm; route `event_counts`, ln(OR) × √3/π on the SMD scale (Chinn 2000; Cochrane Handbook v5.1 §9.4.6); 0.5 continuity correction (`effect_size.RULES`); `pool.ROUTE_RANK` 5.5, after reported estimates of a mean; the risk ratio is pooled for the benchmark only. All METHOD §16 negative-control candidates are event outcomes, and none could run. Episode counts stay unpooled. |
| 2026-11-03 | **Vitamin C preparation** (Claude per founder rule): `blood_pressure` and `glycaemic_control` are `lower_better`, because null refused every arm-statistics effect; `measure_hierarchy` for those two, `inflammation_crp` and `cold_duration`; benchmark rows may carry `benefit_direction`, and units ignore spacing. Re-pooled creatine: strength, lean mass and power estimates unchanged; blood pressure k 0 → 2 and blood sugar k 0 → 2, both I. |
| 2026-11-02 | **New benefit row "Possible"** (founder; `grade.TABLE`, `grade.benefit`): estimate > 0, CI excludes meaningful harm and holds both 0 and M; C− at High (unreachable) and Moderate, D+ at Low, I at Very low. "None" denied a benefit still inside the CI (strength +0.14 [-0.03, +0.30] read D); making those inconclusive would have put every creatine outcome at I, calling 14 trials unstudied. No new letter or constant. Must be tested by the negative controls: if a known failure earns C−, the row changes. |
| 2026-11-02 | **One dominant trial is shown, not downgraded** (Claude per founder rule). GRADE has no dominance domain and leave-one-out is already computed and stored. Measured: `doi:101249mss0000000000003202` carries 46 % of strength and 52 % of lean mass; leave-one-out range +0.105 to +0.222 and +0.102 to +0.141. The grade card (E1) must show the largest trial's weight beside the letter; no new constant. |
| 2026-11-02 | **A baseline gap counts as a flaw only beyond chance** (Claude per founder rule; `effect_size.RULES["baseline_gap_z"] = 1.96`, |gap| / SE on baseline SDs when verified, else endpoint SDs). RoB 2 question 1.3 asks whether a gap suggests a problem with randomisation; comparing it to the endpoint difference flagged null trials for trivial gaps, and ANCOVA already corrects the size. Downgrade-never-refuse (2026-10-03) stands. Replayed on 20261031_201501: flagged pooled effects 13 → 0; power D+ Low → D Moderate; no estimate moved; strength and lean mass unchanged. The rule fires on nothing in this run, so only unit tests exercise it. |
| 2026-10-31 | **Risk of bias is read twice: a flaw counts only when both readers report it** (Claude per founder rule; S4R on Opus, called only when S4 reports a flaw in a study with an effect; `pool.confirmed_s4`). Two independent RoB assessors is the Cochrane standard. Measured: in both spot audits every S4 error was a false flaw, prompt edits did not stop them, and on 8 known cases S4R cleared all 5 false flaws and kept both true ones. |
| 2026-10-31 | **An SD derived from an SE or CI of a result pooled over visits is refused** (Claude per founder rule). Measured: 3 pooled effects, none in strength or lean mass, incl. a g of 1.13. |
| 2026-10-31 | **Rejected: taking the error-bar kind from a paper's statistics statement** (about 4 non-strength effects; a paper can state SD for tables and plot SE, and an SE read as SD shrinks the effect by sqrt(n)). The 2 % figure tolerance is not moved. |
| 2026-10-28 | **The figure route** (`figure_means`, Claude per founder rule; pilot 2026-10-26): for a claim whose text gives no effect, its caption-identified PMC figure read by S5F and S5FR; kept only on agreement within 2 % of the y-axis (`figure.RULES`, new constant), the same plotted quantity and error-bar kind; plotted means only; ranked last (`pool.ROUTE_RANK` 7); every outcome also shown without it. Measured reach on run 20261028_082425: 23 (study, outcome) pairs in 16 studies, 3 of them strength (`doi:103390nu12061880`, `doi:103390nu9111169`, `doi:103390nu8030143`). Rationale: Cochrane accepts data read from graphs with dual extraction; the pilot put the median error at 0.03 SD. |
| 2026-10-28 | **Under `--full-text-only` an abstract is never extracted** (`run.corpus._best_text` returns no text for an abstract-only tier; the worker skips it as "no text"). Measured on run 20261028_082425 (cache-only tiers): 41 of 138 studies had been extracted from abstracts (36 with claims; 1 pooled effect, exercise recovery); without them strength coverage 42 -> 52 % and the strength benchmark PASSES (6/6, width x0.9), lean mass 79 %. Implements the 2026-10-17 decision. |
| 2026-10-28 | **Vehicles and counter-ions are not co-interventions** (Claude per founder rule): a bare carrier (`vocab/cointervention.json`) on every ingredient arm is the vehicle; the form's counter-ion (`vocab/form.json` `counter_ion`, via S7) is the form. A carrier only some ingredient arms get stays a co-intervention. Measured: 3 matched trials recovered (dextrose, maltodextrin, creatine nitrate); strength k 10 -> 13. |
| 2026-10-28 | **The contrast label comes from S3's arm facts** when both claim arms resolve (Claude per founder rule; `eligibility.with_s3_contrast`, also in `review.reconcile` and the S5R selection). Measured: the v1.41 wording left 20 mislabels. |
| 2026-10-28 | **Excluded measures per outcome** (`exclude_measures`; muscle power: sport-skill counts) and **"creatine clearance" is a marker mention** in the relevance gate (Claude per founder rule). |
| 2026-10-26 | **Timepoint: the end of the randomised supplementation period** (S5 `timepoint_role`, v1.41; `pool.TIMEPOINT_RANK` after the measure hierarchy: end, unstated, interim, after stopping). Measured case: `doi:103390nu17061081` was pooled at its 7-day wash-in. |
| 2026-10-26 | **A reported SMD is pooled only as a between-arm contrast** (S5N / S5R `smd_basis`, both readers must confirm). Measured on run 20261026_034529: the two pooled reported SMDs were both interaction d's from `doi:103390nu12061880` (leg press strength d = 0.33, endurance d = 0.95); refusing them takes strength C → **D Moderate** (k = 11 → 10, +0.19 → +0.14), the trial's arm data being figure-only. |
| 2026-10-26 | **v1.41 extraction bundle** (one re-run): S4 item 2 null for a placebo with blinding unmentioned, item 7 from stated counts only; S5 `timepoint_role`; S5N / S5R contrast wording, `sd_pre_*`, `smd_basis`. |
| 2026-10-26 | **Polarity per measure:** `vocab/outcome.json` `measure_direction` rules (11 outcomes) override an outcome's polarity for a measure (fatigue scores, PSQI / Hooper, sprint and time-trial times, reaction times, errors, fatigue indices, losses); a mixed measure is refused as "direction unclear". A sign that disagrees with S5N's favoured arm is flagged, not refused. Measured on run 20261026_034529: the Hooper fatigue effect -0.17 → +0.17; no other pooled effect changes (sprint times lose to power / jump in the hierarchy); 2 claims refused as unclear. |
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
