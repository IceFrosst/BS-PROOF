# BS-PROOF full audit report (claude-top5-per_o)

Generated: **2026-08-10 09:06 UTC**


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

- Targeted studies: **69**
- Succeeded (usable): **46**
- Skipped (no text): **23**
- Partial agent failures: **1**
- Prompt version: `v1.10`
- Concurrency: 40  |  studies in flight: 40

## Token + cost accounting

- Extraction backend: **Claude subscription** (`--safe-mode`, `--max-turns 1`, one shot per call)
- Model calls: **90** (cache hits 191, failures 11)
- Input tokens: **378,109** (fresh 22,585 · cache-write 156,790 · cache-read 198,734)
- Output tokens: **81,895**
- **Spent on this run: $0.00** — subscription, not metered.
- **API-equivalent cost: $2.016** — what the same work would cost billed per token.
- Per study: **2.0 calls**, **$0.0438** API-equivalent across 46 scored studies.

| Agent | Tier | Model | Calls | Cache hits | Fail | In | Out | API-equiv |
|---|---|---|--:|--:|--:|--:|--:|--:|
| S3 | B | `claude-sonnet-5` | 12 | 35 | 1 | 49,574 | 6,580 | $0.183 |
| S4 | B | `claude-sonnet-5` | 20 | 30 | 4 | 95,020 | 7,560 | $0.447 |
| S5 | B | `claude-sonnet-5` | 12 | 35 | 1 | 53,270 | 4,305 | $0.241 |
| S6B | C | `claude-sonnet-5` | 17 | 24 | 0 | 59,245 | 16,567 | $0.421 |
| S7 | B | `claude-sonnet-5` | 18 | 32 | 5 | 98,573 | 6,859 | $0.493 |
| S8 | A | `claude-haiku-4-5-20251001` | 11 | 35 | 0 | 22,427 | 40,024 | $0.232 |

Tier → model is pinned in `claude_adapter.TIER_MODEL` (full ids, never aliases: an alias floats to a new model while the cache key does not change). Tier A = classification, B = extraction, C = the highest-risk agent.

## Predatory journal check (flag only — not in score)

- List entries loaded: **1162**
- Studies checked: **1614**
- Publisher resolved for: **0/1614** (the list is PUBLISHERS, so this is the real coverage)
- Studies flagged predatory: **0**
- Distinct publishers flagged: **0**
- Distinct journals flagged: **0**
- Affects score: **NO (count only)**
- **NOT CHECKED at publisher level** — 0 flagged above is an absence of data, not a clean corpus.

## Systematic reviews / meta-analyses (S2)

- Requested (cap): **0**
- S2 extractions ok: **0**
- Resolved for multiplier: **0**
_SRs never add patients; only a capped confidence boost (≤ +30%)._

## Per-agent success rates (this run)

| Agent | Studies OK | Studies failed | Cache | Retries | Why it failed |
|---|---:|---:|---:|---:|---|
| S3 | 46 | 0 | 35 | 0 | — |
| S4 | 46 | 0 | 30 | 0 | — |
| S5 | 46 | 0 | 35 | 0 | — |
| S7 | 45 | 1 | 32 | 0 | exit 1: max_turns (x1) |
| S8 | 46 | 0 | 35 | 0 | — |

_One row per STUDY. The cost table above counts CLI ATTEMPTS, so its totals are higher by exactly the retries column._

**Telemetry does not reconcile — do not quote these rates:**
- S6B: 17 attempts in the cost table but no row in the success table -- its failures are invisible to anyone reading success rates
- S3: 12 attempts for 46 studies -- impossible, every study needs at least one attempt
- S4: 20 attempts for 46 studies -- impossible, every study needs at least one attempt
- S5: 12 attempts for 46 studies -- impossible, every study needs at least one attempt
- S7: 18 attempts for 46 studies -- impossible, every study needs at least one attempt
- S8: 11 attempts for 46 studies -- impossible, every study needs at least one attempt

## SPEED REPORT
_Not available._

## Studies extracted this run (69)

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
| 34 | 2023 | The role of resistance training and creatine supplementation on oxidative stress | [10.3389/fpubh.2023.1062832](https://doi.org/10.3389/fpubh.2023.1062832) | Frontiers in public health | full_text | no |
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
| 46 | 2026 | Examining the feasibility and preliminary effects of resistance exercise trainin | [10.1371/journal.pone.0353630](https://doi.org/10.1371/journal.pone.0353630) | PloS one | abstract_only | no |
| 47 | 2026 | Effects of high-load, velocity-intentional variable resistance training combined | [10.1016/j.exger.2026.113122](https://doi.org/10.1016/j.exger.2026.113122) | Experimental gerontology | abstract_only | no |
| 48 | 2026 | Feasibility, safety and tolerability of intradialytic creatine supplementation i | [10.1371/journal.pone.0354883](https://doi.org/10.1371/journal.pone.0354883) | PloS one | abstract_only | no |
| 49 | 2026 | Creatine supplementation modifies fat deposition in arm and leg tissues in indiv | [10.1016/j.nut.2026.113175](https://doi.org/10.1016/j.nut.2026.113175) | Nutrition (Burbank, Los Angeles County,  | abstract_only | no |
| 50 | 2026 | Beetroot juice or creatine: which yields greater short-term benefits for resista | [10.1080/09637486.2026.2625827](https://doi.org/10.1080/09637486.2026.2625827) | International journal of food sciences a | abstract_only | no |
| 51 | 2026 | Combined creatine and HMB co-supplementation improves functional strength indepe | [10.1007/s11357-025-01889-y](https://doi.org/10.1007/s11357-025-01889-y) | GeroScience | abstract_only | no |
| 52 | 2026 | The Effects of 8-Week Creatine Hydrochloride and Creatine Ethyl Ester Supplement | [10.1080/27697061.2025.2551184](https://doi.org/10.1080/27697061.2025.2551184) | Journal of the American Nutrition Associ | abstract_only | no |
| 53 | 2026 | Diet-Controlled Whey Protein Supplementation: Mitigating Serum Creatine Kinase L | [10.1080/27697061.2025.2548514](https://doi.org/10.1080/27697061.2025.2548514) | Journal of the American Nutrition Associ | abstract_only | no |
| 54 | 2025 | Effects of a Blend of Trisodium Citrate, Creatine Monohydrate, Leucine, and Blue | [10.1080/19390211.2025.2518408](https://doi.org/10.1080/19390211.2025.2518408) | Journal of dietary supplements | abstract_only | no |
| 55 | 2025 | Effects of Combined Versus Single Supplementation of Creatine, Beta-Alanine, and | [10.1123/ijspp.2024-0310](https://doi.org/10.1123/ijspp.2024-0310) | International journal of sports physiolo | abstract_only | no |
| 56 | 2025 | Creatine with guanidinoacetic acid improves prefrontal brain oxygenation before, | [10.1177/02601060241300236](https://doi.org/10.1177/02601060241300236) | Nutrition and health | abstract_only | no |
| 57 | 2025 | Efficacy and safety profile of oral creatine monohydrate in add-on to cognitive- | [10.1016/j.euroneuro.2024.10.004](https://doi.org/10.1016/j.euroneuro.2024.10.004) | European neuropsychopharmacology : the j | abstract_only | no |
| 58 | 2025 | Creatine supplementation does not add to resistance training effects in prostate | [10.1016/j.jsams.2024.09.002](https://doi.org/10.1016/j.jsams.2024.09.002) | Journal of science and medicine in sport | abstract_only | no |
| 59 | 2024 | Effects of acute creatine supplementation on cardiac and vascular responses in o | [10.1016/j.clnesp.2024.07.008](https://doi.org/10.1016/j.clnesp.2024.07.008) | Clinical nutrition ESPEN | abstract_only | no |
| 60 | 2024 | Short term creatine loading improves strength endurance even without changing ma | [10.1590/0001-3765202420230559](https://doi.org/10.1590/0001-3765202420230559) | Anais da Academia Brasileira de Ciencias | abstract_only | no |
| 61 | 2024 | Eight-Week Creatine-Glucose Supplementation Alleviates Clinical Features of Long | [10.3177/jnsv.70.174](https://doi.org/10.3177/jnsv.70.174) | Journal of nutritional science and vitam | abstract_only | no |
| 62 | 2024 | Creatine supplementation combined with breathing exercises reduces respiratory d | [10.4103/jpgm.jpgm_650_23](https://doi.org/10.4103/jpgm.jpgm_650_23) | Journal of postgraduate medicine | abstract_only | no |
| 63 | 2024 | Clinical Effect Analysis of Different Doses of Creatine Phosphate Sodium Combine | [10.1007/s00246-024-03450-8](https://doi.org/10.1007/s00246-024-03450-8) | Pediatric cardiology | abstract_only | no |
| 64 | 2023 | Creatine supplementation combined with blood flow restriction training enhances  | [10.1139/apnm-2022-0209](https://doi.org/10.1139/apnm-2022-0209) | Applied physiology, nutrition, and metab | abstract_only | no |
| 65 | 2023 | Does creatine supplementation affect recovery speed of impulse above critical to | [10.1080/17461391.2022.2159539](https://doi.org/10.1080/17461391.2022.2159539) | European journal of sport science | abstract_only | no |
| 66 | 2022 | Creatine Monohydrate Supplementation, but not Creatyl-L-Leucine, Increased Muscl | [10.1123/ijsnem.2022-0074](https://doi.org/10.1123/ijsnem.2022-0074) | International journal of sport nutrition | abstract_only | no |
| 67 | 2022 | Effects of Creatine and Caffeine Supplementation During Resistance Training on B | [10.1080/19390211.2021.1904085](https://doi.org/10.1080/19390211.2021.1904085) | Journal of dietary supplements | abstract_only | no |
| 68 | 2021 | Timing of creatine supplementation does not influence gains in unilateral muscle | [10.23736/s0022-4707.20.11668-2](https://doi.org/10.23736/s0022-4707.20.11668-2) | The Journal of sports medicine and physi | abstract_only | no |
| 69 | 2021 | Guanidinoacetate-Creatine Supplementation Improves Functional Performance and Mu | [10.1159/000518499](https://doi.org/10.1159/000518499) | Annals of nutrition & metabolism | abstract_only | no |

## ECU scores — this run only

| Outcome | 0–100 | Verdict | effect | in your form | at your dose | evidence | n |
|---|---:|---|---|---|---|---|---:|
| muscle_power | 5 | does not work | -0.29 @ 100% | -0.34 @ 86% | not tested | 22% | 7 |
| muscle_strength | 4 | barely studied | -0.12 @ 100% | -0.11 @ 80% | not tested | 14% | 4 |
| energy_levels | 0 | barely studied | -0.70 @ 100% | -0.70 @ 100% | not tested | 2% | 1 |
| lean_body_mass | 0 | barely studied | -0.70 @ 100% | -0.70 @ 77% | not tested | 4% | 2 |
| exercise_endurance | 0 | barely studied | -0.70 @ 100% | -0.70 @ 100% | not tested | 2% | 1 |

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
