# BS-PROOF full audit report (claude-sr-ft-top5-suppl)

Generated: **2026-08-27 19:46 UTC**


scoring_model: v13-universal-negative-contract

Ingredient: `omega_3` · Form: `fish_oil_triglyceride` · Mode: **claude-sr-ft-top5-suppl**

Auto-written with the summary after every extraction.

## How the score is built

Deterministic (`pipeline/scoring.py`). Models extract fields only.

```text
1. weight w = design × RoB × size × funding × OA        (study QUALITY only)
   form / dose / population are NOT in the weight — they are arcs
2. E = Σw ; E' adds a capped synthesis lift (ceiling 1.30)
3. d = Σ(w·s)/Σw      direction, −1…+1
   H = weighted var(s)/1.5
   c = 1 − e^(−E'/k)  confidence, k = 3
4. signed  = clamp(round(100 × d × c × (1 − 0.4 × H)), −100, +100)   [internal]
5. FOUR ARCS, each carrying a verdict AND its coverage:
     effect    d over ALL evidence
     form      d over trials using YOUR form      + share of evidence
     dose      d over trials in YOUR dose band    + share of evidence
     evidence  c (pure quantity, no direction)
6. composite = 100 × c × mean(effect, form, dose)   [the 0–100 shown]
   a MISSING subset is penalised at its transfer tier, never dropped
7. Gate if almost no human clinical weight → no number at all
```

4-arc donut — every arc carries a VERDICT and the COVERAGE behind it:
- **effect** — what all the evidence says
- **form** — what trials using *your* form found, and how many there were
- **dose** — what trials in *your* dose band found, and how many
- **evidence** — how much trustworthy evidence exists at all (c)

Centre = the 0–100 composite. A low number with a full evidence arc means
"does not work"; a low number with an empty one means "barely studied".

SRs (`--with-sr`) only raise confidence E′, never invent patients.
Predatory list: https://www.predatoryjournals.org/the-list/publishers

## Selftest: **PASS**

```text
  !! DEMO MODE: exact_form_only=False ignore_population=True kept_claims=2 dropped_nonexact_form=0
     Demo flags suspend scoring rules. NOT a production claim.
  PASS  contrast=vs_ingredient_free keeps the claim  
  form transfer mix (2 claims -> creatine_monohydrate):
    exact        x1.0      2 claims  (100%)
  !! DEMO MODE: exact_form_only=False ignore_population=True kept_claims=2 dropped_nonexact_form=0
     Demo flags suspend scoring rules. NOT a production claim.
  PASS  contrast=within_group keeps the claim  

STRATIFIED SELECTION
  PASS  the budget is split across outcomes, not taken from the head  endurance got 3/6
  PASS  a record retrieved for two outcomes is selected once  
  PASS  untagged stores degrade to plain priority order  
  PASS  limit is respected  

RELEVANCE: BIOMARKER IS NOT THE SUPPLEMENT
  PASS  kinase-only paper is rejected  
  PASS  a real creatine trial that measures CK still passes  bare mentions > marker mentions -> supplement is present
  PASS  phosphokinase counts as the marker too  
  PASS  a topical cream is not evidence about oral supplementation  
  PASS  mentioning topical delivery in the abstract does not reject  
  PASS  other ingredients are untouched by the marker rule  
  PASS  no anchor floor is unreachable at zero nulls  a floor above +100 would be a typo, not a calibration question

PRODUCT LOOKUP: RECOMPUTING ONE PRODUCT'S DOSE TERM
  PASS  benefit range is read off the row  
  PASS  no dose reproduces the run's own composite  a missing dose must take MISSING_DOSE_PENALTY, not a recomputed term
  PASS  a dose inside the benefit range outscores one far below it  6000 mg -> 70, 1000 mg -> 44
  PASS  the synthetic demo artifact can never back a product answer  
  PASS  a real run is not mistaken for the demo  
  PASS  invalid runs cannot back a displayed score  
  PASS  a row with no form strength is refused, not inverted  
  PASS  an ingredient with no run returns not_scored, never a number  
  PASS  bounded compound product conversion is refused  never pass a bounded low endpoint as an exact elemental dose
  PASS  known compound product conversion is accepted  known-form compound input is converted inside score_product
  PASS  a form with no run is distinguished from an ingredient with no run  ['creatine_monohydrate']
  PASS  available products all carry a validity status  1 product(s) offered
  PASS  no available product claims public-claim approval it was not granted  flip this test the day a run is genuinely validated

ALL PASSED
```

## This run — extraction stats

- Targeted studies: **18**
- Succeeded (usable): **18**
- Skipped (no text): **0**
- Partial agent failures: **0**
- Prompt version: `v1.28`
- Concurrency: 40  |  studies in flight: 40

## Token + cost accounting

- Extraction backend: **Claude subscription** (`--safe-mode`, `--max-turns 1`, one shot per call)
- Model calls: **151** (cache hits 0, failures 8)
- Input tokens: **1,405,294** (fresh 42,403 · cache-write 628,080 · cache-read 734,811)
- Output tokens: **264,135**
- **Spent on this run: $0.00** — subscription, not metered.
- **API-equivalent cost: $5.699** — what the same work would cost billed per token.
- Per study: **8.4 calls**, **$0.3166** API-equivalent across 18 scored studies.

| Agent | Tier | Model | Calls | Cache hits | Fail | In | Out | API-equiv |
|---|---|---|--:|--:|--:|--:|--:|--:|
| S2 | B | `claude-sonnet-5` | 38 | 0 | 2 | 286,912 | 82,357 | $1.586 |
| S3 | B | `claude-sonnet-5` | 18 | 0 | 0 | 216,977 | 20,030 | $0.844 |
| S4 | B | `claude-sonnet-5` | 18 | 0 | 0 | 86,423 | 8,135 | $0.327 |
| S5 | B | `claude-sonnet-5` | 21 | 0 | 3 | 462,981 | 69,519 | $1.592 |
| S6B | C | `claude-sonnet-5` | 17 | 0 | 0 | 82,991 | 10,263 | $0.253 |
| S7 | B | `claude-sonnet-5` | 21 | 0 | 3 | 222,161 | 22,443 | $0.760 |
| S8 | A | `claude-haiku-4-5-20251001` | 18 | 0 | 0 | 46,849 | 51,388 | $0.337 |

Tier → model is pinned in `claude_adapter.TIER_MODEL` (full ids, never aliases: an alias floats to a new model while the cache key does not change). Tier A = classification, B = extraction, C = the highest-risk agent.

## Predatory journal check (flag only — not in score)

- List entries loaded: **1162**
- Studies checked: **576**
- Publisher resolved for: **396/576** (the list is PUBLISHERS, so this is the real coverage)
- Studies flagged predatory: **4**
- Distinct publishers flagged: **2**
- Distinct journals flagged: **0**
- Affects score: **NO (count only)**
  - [publisher] AME Publishing Company
  - [publisher] Frontiers Media SA

## Systematic reviews / meta-analyses (S2)

- Requested (cap): **60**
- S2 extractions ok: **36**
- Resolved for multiplier: **32**
_SRs never add patients; only a capped confidence boost (≤ +30%)._

## Per-agent success rates (this run)

| Agent | Studies OK | Studies failed | Cache | Retries | Why it failed |
|---|---:|---:|---:|---:|---|
| S3 | 18 | 0 | 0 | 0 | — |
| S4 | 18 | 0 | 0 | 0 | — |
| S5 | 18 | 0 | 0 | 3 | — |
| S7 | 18 | 0 | 0 | 3 | — |
| S8 | 18 | 0 | 0 | 0 | — |

_One row per STUDY. The cost table above counts CLI ATTEMPTS, so its totals are higher by exactly the retries column._

**Telemetry does not reconcile — do not quote these rates:**
- S2: 38 attempts in the cost table but no row in the success table -- its failures are invisible to anyone reading success rates
- S6B: 17 attempts in the cost table but no row in the success table -- its failures are invisible to anyone reading success rates

## SPEED REPORT
_Not available._

## Studies extracted this run (18)

| # | Year | Title | DOI / PMID | Journal | OA | Predatory |
|---:|---:|---|---|---|---|---|
| 1 | 2026 | Investigating enhancement of learning and memory following supplementation with  | [10.1007/s00394-026-04012-9](https://doi.org/10.1007/s00394-026-04012-9) | European journal of nutrition | full_text | no |
| 2 | 2025 | The anti-inflammatory effects of three different dietary supplement intervention | [10.1186/s12967-025-07167-x](https://doi.org/10.1186/s12967-025-07167-x) | Journal of translational medicine | full_text | no |
| 3 | 2025 | Vitamin D&lt;sub&gt;3&lt;/sub&gt; and marine ω-3 fatty acids supplementation and | [10.1016/j.ajcnut.2025.05.003](https://doi.org/10.1016/j.ajcnut.2025.05.003) | The American journal of clinical nutriti | full_text | no |
| 4 | 2025 | Effect of Beetroot Extract Supplementation on Serum Fatty Acid Profiles and Oxid | [10.1155/bmri/6654492](https://doi.org/10.1155/bmri/6654492) | BioMed research international | full_text | no |
| 5 | 2024 | Phosphatidylserine enriched with polyunsaturated n-3 fatty acid supplementation  | [10.1002/epi4.12892](https://doi.org/10.1002/epi4.12892) | Epilepsia open | full_text | no |
| 6 | 2024 | The effect of curcumin and high-content eicosapentaenoic acid supplementations i | [10.1038/s41387-024-00274-6](https://doi.org/10.1038/s41387-024-00274-6) | Nutrition & diabetes | full_text | no |
| 7 | 2023 | Lipid profile after omega-3 supplementation in neonates with intrauterine growth | [10.1038/s41390-023-02632-z](https://doi.org/10.1038/s41390-023-02632-z) | Pediatric research | full_text | no |
| 8 | 2023 | Docosahexaenoic acid (DHA) intake estimated from a 7-question survey identifies  | [10.1016/j.clnesp.2022.12.004](https://doi.org/10.1016/j.clnesp.2022.12.004) | Clinical nutrition ESPEN | full_text | no |
| 9 | 2023 | Cognitive impact of multidomain intervention and omega 3 according to blood Aβ42 | [10.1186/s13195-023-01325-3](https://doi.org/10.1186/s13195-023-01325-3) | Alzheimer's research & therapy | full_text | no |
| 10 | 2022 | Randomized Controlled Trial of Omega-3 and -6 Fatty Acid Supplementation to Redu | [10.1007/s10803-021-05396-9](https://doi.org/10.1007/s10803-021-05396-9) | Journal of autism and developmental diso | full_text | no |
| 11 | 2022 | Effects of Omega-3-6-9 fatty acid supplementation on behavior and sleep in prete | [10.1016/j.earlhumdev.2022.105588](https://doi.org/10.1016/j.earlhumdev.2022.105588) | Early human development | full_text | no |
| 12 | 2022 | Vitamin D and marine omega 3 fatty acid supplementation and incident autoimmune  | [10.1136/bmj-2021-066452](https://doi.org/10.1136/bmj-2021-066452) | BMJ (Clinical research ed.) | full_text | no |
| 13 | 2022 | Twelve Weeks of Additional Fish Intake Improves the Cognition of Cognitively Int | [10.1007/s12603-021-1723-2](https://doi.org/10.1007/s12603-021-1723-2) | The journal of nutrition, health & aging | full_text | no |
| 14 | 2022 | The Influence of Vitamin E and Omega-3 Fatty Acids on Reproductive Health Indice | [10.1177/15579883221074821](https://doi.org/10.1177/15579883221074821) | American journal of men's health | full_text | no |
| 15 | 2019 | Effect of prenatal EPA and DHA on maternal and cord blood insulin sensitivity: a | [10.1186/s12884-019-2599-6](https://doi.org/10.1186/s12884-019-2599-6) | BMC pregnancy and childbirth | full_text | no |
| 16 | 2019 | Effect of Long-Term Omega 3 Polyunsaturated Fatty Acid Supplementation with or w | [10.3390/nu11081931](https://doi.org/10.3390/nu11081931) | Nutrients | full_text | no |
| 17 | 2026 | Effects of immunonutrition on serum albumin, IL-6, and TNF-α levels in patients  | [10.20960/nh.05747](https://doi.org/10.20960/nh.05747) | Nutricion hospitalaria | abstract_only | no |
| 18 | 2020 | Omega 3 Improves Both apoB100-containing Lipoprotein Turnover and their Sphingol | [10.1210/clinem/dgaa459](https://doi.org/10.1210/clinem/dgaa459) | The Journal of clinical endocrinology an | abstract_only | no |

## ECU scores — this run only

| Outcome | 0–100 | Verdict | effect | in your form | at your dose | evidence | n |
|---|---:|---|---|---|---|---|---:|
| inflammation_crp | 3 | barely studied | +0.70 @ 100% | not tested in your form | not tested | 10% | 1 |
| adverse_events_any | gated | not enough human evidence | not tested | not tested | not tested | not tested | 0 |
| blood_pressure | gated | not enough human evidence | not tested | not tested | not tested | not tested | 0 |
| glycaemic_control | gated | not enough human evidence | not tested | not tested | not tested | not tested | 0 |
| depressive_symptoms | gated | not enough human evidence | not tested | not tested | not tested | not tested | 0 |

_0–100 = 100 × c × mean(effect, form, dose). Each arc shows its verdict and the share of evidence behind it. A low number with a FULL evidence arc means 'does not work'; with an EMPTY one it means 'barely studied'._


_Old rows from previous runs are not shown here._

## Which studies made each number

### inflammation_crp — signed +7

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `registry:nct06480812` | +6.62 | 0.15 | 0.6966666666666665 | 4 | unspecified |
| **sum of all 1** | **+6.62** | | | | |

_`points` sum to the signed score. NEGATIVE points mean that study pushed the score down. `w` is quality (design × RoB × size × funding × OA); `s` is what it found (+1.0 meaningful benefit, +0.3 trivial/unsized, −0.7 null, −1.0 harm). The two are separate on purpose: how good a study is and what it found are different facts._

## Database snapshot (`omega_3`)

_No `omega_3` database files found._

## Notes

- Claude and Grok scores are **never merged**.

- Form does **not** penalize the center score; it is the form arc only.

- Predatory venues: flagged + counted; weight zero is OFF for now.

- Inconclusive + low n is often the confidence ceiling (SPEC 13), not a bug.

- This report is **this run only** — other ingredients are not mixed in.
