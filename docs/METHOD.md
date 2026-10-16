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
  `--full-text-only` extracts only studies with readable full text.
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
  outcome cannot be graded), optional **measure hierarchy** (which measure wins
  when a trial reports several, §11) and **MCID** (§14).
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
`PROMPT_VERSION` + model + effort + payload):

| Agent | Reads | Returns |
|---|---|---|
| S3 study | full text | design, arms (label, n, role, ingredient presence, co-interventions), population axes, comparator, isolation, registration |
| S4 risk of bias | full text + registry | six RoB items (randomisation method, blinding/placebo, prospective registration, outcome matches registry, attrition, ITT) |
| S5 conclusion | results + tables | one claim per (outcome, measure, timepoint, contrast), naming its arms |
| S7 form & dose | methods + tables, S3 arms | per arm: form id, compound / elemental / per-kg dose, body mass, frequency |
| S8 funding | funding + COI statements | funding class, funders (extracted; not graded yet) |
| S6B outcome mapping | S5's outcome strings | one vocabulary id per claim, or `null` = discard |
| S5N numbers | the mapped claims | per arm mean, SD, n, SE, CI, p, pre/post values, as printed |
| S5R second reviewer (opt-in, `SP_SECOND_REVIEWER=1`) | the same claims, blind | the same numbers, read by a different model (Opus) |

S3 runs first (S5 and S7 need its arms); S4, S5, S7, S8 in parallel; then S6B,
S5N and, if on, S5R. Every output carries evidence spans. A schema violation is
retried twice, then `null`, never repaired.

**Span check** (`pipeline/span_check.py`). A model may only copy numbers. Every
numeric field is verified against its source — the claim's quoted span, the
named table row, or (arm sizes only) the S3 arm record — at the number's printed
precision. A number that is not found is **refused**, never repaired. A cited
table that cannot be *fetched* (after retries) is a different thing: its claims
are marked `table_fetch_failed`, the refusal says so, and the run writes no
report until a re-run fetches it (`docs/PIPELINE.md` §4).

**Second reviewer** (`pipeline/review.py`). When S5R is on, two readings must
agree within 1 % relative or 0.005 absolute; any conflict refuses the claim for
human adjudication; reviewer 2 cannot add numbers. With S5R off, every pooled
effect is single-read and the grade says so.

## 8. Eligibility

A study is refused, with its reason, when (`pipeline/eligibility.py`,
CLAUDE.md invariant 7):

- every arm receives the ingredient (no ingredient-free control);
- the ingredient is not isolated (a combination arm) — **except** a claim whose
  two arms are an explicitly matched add-on pair (same co-interventions, the
  ingredient in one arm only: `matched_addon_claim`);
- the claim is not a contrast against an ingredient-free control (§10).

Unknown always means keep. v14's "authors declare it underpowered" refusal is
dropped: pooling already gives a tiny trial a tiny weight.

**Population (variant B).** The run's population is fixed (general adults by
default). A trial whose population is `different` (e.g. a disease population for
a healthy-adult product) is refused as off-target; `adjacent` is reported, not
downgraded. Whether to grade off-target populations instead is an open decision
(`docs/DECISIONS.md`).

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
| `reported_smd_ci` | a reported SMD + CI + stated level |
| `reported_smd_p` | a reported SMD + an exact p |
| `reported_smd_n` | a reported SMD + both arm sizes |
| `reported_md_ci` | a reported mean difference + CI (natural units only) |

- **Crossover trials**: arm statistics analysed as if parallel (Handbook
  §23.2.6, conservative), flagged; a paired MD with CI kept; a crossover SMD
  refused (it may be standardised by the SD of differences).
- **Consistency guard**: when pre and post values are verified too, a change
  mean must equal post − pre and an endpoint mean must equal post at printed
  precision, or the arm statistics are refused.
- **Baseline imbalance** (arms' baselines differ by more than the endpoint
  difference): flagged; the trial's risk of bias is capped at "unclear".
- **Refused**: anything not a between-arm contrast against an ingredient-free
  control, cluster or unstated designs, ratio and percent-change kinds, a
  favoured arm of "neither", percentages used as arm means without SDs.

## 11. Pooling

Per outcome (`pipeline/pool.py`):

1. **One effect per trial per outcome**, chosen by a fixed order so two
   extractions of one paper pick the same measure: the outcome's measure
   hierarchy, then primary-outcome claims, then the strongest route (§10), then
   claim order. Pooling two endpoints of one trial would count it twice.
2. **REML random effects** on Hedges' g; **Hartung–Knapp** CI when k ≥ 3, a
   normal CI at k = 2; a prediction interval when k ≥ 3; a leave-one-out range.
3. A **mean-difference pool** in natural units only when every MD shares one unit.
4. **Every refusal is counted with its reason**; the estimand mix (change scores
   vs final values) is reported, never silently mixed.

Weight is inverse variance. Study quality never weights a trial; it lowers
certainty (§12).

## 12. Certainty (GRADE)

`pipeline/grade.py` `RULES` (founder-owned constants, CLAUDE.md invariant 4).
Start **High** for randomised trials, then downgrade per domain, floor Very low,
each downgrade with its reason:

| Domain | Rule |
|---|---|
| Risk of bias | none if ≥ 50 % of the weight is low-risk; −2 if > 50 % is high-risk; else −1. A trial is HIGH risk only when blinding/placebo is missing (S4 item 2); an undescribed randomisation method or incomplete attrition reporting is "some concerns" (as in RoB 2) |
| Inconsistency | −1 at I² > 50 %, −2 at > 75 %; not assessed below 3 trials |
| Imprecision | −1 if the CI crosses 0 or the threshold, or fewer than 400 participants in total (optimal information size); −2 if the CI spans both ±threshold |
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
| None | CI excludes harm and the estimate is below M |
| Harm | estimate ≤ −M in the bad direction, CI excludes 0 |
| Inconclusive | a CI too wide for any row → grade **I** |

**Grade table** (founder decision 2026-10-03, `grade.TABLE`):

| Benefit \ Certainty | High | Moderate | Low | Very low |
|---|---|---|---|---|
| Large | A+ | A | B | I |
| Meaningful | A | B+ | C+ | I |
| Small | C | C | C− | I |
| None | F | D | D+ | I |
| Harm | F ⚠ | F ⚠ | D− ⚠ | I |

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
convention). Every other outcome uses the flagged default.

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
  per (outcome, scale), all three: coverage (pooled / eligible trials) ≥ 50 %;
  our CI no wider than 2× the median published width; our CI overlaps more than
  half of theirs. Failing coverage or precision is "not testable", never pass or
  fail. Today: 19 rows from 10 creatine meta-analyses; lean mass passes, strength is not testable
  (coverage 29–38 %).
- **Negative controls.** Every row today is a creatine success, so a pipeline
  that called everything effective would pass. Each new ingredient adds at least
  one "does not work" or "harms" row (`docs/history/v14-anchors.csv` lists
  candidates: vitamin E and cardiovascular events, beta-carotene and lung cancer
  in smokers, selenium and prostate cancer).
- **Stability**: the same studies extracted twice must give the same grades
  (`scripts/experiments/extraction_stability.py`). Not yet measured.

The measurements behind the method's design are in
`docs/history/2026-10-03-phase1-measurements.md`.
