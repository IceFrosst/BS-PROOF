# BS-PROOF full audit report (claude-top5-broad)

Generated: **2026-08-19 06:52 UTC**


scoring_model: v12-dose-closeness

Ingredient: `creatine` · Form: `creatine_monohydrate` · Mode: **claude-top5-broad**

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

- Targeted studies: **71**
- Succeeded (usable): **71**
- Skipped (no text): **0**
- Partial agent failures: **7**
- Prompt version: `v1.21`
- Concurrency: 40  |  studies in flight: 40

## Token + cost accounting

- Extraction backend: **Claude subscription** (`--safe-mode`, `--max-turns 1`, one shot per call)
- Model calls: **106** (cache hits 369, failures 62)
- Input tokens: **unavailable** (not recorded for every call)
- Output tokens: **unavailable** (not recorded for every call)
- **Spent on this run: $0.00** — subscription, not metered.
- **API-equivalent cost: unavailable** — what the same work would cost billed per token.
- Per study: **1.5 calls**, **unavailable** API-equivalent across 71 scored studies.

| Agent | Tier | Model | Calls | Cache hits | Fail | In | Out | API-equiv |
|---|---|---|--:|--:|--:|--:|--:|--:|
| S3 | B | `claude-sonnet-5` | 30 | 59 | 23 | unavailable | unavailable | unavailable |
| S4 | B | `claude-sonnet-5` | 16 | 64 | 10 | 24,451 | 2,184 | $0.125 |
| S5 | B | `claude-sonnet-5` | 24 | 62 | 16 | 1,601,140 | 5,606 | $9.736 |
| S6B | C | `claude-sonnet-5` | 24 | 49 | 8 | unavailable | unavailable | unavailable |
| S7 | B | `claude-sonnet-5` | 5 | 68 | 2 | 16,011 | 1,096 | $0.081 |
| S8 | A | `claude-haiku-4-5-20251001` | 7 | 67 | 3 | 14,498 | 8,315 | $0.072 |

Tier → model is pinned in `claude_adapter.TIER_MODEL` (full ids, never aliases: an alias floats to a new model while the cache key does not change). Tier A = classification, B = extraction, C = the highest-risk agent.

## Predatory journal check (flag only — not in score)

- List entries loaded: **1162**
- Studies checked: **595**
- Publisher resolved for: **398/595** (the list is PUBLISHERS, so this is the real coverage)
- Studies flagged predatory: **6**
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
| S3 | 66 | 5 | 59 | 0 | exit 1: max_turns (x4); exit 1: budget_exhausted (x1) |
| S4 | 70 | 1 | 64 | 0 | exit 1: Failed to authenticate. API Error: 401 OAuth access token has expired. Re-authenti (x1) |
| S5 | 70 | 1 | 62 | 0 | exit 1: max_turns (x1) |
| S7 | 71 | 0 | 68 | 0 | — |
| S8 | 71 | 0 | 67 | 0 | — |

_One row per STUDY. The cost table above counts CLI ATTEMPTS, so its totals are higher by exactly the retries column._

**Telemetry does not reconcile — do not quote these rates:**
- S6B: 24 attempts in the cost table but no row in the success table -- its failures are invisible to anyone reading success rates
- S3: 30 attempts for 71 studies -- impossible, every study needs at least one attempt
- S4: 16 attempts for 71 studies -- impossible, every study needs at least one attempt
- S5: 24 attempts for 71 studies -- impossible, every study needs at least one attempt
- S7: 5 attempts for 71 studies -- impossible, every study needs at least one attempt
- S8: 7 attempts for 71 studies -- impossible, every study needs at least one attempt

## SPEED REPORT
_Not available._

## Studies extracted this run (71)

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
| 35 | 2023 | The role of resistance training and creatine supplementation on oxidative stress | [10.3389/fpubh.2023.1062832](https://doi.org/10.3389/fpubh.2023.1062832) | Frontiers in public health | full_text | no |
| 36 | 2023 | The effects of creatine supplementation on cognitive performance-a randomised co | [10.1186/s12916-023-03146-5](https://doi.org/10.1186/s12916-023-03146-5) | BMC medicine | full_text | no |
| 37 | 2023 | The Effect of Acute Pre-Workout Supplement Ingestion on Basketball-Specific Perf | [10.3390/nu15102304](https://doi.org/10.3390/nu15102304) | Nutrients | full_text | no |
| 38 | 2023 | A randomized controlled pilot trial to assess the effectiveness of a specially f | [10.1186/s12905-023-02476-z](https://doi.org/10.1186/s12905-023-02476-z) | BMC women's health | full_text | no |
| 39 | 2023 | Comparing D3-Creatine Dilution and Dual-Energy X-ray Absorptiometry Muscle Mass  | [10.1093/gerona/glad047](https://doi.org/10.1093/gerona/glad047) | The journals of gerontology. Series A, B | full_text | no |
| 40 | 2023 | A Randomized Controlled Trial of Changes in Fluid Distribution across Menstrual  | [10.3390/nu15020429](https://doi.org/10.3390/nu15020429) | Nutrients | full_text | no |
| 41 | 2023 | Application of the D&lt;sub&gt;3&lt;/sub&gt; -creatine muscle mass assessment to | [10.1002/jcsm.13322](https://doi.org/10.1002/jcsm.13322) | Journal of cachexia, sarcopenia and musc | full_text | no |
| 42 | 2023 | A 2-yr Randomized Controlled Trial on Creatine Supplementation during Exercise f | [10.1249/mss.0000000000003202](https://doi.org/10.1249/mss.0000000000003202) | Medicine and science in sports and exerc | full_text | no |
| 43 | 2026 | Feasibility, safety and tolerability of intradialytic creatine supplementation i | [10.1371/journal.pone.0354883](https://doi.org/10.1371/journal.pone.0354883) | PloS one | abstract_only | no |
| 44 | 2026 | Effects of creatine supplementation with and without exercise and diet intervent | [10.1080/15502783.2026.2716273](https://doi.org/10.1080/15502783.2026.2716273) | Journal of the International Society of  | abstract_only | no |
| 45 | 2026 | Examining the feasibility and preliminary effects of resistance exercise trainin | [10.1371/journal.pone.0353630](https://doi.org/10.1371/journal.pone.0353630) | PloS one | abstract_only | no |
| 46 | 2026 | Protein Supplementation for Hip Fracture Recovery in Elderly Patients: A Randomi | [10.1097/bot.0000000000003158](https://doi.org/10.1097/bot.0000000000003158) | Journal of orthopaedic trauma | abstract_only | no |
| 47 | 2026 | Effects of high-load, velocity-intentional variable resistance training combined | [10.1016/j.exger.2026.113122](https://doi.org/10.1016/j.exger.2026.113122) | Experimental gerontology | abstract_only | no |
| 48 | 2026 | The impact of fitness and supplement TikTok content on body, nutrition and fitne | [10.1016/j.bodyim.2026.102082](https://doi.org/10.1016/j.bodyim.2026.102082) | Body image | abstract_only | no |
| 49 | 2026 | Creatine supplementation modifies fat deposition in arm and leg tissues in indiv | [10.1016/j.nut.2026.113175](https://doi.org/10.1016/j.nut.2026.113175) | Nutrition (Burbank, Los Angeles County,  | abstract_only | no |
| 50 | 2026 | Beetroot juice or creatine: which yields greater short-term benefits for resista | [10.1080/09637486.2026.2625827](https://doi.org/10.1080/09637486.2026.2625827) | International journal of food sciences a | abstract_only | no |
| 51 | 2026 | Independent effects of whey protein and alkali supplementation on muscle health  | [10.1016/j.ajcnut.2026.101257](https://doi.org/10.1016/j.ajcnut.2026.101257) | The American journal of clinical nutriti | abstract_only | no |
| 52 | 2026 | Combined creatine and HMB co-supplementation improves functional strength indepe | [10.1007/s11357-025-01889-y](https://doi.org/10.1007/s11357-025-01889-y) | GeroScience | abstract_only | no |
| 53 | 2026 | The Effects of 8-Week Creatine Hydrochloride and Creatine Ethyl Ester Supplement | [10.1080/27697061.2025.2551184](https://doi.org/10.1080/27697061.2025.2551184) | Journal of the American Nutrition Associ | abstract_only | no |
| 54 | 2025 | Effects of a Blend of Trisodium Citrate, Creatine Monohydrate, Leucine, and Blue | [10.1080/19390211.2025.2518408](https://doi.org/10.1080/19390211.2025.2518408) | Journal of dietary supplements | abstract_only | no |
| 55 | 2025 | Lowering plasma S-Adenosylhomocysteine (SAH) in healthy adults with elevated SAH | [10.1016/j.numecd.2025.104221](https://doi.org/10.1016/j.numecd.2025.104221) | Nutrition, metabolism, and cardiovascula | abstract_only | no |
| 56 | 2025 | Effect of a Multi-Ingredient Post-Workout Dietary Supplement on Body Composition | [10.1080/19390211.2025.2488811](https://doi.org/10.1080/19390211.2025.2488811) | Journal of dietary supplements | abstract_only | no |
| 57 | 2025 | Effects of Combined Versus Single Supplementation of Creatine, Beta-Alanine, and | [10.1123/ijspp.2024-0310](https://doi.org/10.1123/ijspp.2024-0310) | International journal of sports physiolo | abstract_only | no |
| 58 | 2025 | Creatine with guanidinoacetic acid improves prefrontal brain oxygenation before, | [10.1177/02601060241300236](https://doi.org/10.1177/02601060241300236) | Nutrition and health | abstract_only | no |
| 59 | 2025 | Creatine supplementation does not add to resistance training effects in prostate | [10.1016/j.jsams.2024.09.002](https://doi.org/10.1016/j.jsams.2024.09.002) | Journal of science and medicine in sport | abstract_only | no |
| 60 | 2025 | Efficacy and safety profile of oral creatine monohydrate in add-on to cognitive- | [10.1016/j.euroneuro.2024.10.004](https://doi.org/10.1016/j.euroneuro.2024.10.004) | European neuropsychopharmacology : the j | abstract_only | no |
| 61 | 2024 | The Effect of Multi-Ingredient Protein versus Collagen Supplementation on Satell | [10.1249/mss.0000000000003505](https://doi.org/10.1249/mss.0000000000003505) | Medicine and science in sports and exerc | abstract_only | no |
| 62 | 2024 | Effects of acute creatine supplementation on cardiac and vascular responses in o | [10.1016/j.clnesp.2024.07.008](https://doi.org/10.1016/j.clnesp.2024.07.008) | Clinical nutrition ESPEN | abstract_only | no |
| 63 | 2024 | The effects of 3-month supplementation with synbiotic on patient-reported outcom | [10.1007/s00394-024-03546-0](https://doi.org/10.1007/s00394-024-03546-0) | European journal of nutrition | abstract_only | no |
| 64 | 2024 | Short term creatine loading improves strength endurance even without changing ma | [10.1590/0001-3765202420230559](https://doi.org/10.1590/0001-3765202420230559) | Anais da Academia Brasileira de Ciencias | abstract_only | no |
| 65 | 2024 | Eight-Week Creatine-Glucose Supplementation Alleviates Clinical Features of Long | [10.3177/jnsv.70.174](https://doi.org/10.3177/jnsv.70.174) | Journal of nutritional science and vitam | abstract_only | no |
| 66 | 2024 | Clinical Effect Analysis of Different Doses of Creatine Phosphate Sodium Combine | [10.1007/s00246-024-03450-8](https://doi.org/10.1007/s00246-024-03450-8) | Pediatric cardiology | abstract_only | no |
| 67 | 2024 | Application of the Win Ratio Method in the ENGAGE AF-TIMI 48 Trial Comparing Edo | [10.1161/circoutcomes.123.010561](https://doi.org/10.1161/circoutcomes.123.010561) | Circulation. Cardiovascular quality and  | abstract_only | no |
| 68 | 2023 | Creatine supplementation combined with blood flow restriction training enhances  | [10.1139/apnm-2022-0209](https://doi.org/10.1139/apnm-2022-0209) | Applied physiology, nutrition, and metab | abstract_only | no |
| 69 | 2023 | Does creatine supplementation affect recovery speed of impulse above critical to | [10.1080/17461391.2022.2159539](https://doi.org/10.1080/17461391.2022.2159539) | European journal of sport science | abstract_only | no |
| 70 | 2023 | Effect of Sodium Bicarbonate Supplementation on Muscle Performance and Muscle Da | [10.1080/19390211.2022.2090478](https://doi.org/10.1080/19390211.2022.2090478) | Journal of dietary supplements | abstract_only | no |
| 71 | 2022 | Creatine Monohydrate Supplementation, but not Creatyl-L-Leucine, Increased Muscl | [10.1123/ijsnem.2022-0074](https://doi.org/10.1123/ijsnem.2022-0074) | International journal of sport nutrition | abstract_only | no |

## ECU scores — this run only

| Outcome | 0–100 | Verdict | effect | in your form | at your dose | evidence | n |
|---|---:|---|---|---|---|---|---:|
| muscle_power | 35 | probably does not work | +0.02 @ 100% | 0.80 (pooled +0.26 @ 61%) | not tested | 77% | 7 |
| lean_body_mass | 25 | probably does not work | -0.04 @ 100% | 0.80 (pooled +0.00 @ 64%) | not tested | 56% | 6 |
| muscle_strength | 22 | does not work | -0.10 @ 100% | 0.80 (pooled -0.14 @ 73%) | not tested | 51% | 6 |
| energy_levels | 17 | works, but not tested for your product | +0.38 @ 100% | 0.80 (pooled +0.30 @ 72%) | not tested | 33% | 2 |
| exercise_endurance | 14 | works, but not tested for your product | +0.51 @ 100% | 0.80 (pooled +0.51 @ 100%) | not tested | 25% | 2 |

_0–100 = 100 × c × mean(effect, form, dose). Each arc shows its verdict and the share of evidence behind it. A low number with a FULL evidence arc means 'does not work'; with an EMPTY one it means 'barely studied'._


_Old rows from previous runs are not shown here._

## Which studies made each number

### muscle_power — signed +2

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:103390nu15163567` | +10.17 | 0.3089 | 1.0 | 4 | exact |
| `doi:101038s4159802644278x` | +5.27 | 0.5334 | 0.3 | 4 | exact |
| `doi:103390nu16152437` | -5.00 | 0.4341 | -0.35 | 4 | unspecified |
| `doi:103390nu16091324` | -4.00 | 0.3473 | -0.35 | 4 | exact |
| `registry:nct04048616` | -3.04 | 0.264 | -0.35 | 4 | unspecified |
| `doi:103390nu16060766` | -1.69 | 0.147 | -0.35 | 4 | different |
| `doi:101111sms14629` | +0.00 | 0.1553 | 0.0 | 4 | exact |
| **sum of all 7** | **+1.71** | | | | |

### lean_body_mass — signed -2

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `registry:nct04048616` | -4.15 | 0.264 | -0.35 | 4 | unspecified |
| `doi:1033549physiolres935323` | +2.16 | 0.1602 | 0.3 | 4 | different |
| `registry:isrctn83081058` | +1.38 | 0.1025 | 0.3 | 4 | exact |
| `doi:1010801939021120252518408` | -1.25 | 0.0796 | -0.35 | 4 | exact |
| `doi:101016jjsams202409002` | -0.35 | 0.022 | -0.35 | 4 | unspecified |
| `doi:101249mss0000000000003202` | +0.00 | 0.6 | 0.0 | 4 | exact |
| **sum of all 6** | **-2.21** | | | | |

### muscle_strength — signed -5

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:101249mss0000000000003202` | -5.40 | 0.6 | -0.19148936170212766 | 4 | exact |
| `doi:1033549physiolres935323` | +2.26 | 0.1602 | 0.3 | 4 | different |
| `doi:103390nu16162772` | -1.76 | 0.1074 | -0.35 | 4 | unspecified |
| `registry:isrctn83081058` | +1.44 | 0.1025 | 0.3 | 4 | exact |
| `doi:1010801939021120252518408` | -1.31 | 0.0796 | -0.35 | 4 | exact |
| `doi:101016jjsams202409002` | -0.36 | 0.022 | -0.35 | 4 | unspecified |
| **sum of all 6** | **-5.13** | | | | |

### energy_levels — signed +12

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:103390nu17111772` | +7.10 | 0.4326 | 0.3 | 4 | exact |
| `doi:103390nu18081192` | +5.25 | 0.1645 | 0.5833333333333334 | 4 | unspecified |
| **sum of all 2** | **+12.35** | | | | |

### exercise_endurance — signed +11

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:103390nu17243831` | +14.14 | 0.2751 | 1.0 | 4 | exact |
| `doi:101111sms14629` | -2.79 | 0.1553 | -0.35 | 4 | exact |
| **sum of all 2** | **+11.35** | | | | |

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
