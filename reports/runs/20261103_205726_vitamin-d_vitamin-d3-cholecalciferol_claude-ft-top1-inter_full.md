# BS-PROOF full audit report (claude-ft-top1-inter)

Generated: **2026-11-03 20:57 UTC**


scoring_model: evidence-v2

Ingredient: `vitamin_d` · Form: `vitamin_d3_cholecalciferol` · Mode: **claude-ft-top1-inter**

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

- Outcome screen (`--outcome muscle_strength`): **71** studies name it in title or abstract; 553 dropped (3 had no abstract). A trial that measured it without naming it is missed; see the benchmark coverage.
- Targeted studies: **71**
- Succeeded (usable): **34**
- Skipped (no text): **37**
- Partial agent failures: **1**
- Prompt version: `v1.39`
- Concurrency: 40  |  studies in flight: 40

## Token + cost accounting

- Extraction backend: **Claude subscription** (`--safe-mode`, `--max-turns 1`, one shot per call)
- Model calls: **224** (cache hits 25, failures 8)
- Input tokens: **2,746,562** (fresh 71,551 · cache-write 1,741,448 · cache-read 933,563)
- Output tokens: **290,665**
- **Spent on this run: $0.00** — subscription, not metered.
- **API-equivalent cost: $11.401** — what the same work would cost billed per token.
- Per study: **6.6 calls**, **$0.3353** API-equivalent across 34 scored studies.

| Agent | Tier | Model | Calls | Cache hits | Fail | In | Out | API-equiv |
|---|---|---|--:|--:|--:|--:|--:|--:|
| S3 | B | `claude-sonnet-5` | 32 | 3 | 1 | 466,213 | 27,058 | $1.549 |
| S4 | B | `claude-sonnet-5` | 31 | 4 | 1 | 406,458 | 19,240 | $1.426 |
| S4R | R | `claude-opus-5` | 5 | 1 | 0 | 71,696 | 6,323 | $0.725 |
| S5 | B | `claude-sonnet-5` | 36 | 3 | 6 | 592,879 | 91,202 | $2.434 |
| S5N | B | `claude-sonnet-5` | 19 | 3 | 0 | 362,978 | 26,928 | $1.216 |
| S5R | R | `claude-opus-5` | 11 | 1 | 0 | 210,262 | 15,060 | $1.866 |
| S6B | C | `claude-sonnet-5` | 29 | 3 | 0 | 160,794 | 36,189 | $0.631 |
| S7 | B | `claude-sonnet-5` | 31 | 3 | 0 | 385,831 | 19,091 | $1.198 |
| S8 | A | `claude-haiku-4-5-20251001` | 30 | 4 | 0 | 89,451 | 49,574 | $0.356 |

Tier → model is pinned in `claude_adapter.TIER_MODEL` (full ids, never aliases: an alias floats to a new model while the cache key does not change). Tier A = classification, B = extraction, C = the highest-risk agent.

## Predatory journal check (flag only — not in score)

- List entries loaded: **1162**
- Studies checked: **3162**
- Publisher resolved for: **2348/3162** (the list is PUBLISHERS, so this is the real coverage)
- Studies flagged predatory: **21**
- Distinct publishers flagged: **5**
- Distinct journals flagged: **0**
- Affects score: **NO (count only)**
  - [publisher] AME Publishing Company
  - [publisher] Baishideng Publishing Group Inc.
  - [publisher] Canadian Center of Science and Education
  - [publisher] Frontiers Media SA
  - [publisher] Science Alert

## Per-agent success rates (this run)

| Agent | Studies OK | Studies failed | Cache | Retries | Why it failed |
|---|---:|---:|---:|---:|---|
| S3 | 34 | 0 | 3 | 0 | — |
| S4 | 34 | 0 | 4 | 0 | — |
| S4R | 6 | 0 | 1 | 0 | — |
| S5 | 33 | 1 | 3 | 2 | exit 1: max_turns (x1) |
| S5N | 21 | 0 | 2 | 0 | — |
| S5R | 12 | 0 | 1 | 0 | — |
| S6B | 32 | 0 | 3 | 0 | — |
| S7 | 34 | 0 | 3 | 0 | — |
| S8 | 34 | 0 | 4 | 0 | — |

_One row per STUDY. The cost table above counts CLI ATTEMPTS, so its totals are higher by exactly the retries column._

**Telemetry does not reconcile — do not quote these rates:**
- S3: 32 attempts for 34 studies -- impossible, every study needs at least one attempt
- S4: 31 attempts for 34 studies -- impossible, every study needs at least one attempt
- S4R: 5 attempts for 6 studies -- impossible, every study needs at least one attempt
- S5N: 19 attempts for 21 studies -- impossible, every study needs at least one attempt
- S5R: 11 attempts for 12 studies -- impossible, every study needs at least one attempt
- S6B: 29 attempts for 32 studies -- impossible, every study needs at least one attempt
- S7: 31 attempts for 34 studies -- impossible, every study needs at least one attempt
- S8: 30 attempts for 34 studies -- impossible, every study needs at least one attempt

## Studies extracted this run (71)

| # | Year | Title | DOI / PMID | Journal | OA | Predatory |
|---:|---:|---|---|---|---|---|
| 1 | 2026 | Effects of a nutritional supplement containing fish protein, vitamin D, and ω3 f | [10.1007/s00394-026-03983-z](https://doi.org/10.1007/s00394-026-03983-z) | European journal of nutrition | full_text | no |
| 2 | 2026 | The Effect of Vitamin D3 Supplementation on Vitamin D Status and Associated Heal | [10.1016/j.tjnut.2026.101493](https://doi.org/10.1016/j.tjnut.2026.101493) | The Journal of nutrition | full_text | no |
| 3 | 2026 | Eight-Week Vitamin D&lt;sub&gt;3&lt;/sub&gt; Supplementation at 4000 IU/Day Was  | [10.3390/nu18152460](https://doi.org/10.3390/nu18152460) | Nutrients | full_text | no |
| 4 | 2025 | Effects of Resistance Training Combined with Vitamin D Supplementation on Health | [10.3390/ijerph22111695](https://doi.org/10.3390/ijerph22111695) | International journal of environmental r | full_text | no |
| 5 | 2025 | Efficacy of Vitamin D3 Supplementation in Elevating Circulating 25(OH)D Concentr | [10.46292/sci24-00077](https://doi.org/10.46292/sci24-00077) | Topics in spinal cord injury rehabilitat | full_text | no |
| 6 | 2025 | Effects of vitamin D3, omega-3 fatty acids and a simple home exercise program on | [10.1016/j.jnha.2025.100528](https://doi.org/10.1016/j.jnha.2025.100528) | The journal of nutrition, health & aging | full_text | no |
| 7 | 2024 | Effects of Oral Nutritional Supplement with β-Hydroxy-β-methylbutyrate (HMB) on  | [10.3390/nu16152495](https://doi.org/10.3390/nu16152495) | Nutrients | full_text | no |
| 8 | 2024 | Effects of Supplemental Vitamin D3, Omega-3 Fatty Acids on Physical Performance  | [10.1210/clinem/dgae150](https://doi.org/10.1210/clinem/dgae150) | The Journal of clinical endocrinology an | full_text | no |
| 9 | 2024 | Associations between folate intake and knee pain, inflammation mediators and com | [10.1186/s12891-024-08095-5](https://doi.org/10.1186/s12891-024-08095-5) | BMC musculoskeletal disorders | full_text | no |
| 10 | 2024 | Effects of High Dose Bolus Cholecalciferol on Free Vitamin D Metabolites, Bone T | [10.3390/nu16172888](https://doi.org/10.3390/nu16172888) | Nutrients | full_text | no |
| 11 | 2024 | Beneficial effects of exercise, testosterone, vitamin D, calcium and protein in  | [10.1002/jcsm.13498](https://doi.org/10.1002/jcsm.13498) | Journal of cachexia, sarcopenia and musc | full_text | no |
| 12 | 2024 | Effects of vitamin D, omega-3 and a simple strength exercise programme in cardio | [10.1016/j.jnha.2024.100037](https://doi.org/10.1016/j.jnha.2024.100037) | The journal of nutrition, health & aging | full_text | no |
| 13 | 2023 | Effect of vitamin D<sub>3</sub> supplementation in winter on physical performanc | [10.1080/15502783.2023.2258850](https://doi.org/10.1080/15502783.2023.2258850) | Journal of the International Society of  | full_text | no |
| 14 | 2022 | Vitamin D supplementation and body composition changes in collegiate basketball  | [10.1080/15502783.2022.2046444](https://doi.org/10.1080/15502783.2022.2046444) | Journal of the International Society of  | full_text | no |
| 15 | 2022 | Elastic resistance training is more effective than vitamin D3 supplementation in | [10.1038/s41430-021-01000-6](https://doi.org/10.1038/s41430-021-01000-6) | European journal of clinical nutrition | full_text | no |
| 16 | 2022 | Vitamin D supplementation in chronic obstructive pulmonary disease patients with | [10.1093/ajcn/nqac083](https://doi.org/10.1093/ajcn/nqac083) | The American journal of clinical nutriti | full_text | no |
| 17 | 2022 | Vitamin D supplementation and increased dairy protein intake do not affect muscl | [10.1007/s00394-022-02912-0](https://doi.org/10.1007/s00394-022-02912-0) | European journal of nutrition | full_text | no |
| 18 | 2021 | Effect of Vitamin D Supplementation on Skeletal Muscle Volume and Strength in Pa | [10.3390/nu13061874](https://doi.org/10.3390/nu13061874) | Nutrients | full_text | no |
| 19 | 2021 | The Association of Prenatal Vitamin D Sufficiency With Aeroallergen Sensitizatio | [10.1016/j.jaip.2021.06.009](https://doi.org/10.1016/j.jaip.2021.06.009) | The journal of allergy and clinical immu | full_text | no |
| 20 | 2021 | The Multi-Ethnic Study of Atherosclerosis individual response to vitamin D trial | [10.1016/j.cct.2021.106318](https://doi.org/10.1016/j.cct.2021.106318) | Contemporary clinical trials | full_text | no |
| 21 | 2021 | Effects of Different Vitamin D Supplementation Schemes in Post-Menopausal Women: | [10.3390/nu13020380](https://doi.org/10.3390/nu13020380) | Nutrients | full_text | no |
| 22 | 2021 | The effect of vitamin D and magnesium supplementation on the mental health statu | [10.1186/s12887-021-02631-1](https://doi.org/10.1186/s12887-021-02631-1) | BMC pediatrics | full_text | no |
| 23 | 2020 | Vitamin D Supplementation Improves Health-Related Quality of Life and Physical P | [10.1016/j.pedhc.2020.04.007](https://doi.org/10.1016/j.pedhc.2020.04.007) | Journal of pediatric health care : offic | full_text | no |
| 24 | 2020 | Effect of vitamin D on bone strength in older African Americans: a randomized co | [10.1007/s00198-019-05275-1](https://doi.org/10.1007/s00198-019-05275-1) | Osteoporosis international : a journal e | full_text | no |
| 25 | 2019 | Effects of 12 Weeks of Essential Amino Acids (EAA)-Based Multi-Ingredient Nutrit | [10.1007/s12603-019-1163-4](https://doi.org/10.1007/s12603-019-1163-4) | The journal of nutrition, health & aging | full_text | no |
| 26 | 2019 | Protein supplementation improves lean body mass in physically active older adult | [10.1002/jcsm.12394](https://doi.org/10.1002/jcsm.12394) | Journal of cachexia, sarcopenia and musc | full_text | no |
| 27 | 2019 | The Effect of Vitamin D Supplementation on its Metabolism and the Vitamin D Meta | [10.3390/nu11102539](https://doi.org/10.3390/nu11102539) | Nutrients | full_text | no |
| 28 | 2019 | Vitamin D supplementation for the prevention of depression and poor physical fun | [10.1093/ajcn/nqz141](https://doi.org/10.1093/ajcn/nqz141) | The American journal of clinical nutriti | full_text | no |
| 29 | 2019 | Four months vitamin D supplementation to vitamin D insufficient individuals does | [10.1371/journal.pone.0225600](https://doi.org/10.1371/journal.pone.0225600) | PloS one | full_text | no |
| 30 | 2019 | Vitamin D Supplementation and Post-Stroke Rehabilitation: A Randomized, Double-B | [10.3390/nu11061295](https://doi.org/10.3390/nu11061295) | Nutrients | full_text | no |
| 31 | 2018 | Creatine or vitamin D supplementation in individuals with a spinal cord injury u | [10.1080/10790268.2017.1372058](https://doi.org/10.1080/10790268.2017.1372058) | The journal of spinal cord medicine | full_text | no |
| 32 | 2018 | The Effect of Nordic Walking Training Combined with Vitamin D Supplementation on | [10.3390/ijerph15091951](https://doi.org/10.3390/ijerph15091951) | International journal of environmental r | full_text | no |
| 33 | 2018 | A randomized, controlled pilot study of the effects of vitamin D supplementation | [10.1371/journal.pone.0203637](https://doi.org/10.1371/journal.pone.0203637) | PloS one | full_text | no |
| 34 | 2017 | Effects of daily vitamin D supplementation on respiratory muscle strength and ph | [10.2147/copd.s132117](https://doi.org/10.2147/copd.s132117) | International journal of chronic obstruc | full_text | no |
| 35 | 2017 | Omega-3 Fatty Acids and Vitamin D in Immobilisation: Part B- Modulation of Muscl | [10.1007/s12603-016-0711-4](https://doi.org/10.1007/s12603-016-0711-4) | The journal of nutrition, health & aging | full_text | no |
| 36 | 2015 | Glucosamine-containing supplement improves locomotor functions in subjects with  | [10.2147/cia.s93077](https://doi.org/10.2147/cia.s93077) | Clinical interventions in aging | full_text | no |
| 37 | 2026 | Short-term citrulline malate supplementation enhances lower-limb function in phy | [10.1016/j.clnesp.2026.103356](https://doi.org/10.1016/j.clnesp.2026.103356) | Clinical nutrition ESPEN | abstract_only | no |
| 38 | 2026 | Vitamin D supplementation during pregnancy and offspring bone microarchitecture: | [10.1016/j.bone.2026.117843](https://doi.org/10.1016/j.bone.2026.117843) | Bone | abstract_only | no |
| 39 | 2026 | A Combination of Whey Protein and Vitamin D Reduces Sarcopenia in Patients with  | [10.1016/j.arcmed.2025.103330](https://doi.org/10.1016/j.arcmed.2025.103330) | Archives of medical research | abstract_only | no |
| 40 | 2026 | Impact of high-dose vitamin D and calcium carbonate supplementation on bone dens | [10.1016/s2352-4642(25)00301-3](https://doi.org/10.1016/s2352-4642(25)00301-3) | The Lancet. Child & adolescent health | abstract_only | no |
| 41 | 2026 | Plasma vitamin D and cytokines in relation to exercise in patients with fibromya | [10.1515/sjpain-2025-0043](https://doi.org/10.1515/sjpain-2025-0043) | Scandinavian journal of pain | abstract_only | no |
| 42 | 2026 | The effects of marine fatty acid omega-3 supplements on incident fractures and b | [10.1093/jbmr/zjaf172](https://doi.org/10.1093/jbmr/zjaf172) | Journal of bone and mineral research : t | abstract_only | no |
| 43 | 2025 | Effect of a Multi-Ingredient Post-Workout Dietary Supplement on Body Composition | [10.1080/19390211.2025.2488811](https://doi.org/10.1080/19390211.2025.2488811) | Journal of dietary supplements | abstract_only | no |
| 44 | 2025 | Effects of 12 Weeks of Whole-Body Vibration Training and Vitamin D Supplementati | [10.1159/000547822](https://doi.org/10.1159/000547822) | Gerontology | abstract_only | no |
| 45 | 2025 | A Comparison Between Severity-Dependent Protocol and Fixed-Dose Regimen of Oral  | [10.1053/j.jrn.2024.11.002](https://doi.org/10.1053/j.jrn.2024.11.002) | Journal of renal nutrition : the officia | abstract_only | no |
| 46 | 2025 | The effects of vitamin D combined with thermotherapy and resistance exercise on  | [10.36721/pjps.2025.38.6.reg.14442.1](https://doi.org/10.36721/pjps.2025.38.6.reg.14442.1) | Pakistan journal of pharmaceutical scien | abstract_only | no |
| 47 | 2025 | Anti-sarcopenic effects of active vitamin D through modulation of anabolic and c | [10.1016/j.metabol.2025.156240](https://doi.org/10.1016/j.metabol.2025.156240) | Metabolism: clinical and experimental | abstract_only | no |
| 48 | 2025 | A combined health promotion program of exercise with protein and vitamin D-enric | [10.2152/jmi.72.76](https://doi.org/10.2152/jmi.72.76) | The journal of medical investigation : J | abstract_only | no |
| 49 | 2025 | Effect of Vitamin D3, Omega-3 Fatty Acids, and Exercise on Serum Sclerostin Leve | [10.1210/clinem/dgae859](https://doi.org/10.1210/clinem/dgae859) | The Journal of clinical endocrinology an | abstract_only | no |
| 50 | 2024 | No benefit of vitamin D supplementation on muscle function and health-related qu | [10.1016/j.jacl.2023.12.002](https://doi.org/10.1016/j.jacl.2023.12.002) | Journal of clinical lipidology | abstract_only | no |
| 51 | 2024 | The effects of 12 weeks resistance training and vitamin D administration on neur | [10.1016/j.physbeh.2023.114419](https://doi.org/10.1016/j.physbeh.2023.114419) | Physiology & behavior | abstract_only | no |
| 52 | 2024 | Alcohol use disorder and muscle weakness: Original study of the effect of vitami | [10.1016/j.alcohol.2024.03.001](https://doi.org/10.1016/j.alcohol.2024.03.001) | Alcohol (Fayetteville, N.Y.) | abstract_only | no |
| 53 | 2024 | Effect of cholecalciferol supplementation on hand grip strength, walking speed,  | [10.1111/ggi.14881](https://doi.org/10.1111/ggi.14881) | Geriatrics & gerontology international | abstract_only | no |
| 54 | 2024 | Active vitamin D treatment in the prevention of sarcopenia in adults with predia | [10.1016/s2666-7568(24)00009-6](https://doi.org/10.1016/s2666-7568(24)00009-6) | The lancet. Healthy longevity | abstract_only | no |
| 55 | 2022 | Association of Vitamin D Supplementation in Cardiorespiratory Fitness and Muscle | [10.1123/ijsnem.2021-0060](https://doi.org/10.1123/ijsnem.2021-0060) | International journal of sport nutrition | abstract_only | no |
| 56 | 2022 | High-intensity versus low-intensity resistance training in patients with knee os | [10.1177/02692155211073039](https://doi.org/10.1177/02692155211073039) | Clinical rehabilitation | abstract_only | no |
| 57 | 2021 | Effect of physical activity and vitamin D compared with vitamin D alone on muscl | [10.6133/apjcn.202112_30(4).0002](https://doi.org/10.6133/apjcn.202112_30(4).0002) | Asia Pacific journal of clinical nutriti | abstract_only | no |
| 58 | 2021 | Vitamin D supplementation associated with 12-weeks multimodal training in older  | [10.1016/j.exger.2020.111211](https://doi.org/10.1016/j.exger.2020.111211) | Experimental gerontology | abstract_only | no |
| 59 | 2021 | Effects of whey protein plus vitamin D supplementation combined with progressive | [10.1111/dom.14299](https://doi.org/10.1111/dom.14299) | Diabetes, obesity & metabolism | abstract_only | no |
| 60 | 2021 | Randomized Study of the Effects of Vitamin D and Magnesium Co-Supplementation on | [10.1007/s12011-020-02387-2](https://doi.org/10.1007/s12011-020-02387-2) | Biological trace element research | abstract_only | no |
| 61 | 2020 | Adverse Effects of High-Dose Vitamin D Supplementation on Volumetric Bone Densit | [10.1002/jbmr.4152](https://doi.org/10.1002/jbmr.4152) | Journal of bone and mineral research : t | abstract_only | no |
| 62 | 2020 | Effect of Vitamin D Supplementation on Muscle Strength, Muscle Function, and Bod | [10.1007/978-1-0716-0471-7_25](https://doi.org/10.1007/978-1-0716-0471-7_25) | Methods in molecular biology (Clifton, N | abstract_only | no |
| 63 | 2020 | Physical performance is not improved with vitamin D repletion: a randomized tria | [10.23736/s0022-4707.19.09607-5](https://doi.org/10.23736/s0022-4707.19.09607-5) | The Journal of sports medicine and physi | abstract_only | no |
| 64 | 2018 | Ingestion of a Multi-Ingredient Supplement Does Not Alter Exercise-Induced Satel | [10.1093/jn/nxy063](https://doi.org/10.1093/jn/nxy063) | The Journal of nutrition | abstract_only | no |
| 65 | 2018 | The impact of exercise and vitamin D supplementation on physical function in com | [10.1016/j.jos.2018.03.011](https://doi.org/10.1016/j.jos.2018.03.011) | Journal of orthopaedic science : officia | abstract_only | no |
| 66 | 2018 | Methods and procedures for: A randomized double-blind study investigating dose-d | [10.1016/j.cct.2018.02.009](https://doi.org/10.1016/j.cct.2018.02.009) | Contemporary clinical trials | abstract_only | no |
| 67 | 2018 | Vitamin D supplementation and muscle strength in pre-sarcopenic elderly Lebanese | [10.1007/s11657-018-0553-2](https://doi.org/10.1007/s11657-018-0553-2) | Archives of osteoporosis | abstract_only | no |
| 68 | 2018 | Correcting Vitamin D Insufficiency Improves Some But Not All Aspects of Physical | [10.1123/ijsnem.2017-0412](https://doi.org/10.1123/ijsnem.2017-0412) | International journal of sport nutrition | abstract_only | no |
| 69 | 2018 | Vitamin D<sub>3</sub> Supplementation Does Not Improve Sprint Performance in Pro | [10.1123/ijsnem.2017-0157](https://doi.org/10.1123/ijsnem.2017-0157) | International journal of sport nutrition | abstract_only | no |
| 70 | 2016 | Effect of Vitamin D Supplementation on Training Adaptation in Well-Trained Socce | [10.1519/jsc.0000000000001337](https://doi.org/10.1519/jsc.0000000000001337) | Journal of strength and conditioning res | abstract_only | no |
| 71 | 2013 | The role of vitamin D in improving physical performance in the elderly. | [10.1002/jbmr.1949](https://doi.org/10.1002/jbmr.1949) | Journal of bone and mineral research : t | abstract_only | no |

## Evidence grades — this run (`evidence-v2`, status `shadow`)

Population: `general_adult` · registry checked: **yes**

| Outcome | Grade | Benefit | Certainty | k | SMD [95% CI] | I² | refused |
|---|---|---|---|--:|---|--:|--:|
| muscle_strength | **C-** | possible | Moderate | 2 | +0.06 [-0.11, +0.22] | 0% | 18 |

Why trials were refused (all outcomes):

- 8 × study: off-target population
- 5 × study: no_isolated_ingredient_arm
- 2 × study: no_ingredient_free_arm
- 1 × no outcome values in the text read (figure-only or not reported)
- 1 × favoured arm is unstated; sign unknown; figure: no figure caption names this measure
- 1 × figure: no figure caption names this measure

## Notes

- Form, dose and population never weight a trial; they are GRADE indirectness.

- Predatory venues: flagged + counted, never weighted.

- This report is **this run only** — other ingredients are not mixed in.
