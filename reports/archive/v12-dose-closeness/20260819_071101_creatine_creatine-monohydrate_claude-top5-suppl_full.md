# BS-PROOF full audit report (claude-top5-suppl)

Generated: **2026-08-19 07:11 UTC**


scoring_model: v12-dose-closeness

Ingredient: `creatine` · Form: `creatine_monohydrate` · Mode: **claude-top5-suppl**

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
  !! DEMO MODE: exact_form_only=False ignore_population=True kept_claims=1 dropped_nonexact_form=0
     Demo flags suspend scoring rules. NOT a production claim.
  PASS  a vs_ingredient_arm BENEFIT is dropped too (symmetric)  
  form transfer mix (2 claims -> creatine_monohydrate):
    exact        x1.0      2 claims  (100%)
  !! DEMO MODE: exact_form_only=False ignore_population=True kept_claims=2 dropped_nonexact_form=0
     Demo flags suspend scoring rules. NOT a production claim.
  PASS  contrast=None keeps the claim  
  form transfer mix (2 claims -> creatine_monohydrate):
    exact        x1.0      2 claims  (100%)
  !! DEMO MODE: exact_form_only=False ignore_population=True kept_claims=2 dropped_nonexact_form=0
     Demo flags suspend scoring rules. NOT a production claim.
  PASS  contrast=unclear keeps the claim  
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

ALL PASSED
```

## This run — extraction stats

- Targeted studies: **177**
- Succeeded (usable): **176**
- Skipped (no text): **1**
- Partial agent failures: **3**
- Prompt version: `v1.21`
- Concurrency: 40  |  studies in flight: 40

## Token + cost accounting

- Extraction backend: **Claude subscription** (`--safe-mode`, `--max-turns 1`, one shot per call)
- Model calls: **75** (cache hits 981, failures 13)
- Input tokens: **1,259,489** (fresh 23,704 · cache-write 118,361 · cache-read 1,117,424)
- Output tokens: **60,827**
- **Spent on this run: $0.00** — subscription, not metered.
- **API-equivalent cost: $1.979** — what the same work would cost billed per token.
- Per study: **0.4 calls**, **$0.0112** API-equivalent across 176 scored studies.

| Agent | Tier | Model | Calls | Cache hits | Fail | In | Out | API-equiv |
|---|---|---|--:|--:|--:|--:|--:|--:|
| S3 | B | `claude-sonnet-5` | 16 | 163 | 4 | 909,655 | 8,941 | $0.606 |
| S4 | B | `claude-sonnet-5` | 13 | 165 | 3 | 51,235 | 5,216 | $0.209 |
| S5 | B | `claude-sonnet-5` | 16 | 164 | 6 | 176,758 | 18,696 | $0.603 |
| S6B | C | `claude-sonnet-5` | 10 | 157 | 0 | 43,500 | 7,534 | $0.214 |
| S7 | B | `claude-sonnet-5` | 10 | 166 | 0 | 54,755 | 3,922 | $0.229 |
| S8 | A | `claude-haiku-4-5-20251001` | 10 | 166 | 0 | 23,586 | 16,518 | $0.118 |

Tier → model is pinned in `claude_adapter.TIER_MODEL` (full ids, never aliases: an alias floats to a new model while the cache key does not change). Tier A = classification, B = extraction, C = the highest-risk agent.

## Predatory journal check (flag only — not in score)

- List entries loaded: **1162**
- Studies checked: **1008**
- Publisher resolved for: **707/1008** (the list is PUBLISHERS, so this is the real coverage)
- Studies flagged predatory: **12**
- Distinct publishers flagged: **1**
- Distinct journals flagged: **0**
- Affects score: **NO (count only)**
  - [publisher] Frontiers Media SA

## Systematic reviews / meta-analyses (S2)

- Requested (cap): **0**
- S2 extractions ok: **0**
- Resolved for multiplier: **0**
_SRs never add patients; only a capped confidence boost (≤ +30%)._

## Per-agent success rates (this run)

| Agent | Studies OK | Studies failed | Cache | Retries | Why it failed |
|---|---:|---:|---:|---:|---|
| S3 | 175 | 1 | 163 | 0 | exit 1: Prompt is too long (x1) |
| S4 | 175 | 1 | 165 | 0 | exit 1: max_turns (x1) |
| S5 | 174 | 2 | 164 | 0 | exit 1: max_turns (x1); exit 1: Prompt is too long (x1) |
| S7 | 176 | 0 | 166 | 0 | — |
| S8 | 176 | 0 | 166 | 0 | — |

_One row per STUDY. The cost table above counts CLI ATTEMPTS, so its totals are higher by exactly the retries column._

**Telemetry does not reconcile — do not quote these rates:**
- S6B: 10 attempts in the cost table but no row in the success table -- its failures are invisible to anyone reading success rates
- S3: 16 attempts for 176 studies -- impossible, every study needs at least one attempt
- S4: 13 attempts for 176 studies -- impossible, every study needs at least one attempt
- S5: 16 attempts for 176 studies -- impossible, every study needs at least one attempt
- S7: 10 attempts for 176 studies -- impossible, every study needs at least one attempt
- S8: 10 attempts for 176 studies -- impossible, every study needs at least one attempt

## SPEED REPORT
_Not available._

## Studies extracted this run (177)

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
| 23 | 2024 | Obesity and Metabolic Disease Impair the Anabolic Response to Protein Supplement | [10.3390/nu16244407](https://doi.org/10.3390/nu16244407) | Nutrients | full_text | no |
| 24 | 2024 | High-dose short-term creatine supplementation without beneficial effects in prof | [10.1080/15502783.2024.2340574](https://doi.org/10.1080/15502783.2024.2340574) | Journal of the International Society of  | full_text | no |
| 25 | 2024 | No additive effect of creatine, caffeine, and sodium bicarbonate on intense exer | [10.1111/sms.14629](https://doi.org/10.1111/sms.14629) | Scandinavian journal of medicine & scien | full_text | no |
| 26 | 2024 | Impact of Short-Term Creatine Supplementation on Muscular Performance among Brea | [10.3390/nu16070979](https://doi.org/10.3390/nu16070979) | Nutrients | full_text | no |
| 27 | 2024 | Effect of Creatine Supplementation on Body Composition and Malnutrition-Inflamma | [10.3390/nu16050615](https://doi.org/10.3390/nu16050615) | Nutrients | full_text | no |
| 28 | 2024 | The Effect of Creatine Nitrate and Caffeine Individually or Combined on Exercise | [10.3390/nu16060766](https://doi.org/10.3390/nu16060766) | Nutrients | full_text | no |
| 29 | 2024 | Effects of a Low Dose of Orally Administered Creatine Monohydrate on Post-Fatigu | [10.3390/nu16091324](https://doi.org/10.3390/nu16091324) | Nutrients | full_text | no |
| 30 | 2024 | The Effect of Prior Creatine Intake for 28 Days on Accelerated Recovery from Exe | [10.3390/nu16060896](https://doi.org/10.3390/nu16060896) | Nutrients | full_text | no |
| 31 | 2024 | Creatine supplementation combined with breathing exercises reduces respiratory d | [10.4103/jpgm.jpgm_650_23](https://doi.org/10.4103/jpgm.jpgm_650_23) | Journal of postgraduate medicine | full_text | no |
| 32 | 2023 | The Effects of Protein and Carbohydrate Supplementation, with and without Creati | [10.3390/nu15245134](https://doi.org/10.3390/nu15245134) | Nutrients | full_text | no |
| 33 | 2023 | Creatine monohydrate supplementation changes total body water and DXA lean mass  | [10.1080/15502783.2023.2193556](https://doi.org/10.1080/15502783.2023.2193556) | Journal of the International Society of  | full_text | no |
| 34 | 2023 | The Effects of Creatine Monohydrate Loading on Exercise Recovery in Active Women | [10.3390/nu15163567](https://doi.org/10.3390/nu15163567) | Nutrients | full_text | no |
| 35 | 2023 | The role of resistance training and creatine supplementation on oxidative stress | [10.3389/fpubh.2023.1062832](https://doi.org/10.3389/fpubh.2023.1062832) | Frontiers in public health | full_text | YES |
| 36 | 2023 | The effects of creatine supplementation on cognitive performance-a randomised co | [10.1186/s12916-023-03146-5](https://doi.org/10.1186/s12916-023-03146-5) | BMC medicine | full_text | no |
| 37 | 2023 | The Effect of Acute Pre-Workout Supplement Ingestion on Basketball-Specific Perf | [10.3390/nu15102304](https://doi.org/10.3390/nu15102304) | Nutrients | full_text | no |
| 38 | 2023 | A randomized controlled pilot trial to assess the effectiveness of a specially f | [10.1186/s12905-023-02476-z](https://doi.org/10.1186/s12905-023-02476-z) | BMC women's health | full_text | no |
| 39 | 2023 | Comparing D3-Creatine Dilution and Dual-Energy X-ray Absorptiometry Muscle Mass  | [10.1093/gerona/glad047](https://doi.org/10.1093/gerona/glad047) | The journals of gerontology. Series A, B | full_text | no |
| 40 | 2023 | A Randomized Controlled Trial of Changes in Fluid Distribution across Menstrual  | [10.3390/nu15020429](https://doi.org/10.3390/nu15020429) | Nutrients | full_text | no |
| 41 | 2023 | Application of the D&lt;sub&gt;3&lt;/sub&gt; -creatine muscle mass assessment to | [10.1002/jcsm.13322](https://doi.org/10.1002/jcsm.13322) | Journal of cachexia, sarcopenia and musc | full_text | no |
| 42 | 2023 | A 2-yr Randomized Controlled Trial on Creatine Supplementation during Exercise f | [10.1249/mss.0000000000003202](https://doi.org/10.1249/mss.0000000000003202) | Medicine and science in sports and exerc | full_text | no |
| 43 | 2023 | The Folic Acid and Creatine Trial: Treatment Effects of Supplementation on Arsen | [10.1289/ehp11270](https://doi.org/10.1289/ehp11270) | Environmental health perspectives | full_text | no |
| 44 | 2022 | Effects of Oral Creatine Supplementation on Power Output during Repeated Treadmi | [10.3390/nu14061140](https://doi.org/10.3390/nu14061140) | Nutrients | full_text | no |
| 45 | 2022 | Effects of Four Weeks of Beta-Alanine Supplementation Combined with One Week of  | [10.3390/ijerph19137992](https://doi.org/10.3390/ijerph19137992) | International journal of environmental r | full_text | no |
| 46 | 2022 | A randomized open-labeled study to examine the effects of creatine monohydrate a | [10.1080/15502783.2022.2108683](https://doi.org/10.1080/15502783.2022.2108683) | Journal of the International Society of  | full_text | no |
| 47 | 2022 | Effects of ibudilast on central and peripheral markers of inflammation in alcoho | [10.1111/adb.13182](https://doi.org/10.1111/adb.13182) | Addiction biology | full_text | no |
| 48 | 2021 | Morning versus Evening Intake of Creatine in Elite Female Handball Players. | [10.3390/ijerph19010393](https://doi.org/10.3390/ijerph19010393) | International journal of environmental r | full_text | no |
| 49 | 2021 | Short-Term Creatine Loading Improves Total Work and Repetitions to Failure but N | [10.3390/nu13030826](https://doi.org/10.3390/nu13030826) | Nutrients | full_text | no |
| 50 | 2021 | The effects of phosphocreatine disodium salts plus blueberry extract supplementa | [10.1186/s12970-021-00456-y](https://doi.org/10.1186/s12970-021-00456-y) | Journal of the International Society of  | full_text | no |
| 51 | 2021 | Short-term co-ingestion of creatine and sodium bicarbonate improves anaerobic pe | [10.1186/s12970-021-00407-7](https://doi.org/10.1186/s12970-021-00407-7) | Journal of the International Society of  | full_text | no |
| 52 | 2021 | Creatine Enhances the Effects of Cluster-Set Resistance Training on Lower-Limb B | [10.3390/nu13072303](https://doi.org/10.3390/nu13072303) | Nutrients | full_text | no |
| 53 | 2021 | Effects of Combined Creatine and Sodium Bicarbonate Supplementation on Soccer-Sp | [10.3390/ijerph18136919](https://doi.org/10.3390/ijerph18136919) | International journal of environmental r | full_text | no |
| 54 | 2021 | Effect of Creatine Supplementation on Functional Capacity and Muscle Oxygen Satu | [10.3390/nu13010149](https://doi.org/10.3390/nu13010149) | Nutrients | full_text | no |
| 55 | 2021 | Pharmacokinetics, Pharmacodynamics, and Tolerability of AZD5718, an Oral 5-Lipox | [10.1007/s40261-021-01078-7](https://doi.org/10.1007/s40261-021-01078-7) | Clinical drug investigation | full_text | no |
| 56 | 2020 | Effects of Creatine Supplementation during Resistance Training Sessions in Physi | [10.3390/nu12061880](https://doi.org/10.3390/nu12061880) | Nutrients | full_text | no |
| 57 | 2020 | Effect of Ten Weeks of Creatine Monohydrate Plus HMB Supplementation on Athletic | [10.3390/nu12010193](https://doi.org/10.3390/nu12010193) | Nutrients | full_text | no |
| 58 | 2020 | The Effects of Long-Term Magnesium Creatine Chelate Supplementation on Repeated  | [10.3390/nu12102961](https://doi.org/10.3390/nu12102961) | Nutrients | full_text | no |
| 59 | 2020 | The addition of β-Hydroxy β-Methylbutyrate (HMB) to creatine monohydrate supplem | [10.1186/s12970-020-00359-4](https://doi.org/10.1186/s12970-020-00359-4) | Journal of the International Society of  | full_text | no |
| 60 | 2020 | Effects of Monomeric and Oligomeric Flavanols on Kidney Function, Inflammation a | [10.3390/nu12061634](https://doi.org/10.3390/nu12061634) | Nutrients | full_text | no |
| 61 | 2019 | Examining the effects of creatine supplementation in augmenting adaptations to r | [10.1136/bmjopen-2019-030080](https://doi.org/10.1136/bmjopen-2019-030080) | BMJ open | full_text | no |
| 62 | 2019 | Effect of Creatine Supplementation Dosing Strategies on Aging Muscle Performance | [10.1007/s12603-018-1148-8](https://doi.org/10.1007/s12603-018-1148-8) | The journal of nutrition, health & aging | full_text | no |
| 63 | 2019 | Creatine electrolyte supplement improves anaerobic power and strength: a randomi | [10.1186/s12970-019-0291-x](https://doi.org/10.1186/s12970-019-0291-x) | Journal of the International Society of  | full_text | no |
| 64 | 2018 | Effects of 4-Week Creatine Supplementation Combined with Complex Training on Mus | [10.3390/nu10111640](https://doi.org/10.3390/nu10111640) | Nutrients | full_text | no |
| 65 | 2018 | Creatine-electrolyte supplementation improves repeated sprint cycling performanc | [10.1186/s12970-018-0226-y](https://doi.org/10.1186/s12970-018-0226-y) | Journal of the International Society of  | full_text | no |
| 66 | 2018 | Creatine Supplementation Supports the Rehabilitation of Adolescent Fin Swimmers  | [PMID 29769829](https://pubmed.ncbi.nlm.nih.gov/29769829/) | Journal of sports science & medicine | full_text | no |
| 67 | 2018 | The Effect of a High-Dose Vitamin B Multivitamin Supplement on the Relationship  | [10.3390/nu10121860](https://doi.org/10.3390/nu10121860) | Nutrients | full_text | no |
| 68 | 2017 | Effects of Creatine Supplementation on Muscle Strength and Optimal Individual Po | [10.3390/nu9111169](https://doi.org/10.3390/nu9111169) | Nutrients | full_text | no |
| 69 | 2017 | Hematological and Hemodynamic Responses to Acute and Short-Term Creatine Nitrate | [10.3390/nu9121359](https://doi.org/10.3390/nu9121359) | Nutrients | full_text | no |
| 70 | 2017 | Effect of low dose, short-term creatine supplementation on muscle power output i | [10.1186/s12970-017-0162-2](https://doi.org/10.1186/s12970-017-0162-2) | Journal of the International Society of  | full_text | no |
| 71 | 2016 | The Effects of Creatine Supplementation on Explosive Performance and Optimal Ind | [10.3390/nu8030143](https://doi.org/10.3390/nu8030143) | Nutrients | full_text | no |
| 72 | 2016 | Effects of Coffee and Caffeine Anhydrous Intake During Creatine Loading. | [10.1519/jsc.0000000000001223](https://doi.org/10.1519/jsc.0000000000001223) | Journal of strength and conditioning res | full_text | no |
| 73 | 2015 | Creatine supplementation enhances corticomotor excitability and cognitive perfor | [10.1523/jneurosci.3113-14.2015](https://doi.org/10.1523/jneurosci.3113-14.2015) | The Journal of neuroscience : the offici | full_text | no |
| 74 | 2015 | The acute effect of beta-guanidinopropionic acid versus creatine or placebo in h | [10.1186/s13063-015-0581-9](https://doi.org/10.1186/s13063-015-0581-9) | Trials | full_text | no |
| 75 | 2013 | Creatine supplementation associated or not with strength training upon emotional | [10.1371/journal.pone.0076301](https://doi.org/10.1371/journal.pone.0076301) | PloS one | full_text | no |
| 76 | 2009 | Creatine fails to augment the benefits from resistance training in patients with | [10.1371/journal.pone.0004605](https://doi.org/10.1371/journal.pone.0004605) | PloS one | full_text | no |
| 77 | 2006 | Creatine supplementation and physical training in patients with COPD: a double b | [10.2147/copd.2006.1.4.445](https://doi.org/10.2147/copd.2006.1.4.445) | International journal of chronic obstruc | full_text | no |
| 78 | 2006 | The effects of creatine supplementation on selected factors of tennis specific t | [10.1136/bjsm.2005.022558](https://doi.org/10.1136/bjsm.2005.022558) | British journal of sports medicine | full_text | no |
| 79 | 2026 | Feasibility, safety and tolerability of intradialytic creatine supplementation i | [10.1371/journal.pone.0354883](https://doi.org/10.1371/journal.pone.0354883) | PloS one | abstract_only | no |
| 80 | 2026 | Effects of creatine supplementation with and without exercise and diet intervent | [10.1080/15502783.2026.2716273](https://doi.org/10.1080/15502783.2026.2716273) | Journal of the International Society of  | abstract_only | no |
| 81 | 2026 | Examining the feasibility and preliminary effects of resistance exercise trainin | [10.1371/journal.pone.0353630](https://doi.org/10.1371/journal.pone.0353630) | PloS one | abstract_only | no |
| 82 | 2026 | Protein Supplementation for Hip Fracture Recovery in Elderly Patients: A Randomi | [10.1097/bot.0000000000003158](https://doi.org/10.1097/bot.0000000000003158) | Journal of orthopaedic trauma | abstract_only | no |
| 83 | 2026 | Effects of high-load, velocity-intentional variable resistance training combined | [10.1016/j.exger.2026.113122](https://doi.org/10.1016/j.exger.2026.113122) | Experimental gerontology | abstract_only | no |
| 84 | 2026 | The impact of fitness and supplement TikTok content on body, nutrition and fitne | [10.1016/j.bodyim.2026.102082](https://doi.org/10.1016/j.bodyim.2026.102082) | Body image | abstract_only | no |
| 85 | 2026 | Creatine supplementation modifies fat deposition in arm and leg tissues in indiv | [10.1016/j.nut.2026.113175](https://doi.org/10.1016/j.nut.2026.113175) | Nutrition (Burbank, Los Angeles County,  | abstract_only | no |
| 86 | 2026 | Beetroot juice or creatine: which yields greater short-term benefits for resista | [10.1080/09637486.2026.2625827](https://doi.org/10.1080/09637486.2026.2625827) | International journal of food sciences a | abstract_only | no |
| 87 | 2026 | Independent effects of whey protein and alkali supplementation on muscle health  | [10.1016/j.ajcnut.2026.101257](https://doi.org/10.1016/j.ajcnut.2026.101257) | The American journal of clinical nutriti | abstract_only | no |
| 88 | 2026 | Combined creatine and HMB co-supplementation improves functional strength indepe | [10.1007/s11357-025-01889-y](https://doi.org/10.1007/s11357-025-01889-y) | GeroScience | abstract_only | no |
| 89 | 2026 | The Effects of 8-Week Creatine Hydrochloride and Creatine Ethyl Ester Supplement | [10.1080/27697061.2025.2551184](https://doi.org/10.1080/27697061.2025.2551184) | Journal of the American Nutrition Associ | abstract_only | no |
| 90 | 2026 | Effects of Differing Nutritional Supplementation Combined With High-Intensity Ae | [10.1097/phm.0000000000002932](https://doi.org/10.1097/phm.0000000000002932) | American journal of physical medicine &  | abstract_only | no |
| 91 | 2025 | Effects of a Blend of Trisodium Citrate, Creatine Monohydrate, Leucine, and Blue | [10.1080/19390211.2025.2518408](https://doi.org/10.1080/19390211.2025.2518408) | Journal of dietary supplements | abstract_only | no |
| 92 | 2025 | Lowering plasma S-Adenosylhomocysteine (SAH) in healthy adults with elevated SAH | [10.1016/j.numecd.2025.104221](https://doi.org/10.1016/j.numecd.2025.104221) | Nutrition, metabolism, and cardiovascula | abstract_only | no |
| 93 | 2025 | Effect of a Multi-Ingredient Post-Workout Dietary Supplement on Body Composition | [10.1080/19390211.2025.2488811](https://doi.org/10.1080/19390211.2025.2488811) | Journal of dietary supplements | abstract_only | no |
| 94 | 2025 | Effects of Combined Versus Single Supplementation of Creatine, Beta-Alanine, and | [10.1123/ijspp.2024-0310](https://doi.org/10.1123/ijspp.2024-0310) | International journal of sports physiolo | abstract_only | no |
| 95 | 2025 | Creatine with guanidinoacetic acid improves prefrontal brain oxygenation before, | [10.1177/02601060241300236](https://doi.org/10.1177/02601060241300236) | Nutrition and health | abstract_only | no |
| 96 | 2025 | Creatine supplementation does not add to resistance training effects in prostate | [10.1016/j.jsams.2024.09.002](https://doi.org/10.1016/j.jsams.2024.09.002) | Journal of science and medicine in sport | abstract_only | no |
| 97 | 2025 | Efficacy and safety profile of oral creatine monohydrate in add-on to cognitive- | [10.1016/j.euroneuro.2024.10.004](https://doi.org/10.1016/j.euroneuro.2024.10.004) | European neuropsychopharmacology : the j | abstract_only | no |
| 98 | 2024 | The Effect of Multi-Ingredient Protein versus Collagen Supplementation on Satell | [10.1249/mss.0000000000003505](https://doi.org/10.1249/mss.0000000000003505) | Medicine and science in sports and exerc | abstract_only | no |
| 99 | 2024 | Effects of acute creatine supplementation on cardiac and vascular responses in o | [10.1016/j.clnesp.2024.07.008](https://doi.org/10.1016/j.clnesp.2024.07.008) | Clinical nutrition ESPEN | abstract_only | no |
| 100 | 2024 | The effects of 3-month supplementation with synbiotic on patient-reported outcom | [10.1007/s00394-024-03546-0](https://doi.org/10.1007/s00394-024-03546-0) | European journal of nutrition | abstract_only | no |
| 101 | 2024 | Short term creatine loading improves strength endurance even without changing ma | [10.1590/0001-3765202420230559](https://doi.org/10.1590/0001-3765202420230559) | Anais da Academia Brasileira de Ciencias | abstract_only | no |
| 102 | 2024 | Eight-Week Creatine-Glucose Supplementation Alleviates Clinical Features of Long | [10.3177/jnsv.70.174](https://doi.org/10.3177/jnsv.70.174) | Journal of nutritional science and vitam | abstract_only | no |
| 103 | 2024 | Clinical Effect Analysis of Different Doses of Creatine Phosphate Sodium Combine | [10.1007/s00246-024-03450-8](https://doi.org/10.1007/s00246-024-03450-8) | Pediatric cardiology | abstract_only | no |
| 104 | 2024 | Application of the Win Ratio Method in the ENGAGE AF-TIMI 48 Trial Comparing Edo | [10.1161/circoutcomes.123.010561](https://doi.org/10.1161/circoutcomes.123.010561) | Circulation. Cardiovascular quality and  | abstract_only | no |
| 105 | 2023 | Creatine supplementation combined with blood flow restriction training enhances  | [10.1139/apnm-2022-0209](https://doi.org/10.1139/apnm-2022-0209) | Applied physiology, nutrition, and metab | abstract_only | no |
| 106 | 2023 | Does creatine supplementation affect recovery speed of impulse above critical to | [10.1080/17461391.2022.2159539](https://doi.org/10.1080/17461391.2022.2159539) | European journal of sport science | abstract_only | no |
| 107 | 2023 | Effect of Sodium Bicarbonate Supplementation on Muscle Performance and Muscle Da | [10.1080/19390211.2022.2090478](https://doi.org/10.1080/19390211.2022.2090478) | Journal of dietary supplements | abstract_only | no |
| 108 | 2022 | Creatine Monohydrate Supplementation, but not Creatyl-L-Leucine, Increased Muscl | [10.1123/ijsnem.2022-0074](https://doi.org/10.1123/ijsnem.2022-0074) | International journal of sport nutrition | abstract_only | no |
| 109 | 2022 | Effects of Creatine and Caffeine Supplementation During Resistance Training on B | [10.1080/19390211.2021.1904085](https://doi.org/10.1080/19390211.2021.1904085) | Journal of dietary supplements | abstract_only | no |
| 110 | 2021 | No evidence for brown adipose tissue activation after creatine supplementation i | [10.1038/s42255-020-00332-0](https://doi.org/10.1038/s42255-020-00332-0) | Nature metabolism | abstract_only | no |
| 111 | 2021 | The Effect of Creatine Supplementation on Muscle Function in Childhood Myositis: | [10.3899/jrheum.191375](https://doi.org/10.3899/jrheum.191375) | The Journal of rheumatology | abstract_only | no |
| 112 | 2021 | Effect of 12 months of creatine supplementation and whole-body resistance traini | [10.1177/0260106020975247](https://doi.org/10.1177/0260106020975247) | Nutrition and health | abstract_only | no |
| 113 | 2021 | Supplement-based nutritional strategies to tackle frailty: A multifactorial, dou | [10.1016/j.clnu.2021.06.024](https://doi.org/10.1016/j.clnu.2021.06.024) | Clinical nutrition (Edinburgh, Scotland) | abstract_only | no |
| 114 | 2021 | Timing of creatine supplementation does not influence gains in unilateral muscle | [10.23736/s0022-4707.20.11668-2](https://doi.org/10.23736/s0022-4707.20.11668-2) | The Journal of sports medicine and physi | abstract_only | no |
| 115 | 2021 | Efficacy of Creatine Supplementation and Resistance Training on Area and Density | [10.1249/mss.0000000000002722](https://doi.org/10.1249/mss.0000000000002722) | Medicine and science in sports and exerc | abstract_only | no |
| 116 | 2021 | Guanidinoacetate-Creatine Supplementation Improves Functional Performance and Mu | [10.1159/000518499](https://doi.org/10.1159/000518499) | Annals of nutrition & metabolism | abstract_only | no |
| 117 | 2020 | Can Creatine Combat the Mental Fatigue-associated Decrease in Visuomotor Skills? | [10.1249/mss.0000000000002122](https://doi.org/10.1249/mss.0000000000002122) | Medicine and science in sports and exerc | abstract_only | no |
| 118 | 2020 | Creatine Supplementation (3 g/d) and Bone Health in Older Women: A 2-Year, Rando | [10.1093/gerona/glz162](https://doi.org/10.1093/gerona/glz162) | The journals of gerontology. Series A, B | abstract_only | no |
| 119 | 2020 | Creatine supplementation does not promote additional effects on inflammation and | [10.1016/j.clnesp.2020.05.024](https://doi.org/10.1016/j.clnesp.2020.05.024) | Clinical nutrition ESPEN | abstract_only | no |
| 120 | 2020 | Creatine supplementation improves performance, but is it safe? Double-blind plac | [10.23736/s0022-4707.20.10437-7](https://doi.org/10.23736/s0022-4707.20.10437-7) | The Journal of sports medicine and physi | abstract_only | no |
| 121 | 2020 | Effect of Multi-Ingredient Preworkout Supplementation on Repeated Sprint Perform | [10.1519/jsc.0000000000003480](https://doi.org/10.1519/jsc.0000000000003480) | Journal of strength and conditioning res | abstract_only | no |
| 122 | 2019 | Creatine supplementation improves performance above critical power but does not  | [10.1113/ep087886](https://doi.org/10.1113/ep087886) | Experimental physiology | abstract_only | no |
| 123 | 2019 | Effect of pre-exercise and post-exercise creatine supplementation on bone minera | [10.1016/j.exger.2019.01.025](https://doi.org/10.1016/j.exger.2019.01.025) | Experimental gerontology | abstract_only | no |
| 124 | 2019 | Guanidinoacetic acid with creatine compared with creatine alone for tissue creat | [10.1016/j.nut.2018.04.009](https://doi.org/10.1016/j.nut.2018.04.009) | Nutrition (Burbank, Los Angeles County,  | abstract_only | no |
| 125 | 2019 | Creatine supplementation can improve impact control in high-intensity interval t | [10.1016/j.nut.2018.09.020](https://doi.org/10.1016/j.nut.2018.09.020) | Nutrition (Burbank, Los Angeles County,  | abstract_only | no |
| 126 | 2019 | Effects of high-velocity resistance training and creatine supplementation in unt | [10.1139/apnm-2019-0066](https://doi.org/10.1139/apnm-2019-0066) | Applied physiology, nutrition, and metab | abstract_only | no |
| 127 | 2019 | Creatine monohydrate supplementation during eight weeks of progressive resistanc | [10.23736/s0022-4707.18.08406-2](https://doi.org/10.23736/s0022-4707.18.08406-2) | The Journal of sports medicine and physi | abstract_only | no |
| 128 | 2019 | Antioxidant vitamin supplementation prevents oxidative stress but does not enhan | [10.1016/j.nut.2019.01.007](https://doi.org/10.1016/j.nut.2019.01.007) | Nutrition (Burbank, Los Angeles County,  | abstract_only | no |
| 129 | 2018 | Effects of Creatine and Carbohydrate Loading on Cycling Time Trial Performance. | [10.1249/mss.0000000000001401](https://doi.org/10.1249/mss.0000000000001401) | Medicine and science in sports and exerc | abstract_only | no |
| 130 | 2018 | Supplementation with Qter<sup>®</sup> and Creatine improves functional performan | [10.1016/j.rmed.2018.08.002](https://doi.org/10.1016/j.rmed.2018.08.002) | Respiratory medicine | abstract_only | no |
| 131 | 2018 | No effect of creatine monohydrate supplementation on inflammatory and cartilage  | [10.1016/j.nutres.2017.12.010](https://doi.org/10.1016/j.nutres.2017.12.010) | Nutrition research (New York, N.Y.) | abstract_only | no |
| 132 | 2018 | Influence of Creatine Supplementation on Apoptosis Markers After Downhill Runnin | [10.1097/phm.0000000000000977](https://doi.org/10.1097/phm.0000000000000977) | American journal of physical medicine &  | abstract_only | no |
| 133 | 2017 | Creatine Monohydrate Supplementation Does Not Augment Fitness, Performance, or B | [10.1123/ijsnem.2016-0129](https://doi.org/10.1123/ijsnem.2016-0129) | International journal of sport nutrition | abstract_only | no |
| 134 | 2017 | Does brain creatine content rely on exogenous creatine in healthy youth? A proof | [10.1139/apnm-2016-0406](https://doi.org/10.1139/apnm-2016-0406) | Applied physiology, nutrition, and metab | abstract_only | no |
| 135 | 2016 | Effects of plyometric training and creatine supplementation on maximal-intensity | [10.1016/j.jsams.2015.10.005](https://doi.org/10.1016/j.jsams.2015.10.005) | Journal of science and medicine in sport | abstract_only | no |
| 136 | 2016 | Effect of creatine supplementation and drop-set resistance training in untrained | [10.1016/j.exger.2016.08.005](https://doi.org/10.1016/j.exger.2016.08.005) | Experimental gerontology | abstract_only | no |
| 137 | 2016 | A Pilot Study Examining the Effects of 8-Week Whey Protein versus Whey Protein P | [10.1159/000452845](https://doi.org/10.1159/000452845) | Annals of nutrition & metabolism | abstract_only | no |
| 138 | 2016 | Can Creatine Supplementation Improve Body Composition and Objective Physical Fun | [10.1002/acr.22747](https://doi.org/10.1002/acr.22747) | Arthritis care & research | abstract_only | no |
| 139 | 2016 | Efficacy and safety of creatine supplementation in juvenile dermatomyositis: A r | [10.1002/mus.24681](https://doi.org/10.1002/mus.24681) | Muscle & nerve | abstract_only | no |
| 140 | 2015 | The effects of creatine supplementation on thermoregulation and isokinetic muscu | [PMID 25781214](https://pubmed.ncbi.nlm.nih.gov/25781214/) | The Journal of sports medicine and physi | abstract_only | no |
| 141 | 2015 | Impact of creatine on muscle performance and phosphagen stores after immobilizat | [10.1007/s00421-015-3172-2](https://doi.org/10.1007/s00421-015-3172-2) | European journal of applied physiology | abstract_only | no |
| 142 | 2015 | Strategic creatine supplementation and resistance training in healthy older adul | [10.1139/apnm-2014-0498](https://doi.org/10.1139/apnm-2014-0498) | Applied physiology, nutrition, and metab | abstract_only | no |
| 143 | 2015 | Creatine supplementation alters homocysteine level in resistance trained men. | [PMID 25853877](https://pubmed.ncbi.nlm.nih.gov/25853877/) | The Journal of sports medicine and physi | abstract_only | no |
| 144 | 2015 | Effects of Creatine and Sodium Bicarbonate Coingestion on Multiple Indices of Me | [10.1123/ijsnem.2014-0146](https://doi.org/10.1123/ijsnem.2014-0146) | International journal of sport nutrition | abstract_only | no |
| 145 | 2014 | The effects of polyethylene glycosylated creatine supplementation on anaerobic p | [10.1519/jsc.0b013e3182a361a5](https://doi.org/10.1519/jsc.0b013e3182a361a5) | Journal of strength and conditioning res | abstract_only | no |
| 146 | 2014 | Creatine supplementation prevents acute strength loss induced by concurrent exer | [10.1007/s00421-014-2903-0](https://doi.org/10.1007/s00421-014-2903-0) | European journal of applied physiology | abstract_only | no |
| 147 | 2014 | Creatine supplementation and resistance training in vulnerable older women: a ra | [10.1016/j.exger.2014.02.003](https://doi.org/10.1016/j.exger.2014.02.003) | Experimental gerontology | abstract_only | no |
| 148 | 2014 | Efficacy and safety of creatine supplementation in childhood-onset systemic lupu | [10.1177/0961203314546017](https://doi.org/10.1177/0961203314546017) | Lupus | abstract_only | no |
| 149 | 2014 | Short-term creatine supplementation does not reduce increased homocysteine conce | [10.1007/s00394-013-0636-1](https://doi.org/10.1007/s00394-013-0636-1) | European journal of nutrition | abstract_only | no |
| 150 | 2013 | Long-term creatine supplementation improves muscular performance during resistan | [10.1007/s00421-012-2514-6](https://doi.org/10.1007/s00421-012-2514-6) | European journal of applied physiology | abstract_only | no |
| 151 | 2013 | The effect of creatine supplementation on muscle fatigue and physiological indic | [PMID 23715246](https://pubmed.ncbi.nlm.nih.gov/23715246/) | The Journal of sports medicine and physi | abstract_only | no |
| 152 | 2013 | Effects of creatine supplementation on oxidative stress and inflammatory markers | [10.1016/j.nut.2013.03.003](https://doi.org/10.1016/j.nut.2013.03.003) | Nutrition (Burbank, Los Angeles County,  | abstract_only | no |
| 153 | 2012 | Creatine but not betaine supplementation increases muscle phosphorylcreatine con | [10.1007/s00726-011-0972-5](https://doi.org/10.1007/s00726-011-0972-5) | Amino acids | abstract_only | no |
| 154 | 2011 | Creatine supplementation decreases oxidative DNA damage and lipid peroxidation i | [10.1519/jsc.0b013e3182162f2b](https://doi.org/10.1519/jsc.0b013e3182162f2b) | Journal of strength and conditioning res | abstract_only | no |
| 155 | 2011 | Ergolytic/ergogenic effects of creatine on aerobic power. | [10.1055/s-0031-1283179](https://doi.org/10.1055/s-0031-1283179) | International journal of sports medicine | abstract_only | no |
| 156 | 2011 | Low-dose creatine supplementation enhances fatigue resistance in the absence of  | [10.1016/j.nut.2010.04.001](https://doi.org/10.1016/j.nut.2010.04.001) | Nutrition (Burbank, Los Angeles County,  | abstract_only | no |
| 157 | 2010 | Effect of creatine supplementation as a potential adjuvant therapy to exercise t | [10.1177/0269215510367995](https://doi.org/10.1177/0269215510367995) | Clinical rehabilitation | abstract_only | no |
| 158 | 2009 | Effect of creatine supplementation during cast-induced immobilization on the pre | [10.1519/jsc.0b013e31818efbcc](https://doi.org/10.1519/jsc.0b013e31818efbcc) | Journal of strength and conditioning res | abstract_only | no |
| 159 | 2009 | Creatine supplementation improves the anaerobic performance of elite junior fin  | [10.1556/aphysiol.96.2009.3.6](https://doi.org/10.1556/aphysiol.96.2009.3.6) | Acta physiologica Hungarica | abstract_only | no |
| 160 | 2009 | Effects of creatine monohydrate and polyethylene glycosylated creatine supplemen | [10.1519/jsc.0b013e3181a2ed11](https://doi.org/10.1519/jsc.0b013e3181a2ed11) | Journal of strength and conditioning res | abstract_only | no |
| 161 | 2008 | Creatine supplementation reduces plasma levels of pro-inflammatory cytokines and | [10.1007/s00726-007-0582-4](https://doi.org/10.1007/s00726-007-0582-4) | Amino acids | abstract_only | no |
| 162 | 2007 | Effect of in-season creatine supplementation on body composition and performance | [10.1139/h07-072](https://doi.org/10.1139/h07-072) | Applied physiology, nutrition, and metab | abstract_only | no |
| 163 | 2007 | Effect of creatine on swimming velocity, body composition and hydrodynamic varia | [PMID 17369799](https://pubmed.ncbi.nlm.nih.gov/17369799/) | The Journal of sports medicine and physi | abstract_only | no |
| 164 | 2007 | Effects of creatine supplementation and three days of resistance training on mus | [10.1519/r-20005.1](https://doi.org/10.1519/r-20005.1) | Journal of strength and conditioning res | abstract_only | no |
| 165 | 2006 | Does creatine supplementation improve functional capacity in elderly women? | [10.1519/r-17044.1](https://doi.org/10.1519/r-17044.1) | Journal of strength and conditioning res | abstract_only | no |
| 166 | 2006 | Creatine supplementation and multiple sprint running performance. | [10.1519/r-17184.1](https://doi.org/10.1519/r-17184.1) | Journal of strength and conditioning res | abstract_only | no |
| 167 | 2005 | The effects of creatine supplementation on performance during the repeated bouts | [PMID 16446682](https://pubmed.ncbi.nlm.nih.gov/16446682/) | The Journal of sports medicine and physi | abstract_only | no |
| 168 | 2005 | Effect of low-dose, short-duration creatine supplementation on anaerobic exercis | [10.1519/15484.1](https://doi.org/10.1519/15484.1) | Journal of strength and conditioning res | abstract_only | no |
| 169 | 2004 | Creatine supplementation in young soccer players. | [10.1123/ijsnem.14.1.95](https://doi.org/10.1123/ijsnem.14.1.95) | International journal of sport nutrition | abstract_only | no |
| 170 | 2003 | Effect of creatine supplementation on aerobic performance and anaerobic capacity | [10.1123/ijsnem.13.2.173](https://doi.org/10.1123/ijsnem.13.2.173) | International journal of sport nutrition | abstract_only | no |
| 171 | 2002 | Caffeine is ergogenic after supplementation of oral creatine monohydrate. | [10.1097/00005768-200211000-00015](https://doi.org/10.1097/00005768-200211000-00015) | Medicine and science in sports and exerc | abstract_only | no |
| 172 | 2001 | Effects of oral creatine supplementation on high intensity, intermittent exercis | [10.1055/s-2001-18520](https://doi.org/10.1055/s-2001-18520) | International journal of sports medicine | abstract_only | no |
| 173 | 2001 | Creatine loading does not impact on stroke performance in tennis. | [10.1055/s-2001-11334](https://doi.org/10.1055/s-2001-11334) | International journal of sports medicine | abstract_only | no |
| 174 | 2001 | Effect of creatine supplementation on metabolism and performance in humans durin | [10.1007/s004210170011](https://doi.org/10.1007/s004210170011) | European journal of applied physiology | abstract_only | no |
| 175 | 1999 | Oral creatine supplementation improves multiple sprint performance in elite ice- | [PMID 10573659](https://pubmed.ncbi.nlm.nih.gov/10573659/) | The Journal of sports medicine and physi | abstract_only | no |
| 176 | 1998 | Effects of creatine monohydrate ingestion in sedentary and weight-trained older  | [10.1046/j.1365-201x.1998.00427.x](https://doi.org/10.1046/j.1365-201x.1998.00427.x) | Acta physiologica Scandinavica | abstract_only | no |
| 177 | 1995 | Effect of oral creatine supplementation on power output and fatigue during bicyc | [10.1152/jappl.1995.78.2.670](https://doi.org/10.1152/jappl.1995.78.2.670) | Journal of applied physiology (Bethesda, | abstract_only | no |

## ECU scores — this run only

| Outcome | 0–100 | Verdict | effect | in your form | at your dose | evidence | n |
|---|---:|---|---|---|---|---|---:|
| muscle_power | 45 | unclear | +0.08 @ 100% | 0.80 (pooled +0.19 @ 54%) | not tested | 97% | 34 |
| muscle_strength | 42 | probably does not work | +0.02 @ 100% | 0.80 (pooled -0.03 @ 46%) | not tested | 93% | 26 |
| lean_body_mass | 35 | probably does not work | +0.08 @ 100% | 0.80 (pooled -0.06 @ 48%) | not tested | 75% | 14 |
| exercise_endurance | 31 | probably does not work | -0.11 @ 100% | 0.80 (pooled -0.07 @ 71%) | not tested | 72% | 12 |
| energy_levels | 17 | works, but not tested for your product | +0.38 @ 100% | 0.80 (pooled +0.30 @ 72%) | not tested | 33% | 2 |

_0–100 = 100 × c × mean(effect, form, dose). Each arc shows its verdict and the share of evidence behind it. A low number with a FULL evidence arc means 'does not work'; with an EMPTY one it means 'barely studied'._


_Old rows from previous runs are not shown here._

## Which studies made each number

### muscle_power — signed +7

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:103390nu15163567` | +5.17 | 0.3089 | 1.0 | 4 | exact |
| `doi:101186s1297001701622` | +2.72 | 0.1626 | 1.0 | 4 | unspecified |
| `doi:101038s4159802644278x` | +2.68 | 0.5334 | 0.3 | 4 | exact |
| `doi:101186s12970021004077` | +2.68 | 0.1602 | 1.0 | 4 | unspecified |
| `doi:101556aphysiol96200936` | +2.66 | 0.1589 | 1.0 | 4 | exact |
| `doi:103390nu16152437` | -2.54 | 0.4341 | -0.35 | 4 | unspecified |
| `doi:103390nu16091324` | -2.03 | 0.3473 | -0.35 | 4 | exact |
| `pmid:10573659` | +1.88 | 0.1589 | 0.7083333333333333 | 4 | exact |
| `registry:nct04048616` | -1.55 | 0.264 | -0.35 | 4 | unspecified |
| `doi:101519jsc0b013e3182a361a5` | -1.46 | 0.249 | -0.35 | 4 | unspecified |
| `doi:101123ijsnem20140146` | +1.40 | 0.126 | 0.6666666666666665 | 4 | exact |
| `doi:101519r171841` | -1.25 | 0.2143 | -0.35 | 4 | exact |
| `doi:101123ijsnem14195` | +1.20 | 0.0716 | 1.0 | 4 | exact |
| `pmid:16446682` | +1.17 | 0.0749 | 0.9333333333333332 | 4 | exact |
| `doi:101519r200051` | -1.08 | 0.1845 | -0.35 | 4 | exact |
| **sum of all 34** | **+7.36** | | | | |

### muscle_strength — signed +1

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:101139apnm20140498` | +4.69 | 0.21 | 1.0 | 4 | unspecified |
| `doi:101007s0042101225146` | +3.70 | 0.1657 | 1.0 | 4 | unspecified |
| `doi:101519r200051` | +3.43 | 0.1845 | 0.8333333333333334 | 4 | exact |
| `doi:101249mss0000000000003202` | -2.56 | 0.6 | -0.19148936170212766 | 4 | exact |
| `doi:101519jsc0b013e3182a361a5` | -1.94 | 0.249 | -0.35 | 4 | unspecified |
| `doi:103390nu9121359` | -1.35 | 0.1723 | -0.35 | 4 | different |
| `doi:101519jsc0000000000001223` | -1.35 | 0.1732 | -0.35 | 4 | exact |
| `doi:101016jnut201004001` | -1.34 | 0.1717 | -0.35 | 4 | unspecified |
| `doi:101136bjsm2005022558` | -1.22 | 0.1556 | -0.35 | 4 | unspecified |
| `doi:103390nu10111640` | +1.12 | 0.05 | 1.0 | 4 | unspecified |
| `doi:1033549physiolres935323` | +1.07 | 0.1602 | 0.3 | 4 | different |
| `doi:101519jsc0b013e31818efbcc` | +1.04 | 0.0465 | 1.0 | 4 | unspecified |
| `doi:103390nu16162772` | -0.84 | 0.1074 | -0.35 | 4 | unspecified |
| `doi:101519jsc0b013e3181a2ed11` | -0.76 | 0.097 | -0.35 | 4 | exact |
| `registry:isrctn83081058` | +0.69 | 0.1025 | 0.3 | 4 | exact |
| **sum of all 26** | **+1.49** | | | | |

### lean_body_mass — signed +6

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:101139apnm20140498` | +7.28 | 0.21 | 1.0 | 4 | unspecified |
| `registry:nct04048616` | -3.20 | 0.264 | -0.35 | 4 | unspecified |
| `doi:1033549physiolres935323` | +1.67 | 0.1602 | 0.3 | 4 | different |
| `doi:101007s0042101225146` | +1.15 | 0.1657 | 0.20000000000000004 | 4 | unspecified |
| `registry:isrctn83081058` | +1.07 | 0.1025 | 0.3 | 4 | exact |
| `doi:1010801939021120252518408` | -0.97 | 0.0796 | -0.35 | 4 | exact |
| `doi:1010801939021120211904085` | -0.97 | 0.0796 | -0.35 | 4 | exact |
| `doi:101016jexger201608005` | +0.85 | 0.082 | 0.3 | 4 | unspecified |
| `doi:101139h07072` | -0.84 | 0.069 | -0.35 | 4 | exact |
| `doi:101519jsc0b013e31818efbcc` | +0.70 | 0.0465 | 0.4333333333333333 | 4 | unspecified |
| `doi:103390nu10111640` | -0.61 | 0.05 | -0.35 | 4 | unspecified |
| `registry:nct01472393` | -0.28 | 0.0978 | -0.08333333333333333 | 4 | unspecified |
| `doi:101123ijsnem20160129` | -0.23 | 0.0677 | -0.10000000000000002 | 4 | exact |
| `doi:101249mss0000000000003202` | +0.00 | 0.6 | 0.0 | 4 | exact |
| **sum of all 14** | **+5.62** | | | | |

### exercise_endurance — signed -7

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:103390nu17243831` | +9.65 | 0.2751 | 1.0 | 4 | exact |
| `doi:103390nu12010193` | -8.88 | 0.7236 | -0.35 | 4 | exact |
| `doi:103390nu9121359` | -2.12 | 0.1723 | -0.35 | 4 | different |
| `doi:101113ep087886` | +2.01 | 0.0573 | 1.0 | 4 | unspecified |
| `doi:101111sms14629` | -1.91 | 0.1553 | -0.35 | 4 | exact |
| `doi:101055s00311283179` | -1.18 | 0.0957 | -0.35 | 4 | different |
| `doi:103390nu14061140` | -1.11 | 0.0903 | -0.35 | 4 | unspecified |
| `doi:101123ijsnem14195` | -0.88 | 0.0716 | -0.35 | 4 | exact |
| `doi:101249mss0000000000001401` | -0.85 | 0.069 | -0.35 | 4 | unspecified |
| `doi:101139h07072` | -0.85 | 0.069 | -0.35 | 4 | exact |
| `doi:101519r170441` | -0.81 | 0.0662 | -0.35 | 4 | unspecified |
| `doi:101123ijsnem20160129` | -0.24 | 0.0677 | -0.10000000000000002 | 4 | exact |
| **sum of all 12** | **-7.17** | | | | |

### energy_levels — signed +12

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:103390nu17111772` | +7.10 | 0.4326 | 0.3 | 4 | exact |
| `doi:103390nu18081192` | +5.25 | 0.1645 | 0.5833333333333334 | 4 | unspecified |
| **sum of all 2** | **+12.35** | | | | |

_`points` sum to the signed score. NEGATIVE points mean that study pushed the score down. `w` is quality (design × RoB × size × funding × OA); `s` is what it found (+1.0 meaningful benefit, +0.3 trivial/unsized, −0.7 null, −1.0 harm). The two are separate on purpose: how good a study is and what it found are different facts._

## Database snapshot (`creatine`)

### `pilot_creatine_supp.sqlite`

Studies stored (corpus): **455** · ECUs: **0** · syntheses: **69

## Notes

- Claude and Grok scores are **never merged**.

- Form does **not** penalize the center score; it is the form arc only.

- Predatory venues: flagged + counted; weight zero is OFF for now.

- Inconclusive + low n is often the confidence ceiling (SPEC 13), not a bug.

- This report is **this run only** — other ingredients are not mixed in.
