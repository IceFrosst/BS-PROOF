# BS-PROOF full audit report (claude-top5-per_o)

Generated: **2026-08-10 09:56 UTC**


scoring_model: v2-four-arc

Ingredient: `creatine` · Form: `creatine_monohydrate` · Mode: **claude-top5-per_o**

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
  predatory list: 1162 journal titles loaded
  PASS  known predatory publisher is flagged  
  PASS  publisher containment tolerates a legal suffix  imprints appear as 'X Ltd' / 'X BV' in Crossref
  PASS  legitimate publisher stays clean: Elsevier BV  
  PASS  legitimate publisher stays clean: Springer Nature  
  PASS  legitimate publisher stays clean: MDPI AG  
  PASS  legitimate publisher stays clean: Wolters Kluwer Health  
  PASS  real journal not flagged: American Journal of Obstetrics and Gynecolog  list entry 'american journal'
  PASS  real journal not flagged: Acta oto-laryngologica  list entry 'lar'
  PASS  real journal not flagged: The Journal of Clinical Investigation  list entry 'e journal'
  PASS  MIN_PUBLISHER_CHARS=6 excludes every sub-6 acronym  'LAR' is why the floor exists
  PASS  flag counts the studies, not the venues  1
  PASS  publisher coverage is reported beside the verdict  0 flagged @ 0 resolved != 0 flagged @ 240 resolved
  PASS  a publisher hit is never reported as a journal  naming an imprint as a journal is the libel-shaped error
  PASS  'not checked' is distinguishable from 'clean' in the summary  the truncated-list bug read as a clean corpus for four commits
  PASS  real journal in a publisher field is not flagged: The Journal of Rheumatology  matched list entry 'e-journal' before anchoring — the libel-shaped error
  PASS  generic list fragment does not flag an unrelated imprint  matched 'Science Publishers'; would hit any publisher with that phrase
  PASS  a genuine list entry still flags with a corporate suffix  anchoring must not cost true positives
  PASS  name drift is under-flagged, not force-matched  measured live 2026-08-09 on doi 10.4172/2157-7633.1000345
  PASS  a resolved-publisher run with no hits reads as a real answer  0 flagged @ 2 resolved is data, not a gap

STRUCTURAL INVARIANTS
  PASS  the real deterministic layer reaches no model boundary  
  PASS  no allowlist entry is stale or reasonless  
  PASS  every AGENTS entry has a schema, a prompt and a known tier  
  PASS  no formatting trick hides a model import  8 evasions all caught
  PASS  innocent source does not trip the check  false positives: []
  PASS  a reasonless allowlist entry is itself a failure  an unexplained exception is an undocumented hole in invariant 1
  PASS  the deterministic layer imports on a bare interpreter  
  PASS  a module-level third-party import is caught  
  PASS  the same import inside a function is fine  lazy is the fix, so it must not be reported as the problem
  PASS  stdlib and local imports are not third-party  

ANCHOR BAND FEASIBILITY
  PASS  ceiling_score reproduces score_ecu's own arithmetic  checked at 0/5/10/25/50% null mass
  PASS  H rises with disagreement rather than being a free parameter  a unanimous corpus has no spread; varying H independently of the null share overstates every reachable score
  PASS  the five confidence-A anchor floors still imply their measured null tolerances  6.4-11.1% null mass; see docs/REVIEW_PENDING.md
  PASS  no anchor floor is unreachable at zero nulls  a floor above +100 would be a typo, not a calibration question

ALL PASSED
```

## This run — extraction stats

- Targeted studies: **150**
- Succeeded (usable): **143**
- Skipped (no text): **7**
- Partial agent failures: **0**
- Prompt version: `v1.11`
- Concurrency: 40  |  studies in flight: 40

## Token + cost accounting

- Extraction backend: **Claude subscription** (`--safe-mode`, `--max-turns 1`, one shot per call)
- Model calls: **12** (cache hits 838, failures 4)
- Input tokens: **62,024** (fresh 24 · cache-write 0 · cache-read 62,000)
- Output tokens: **5,491**
- **Spent on this run: $0.00** — subscription, not metered.
- **API-equivalent cost: $0.135** — what the same work would cost billed per token.
- Per study: **0.1 calls**, **$0.0009** API-equivalent across 143 scored studies.

| Agent | Tier | Model | Calls | Cache hits | Fail | In | Out | API-equiv |
|---|---|---|--:|--:|--:|--:|--:|--:|
| S3 | B | `claude-sonnet-5` | 0 | 143 | 0 | 0 | 0 | $0.000 |
| S4 | B | `claude-sonnet-5` | 9 | 138 | 4 | 41,424 | 3,665 | $0.088 |
| S5 | B | `claude-sonnet-5` | 0 | 143 | 0 | 0 | 0 | $0.000 |
| S6B | C | `claude-sonnet-5` | 0 | 131 | 0 | 0 | 0 | $0.000 |
| S7 | B | `claude-sonnet-5` | 3 | 140 | 0 | 20,600 | 1,826 | $0.047 |
| S8 | A | `claude-haiku-4-5-20251001` | 0 | 143 | 0 | 0 | 0 | $0.000 |

Tier → model is pinned in `claude_adapter.TIER_MODEL` (full ids, never aliases: an alias floats to a new model while the cache key does not change). Tier A = classification, B = extraction, C = the highest-risk agent.

## Predatory journal check (flag only — not in score)

- List entries loaded: **1162**
- Studies checked: **1899**
- Publisher resolved for: **318/1899** (the list is PUBLISHERS, so this is the real coverage)
- Studies flagged predatory: **2**
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
| S3 | 143 | 0 | 143 | 0 | — |
| S4 | 143 | 0 | 138 | 0 | — |
| S5 | 143 | 0 | 143 | 0 | — |
| S7 | 143 | 0 | 140 | 0 | — |
| S8 | 143 | 0 | 143 | 0 | — |

_One row per STUDY. The cost table above counts CLI ATTEMPTS, so its totals are higher by exactly the retries column._

**Telemetry does not reconcile — do not quote these rates:**
- S6B: 0 attempts in the cost table but no row in the success table -- its failures are invisible to anyone reading success rates
- S3: 0 attempts for 143 studies -- impossible, every study needs at least one attempt
- S4: 9 attempts for 143 studies -- impossible, every study needs at least one attempt
- S5: 0 attempts for 143 studies -- impossible, every study needs at least one attempt
- S7: 3 attempts for 143 studies -- impossible, every study needs at least one attempt
- S8: 0 attempts for 143 studies -- impossible, every study needs at least one attempt

## SPEED REPORT
_Not available._

## Studies extracted this run (150)

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
| 17 | 2025 | The Effect of Vitamin D3 on Serum Creatine Phosphokinase Level in Patients with  | [10.30476/ijms.2024.99691.3182](https://doi.org/10.30476/ijms.2024.99691.3182) | Iranian journal of medical sciences | full_text | no |
| 18 | 2025 | Metabolic Signature of Arsenic Exposure and Metabolism: The Folic Acid and Creat | [10.1021/acs.est.5c01597](https://doi.org/10.1021/acs.est.5c01597) | Environmental science & technology | full_text | no |
| 19 | 2024 | Influence of CReatine Supplementation on mUScle Mass and Strength After Stroke ( | [10.3390/nu16234148](https://doi.org/10.3390/nu16234148) | Nutrients | full_text | no |
| 20 | 2024 | Supplementing With Which Form of Creatine (Hydrochloride or Monohydrate) Alongsi | [10.33549/physiolres.935323](https://doi.org/10.33549/physiolres.935323) | Physiological research | full_text | no |
| 21 | 2024 | Effect of Creatine Monohydrate Supplementation on Macro- and Microvascular Endot | [10.3390/nu17010058](https://doi.org/10.3390/nu17010058) | Nutrients | full_text | no |
| 22 | 2024 | Combined Impact of Creatine, Caffeine, and Variable Resistance on Repeated Sprin | [10.3390/nu16152437](https://doi.org/10.3390/nu16152437) | Nutrients | full_text | no |
| 23 | 2024 | Creatine Improves Total Sleep Duration Following Resistance Training Days versus | [10.3390/nu16162772](https://doi.org/10.3390/nu16162772) | Nutrients | full_text | no |
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
| 44 | 2021 | Effects of Low Doses of L-Carnitine Tartrate and Lipid Multi-Particulate Formula | [10.3390/nu13113985](https://doi.org/10.3390/nu13113985) | Nutrients | full_text | no |
| 45 | 2021 | The effects of phosphocreatine disodium salts plus blueberry extract supplementa | [10.1186/s12970-021-00456-y](https://doi.org/10.1186/s12970-021-00456-y) | Journal of the International Society of  | full_text | no |
| 46 | 2021 | Morning versus Evening Intake of Creatine in Elite Female Handball Players. | [10.3390/ijerph19010393](https://doi.org/10.3390/ijerph19010393) | International journal of environmental r | full_text | no |
| 47 | 2021 | Short-Term Creatine Loading Improves Total Work and Repetitions to Failure but N | [10.3390/nu13030826](https://doi.org/10.3390/nu13030826) | Nutrients | full_text | no |
| 48 | 2021 | Short-term co-ingestion of creatine and sodium bicarbonate improves anaerobic pe | [10.1186/s12970-021-00407-7](https://doi.org/10.1186/s12970-021-00407-7) | Journal of the International Society of  | full_text | no |
| 49 | 2021 | Creatine Enhances the Effects of Cluster-Set Resistance Training on Lower-Limb B | [10.3390/nu13072303](https://doi.org/10.3390/nu13072303) | Nutrients | full_text | no |
| 50 | 2021 | Effect of Creatine Supplementation on Functional Capacity and Muscle Oxygen Satu | [10.3390/nu13010149](https://doi.org/10.3390/nu13010149) | Nutrients | full_text | no |
| 51 | 2021 | Effects of Combined Creatine and Sodium Bicarbonate Supplementation on Soccer-Sp | [10.3390/ijerph18136919](https://doi.org/10.3390/ijerph18136919) | International journal of environmental r | full_text | no |
| 52 | 2021 | Characterization of Creatine Kinase Levels in Tofacitinib-Treated Patients with  | [10.1007/s10620-020-06560-4](https://doi.org/10.1007/s10620-020-06560-4) | Digestive diseases and sciences | full_text | no |
| 53 | 2020 | Effects of Creatine Supplementation during Resistance Training Sessions in Physi | [10.3390/nu12061880](https://doi.org/10.3390/nu12061880) | Nutrients | full_text | no |
| 54 | 2020 | The Effects of Long-Term Magnesium Creatine Chelate Supplementation on Repeated  | [10.3390/nu12102961](https://doi.org/10.3390/nu12102961) | Nutrients | full_text | no |
| 55 | 2020 | Effect of Ten Weeks of Creatine Monohydrate Plus HMB Supplementation on Athletic | [10.3390/nu12010193](https://doi.org/10.3390/nu12010193) | Nutrients | full_text | no |
| 56 | 2020 | The addition of β-Hydroxy β-Methylbutyrate (HMB) to creatine monohydrate supplem | [10.1186/s12970-020-00359-4](https://doi.org/10.1186/s12970-020-00359-4) | Journal of the International Society of  | full_text | no |
| 57 | 2019 | Examining the effects of creatine supplementation in augmenting adaptations to r | [10.1136/bmjopen-2019-030080](https://doi.org/10.1136/bmjopen-2019-030080) | BMJ open | full_text | no |
| 58 | 2019 | Effect of Creatine Supplementation Dosing Strategies on Aging Muscle Performance | [10.1007/s12603-018-1148-8](https://doi.org/10.1007/s12603-018-1148-8) | The journal of nutrition, health & aging | full_text | no |
| 59 | 2019 | Creatine electrolyte supplement improves anaerobic power and strength: a randomi | [10.1186/s12970-019-0291-x](https://doi.org/10.1186/s12970-019-0291-x) | Journal of the International Society of  | full_text | no |
| 60 | 2018 | Effects of 4-Week Creatine Supplementation Combined with Complex Training on Mus | [10.3390/nu10111640](https://doi.org/10.3390/nu10111640) | Nutrients | full_text | no |
| 61 | 2018 | Creatine-electrolyte supplementation improves repeated sprint cycling performanc | [10.1186/s12970-018-0226-y](https://doi.org/10.1186/s12970-018-0226-y) | Journal of the International Society of  | full_text | no |
| 62 | 2018 | A randomized, double-blind, placebo-controlled, proof-of-concept trial of creati | [10.1007/s00702-017-1817-5](https://doi.org/10.1007/s00702-017-1817-5) | Journal of neural transmission (Vienna,  | full_text | no |
| 63 | 2018 | Creatine or vitamin D supplementation in individuals with a spinal cord injury u | [10.1080/10790268.2017.1372058](https://doi.org/10.1080/10790268.2017.1372058) | The journal of spinal cord medicine | full_text | no |
| 64 | 2018 | Creatine Supplementation Supports the Rehabilitation of Adolescent Fin Swimmers  | [PMID 29769829](https://pubmed.ncbi.nlm.nih.gov/29769829/) | Journal of sports science & medicine | full_text | no |
| 65 | 2017 | Effects of Creatine Supplementation on Muscle Strength and Optimal Individual Po | [10.3390/nu9111169](https://doi.org/10.3390/nu9111169) | Nutrients | full_text | no |
| 66 | 2017 | Effect of low dose, short-term creatine supplementation on muscle power output i | [10.1186/s12970-017-0162-2](https://doi.org/10.1186/s12970-017-0162-2) | Journal of the International Society of  | full_text | no |
| 67 | 2017 | The acute effect of beta-guanidinopropionic acid versus creatine or placebo in h | [10.1111/bcp.13390](https://doi.org/10.1111/bcp.13390) | British journal of clinical pharmacology | full_text | no |
| 68 | 2017 | Hematological and Hemodynamic Responses to Acute and Short-Term Creatine Nitrate | [10.3390/nu9121359](https://doi.org/10.3390/nu9121359) | Nutrients | full_text | no |
| 69 | 2017 | The CREST-E study of creatine for Huntington disease: A randomized controlled tr | [10.1212/wnl.0000000000004209](https://doi.org/10.1212/wnl.0000000000004209) | Neurology | full_text | no |
| 70 | 2017 | A double-blind, placebo-controlled randomized trial of creatine for the cancer a | [10.1093/annonc/mdx232](https://doi.org/10.1093/annonc/mdx232) | Annals of oncology : official journal of | full_text | no |
| 71 | 2016 | The Effects of Creatine Supplementation on Explosive Performance and Optimal Ind | [10.3390/nu8030143](https://doi.org/10.3390/nu8030143) | Nutrients | full_text | no |
| 72 | 2016 | Effects of Coffee and Caffeine Anhydrous Intake During Creatine Loading. | [10.1519/jsc.0000000000001223](https://doi.org/10.1519/jsc.0000000000001223) | Journal of strength and conditioning res | full_text | no |
| 73 | 2015 | Creatine supplementation enhances corticomotor excitability and cognitive perfor | [10.1523/jneurosci.3113-14.2015](https://doi.org/10.1523/jneurosci.3113-14.2015) | The Journal of neuroscience : the offici | full_text | no |
| 74 | 2015 | The acute effect of beta-guanidinopropionic acid versus creatine or placebo in h | [10.1186/s13063-015-0581-9](https://doi.org/10.1186/s13063-015-0581-9) | Trials | full_text | no |
| 75 | 2015 | Sex Differences in Clinical Features of Early, Treated Parkinson's Disease. | [10.1371/journal.pone.0133002](https://doi.org/10.1371/journal.pone.0133002) | PloS one | full_text | no |
| 76 | 2014 | PRECREST: a phase II prevention and biomarker trial of creatine in at-risk Hunti | [10.1212/wnl.0000000000000187](https://doi.org/10.1212/wnl.0000000000000187) | Neurology | full_text | no |
| 77 | 2013 | Creatine supplementation associated or not with strength training upon emotional | [10.1371/journal.pone.0076301](https://doi.org/10.1371/journal.pone.0076301) | PloS one | full_text | no |
| 78 | 2013 | Creatine metabolism and safety profiles after six-week oral guanidinoacetic acid | [10.7150/ijms.5125](https://doi.org/10.7150/ijms.5125) | International journal of medical science | full_text | no |
| 79 | 2013 | Increases in creatine kinase with atorvastatin treatment are not associated with | [10.1016/j.atherosclerosis.2013.07.001](https://doi.org/10.1016/j.atherosclerosis.2013.07.001) | Atherosclerosis | full_text | no |
| 80 | 2012 | A randomized, double-blind placebo-controlled trial of oral creatine monohydrate | [10.1176/appi.ajp.2012.12010009](https://doi.org/10.1176/appi.ajp.2012.12010009) | The American journal of psychiatry | full_text | no |
| 81 | 2011 | N-acetylcysteine supplementation controls total antioxidant capacity, creatine k | [10.1155/2011/329643](https://doi.org/10.1155/2011/329643) | Oxidative medicine and cellular longevit | full_text | no |
| 82 | 2010 | The effects of supplementation with creatine and protein on muscle strength foll | [10.1007/s12603-009-0124-8](https://doi.org/10.1007/s12603-009-0124-8) | The journal of nutrition, health & aging | full_text | no |
| 83 | 2009 | Creatine fails to augment the benefits from resistance training in patients with | [10.1371/journal.pone.0004605](https://doi.org/10.1371/journal.pone.0004605) | PloS one | full_text | no |
| 84 | 2008 | The effects of creatine and whey protein supplementation on body composition in  | [10.1007/bf02982622](https://doi.org/10.1007/bf02982622) | The journal of nutrition, health & aging | full_text | no |
| 85 | 2008 | A pilot clinical trial of creatine and minocycline in early Parkinson disease: 1 | [10.1097/wnf.0b013e3181342f32](https://doi.org/10.1097/wnf.0b013e3181342f32) | Clinical neuropharmacology | full_text | no |
| 86 | 2006 | Creatine supplementation and physical training in patients with COPD: a double b | [10.2147/copd.2006.1.4.445](https://doi.org/10.2147/copd.2006.1.4.445) | International journal of chronic obstruc | full_text | no |
| 87 | 2006 | The effects of creatine supplementation on selected factors of tennis specific t | [10.1136/bjsm.2005.022558](https://doi.org/10.1136/bjsm.2005.022558) | British journal of sports medicine | full_text | no |
| 88 | 2005 | American ginseng supplementation attenuates creatine kinase level induced by sub | [10.3748/wjg.v11.i34.5327](https://doi.org/10.3748/wjg.v11.i34.5327) | World journal of gastroenterology | full_text | YES |
| 89 | 2000 | Dietary creatine supplementation does not affect some haematological indices, or | [10.1136/bjsm.34.4.284](https://doi.org/10.1136/bjsm.34.4.284) | British journal of sports medicine | full_text | no |
| 90 | 1996 | Effect of creatine on aerobic and anaerobic metabolism in skeletal muscle in swi | [10.1136/bjsm.30.3.222](https://doi.org/10.1136/bjsm.30.3.222) | British journal of sports medicine | full_text | no |
| 91 | 1994 | The impact of a repeated bout of eccentric exercise on muscular strength, muscle | [10.1136/bjsm.28.4.267](https://doi.org/10.1136/bjsm.28.4.267) | British journal of sports medicine | full_text | no |
| 92 | 1990 | Selective beta-adrenoceptor partial agonist effects of pindolol and xamoterol on | [10.1111/j.1365-2125.1990.tb03834.x](https://doi.org/10.1111/j.1365-2125.1990.tb03834.x) | British journal of clinical pharmacology | full_text | no |
| 93 | 2026 | Examining the feasibility and preliminary effects of resistance exercise trainin | [10.1371/journal.pone.0353630](https://doi.org/10.1371/journal.pone.0353630) | PloS one | abstract_only | no |
| 94 | 2026 | Effects of high-load, velocity-intentional variable resistance training combined | [10.1016/j.exger.2026.113122](https://doi.org/10.1016/j.exger.2026.113122) | Experimental gerontology | abstract_only | no |
| 95 | 2026 | Feasibility, safety and tolerability of intradialytic creatine supplementation i | [10.1371/journal.pone.0354883](https://doi.org/10.1371/journal.pone.0354883) | PloS one | abstract_only | no |
| 96 | 2026 | Creatine supplementation modifies fat deposition in arm and leg tissues in indiv | [10.1016/j.nut.2026.113175](https://doi.org/10.1016/j.nut.2026.113175) | Nutrition (Burbank, Los Angeles County,  | abstract_only | no |
| 97 | 2026 | Beetroot juice or creatine: which yields greater short-term benefits for resista | [10.1080/09637486.2026.2625827](https://doi.org/10.1080/09637486.2026.2625827) | International journal of food sciences a | abstract_only | no |
| 98 | 2026 | Combined creatine and HMB co-supplementation improves functional strength indepe | [10.1007/s11357-025-01889-y](https://doi.org/10.1007/s11357-025-01889-y) | GeroScience | abstract_only | no |
| 99 | 2026 | The Effects of 8-Week Creatine Hydrochloride and Creatine Ethyl Ester Supplement | [10.1080/27697061.2025.2551184](https://doi.org/10.1080/27697061.2025.2551184) | Journal of the American Nutrition Associ | abstract_only | no |
| 100 | 2026 | Diet-Controlled Whey Protein Supplementation: Mitigating Serum Creatine Kinase L | [10.1080/27697061.2025.2548514](https://doi.org/10.1080/27697061.2025.2548514) | Journal of the American Nutrition Associ | abstract_only | no |
| 101 | 2025 | Effects of a Blend of Trisodium Citrate, Creatine Monohydrate, Leucine, and Blue | [10.1080/19390211.2025.2518408](https://doi.org/10.1080/19390211.2025.2518408) | Journal of dietary supplements | abstract_only | no |
| 102 | 2025 | Effects of Combined Versus Single Supplementation of Creatine, Beta-Alanine, and | [10.1123/ijspp.2024-0310](https://doi.org/10.1123/ijspp.2024-0310) | International journal of sports physiolo | abstract_only | no |
| 103 | 2025 | Creatine with guanidinoacetic acid improves prefrontal brain oxygenation before, | [10.1177/02601060241300236](https://doi.org/10.1177/02601060241300236) | Nutrition and health | abstract_only | no |
| 104 | 2025 | Efficacy and safety profile of oral creatine monohydrate in add-on to cognitive- | [10.1016/j.euroneuro.2024.10.004](https://doi.org/10.1016/j.euroneuro.2024.10.004) | European neuropsychopharmacology : the j | abstract_only | no |
| 105 | 2025 | Creatine supplementation does not add to resistance training effects in prostate | [10.1016/j.jsams.2024.09.002](https://doi.org/10.1016/j.jsams.2024.09.002) | Journal of science and medicine in sport | abstract_only | no |
| 106 | 2024 | Effects of acute creatine supplementation on cardiac and vascular responses in o | [10.1016/j.clnesp.2024.07.008](https://doi.org/10.1016/j.clnesp.2024.07.008) | Clinical nutrition ESPEN | abstract_only | no |
| 107 | 2024 | Short term creatine loading improves strength endurance even without changing ma | [10.1590/0001-3765202420230559](https://doi.org/10.1590/0001-3765202420230559) | Anais da Academia Brasileira de Ciencias | abstract_only | no |
| 108 | 2024 | Eight-Week Creatine-Glucose Supplementation Alleviates Clinical Features of Long | [10.3177/jnsv.70.174](https://doi.org/10.3177/jnsv.70.174) | Journal of nutritional science and vitam | abstract_only | no |
| 109 | 2024 | Creatine supplementation combined with breathing exercises reduces respiratory d | [10.4103/jpgm.jpgm_650_23](https://doi.org/10.4103/jpgm.jpgm_650_23) | Journal of postgraduate medicine | abstract_only | no |
| 110 | 2024 | Clinical Effect Analysis of Different Doses of Creatine Phosphate Sodium Combine | [10.1007/s00246-024-03450-8](https://doi.org/10.1007/s00246-024-03450-8) | Pediatric cardiology | abstract_only | no |
| 111 | 2023 | Creatine supplementation combined with blood flow restriction training enhances  | [10.1139/apnm-2022-0209](https://doi.org/10.1139/apnm-2022-0209) | Applied physiology, nutrition, and metab | abstract_only | no |
| 112 | 2023 | Does creatine supplementation affect recovery speed of impulse above critical to | [10.1080/17461391.2022.2159539](https://doi.org/10.1080/17461391.2022.2159539) | European journal of sport science | abstract_only | no |
| 113 | 2022 | Creatine Monohydrate Supplementation, but not Creatyl-L-Leucine, Increased Muscl | [10.1123/ijsnem.2022-0074](https://doi.org/10.1123/ijsnem.2022-0074) | International journal of sport nutrition | abstract_only | no |
| 114 | 2022 | Effects of Creatine and Caffeine Supplementation During Resistance Training on B | [10.1080/19390211.2021.1904085](https://doi.org/10.1080/19390211.2021.1904085) | Journal of dietary supplements | abstract_only | no |
| 115 | 2021 | Timing of creatine supplementation does not influence gains in unilateral muscle | [10.23736/s0022-4707.20.11668-2](https://doi.org/10.23736/s0022-4707.20.11668-2) | The Journal of sports medicine and physi | abstract_only | no |
| 116 | 2021 | Guanidinoacetate-Creatine Supplementation Improves Functional Performance and Mu | [10.1159/000518499](https://doi.org/10.1159/000518499) | Annals of nutrition & metabolism | abstract_only | no |
| 117 | 2021 | No evidence for brown adipose tissue activation after creatine supplementation i | [10.1038/s42255-020-00332-0](https://doi.org/10.1038/s42255-020-00332-0) | Nature metabolism | abstract_only | no |
| 118 | 2021 | The Effect of Creatine Supplementation on Muscle Function in Childhood Myositis: | [10.3899/jrheum.191375](https://doi.org/10.3899/jrheum.191375) | The Journal of rheumatology | abstract_only | no |
| 119 | 2021 | Guanidinoacetic acid loading for improved location-specific brain creatine. | [10.1016/j.clnu.2020.05.003](https://doi.org/10.1016/j.clnu.2020.05.003) | Clinical nutrition (Edinburgh, Scotland) | abstract_only | no |
| 120 | 2021 | Effect of 12 months of creatine supplementation and whole-body resistance traini | [10.1177/0260106020975247](https://doi.org/10.1177/0260106020975247) | Nutrition and health | abstract_only | no |
| 121 | 2021 | Supplement-based nutritional strategies to tackle frailty: A multifactorial, dou | [10.1016/j.clnu.2021.06.024](https://doi.org/10.1016/j.clnu.2021.06.024) | Clinical nutrition (Edinburgh, Scotland) | abstract_only | no |
| 122 | 2021 | Efficacy of Creatine Supplementation and Resistance Training on Area and Density | [10.1249/mss.0000000000002722](https://doi.org/10.1249/mss.0000000000002722) | Medicine and science in sports and exerc | abstract_only | no |
| 123 | 2020 | Can Creatine Combat the Mental Fatigue-associated Decrease in Visuomotor Skills? | [10.1249/mss.0000000000002122](https://doi.org/10.1249/mss.0000000000002122) | Medicine and science in sports and exerc | abstract_only | no |
| 124 | 2020 | Repeated Application of a Novel Creatine Cream Improves Muscular Peak and Averag | [10.1519/jsc.0000000000003730](https://doi.org/10.1519/jsc.0000000000003730) | Journal of strength and conditioning res | abstract_only | no |
| 125 | 2020 | Creatine Supplementation (3 g/d) and Bone Health in Older Women: A 2-Year, Rando | [10.1093/gerona/glz162](https://doi.org/10.1093/gerona/glz162) | The journals of gerontology. Series A, B | abstract_only | no |
| 126 | 2020 | Creatine supplementation does not promote additional effects on inflammation and | [10.1016/j.clnesp.2020.05.024](https://doi.org/10.1016/j.clnesp.2020.05.024) | Clinical nutrition ESPEN | abstract_only | no |
| 127 | 2020 | Selection design phase II trial of high dosages of tamoxifen and creatine in amy | [10.1080/21678421.2019.1672750](https://doi.org/10.1080/21678421.2019.1672750) | Amyotrophic lateral sclerosis & frontote | abstract_only | no |
| 128 | 2019 | Creatine supplementation improves performance above critical power but does not  | [10.1113/ep087886](https://doi.org/10.1113/ep087886) | Experimental physiology | abstract_only | no |
| 129 | 2019 | Effect of pre-exercise and post-exercise creatine supplementation on bone minera | [10.1016/j.exger.2019.01.025](https://doi.org/10.1016/j.exger.2019.01.025) | Experimental gerontology | abstract_only | no |
| 130 | 2019 | Guanidinoacetic acid with creatine compared with creatine alone for tissue creat | [10.1016/j.nut.2018.04.009](https://doi.org/10.1016/j.nut.2018.04.009) | Nutrition (Burbank, Los Angeles County,  | abstract_only | no |
| 131 | 2019 | Creatine supplementation can improve impact control in high-intensity interval t | [10.1016/j.nut.2018.09.020](https://doi.org/10.1016/j.nut.2018.09.020) | Nutrition (Burbank, Los Angeles County,  | abstract_only | no |
| 132 | 2019 | Effects of high-velocity resistance training and creatine supplementation in unt | [10.1139/apnm-2019-0066](https://doi.org/10.1139/apnm-2019-0066) | Applied physiology, nutrition, and metab | abstract_only | no |
| 133 | 2019 | Creatine monohydrate supplementation during eight weeks of progressive resistanc | [10.23736/s0022-4707.18.08406-2](https://doi.org/10.23736/s0022-4707.18.08406-2) | The Journal of sports medicine and physi | abstract_only | no |
| 134 | 2019 | Resistance Training With Elastic Tubing Improves Muscle Strength, Exercise Capac | [10.4187/respcare.05975](https://doi.org/10.4187/respcare.05975) | Respiratory care | abstract_only | no |
| 135 | 2018 | Effects of Creatine and Carbohydrate Loading on Cycling Time Trial Performance. | [10.1249/mss.0000000000001401](https://doi.org/10.1249/mss.0000000000001401) | Medicine and science in sports and exerc | abstract_only | no |
| 136 | 2018 | Supplementation with Qter<sup>®</sup> and Creatine improves functional performan | [10.1016/j.rmed.2018.08.002](https://doi.org/10.1016/j.rmed.2018.08.002) | Respiratory medicine | abstract_only | no |
| 137 | 2018 | No effect of creatine monohydrate supplementation on inflammatory and cartilage  | [10.1016/j.nutres.2017.12.010](https://doi.org/10.1016/j.nutres.2017.12.010) | Nutrition research (New York, N.Y.) | abstract_only | no |
| 138 | 2017 | Lean body mass and creatine kinase are associated with reduced inflammation in o | [10.1111/eci.12802](https://doi.org/10.1111/eci.12802) | European journal of clinical investigati | abstract_only | no |
| 139 | 2017 | Creatine supplementation elicits greater muscle hypertrophy in upper than lower  | [10.1177/0260106017737013](https://doi.org/10.1177/0260106017737013) | Nutrition and health | abstract_only | no |
| 140 | 2017 | Creatine Monohydrate Supplementation Does Not Augment Fitness, Performance, or B | [10.1123/ijsnem.2016-0129](https://doi.org/10.1123/ijsnem.2016-0129) | International journal of sport nutrition | abstract_only | no |
| 141 | 2016 | Effect of Preexercise Creatine Ingestion on Muscle Performance in Healthy Aging  | [10.1519/jsc.0000000000001254](https://doi.org/10.1519/jsc.0000000000001254) | Journal of strength and conditioning res | abstract_only | no |
| 142 | 2016 | Effect of creatine supplementation and drop-set resistance training in untrained | [10.1016/j.exger.2016.08.005](https://doi.org/10.1016/j.exger.2016.08.005) | Experimental gerontology | abstract_only | no |
| 143 | 2016 | Creatine supplementation does not alter neuromuscular recovery after eccentric e | [10.1002/mus.25091](https://doi.org/10.1002/mus.25091) | Muscle & nerve | abstract_only | no |
| 144 | 2016 | Guanidinoacetic acid versus creatine for improved brain and muscle creatine leve | [10.1139/apnm-2016-0178](https://doi.org/10.1139/apnm-2016-0178) | Applied physiology, nutrition, and metab | abstract_only | no |
| 145 | 2016 | Effects of Creatine Monohydrate Augmentation on Brain Metabolic and Network Outc | [10.1016/j.biopsych.2015.11.027](https://doi.org/10.1016/j.biopsych.2015.11.027) | Biological psychiatry | abstract_only | no |
| 146 | 2016 | Effects of plyometric training and creatine supplementation on maximal-intensity | [10.1016/j.jsams.2015.10.005](https://doi.org/10.1016/j.jsams.2015.10.005) | Journal of science and medicine in sport | abstract_only | no |
| 147 | 2016 | A Pilot Study Examining the Effects of 8-Week Whey Protein versus Whey Protein P | [10.1159/000452845](https://doi.org/10.1159/000452845) | Annals of nutrition & metabolism | abstract_only | no |
| 148 | 2016 | Can Creatine Supplementation Improve Body Composition and Objective Physical Fun | [10.1002/acr.22747](https://doi.org/10.1002/acr.22747) | Arthritis care & research | abstract_only | no |
| 149 | 2016 | Efficacy and safety of creatine supplementation in juvenile dermatomyositis: A r | [10.1002/mus.24681](https://doi.org/10.1002/mus.24681) | Muscle & nerve | abstract_only | no |
| 150 | 2015 | The effects of creatine supplementation on thermoregulation and isokinetic muscu | [PMID 25781214](https://pubmed.ncbi.nlm.nih.gov/25781214/) | The Journal of sports medicine and physi | abstract_only | no |

## ECU scores — this run only

| Outcome | 0–100 | Verdict | effect | in your form | at your dose | evidence | n |
|---|---:|---|---|---|---|---|---:|
| muscle_strength | 14 | does not work | -0.21 @ 100% | -0.31 @ 34% | not tested | 52% | 27 |
| muscle_power | 11 | does not work | -0.22 @ 100% | -0.35 @ 51% | not tested | 44% | 18 |
| lean_body_mass | 7 | does not work | +0.09 @ 100% | -0.28 @ 26% | not tested | 22% | 10 |
| exercise_endurance | 3 | does not work | -0.57 @ 100% | -0.70 @ 52% | not tested | 22% | 11 |
| energy_levels | gated | not enough human evidence | not tested | not tested | not tested | not tested | 0 |

_0–100 = 100 × c × mean(effect, form, dose). Each arc shows its verdict and the share of evidence behind it. A low number with a FULL evidence arc means 'does not work'; with an EMPTY one it means 'barely studied'._


_Old rows from previous runs are not shown here._

## Database snapshot (`creatine`)

### `pilot_creatine_supp.sqlite`

Studies stored (corpus): **200** · ECUs: **0** · syntheses: **50

## Notes

- Claude and Grok scores are **never merged**.

- Form does **not** penalize the center score; it is the form arc only.

- Predatory venues: flagged + counted; weight zero is OFF for now.

- Inconclusive + low n is often the confidence ceiling (SPEC 13), not a bug.

- This report is **this run only** — other ingredients are not mixed in.
