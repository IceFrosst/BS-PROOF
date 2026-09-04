# BS-PROOF full audit report (claude-sr-ft-top5-suppl)

Generated: **2026-08-23 18:10 UTC**


scoring_model: v12-dose-closeness

Ingredient: `creatine` · Form: `creatine_monohydrate` · Mode: **claude-sr-ft-top5-suppl**

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
  form transfer mix (2 claims -> creatine_monohydrate):
    exact        x1.0      2 claims  (100%)
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
  PASS  a form with no run is distinguished from an ingredient with no run  ['creatine_monohydrate']
  PASS  available products all carry a validity status  1 product(s) offered
  PASS  no available product claims public-claim approval it was not granted  flip this test the day a run is genuinely validated

ALL PASSED
```

## This run — extraction stats

- Targeted studies: **156**
- Succeeded (usable): **155**
- Skipped (no text): **1**
- Partial agent failures: **5**
- Prompt version: `v1.21`
- Concurrency: 40  |  studies in flight: 40

## Token + cost accounting

- Extraction backend: **Claude subscription** (`--safe-mode`, `--max-turns 1`, one shot per call)
- Model calls: **396** (cache hits 566, failures 48)
- Input tokens: **3,812,498** (fresh 121,244 · cache-write 1,003,693 · cache-read 2,687,561)
- Output tokens: **378,403**
- **Spent on this run: $0.00** — subscription, not metered.
- **API-equivalent cost: $19.204** — what the same work would cost billed per token.
- Per study: **2.6 calls**, **$0.1239** API-equivalent across 155 scored studies.

| Agent | Tier | Model | Calls | Cache hits | Fail | In | Out | API-equiv |
|---|---|---|--:|--:|--:|--:|--:|--:|
| S3 | B | `claude-sonnet-5` | 73 | 95 | 15 | 1,484,482 | 49,231 | $7.982 |
| S4 | B | `claude-sonnet-5` | 74 | 96 | 16 | 319,975 | 28,984 | $1.416 |
| S5 | B | `claude-sonnet-5` | 69 | 96 | 13 | 1,242,575 | 74,374 | $5.890 |
| S6B | C | `claude-sonnet-5` | 61 | 85 | 1 | 266,173 | 53,644 | $1.435 |
| S7 | B | `claude-sonnet-5` | 61 | 97 | 3 | 349,057 | 25,028 | $1.484 |
| S8 | A | `claude-haiku-4-5-20251001` | 58 | 97 | 0 | 150,236 | 147,142 | $0.998 |

Tier → model is pinned in `claude_adapter.TIER_MODEL` (full ids, never aliases: an alias floats to a new model while the cache key does not change). Tier A = classification, B = extraction, C = the highest-risk agent.

## Predatory journal check (flag only — not in score)

- List entries loaded: **1162**
- Studies checked: **2632**
- Publisher resolved for: **632/2632** (the list is PUBLISHERS, so this is the real coverage)
- Studies flagged predatory: **5**
- Distinct publishers flagged: **2**
- Distinct journals flagged: **0**
- Affects score: **NO (count only)**
  - [publisher] Baishideng Publishing Group Inc.
  - [publisher] Frontiers Media SA

## Systematic reviews / meta-analyses (S2)

- Requested (cap): **0**
- S2 extractions ok: **0**
- Resolved for multiplier: **0**
_SRs never add patients; only a capped confidence boost (≤ +30%)._

## Per-agent success rates (this run)

| Agent | Studies OK | Studies failed | Cache | Retries | Why it failed |
|---|---:|---:|---:|---:|---|
| S3 | 153 | 2 | 95 | 0 | exit 1: Prompt is too long (x1); exit 1: max_turns (x1) |
| S4 | 154 | 1 | 96 | 0 | exit 1: max_turns (x1) |
| S5 | 152 | 3 | 96 | 0 | exit 1: max_turns (x2); exit 1: Prompt is too long (x1) |
| S7 | 155 | 0 | 97 | 0 | — |
| S8 | 155 | 0 | 97 | 0 | — |

_One row per STUDY. The cost table above counts CLI ATTEMPTS, so its totals are higher by exactly the retries column._

**Telemetry does not reconcile — do not quote these rates:**
- S6B: 61 attempts in the cost table but no row in the success table -- its failures are invisible to anyone reading success rates
- S3: 73 attempts for 155 studies -- impossible, every study needs at least one attempt
- S4: 74 attempts for 155 studies -- impossible, every study needs at least one attempt
- S5: 69 attempts for 155 studies -- impossible, every study needs at least one attempt
- S7: 61 attempts for 155 studies -- impossible, every study needs at least one attempt
- S8: 58 attempts for 155 studies -- impossible, every study needs at least one attempt

## SPEED REPORT
_Not available._

## Studies extracted this run (156)

| # | Year | Title | DOI / PMID | Journal | OA | Predatory |
|---:|---:|---|---|---|---|---|
| 1 | 2026 | Acute Creatine Ingestion Before Resistance Training Enhances Strength Performanc | [10.3390/nu18111789](https://doi.org/10.3390/nu18111789) | Nutrients | full_text | no |
| 2 | 2026 | Single-Dose Creatine Reduces Sleep Deprivation-Induced Deterioration in Cognitiv | [10.3390/nu18081192](https://doi.org/10.3390/nu18081192) | Nutrients | full_text | no |
| 3 | 2026 | Synergistic effects of creatine, carbs, protein on repeated sprint performance. | [10.1038/s41598-026-44278-x](https://doi.org/10.1038/s41598-026-44278-x) | Scientific reports | full_text | no |
| 4 | 2026 | Creatine plus β-Hydroxy-β-Methylbutyrate supplementation is associated with pres | [10.1007/s10522-026-10407-2](https://doi.org/10.1007/s10522-026-10407-2) | Biogerontology | full_text | no |
| 5 | 2026 | Combined creatine and β-hydroxy-β-methylbutyrate supplementation with integral c | [10.1007/s40520-025-03312-0](https://doi.org/10.1007/s40520-025-03312-0) | Aging clinical and experimental research | full_text | no |
| 6 | 2025 | Effects of Creatine Monohydrate Loading on Sleep Metrics, Physical Performance,  | [10.3390/nu17243831](https://doi.org/10.3390/nu17243831) | Nutrients | full_text | no |
| 7 | 2025 | Muscle creatine levels and sprint performance in young adult vegans and vegetari | [10.14814/phy2.70539](https://doi.org/10.14814/phy2.70539) | Physiological reports | full_text | no |
| 8 | 2025 | Effectiveness of a soccer injury prevention program based on creatine supplement | [10.1080/15502783.2026.2633251](https://doi.org/10.1080/15502783.2026.2633251) | Journal of the International Society of  | full_text | no |
| 9 | 2025 | Acute creatine supplementation enhances technical performance in adolescent bask | [10.1080/15502783.2025.2542369](https://doi.org/10.1080/15502783.2025.2542369) | Journal of the International Society of  | full_text | no |
| 10 | 2025 | Short-term creatine supplementation enhances strength, reduces fatigue, and acce | [10.1080/15502783.2026.2617283](https://doi.org/10.1080/15502783.2026.2617283) | Journal of the International Society of  | full_text | no |
| 11 | 2025 | Does creatine cause hair loss? A 12-week randomized controlled trial. | [10.1080/15502783.2025.2495229](https://doi.org/10.1080/15502783.2025.2495229) | Journal of the International Society of  | full_text | no |
| 12 | 2025 | The Effects of Creatine Monohydrate Supplementation on Recovery from Eccentric E | [10.3390/nu17111772](https://doi.org/10.3390/nu17111772) | Nutrients | full_text | no |
| 13 | 2025 | Effect of creatine monohydrate on motor function in children with facioscapulohu | [10.1002/phar.70025](https://doi.org/10.1002/phar.70025) | Pharmacotherapy | full_text | no |
| 14 | 2025 | The Effect of Creatine Supplementation on Lean Body Mass with and Without Resist | [10.3390/nu17061081](https://doi.org/10.3390/nu17061081) | Nutrients | full_text | no |
| 15 | 2025 | Effect of Taurine Combined With Creatine on Repeated Sprinting Ability After Exh | [10.1177/19417381251320095](https://doi.org/10.1177/19417381251320095) | Sports health | full_text | no |
| 16 | 2025 | A nitroalkene derivative of salicylate, SANA, induces creatine-dependent thermog | [10.1038/s42255-025-01311-z](https://doi.org/10.1038/s42255-025-01311-z) | Nature metabolism | full_text | no |
| 17 | 2025 | Metabolic Signature of Arsenic Exposure and Metabolism: The Folic Acid and Creat | [10.1021/acs.est.5c01597](https://doi.org/10.1021/acs.est.5c01597) | Environmental science & technology | full_text | no |
| 18 | 2024 | Influence of CReatine Supplementation on mUScle Mass and Strength After Stroke ( | [10.3390/nu16234148](https://doi.org/10.3390/nu16234148) | Nutrients | full_text | no |
| 19 | 2024 | Supplementing With Which Form of Creatine (Hydrochloride or Monohydrate) Alongsi | [10.33549/physiolres.935323](https://doi.org/10.33549/physiolres.935323) | Physiological research | full_text | no |
| 20 | 2024 | Effect of Creatine Monohydrate Supplementation on Macro- and Microvascular Endot | [10.3390/nu17010058](https://doi.org/10.3390/nu17010058) | Nutrients | full_text | no |
| 21 | 2024 | Combined Impact of Creatine, Caffeine, and Variable Resistance on Repeated Sprin | [10.3390/nu16152437](https://doi.org/10.3390/nu16152437) | Nutrients | full_text | no |
| 22 | 2024 | Creatine Improves Total Sleep Duration Following Resistance Training Days versus | [10.3390/nu16162772](https://doi.org/10.3390/nu16162772) | Nutrients | full_text | no |
| 23 | 2024 | Creatine supplementation combined with breathing exercises reduces respiratory d | [10.4103/jpgm.jpgm_650_23](https://doi.org/10.4103/jpgm.jpgm_650_23) | Journal of postgraduate medicine | full_text | no |
| 24 | 2024 | High-dose short-term creatine supplementation without beneficial effects in prof | [10.1080/15502783.2024.2340574](https://doi.org/10.1080/15502783.2024.2340574) | Journal of the International Society of  | full_text | no |
| 25 | 2024 | No additive effect of creatine, caffeine, and sodium bicarbonate on intense exer | [10.1111/sms.14629](https://doi.org/10.1111/sms.14629) | Scandinavian journal of medicine & scien | full_text | no |
| 26 | 2024 | Impact of Short-Term Creatine Supplementation on Muscular Performance among Brea | [10.3390/nu16070979](https://doi.org/10.3390/nu16070979) | Nutrients | full_text | no |
| 27 | 2024 | Effect of Creatine Supplementation on Body Composition and Malnutrition-Inflamma | [10.3390/nu16050615](https://doi.org/10.3390/nu16050615) | Nutrients | full_text | no |
| 28 | 2024 | The Effect of Creatine Nitrate and Caffeine Individually or Combined on Exercise | [10.3390/nu16060766](https://doi.org/10.3390/nu16060766) | Nutrients | full_text | no |
| 29 | 2024 | Effects of a Low Dose of Orally Administered Creatine Monohydrate on Post-Fatigu | [10.3390/nu16091324](https://doi.org/10.3390/nu16091324) | Nutrients | full_text | no |
| 30 | 2024 | The Effect of Prior Creatine Intake for 28 Days on Accelerated Recovery from Exe | [10.3390/nu16060896](https://doi.org/10.3390/nu16060896) | Nutrients | full_text | no |
| 31 | 2023 | The Effects of Protein and Carbohydrate Supplementation, with and without Creati | [10.3390/nu15245134](https://doi.org/10.3390/nu15245134) | Nutrients | full_text | no |
| 32 | 2023 | Creatine monohydrate supplementation changes total body water and DXA lean mass  | [10.1080/15502783.2023.2193556](https://doi.org/10.1080/15502783.2023.2193556) | Journal of the International Society of  | full_text | no |
| 33 | 2023 | The Effects of Creatine Monohydrate Loading on Exercise Recovery in Active Women | [10.3390/nu15163567](https://doi.org/10.3390/nu15163567) | Nutrients | full_text | no |
| 34 | 2023 | The role of resistance training and creatine supplementation on oxidative stress | [10.3389/fpubh.2023.1062832](https://doi.org/10.3389/fpubh.2023.1062832) | Frontiers in public health | full_text | YES |
| 35 | 2023 | The effects of creatine supplementation on cognitive performance-a randomised co | [10.1186/s12916-023-03146-5](https://doi.org/10.1186/s12916-023-03146-5) | BMC medicine | full_text | no |
| 36 | 2023 | Comparing D3-Creatine Dilution and Dual-Energy X-ray Absorptiometry Muscle Mass  | [10.1093/gerona/glad047](https://doi.org/10.1093/gerona/glad047) | The journals of gerontology. Series A, B | full_text | no |
| 37 | 2023 | A Randomized Controlled Trial of Changes in Fluid Distribution across Menstrual  | [10.3390/nu15020429](https://doi.org/10.3390/nu15020429) | Nutrients | full_text | no |
| 38 | 2023 | Application of the D&lt;sub&gt;3&lt;/sub&gt; -creatine muscle mass assessment to | [10.1002/jcsm.13322](https://doi.org/10.1002/jcsm.13322) | Journal of cachexia, sarcopenia and musc | full_text | no |
| 39 | 2023 | A 2-yr Randomized Controlled Trial on Creatine Supplementation during Exercise f | [10.1249/mss.0000000000003202](https://doi.org/10.1249/mss.0000000000003202) | Medicine and science in sports and exerc | full_text | no |
| 40 | 2023 | The Folic Acid and Creatine Trial: Treatment Effects of Supplementation on Arsen | [10.1289/ehp11270](https://doi.org/10.1289/ehp11270) | Environmental health perspectives | full_text | no |
| 41 | 2022 | A randomized open-labeled study to examine the effects of creatine monohydrate a | [10.1080/15502783.2022.2108683](https://doi.org/10.1080/15502783.2022.2108683) | Journal of the International Society of  | full_text | no |
| 42 | 2022 | Effects of Four Weeks of Beta-Alanine Supplementation Combined with One Week of  | [10.3390/ijerph19137992](https://doi.org/10.3390/ijerph19137992) | International journal of environmental r | full_text | no |
| 43 | 2022 | Effects of Oral Creatine Supplementation on Power Output during Repeated Treadmi | [10.3390/nu14061140](https://doi.org/10.3390/nu14061140) | Nutrients | full_text | no |
| 44 | 2022 | Effects of ibudilast on central and peripheral markers of inflammation in alcoho | [10.1111/adb.13182](https://doi.org/10.1111/adb.13182) | Addiction biology | full_text | no |
| 45 | 2021 | Effects of Low Doses of L-Carnitine Tartrate and Lipid Multi-Particulate Formula | [10.3390/nu13113985](https://doi.org/10.3390/nu13113985) | Nutrients | full_text | no |
| 46 | 2021 | The effects of phosphocreatine disodium salts plus blueberry extract supplementa | [10.1186/s12970-021-00456-y](https://doi.org/10.1186/s12970-021-00456-y) | Journal of the International Society of  | full_text | no |
| 47 | 2021 | Morning versus Evening Intake of Creatine in Elite Female Handball Players. | [10.3390/ijerph19010393](https://doi.org/10.3390/ijerph19010393) | International journal of environmental r | full_text | no |
| 48 | 2021 | Short-Term Creatine Loading Improves Total Work and Repetitions to Failure but N | [10.3390/nu13030826](https://doi.org/10.3390/nu13030826) | Nutrients | full_text | no |
| 49 | 2021 | Short-term co-ingestion of creatine and sodium bicarbonate improves anaerobic pe | [10.1186/s12970-021-00407-7](https://doi.org/10.1186/s12970-021-00407-7) | Journal of the International Society of  | full_text | no |
| 50 | 2021 | Creatine Enhances the Effects of Cluster-Set Resistance Training on Lower-Limb B | [10.3390/nu13072303](https://doi.org/10.3390/nu13072303) | Nutrients | full_text | no |
| 51 | 2021 | Effect of Creatine Supplementation on Functional Capacity and Muscle Oxygen Satu | [10.3390/nu13010149](https://doi.org/10.3390/nu13010149) | Nutrients | full_text | no |
| 52 | 2021 | Effects of Combined Creatine and Sodium Bicarbonate Supplementation on Soccer-Sp | [10.3390/ijerph18136919](https://doi.org/10.3390/ijerph18136919) | International journal of environmental r | full_text | no |
| 53 | 2021 | Pharmacokinetics, Pharmacodynamics, and Tolerability of AZD5718, an Oral 5-Lipox | [10.1007/s40261-021-01078-7](https://doi.org/10.1007/s40261-021-01078-7) | Clinical drug investigation | full_text | no |
| 54 | 2021 | Effects of Fortetropin on the Rate of Muscle Protein Synthesis in Older Men and  | [10.1093/gerona/glaa162](https://doi.org/10.1093/gerona/glaa162) | The journals of gerontology. Series A, B | full_text | no |
| 55 | 2020 | Effects of Creatine Supplementation during Resistance Training Sessions in Physi | [10.3390/nu12061880](https://doi.org/10.3390/nu12061880) | Nutrients | full_text | no |
| 56 | 2020 | The Effects of Long-Term Magnesium Creatine Chelate Supplementation on Repeated  | [10.3390/nu12102961](https://doi.org/10.3390/nu12102961) | Nutrients | full_text | no |
| 57 | 2020 | Effect of Ten Weeks of Creatine Monohydrate Plus HMB Supplementation on Athletic | [10.3390/nu12010193](https://doi.org/10.3390/nu12010193) | Nutrients | full_text | no |
| 58 | 2020 | The addition of β-Hydroxy β-Methylbutyrate (HMB) to creatine monohydrate supplem | [10.1186/s12970-020-00359-4](https://doi.org/10.1186/s12970-020-00359-4) | Journal of the International Society of  | full_text | no |
| 59 | 2020 | Effects of Monomeric and Oligomeric Flavanols on Kidney Function, Inflammation a | [10.3390/nu12061634](https://doi.org/10.3390/nu12061634) | Nutrients | full_text | no |
| 60 | 2019 | Examining the effects of creatine supplementation in augmenting adaptations to r | [10.1136/bmjopen-2019-030080](https://doi.org/10.1136/bmjopen-2019-030080) | BMJ open | full_text | no |
| 61 | 2019 | Effect of Creatine Supplementation Dosing Strategies on Aging Muscle Performance | [10.1007/s12603-018-1148-8](https://doi.org/10.1007/s12603-018-1148-8) | The journal of nutrition, health & aging | full_text | no |
| 62 | 2019 | Creatine electrolyte supplement improves anaerobic power and strength: a randomi | [10.1186/s12970-019-0291-x](https://doi.org/10.1186/s12970-019-0291-x) | Journal of the International Society of  | full_text | no |
| 63 | 2019 | Effects of 12 Weeks of Essential Amino Acids (EAA)-Based Multi-Ingredient Nutrit | [10.1007/s12603-019-1163-4](https://doi.org/10.1007/s12603-019-1163-4) | The journal of nutrition, health & aging | full_text | no |
| 64 | 2018 | Effects of 4-Week Creatine Supplementation Combined with Complex Training on Mus | [10.3390/nu10111640](https://doi.org/10.3390/nu10111640) | Nutrients | full_text | no |
| 65 | 2018 | Creatine-electrolyte supplementation improves repeated sprint cycling performanc | [10.1186/s12970-018-0226-y](https://doi.org/10.1186/s12970-018-0226-y) | Journal of the International Society of  | full_text | no |
| 66 | 2018 | A randomized, double-blind, placebo-controlled, proof-of-concept trial of creati | [10.1007/s00702-017-1817-5](https://doi.org/10.1007/s00702-017-1817-5) | Journal of neural transmission (Vienna,  | full_text | no |
| 67 | 2018 | Creatine or vitamin D supplementation in individuals with a spinal cord injury u | [10.1080/10790268.2017.1372058](https://doi.org/10.1080/10790268.2017.1372058) | The journal of spinal cord medicine | full_text | no |
| 68 | 2018 | Creatine Supplementation Supports the Rehabilitation of Adolescent Fin Swimmers  | [PMID 29769829](https://pubmed.ncbi.nlm.nih.gov/29769829/) | Journal of sports science & medicine | full_text | no |
| 69 | 2018 | The Effect of a High-Dose Vitamin B Multivitamin Supplement on the Relationship  | [10.3390/nu10121860](https://doi.org/10.3390/nu10121860) | Nutrients | full_text | no |
| 70 | 2017 | Effects of Creatine Supplementation on Muscle Strength and Optimal Individual Po | [10.3390/nu9111169](https://doi.org/10.3390/nu9111169) | Nutrients | full_text | no |
| 71 | 2017 | Effect of low dose, short-term creatine supplementation on muscle power output i | [10.1186/s12970-017-0162-2](https://doi.org/10.1186/s12970-017-0162-2) | Journal of the International Society of  | full_text | no |
| 72 | 2017 | The acute effect of beta-guanidinopropionic acid versus creatine or placebo in h | [10.1111/bcp.13390](https://doi.org/10.1111/bcp.13390) | British journal of clinical pharmacology | full_text | no |
| 73 | 2017 | Hematological and Hemodynamic Responses to Acute and Short-Term Creatine Nitrate | [10.3390/nu9121359](https://doi.org/10.3390/nu9121359) | Nutrients | full_text | no |
| 74 | 2017 | The CREST-E study of creatine for Huntington disease: A randomized controlled tr | [10.1212/wnl.0000000000004209](https://doi.org/10.1212/wnl.0000000000004209) | Neurology | full_text | no |
| 75 | 2017 | A double-blind, placebo-controlled randomized trial of creatine for the cancer a | [10.1093/annonc/mdx232](https://doi.org/10.1093/annonc/mdx232) | Annals of oncology : official journal of | full_text | no |
| 76 | 2017 | Effects of ingesting a pre-workout dietary supplement with and without synephrin | [10.1186/s12970-016-0158-3](https://doi.org/10.1186/s12970-016-0158-3) | Journal of the International Society of  | full_text | no |
| 77 | 2017 | Sex-Specific Associations between One-Carbon Metabolism Indices and Posttranslat | [10.1158/1055-9965.epi-16-0202](https://doi.org/10.1158/1055-9965.epi-16-0202) | Cancer epidemiology, biomarkers & preven | full_text | no |
| 78 | 2016 | The Effects of Creatine Supplementation on Explosive Performance and Optimal Ind | [10.3390/nu8030143](https://doi.org/10.3390/nu8030143) | Nutrients | full_text | no |
| 79 | 2016 | Effects of Coffee and Caffeine Anhydrous Intake During Creatine Loading. | [10.1519/jsc.0000000000001223](https://doi.org/10.1519/jsc.0000000000001223) | Journal of strength and conditioning res | full_text | no |
| 80 | 2016 | Supplementation with Guanidinoacetic Acid in Women with Chronic Fatigue Syndrome | [10.3390/nu8020072](https://doi.org/10.3390/nu8020072) | Nutrients | full_text | no |
| 81 | 2015 | Creatine supplementation enhances corticomotor excitability and cognitive perfor | [10.1523/jneurosci.3113-14.2015](https://doi.org/10.1523/jneurosci.3113-14.2015) | The Journal of neuroscience : the offici | full_text | no |
| 82 | 2015 | The acute effect of beta-guanidinopropionic acid versus creatine or placebo in h | [10.1186/s13063-015-0581-9](https://doi.org/10.1186/s13063-015-0581-9) | Trials | full_text | no |
| 83 | 2015 | Sex Differences in Clinical Features of Early, Treated Parkinson's Disease. | [10.1371/journal.pone.0133002](https://doi.org/10.1371/journal.pone.0133002) | PloS one | full_text | no |
| 84 | 2015 | Folic Acid and Creatine as Therapeutic Approaches to Lower Blood Arsenic: A Rand | [10.1289/ehp.1409396](https://doi.org/10.1289/ehp.1409396) | Environmental health perspectives | full_text | no |
| 85 | 2014 | PRECREST: a phase II prevention and biomarker trial of creatine in at-risk Hunti | [10.1212/wnl.0000000000000187](https://doi.org/10.1212/wnl.0000000000000187) | Neurology | full_text | no |
| 86 | 2014 | Effects of a pre-workout supplement on lean mass, muscular performance, subjecti | [10.7150/ijms.7073](https://doi.org/10.7150/ijms.7073) | International journal of medical science | full_text | no |
| 87 | 2013 | Creatine supplementation associated or not with strength training upon emotional | [10.1371/journal.pone.0076301](https://doi.org/10.1371/journal.pone.0076301) | PloS one | full_text | no |
| 88 | 2013 | Creatine metabolism and safety profiles after six-week oral guanidinoacetic acid | [10.7150/ijms.5125](https://doi.org/10.7150/ijms.5125) | International journal of medical science | full_text | no |
| 89 | 2013 | Growth hormone-releasing hormone effects on brain γ-aminobutyric acid levels in  | [10.1001/jamaneurol.2013.1425](https://doi.org/10.1001/jamaneurol.2013.1425) | JAMA neurology | full_text | no |
| 90 | 2012 | A randomized, double-blind placebo-controlled trial of oral creatine monohydrate | [10.1176/appi.ajp.2012.12010009](https://doi.org/10.1176/appi.ajp.2012.12010009) | The American journal of psychiatry | full_text | no |
| 91 | 2010 | The effects of supplementation with creatine and protein on muscle strength foll | [10.1007/s12603-009-0124-8](https://doi.org/10.1007/s12603-009-0124-8) | The journal of nutrition, health & aging | full_text | no |
| 92 | 2009 | Creatine fails to augment the benefits from resistance training in patients with | [10.1371/journal.pone.0004605](https://doi.org/10.1371/journal.pone.0004605) | PloS one | full_text | no |
| 93 | 2009 | The effect of L-arginine and creatine on vascular function and homocysteine meta | [10.1177/1358863x08100834](https://doi.org/10.1177/1358863x08100834) | Vascular medicine (London, England) | full_text | no |
| 94 | 2008 | The effects of creatine and whey protein supplementation on body composition in  | [10.1007/bf02982622](https://doi.org/10.1007/bf02982622) | The journal of nutrition, health & aging | full_text | no |
| 95 | 2008 | A pilot clinical trial of creatine and minocycline in early Parkinson disease: 1 | [10.1097/wnf.0b013e3181342f32](https://doi.org/10.1097/wnf.0b013e3181342f32) | Clinical neuropharmacology | full_text | no |
| 96 | 2006 | Creatine supplementation and physical training in patients with COPD: a double b | [10.2147/copd.2006.1.4.445](https://doi.org/10.2147/copd.2006.1.4.445) | International journal of chronic obstruc | full_text | no |
| 97 | 2006 | The effects of creatine supplementation on selected factors of tennis specific t | [10.1136/bjsm.2005.022558](https://doi.org/10.1136/bjsm.2005.022558) | British journal of sports medicine | full_text | no |
| 98 | 2000 | Dietary creatine supplementation does not affect some haematological indices, or | [10.1136/bjsm.34.4.284](https://doi.org/10.1136/bjsm.34.4.284) | British journal of sports medicine | full_text | no |
| 99 | 1996 | Effect of creatine on aerobic and anaerobic metabolism in skeletal muscle in swi | [10.1136/bjsm.30.3.222](https://doi.org/10.1136/bjsm.30.3.222) | British journal of sports medicine | full_text | no |
| 100 | 2026 | Examining the feasibility and preliminary effects of resistance exercise trainin | [10.1371/journal.pone.0353630](https://doi.org/10.1371/journal.pone.0353630) | PloS one | abstract_only | no |
| 101 | 2026 | Effects of high-load, velocity-intentional variable resistance training combined | [10.1016/j.exger.2026.113122](https://doi.org/10.1016/j.exger.2026.113122) | Experimental gerontology | abstract_only | no |
| 102 | 2026 | Feasibility, safety and tolerability of intradialytic creatine supplementation i | [10.1371/journal.pone.0354883](https://doi.org/10.1371/journal.pone.0354883) | PloS one | abstract_only | no |
| 103 | 2026 | Beetroot juice or creatine: which yields greater short-term benefits for resista | [10.1080/09637486.2026.2625827](https://doi.org/10.1080/09637486.2026.2625827) | International journal of food sciences a | abstract_only | no |
| 104 | 2026 | Independent effects of whey protein and alkali supplementation on muscle health  | [10.1016/j.ajcnut.2026.101257](https://doi.org/10.1016/j.ajcnut.2026.101257) | The American journal of clinical nutriti | abstract_only | no |
| 105 | 2026 | Combined creatine and HMB co-supplementation improves functional strength indepe | [10.1007/s11357-025-01889-y](https://doi.org/10.1007/s11357-025-01889-y) | GeroScience | abstract_only | no |
| 106 | 2026 | Effects of creatine supplementation with and without exercise and diet intervent | [10.1080/15502783.2026.2716273](https://doi.org/10.1080/15502783.2026.2716273) | Journal of the International Society of  | abstract_only | no |
| 107 | 2025 | Effect of a Multi-Ingredient Post-Workout Dietary Supplement on Body Composition | [10.1080/19390211.2025.2488811](https://doi.org/10.1080/19390211.2025.2488811) | Journal of dietary supplements | abstract_only | no |
| 108 | 2025 | Efficacy and safety profile of oral creatine monohydrate in add-on to cognitive- | [10.1016/j.euroneuro.2024.10.004](https://doi.org/10.1016/j.euroneuro.2024.10.004) | European neuropsychopharmacology : the j | abstract_only | no |
| 109 | 2024 | Short term creatine loading improves strength endurance even without changing ma | [10.1590/0001-3765202420230559](https://doi.org/10.1590/0001-3765202420230559) | Anais da Academia Brasileira de Ciencias | abstract_only | no |
| 110 | 2024 | Eight-Week Creatine-Glucose Supplementation Alleviates Clinical Features of Long | [10.3177/jnsv.70.174](https://doi.org/10.3177/jnsv.70.174) | Journal of nutritional science and vitam | abstract_only | no |
| 111 | 2023 | Creatine supplementation combined with blood flow restriction training enhances  | [10.1139/apnm-2022-0209](https://doi.org/10.1139/apnm-2022-0209) | Applied physiology, nutrition, and metab | abstract_only | no |
| 112 | 2023 | Does creatine supplementation affect recovery speed of impulse above critical to | [10.1080/17461391.2022.2159539](https://doi.org/10.1080/17461391.2022.2159539) | European journal of sport science | abstract_only | no |
| 113 | 2022 | Creatine Monohydrate Supplementation, but not Creatyl-L-Leucine, Increased Muscl | [10.1123/ijsnem.2022-0074](https://doi.org/10.1123/ijsnem.2022-0074) | International journal of sport nutrition | abstract_only | no |
| 114 | 2021 | Guanidinoacetate-Creatine Supplementation Improves Functional Performance and Mu | [10.1159/000518499](https://doi.org/10.1159/000518499) | Annals of nutrition & metabolism | abstract_only | no |
| 115 | 2021 | The Effect of Creatine Supplementation on Muscle Function in Childhood Myositis: | [10.3899/jrheum.191375](https://doi.org/10.3899/jrheum.191375) | The Journal of rheumatology | abstract_only | no |
| 116 | 2021 | The Effects of Acute Δ<sup>9</sup>-Tetrahydrocannabinol on Striatal Glutamatergi | [10.1016/j.bpsc.2021.04.013](https://doi.org/10.1016/j.bpsc.2021.04.013) | Biological psychiatry. Cognitive neurosc | abstract_only | no |
| 117 | 2020 | Creatine supplementation does not promote additional effects on inflammation and | [10.1016/j.clnesp.2020.05.024](https://doi.org/10.1016/j.clnesp.2020.05.024) | Clinical nutrition ESPEN | abstract_only | no |
| 118 | 2020 | Patients With Atrial Fibrillation Taking Nonsteroidal Anti-Inflammatory Drugs an | [10.1161/circulationaha.119.041296](https://doi.org/10.1161/circulationaha.119.041296) | Circulation | abstract_only | no |
| 119 | 2019 | Creatine supplementation improves performance above critical power but does not  | [10.1113/ep087886](https://doi.org/10.1113/ep087886) | Experimental physiology | abstract_only | no |
| 120 | 2019 | Creatine supplementation can improve impact control in high-intensity interval t | [10.1016/j.nut.2018.09.020](https://doi.org/10.1016/j.nut.2018.09.020) | Nutrition (Burbank, Los Angeles County,  | abstract_only | no |
| 121 | 2019 | Effects of high-velocity resistance training and creatine supplementation in unt | [10.1139/apnm-2019-0066](https://doi.org/10.1139/apnm-2019-0066) | Applied physiology, nutrition, and metab | abstract_only | no |
| 122 | 2019 | Antioxidant vitamin supplementation prevents oxidative stress but does not enhan | [10.1016/j.nut.2019.01.007](https://doi.org/10.1016/j.nut.2019.01.007) | Nutrition (Burbank, Los Angeles County,  | abstract_only | no |
| 123 | 2018 | Supplementation with Qter<sup>®</sup> and Creatine improves functional performan | [10.1016/j.rmed.2018.08.002](https://doi.org/10.1016/j.rmed.2018.08.002) | Respiratory medicine | abstract_only | no |
| 124 | 2018 | Changing to a vegetarian diet reduces the body creatine pool in omnivorous women | [10.1017/s000711451800017x](https://doi.org/10.1017/s000711451800017x) | The British journal of nutrition | abstract_only | no |
| 125 | 2018 | Ingestion of a Multi-Ingredient Supplement Does Not Alter Exercise-Induced Satel | [10.1093/jn/nxy063](https://doi.org/10.1093/jn/nxy063) | The Journal of nutrition | abstract_only | no |
| 126 | 2016 | Effects of plyometric training and creatine supplementation on maximal-intensity | [10.1016/j.jsams.2015.10.005](https://doi.org/10.1016/j.jsams.2015.10.005) | Journal of science and medicine in sport | abstract_only | no |
| 127 | 2016 | Can Creatine Supplementation Improve Body Composition and Objective Physical Fun | [10.1002/acr.22747](https://doi.org/10.1002/acr.22747) | Arthritis care & research | abstract_only | no |
| 128 | 2016 | Efficacy and safety of creatine supplementation in juvenile dermatomyositis: A r | [10.1002/mus.24681](https://doi.org/10.1002/mus.24681) | Muscle & nerve | abstract_only | no |
| 129 | 2016 | Creatine Supplementation Increases Total Body Water in Soccer Players: a Deuteri | [10.1055/s-0035-1559690](https://doi.org/10.1055/s-0035-1559690) | International journal of sports medicine | abstract_only | no |
| 130 | 2016 | No effect of acute beetroot juice ingestion on oxygen consumption, glucose kinet | [10.1152/japplphysiol.00658.2015](https://doi.org/10.1152/japplphysiol.00658.2015) | Journal of applied physiology (Bethesda, | abstract_only | no |
| 131 | 2015 | Effects of Creatine and Sodium Bicarbonate Coingestion on Multiple Indices of Me | [10.1123/ijsnem.2014-0146](https://doi.org/10.1123/ijsnem.2014-0146) | International journal of sport nutrition | abstract_only | no |
| 132 | 2015 | Six-Week Oral Guanidinoacetic Acid Administration Improves Muscular Performance  | [10.1097/jim.0000000000000212](https://doi.org/10.1097/jim.0000000000000212) | Journal of investigative medicine : the  | abstract_only | no |
| 133 | 2015 | The effect of 12-wk ω-3 fatty acid supplementation on in vivo thalamus glutathio | [10.1016/j.nut.2015.04.019](https://doi.org/10.1016/j.nut.2015.04.019) | Nutrition (Burbank, Los Angeles County,  | abstract_only | no |
| 134 | 2014 | Short-term creatine supplementation does not reduce increased homocysteine conce | [10.1007/s00394-013-0636-1](https://doi.org/10.1007/s00394-013-0636-1) | European journal of nutrition | abstract_only | no |
| 135 | 2014 | The effect of creatine loading on neuromuscular fatigue in women. | [10.1249/mss.0000000000000194](https://doi.org/10.1249/mss.0000000000000194) | Medicine and science in sports and exerc | abstract_only | no |
| 136 | 2014 | Creatine supplementation and resistance training in vulnerable older women: a ra | [10.1016/j.exger.2014.02.003](https://doi.org/10.1016/j.exger.2014.02.003) | Experimental gerontology | abstract_only | no |
| 137 | 2014 | Efficacy and safety of creatine supplementation in childhood-onset systemic lupu | [10.1177/0961203314546017](https://doi.org/10.1177/0961203314546017) | Lupus | abstract_only | no |
| 138 | 2013 | Feasibility and efficacy of progressive resistance training and dietary suppleme | [10.3109/0284186x.2012.741325](https://doi.org/10.3109/0284186x.2012.741325) | Acta oncologica (Stockholm, Sweden) | abstract_only | no |
| 139 | 2013 | Effects of creatine supplementation in taekwondo practitioners. | [10.3305/nh.2013.28.2.6314](https://doi.org/10.3305/nh.2013.28.2.6314) | Nutricion hospitalaria | abstract_only | no |
| 140 | 2013 | Effects of creatine supplementation on oxidative stress and inflammatory markers | [10.1016/j.nut.2013.03.003](https://doi.org/10.1016/j.nut.2013.03.003) | Nutrition (Burbank, Los Angeles County,  | abstract_only | no |
| 141 | 2012 | Influence of creatine supplementation on the functional capacity of patients wit | [10.1590/s0066-782x2012005000056](https://doi.org/10.1590/s0066-782x2012005000056) | Arquivos brasileiros de cardiologia | abstract_only | no |
| 142 | 2011 | The influence of creatine supplementation on the cognitive functioning of vegeta | [10.1017/s0007114510004733](https://doi.org/10.1017/s0007114510004733) | The British journal of nutrition | abstract_only | no |
| 143 | 2011 | Creatine in type 2 diabetes: a randomized, double-blind, placebo-controlled tria | [10.1249/mss.0b013e3181fcee7d](https://doi.org/10.1249/mss.0b013e3181fcee7d) | Medicine and science in sports and exerc | abstract_only | no |
| 144 | 2011 | Beneficial effect of creatine supplementation in knee osteoarthritis. | [10.1249/mss.0b013e3182118592](https://doi.org/10.1249/mss.0b013e3182118592) | Medicine and science in sports and exerc | abstract_only | no |
| 145 | 2011 | Creatine supplementation does not augment muscle carnosine content in type 2 dia | [10.1139/h11-083](https://doi.org/10.1139/h11-083) | Applied physiology, nutrition, and metab | abstract_only | no |
| 146 | 2011 | Creatine supplementation does not impair kidney function in type 2 diabetic pati | [10.1007/s00421-010-1676-3](https://doi.org/10.1007/s00421-010-1676-3) | European journal of applied physiology | abstract_only | no |
| 147 | 2010 | Effect of creatine supplementation as a potential adjuvant therapy to exercise t | [10.1177/0269215510367995](https://doi.org/10.1177/0269215510367995) | Clinical rehabilitation | abstract_only | no |
| 148 | 2010 | Effect of nutritional supplementation with milk whey proteins in amyotrophic lat | [10.1590/s0004-282x2010000200021](https://doi.org/10.1590/s0004-282x2010000200021) | Arquivos de neuro-psiquiatria | abstract_only | no |
| 149 | 2007 | The effect and safety of short-term creatine supplementation on performance of p | [10.7205/milmed.172.3.312](https://doi.org/10.7205/milmed.172.3.312) | Military medicine | abstract_only | no |
| 150 | 2007 | A creatine-protein-carbohydrate supplement enhances responses to resistance trai | [10.1249/mss.0b013e31814fb52a](https://doi.org/10.1249/mss.0b013e31814fb52a) | Medicine and science in sports and exerc | abstract_only | no |
| 151 | 2007 | Effects of whey isolate, creatine, and resistance training on muscle hypertrophy | [10.1249/01.mss.0000247002.32589.ef](https://doi.org/10.1249/01.mss.0000247002.32589.ef) | Medicine and science in sports and exerc | abstract_only | no |
| 152 | 2006 | Influence of creatine supplementation on 800 m wheelchair performance: a pilot s | [10.1038/sj.sc.3101840](https://doi.org/10.1038/sj.sc.3101840) | Spinal cord | abstract_only | no |
| 153 | 2004 | The effects of creatine supplementation on muscular performance and body composi | [10.1007/s00421-003-1031-z](https://doi.org/10.1007/s00421-003-1031-z) | European journal of applied physiology | abstract_only | no |
| 154 | 2003 | Beneficial effects of creatine supplementation in dystrophic patients. | [10.1002/mus.10355](https://doi.org/10.1002/mus.10355) | Muscle & nerve | abstract_only | no |
| 155 | 2003 | Creatine supplementation and its effect on musculotendinous stiffness and perfor | [10.1519/1533-4287(2003)017<0026:csaieo>2.0.co;2](https://doi.org/10.1519/1533-4287(2003)017<0026:csaieo>2.0.co;2) | Journal of strength and conditioning res | abstract_only | no |
| 156 | 2001 | Effect of creatine on performance of militarily relevant tasks and soldier healt | [10.1093/milmed/166.11.996](https://doi.org/10.1093/milmed/166.11.996) | Military medicine | abstract_only | no |

## ECU scores — this run only

| Outcome | 0–100 | Verdict | effect | in your form | at your dose | evidence | n |
|---|---:|---|---|---|---|---|---:|
| muscle_strength | 69 | probably works | -0.01 @ 100% | 0.80 (pooled -0.07 @ 71%) | -0.07 @ 37% | 91% | 17 |
| lean_body_mass | 67 | probably works | -0.00 @ 100% | 0.80 (pooled -0.02 @ 74%) | -0.16 @ 33% | 87% | 11 |
| muscle_power | 63 | probably works | +0.04 @ 100% | 0.80 (pooled +0.17 @ 51%) | +0.41 @ 29% | 97% | 26 |
| exercise_endurance | 31 | probably does not work | -0.25 @ 100% | all negative (-0.31 @ 78%) | -0.29 @ 36% | 76% | 9 |
| energy_levels | 14 | works, but not tested for your product | +0.38 @ 100% | not tested in your form | +0.30 @ 30% | 28% | 2 |

_0–100 = 100 × c × mean(effect, form, dose). Each arc shows its verdict and the share of evidence behind it. A low number with a FULL evidence arc means 'does not work'; with an EMPTY one it means 'barely studied'._


_Old rows from previous runs are not shown here._

## Which studies made each number

### muscle_strength — signed -1

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:101249mss0000000000003202` | -5.17 | 0.6 | -0.35 | 4 | exact |
| `doi:103390nu10111640` | +4.55 | 0.1846 | 1.0 | 4 | unspecified |
| `doi:101111sms14629` | +3.13 | 0.4234 | 0.3 | 4 | exact |
| `doi:101007s1260300901248` | -2.52 | 0.2922 | -0.35 | 4 | exact |
| `doi:101519jsc0000000000001223` | -1.49 | 0.1732 | -0.35 | 4 | exact |
| `doi:101136bjsm2005022558` | -1.34 | 0.1556 | -0.35 | 4 | unspecified |
| `doi:103390nu8030143` | +1.23 | 0.05 | 1.0 | 4 | unspecified |
| `doi:1033549physiolres935323` | +1.18 | 0.1602 | 0.3 | 4 | exact |
| `doi:103390nu16162772` | -0.93 | 0.1074 | -0.35 | 4 | unspecified |
| `doi:1015191533428720030170026csaieo20co2` | +0.91 | 0.0738 | 0.5 | 4 | unspecified |
| `registry:isrctn83081058` | +0.76 | 0.1025 | 0.3 | 4 | exact |
| `doi:101007s004210031031z` | -0.58 | 0.0677 | -0.35 | 4 | exact |
| `registry:nct01164020` | +0.57 | 0.6993 | 0.03333333333333336 | 4 | exact |
| `doi:103390nu9111169` | -0.43 | 0.05 | -0.35 | 4 | unspecified |
| `registry:nct01472393` | -0.28 | 0.0978 | -0.11666666666666665 | 4 | unspecified |
| **sum of all 17** | **-0.56** | | | | |

### lean_body_mass — signed +0

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:103390nu12010193` | -7.01 | 0.7236 | -0.35 | 4 | exact |
| `doi:101249mss0000000000003202` | +4.98 | 0.6 | 0.3 | 4 | exact |
| `doi:101007bf02982622` | +3.60 | 0.3896 | 0.3333333333333333 | 4 | unspecified |
| `doi:101007s1260300901248` | -2.83 | 0.2922 | -0.35 | 4 | exact |
| `doi:103390nu10111640` | -2.36 | 0.1846 | -0.46237731733914933 | 4 | unspecified |
| `doi:1033549physiolres935323` | +1.33 | 0.1602 | 0.3 | 4 | exact |
| `doi:103390nu17061081` | +1.11 | 0.3239 | 0.12345679012345667 | 4 | exact |
| `registry:nct04048616` | -1.07 | 0.11 | -0.35 | 4 | unspecified |
| `registry:isrctn83081058` | +0.85 | 0.1025 | 0.3 | 4 | exact |
| `registry:nct01472393` | +0.81 | 0.0978 | 0.3 | 4 | unspecified |
| `doi:101007s004210031031z` | +0.56 | 0.0677 | 0.3 | 4 | exact |
| **sum of all 11** | **-0.03** | | | | |

### muscle_power — signed +4

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:103390ijerph18136919` | +6.72 | 0.3903 | 1.0 | 4 | exact |
| `doi:103390nu17243831` | +5.92 | 0.3438 | 1.0 | 4 | exact |
| `doi:103390nu15163567` | +2.96 | 0.1716 | 1.0 | 4 | exact |
| `doi:103390nu12102961` | +2.80 | 0.1626 | 1.0 | 4 | unspecified |
| `doi:101186s12970021004077` | +2.76 | 0.1602 | 1.0 | 4 | unspecified |
| `doi:103390nu16152437` | -2.62 | 0.4341 | -0.35 | 4 | unspecified |
| `doi:101038s4159802644278x` | -2.57 | 0.4268 | -0.35 | 4 | exact |
| `doi:101111sms14629` | -2.55 | 0.4234 | -0.35 | 4 | exact |
| `doi:101186s1297001701622` | -2.35 | 0.3903 | -0.35 | 4 | unspecified |
| `doi:103390nu16091324` | -2.09 | 0.3473 | -0.35 | 4 | exact |
| `doi:101016jjsams201510005` | -1.18 | 0.195 | -0.35 | 4 | unspecified |
| `doi:101519jsc0000000000001223` | -1.04 | 0.1732 | -0.35 | 4 | exact |
| `doi:101016jnut201303003` | +0.95 | 0.1845 | 0.3 | 4 | unspecified |
| `doi:101136bjsm2005022558` | -0.94 | 0.1556 | -0.35 | 4 | unspecified |
| `doi:101123ijsnem20140146` | +0.90 | 0.0525 | 1.0 | 4 | exact |
| **sum of all 26** | **+3.94** | | | | |

### exercise_endurance — signed -18

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:103390nu12010193` | -8.86 | 0.7236 | -0.35 | 4 | exact |
| `doi:101111sms14629` | -5.19 | 0.4234 | -0.35 | 4 | exact |
| `doi:101016jjsams201510005` | -2.39 | 0.195 | -0.35 | 4 | unspecified |
| `doi:103390ijerph18136919` | -2.28 | 0.3903 | -0.16666666666666666 | 4 | exact |
| `doi:101113ep087886` | +2.00 | 0.0573 | 1.0 | 4 | unspecified |
| `doi:103390nu9121359` | -1.41 | 0.1149 | -0.35 | 4 | different |
| `doi:10117719417381251320095` | +1.13 | 0.1079 | 0.3 | 4 | unspecified |
| `doi:103390nu14061140` | -1.11 | 0.0903 | -0.35 | 4 | exact |
| `doi:101017s000711451800017x` | -0.27 | 0.022 | -0.35 | 4 | exact |
| **sum of all 9** | **-18.38** | | | | |

### energy_levels — signed +11

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:103390nu16060896` | +5.94 | 0.3513 | 0.3 | 4 | unspecified |
| `doi:103390nu18081192` | +4.81 | 0.1462 | 0.5833333333333334 | 4 | unspecified |
| **sum of all 2** | **+10.75** | | | | |

_`points` sum to the signed score. NEGATIVE points mean that study pushed the score down. `w` is quality (design × RoB × size × funding × OA); `s` is what it found (+1.0 meaningful benefit, +0.3 trivial/unsized, −0.7 null, −1.0 harm). The two are separate on purpose: how good a study is and what it found are different facts._

## Database snapshot (`creatine`)

### `pilot_creatine_supp.sqlite`

Studies stored (corpus): **200** · ECUs: **0** · syntheses: **50

## Notes

- Claude and Grok scores are **never merged**.

- Form does **not** penalize the center score; it is the form arc only.

- Predatory venues: flagged + counted; weight zero is OFF for now.

- Inconclusive + low n is often the confidence ceiling (SPEC 13), not a bug.

- This report is **this run only** — other ingredients are not mixed in.
