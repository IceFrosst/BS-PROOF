# BS-PROOF full audit report (grok-sr-ft-per_o)

Generated: **2026-08-07 16:44 UTC**


scoring_model: v2-four-arc

Ingredient: `creatine` · Form: `creatine_monohydrate` · Mode: **grok-sr-ft-per_o**

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
  PASS  clean positive reaches the top  
  PASS  works overall but YOUR form found nothing  effect +0.43 vs form -0.70 — the case that justifies a per-form arc at all
  PASS  that arc reports how little evidence backs it  33% of the evidence
  PASS  no trial in your form is PENALISED, not dropped  69 vs 96 — averaging over available arcs gave both 99
  PASS  an untested axis has no verdict and zero coverage  
  PASS  confidence MULTIPLIES -- one weak trial cannot score well  3/100; as a fourth term in a mean it scored 76
  PASS  'barely studied' and 'does not work' stay distinguishable  'barely studied' vs 'does not work' — SPEC §9's collapse, avoided
  PASS  the evidence arc is what separates them  
  PASS  signed score retained alongside the 0-100  bands and the anchor set depend on it; only the DISPLAY is 0-100
  PASS  four rings render  
  PASS  a row missing c cannot claim a verdict  a Grok report rendered 16/100 as 'does not work' because the projection dropped components; silence must not become a verdict
  PASS  runner projects every field the report renders  6 fields present

SAFETY OUTCOMES + APPLICABILITY LABELS
  PASS  a null on an EFFICACY outcome stays negative  invariant 7: a well-run trial finding nothing disconfirms the claim
  PASS  a null on a SAFETY outcome is reassurance, not failure  no difference in side effects CONFIRMS 'this is safe'; scoring it -0.7 published magnesium's safety data as 'does not work'
  PASS  harm on a safety outcome is still negative  
  PASS  an applicability penalty is not reported as a verdict  effect arc was +1.00 and it read 'probably does not work'
  PASS  a genuinely negative finding still reads negative  
  PASS  a good form match cannot rescue negative evidence  

THREE-ARC DONUT (effect / form / dose)
  PASS  three independent fills, not thirds of one total  they do not sum to anything -- each is its own condition
  PASS  unassessed dose is None, NOT zero  'we did not check' and 'your dose is wrong' are opposite messages
  PASS  dose arc tracks MATCH, not coverage  a 10x-underdosed product must not show a full dose arc
  PASS  nobody reported a dose -> None (hatched), not 0 (wrong)  
  PASS  an assessable axis gets a solid track over the hatch  all three axes judged
  PASS  an unassessable axis leaves the hatch bare  dose never reported -> hatched, not empty
  PASS  form arc reflects the exact-form share only  

STORAGE (SQLite on a Postgres-shaped schema)
  PASS  studies persisted  
  PASS  unclassified queryable as the S1 budget  
  PASS  refuses records that skipped dedup  no _canonical -> one trial would land four times
  PASS  ECU round-trips  
  PASS  audit trail links study to ECU  every published number must be reconstructible
  PASS  band_version bump invalidates cached ECUs  SPEC section 5 complexity flag, made queryable
  PASS  re-scoring updates in place, no duplicate row  

ALL PASSED
```

## This run — extraction stats

- Targeted studies: **80**
- Succeeded (usable): **80**
- Skipped (no text): **0**
- Partial agent failures: **80**
- Prompt version: `v1.4+grok-cli-pure-function`
- Concurrency: 43  |  studies in flight: 32

## Predatory journal check (flag only — not in score)

- List entries loaded: **0**
- Studies checked: **262**
- Studies flagged predatory: **0**
- Distinct journals flagged: **0**
- Affects score: **NO (count only)**

## Systematic reviews / meta-analyses (S2)

- Requested (cap): **12**
- S2 extractions ok: **12**
- Resolved for multiplier: **0**
_SRs never add patients; only a capped confidence boost (≤ +30%)._

## Per-agent success rates (this run)

| Agent | OK | Fail | Cache | Why it failed |
|---|---:|---:|---:|---|
| S3 | 80 | 0 | 0 | — |
| S4 | 80 | 0 | 0 | — |
| S5 | 79 | 1 | 0 | exit 124: timeout after 300s (x1) |
| S7 | 80 | 0 | 0 | — |
| S8 | 0 | 80 | 0 | exit 1: {"type":"error","message":"Couldn't set model 'grok-4.3': Invalid params: \"unknow (x80) |

## SPEED REPORT

```text
============================================================
GROK SPEED REPORT
  concurrent limit (SP_GROK_CONCURRENCY): 43
  peak in-flight observed:               43
  live calls ok/fail/cache: 711/86/6
  timeouts: 5  auth failures: 0
  avg latency (ok): 113.6s   p95: 146.9s
  fail rate: 10.8%
  RECOMMENDATION: OK at 43.
============================================================
```

## Studies extracted this run (80)

| # | Year | Title | DOI / PMID | Journal | OA | Predatory |
|---:|---:|---|---|---|---|---|
| 1 | 2026 | Combined creatine and β-hydroxy-β-methylbutyrate supplementation with integral c | [10.1007/s40520-025-03312-0](https://doi.org/10.1007/s40520-025-03312-0) | Aging clinical and experimental research | full_text | no |
| 2 | 2026 | Creatine plus β-Hydroxy-β-Methylbutyrate supplementation is associated with pres | [10.1007/s10522-026-10407-2](https://doi.org/10.1007/s10522-026-10407-2) | Biogerontology | full_text | no |
| 3 | 2026 | Single-Dose Creatine Reduces Sleep Deprivation-Induced Deterioration in Cognitiv | [10.3390/nu18081192](https://doi.org/10.3390/nu18081192) | Nutrients | full_text | no |
| 4 | 2026 | Synergistic effects of creatine, carbs, protein on repeated sprint performance. | [10.1038/s41598-026-44278-x](https://doi.org/10.1038/s41598-026-44278-x) | Scientific reports | full_text | no |
| 5 | 2025 | Acute creatine supplementation enhances technical performance in adolescent bask | [10.1080/15502783.2025.2542369](https://doi.org/10.1080/15502783.2025.2542369) | Journal of the International Society of  | full_text | no |
| 6 | 2025 | Effectiveness of a soccer injury prevention program based on creatine supplement | [10.1080/15502783.2026.2633251](https://doi.org/10.1080/15502783.2026.2633251) | Journal of the International Society of  | full_text | no |
| 7 | 2025 | Effect of creatine monohydrate on motor function in children with facioscapulohu | [10.1002/phar.70025](https://doi.org/10.1002/phar.70025) | Pharmacotherapy | full_text | no |
| 8 | 2025 | The Effect of Creatine Supplementation on Lean Body Mass with and Without Resist | [10.3390/nu17061081](https://doi.org/10.3390/nu17061081) | Nutrients | full_text | no |
| 9 | 2025 | Short-term creatine supplementation enhances strength, reduces fatigue, and acce | [10.1080/15502783.2026.2617283](https://doi.org/10.1080/15502783.2026.2617283) | Journal of the International Society of  | full_text | no |
| 10 | 2025 | Effects of Creatine Monohydrate Loading on Sleep Metrics, Physical Performance,  | [10.3390/nu17243831](https://doi.org/10.3390/nu17243831) | Nutrients | full_text | no |
| 11 | 2025 | Effect of Taurine Combined With Creatine on Repeated Sprinting Ability After Exh | [10.1177/19417381251320095](https://doi.org/10.1177/19417381251320095) | Sports health | full_text | no |
| 12 | 2025 | The Effect of Vitamin D3 on Serum Creatine Phosphokinase Level in Patients with  | [10.30476/ijms.2024.99691.3182](https://doi.org/10.30476/ijms.2024.99691.3182) | Iranian journal of medical sciences | full_text | no |
| 13 | 2025 | Does creatine cause hair loss? A 12-week randomized controlled trial. | [10.1080/15502783.2025.2495229](https://doi.org/10.1080/15502783.2025.2495229) | Journal of the International Society of  | full_text | no |
| 14 | 2024 | Creatine Improves Total Sleep Duration Following Resistance Training Days versus | [10.3390/nu16162772](https://doi.org/10.3390/nu16162772) | Nutrients | full_text | no |
| 15 | 2024 | Effect of Creatine Monohydrate Supplementation on Macro- and Microvascular Endot | [10.3390/nu17010058](https://doi.org/10.3390/nu17010058) | Nutrients | full_text | no |
| 16 | 2024 | The Effect of Creatine Nitrate and Caffeine Individually or Combined on Exercise | [10.3390/nu16060766](https://doi.org/10.3390/nu16060766) | Nutrients | full_text | no |
| 17 | 2024 | No additive effect of creatine, caffeine, and sodium bicarbonate on intense exer | [10.1111/sms.14629](https://doi.org/10.1111/sms.14629) | Scandinavian journal of medicine & scien | full_text | no |
| 18 | 2024 | Effect of Creatine Supplementation on Body Composition and Malnutrition-Inflamma | [10.3390/nu16050615](https://doi.org/10.3390/nu16050615) | Nutrients | full_text | no |
| 19 | 2024 | Supplementing With Which Form of Creatine (Hydrochloride or Monohydrate) Alongsi | [10.33549/physiolres.935323](https://doi.org/10.33549/physiolres.935323) | Physiological research | full_text | no |
| 20 | 2024 | High-dose short-term creatine supplementation without beneficial effects in prof | [10.1080/15502783.2024.2340574](https://doi.org/10.1080/15502783.2024.2340574) | Journal of the International Society of  | full_text | no |
| 21 | 2024 | Combined Impact of Creatine, Caffeine, and Variable Resistance on Repeated Sprin | [10.3390/nu16152437](https://doi.org/10.3390/nu16152437) | Nutrients | full_text | no |
| 22 | 2024 | Effects of a Low Dose of Orally Administered Creatine Monohydrate on Post-Fatigu | [10.3390/nu16091324](https://doi.org/10.3390/nu16091324) | Nutrients | full_text | no |
| 23 | 2024 | The Effect of Prior Creatine Intake for 28 Days on Accelerated Recovery from Exe | [10.3390/nu16060896](https://doi.org/10.3390/nu16060896) | Nutrients | full_text | no |
| 24 | 2023 | A 2-yr Randomized Controlled Trial on Creatine Supplementation during Exercise f | [10.1249/mss.0000000000003202](https://doi.org/10.1249/mss.0000000000003202) | Medicine and science in sports and exerc | full_text | no |
| 25 | 2023 | The effects of creatine supplementation on cognitive performance-a randomised co | [10.1186/s12916-023-03146-5](https://doi.org/10.1186/s12916-023-03146-5) | BMC medicine | full_text | no |
| 26 | 2023 | The Effects of Protein and Carbohydrate Supplementation, with and without Creati | [10.3390/nu15245134](https://doi.org/10.3390/nu15245134) | Nutrients | full_text | no |
| 27 | 2023 | The Folic Acid and Creatine Trial: Treatment Effects of Supplementation on Arsen | [10.1289/ehp11270](https://doi.org/10.1289/ehp11270) | Environmental health perspectives | full_text | no |
| 28 | 2023 | Creatine monohydrate supplementation changes total body water and DXA lean mass  | [10.1080/15502783.2023.2193556](https://doi.org/10.1080/15502783.2023.2193556) | Journal of the International Society of  | full_text | no |
| 29 | 2023 | Comparing D3-Creatine Dilution and Dual-Energy X-ray Absorptiometry Muscle Mass  | [10.1093/gerona/glad047](https://doi.org/10.1093/gerona/glad047) | The journals of gerontology. Series A, B | full_text | no |
| 30 | 2023 | A Randomized Controlled Trial of Changes in Fluid Distribution across Menstrual  | [10.3390/nu15020429](https://doi.org/10.3390/nu15020429) | Nutrients | full_text | no |
| 31 | 2023 | The role of resistance training and creatine supplementation on oxidative stress | [10.3389/fpubh.2023.1062832](https://doi.org/10.3389/fpubh.2023.1062832) | Frontiers in public health | full_text | no |
| 32 | 2023 | The Effects of Creatine Monohydrate Loading on Exercise Recovery in Active Women | [10.3390/nu15163567](https://doi.org/10.3390/nu15163567) | Nutrients | full_text | no |
| 33 | 2023 | Application of the D&lt;sub&gt;3&lt;/sub&gt; -creatine muscle mass assessment to | [10.1002/jcsm.13322](https://doi.org/10.1002/jcsm.13322) | Journal of cachexia, sarcopenia and musc | full_text | no |
| 34 | 2022 | A randomized open-labeled study to examine the effects of creatine monohydrate a | [10.1080/15502783.2022.2108683](https://doi.org/10.1080/15502783.2022.2108683) | Journal of the International Society of  | full_text | no |
| 35 | 2022 | Effects of Four Weeks of Beta-Alanine Supplementation Combined with One Week of  | [10.3390/ijerph19137992](https://doi.org/10.3390/ijerph19137992) | International journal of environmental r | full_text | no |
| 36 | 2022 | Effects of Oral Creatine Supplementation on Power Output during Repeated Treadmi | [10.3390/nu14061140](https://doi.org/10.3390/nu14061140) | Nutrients | full_text | no |
| 37 | 2021 | Betaine and choline status modify the effects of folic acid and creatine supplem | [10.1007/s00394-020-02377-z](https://doi.org/10.1007/s00394-020-02377-z) | European journal of nutrition | full_text | no |
| 38 | 2021 | The effects of phosphocreatine disodium salts plus blueberry extract supplementa | [10.1186/s12970-021-00456-y](https://doi.org/10.1186/s12970-021-00456-y) | Journal of the International Society of  | full_text | no |
| 39 | 2021 | Characterization of Creatine Kinase Levels in Tofacitinib-Treated Patients with  | [10.1007/s10620-020-06560-4](https://doi.org/10.1007/s10620-020-06560-4) | Digestive diseases and sciences | full_text | no |
| 40 | 2021 | Creatine Enhances the Effects of Cluster-Set Resistance Training on Lower-Limb B | [10.3390/nu13072303](https://doi.org/10.3390/nu13072303) | Nutrients | full_text | no |
| 41 | 2021 | Effects of Combined Creatine and Sodium Bicarbonate Supplementation on Soccer-Sp | [10.3390/ijerph18136919](https://doi.org/10.3390/ijerph18136919) | International journal of environmental r | full_text | no |
| 42 | 2021 | Short-Term Creatine Loading Improves Total Work and Repetitions to Failure but N | [10.3390/nu13030826](https://doi.org/10.3390/nu13030826) | Nutrients | full_text | no |
| 43 | 2021 | Morning versus Evening Intake of Creatine in Elite Female Handball Players. | [10.3390/ijerph19010393](https://doi.org/10.3390/ijerph19010393) | International journal of environmental r | full_text | no |
| 44 | 2021 | Effect of Creatine Supplementation on Functional Capacity and Muscle Oxygen Satu | [10.3390/nu13010149](https://doi.org/10.3390/nu13010149) | Nutrients | full_text | no |
| 45 | 2021 | Short-term co-ingestion of creatine and sodium bicarbonate improves anaerobic pe | [10.1186/s12970-021-00407-7](https://doi.org/10.1186/s12970-021-00407-7) | Journal of the International Society of  | full_text | no |
| 46 | 2020 | Effects of Creatine Supplementation during Resistance Training Sessions in Physi | [10.3390/nu12061880](https://doi.org/10.3390/nu12061880) | Nutrients | full_text | no |
| 47 | 2020 | Effect of Ten Weeks of Creatine Monohydrate Plus HMB Supplementation on Athletic | [10.3390/nu12010193](https://doi.org/10.3390/nu12010193) | Nutrients | full_text | no |
| 48 | 2020 | The addition of β-Hydroxy β-Methylbutyrate (HMB) to creatine monohydrate supplem | [10.1186/s12970-020-00359-4](https://doi.org/10.1186/s12970-020-00359-4) | Journal of the International Society of  | full_text | no |
| 49 | 2020 | The Effects of Long-Term Magnesium Creatine Chelate Supplementation on Repeated  | [10.3390/nu12102961](https://doi.org/10.3390/nu12102961) | Nutrients | full_text | no |
| 50 | 2019 | Examining the effects of creatine supplementation in augmenting adaptations to r | [10.1136/bmjopen-2019-030080](https://doi.org/10.1136/bmjopen-2019-030080) | BMJ open | full_text | no |
| 51 | 2019 | Effect of Creatine Supplementation Dosing Strategies on Aging Muscle Performance | [10.1007/s12603-018-1148-8](https://doi.org/10.1007/s12603-018-1148-8) | The journal of nutrition, health & aging | full_text | no |
| 52 | 2019 | Creatine electrolyte supplement improves anaerobic power and strength: a randomi | [10.1186/s12970-019-0291-x](https://doi.org/10.1186/s12970-019-0291-x) | Journal of the International Society of  | full_text | no |
| 53 | 2018 | A randomized, double-blind, placebo-controlled, proof-of-concept trial of creati | [10.1007/s00702-017-1817-5](https://doi.org/10.1007/s00702-017-1817-5) | Journal of neural transmission (Vienna,  | full_text | no |
| 54 | 2018 | Effects of 4-Week Creatine Supplementation Combined with Complex Training on Mus | [10.3390/nu10111640](https://doi.org/10.3390/nu10111640) | Nutrients | full_text | no |
| 55 | 2018 | Creatine or vitamin D supplementation in individuals with a spinal cord injury u | [10.1080/10790268.2017.1372058](https://doi.org/10.1080/10790268.2017.1372058) | The journal of spinal cord medicine | full_text | no |
| 56 | 2018 | Creatine-electrolyte supplementation improves repeated sprint cycling performanc | [10.1186/s12970-018-0226-y](https://doi.org/10.1186/s12970-018-0226-y) | Journal of the International Society of  | full_text | no |
| 57 | 2018 | Creatine Supplementation Supports the Rehabilitation of Adolescent Fin Swimmers  | [PMID 29769829](https://pubmed.ncbi.nlm.nih.gov/29769829/) | Journal of sports science & medicine | full_text | no |
| 58 | 2017 | The CREST-E study of creatine for Huntington disease: A randomized controlled tr | [10.1212/wnl.0000000000004209](https://doi.org/10.1212/wnl.0000000000004209) | Neurology | full_text | no |
| 59 | 2017 | The acute effect of beta-guanidinopropionic acid versus creatine or placebo in h | [10.1111/bcp.13390](https://doi.org/10.1111/bcp.13390) | British journal of clinical pharmacology | full_text | no |
| 60 | 2017 | A double-blind, placebo-controlled randomized trial of creatine for the cancer a | [10.1093/annonc/mdx232](https://doi.org/10.1093/annonc/mdx232) | Annals of oncology : official journal of | full_text | no |
| 61 | 2017 | Hematological and Hemodynamic Responses to Acute and Short-Term Creatine Nitrate | [10.3390/nu9121359](https://doi.org/10.3390/nu9121359) | Nutrients | full_text | no |
| 62 | 2017 | Effect of low dose, short-term creatine supplementation on muscle power output i | [10.1186/s12970-017-0162-2](https://doi.org/10.1186/s12970-017-0162-2) | Journal of the International Society of  | full_text | no |
| 63 | 2017 | Effects of Creatine Supplementation on Muscle Strength and Optimal Individual Po | [10.3390/nu9111169](https://doi.org/10.3390/nu9111169) | Nutrients | full_text | no |
| 64 | 2016 | The Effects of Creatine Supplementation on Explosive Performance and Optimal Ind | [10.3390/nu8030143](https://doi.org/10.3390/nu8030143) | Nutrients | full_text | no |
| 65 | 2016 | Effects of Coffee and Caffeine Anhydrous Intake During Creatine Loading. | [10.1519/jsc.0000000000001223](https://doi.org/10.1519/jsc.0000000000001223) | Journal of strength and conditioning res | full_text | no |
| 66 | 2015 | The acute effect of beta-guanidinopropionic acid versus creatine or placebo in h | [10.1186/s13063-015-0581-9](https://doi.org/10.1186/s13063-015-0581-9) | Trials | full_text | no |
| 67 | 2015 | Creatine supplementation enhances corticomotor excitability and cognitive perfor | [10.1523/jneurosci.3113-14.2015](https://doi.org/10.1523/jneurosci.3113-14.2015) | The Journal of neuroscience : the offici | full_text | no |
| 68 | 2015 | Folic Acid and Creatine as Therapeutic Approaches to Lower Blood Arsenic: A Rand | [10.1289/ehp.1409396](https://doi.org/10.1289/ehp.1409396) | Environmental health perspectives | full_text | no |
| 69 | 2015 | Sex Differences in Clinical Features of Early, Treated Parkinson's Disease. | [10.1371/journal.pone.0133002](https://doi.org/10.1371/journal.pone.0133002) | PloS one | full_text | no |
| 70 | 2015 | Caffeine and Progression of Parkinson Disease: A Deleterious Interaction With Cr | [10.1097/wnf.0000000000000102](https://doi.org/10.1097/wnf.0000000000000102) | Clinical neuropharmacology | full_text | no |
| 71 | 2014 | PRECREST: a phase II prevention and biomarker trial of creatine in at-risk Hunti | [10.1212/wnl.0000000000000187](https://doi.org/10.1212/wnl.0000000000000187) | Neurology | full_text | no |
| 72 | 2013 | Creatine supplementation associated or not with strength training upon emotional | [10.1371/journal.pone.0076301](https://doi.org/10.1371/journal.pone.0076301) | PloS one | full_text | no |
| 73 | 2013 | Creatine metabolism and safety profiles after six-week oral guanidinoacetic acid | [10.7150/ijms.5125](https://doi.org/10.7150/ijms.5125) | International journal of medical science | full_text | no |
| 74 | 2013 | Increases in creatine kinase with atorvastatin treatment are not associated with | [10.1016/j.atherosclerosis.2013.07.001](https://doi.org/10.1016/j.atherosclerosis.2013.07.001) | Atherosclerosis | full_text | no |
| 75 | 2012 | A randomized, double-blind placebo-controlled trial of oral creatine monohydrate | [10.1176/appi.ajp.2012.12010009](https://doi.org/10.1176/appi.ajp.2012.12010009) | The American journal of psychiatry | full_text | no |
| 76 | 2011 | N-acetylcysteine supplementation controls total antioxidant capacity, creatine k | [10.1155/2011/329643](https://doi.org/10.1155/2011/329643) | Oxidative medicine and cellular longevit | full_text | no |
| 77 | 2010 | The effects of supplementation with creatine and protein on muscle strength foll | [10.1007/s12603-009-0124-8](https://doi.org/10.1007/s12603-009-0124-8) | The journal of nutrition, health & aging | full_text | no |
| 78 | 2009 | Creatine fails to augment the benefits from resistance training in patients with | [10.1371/journal.pone.0004605](https://doi.org/10.1371/journal.pone.0004605) | PloS one | full_text | no |
| 79 | 2009 | The effect of L-arginine and creatine on vascular function and homocysteine meta | [10.1177/1358863x08100834](https://doi.org/10.1177/1358863x08100834) | Vascular medicine (London, England) | full_text | no |
| 80 | 2008 | A pilot clinical trial of creatine and minocycline in early Parkinson disease: 1 | [10.1097/wnf.0b013e3181342f32](https://doi.org/10.1097/wnf.0b013e3181342f32) | Clinical neuropharmacology | full_text | no |

## ECU scores — this run only

| Outcome | 0–100 | Verdict | effect | in your form | at your dose | evidence | n |
|---|---:|---|---|---|---|---|---:|
| muscle_power | 32 | probably does not work | -0.19 @ 100% | -0.13 @ 66% | -0.27 @ 29% | 81% | 39 |
| lean_body_mass | 29 | probably does not work | -0.29 @ 100% | -0.28 @ 50% | -0.18 @ 56% | 76% | 29 |
| adverse_events_any | 23 | does not work | +0.02 @ 100% | +0.01 @ 40% | -0.22 @ 30% | 48% | 15 |
| muscle_strength | 22 | does not work | -0.20 @ 100% | -0.40 @ 43% | -0.38 @ 35% | 66% | 24 |
| exercise_endurance | 15 | does not work | -0.31 @ 100% | -0.15 @ 59% | -0.31 @ 43% | 42% | 12 |
| depressive_symptoms | 14 | does not work | +0.01 @ 100% | +0.40 @ 64% | -0.37 @ 53% | 28% | 6 |
| muscle_soreness | 10 | barely studied | +0.35 @ 100% | +1.00 @ 62% | +1.00 @ 29% | 11% | 3 |
| cognitive_function | 9 | does not work | +0.05 @ 100% | +1.00 @ 28% | -0.70 @ 34% | 16% | 3 |
| attention_focus | 8 | works, but not tested for your product | +0.46 @ 100% | +0.46 @ 100% | not tested | 15% | 4 |
| sleep_quality | 4 | barely studied | +0.09 @ 100% | +1.00 @ 46% | not tested | 8% | 2 |
| cortisol | 3 | barely studied | -0.13 @ 100% | -0.70 @ 43% | -0.13 @ 100% | 9% | 2 |
| exercise_recovery | 3 | barely studied | +1.00 @ 100% | +1.00 @ 100% | +1.00 @ 100% | 3% | 1 |
| glycaemic_control | 2 | barely studied | +0.30 @ 100% | +0.30 @ 100% | not tested | 4% | 1 |
| sleep_duration | 2 | barely studied | -0.16 @ 100% | -0.70 @ 46% | not tested | 8% | 2 |
| blood_pressure | 1 | barely studied | +0.00 @ 100% | +0.00 @ 100% | +0.00 @ 100% | 1% | 1 |
| memory | 1 | barely studied | -0.70 @ 100% | not tested | -0.70 @ 100% | 6% | 1 |
| testosterone | 1 | barely studied | -0.70 @ 100% | -0.70 @ 100% | not tested | 10% | 2 |
| energy_levels | 0 | barely studied | -0.70 @ 100% | not tested | not tested | 4% | 1 |
| sleep_onset | 0 | barely studied | -0.70 @ 100% | -0.70 @ 100% | not tested | 4% | 1 |
| adverse_events_gi | gated | not enough human evidence | not tested | not tested | not tested | not tested | 0 |
| anxiety | gated | not enough human evidence | not tested | not tested | not tested | not tested | 0 |
| cold_duration | gated | not enough human evidence | not tested | not tested | not tested | not tested | 0 |
| cold_incidence | gated | not enough human evidence | not tested | not tested | not tested | not tested | 0 |
| digestive_comfort | gated | not enough human evidence | not tested | not tested | not tested | not tested | 0 |
| inflammation_crp | gated | not enough human evidence | not tested | not tested | not tested | not tested | 0 |
| joint_pain | gated | not enough human evidence | not tested | not tested | not tested | not tested | 0 |
| muscle_cramps | gated | not enough human evidence | not tested | not tested | not tested | not tested | 0 |
| perceived_stress | gated | not enough human evidence | not tested | not tested | not tested | not tested | 0 |
| serum_magnesium | gated | not enough human evidence | not tested | not tested | not tested | not tested | 0 |
| sleep_wake_after_onset | gated | not enough human evidence | not tested | not tested | not tested | not tested | 0 |

_0–100 = 100 × c × mean(effect, form, dose). Each arc shows its verdict and the share of evidence behind it. A low number with a FULL evidence arc means 'does not work'; with an EMPTY one it means 'barely studied'._


_Old rows from previous runs are not shown here._

## Database snapshot (`creatine`)

### `grok_creatine.sqlite`

Studies stored (corpus): **200** · ECUs: **17** · syntheses: **50

### `grok_creatine_per_.sqlite`

Studies stored (corpus): **330** · ECUs: **30** · syntheses: **68

## Notes

- Claude and Grok scores are **never merged**.

- Form does **not** penalize the center score; it is the form arc only.

- Predatory venues: flagged + counted; weight zero is OFF for now.

- Inconclusive + low n is often the confidence ceiling (SPEC 13), not a bug.

- This report is **this run only** — other ingredients are not mixed in.
