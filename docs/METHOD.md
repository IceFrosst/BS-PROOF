# Evidence method (v2)

How BS-PROOF turns published research into a grade, per outcome, for one
supplement product. This is the current method. Rules that govern changes are in
`CLAUDE.md`; how to run it is `docs/PIPELINE.md`; open founder decisions and the
known problems are `docs/DECISIONS.md`. The retired v14 scoring model is
`docs/history/v14-scoring-model.md` (code at tag `v14-final`).

Code cites this file by section number (`METHOD §9`). Do not renumber; add new
sections at the end.

**Status (2026-10-15).** The pipeline grades with this method only, but the
result is a preview: `evidence_v2.STATUS = "shadow"` until the validation in §16
passes, and the app does not show grades yet (`docs/APP.md` §4).

---

## 1. What is graded

**Do what a Cochrane systematic review does, automated and per product.**

The unit is the **ECU**: `(ingredient, form, dose, outcome, population)`.
"Ashwagandha works for stress" is four questions — which preparation, at what
dose, for which outcome, in whom — and changing any one can flip the answer.
Every competitor grades the *ingredient*; this grades the *product*.

- Grades are **per outcome**, never one grade per product: averaging unrelated
  outcomes produces a number about nobody. The outcome set comes from the
  literature (§3, showcase), not from the user or the label.
- The trials for one outcome are pooled **across forms and doses**. Form, dose
  and population mismatch lower **certainty** (GRADE indirectness, §12); they
  never weight a trial and never raise a grade.
- Scope is **oral supplementation** in humans. IV, surgical, topical and
  marker-only mentions are out (§3, relevance gate).

## 2. Who does what

**A model only extracts. Everything that judges is deterministic code.**

| Step | Done by |
|---|---|
| Search, fetch, deduplicate, classify designs | Code (`sources/`, `pipeline/retrieve.py`, `dedup.py`, `classify.py`) |
| Read a paper into structured facts | Model agents (§7), one shot each, JSON in → schema-valid JSON out |
| Check every extracted number against the paper | Code (`pipeline/span_check.py`) |
| Effect sizes, pooling, certainty, letters | Code (`effect_size.py`, `meta_effects.py`, `pool.py`, `grade.py`) |

An agent is a pure function: no tools, no loop, temperature 0. A field it cannot
see is `null`, never inferred. Same input, same output: a fully agentic design
would grade the same bottle differently next week.

## 3. Retrieval

Per ingredient, from free sources only, all disk-cached so a run is replayable
(`sources/http.py`):

| Source | Role |
|---|---|
| Europe PMC (`sources/europepmc.py`) | Discovery, metadata, open-access JATS full text |
| PubMed tags (via Europe PMC) | publicationType / MeSH → design classification (§6) |
| ClinicalTrials.gov v2 (`sources/clinicaltrials.py`) | Registration facts for risk of bias; completed-but-unpublished trials (§12) |
| OpenAlex + Unpaywall (`sources/oa.py`) | Green open-access copies of paywalled papers |
| Crossref (`sources/crossref.py`) | Publisher of each DOI (predatory-venue flag, §15) |

- **Trials only.** The search asks Europe PMC for randomised controlled trials;
  systematic reviews are not retrieved (v2 never reads them: published
  meta-analyses enter only as the hand-checked benchmark, §16). A review record
  the search returns anyway is classified out (§6) and dropped.
- **Scope** (`--broad-scope` / `--supplement-scope` / `--intervention-scope` /
  `--per-outcome`): how tightly the ingredient must be the tested intervention.
  Intervention scope is what v2 runs have used.
- **Full text, in order:** Europe PMC open access, then a green OA copy
  (OpenAlex / Unpaywall, PDF via `pypdf`), else the abstract only.
  `--full-text-only` extracts only studies with readable full text: a study
  whose open-access copy cannot be fetched gets no text and is skipped as
  "no text", never extracted from its abstract (`run.corpus._best_text`;
  measured 2026-10-28: 41 of 138 studies had been extracted from abstracts).
- **Relevance gate** (`pipeline/relevance.py`, before any model call): the
  ingredient must appear as an oral / dietary intervention. Marker-only mentions
  (creatine kinase), topical and IV routes are skipped.
- **Showcase** (`pipeline/showcase.py`): by default only the top-N outcomes by
  Europe PMC RCT hit count are extracted; `--all-outcomes` grades the whole
  outcome vocabulary.

## 4. Deduplication

One trial is one unit, however many papers it produced (`pipeline/dedup.py`).
Canonical id, first match wins: registry id (NCT, ISRCTN, ChiCTR, CTRI, UMIN,
EudraCT) → DOI → PMID → fingerprint `(first author, year, n, country, dose)`. The
registry id is extracted from free text, never validated as the whole field, so
"NCT01234567 (primary outcome paper)" still collapses with its siblings.

Deduplication happens **at ingestion, before any conclusion exists**: thirty
reviews of nine trials are nine trials, and a model asked later whether
conclusions agree would count agreement as corroboration.

## 5. Vocabularies

Controlled vocabularies in `vocab/`, all operations over them in
`pipeline/vocab.py` (deterministic). An extraction that cannot be placed in a
vocabulary is discarded, never guessed.

- **Outcomes** (`vocab/outcome.json`, 31): label, definition, includes/excludes,
  search terms, **polarity** (which direction is benefit; no polarity → the
  outcome cannot be graded), optional **measure direction** (founder
  2026-10-26: patterns on the claim's measure name and unit that override the
  polarity for one measure, e.g. a fatigue score or a sprint time is
  `lower_better`; a mixed measure such as accuracy-and-reaction-time has no
  direction and is refused; `pool.measure_polarity`), optional **measure
  hierarchy** (which measure wins when a trial reports several, §11) and
  **MCID** (§14). An arm-statistics effect whose sign disagrees with the arm
  S5N says the result favours is flagged `sign_disagrees_with_reader`, never
  refused. Optional **excluded measures** (`exclude_measures`, founder rule
  2026-10-28): a measure the protocol leaves out of the outcome whatever S6B
  mapped (a sport-skill count is not muscle power), refused with its reason.
- **Forms** (`vocab/form.json`): per ingredient, with a salt family and molar
  masses. Form match is `exact` / `salt_family` / `different` / `unspecified`.
- **Dose conversion**: the label's compound dose → elemental / active-moiety mg
  by molar mass, in code (`elemental_dose_range_mg`). A hydrate whose water is
  unstated gives a **bounded interval**, not a point; a form with no fixed formula
  stays unconverted (`compound_only`). IU is never treated as a mass.
- **Populations** (`vocab/population.json`): four axes — age band, sex,
  deficiency status, pregnancy. Match composes by the worst axis: all `exact` →
  `exact`; any axis `different` → `different`; otherwise `adjacent` (`unknown`
  is a member of every axis and resolves to `adjacent`).

## 6. Design classification

From PubMed's publicationType and MeSH tags (`pipeline/classify.py`), in a fixed
order, because the order is load-bearing: a non-human subject overrides design,
so a randomised blinded rat study is not an RCT. Ranks: 1–3 umbrella / SR+MA /
SR, 4 RCT, 5 non-randomised trial, 6–9 observational, 10–11 case series / report,
12 animal, 13 in vitro, 14 opinion. A record the tags cannot settle stays
unclassified, never guessed. Only RCT-rank primaries are extracted; a review
(ranks 1–3) is dropped at retrieval and never pooled as a study (CLAUDE.md
invariant 6).

## 7. Extraction

Per study, `bsproof/workers.py`, through the one model boundary
`bsproof/claude_adapter.py` (Claude subscription, `--safe-mode`, cached by
the agent's prompt version + model + effort + payload):

| Agent | Reads | Returns |
|---|---|---|
| S3 study | full text | design, arms (label, n, role, ingredient presence, co-interventions), population axes, comparator, isolation, registration |
| S4 risk of bias | full text + registry | seven RoB items (randomisation method, blinding/placebo, prospective registration, outcome matches registry, attrition reported, ITT, attrition problem); §12 grades with items 1, 2, 5 and 7 |
| S4R second risk-of-bias reader (with `SP_SECOND_REVIEWER`) | the same paper, blind, a different model (Opus); only when S4 reports a flaw in a study that yields an effect | the same items; a flaw counts only when both report it (§12) |
| S5 outcomes | results + tables, S3 arms | one claim per separately reported measure: outcome, measure, timepoint and its role (end of supplementation / interim / after it stopped, v1.41), the arm pair, primary flag (no numbers) |
| S7 form & dose | methods + tables, S3 arms | per arm: form id, compound / elemental / per-kg dose, body mass, frequency |
| S8 funding | funding + COI statements | funding class, funders (reported, never graded; §15) |
| S6B outcome mapping | S5's outcome strings | one vocabulary id per claim, or `null` = discard |
| S5N numbers | the mapped claims' identity | per arm mean, SD, n, SE, CI, p, pre/post values, baseline SDs and participants with an event, as printed; estimand, contrast, design, the test behind a p, what a reported SMD compares (v1.41) |
| S5R second reviewer (on by default; `SP_SECOND_REVIEWER=0` off) | the same claims, blind | the same numbers, read by a different model (Opus) |
| S5F / S5FR figure readers (on by default; `SP_FIGURE_READER=0` off) | one figure image + its caption, for a claim whose text gives no effect | the plotted per-arm means, error-bar tops and what is plotted, read twice on two models (§10 `figure_means`) |

S3 runs first (S5 and S7 need its arms); S4, S5, S7, S8 in parallel; then S6B,
S5N and S5R. S5N is the only reader of numbers (since prompt v1.37): a claim it
gave no entry for is refused as "numbers not read", never as a data gap. Every
output carries evidence spans. A schema violation is retried twice, then
`null`, never repaired.

**Span check** (`pipeline/span_check.py`). A model may only copy numbers. Every
numeric field is verified against its source — the claim's quoted span, the
named table row, or (arm sizes only) the S3 arm record — at the number's printed
precision. A number that is not found is **refused**, never repaired. A cited
table that cannot be *fetched* (after retries) is a different thing: its claims
are marked `table_fetch_failed`, the refusal says so, and the run writes no
report until a re-run fetches it (`docs/PIPELINE.md` §4).

**Second reviewer** (`pipeline/review.py`). When S5R is on, two readings must
agree within 1 % relative or 0.005 absolute; any conflict refuses the claim for
human adjudication; reviewer 2 cannot add numbers. Only claims whose numbers
make an effect are sent. With S5R off (or a failed call), the effect is
single-read and the grade says so.

## 8. Eligibility

A study is refused, with its reason, when (`pipeline/eligibility.py`,
CLAUDE.md invariant 7):

- every arm receives the ingredient (no ingredient-free control);
- the ingredient is not isolated (a combination arm) — **except** a claim whose
  two arms are an explicitly matched add-on pair (same co-interventions, the
  ingredient in one arm only: `matched_addon_claim`);
- **per claim**, the two arms are known to differ in more than the ingredient
  (both arms' co-interventions listed, and the lists differ:
  `unmatched_claim_arms`, founder 2026-10-26). The study-level rule above reads
  S3's `ingredient_isolated`, which is "yes" when any pair isolates the
  ingredient, so this catches the other pairs of a multi-arm trial
  (A + X + ingredient vs no treatment beside A + X + ingredient vs A + X).
  What is part of the preparation is not a co-intervention (founder rule
  2026-10-28): a carrier (`vocab/cointervention.json`: dextrose,
  maltodextrin, cellulose ...) listed on every ingredient arm of the trial is
  the vehicle (a carrier only some ingredient arms get is a designed factor
  and counts), and the counter-ion of the arm's own form (`vocab/form.json`
  `counter_ion`, nitrate for creatine nitrate, read from S7) is part of the
  form;
- the claim is not a contrast against an ingredient-free control (§10). The
  contrast comes from S3's arm facts when both claim arms resolve
  (`eligibility.with_s3_contrast`, founder rule 2026-10-28); S5N's label only
  when they do not, and a reader's label then is not a reviewer conflict.

Unknown always means keep. v14's "authors declare it underpowered" refusal is
dropped: pooling already gives a tiny trial a tiny weight.

**Population (variant B).** The run's population is fixed (general adults by
default). A trial whose population is `different` (e.g. a disease population for
a healthy-adult product) is refused as off-target; `adjacent` is reported, not
downgraded. Kept so by founder decision (2026-10-16); grading other populations
separately is for later (`docs/DECISIONS.md`).

## 9. Dose and form matching

The tested arm's form and daily elemental dose are read from S7 **by arm label,
never by position** (`pipeline/dose.py` `_s7_for_claim`, `study_dose`). Per-kg
doses are multiplied only by the paper's own stated body mass; contradictory
dose fields are refused.

A product dose is compared with one trial's dose on four tiers
(`dose.dose_match_for`):

| Tier | Product dose vs trial dose |
|---|---|
| `in_band` | inside the trial's dose (or its interval) |
| `low_50_99` | 50–99 % of the trial's low end |
| `below_50` | under half |
| `above_200` | more than twice the trial's high end |
| `unspecified` | unknown dose, or an interval straddling two tiers (never rounded) |

Only `below_50` and `above_200` count as off-dose for indirectness (§12).

## 10. Effect sizes

`pipeline/effect_size.py`, arithmetic in `pipeline/meta_effects.py`. Positive
always means benefit, after the outcome's polarity. Routes, best first:

| Route | From |
|---|---|
| `arm_stats` | both arms' mean, SD, n → Hedges' g (and the mean difference) |
| `arm_stats_derived` | the same with an arm's SD derived from its printed SE or CI (Cochrane Handbook §6.5.2.2), flagged |
| `reported_smd_ci` | a reported SMD + CI + stated level. Every reported-SMD route needs S5N's `smd_basis` to say it compares the two arms (at endpoint or in change); an interaction / ANOVA effect size, a within-group one or an unstated basis is refused (founder 2026-10-26) |
| `reported_smd_p` | a reported SMD + an exact p |
| `reported_smd_n` | a reported SMD + both arm sizes |
| `reported_md_ci` | a reported mean difference + CI (natural units only) |
| `smd_from_p` | no estimate and no arm statistics: an exact two-sided p from a two-group test of these two arms (t-test, Welch, two-arm one-way ANOVA; S5N's `p_test`) on endpoint values or changes, both arm sizes and the favoured arm → t → Hedges' g (Cochrane Handbook §6.5.2.3). Parallel trials only; any other test is refused with its reason. Founder 2026-10-25. Every outcome that uses it also reports its estimate and letter without it (`sensitivity`) |
| `event_counts` | a yes/no outcome: verified participants with an event plus arm sizes in both arms, and no arm means. ln(OR) × √3/π on the SMD scale (Chinn 2000; Cochrane Handbook v5.1 §9.4.6), flagged `or_to_smd`; 0.5 added to all four cells when one is 0 (`continuity_correction`). Refused: no events or all participants in both arms, more events than participants (episodes, not people), crossovers. The risk ratio is also pooled, for the benchmark only (founder 2026-11-03) |
| `figure_means` | the text gives no effect: the claim's figure (picked by its caption, `figure.pick_figure`; PMC articles only) read by two readers on two models (S5F, S5FR); kept only when both agree within 2 % of the y-axis on every mean and error bar, name the same plotted quantity (values at timepoints, or changes) and the same error-bar kind (sd, se or ci95 as the caption states; unstated bars give no SD); reader 1's values, never averaged; never individual points or percent changes. Then the arm-statistics arithmetic as for printed numbers (ANCOVA included). Ranked last; every outcome that uses it also reports its estimate and letter without it. Founder 2026-10-28, from the 2026-10-26 pilot (`pipeline/figure.py`) |

- **Crossover trials**: arm statistics analysed as if parallel (Handbook
  §23.2.6, conservative), flagged; a paired MD with CI kept; a crossover SMD
  refused (it may be standardised by the SD of differences).
- **Consistency guard**: when pre and post values are verified too, a change
  mean must equal post − pre and an endpoint mean must equal post at printed
  precision, or the arm statistics are refused.
- **Pooled over visits**: an SD derived from an SE or CI is refused when the
  timepoint says the result is pooled or across visits (that SE counts
  observations, not people; founder rule 2026-10-31).
- **Baseline adjustment (ANCOVA)**, founder 2026-10-26: an endpoint
  arm-statistics effect of a parallel trial whose arms' baselines are verified
  uses the endpoint difference minus r × the baseline difference, standardised
  by the endpoint SDs, variance × (1 − r²) (Cochrane Handbook §10.5.2), with
  r = 0.5 (`effect_size.RULES`); flagged `ancova_adjusted`. The slope is
  r × SD_post / SD_pre when both arms' baseline SDs are verified (S5N v1.41,
  flagged `ancova_baseline_sd`). Applied to every such
  trial, never only the imbalanced ones (that selection is biased). Without
  verified baseline SDs, pre and post SDs are taken as equal. Each outcome that
  uses it also reports its estimate and letter at r = 0.3 and 0.7
  (`sensitivity`).
- **Baseline imbalance** (arms' baselines differ by more than chance allows:
  |difference| / SE > 1.96, RoB 2 question 1.3, Claude per founder rule
  2026-11-02): flagged; the trial's risk of bias is rated "concerns".
- **Refused**: anything not a between-arm contrast against an ingredient-free
  control, cluster or unstated designs, ratio and percent-change kinds, a
  favoured arm of "neither", percentages used as arm means without SDs.

## 11. Pooling

Per outcome (`pipeline/pool.py`):

1. **One effect per trial per outcome**, chosen by a fixed order so two
   extractions of one paper pick the same measure: the outcome's measure
   hierarchy, then the timepoint (founder 2026-10-26, `pool.TIMEPOINT_RANK`:
   the end of the randomised supplementation period, then unstated, then an
   interim phase, then a follow-up after supplementation stopped), then
   primary-outcome claims, then the strongest route (§10), then claim order. Pooling two endpoints of one trial would count it twice.
2. **REML random effects** on Hedges' g; **Hartung–Knapp** CI when k ≥ 3, a
   normal CI at k = 2; a prediction interval when k ≥ 3; a leave-one-out range.
3. A **mean-difference pool** in natural units only when every MD shares one unit.
4. **Every refusal is counted with its reason** — and a trial without usable
   numbers says which part was missing (no outcome values in the text, no SD,
   only a p-value, numbers not found in the paper: `pool.unpoolable_detail`); the estimand mix (change scores
   vs final values) is reported, never silently mixed.

Weight is inverse variance. Study quality never weights a trial; it lowers
certainty (§12).

## 12. Certainty (GRADE)

`pipeline/grade.py` `RULES` (founder-owned constants, CLAUDE.md invariant 4).
Start **High** for randomised trials, then downgrade per domain, floor Very low,
each downgrade with its reason:

| Domain | Rule |
|---|---|
| Risk of bias | Only a REPORTED flaw downgrades (founder 2026-10-20): none if ≥ 50 % of the weight is from trials with no reported flaw (low or unclear); −2 if > 50 % is high-risk; else −1. A trial is HIGH risk when blinding/placebo is missing (S4 item 2); CONCERNS when it has an attrition problem (item 7: dropout ≥ 20 %, differing between arms, or caused by the intervention) or its arms differed at baseline beyond chance; UNCLEAR when nothing wrong is reported but something is undescribed (randomisation method not named, attrition reporting incomplete (item 5), an item unknown), which does not downgrade (founder 2026-10-25). A flaw counts only when two independent readers report it (S4, S4R; `pool.confirmed_s4`, founder rule 2026-10-31); a disputed flaw is flagged `rob_flaw_unconfirmed` |
| Inconsistency | −1 at I² > 50 %, −2 at > 75 %; not assessed below 3 trials |
| Imprecision | −1 if the CI crosses 0 or the threshold, or fewer than 400 participants in total (optimal information size); −2 if the CI spans both ±threshold or fewer than 200 participants; −3 below 100 participants (GRADE's "extremely serious", 2021 guidance) |
| Indirectness | −1 per axis when > 50 % of the weight is not the product's exact form, or off-dose (§9); form + dose cap at −2. Populations: refused if `different`, reported if `adjacent` (§8) |
| Publication bias | Egger's test (α = 0.10) at ≥ 10 trials; and −1 when registered, completed, unpublished trials for the outcome are at least as many as the trials pooled (`pipeline/registry_bias.py`; an upper bound). Not stacked |

Domains that cannot be assessed (too few trials, no product dose given, a
single-read effect) are listed as **not assessed**, never silently skipped.

## 13. Letter grades

**Benefit** — the pooled estimate against the outcome's meaningful-change
threshold *M* (§14), in the good direction:

| Category | Rule |
|---|---|
| Large | estimate ≥ 2·M, CI excludes 0 |
| Meaningful | estimate ≥ M, CI excludes 0 |
| Small | 0 < estimate < M, CI excludes 0 |
| Possible | estimate ≥ M/2, CI excludes meaningful harm (lower > −M) and holds both 0 and M (founder 2026-11-02; M/2 floor 2026-11-04, DECISIONS O4) |
| None | CI excludes harm and the estimate is below M |
| Harm | estimate ≤ −M in the bad direction, CI excludes 0 |
| Inconclusive | a CI too wide for any row → grade **I** |

**Grade table** (founder decision 2026-10-03, `grade.TABLE`):

| Benefit \ Certainty | High | Moderate | Low | Very low |
|---|---|---|---|---|
| Large | A+ | A | B | I |
| Meaningful | A | B+ | C+ | I |
| Small | C | C | C− | I |
| Possible | (C−) | C− | D+ | I |
| None | F | D | D+ | I |
| Harm | F ⚠ | F ⚠ | D− ⚠ | I |

- **Possible** means probably helps, not confirmed (the estimate is at least half
  of M): not shown to work and not
  shown not to. Its High cell cannot occur, because a CI crossing 0 and M always
  loses a level for imprecision.
- **I = insufficient evidence**, never a low letter: *not studied* must never
  look like *studied and failed* (CLAUDE.md invariant 8).
- **F** means shown not to work (High certainty for "None") or harm (⚠, at
  least Moderate certainty).
- A letter always travels with its estimate, CI, k, certainty and downgrade
  reasons, and is re-graded at M/2 and 2M; a letter that moves is shown as
  threshold-sensitive.
- The run grades its own product (`run_grade`); `lib/analyze/grade-v2.ts`
  re-matches the stored trials to a scanned product's form and dose
  (indirectness only — the pooled numbers are never recomputed).

## 14. Meaningful-change thresholds (MCID)

The smallest change a person would notice, per outcome, on that scale. Policy
(2026-10-03; the founder approves the values):

1. Source hierarchy, recorded per outcome in `vocab/outcome.json` `"mcid"` with
   value, scale, population and a quoted citation: an anchor-based MCID from a
   similar population; one from a different population (only to make a grade
   stricter); a distribution-based value (labelled); none → **0.2 SD**, flagged
   as "statistical convention, no published MCID".
2. Every source is opened and quoted; no recalled numbers.
3. A value scores only with `"approved": true`.

Approved so far: muscle strength, power, muscular endurance, exercise endurance
(0.2 SD, Hopkins 2004 "smallest worthwhile change"), lean body mass (0.2 SD,
convention), cold duration (26.1 h, Barrett 2005), blood pressure (0.2 SD,
convention). Every other outcome uses the flagged default.

A value published only in natural units with no published SD is converted by the
median control-arm SD of the outcome's preferred-measure trials (`natural`,
`grade._threshold`, founder 2026-11-03): spreads only, after extraction, and the
flagged default when no trial gives a usable SD.

Values are sourced **per ingredient, as it is added** (2026-10-16): before an
ingredient's run, its graded outcomes without an approved value get a sourced
table for the founder to approve. A value stated in natural units (days,
minutes, mmHg) keeps that unit alongside its SD conversion.

## 15. Shown, never graded

Reported beside the result, never moving a grade:

- **Predatory venue**: the study's publisher (Crossref) matched against the
  Predatory Journals List (`pipeline/predatory.py`, `vocab/README_PREDATORY.md`);
  flagged and counted.
- **Funding**: S8's funding class is extracted and reported; an
  "independently funded only" sensitivity analysis is planned, not built.
- In the app, model-written disclosures (literature funding independence,
  publication bias, MLM business model) are badged "unverified" and never touch
  a grade (`docs/APP.md`).

## 16. Validation

What must hold before grades are shown to users:

- **Benchmark** (`vocab/benchmarks.json`, `pipeline/benchmark.py`,
  `scripts/benchmark_v2.py`): our pooled estimates against published Cochrane /
  umbrella meta-analyses, each row with a quoted, re-checkable source. Pass rule
  per (outcome, scale), all three: coverage ≥ 50 %; our CI no wider than 2× the
  median published width; our CI overlaps more than half of theirs. Coverage
  counts only trials the run READ: pooled / (pooled + refused for a data
  reason), so a trial we could not read, or refused as out of scope, is in
  neither number. It guards against grading a lucky, poolable subset of the
  trials we have. Failing coverage or precision is "not testable", never pass
  or fail. A row printed with lower = benefit carries `benefit_direction: "lower"`
  and is flipped to our benefit-positive scale; a risk-ratio row (`scale: "rr"`)
  is compared with our pooled risk ratio as printed, widths on the log scale.
  Today: 19 rows from 10 creatine meta-analyses, 8 vitamin C rows from 7
  reviews, 3 vitamin D strength rows from 2 (2026-11-03); on run 20261025_101638 lean mass
  passes (coverage 69 %), strength is not testable (44 %).
- **Negative controls.** The creatine rows are all successes, so a pipeline
  that called everything effective would pass them. The "does not work" rows
  are vitamin C (mood, cold incidence in the general population) and vitamin D
  strength (under-65s SMD 0.03, athletes 0.05); none has been testable yet
  (vitamin C run `20261103_101034`: k ≤ 1). Each new ingredient adds at least
  one "does not work" or "harms" row (`docs/history/v14-anchors.csv` lists
  candidates: vitamin E and cardiovascular events, beta-carotene and lung cancer
  in smokers, selenium and prostate cancer).
- **Stability**: the same studies extracted twice must give the same grades
  (`scripts/experiments/extraction_stability.py`; one fresh run with its own
  empty cache compared against the production run's dump, founder rule
  2026-10-28: as rigorous as two fresh runs, half the calls; it sends
  production's exact input, shown by a cache-only `forecast` where every call
  hits production's cache). Pass (founder 2026-10-25):
  every outcome with k ≥ 3 in both runs has the same letter (one step allowed
  only where the letter is threshold-sensitive), pooled estimates within
  0.1 SD, and ≥ 90 % agreement on each fact that feeds a grade (arms, numbers
  read, outcome mapping, S4 items 1, 2, 5, 7, and the rating after S4R). A fact below 90 % does not fail
  the method; it names the next prompt to fix. Letters and estimates are read
  from the whole run re-graded with the fresh readings swapped in (`compare`,
  `full_pool`), because the 25 sampled studies alone give k <= 3 and letter I.
  Result (run 20261031_201501, 2026-11-02): **passes**. All 5 outcomes with
  k >= 3 keep their letter; the largest estimate change is 0.034 SD (strength
  0.027, with one study lost to a failed S5 call). Only 25 of the 98 read
  studies were re-read (11 of the 37 pooled effects in strength, lean mass and
  power). Below 90 %: S4 items 2, 5 and 7 (80, 76, 88 %; the rating after S4R
  agrees 96 %), `ingredient_isolated` (88 %), outcome mapping (89 %).
- **Spot audit** (founder 2026-10-20): a fixed-seed sample of 20 pooled effects
  (`scripts/experiments/spot_audit.py`) checked against the papers' full text:
  measure, arms, numbers and risk-of-bias items. The benchmark sees only the
  pooled average, where extraction errors can cancel. Counted: CONSEQUENTIAL
  errors only (a wrong number, arm, measure or a flipped risk-of-bias rating).
  Pass (founder 2026-10-25): 0-1 in 20; 2-3 sample 20 more and pass if the 40
  hold at most 3; 4 or more fail (fix the prompt behind the most common error,
  re-audit). A reversed direction (benefit read as harm or back) fails alone.
  Results: seed 1 (2026-10-26) failed, seed 2 (2026-10-31) failed on 6 of 20
  (no number wrong; 4 S4 false flaws, 2 SEs not per participant). With S4R and
  the pooled-SE rule, seed 3 (run 20261031_201501) passed: 0 of 20.

The measurements behind the method's design are in
`docs/history/2026-10-03-phase1-measurements.md`.
