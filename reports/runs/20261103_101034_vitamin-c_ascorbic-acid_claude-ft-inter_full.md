# BS-PROOF full audit report (claude-ft-inter)

Generated: **2026-11-03 10:10 UTC**


scoring_model: evidence-v2

Ingredient: `vitamin_c` · Form: `ascorbic_acid` · Mode: **claude-ft-inter**

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
  PASS  'creatine clearance' (a creatinine-clearance misprint) is a marker (ARISTOTLE)  
  PASS  a topical cream is not evidence about oral supplementation  
  PASS  mentioning topical delivery in the abstract does not reject  
  PASS  other ingredients are untouched by the marker rule  

ALL PASSED
```

## This run — extraction stats

- Targeted studies: **116**
- Succeeded (usable): **52**
- Skipped (no text): **64**
- Partial agent failures: **0**
- Prompt version: `v1.39`
- Concurrency: 40  |  studies in flight: 40

## Token + cost accounting

- Extraction backend: **Claude subscription** (`--safe-mode`, `--max-turns 1`, one shot per call)
- Model calls: **141** (cache hits 234, failures 3)
- Input tokens: **2,199,478** (fresh 18,725 · cache-write 1,660,697 · cache-read 520,056)
- Output tokens: **191,881**
- **Spent on this run: $0.00** — subscription, not metered.
- **API-equivalent cost: $10.114** — what the same work would cost billed per token.
- Per study: **2.7 calls**, **$0.1945** API-equivalent across 52 scored studies.

| Agent | Tier | Model | Calls | Cache hits | Fail | In | Out | API-equiv |
|---|---|---|--:|--:|--:|--:|--:|--:|
| S3 | B | `claude-sonnet-5` | 17 | 35 | 0 | 330,659 | 13,889 | $1.179 |
| S4 | B | `claude-sonnet-5` | 21 | 32 | 1 | 347,589 | 12,614 | $1.279 |
| S4R | R | `claude-opus-5` | 5 | 6 | 0 | 99,630 | 4,801 | $0.996 |
| S5 | B | `claude-sonnet-5` | 21 | 33 | 2 | 415,056 | 44,838 | $1.648 |
| S5F | B | `claude-sonnet-5` | 0 | 1 | 0 | 0 | 0 | $0.000 |
| S5FR | R | `claude-opus-5` | 0 | 1 | 0 | 0 | 0 | $0.000 |
| S5N | B | `claude-sonnet-5` | 11 | 21 | 0 | 248,915 | 22,633 | $0.956 |
| S5R | R | `claude-opus-5` | 8 | 10 | 0 | 177,861 | 18,429 | $1.849 |
| S6B | C | `claude-sonnet-5` | 19 | 30 | 0 | 268,280 | 32,373 | $1.165 |
| S7 | B | `claude-sonnet-5` | 19 | 33 | 0 | 231,910 | 11,129 | $0.745 |
| S8 | A | `claude-haiku-4-5-20251001` | 20 | 32 | 0 | 79,578 | 31,175 | $0.297 |

Tier → model is pinned in `claude_adapter.TIER_MODEL` (full ids, never aliases: an alias floats to a new model while the cache key does not change). Tier A = classification, B = extraction, C = the highest-risk agent.

## Predatory journal check (flag only — not in score)

- List entries loaded: **1162**
- Studies checked: **1156**
- Publisher resolved for: **956/1156** (the list is PUBLISHERS, so this is the real coverage)
- Studies flagged predatory: **8**
- Distinct publishers flagged: **3**
- Distinct journals flagged: **0**
- Affects score: **NO (count only)**
  - [publisher] Baishideng Publishing Group Inc.
  - [publisher] Frontiers Media SA
  - [publisher] Science Alert

## Per-agent success rates (this run)

| Agent | Studies OK | Studies failed | Cache | Retries | Why it failed |
|---|---:|---:|---:|---:|---|
| S3 | 52 | 0 | 35 | 0 | — |
| S4 | 52 | 0 | 32 | 0 | — |
| S4R | 11 | 0 | 6 | 0 | — |
| S5 | 52 | 0 | 33 | 0 | — |
| S5N | 29 | 0 | 19 | 0 | — |
| S5R | 18 | 0 | 10 | 0 | — |
| S6B | 49 | 0 | 30 | 0 | — |
| S7 | 52 | 0 | 33 | 0 | — |
| S8 | 52 | 0 | 32 | 0 | — |

_One row per STUDY. The cost table above counts CLI ATTEMPTS, so its totals are higher by exactly the retries column._

**Telemetry does not reconcile — do not quote these rates:**
- S5F: 0 attempts in the cost table but no row in the success table -- its failures are invisible to anyone reading success rates
- S5FR: 0 attempts in the cost table but no row in the success table -- its failures are invisible to anyone reading success rates
- S3: 17 attempts for 52 studies -- impossible, every study needs at least one attempt
- S4: 21 attempts for 52 studies -- impossible, every study needs at least one attempt
- S4R: 5 attempts for 11 studies -- impossible, every study needs at least one attempt
- S5: 21 attempts for 52 studies -- impossible, every study needs at least one attempt
- S5N: 11 attempts for 29 studies -- impossible, every study needs at least one attempt
- S5R: 8 attempts for 18 studies -- impossible, every study needs at least one attempt
- S6B: 19 attempts for 49 studies -- impossible, every study needs at least one attempt
- S7: 19 attempts for 52 studies -- impossible, every study needs at least one attempt
- S8: 20 attempts for 52 studies -- impossible, every study needs at least one attempt

## Studies extracted this run (116)

| # | Year | Title | DOI / PMID | Journal | OA | Predatory |
|---:|---:|---|---|---|---|---|
| 1 | 2026 | Effectiveness of vitamin C and D supplementation as an adjunct in the management | [10.1186/s12889-026-27539-2](https://doi.org/10.1186/s12889-026-27539-2) | BMC public health | full_text | no |
| 2 | 2026 | Oral vitamin C supplementation in patients with clonal cytopenia of undetermined | [10.1002/cncr.70549](https://doi.org/10.1002/cncr.70549) | Cancer | full_text | no |
| 3 | 2026 | Ivermectin therapy is associated with changes in SARS-CoV-2 RNA load in asymptom | [10.1186/s13063-026-09736-x](https://doi.org/10.1186/s13063-026-09736-x) | Trials | full_text | no |
| 4 | 2026 | A Randomized, Double-Blind, Placebo-Controlled Trial of an Ayurvedic Herbal Form | [10.3390/medicina62050972](https://doi.org/10.3390/medicina62050972) | Medicina (Kaunas, Lithuania) | full_text | no |
| 5 | 2026 | Effect of vitamin C and hesperidin on serum uric acid concentrations in healthy  | [10.1007/s00394-026-03905-z](https://doi.org/10.1007/s00394-026-03905-z) | European journal of nutrition | full_text | no |
| 6 | 2025 | Effects of vitamins C and E supplementation combined with 12-week resistance tra | [10.1097/md.0000000000043976](https://doi.org/10.1097/md.0000000000043976) | Medicine | full_text | no |
| 7 | 2025 | Vitamin C supplementation to pregnant smokers alters asthma- and allergy-associa | [10.1186/s13148-025-01965-2](https://doi.org/10.1186/s13148-025-01965-2) | Clinical epigenetics | full_text | no |
| 8 | 2025 | Comparative Bioavailability of Vitamin C After Short-Term Consumption of Raw Fru | [10.3390/nu17213331](https://doi.org/10.3390/nu17213331) | Nutrients | full_text | no |
| 9 | 2025 | Anti-Inflammatory, Antithrombotic and Antioxidant Efficacy and Synergy of a High | [10.3390/nu17162643](https://doi.org/10.3390/nu17162643) | Nutrients | full_text | no |
| 10 | 2025 | Beneficial effects of pleuran on asthma control and respiratory tract-infection  | [10.1038/s41598-025-91830-2](https://doi.org/10.1038/s41598-025-91830-2) | Scientific reports | full_text | no |
| 11 | 2024 | The Administration of Resveratrol and Vitamin C Reduces Oxidative Stress in Post | [10.3390/nu16213775](https://doi.org/10.3390/nu16213775) | Nutrients | full_text | no |
| 12 | 2024 | Effect of vitamin C and hawthorn beverage formula on blood pressure and oxidativ | [10.6133/apjcn.202412_33(4).0005](https://doi.org/10.6133/apjcn.202412_33(4).0005) | Asia Pacific journal of clinical nutriti | full_text | no |
| 13 | 2024 | The Effects of Dietary Supplementation with Collagen and Vitamin C and Their Com | [10.3390/nu16121908](https://doi.org/10.3390/nu16121908) | Nutrients | full_text | no |
| 14 | 2024 | Vitamin C Supplementation Among Pregnant Smokers and Airway Function Trajectory  | [10.1001/jamapediatrics.2024.0430](https://doi.org/10.1001/jamapediatrics.2024.0430) | JAMA pediatrics | full_text | no |
| 15 | 2024 | Comparison of the Effectiveness of Platelet-Rich Plasma Versus Tranexamic Acid P | [10.1111/jocd.16548](https://doi.org/10.1111/jocd.16548) | Journal of cosmetic dermatology | full_text | no |
| 16 | 2023 | Effects of acute strawberry consumption on serum levels of vitamin C and folic a | [10.1017/jns.2022.117](https://doi.org/10.1017/jns.2022.117) | Journal of nutritional science | full_text | no |
| 17 | 2022 | Effects of Acute Vitamin C plus Vitamin E Supplementation on Exercise-Induced Mu | [10.3390/nu14214635](https://doi.org/10.3390/nu14214635) | Nutrients | full_text | no |
| 18 | 2022 | Effects of vitamin C supplementation on gout risk: results from the Physicians'  | [10.1093/ajcn/nqac140](https://doi.org/10.1093/ajcn/nqac140) | The American journal of clinical nutriti | full_text | no |
| 19 | 2022 | Vitamin C supplementation promotes mental vitality in healthy young adults: resu | [10.1007/s00394-021-02656-3](https://doi.org/10.1007/s00394-021-02656-3) | European journal of nutrition | full_text | no |
| 20 | 2022 | Effect of Vitamin C and Protein Supplementation on Plasma Nitrate and Nitrite Re | [10.3390/nu14091880](https://doi.org/10.3390/nu14091880) | Nutrients | full_text | no |
| 21 | 2021 | Kabasura Kudineer (KSK), a poly-herbal Siddha medicine, reduced SARS-CoV-2 viral | [10.1186/s13063-021-05583-0](https://doi.org/10.1186/s13063-021-05583-0) | Trials | full_text | no |
| 22 | 2021 | Effect of six weeks 1000 mg/day vitamin C supplementation and healthy training i | [10.1186/s12970-021-00416-6](https://doi.org/10.1186/s12970-021-00416-6) | Journal of the International Society of  | full_text | no |
| 23 | 2021 | The Effect of Combined Vitamin C and Vitamin E Supplementation on Oxidative Stre | [10.1155/2021/5529741](https://doi.org/10.1155/2021/5529741) | Pain research & management | full_text | no |
| 24 | 2020 | Antioxidant Activity with Increased Endogenous Levels of Vitamin C, E and A Foll | [10.3390/nu12113224](https://doi.org/10.3390/nu12113224) | Nutrients | full_text | no |
| 25 | 2020 | KiwiC for Vitality: Results of a Randomized Placebo-Controlled Trial Testing the | [10.3390/nu12092898](https://doi.org/10.3390/nu12092898) | Nutrients | full_text | no |
| 26 | 2020 | A short course of oral ranitidine as a novel treatment for toddler's diarrhea: a | [10.1186/s12887-020-02267-7](https://doi.org/10.1186/s12887-020-02267-7) | BMC pediatrics | full_text | no |
| 27 | 2019 | Effects of ascorbic acid supplementation on oxidative stress markers in healthy  | [10.1186/s12970-019-0269-8](https://doi.org/10.1186/s12970-019-0269-8) | Journal of the International Society of  | full_text | no |
| 28 | 2019 | Consumption of Nitrate-Rich Beetroot Juice with or without Vitamin C Supplementa | [10.3390/ijms20092277](https://doi.org/10.3390/ijms20092277) | International journal of molecular scien | full_text | no |
| 29 | 2019 | The effect of increased frequency of hemodialysis on vitamin C concentrations: a | [10.1186/s12882-019-1311-4](https://doi.org/10.1186/s12882-019-1311-4) | BMC nephrology | full_text | no |
| 30 | 2018 | Short-Term High-Dose Vitamin C and E Supplementation Attenuates Muscle Damage an | [10.7150/ijms.26340](https://doi.org/10.7150/ijms.26340) | International journal of medical science | full_text | no |
| 31 | 2017 | Effects of ingesting a pre-workout dietary supplement with and without synephrin | [10.1186/s12970-016-0158-3](https://doi.org/10.1186/s12970-016-0158-3) | Journal of the International Society of  | full_text | no |
| 32 | 2017 | Vitamin C Prevents Offspring DNA Methylation Changes Associated with Maternal Sm | [10.1164/rccm.201610-2141oc](https://doi.org/10.1164/rccm.201610-2141oc) | American journal of respiratory and crit | full_text | no |
| 33 | 2017 | Effect of vitamin A and vitamin C supplementation on oxidative stress in HIV and | [10.4314/ahs.v17i2.3](https://doi.org/10.4314/ahs.v17i2.3) | African health sciences | full_text | no |
| 34 | 2017 | Vitamin C-enriched gelatin supplementation before intermittent activity augments | [10.3945/ajcn.116.138594](https://doi.org/10.3945/ajcn.116.138594) | The American journal of clinical nutriti | full_text | no |
| 35 | 2015 | Effects of docosahexaenoic supplementation and in vitro vitamin C on the oxidati | [10.1155/2015/187849](https://doi.org/10.1155/2015/187849) | Oxidative medicine and cellular longevit | full_text | no |
| 36 | 2015 | Antioxidant vitamin C prevents decline in endothelial function during sitting. | [10.12659/msm.893192](https://doi.org/10.12659/msm.893192) | Medical science monitor : international  | full_text | no |
| 37 | 2014 | Vitamin C supplementation slightly improves physical activity levels and reduces | [10.3390/nu6072572](https://doi.org/10.3390/nu6072572) | Nutrients | full_text | no |
| 38 | 2014 | Vitamin E and C supplementation and risk of cancer in men: posttrial follow-up i | [10.3945/ajcn.114.085480](https://doi.org/10.3945/ajcn.114.085480) | The American journal of clinical nutriti | full_text | no |
| 39 | 2013 | Efficacy of vitamin C as an adjunct to fluoxetine therapy in pediatric major dep | [10.1186/1475-2891-12-31](https://doi.org/10.1186/1475-2891-12-31) | Nutrition journal | full_text | no |
| 40 | 2013 | A randomised cross-over pharmacokinetic bioavailability study of synthetic versu | [10.3390/nu5114451](https://doi.org/10.3390/nu5114451) | Nutrients | full_text | no |
| 41 | 2013 | Ozone exposure, vitamin C intake, and genetic susceptibility of asthmatic childr | [10.1186/1465-9921-14-14](https://doi.org/10.1186/1465-9921-14-14) | Respiratory research | full_text | no |
| 42 | 2012 | Brachial artery flow-mediated dilation following exercise with augmented oscilla | [10.1186/1476-7120-10-34](https://doi.org/10.1186/1476-7120-10-34) | Cardiovascular ultrasound | full_text | no |
| 43 | 2011 | Vitamin C supplementation lowers urinary levels of 4-hydroperoxy-2-nonenal metab | [10.1016/j.freeradbiomed.2011.01.004](https://doi.org/10.1016/j.freeradbiomed.2011.01.004) | Free radical biology & medicine | full_text | no |
| 44 | 2010 | Regular vitamin C supplementation during pregnancy reduces hospitalization: outc | [10.4314/pamj.v5i1.56178](https://doi.org/10.4314/pamj.v5i1.56178) | The Pan African medical journal | full_text | no |
| 45 | 2010 | Vitamin C and E supplementation to prevent spontaneous preterm birth: a randomiz | [10.1097/aog.0b013e3181ed721d](https://doi.org/10.1097/aog.0b013e3181ed721d) | Obstetrics and gynecology | full_text | no |
| 46 | 2010 | Complementary treatment with oral pidotimod plus vitamin C after laser vaporizat | [PMID 20945819](https://pubmed.ncbi.nlm.nih.gov/20945819/) | Journal of medicine and life | full_text | no |
| 47 | 2010 | Effects of high-dose B vitamin complex with vitamin C and minerals on subjective | [10.1007/s00213-010-1870-3](https://doi.org/10.1007/s00213-010-1870-3) | Psychopharmacology | full_text | no |
| 48 | 2009 | Combination treatment with high-dose vitamin C and alpha-tocopherol does not enh | [10.1080/08958370802161077](https://doi.org/10.1080/08958370802161077) | Inhalation toxicology | full_text | no |
| 49 | 2009 | Modification of the effect of vitamin E supplementation on the mortality of male | [10.1093/aje/kwn413](https://doi.org/10.1093/aje/kwn413) | American journal of epidemiology | full_text | no |
| 50 | 2009 | Effects of vitamins C and E and beta-carotene on the risk of type 2 diabetes in  | [10.3945/ajcn.2009.27491](https://doi.org/10.3945/ajcn.2009.27491) | The American journal of clinical nutriti | full_text | no |
| 51 | 2009 | Vitamins C and E and beta carotene supplementation and cancer risk: a randomized | [10.1093/jnci/djn438](https://doi.org/10.1093/jnci/djn438) | Journal of the National Cancer Institute | full_text | no |
| 52 | 2009 | Long-term garlic or micronutrient supplementation, but not anti-Helicobacter pyl | [10.3945/jn.108.091389](https://doi.org/10.3945/jn.108.091389) | The Journal of nutrition | full_text | no |
| 53 | 2000 | Effects of three-month oral supplementation of beta-carotene and vitamin C on se | [10.1111/j.1349-7006.2000.tb00968.x](https://doi.org/10.1111/j.1349-7006.2000.tb00968.x) | Japanese journal of cancer research : Ga | full_text | no |
| 54 | 1999 | Randomized double-blind trial of beta-carotene and vitamin C in women with minor | [10.1038/sj.bjc.6690231](https://doi.org/10.1038/sj.bjc.6690231) | British journal of cancer | full_text | no |
| 55 | 1998 | Dietary supplement with vitamin C prevents nitrate tolerance. | [10.1172/jci977](https://doi.org/10.1172/jci977) | The Journal of clinical investigation | full_text | no |
| 56 | 1997 | The effect of pharmacological supplementation with vitamin C on low-density lipo | [10.1046/j.1365-2125.1997.00623.x](https://doi.org/10.1046/j.1365-2125.1997.00623.x) | British journal of clinical pharmacology | full_text | no |
| 57 | 1996 | Effect of allopurinol, sulphasalazine, and vitamin C on aspirin induced gastrodu | [10.1136/gut.38.4.518](https://doi.org/10.1136/gut.38.4.518) | Gut | full_text | no |
| 58 | 1981 | Megadose vitamin C and metabolic effects of the pill. | [10.1136/bmj.283.6305.1547-a](https://doi.org/10.1136/bmj.283.6305.1547-a) | British medical journal (Clinical resear | full_text | no |
| 59 | 1975 | Vitamin C supplements and diabetic cutaneous capillary fragility. | [10.1136/bmj.3.5977.205](https://doi.org/10.1136/bmj.3.5977.205) | British medical journal | full_text | no |
| 60 | 2026 | Individual oxidative stress and inflammation responses to vitamin C supplementat | [10.1016/j.freeradbiomed.2026.03.073](https://doi.org/10.1016/j.freeradbiomed.2026.03.073) | Free radical biology & medicine | abstract_only | no |
| 61 | 2025 | Gut microbiota links vitamin C supplementation to enhanced mental vitality in he | [10.1016/j.bbi.2025.03.032](https://doi.org/10.1016/j.bbi.2025.03.032) | Brain, behavior, and immunity | abstract_only | no |
| 62 | 2023 | Effect of Vitamin C Supplementation for Pregnant Smokers on Offspring Airway Fun | [10.1001/jamapediatrics.2022.4401](https://doi.org/10.1001/jamapediatrics.2022.4401) | JAMA pediatrics | abstract_only | no |
| 63 | 2023 | Antioxidant vitamin supplementation on muscle adaptations to resistance training | [10.1016/j.nut.2022.111848](https://doi.org/10.1016/j.nut.2022.111848) | Nutrition (Burbank, Los Angeles County,  | abstract_only | no |
| 64 | 2022 | Vascular benefits of vitamin C supplementation against fine particulate air poll | [10.1016/j.ecoenv.2022.113735](https://doi.org/10.1016/j.ecoenv.2022.113735) | Ecotoxicology and environmental safety | abstract_only | no |
| 65 | 2022 | The efficacy and safety of vitamin C administration to women with history of pre | [10.47750/jptcp.2022.985](https://doi.org/10.47750/jptcp.2022.985) | Journal of population therapeutics and c | abstract_only | no |
| 66 | 2022 | Collagen and Vitamin C Supplementation Increases Lower Limb Rate of Force Develo | [10.1123/ijsnem.2020-0313](https://doi.org/10.1123/ijsnem.2020-0313) | International journal of sport nutrition | abstract_only | no |
| 67 | 2021 | Vitamin C supplementation improves blood pressure and oxidative stress after acu | [10.4103/cjp.cjp_95_20](https://doi.org/10.4103/cjp.cjp_95_20) | The Chinese journal of physiology | abstract_only | no |
| 68 | 2021 | Probiotics with vitamin C for the prevention of upper respiratory tract symptoms | [10.3920/bm2020.0185](https://doi.org/10.3920/bm2020.0185) | Beneficial microbes | abstract_only | no |
| 69 | 2021 | The effect of dietary nitrate and vitamin C on endothelial function, oxidative s | [10.1016/j.clnu.2020.10.012](https://doi.org/10.1016/j.clnu.2020.10.012) | Clinical nutrition (Edinburgh, Scotland) | abstract_only | no |
| 70 | 2020 | Effects of inorganic nitrate and vitamin C co-supplementation on blood pressure  | [10.1016/j.clnu.2019.03.006](https://doi.org/10.1016/j.clnu.2019.03.006) | Clinical nutrition (Edinburgh, Scotland) | abstract_only | no |
| 71 | 2020 | Oral vitamin C treatment increases polymorphonuclear cell functions in type 2 di | [10.1016/j.nutres.2020.05.010](https://doi.org/10.1016/j.nutres.2020.05.010) | Nutrition research (New York, N.Y.) | abstract_only | no |
| 72 | 2019 | Antioxidant vitamin supplementation prevents oxidative stress but does not enhan | [10.1016/j.nut.2019.01.007](https://doi.org/10.1016/j.nut.2019.01.007) | Nutrition (Burbank, Los Angeles County,  | abstract_only | no |
| 73 | 2019 | The acute influence of sucrose consumption with and without vitamin C co-ingesti | [10.1016/j.mvr.2019.103906](https://doi.org/10.1016/j.mvr.2019.103906) | Microvascular research | abstract_only | no |
| 74 | 2019 | Amniotic Membrane Transplantation in Acute Severe Ocular Chemical Injury: A Rand | [10.1016/j.ajo.2018.11.001](https://doi.org/10.1016/j.ajo.2018.11.001) | American journal of ophthalmology | abstract_only | no |
| 75 | 2018 | Effects of aerobic exercise and vitamin C supplementation on rhinitis symptoms i | [10.12932/ap-040417-0066](https://doi.org/10.12932/ap-040417-0066) | Asian Pacific journal of allergy and imm | abstract_only | no |
| 76 | 2018 | Differential influence of vitamin C on the peripheral and cerebral circulation a | [10.1152/ajpregu.00412.2017](https://doi.org/10.1152/ajpregu.00412.2017) | American journal of physiology. Regulato | abstract_only | no |
| 77 | 2018 | Effect of different periods of chronic heat stress with or without vitamin C sup | [10.1080/03079457.2017.1401212](https://doi.org/10.1080/03079457.2017.1401212) | Avian pathology : journal of the W.V.P.A | abstract_only | no |
| 78 | 2016 | Efficacy of Ascorbic Acid (Vitamin C) and/N-Acetylcysteine (NAC) Supplementation | [10.3177/jnsv.62.54](https://doi.org/10.3177/jnsv.62.54) | Journal of nutritional science and vitam | abstract_only | no |
| 79 | 2015 | Effects of Oral Vitamin C Supplementation on Anxiety in Students: A Double-Blind | [10.3923/pjbs.2015.11.18](https://doi.org/10.3923/pjbs.2015.11.18) | Pakistan journal of biological sciences  | abstract_only | YES |
| 80 | 2015 | Vitamin C and E supplementation prevents some of the cellular adaptations to end | [10.1016/j.freeradbiomed.2015.10.412](https://doi.org/10.1016/j.freeradbiomed.2015.10.412) | Free radical biology & medicine | abstract_only | no |
| 81 | 2014 | High-dose vitamin C supplementation increases skeletal muscle vitamin C concentr | [10.1016/j.freeradbiomed.2014.09.013](https://doi.org/10.1016/j.freeradbiomed.2014.09.013) | Free radical biology & medicine | abstract_only | no |
| 82 | 2014 | Vitamin C and E supplementation hampers cellular adaptation to endurance trainin | [10.1113/jphysiol.2013.267419](https://doi.org/10.1113/jphysiol.2013.267419) | The Journal of physiology | abstract_only | no |
| 83 | 2014 | Impact of oral vitamin C on histamine levels and seasickness. | [10.3233/ves-140509](https://doi.org/10.3233/ves-140509) | Journal of vestibular research : equilib | abstract_only | no |
| 84 | 2013 | Vitamin C supplementation in relation to inflammation in individuals with atroph | [10.1017/s0007114512002954](https://doi.org/10.1017/s0007114512002954) | The British journal of nutrition | abstract_only | no |
| 85 | 2013 | Effects of vitamin C and vitamin D administration on mood and distress in acutel | [10.3945/ajcn.112.056366](https://doi.org/10.3945/ajcn.112.056366) | The American journal of clinical nutriti | abstract_only | no |
| 86 | 2011 | Effect of vitamin C supplementation on postprandial oxidative stress and lipid p | [10.3923/pjbs.2011.900.904](https://doi.org/10.3923/pjbs.2011.900.904) | Pakistan journal of biological sciences  | abstract_only | YES |
| 87 | 2011 | Vitamin C restores blood pressure and vasodilator response during mental stress  | [10.1590/s0066-782x2011005000057](https://doi.org/10.1590/s0066-782x2011005000057) | Arquivos brasileiros de cardiologia | abstract_only | no |
| 88 | 2011 | Quercetin with vitamin C and niacin does not affect body mass or composition. | [10.1139/h11-015](https://doi.org/10.1139/h11-015) | Applied physiology, nutrition, and metab | abstract_only | no |
| 89 | 2011 | Effect of mixed flavonoids, n-3 fatty acids, and vitamin C on oxidative stress a | [10.1123/ijsnem.21.4.328](https://doi.org/10.1123/ijsnem.21.4.328) | International journal of sport nutrition | abstract_only | no |
| 90 | 2009 | In vivo vitamin C supplementation increases phosphoinositol transfer protein exp | [10.1017/s0007114508079646](https://doi.org/10.1017/s0007114508079646) | The British journal of nutrition | abstract_only | no |
| 91 | 2009 | Effects of hormone replacement therapy with vitamin C and E supplementation on p | [10.1016/j.biopha.2009.04.042](https://doi.org/10.1016/j.biopha.2009.04.042) | Biomedicine & pharmacotherapy = Biomedec | abstract_only | no |
| 92 | 2008 | Acute and chronic effects of vitamin C on endothelial fibrinolytic function in o | [10.1113/jphysiol.2008.151555](https://doi.org/10.1113/jphysiol.2008.151555) | The Journal of physiology | abstract_only | no |
| 93 | 2008 | Molecular detection of exercise-induced free radicals following ascorbate prophy | [10.1007/s00125-008-1101-1](https://doi.org/10.1007/s00125-008-1101-1) | Diabetologia | abstract_only | no |
| 94 | 2008 | Oral administration of vitamin C decreases muscle mitochondrial biogenesis and h | [10.1093/ajcn/87.1.142](https://doi.org/10.1093/ajcn/87.1.142) | The American journal of clinical nutriti | abstract_only | no |
| 95 | 2008 | Vitamin E supplementation may transiently increase tuberculosis risk in males wh | [10.1017/s0007114508923709](https://doi.org/10.1017/s0007114508923709) | The British journal of nutrition | abstract_only | no |
| 96 | 2008 | Relationship between iron status and dietary fruit and vegetables based on their | [10.1093/ajcn/87.5.1298](https://doi.org/10.1093/ajcn/87.5.1298) | The American journal of clinical nutriti | abstract_only | no |
| 97 | 2008 | Influence of lycopene and vitamin C from tomato juice on biomarkers of oxidative | [10.1017/s0007114507791894](https://doi.org/10.1017/s0007114507791894) | The British journal of nutrition | abstract_only | no |
| 98 | 2007 | Plasma vitamin C is inversely related to body mass index and waist circumference | [10.1093/jn/137.7.1757](https://doi.org/10.1093/jn/137.7.1757) | The Journal of nutrition | abstract_only | no |
| 99 | 2007 | Zinc supplementation prevents the increase of transaminase in chronic hepatitis  | [10.3177/jnsv.53.213](https://doi.org/10.3177/jnsv.53.213) | Journal of nutritional science and vitam | abstract_only | no |
| 100 | 2006 | Corticosteroid sparing effects of vitamin C and magnesium in asthma: a randomise | [10.1016/j.rmed.2005.03.038](https://doi.org/10.1016/j.rmed.2005.03.038) | Respiratory medicine | abstract_only | no |
| 101 | 2006 | Vitamin supplementation does not protect against symptoms in ozone-responsive su | [10.1016/j.freeradbiomed.2005.10.050](https://doi.org/10.1016/j.freeradbiomed.2005.10.050) | Free radical biology & medicine | abstract_only | no |
| 102 | 2005 | Vitamin C supplementation to prevent premature rupture of the chorioamniotic mem | [10.1093/ajcn/81.4.859](https://doi.org/10.1093/ajcn/81.4.859) | The American journal of clinical nutriti | abstract_only | no |
| 103 | 2005 | [Effect of vitamin C administration on gastric colonization by Helicobacter pylo | [10.1590/s0004-28032005000300008](https://doi.org/10.1590/s0004-28032005000300008) | Arquivos de gastroenterologia | abstract_only | no |
| 104 | 2004 | Does vitamin C supplementation influence the levels of circulating oxidized LDL, | [10.1038/sj.ejcn.1601990](https://doi.org/10.1038/sj.ejcn.1601990) | European journal of clinical nutrition | abstract_only | no |
| 105 | 2004 | Long-term vitamin C supplementation has no markedly favourable effect on serum l | [10.1079/bjn20031024](https://doi.org/10.1079/bjn20031024) | The British journal of nutrition | abstract_only | no |
| 106 | 2004 | Supplementation with cactus pear (Opuntia ficus-indica) fruit decreases oxidativ | [10.1093/ajcn/80.2.391](https://doi.org/10.1093/ajcn/80.2.391) | The American journal of clinical nutriti | abstract_only | no |
| 107 | 2003 | The effect of 5-year vitamin C supplementation on serum pepsinogen level and Hel | [10.1111/j.1349-7006.2003.tb01450.x](https://doi.org/10.1111/j.1349-7006.2003.tb01450.x) | Cancer science | abstract_only | no |
| 108 | 2003 | Effect of vitamin C supplements on antioxidant defence and stress proteins in hu | [10.1113/jphysiol.2003.040303](https://doi.org/10.1113/jphysiol.2003.040303) | The Journal of physiology | abstract_only | no |
| 109 | 2003 | Vitamin C affects thrombosis/ fibrinolysis system and reactive hyperemia in pati | [10.2337/diacare.26.10.2749](https://doi.org/10.2337/diacare.26.10.2749) | Diabetes care | abstract_only | no |
| 110 | 2002 | Influence of vitamin C supplementation on oxidative and immune changes after an  | [10.1152/japplphysiol.00961.2001](https://doi.org/10.1152/japplphysiol.00961.2001) | Journal of applied physiology (Bethesda, | abstract_only | no |
| 111 | 2002 | Effects of vitamin C and vitamin E on in vivo lipid peroxidation: results of a r | [10.1093/ajcn/76.3.549](https://doi.org/10.1093/ajcn/76.3.549) | The American journal of clinical nutriti | abstract_only | no |
| 112 | 2001 | Muscle soreness and damage parameters after prolonged intermittent shuttle-runni | [10.1055/s-2001-11358](https://doi.org/10.1055/s-2001-11358) | International journal of sports medicine | abstract_only | no |
| 113 | 2000 | Oral vitamin C and endothelial function in smokers: short-term improvement, but  | [10.1016/s0735-1097(00)00576-3](https://doi.org/10.1016/s0735-1097(00)00576-3) | Journal of the American College of Cardi | abstract_only | no |
| 114 | 2000 | Effect of supplementation with tomato juice, vitamin E, and vitamin C on LDL oxi | [10.2337/diacare.23.6.733](https://doi.org/10.2337/diacare.23.6.733) | Diabetes care | abstract_only | no |
| 115 | 2000 | Systemic vitamin C and vitamin E do not prevent photoprovocation test reactions  | [10.1034/j.1600-0781.2000.d01-2.x](https://doi.org/10.1034/j.1600-0781.2000.d01-2.x) | Photodermatology, photoimmunology & phot | abstract_only | no |
| 116 | 1998 | Randomized, double-blind, placebo-controlled study of the preventive effect of s | [10.1016/s0735-1097(98)00085-0](https://doi.org/10.1016/s0735-1097(98)00085-0) | Journal of the American College of Cardi | abstract_only | no |

## Evidence grades — this run (`evidence-v2`, status `shadow`)

Population: `general_adult` · registry checked: **yes**

| Outcome | Grade | Benefit | Certainty | k | SMD [95% CI] | I² | refused |
|---|---|---|---|--:|---|--:|--:|
| cold_duration | **I** | large | Very low | 1 | +0.96 [+0.18, +1.75] | — | 0 |
| cold_incidence | **I** | large | Very low | 1 | +1.01 [+0.01, +2.01] | — | 0 |
| energy_levels | **I** | possible | Very low | 1 | +0.56 [-0.03, +1.15] | — | 2 |
| exercise_endurance | **I** | inconclusive | Very low | 1 | +0.14 [-0.56, +0.83] | — | 3 |
| inflammation_crp | **I** | inconclusive | Very low | 1 | +0.20 [-0.44, +0.83] | — | 3 |
| lean_body_mass | **I** | inconclusive | Very low | 1 | +0.01 [-0.68, +0.70] | — | 4 |
| adverse_events_any | **I** | no data | Very low | 0 | — | — | 17 |
| anxiety | **I** | no data | Very low | 0 | — | — | 2 |
| attention_focus | **I** | no data | Very low | 0 | — | — | 1 |
| blood_pressure | **I** | no data | Very low | 0 | — | — | 5 |
| depressive_symptoms | **I** | no data | Very low | 0 | — | — | 3 |
| digestive_comfort | **I** | no data | Very low | 0 | — | — | 1 |
| glycaemic_control | **I** | no data | Very low | 0 | — | — | 2 |
| muscle_power | **I** | no data | Very low | 0 | — | — | 2 |
| muscle_soreness | **I** | no data | Very low | 0 | — | — | 1 |
| muscle_strength | **I** | no data | Very low | 0 | — | — | 2 |
| muscular_endurance | **I** | no data | Very low | 0 | — | — | 1 |
| perceived_stress | **I** | no data | Very low | 0 | — | — | 2 |

Why trials were refused (all outcomes):

- 29 × study: no_isolated_ingredient_arm
- 11 × study: off-target population
- 5 × figure: no figure caption names this measure
- 2 × study: no_ingredient_free_arm
- 2 × arms differ in more than the ingredient (co-interventions not matched)
- 1 × no outcome values in the text read (figure-only or not reported)
- 1 × figure: readers disagree on an error bar

## Notes

- Form, dose and population never weight a trial; they are GRADE indirectness.

- Predatory venues: flagged + counted, never weighted.

- This report is **this run only** — other ingredients are not mixed in.
