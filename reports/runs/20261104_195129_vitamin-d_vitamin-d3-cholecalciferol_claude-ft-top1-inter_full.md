# BS-PROOF full audit report (claude-ft-top1-inter)

Generated: **2026-11-04 19:51 UTC**


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

- Outcome screen (`--outcome muscle_strength`): **144** studies name it in title or abstract; 579 dropped (3 had no abstract). A trial that measured it without naming it is missed; see the benchmark coverage.
- Targeted studies: **144**
- Succeeded (usable): **54**
- Skipped (no text): **90**
- Partial agent failures: **0**
- Prompt version: `v1.39`
- Concurrency: 40  |  studies in flight: 40

## Token + cost accounting

- Extraction backend: **Claude subscription** (`--safe-mode`, `--max-turns 1`, one shot per call)
- Model calls: **133** (cache hits 241, failures 2)
- Input tokens: **1,860,160** (fresh 35,379 · cache-write 1,313,430 · cache-read 511,351)
- Output tokens: **207,547**
- **Spent on this run: $0.00** — subscription, not metered.
- **API-equivalent cost: $7.644** — what the same work would cost billed per token.
- Per study: **2.5 calls**, **$0.1416** API-equivalent across 54 scored studies.

| Agent | Tier | Model | Calls | Cache hits | Fail | In | Out | API-equiv |
|---|---|---|--:|--:|--:|--:|--:|--:|
| S3 | B | `claude-sonnet-5` | 20 | 34 | 0 | 361,754 | 17,590 | $1.323 |
| S4 | B | `claude-sonnet-5` | 20 | 34 | 0 | 333,288 | 14,325 | $1.250 |
| S4R | R | `claude-opus-5` | 2 | 6 | 0 | 27,493 | 1,856 | $0.291 |
| S5 | B | `claude-sonnet-5` | 23 | 33 | 2 | 481,705 | 65,889 | $1.937 |
| S5N | B | `claude-sonnet-5` | 8 | 22 | 0 | 192,454 | 17,242 | $0.756 |
| S5R | R | `claude-opus-5` | 2 | 12 | 0 | 39,150 | 5,555 | $0.475 |
| S6B | C | `claude-sonnet-5` | 18 | 32 | 0 | 103,078 | 28,448 | $0.478 |
| S7 | B | `claude-sonnet-5` | 20 | 34 | 0 | 251,577 | 13,878 | $0.816 |
| S8 | A | `claude-haiku-4-5-20251001` | 20 | 34 | 0 | 69,661 | 42,764 | $0.318 |

Tier → model is pinned in `claude_adapter.TIER_MODEL` (full ids, never aliases: an alias floats to a new model while the cache key does not change). Tier A = classification, B = extraction, C = the highest-risk agent.

## Predatory journal check (flag only — not in score)

- List entries loaded: **1162**
- Studies checked: **3262**
- Publisher resolved for: **2470/3262** (the list is PUBLISHERS, so this is the real coverage)
- Studies flagged predatory: **23**
- Distinct publishers flagged: **6**
- Distinct journals flagged: **0**
- Affects score: **NO (count only)**
  - [publisher] AME Publishing Company
  - [publisher] Baishideng Publishing Group Inc.
  - [publisher] Canadian Center of Science and Education
  - [publisher] Frontiers Media SA
  - [publisher] Impact Journals, LLC
  - [publisher] Science Alert

## Per-agent success rates (this run)

| Agent | Studies OK | Studies failed | Cache | Retries | Why it failed |
|---|---:|---:|---:|---:|---|
| S3 | 54 | 0 | 34 | 0 | — |
| S4 | 54 | 0 | 34 | 0 | — |
| S4R | 8 | 0 | 6 | 0 | — |
| S5 | 54 | 0 | 33 | 0 | — |
| S5N | 29 | 0 | 21 | 0 | — |
| S5R | 14 | 0 | 12 | 0 | — |
| S6B | 50 | 0 | 32 | 0 | — |
| S7 | 54 | 0 | 34 | 0 | — |
| S8 | 54 | 0 | 34 | 0 | — |

_One row per STUDY. The cost table above counts CLI ATTEMPTS, so its totals are higher by exactly the retries column._

## Studies extracted this run (144)

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
| 14 | 2023 | The association of vitamin D with bone microarchitecture, muscle strength, and m | [10.1016/j.bone.2023.116867](https://doi.org/10.1016/j.bone.2023.116867) | Bone | full_text | no |
| 15 | 2022 | Vitamin D supplementation and body composition changes in collegiate basketball  | [10.1080/15502783.2022.2046444](https://doi.org/10.1080/15502783.2022.2046444) | Journal of the International Society of  | full_text | no |
| 16 | 2022 | Elastic resistance training is more effective than vitamin D3 supplementation in | [10.1038/s41430-021-01000-6](https://doi.org/10.1038/s41430-021-01000-6) | European journal of clinical nutrition | full_text | no |
| 17 | 2022 | Vitamin D supplementation in chronic obstructive pulmonary disease patients with | [10.1093/ajcn/nqac083](https://doi.org/10.1093/ajcn/nqac083) | The American journal of clinical nutriti | full_text | no |
| 18 | 2022 | Vitamin D supplementation and increased dairy protein intake do not affect muscl | [10.1007/s00394-022-02912-0](https://doi.org/10.1007/s00394-022-02912-0) | European journal of nutrition | full_text | no |
| 19 | 2022 | The effects of vitamin D supplementation on frailty in older adults at risk for  | [10.1186/s12877-022-02888-w](https://doi.org/10.1186/s12877-022-02888-w) | BMC geriatrics | full_text | no |
| 20 | 2022 | Investigation of the Effect of Nutritional Supplementation with Whey Protein and | [10.3390/nu14030685](https://doi.org/10.3390/nu14030685) | Nutrients | full_text | no |
| 21 | 2022 | Muscle-Related Effect of Whey Protein and Vitamin D<sub>3</sub> Supplementation  | [10.3390/nu14112289](https://doi.org/10.3390/nu14112289) | Nutrients | full_text | no |
| 22 | 2021 | Effect of Vitamin D Supplementation on Skeletal Muscle Volume and Strength in Pa | [10.3390/nu13061874](https://doi.org/10.3390/nu13061874) | Nutrients | full_text | no |
| 23 | 2021 | The Association of Prenatal Vitamin D Sufficiency With Aeroallergen Sensitizatio | [10.1016/j.jaip.2021.06.009](https://doi.org/10.1016/j.jaip.2021.06.009) | The journal of allergy and clinical immu | full_text | no |
| 24 | 2021 | The Multi-Ethnic Study of Atherosclerosis individual response to vitamin D trial | [10.1016/j.cct.2021.106318](https://doi.org/10.1016/j.cct.2021.106318) | Contemporary clinical trials | full_text | no |
| 25 | 2021 | Effects of Different Vitamin D Supplementation Schemes in Post-Menopausal Women: | [10.3390/nu13020380](https://doi.org/10.3390/nu13020380) | Nutrients | full_text | no |
| 26 | 2021 | The effect of vitamin D and magnesium supplementation on the mental health statu | [10.1186/s12887-021-02631-1](https://doi.org/10.1186/s12887-021-02631-1) | BMC pediatrics | full_text | no |
| 27 | 2021 | Effects of Vitamin D3 Supplementation and Resistance Training on 25-Hydroxyvitam | [10.3390/nu14010086](https://doi.org/10.3390/nu14010086) | Nutrients | full_text | no |
| 28 | 2020 | Effect of high-dose vitamin D supplementation on peripheral arterial calcificati | [10.1007/s00198-020-05500-2](https://doi.org/10.1007/s00198-020-05500-2) | Osteoporosis international : a journal e | full_text | no |
| 29 | 2020 | Vitamin D Treatment during Pregnancy and Maternal and Neonatal Cord Blood Metal  | [10.1289/ehp7265](https://doi.org/10.1289/ehp7265) | Environmental health perspectives | full_text | no |
| 30 | 2020 | Vitamin D Supplementation Improves Health-Related Quality of Life and Physical P | [10.1016/j.pedhc.2020.04.007](https://doi.org/10.1016/j.pedhc.2020.04.007) | Journal of pediatric health care : offic | full_text | no |
| 31 | 2020 | Effect of vitamin D on bone strength in older African Americans: a randomized co | [10.1007/s00198-019-05275-1](https://doi.org/10.1007/s00198-019-05275-1) | Osteoporosis international : a journal e | full_text | no |
| 32 | 2020 | Effect of vitamin D<sub>3</sub> and calcium carbonate supplementation on muscle  | [10.3851/imp3386](https://doi.org/10.3851/imp3386) | Antiviral therapy | full_text | no |
| 33 | 2019 | Effects of 12 Weeks of Essential Amino Acids (EAA)-Based Multi-Ingredient Nutrit | [10.1007/s12603-019-1163-4](https://doi.org/10.1007/s12603-019-1163-4) | The journal of nutrition, health & aging | full_text | no |
| 34 | 2019 | Protein supplementation improves lean body mass in physically active older adult | [10.1002/jcsm.12394](https://doi.org/10.1002/jcsm.12394) | Journal of cachexia, sarcopenia and musc | full_text | no |
| 35 | 2019 | The Effect of Vitamin D Supplementation on its Metabolism and the Vitamin D Meta | [10.3390/nu11102539](https://doi.org/10.3390/nu11102539) | Nutrients | full_text | no |
| 36 | 2019 | Vitamin D supplementation for the prevention of depression and poor physical fun | [10.1093/ajcn/nqz141](https://doi.org/10.1093/ajcn/nqz141) | The American journal of clinical nutriti | full_text | no |
| 37 | 2019 | Four months vitamin D supplementation to vitamin D insufficient individuals does | [10.1371/journal.pone.0225600](https://doi.org/10.1371/journal.pone.0225600) | PloS one | full_text | no |
| 38 | 2019 | Vitamin D Supplementation and Post-Stroke Rehabilitation: A Randomized, Double-B | [10.3390/nu11061295](https://doi.org/10.3390/nu11061295) | Nutrients | full_text | no |
| 39 | 2019 | Physical Performance and Vitamin D in Elderly Black Women-The PODA Randomized Cl | [10.1210/jc.2018-01418](https://doi.org/10.1210/jc.2018-01418) | The Journal of clinical endocrinology an | full_text | no |
| 40 | 2019 | Effect of vitamin D fortified foods on bone markers and muscle strength in women | [10.1186/s12937-019-0504-9](https://doi.org/10.1186/s12937-019-0504-9) | Nutrition journal | full_text | no |
| 41 | 2019 | No effect of monthly supplementation with 12000 IU, 24000 IU or 48000 IU vitamin | [10.1016/j.jsbmb.2018.12.008](https://doi.org/10.1016/j.jsbmb.2018.12.008) | The Journal of steroid biochemistry and  | full_text | no |
| 42 | 2019 | Effects of Vitamin D and Calcium Fortified Yogurts on Gait, Cognitive Performanc | [10.3390/nu11122880](https://doi.org/10.3390/nu11122880) | Nutrients | full_text | no |
| 43 | 2018 | Creatine or vitamin D supplementation in individuals with a spinal cord injury u | [10.1080/10790268.2017.1372058](https://doi.org/10.1080/10790268.2017.1372058) | The journal of spinal cord medicine | full_text | no |
| 44 | 2018 | The Effect of Nordic Walking Training Combined with Vitamin D Supplementation on | [10.3390/ijerph15091951](https://doi.org/10.3390/ijerph15091951) | International journal of environmental r | full_text | no |
| 45 | 2018 | A randomized, controlled pilot study of the effects of vitamin D supplementation | [10.1371/journal.pone.0203637](https://doi.org/10.1371/journal.pone.0203637) | PloS one | full_text | no |
| 46 | 2018 | The relationship of Physical performance and Osteoporosis prevention with vitami | [10.1016/j.cct.2017.11.015](https://doi.org/10.1016/j.cct.2017.11.015) | Contemporary clinical trials | full_text | no |
| 47 | 2018 | The effects of single high-dose or daily low-dosage oral colecalciferol treatmen | [10.1186/s12902-018-0277-8](https://doi.org/10.1186/s12902-018-0277-8) | BMC endocrine disorders | full_text | no |
| 48 | 2018 | Serum 25-Hydroxyvitamin D and Intact Parathyroid Hormone Influence Muscle Outcom | [10.1002/jbmr.3550](https://doi.org/10.1002/jbmr.3550) | Journal of bone and mineral research : t | full_text | no |
| 49 | 2017 | Effects of daily vitamin D supplementation on respiratory muscle strength and ph | [10.2147/copd.s132117](https://doi.org/10.2147/copd.s132117) | International journal of chronic obstruc | full_text | no |
| 50 | 2017 | Omega-3 Fatty Acids and Vitamin D in Immobilisation: Part B- Modulation of Muscl | [10.1007/s12603-016-0711-4](https://doi.org/10.1007/s12603-016-0711-4) | The journal of nutrition, health & aging | full_text | no |
| 51 | 2017 | Changes in pro-inflammatory markers and leucine concentrations in response to No | [10.1007/s10522-017-9694-8](https://doi.org/10.1007/s10522-017-9694-8) | Biogerontology | full_text | no |
| 52 | 2015 | Glucosamine-containing supplement improves locomotor functions in subjects with  | [10.2147/cia.s93077](https://doi.org/10.2147/cia.s93077) | Clinical interventions in aging | full_text | no |
| 53 | 2014 | The effects of progressive resistance training combined with a whey-protein drin | [10.1186/1745-6215-15-431](https://doi.org/10.1186/1745-6215-15-431) | Trials | full_text | no |
| 54 | 2013 | Supplemental vitamin D and physical performance in COPD: a pilot randomized tria | [10.2147/copd.s40885](https://doi.org/10.2147/copd.s40885) | International journal of chronic obstruc | full_text | no |
| 55 | 2013 | Impact of vitamin D supplementation during a resistance training intervention on | [10.1016/j.clnu.2012.08.014](https://doi.org/10.1016/j.clnu.2012.08.014) | Clinical nutrition (Edinburgh, Scotland) | full_text | no |
| 56 | 2013 | Porvoo sarcopenia and nutrition trial: effects of protein supplementation on fun | [10.1186/1745-6215-14-387](https://doi.org/10.1186/1745-6215-14-387) | Trials | full_text | no |
| 57 | 2013 | A randomized controlled trial of high dose vitamin D3 in patients with heart fai | [10.1016/j.jchf.2012.11.003](https://doi.org/10.1016/j.jchf.2012.11.003) | JACC. Heart failure | full_text | no |
| 58 | 2013 | A phase IIA randomized, placebo-controlled clinical trial to study the efficacy  | [10.1007/s12603-013-0335-x](https://doi.org/10.1007/s12603-013-0335-x) | The journal of nutrition, health & aging | full_text | no |
| 59 | 2011 | Prevention of falls and fractures in old people by administration of calcium and | [10.1186/1471-2458-11-910](https://doi.org/10.1186/1471-2458-11-910) | BMC public health | full_text | no |
| 60 | 2026 | Short-term citrulline malate supplementation enhances lower-limb function in phy | [10.1016/j.clnesp.2026.103356](https://doi.org/10.1016/j.clnesp.2026.103356) | Clinical nutrition ESPEN | abstract_only | no |
| 61 | 2026 | Vitamin D supplementation during pregnancy and offspring bone microarchitecture: | [10.1016/j.bone.2026.117843](https://doi.org/10.1016/j.bone.2026.117843) | Bone | abstract_only | no |
| 62 | 2026 | A Combination of Whey Protein and Vitamin D Reduces Sarcopenia in Patients with  | [10.1016/j.arcmed.2025.103330](https://doi.org/10.1016/j.arcmed.2025.103330) | Archives of medical research | abstract_only | no |
| 63 | 2026 | Impact of high-dose vitamin D and calcium carbonate supplementation on bone dens | [10.1016/s2352-4642(25)00301-3](https://doi.org/10.1016/s2352-4642(25)00301-3) | The Lancet. Child & adolescent health | abstract_only | no |
| 64 | 2026 | Plasma vitamin D and cytokines in relation to exercise in patients with fibromya | [10.1515/sjpain-2025-0043](https://doi.org/10.1515/sjpain-2025-0043) | Scandinavian journal of pain | abstract_only | no |
| 65 | 2026 | The effects of marine fatty acid omega-3 supplements on incident fractures and b | [10.1093/jbmr/zjaf172](https://doi.org/10.1093/jbmr/zjaf172) | Journal of bone and mineral research : t | abstract_only | no |
| 66 | 2025 | Effect of a Multi-Ingredient Post-Workout Dietary Supplement on Body Composition | [10.1080/19390211.2025.2488811](https://doi.org/10.1080/19390211.2025.2488811) | Journal of dietary supplements | abstract_only | no |
| 67 | 2025 | Effects of 12 Weeks of Whole-Body Vibration Training and Vitamin D Supplementati | [10.1159/000547822](https://doi.org/10.1159/000547822) | Gerontology | abstract_only | no |
| 68 | 2025 | A Comparison Between Severity-Dependent Protocol and Fixed-Dose Regimen of Oral  | [10.1053/j.jrn.2024.11.002](https://doi.org/10.1053/j.jrn.2024.11.002) | Journal of renal nutrition : the officia | abstract_only | no |
| 69 | 2025 | The effects of vitamin D combined with thermotherapy and resistance exercise on  | [10.36721/pjps.2025.38.6.reg.14442.1](https://doi.org/10.36721/pjps.2025.38.6.reg.14442.1) | Pakistan journal of pharmaceutical scien | abstract_only | no |
| 70 | 2025 | Anti-sarcopenic effects of active vitamin D through modulation of anabolic and c | [10.1016/j.metabol.2025.156240](https://doi.org/10.1016/j.metabol.2025.156240) | Metabolism: clinical and experimental | abstract_only | no |
| 71 | 2025 | A combined health promotion program of exercise with protein and vitamin D-enric | [10.2152/jmi.72.76](https://doi.org/10.2152/jmi.72.76) | The journal of medical investigation : J | abstract_only | no |
| 72 | 2025 | Effect of Vitamin D3, Omega-3 Fatty Acids, and Exercise on Serum Sclerostin Leve | [10.1210/clinem/dgae859](https://doi.org/10.1210/clinem/dgae859) | The Journal of clinical endocrinology an | abstract_only | no |
| 73 | 2024 | No benefit of vitamin D supplementation on muscle function and health-related qu | [10.1016/j.jacl.2023.12.002](https://doi.org/10.1016/j.jacl.2023.12.002) | Journal of clinical lipidology | abstract_only | no |
| 74 | 2024 | The effects of 12 weeks resistance training and vitamin D administration on neur | [10.1016/j.physbeh.2023.114419](https://doi.org/10.1016/j.physbeh.2023.114419) | Physiology & behavior | abstract_only | no |
| 75 | 2024 | Alcohol use disorder and muscle weakness: Original study of the effect of vitami | [10.1016/j.alcohol.2024.03.001](https://doi.org/10.1016/j.alcohol.2024.03.001) | Alcohol (Fayetteville, N.Y.) | abstract_only | no |
| 76 | 2024 | Effect of cholecalciferol supplementation on hand grip strength, walking speed,  | [10.1111/ggi.14881](https://doi.org/10.1111/ggi.14881) | Geriatrics & gerontology international | abstract_only | no |
| 77 | 2024 | Active vitamin D treatment in the prevention of sarcopenia in adults with predia | [10.1016/s2666-7568(24)00009-6](https://doi.org/10.1016/s2666-7568(24)00009-6) | The lancet. Healthy longevity | abstract_only | no |
| 78 | 2023 | Effect of Vitamin D Supplementation on Graves' Disease: The DAGMAR Trial. | [10.1089/thy.2023.0111](https://doi.org/10.1089/thy.2023.0111) | Thyroid : official journal of the Americ | abstract_only | no |
| 79 | 2022 | Association of Vitamin D Supplementation in Cardiorespiratory Fitness and Muscle | [10.1123/ijsnem.2021-0060](https://doi.org/10.1123/ijsnem.2021-0060) | International journal of sport nutrition | abstract_only | no |
| 80 | 2022 | High-intensity versus low-intensity resistance training in patients with knee os | [10.1177/02692155211073039](https://doi.org/10.1177/02692155211073039) | Clinical rehabilitation | abstract_only | no |
| 81 | 2022 | Effect of high dose vitamin D supplementation on indices of sarcopenia and obesi | [10.1007/s12020-021-02951-3](https://doi.org/10.1007/s12020-021-02951-3) | Endocrine | abstract_only | no |
| 82 | 2021 | Effect of physical activity and vitamin D compared with vitamin D alone on muscl | [10.6133/apjcn.202112_30(4).0002](https://doi.org/10.6133/apjcn.202112_30(4).0002) | Asia Pacific journal of clinical nutriti | abstract_only | no |
| 83 | 2021 | Vitamin D supplementation associated with 12-weeks multimodal training in older  | [10.1016/j.exger.2020.111211](https://doi.org/10.1016/j.exger.2020.111211) | Experimental gerontology | abstract_only | no |
| 84 | 2021 | Effects of whey protein plus vitamin D supplementation combined with progressive | [10.1111/dom.14299](https://doi.org/10.1111/dom.14299) | Diabetes, obesity & metabolism | abstract_only | no |
| 85 | 2021 | Randomized Study of the Effects of Vitamin D and Magnesium Co-Supplementation on | [10.1007/s12011-020-02387-2](https://doi.org/10.1007/s12011-020-02387-2) | Biological trace element research | abstract_only | no |
| 86 | 2021 | Vitamin D supplementation does not enhance resistance training-induced gains in  | [10.1007/s00421-021-04674-9](https://doi.org/10.1007/s00421-021-04674-9) | European journal of applied physiology | abstract_only | no |
| 87 | 2021 | Musculoskeletal Responses to Exercise Plus Nutrition in Men with Prostate Cancer | [10.1249/mss.0000000000002682](https://doi.org/10.1249/mss.0000000000002682) | Medicine and science in sports and exerc | abstract_only | no |
| 88 | 2020 | Adverse Effects of High-Dose Vitamin D Supplementation on Volumetric Bone Densit | [10.1002/jbmr.4152](https://doi.org/10.1002/jbmr.4152) | Journal of bone and mineral research : t | abstract_only | no |
| 89 | 2020 | Effect of Vitamin D Supplementation on Muscle Strength, Muscle Function, and Bod | [10.1007/978-1-0716-0471-7_25](https://doi.org/10.1007/978-1-0716-0471-7_25) | Methods in molecular biology (Clifton, N | abstract_only | no |
| 90 | 2020 | Physical performance is not improved with vitamin D repletion: a randomized tria | [10.23736/s0022-4707.19.09607-5](https://doi.org/10.23736/s0022-4707.19.09607-5) | The Journal of sports medicine and physi | abstract_only | no |
| 91 | 2020 | Effect of Protein Supplementation on Physical Performance in Older People With S | [10.1016/j.jamda.2019.09.006](https://doi.org/10.1016/j.jamda.2019.09.006) | Journal of the American Medical Director | abstract_only | no |
| 92 | 2019 | Effect of Vitamin D Supplementation on Body Composition and Physical Fitness in  | [10.1159/000504873](https://doi.org/10.1159/000504873) | Annals of nutrition & metabolism | abstract_only | no |
| 93 | 2019 | Effects of branched-chain amino acids and vitamin D supplementation on physical  | [10.1111/ggi.13547](https://doi.org/10.1111/ggi.13547) | Geriatrics & gerontology international | abstract_only | no |
| 94 | 2019 | The effect of vitamin D supplementation on lower-extremity power and function in | [10.1093/ajcn/nqy290](https://doi.org/10.1093/ajcn/nqy290) | The American journal of clinical nutriti | abstract_only | no |
| 95 | 2019 | Winter vitamin D&lt;sub&gt;3&lt;/sub&gt; supplementation does not increase muscl | [10.1007/s00394-018-1637-x](https://doi.org/10.1007/s00394-018-1637-x) | European journal of nutrition | abstract_only | no |
| 96 | 2019 | A high whey protein, vitamin D and E supplement preserves muscle mass, strength, | [10.1016/j.clnu.2017.12.020](https://doi.org/10.1016/j.clnu.2017.12.020) | Clinical nutrition (Edinburgh, Scotland) | abstract_only | no |
| 97 | 2019 | A Vitamin D, Calcium and Leucine-Enriched Whey Protein Nutritional Supplement Im | [10.1007/s00223-019-00581-6](https://doi.org/10.1007/s00223-019-00581-6) | Calcified tissue international | abstract_only | no |
| 98 | 2018 | Ingestion of a Multi-Ingredient Supplement Does Not Alter Exercise-Induced Satel | [10.1093/jn/nxy063](https://doi.org/10.1093/jn/nxy063) | The Journal of nutrition | abstract_only | no |
| 99 | 2018 | The impact of exercise and vitamin D supplementation on physical function in com | [10.1016/j.jos.2018.03.011](https://doi.org/10.1016/j.jos.2018.03.011) | Journal of orthopaedic science : officia | abstract_only | no |
| 100 | 2018 | Methods and procedures for: A randomized double-blind study investigating dose-d | [10.1016/j.cct.2018.02.009](https://doi.org/10.1016/j.cct.2018.02.009) | Contemporary clinical trials | abstract_only | no |
| 101 | 2018 | Vitamin D supplementation and muscle strength in pre-sarcopenic elderly Lebanese | [10.1007/s11657-018-0553-2](https://doi.org/10.1007/s11657-018-0553-2) | Archives of osteoporosis | abstract_only | no |
| 102 | 2018 | Correcting Vitamin D Insufficiency Improves Some But Not All Aspects of Physical | [10.1123/ijsnem.2017-0412](https://doi.org/10.1123/ijsnem.2017-0412) | International journal of sport nutrition | abstract_only | no |
| 103 | 2018 | Vitamin D<sub>3</sub> Supplementation Does Not Improve Sprint Performance in Pro | [10.1123/ijsnem.2017-0157](https://doi.org/10.1123/ijsnem.2017-0157) | International journal of sport nutrition | abstract_only | no |
| 104 | 2018 | The effect of vitamin D2 supplementation on muscle strength in early postmenopau | [10.1080/13697137.2018.1480600](https://doi.org/10.1080/13697137.2018.1480600) | Climacteric : the journal of the Interna | abstract_only | no |
| 105 | 2018 | Cholecalciferol or 25-Hydroxycholecalciferol Supplementation Does Not Affect Mus | [10.1093/jn/nxy024](https://doi.org/10.1093/jn/nxy024) | The Journal of nutrition | abstract_only | no |
| 106 | 2018 | Vitamin D and calcium supplementation, skeletal muscle strength and serum testos | [10.1111/cen.13507](https://doi.org/10.1111/cen.13507) | Clinical endocrinology | abstract_only | no |
| 107 | 2017 | Effects of Enhanced Exercise and Combined Vitamin D and Calcium Supplementation  | [10.3881/j.issn.1000-503x.2017.03.008](https://doi.org/10.3881/j.issn.1000-503x.2017.03.008) | Zhongguo yi xue ke xue yuan xue bao. Act | abstract_only | no |
| 108 | 2017 | The effect of high-dose vitamin D supplementation on muscular function and quali | [10.1111/cen.13353](https://doi.org/10.1111/cen.13353) | Clinical endocrinology | abstract_only | no |
| 109 | 2017 | Cut-points for associations between vitamin D status and multiple musculoskeleta | [10.1007/s00198-016-3754-9](https://doi.org/10.1007/s00198-016-3754-9) | Osteoporosis international : a journal e | abstract_only | no |
| 110 | 2017 | Medium-Chain Triglycerides in Combination with Leucine and Vitamin D Benefit Cog | [10.3177/jnsv.63.133](https://doi.org/10.3177/jnsv.63.133) | Journal of nutritional science and vitam | abstract_only | no |
| 111 | 2016 | Effect of Vitamin D Supplementation on Training Adaptation in Well-Trained Socce | [10.1519/jsc.0000000000001337](https://doi.org/10.1519/jsc.0000000000001337) | Journal of strength and conditioning res | abstract_only | no |
| 112 | 2016 | Short-term Administration of Alphacalcidol is Associated with More Significant I | [10.1055/s-0042-103932](https://doi.org/10.1055/s-0042-103932) | Experimental and clinical endocrinology  | abstract_only | no |
| 113 | 2016 | Medium-Chain Triglycerides in Combination with Leucine and Vitamin D Increase Mu | [10.3945/jn.115.228965](https://doi.org/10.3945/jn.115.228965) | The Journal of nutrition | abstract_only | no |
| 114 | 2016 | The Vitamin D Assessment (ViDA) Study: design of a randomized controlled trial o | [10.1016/j.jsbmb.2015.09.010](https://doi.org/10.1016/j.jsbmb.2015.09.010) | The Journal of steroid biochemistry and  | abstract_only | no |
| 115 | 2016 | Acute Effects of Vitamin D3 Supplementation on Muscle Strength in Judoka Athlete | [10.1097/jsm.0000000000000264](https://doi.org/10.1097/jsm.0000000000000264) | Clinical journal of sport medicine : off | abstract_only | no |
| 116 | 2016 | Whey protein, amino acids, and vitamin D supplementation with physical activity  | [10.3945/ajcn.115.113357](https://doi.org/10.3945/ajcn.115.113357) | The American journal of clinical nutriti | abstract_only | no |
| 117 | 2015 | Vitamin D Supplementation and Physical Performance in Adolescent Swimmers. | [10.1123/ijsnem.2014-0180](https://doi.org/10.1123/ijsnem.2014-0180) | International journal of sport nutrition | abstract_only | no |
| 118 | 2015 | Effects of vitamin D supplementation on neuroplasticity in older adults: a doubl | [10.1007/s00198-014-2855-6](https://doi.org/10.1007/s00198-014-2855-6) | Osteoporosis international : a journal e | abstract_only | no |
| 119 | 2015 | Effect of vitamin D supplementation alone on muscle function in postmenopausal w | [10.1007/s00198-015-3151-9](https://doi.org/10.1007/s00198-015-3151-9) | Osteoporosis international : a journal e | abstract_only | no |
| 120 | 2015 | Effects of cholecalciferol supplementation and optimized calcium intakes on vita | [10.1016/j.burns.2014.07.005](https://doi.org/10.1016/j.burns.2014.07.005) | Burns : journal of the International Soc | abstract_only | no |
| 121 | 2015 | A high whey protein-, leucine-, and vitamin D-enriched supplement preserves musc | [10.3945/ajcn.114.090290](https://doi.org/10.3945/ajcn.114.090290) | The American journal of clinical nutriti | abstract_only | no |
| 122 | 2014 | Does vitamin D improve muscle strength in adults? A randomized, double-blind, pl | [10.1210/jc.2013-2647](https://doi.org/10.1210/jc.2013-2647) | The Journal of clinical endocrinology an | abstract_only | no |
| 123 | 2014 | Undercarboxylated osteocalcin, muscle strength and indices of bone health in old | [10.1016/j.bone.2014.03.008](https://doi.org/10.1016/j.bone.2014.03.008) | Bone | abstract_only | no |
| 124 | 2014 | [Effect of calcium and vitamin D in the reduction of falls in the elderly: a ran | [10.1016/j.medcli.2012.11.025](https://doi.org/10.1016/j.medcli.2012.11.025) | Medicina clinica | abstract_only | no |
| 125 | 2013 | The role of vitamin D in improving physical performance in the elderly. | [10.1002/jbmr.1949](https://doi.org/10.1002/jbmr.1949) | Journal of bone and mineral research : t | abstract_only | no |
| 126 | 2013 | C-terminal Agrin Fragment as a potential marker for sarcopenia caused by degener | [10.1016/j.exger.2012.05.021](https://doi.org/10.1016/j.exger.2012.05.021) | Experimental gerontology | abstract_only | no |
| 127 | 2013 | Effect of oral cholecalciferol 2,000 versus 5,000 IU on serum vitamin D, PTH, bo | [10.1007/s00198-012-1944-7](https://doi.org/10.1007/s00198-012-1944-7) | Osteoporosis international : a journal e | abstract_only | no |
| 128 | 2013 | Circulating pro-inflammatory cytokines are elevated and peak power output correl | [10.1007/s00421-012-2582-7](https://doi.org/10.1007/s00421-012-2582-7) | European journal of applied physiology | abstract_only | no |
| 129 | 2013 | Bone mineral density and vitamin D status in Parkinson's disease patients. | [10.1007/s00415-012-6697-x](https://doi.org/10.1007/s00415-012-6697-x) | Journal of neurology | abstract_only | no |
| 130 | 2012 | Skeletal muscle strength in young Asian Indian females after vitamin D and calci | [10.1210/jc.2012-2340](https://doi.org/10.1210/jc.2012-2340) | The Journal of clinical endocrinology an | abstract_only | no |
| 131 | 2012 | Efficacy and safety of high dose intramuscular or oral cholecalciferol in vitami | [10.1016/j.maturitas.2012.04.011](https://doi.org/10.1016/j.maturitas.2012.04.011) | Maturitas | abstract_only | no |
| 132 | 2011 | The effects of whole-body vibration training and vitamin D supplementation on mu | [10.1002/jbmr.181](https://doi.org/10.1002/jbmr.181) | Journal of bone and mineral research : t | abstract_only | no |
| 133 | 2011 | Vitamin D status affects strength gains in older adults supplemented with a comb | [10.1177/0148607111413903](https://doi.org/10.1177/0148607111413903) | JPEN. Journal of parenteral and enteral  | abstract_only | no |
| 134 | 2010 | Effect of cholecalciferol and calcium supplementation on muscle strength and ene | [10.1111/j.1365-2265.2010.03816.x](https://doi.org/10.1111/j.1365-2265.2010.03816.x) | Clinical endocrinology | abstract_only | no |
| 135 | 2010 | Vitamin D insufficiency and health outcomes over 5 y in older women. | [10.3945/ajcn.2009.28424](https://doi.org/10.3945/ajcn.2009.28424) | The American journal of clinical nutriti | abstract_only | no |
| 136 | 2010 | A randomized controlled trial of the effects of vitamin D on muscle strength and | [10.1111/j.1532-5415.2010.03142.x](https://doi.org/10.1111/j.1532-5415.2010.03142.x) | Journal of the American Geriatrics Socie | abstract_only | no |
| 137 | 2010 | Muscle strength and mobility in vitamin D-insufficient female geriatric patients | [10.1007/bf03324819](https://doi.org/10.1007/bf03324819) | Aging clinical and experimental research | abstract_only | no |
| 138 | 2010 | Once-weekly dose of 8400 IU vitamin D(3) compared with placebo: effects on neuro | [10.3945/ajcn.2009.28113](https://doi.org/10.3945/ajcn.2009.28113) | The American journal of clinical nutriti | abstract_only | no |
| 139 | 2009 | Treatment of vitamin D deficiency increases lower limb muscle strength in instit | [10.1159/000235874](https://doi.org/10.1159/000235874) | Annals of nutrition & metabolism | abstract_only | no |
| 140 | 2006 | Effects of vitamin D supplementation and exercise training on physical performan | [10.1016/j.exger.2006.05.001](https://doi.org/10.1016/j.exger.2006.05.001) | Experimental gerontology | abstract_only | no |
| 141 | 2005 | Low-dose vitamin D prevents muscular atrophy and reduces falls and hip fractures | [10.1159/000087203](https://doi.org/10.1159/000087203) | Cerebrovascular diseases (Basel, Switzer | abstract_only | no |
| 142 | 2004 | Vitamin D supplementation improves neuromuscular function in older people who fa | [10.1093/ageing/afh209](https://doi.org/10.1093/ageing/afh209) | Age and ageing | abstract_only | no |
| 143 | 2003 | Effects of vitamin D supplementation on strength, physical function, and health  | [10.1046/j.1532-5415.2003.51561.x](https://doi.org/10.1046/j.1532-5415.2003.51561.x) | Journal of the American Geriatrics Socie | abstract_only | no |
| 144 | 2003 | Effects of vitamin D and calcium supplementation on falls: a randomized controll | [10.1359/jbmr.2003.18.2.343](https://doi.org/10.1359/jbmr.2003.18.2.343) | Journal of bone and mineral research : t | abstract_only | no |

## Evidence grades — this run (`evidence-v2`, status `shadow`)

Population: `general_adult` · registry checked: **yes**

| Outcome | Grade | Benefit | Certainty | k | SMD [95% CI] | I² | refused |
|---|---|---|---|--:|---|--:|--:|
| muscle_strength | **I** | inconclusive | Low | 3 | +0.08 [-0.26, +0.42] | 0% | 25 |

Why trials were refused (all outcomes):

- 8 × study: off-target population
- 7 × study: no_isolated_ingredient_arm
- 7 × study: no_ingredient_free_arm
- 1 × no outcome values in the text read (figure-only or not reported)
- 1 × favoured arm is unstated; sign unknown; figure: no figure caption names this measure
- 1 × figure: no figure caption names this measure

## Notes

- Form, dose and population never weight a trial; they are GRADE indirectness.

- Predatory venues: flagged + counted, never weighted.

- This report is **this run only** — other ingredients are not mixed in.
