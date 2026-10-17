# BS-PROOF full audit report (claude-ft-inter)

Generated: **2026-10-17 22:26 UTC**


scoring_model: evidence-v2

Ingredient: `creatine` · Form: `creatine_monohydrate` · Mode: **claude-ft-inter**

Auto-written with the summary after every extraction.

## How the grade is built

Evidence method v2 (`docs/METHOD.md`). Models extract fields only;
everything below is deterministic.

```text
1. per trial, per outcome: ONE verified effect (numbers checked against their
   quoted span), Hedges' g with its variance       pipeline/effect_size.py
2. per outcome: REML random-effects pool, Hartung-Knapp CI (k >= 3),
   prediction interval, leave-one-out range        pipeline/pool.py
3. GRADE certainty: start High for RCTs, downgrade for risk of bias,
   inconsistency, imprecision, indirectness (form / dose / population)
                                                   pipeline/grade.py
4. letter = benefit size (vs the meaningful-change threshold M) x certainty
```

Every refused trial is counted with its reason; nothing is silently dropped.
Predatory list: https://www.predatoryjournals.org/the-list/publishers

## Selftest: **PASS**

```text
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
  PASS  no formatting trick hides a model import  13 evasions all caught
  PASS  innocent source does not trip the check  false positives: []
  PASS  a reasonless allowlist entry is itself a failure  an unexplained exception is an undocumented hole in invariant 1
  PASS  the deterministic layer imports on a bare interpreter  
  PASS  a module-level third-party import is caught  
  PASS  the same import inside a function is fine  lazy is the fix, so it must not be reported as the problem
  PASS  stdlib and local imports are not third-party  

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

ALL PASSED
```

## This run — extraction stats

- Targeted studies: **139**
- Succeeded (usable): **138**
- Skipped (no text): **1**
- Partial agent failures: **1**
- Prompt version: `v1.38`
- Concurrency: 10  |  studies in flight: 10

## Token + cost accounting

- Extraction backend: **Claude subscription** (`--safe-mode`, `--max-turns 1`, one shot per call)
- Model calls: **926** (cache hits 739, failures 608)
- Input tokens: **7,056,223** (fresh 95,961 · cache-write 2,508,733 · cache-read 4,451,529)
- Output tokens: **287,528**
- **Spent on this run: $0.00** — subscription, not metered.
- **API-equivalent cost: $26.329** — what the same work would cost billed per token.
- Per study: **6.7 calls**, **$0.1908** API-equivalent across 138 scored studies.

| Agent | Tier | Model | Calls | Cache hits | Fail | In | Out | API-equiv |
|---|---|---|--:|--:|--:|--:|--:|--:|
| S3 | B | `claude-sonnet-5` | 173 | 115 | 124 | 2,122,821 | 33,781 | $8.431 |
| S4 | B | `claude-sonnet-5` | 190 | 101 | 141 | 3,062,112 | 18,720 | $11.168 |
| S5 | B | `claude-sonnet-5` | 160 | 109 | 110 | 293,304 | 40,835 | $0.862 |
| S5N | B | `claude-sonnet-5` | 36 | 76 | 7 | 382,637 | 52,785 | $1.242 |
| S5R | R | `claude-opus-5` | 6 | 36 | 0 | 85,750 | 12,374 | $0.985 |
| S6B | C | `claude-sonnet-5` | 44 | 82 | 8 | 409,048 | 45,274 | $1.687 |
| S7 | B | `claude-sonnet-5` | 164 | 105 | 114 | 501,154 | 22,066 | $1.342 |
| S8 | A | `claude-haiku-4-5-20251001` | 153 | 115 | 104 | 199,397 | 61,693 | $0.612 |

Tier → model is pinned in `claude_adapter.TIER_MODEL` (full ids, never aliases: an alias floats to a new model while the cache key does not change). Tier A = classification, B = extraction, C = the highest-risk agent.

## Predatory journal check (flag only — not in score)

- List entries loaded: **1162**
- Studies checked: **848**
- Publisher resolved for: **669/848** (the list is PUBLISHERS, so this is the real coverage)
- Studies flagged predatory: **5**
- Distinct publishers flagged: **2**
- Distinct journals flagged: **0**
- Affects score: **NO (count only)**
  - [publisher] Baishideng Publishing Group Inc.
  - [publisher] Frontiers Media SA

## Per-agent success rates (this run)

| Agent | Studies OK | Studies failed | Cache | Retries | Why it failed |
|---|---:|---:|---:|---:|---|
| S3 | 138 | 0 | 95 | 35 | — |
| S4 | 138 | 0 | 92 | 52 | — |
| S5 | 138 | 0 | 93 | 22 | — |
| S5N | 91 | 1 | 64 | 0 | exit 1: max_turns (x1) |
| S5R | 42 | 0 | 36 | 0 | — |
| S6B | 114 | 0 | 79 | 0 | — |
| S7 | 138 | 0 | 92 | 26 | — |
| S8 | 138 | 0 | 95 | 15 | — |

_One row per STUDY. The cost table above counts CLI ATTEMPTS, so its totals are higher by exactly the retries column._

**Telemetry does not reconcile — do not quote these rates:**
- S5N: 36 attempts for 92 studies -- impossible, every study needs at least one attempt
- S5R: 6 attempts for 42 studies -- impossible, every study needs at least one attempt
- S6B: 44 attempts for 114 studies -- impossible, every study needs at least one attempt

## Studies extracted this run (139)

| # | Year | Title | DOI / PMID | Journal | OA | Predatory |
|---:|---:|---|---|---|---|---|
| 1 | 2026 | Effects of six weeks of guanidinoacetic acid supplementation with and without cr | [10.1080/15502783.2026.2711032](https://doi.org/10.1080/15502783.2026.2711032) | Journal of the International Society of  | full_text | no |
| 2 | 2026 | Effects of creatine supplementation with and without exercise and diet intervent | [10.1080/15502783.2026.2716273](https://doi.org/10.1080/15502783.2026.2716273) | Journal of the International Society of  | full_text | no |
| 3 | 2026 | Creatine plus β-Hydroxy-β-Methylbutyrate supplementation is associated with pres | [10.1007/s10522-026-10407-2](https://doi.org/10.1007/s10522-026-10407-2) | Biogerontology | full_text | no |
| 4 | 2026 | Creatine formulations and repeated sprint training: effects on physical and phys | [10.1080/15502783.2026.2721147](https://doi.org/10.1080/15502783.2026.2721147) | Journal of the International Society of  | full_text | no |
| 5 | 2026 | Synergistic effects of creatine, carbs, protein on repeated sprint performance. | [10.1038/s41598-026-44278-x](https://doi.org/10.1038/s41598-026-44278-x) | Scientific reports | full_text | no |
| 6 | 2026 | Combined creatine and β-hydroxy-β-methylbutyrate supplementation with integral c | [10.1007/s40520-025-03312-0](https://doi.org/10.1007/s40520-025-03312-0) | Aging clinical and experimental research | full_text | no |
| 7 | 2026 | Single-Dose Creatine Reduces Sleep Deprivation-Induced Deterioration in Cognitiv | [10.3390/nu18081192](https://doi.org/10.3390/nu18081192) | Nutrients | full_text | no |
| 8 | 2026 | Combined creatine and HMB co-supplementation improves functional strength indepe | [10.1007/s11357-025-01889-y](https://doi.org/10.1007/s11357-025-01889-y) | GeroScience | full_text | no |
| 9 | 2025 | Effectiveness of a soccer injury prevention program based on creatine supplement | [10.1080/15502783.2026.2633251](https://doi.org/10.1080/15502783.2026.2633251) | Journal of the International Society of  | full_text | no |
| 10 | 2025 | Acute creatine supplementation enhances technical performance in adolescent bask | [10.1080/15502783.2025.2542369](https://doi.org/10.1080/15502783.2025.2542369) | Journal of the International Society of  | full_text | no |
| 11 | 2025 | Short-term creatine supplementation enhances strength, reduces fatigue, and acce | [10.1080/15502783.2026.2617283](https://doi.org/10.1080/15502783.2026.2617283) | Journal of the International Society of  | full_text | no |
| 12 | 2025 | Effects of Creatine Monohydrate Loading on Sleep Metrics, Physical Performance,  | [10.3390/nu17243831](https://doi.org/10.3390/nu17243831) | Nutrients | full_text | no |
| 13 | 2025 | Does creatine cause hair loss? A 12-week randomized controlled trial. | [10.1080/15502783.2025.2495229](https://doi.org/10.1080/15502783.2025.2495229) | Journal of the International Society of  | full_text | no |
| 14 | 2025 | The Effect of Creatine Supplementation on Lean Body Mass with and Without Resist | [10.3390/nu17061081](https://doi.org/10.3390/nu17061081) | Nutrients | full_text | no |
| 15 | 2025 | Effect of Taurine Combined With Creatine on Repeated Sprinting Ability After Exh | [10.1177/19417381251320095](https://doi.org/10.1177/19417381251320095) | Sports health | full_text | no |
| 16 | 2025 | Metabolic Signature of Arsenic Exposure and Metabolism: The Folic Acid and Creat | [10.1021/acs.est.5c01597](https://doi.org/10.1021/acs.est.5c01597) | Environmental science & technology | full_text | no |
| 17 | 2025 | Effect of creatine monohydrate on motor function in children with facioscapulohu | [10.1002/phar.70025](https://doi.org/10.1002/phar.70025) | Pharmacotherapy | full_text | no |
| 18 | 2024 | Effect of Creatine Monohydrate Supplementation on Macro- and Microvascular Endot | [10.3390/nu17010058](https://doi.org/10.3390/nu17010058) | Nutrients | full_text | no |
| 19 | 2024 | High-dose short-term creatine supplementation without beneficial effects in prof | [10.1080/15502783.2024.2340574](https://doi.org/10.1080/15502783.2024.2340574) | Journal of the International Society of  | full_text | no |
| 20 | 2024 | Supplementing With Which Form of Creatine (Hydrochloride or Monohydrate) Alongsi | [10.33549/physiolres.935323](https://doi.org/10.33549/physiolres.935323) | Physiological research | full_text | no |
| 21 | 2024 | Effect of Creatine Supplementation on Body Composition and Malnutrition-Inflamma | [10.3390/nu16050615](https://doi.org/10.3390/nu16050615) | Nutrients | full_text | no |
| 22 | 2024 | Combined Impact of Creatine, Caffeine, and Variable Resistance on Repeated Sprin | [10.3390/nu16152437](https://doi.org/10.3390/nu16152437) | Nutrients | full_text | no |
| 23 | 2024 | Creatine Improves Total Sleep Duration Following Resistance Training Days versus | [10.3390/nu16162772](https://doi.org/10.3390/nu16162772) | Nutrients | full_text | no |
| 24 | 2024 | Creatine supplementation combined with breathing exercises reduces respiratory d | [10.4103/jpgm.jpgm_650_23](https://doi.org/10.4103/jpgm.jpgm_650_23) | Journal of postgraduate medicine | full_text | no |
| 25 | 2024 | The Effect of Creatine Nitrate and Caffeine Individually or Combined on Exercise | [10.3390/nu16060766](https://doi.org/10.3390/nu16060766) | Nutrients | full_text | no |
| 26 | 2024 | Effects of a Low Dose of Orally Administered Creatine Monohydrate on Post-Fatigu | [10.3390/nu16091324](https://doi.org/10.3390/nu16091324) | Nutrients | full_text | no |
| 27 | 2024 | No additive effect of creatine, caffeine, and sodium bicarbonate on intense exer | [10.1111/sms.14629](https://doi.org/10.1111/sms.14629) | Scandinavian journal of medicine & scien | full_text | no |
| 28 | 2024 | The Effect of Prior Creatine Intake for 28 Days on Accelerated Recovery from Exe | [10.3390/nu16060896](https://doi.org/10.3390/nu16060896) | Nutrients | full_text | no |
| 29 | 2023 | The Effects of Protein and Carbohydrate Supplementation, with and without Creati | [10.3390/nu15245134](https://doi.org/10.3390/nu15245134) | Nutrients | full_text | no |
| 30 | 2023 | The effects of creatine supplementation on cognitive performance-a randomised co | [10.1186/s12916-023-03146-5](https://doi.org/10.1186/s12916-023-03146-5) | BMC medicine | full_text | no |
| 31 | 2023 | Creatine monohydrate supplementation changes total body water and DXA lean mass  | [10.1080/15502783.2023.2193556](https://doi.org/10.1080/15502783.2023.2193556) | Journal of the International Society of  | full_text | no |
| 32 | 2023 | The role of resistance training and creatine supplementation on oxidative stress | [10.3389/fpubh.2023.1062832](https://doi.org/10.3389/fpubh.2023.1062832) | Frontiers in public health | full_text | YES |
| 33 | 2023 | A Randomized Controlled Trial of Changes in Fluid Distribution across Menstrual  | [10.3390/nu15020429](https://doi.org/10.3390/nu15020429) | Nutrients | full_text | no |
| 34 | 2023 | A 2-yr Randomized Controlled Trial on Creatine Supplementation during Exercise f | [10.1249/mss.0000000000003202](https://doi.org/10.1249/mss.0000000000003202) | Medicine and science in sports and exerc | full_text | no |
| 35 | 2023 | The Folic Acid and Creatine Trial: Treatment Effects of Supplementation on Arsen | [10.1289/ehp11270](https://doi.org/10.1289/ehp11270) | Environmental health perspectives | full_text | no |
| 36 | 2023 | The Effects of Creatine Monohydrate Loading on Exercise Recovery in Active Women | [10.3390/nu15163567](https://doi.org/10.3390/nu15163567) | Nutrients | full_text | no |
| 37 | 2023 | Application of the D&lt;sub&gt;3&lt;/sub&gt; -creatine muscle mass assessment to | [10.1002/jcsm.13322](https://doi.org/10.1002/jcsm.13322) | Journal of cachexia, sarcopenia and musc | full_text | no |
| 38 | 2022 | Effects of Oral Creatine Supplementation on Power Output during Repeated Treadmi | [10.3390/nu14061140](https://doi.org/10.3390/nu14061140) | Nutrients | full_text | no |
| 39 | 2022 | Effects of Four Weeks of Beta-Alanine Supplementation Combined with One Week of  | [10.3390/ijerph19137992](https://doi.org/10.3390/ijerph19137992) | International journal of environmental r | full_text | no |
| 40 | 2022 | A randomized open-labeled study to examine the effects of creatine monohydrate a | [10.1080/15502783.2022.2108683](https://doi.org/10.1080/15502783.2022.2108683) | Journal of the International Society of  | full_text | no |
| 41 | 2022 | Effects of ibudilast on central and peripheral markers of inflammation in alcoho | [10.1111/adb.13182](https://doi.org/10.1111/adb.13182) | Addiction biology | full_text | no |
| 42 | 2021 | The effects of phosphocreatine disodium salts plus blueberry extract supplementa | [10.1186/s12970-021-00456-y](https://doi.org/10.1186/s12970-021-00456-y) | Journal of the International Society of  | full_text | no |
| 43 | 2021 | Effect of Creatine Supplementation on Functional Capacity and Muscle Oxygen Satu | [10.3390/nu13010149](https://doi.org/10.3390/nu13010149) | Nutrients | full_text | no |
| 44 | 2021 | Effects of Combined Creatine and Sodium Bicarbonate Supplementation on Soccer-Sp | [10.3390/ijerph18136919](https://doi.org/10.3390/ijerph18136919) | International journal of environmental r | full_text | no |
| 45 | 2021 | Creatine Enhances the Effects of Cluster-Set Resistance Training on Lower-Limb B | [10.3390/nu13072303](https://doi.org/10.3390/nu13072303) | Nutrients | full_text | no |
| 46 | 2021 | Short-Term Creatine Loading Improves Total Work and Repetitions to Failure but N | [10.3390/nu13030826](https://doi.org/10.3390/nu13030826) | Nutrients | full_text | no |
| 47 | 2021 | Morning versus Evening Intake of Creatine in Elite Female Handball Players. | [10.3390/ijerph19010393](https://doi.org/10.3390/ijerph19010393) | International journal of environmental r | full_text | no |
| 48 | 2021 | Pharmacokinetics, Pharmacodynamics, and Tolerability of AZD5718, an Oral 5-Lipox | [10.1007/s40261-021-01078-7](https://doi.org/10.1007/s40261-021-01078-7) | Clinical drug investigation | full_text | no |
| 49 | 2021 | Short-term co-ingestion of creatine and sodium bicarbonate improves anaerobic pe | [10.1186/s12970-021-00407-7](https://doi.org/10.1186/s12970-021-00407-7) | Journal of the International Society of  | full_text | no |
| 50 | 2021 | Effects of Fortetropin on the Rate of Muscle Protein Synthesis in Older Men and  | [10.1093/gerona/glaa162](https://doi.org/10.1093/gerona/glaa162) | The journals of gerontology. Series A, B | full_text | no |
| 51 | 2020 | The Effects of Long-Term Magnesium Creatine Chelate Supplementation on Repeated  | [10.3390/nu12102961](https://doi.org/10.3390/nu12102961) | Nutrients | full_text | no |
| 52 | 2020 | Effects of Creatine Supplementation during Resistance Training Sessions in Physi | [10.3390/nu12061880](https://doi.org/10.3390/nu12061880) | Nutrients | full_text | no |
| 53 | 2020 | The addition of β-Hydroxy β-Methylbutyrate (HMB) to creatine monohydrate supplem | [10.1186/s12970-020-00359-4](https://doi.org/10.1186/s12970-020-00359-4) | Journal of the International Society of  | full_text | no |
| 54 | 2020 | Effect of Ten Weeks of Creatine Monohydrate Plus HMB Supplementation on Athletic | [10.3390/nu12010193](https://doi.org/10.3390/nu12010193) | Nutrients | full_text | no |
| 55 | 2020 | Effects of Monomeric and Oligomeric Flavanols on Kidney Function, Inflammation a | [10.3390/nu12061634](https://doi.org/10.3390/nu12061634) | Nutrients | full_text | no |
| 56 | 2019 | Examining the effects of creatine supplementation in augmenting adaptations to r | [10.1136/bmjopen-2019-030080](https://doi.org/10.1136/bmjopen-2019-030080) | BMJ open | full_text | no |
| 57 | 2019 | Effect of Creatine Supplementation Dosing Strategies on Aging Muscle Performance | [10.1007/s12603-018-1148-8](https://doi.org/10.1007/s12603-018-1148-8) | The journal of nutrition, health & aging | full_text | no |
| 58 | 2019 | Effects of 12 Weeks of Essential Amino Acids (EAA)-Based Multi-Ingredient Nutrit | [10.1007/s12603-019-1163-4](https://doi.org/10.1007/s12603-019-1163-4) | The journal of nutrition, health & aging | full_text | no |
| 59 | 2019 | Creatine electrolyte supplement improves anaerobic power and strength: a randomi | [10.1186/s12970-019-0291-x](https://doi.org/10.1186/s12970-019-0291-x) | Journal of the International Society of  | full_text | no |
| 60 | 2018 | Effects of 4-Week Creatine Supplementation Combined with Complex Training on Mus | [10.3390/nu10111640](https://doi.org/10.3390/nu10111640) | Nutrients | full_text | no |
| 61 | 2018 | Creatine-electrolyte supplementation improves repeated sprint cycling performanc | [10.1186/s12970-018-0226-y](https://doi.org/10.1186/s12970-018-0226-y) | Journal of the International Society of  | full_text | no |
| 62 | 2018 | Creatine Supplementation Supports the Rehabilitation of Adolescent Fin Swimmers  | [PMID 29769829](https://pubmed.ncbi.nlm.nih.gov/29769829/) | Journal of sports science & medicine | full_text | no |
| 63 | 2018 | The Effect of a High-Dose Vitamin B Multivitamin Supplement on the Relationship  | [10.3390/nu10121860](https://doi.org/10.3390/nu10121860) | Nutrients | full_text | no |
| 64 | 2018 | Creatine or vitamin D supplementation in individuals with a spinal cord injury u | [10.1080/10790268.2017.1372058](https://doi.org/10.1080/10790268.2017.1372058) | The journal of spinal cord medicine | full_text | no |
| 65 | 2018 | A randomized, double-blind, placebo-controlled, proof-of-concept trial of creati | [10.1007/s00702-017-1817-5](https://doi.org/10.1007/s00702-017-1817-5) | Journal of neural transmission (Vienna,  | full_text | no |
| 66 | 2017 | Effects of ingesting a pre-workout dietary supplement with and without synephrin | [10.1186/s12970-016-0158-3](https://doi.org/10.1186/s12970-016-0158-3) | Journal of the International Society of  | full_text | no |
| 67 | 2017 | Hematological and Hemodynamic Responses to Acute and Short-Term Creatine Nitrate | [10.3390/nu9121359](https://doi.org/10.3390/nu9121359) | Nutrients | full_text | no |
| 68 | 2017 | Effects of Creatine Supplementation on Muscle Strength and Optimal Individual Po | [10.3390/nu9111169](https://doi.org/10.3390/nu9111169) | Nutrients | full_text | no |
| 69 | 2017 | Effect of low dose, short-term creatine supplementation on muscle power output i | [10.1186/s12970-017-0162-2](https://doi.org/10.1186/s12970-017-0162-2) | Journal of the International Society of  | full_text | no |
| 70 | 2017 | A double-blind, placebo-controlled randomized trial of creatine for the cancer a | [10.1093/annonc/mdx232](https://doi.org/10.1093/annonc/mdx232) | Annals of oncology : official journal of | full_text | no |
| 71 | 2017 | The CREST-E study of creatine for Huntington disease: A randomized controlled tr | [10.1212/wnl.0000000000004209](https://doi.org/10.1212/wnl.0000000000004209) | Neurology | full_text | no |
| 72 | 2017 | The acute effect of beta-guanidinopropionic acid versus creatine or placebo in h | [10.1111/bcp.13390](https://doi.org/10.1111/bcp.13390) | British journal of clinical pharmacology | full_text | no |
| 73 | 2016 | The Effects of Creatine Supplementation on Explosive Performance and Optimal Ind | [10.3390/nu8030143](https://doi.org/10.3390/nu8030143) | Nutrients | full_text | no |
| 74 | 2016 | Supplementation with Guanidinoacetic Acid in Women with Chronic Fatigue Syndrome | [10.3390/nu8020072](https://doi.org/10.3390/nu8020072) | Nutrients | full_text | no |
| 75 | 2016 | Effects of Coffee and Caffeine Anhydrous Intake During Creatine Loading. | [10.1519/jsc.0000000000001223](https://doi.org/10.1519/jsc.0000000000001223) | Journal of strength and conditioning res | full_text | no |
| 76 | 2015 | Creatine supplementation enhances corticomotor excitability and cognitive perfor | [10.1523/jneurosci.3113-14.2015](https://doi.org/10.1523/jneurosci.3113-14.2015) | The Journal of neuroscience : the offici | full_text | no |
| 77 | 2015 | Folic Acid and Creatine as Therapeutic Approaches to Lower Blood Arsenic: A Rand | [10.1289/ehp.1409396](https://doi.org/10.1289/ehp.1409396) | Environmental health perspectives | full_text | no |
| 78 | 2015 | The acute effect of beta-guanidinopropionic acid versus creatine or placebo in h | [10.1186/s13063-015-0581-9](https://doi.org/10.1186/s13063-015-0581-9) | Trials | full_text | no |
| 79 | 2015 | Sex Differences in Clinical Features of Early, Treated Parkinson's Disease. | [10.1371/journal.pone.0133002](https://doi.org/10.1371/journal.pone.0133002) | PloS one | full_text | no |
| 80 | 2015 | Caffeine and Progression of Parkinson Disease: A Deleterious Interaction With Cr | [10.1097/wnf.0000000000000102](https://doi.org/10.1097/wnf.0000000000000102) | Clinical neuropharmacology | full_text | no |
| 81 | 2014 | PRECREST: a phase II prevention and biomarker trial of creatine in at-risk Hunti | [10.1212/wnl.0000000000000187](https://doi.org/10.1212/wnl.0000000000000187) | Neurology | full_text | no |
| 82 | 2013 | Creatine supplementation associated or not with strength training upon emotional | [10.1371/journal.pone.0076301](https://doi.org/10.1371/journal.pone.0076301) | PloS one | full_text | no |
| 83 | 2013 | Creatine metabolism and safety profiles after six-week oral guanidinoacetic acid | [10.7150/ijms.5125](https://doi.org/10.7150/ijms.5125) | International journal of medical science | full_text | no |
| 84 | 2012 | A randomized, double-blind placebo-controlled trial of oral creatine monohydrate | [10.1176/appi.ajp.2012.12010009](https://doi.org/10.1176/appi.ajp.2012.12010009) | The American journal of psychiatry | full_text | no |
| 85 | 2010 | The effects of supplementation with creatine and protein on muscle strength foll | [10.1007/s12603-009-0124-8](https://doi.org/10.1007/s12603-009-0124-8) | The journal of nutrition, health & aging | full_text | no |
| 86 | 2009 | The effect of L-arginine and creatine on vascular function and homocysteine meta | [10.1177/1358863x08100834](https://doi.org/10.1177/1358863x08100834) | Vascular medicine (London, England) | full_text | no |
| 87 | 2009 | Creatine fails to augment the benefits from resistance training in patients with | [10.1371/journal.pone.0004605](https://doi.org/10.1371/journal.pone.0004605) | PloS one | full_text | no |
| 88 | 2008 | The effects of creatine and whey protein supplementation on body composition in  | [10.1007/bf02982622](https://doi.org/10.1007/bf02982622) | The journal of nutrition, health & aging | full_text | no |
| 89 | 2006 | Creatine supplementation and physical training in patients with COPD: a double b | [10.2147/copd.2006.1.4.445](https://doi.org/10.2147/copd.2006.1.4.445) | International journal of chronic obstruc | full_text | no |
| 90 | 2006 | The effects of creatine supplementation on selected factors of tennis specific t | [10.1136/bjsm.2005.022558](https://doi.org/10.1136/bjsm.2005.022558) | British journal of sports medicine | full_text | no |
| 91 | 2000 | Dietary creatine supplementation does not affect some haematological indices, or | [10.1136/bjsm.34.4.284](https://doi.org/10.1136/bjsm.34.4.284) | British journal of sports medicine | full_text | no |
| 92 | 1996 | Effect of creatine on aerobic and anaerobic metabolism in skeletal muscle in swi | [10.1136/bjsm.30.3.222](https://doi.org/10.1136/bjsm.30.3.222) | British journal of sports medicine | full_text | no |
| 93 | 2026 | Effects of high-load, velocity-intentional variable resistance training combined | [10.1016/j.exger.2026.113122](https://doi.org/10.1016/j.exger.2026.113122) | Experimental gerontology | abstract_only | no |
| 94 | 2026 | Independent effects of whey protein and alkali supplementation on muscle health  | [10.1016/j.ajcnut.2026.101257](https://doi.org/10.1016/j.ajcnut.2026.101257) | The American journal of clinical nutriti | abstract_only | no |
| 95 | 2026 | Comparative Effects of Guanidinoacetic Acid and Creatine on Body Composition, Mu | [10.3177/jnsv.72.284](https://doi.org/10.3177/jnsv.72.284) | Journal of nutritional science and vitam | abstract_only | no |
| 96 | 2026 | Beetroot juice or creatine: which yields greater short-term benefits for resista | [10.1080/09637486.2026.2625827](https://doi.org/10.1080/09637486.2026.2625827) | International journal of food sciences a | abstract_only | no |
| 97 | 2025 | Effect of a Multi-Ingredient Post-Workout Dietary Supplement on Body Composition | [10.1080/19390211.2025.2488811](https://doi.org/10.1080/19390211.2025.2488811) | Journal of dietary supplements | abstract_only | no |
| 98 | 2025 | Lowering plasma S-Adenosylhomocysteine (SAH) in healthy adults with elevated SAH | [10.1016/j.numecd.2025.104221](https://doi.org/10.1016/j.numecd.2025.104221) | Nutrition, metabolism, and cardiovascula | abstract_only | no |
| 99 | 2025 | Efficacy and safety profile of oral creatine monohydrate in add-on to cognitive- | [10.1016/j.euroneuro.2024.10.004](https://doi.org/10.1016/j.euroneuro.2024.10.004) | European neuropsychopharmacology : the j | abstract_only | no |
| 100 | 2024 | Short term creatine loading improves strength endurance even without changing ma | [10.1590/0001-3765202420230559](https://doi.org/10.1590/0001-3765202420230559) | Anais da Academia Brasileira de Ciencias | abstract_only | no |
| 101 | 2024 | Eight-Week Creatine-Glucose Supplementation Alleviates Clinical Features of Long | [10.3177/jnsv.70.174](https://doi.org/10.3177/jnsv.70.174) | Journal of nutritional science and vitam | abstract_only | no |
| 102 | 2023 | Does creatine supplementation affect recovery speed of impulse above critical to | [10.1080/17461391.2022.2159539](https://doi.org/10.1080/17461391.2022.2159539) | European journal of sport science | abstract_only | no |
| 103 | 2023 | Creatine supplementation combined with blood flow restriction training enhances  | [10.1139/apnm-2022-0209](https://doi.org/10.1139/apnm-2022-0209) | Applied physiology, nutrition, and metab | abstract_only | no |
| 104 | 2022 | Creatine Monohydrate Supplementation, but not Creatyl-L-Leucine, Increased Muscl | [10.1123/ijsnem.2022-0074](https://doi.org/10.1123/ijsnem.2022-0074) | International journal of sport nutrition | abstract_only | no |
| 105 | 2021 | Guanidinoacetate-Creatine Supplementation Improves Functional Performance and Mu | [10.1159/000518499](https://doi.org/10.1159/000518499) | Annals of nutrition & metabolism | abstract_only | no |
| 106 | 2021 | The Effect of Creatine Supplementation on Muscle Function in Childhood Myositis: | [10.3899/jrheum.191375](https://doi.org/10.3899/jrheum.191375) | The Journal of rheumatology | abstract_only | no |
| 107 | 2021 | The Effects of Acute Δ<sup>9</sup>-Tetrahydrocannabinol on Striatal Glutamatergi | [10.1016/j.bpsc.2021.04.013](https://doi.org/10.1016/j.bpsc.2021.04.013) | Biological psychiatry. Cognitive neurosc | abstract_only | no |
| 108 | 2020 | Creatine supplementation does not promote additional effects on inflammation and | [10.1016/j.clnesp.2020.05.024](https://doi.org/10.1016/j.clnesp.2020.05.024) | Clinical nutrition ESPEN | abstract_only | no |
| 109 | 2020 | Patients With Atrial Fibrillation Taking Nonsteroidal Anti-Inflammatory Drugs an | [10.1161/circulationaha.119.041296](https://doi.org/10.1161/circulationaha.119.041296) | Circulation | abstract_only | no |
| 110 | 2019 | Creatine supplementation improves performance above critical power but does not  | [10.1113/ep087886](https://doi.org/10.1113/ep087886) | Experimental physiology | abstract_only | no |
| 111 | 2019 | Effects of high-velocity resistance training and creatine supplementation in unt | [10.1139/apnm-2019-0066](https://doi.org/10.1139/apnm-2019-0066) | Applied physiology, nutrition, and metab | abstract_only | no |
| 112 | 2019 | Antioxidant vitamin supplementation prevents oxidative stress but does not enhan | [10.1016/j.nut.2019.01.007](https://doi.org/10.1016/j.nut.2019.01.007) | Nutrition (Burbank, Los Angeles County,  | abstract_only | no |
| 113 | 2019 | Creatine supplementation can improve impact control in high-intensity interval t | [10.1016/j.nut.2018.09.020](https://doi.org/10.1016/j.nut.2018.09.020) | Nutrition (Burbank, Los Angeles County,  | abstract_only | no |
| 114 | 2019 | Guanidinoacetic acid with creatine compared with creatine alone for tissue creat | [10.1016/j.nut.2018.04.009](https://doi.org/10.1016/j.nut.2018.04.009) | Nutrition (Burbank, Los Angeles County,  | abstract_only | no |
| 115 | 2018 | Supplementation with Qter<sup>®</sup> and Creatine improves functional performan | [10.1016/j.rmed.2018.08.002](https://doi.org/10.1016/j.rmed.2018.08.002) | Respiratory medicine | abstract_only | no |
| 116 | 2018 | Changing to a vegetarian diet reduces the body creatine pool in omnivorous women | [10.1017/s000711451800017x](https://doi.org/10.1017/s000711451800017x) | The British journal of nutrition | abstract_only | no |
| 117 | 2018 | Ingestion of a Multi-Ingredient Supplement Does Not Alter Exercise-Induced Satel | [10.1093/jn/nxy063](https://doi.org/10.1093/jn/nxy063) | The Journal of nutrition | abstract_only | no |
| 118 | 2016 | Can Creatine Supplementation Improve Body Composition and Objective Physical Fun | [10.1002/acr.22747](https://doi.org/10.1002/acr.22747) | Arthritis care & research | abstract_only | no |
| 119 | 2016 | Effects of plyometric training and creatine supplementation on maximal-intensity | [10.1016/j.jsams.2015.10.005](https://doi.org/10.1016/j.jsams.2015.10.005) | Journal of science and medicine in sport | abstract_only | no |
| 120 | 2015 | Six-Week Oral Guanidinoacetic Acid Administration Improves Muscular Performance  | [10.1097/jim.0000000000000212](https://doi.org/10.1097/jim.0000000000000212) | Journal of investigative medicine : the  | abstract_only | no |
| 121 | 2015 | Effects of long-term low-dose dietary creatine supplementation in older women. | [10.1016/j.exger.2015.07.012](https://doi.org/10.1016/j.exger.2015.07.012) | Experimental gerontology | abstract_only | no |
| 122 | 2015 | The effect of 12-wk ω-3 fatty acid supplementation on in vivo thalamus glutathio | [10.1016/j.nut.2015.04.019](https://doi.org/10.1016/j.nut.2015.04.019) | Nutrition (Burbank, Los Angeles County,  | abstract_only | no |
| 123 | 2013 | Creatine supplementation in fibromyalgia: a randomized, double-blind, placebo-co | [10.1002/acr.22020](https://doi.org/10.1002/acr.22020) | Arthritis care & research | abstract_only | no |
| 124 | 2013 | Effects of creatine supplementation in taekwondo practitioners. | [10.3305/nh.2013.28.2.6314](https://doi.org/10.3305/nh.2013.28.2.6314) | Nutricion hospitalaria | abstract_only | no |
| 125 | 2013 | Feasibility and efficacy of progressive resistance training and dietary suppleme | [10.3109/0284186x.2012.741325](https://doi.org/10.3109/0284186x.2012.741325) | Acta oncologica (Stockholm, Sweden) | abstract_only | no |
| 126 | 2013 | Effects of creatine supplementation on oxidative stress and inflammatory markers | [10.1016/j.nut.2013.03.003](https://doi.org/10.1016/j.nut.2013.03.003) | Nutrition (Burbank, Los Angeles County,  | abstract_only | no |
| 127 | 2012 | Influence of creatine supplementation on the functional capacity of patients wit | [10.1590/s0066-782x2012005000056](https://doi.org/10.1590/s0066-782x2012005000056) | Arquivos brasileiros de cardiologia | abstract_only | no |
| 128 | 2011 | The influence of creatine supplementation on the cognitive functioning of vegeta | [10.1017/s0007114510004733](https://doi.org/10.1017/s0007114510004733) | The British journal of nutrition | abstract_only | no |
| 129 | 2011 | Beneficial effect of creatine supplementation in knee osteoarthritis. | [10.1249/mss.0b013e3182118592](https://doi.org/10.1249/mss.0b013e3182118592) | Medicine and science in sports and exerc | abstract_only | no |
| 130 | 2010 | Effect of creatine supplementation as a potential adjuvant therapy to exercise t | [10.1177/0269215510367995](https://doi.org/10.1177/0269215510367995) | Clinical rehabilitation | abstract_only | no |
| 131 | 2008 | Effects of resistance exercise with and without creatine supplementation on gene | [10.1152/japplphysiol.00873.2007](https://doi.org/10.1152/japplphysiol.00873.2007) | Journal of applied physiology (Bethesda, | abstract_only | no |
| 132 | 2007 | Effects of whey isolate, creatine, and resistance training on muscle hypertrophy | [10.1249/01.mss.0000247002.32589.ef](https://doi.org/10.1249/01.mss.0000247002.32589.ef) | Medicine and science in sports and exerc | abstract_only | no |
| 133 | 2007 | A creatine-protein-carbohydrate supplement enhances responses to resistance trai | [10.1249/mss.0b013e31814fb52a](https://doi.org/10.1249/mss.0b013e31814fb52a) | Medicine and science in sports and exerc | abstract_only | no |
| 134 | 2006 | Creatine supplementation augments the increase in satellite cell and myonuclei n | [10.1113/jphysiol.2006.107359](https://doi.org/10.1113/jphysiol.2006.107359) | The Journal of physiology | abstract_only | no |
| 135 | 2005 | Increased IGF mRNA in human skeletal muscle after creatine supplementation. | [10.1249/01.mss.0000162690.39830.27](https://doi.org/10.1249/01.mss.0000162690.39830.27) | Medicine and science in sports and exerc | abstract_only | no |
| 136 | 2004 | The effects of creatine supplementation on muscular performance and body composi | [10.1007/s00421-003-1031-z](https://doi.org/10.1007/s00421-003-1031-z) | European journal of applied physiology | abstract_only | no |
| 137 | 2003 | Beneficial effects of creatine supplementation in dystrophic patients. | [10.1002/mus.10355](https://doi.org/10.1002/mus.10355) | Muscle & nerve | abstract_only | no |
| 138 | 2003 | Creatine supplementation and its effect on musculotendinous stiffness and perfor | [10.1519/1533-4287(2003)017<0026:csaieo>2.0.co;2](https://doi.org/10.1519/1533-4287(2003)017<0026:csaieo>2.0.co;2) | Journal of strength and conditioning res | abstract_only | no |
| 139 | 1998 | The effects of creatine supplementation on high-intensity exercise performance i | [10.1007/s004210050413](https://doi.org/10.1007/s004210050413) | European journal of applied physiology a | abstract_only | no |

## Evidence grades — this run (`evidence-v2`, status `shadow`)

Population: `general_adult` · registry checked: **yes**

| Outcome | Grade | Benefit | Certainty | k | SMD [95% CI] | I² | refused |
|---|---|---|---|--:|---|--:|--:|
| muscle_power | **I** | inconclusive | Very low | 12 | +0.06 [-0.49, +0.61] | 61% | 23 |
| muscle_strength | **C+** | meaningful | Low | 12 | +0.29 [+0.07, +0.50] | 3% | 27 |
| lean_body_mass | **D+** | none | Low | 9 | +0.17 [-0.14, +0.47] | 26% | 15 |
| muscular_endurance | **I** | inconclusive | Very low | 3 | +0.07 [-0.98, +1.12] | 0% | 7 |
| exercise_endurance | **I** | inconclusive | Very low | 2 | -0.09 [-0.69, +0.51] | 0% | 17 |
| memory | **I** | none | Very low | 2 | +0.14 [-0.09, +0.36] | 0% | 0 |
| attention_focus | **I** | large | Very low | 1 | +1.02 [+0.23, +1.81] | — | 2 |
| depressive_symptoms | **I** | inconclusive | Very low | 1 | -0.16 [-0.94, +0.63] | — | 3 |
| energy_levels | **I** | inconclusive | Very low | 1 | -0.17 [-0.91, +0.57] | — | 2 |
| inflammation_crp | **I** | inconclusive | Very low | 1 | +0.17 [-0.59, +0.93] | — | 2 |
| muscle_soreness | **I** | large | Very low | 1 | +0.97 [+0.19, +1.76] | — | 3 |
| sleep_duration | **I** | inconclusive | Very low | 1 | +0.09 [-0.65, +0.83] | — | 0 |
| sleep_onset | **I** | inconclusive | Very low | 1 | -0.31 [-1.05, +0.44] | — | 0 |
| sleep_quality | **I** | large | Very low | 1 | +1.05 [+0.26, +1.84] | — | 1 |
| adverse_events_any | **I** | no data | Very low | 0 | — | — | 20 |
| adverse_events_gi | **I** | no data | Very low | 0 | — | — | 7 |
| blood_pressure | **I** | no data | Very low | 0 | — | — | 2 |
| cognitive_function | **I** | no data | Very low | 0 | — | — | 1 |
| cortisol | **I** | no data | Very low | 0 | — | — | 3 |
| exercise_recovery | **I** | no data | Very low | 0 | — | — | 3 |
| glycaemic_control | **I** | no data | Very low | 0 | — | — | 3 |
| perceived_stress | **I** | no data | Very low | 0 | — | — | 1 |
| testosterone | **I** | no data | Very low | 0 | — | — | 3 |

Why trials were refused (all outcomes):

- 38 × no outcome values in the text read (figure-only or not reported)
- 38 × study: off-target population
- 28 × study: no_isolated_ingredient_arm
- 9 × only a p-value reported (no means, SDs or effect estimate)
- 8 × study: no_ingredient_free_arm
- 5 × outcome has no recorded polarity, so arm means cannot be oriented
- 4 × not a contrast against an ingredient-free control
- 4 × no verified effect estimate and incomplete arm statistics
- 3 × numbers read but not found in the paper (span check)
- 2 × relative_percent needs its own scale; not pooled with differences
- 2 × arm values without an SD, SE or CI
- 1 × ratio needs its own scale; not pooled with differences
- 1 × reported mean difference has no verified CI with a stated level
- 1 × numbers not read (S5N call failed; re-run)
- 1 × crossover SMD may be standardised by the SD of differences (d_z); not poolable

## Notes

- Form, dose and population never weight a trial; they are GRADE indirectness.

- Predatory venues: flagged + counted, never weighted.

- This report is **this run only** — other ingredients are not mixed in.
