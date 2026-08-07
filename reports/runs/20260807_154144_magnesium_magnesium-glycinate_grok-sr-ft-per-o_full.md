# BS-PROOF full audit report (grok-sr-ft-per_o)

Generated: **2026-08-07 15:41 UTC**


scoring_model: v2-four-arc

Ingredient: `magnesium` · Form: `magnesium_glycinate` · Mode: **grok-sr-ft-per_o**

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

- Targeted studies: **54**
- Succeeded (usable): **54**
- Skipped (no text): **0**
- Partial agent failures: **13**
- Prompt version: `v1.4+grok-cli-pure-function`
- Concurrency: 50  |  studies in flight: 40

## Predatory journal check (flag only — not in score)

- List entries loaded: **0**
- Studies checked: **164**
- Studies flagged predatory: **0**
- Distinct journals flagged: **0**
- Affects score: **NO (count only)**

## Systematic reviews / meta-analyses (S2)

- Requested (cap): **4**
- S2 extractions ok: **4**
- Resolved for multiplier: **1**
_SRs never add patients; only a capped confidence boost (≤ +30%)._

## Per-agent success rates (this run)

| Agent | OK | Fail | Cache | Why it failed |
|---|---:|---:|---:|---|
| S3 | 42 | 12 | 0 | exit 1: {
  "text": "Checking the workspace for the study input the extractor expects.",
  (x2); exit 1: {
  "text": "The schema and study input look truncated. Checking the workspace for (x2) |
| S4 | 54 | 0 | 0 | — |
| S5 | 54 | 0 | 0 | — |
| S7 | 53 | 1 | 0 | exit 124: timeout after 300s (x1) |
| S8 | 54 | 0 | 0 | — |

## SPEED REPORT

```text
============================================================
GROK SPEED REPORT
  concurrent limit (SP_GROK_CONCURRENCY): 50
  peak in-flight observed:               50
  live calls ok/fail/cache: 685/13/10
  timeouts: 1  auth failures: 0
  avg latency (ok): 72.1s   p95: 239.4s
  fail rate: 1.9%
  RECOMMENDATION: HEADROOM — optional set SP_GROK_CONCURRENCY=58
============================================================
```

## Studies extracted this run (54)

| # | Year | Title | DOI / PMID | Journal | OA | Predatory |
|---:|---:|---|---|---|---|---|
| 1 | 2026 | Efficacy of a Naturally Calcium and Magnesium-Rich Mineral Water on Musculoskele | [10.3390/nu18030470](https://doi.org/10.3390/nu18030470) | Nutrients | full_text | no |
| 2 | 2025 | Therapeutic efficacy of quetiapine combined with magnesium valproate in schizoph | [10.1097/md.0000000000045955](https://doi.org/10.1097/md.0000000000045955) | Medicine | full_text | no |
| 3 | 2025 | Beneficial Effects of Long-Lasting Bicarbonate-Sulfate-Calcium-Magnesium Water I | [10.3390/nu17213452](https://doi.org/10.3390/nu17213452) | Nutrients | full_text | no |
| 4 | 2025 | Effects of a &lt;i&gt;Scutellaria baicalensis&lt;/i&gt;/&lt;i&gt;Crataegus laevi | [10.1177/02698811251381261](https://doi.org/10.1177/02698811251381261) | Journal of psychopharmacology (Oxford, E | full_text | no |
| 5 | 2025 | The Association of Gut Microbiota With TRPM7 Genotype, Colorectal Polyps, and Ma | [10.1016/j.tjnut.2025.07.015](https://doi.org/10.1016/j.tjnut.2025.07.015) | The Journal of nutrition | full_text | no |
| 6 | 2024 | Probiotics and magnesium orotate for the treatment of major depressive disorder: | [10.1038/s41598-024-71093-z](https://doi.org/10.1038/s41598-024-71093-z) | Scientific reports | full_text | no |
| 7 | 2024 | Evaluation of Aluminum and Magnesium Absorption Following the Oral Administratio | [10.1007/s12325-024-02969-9](https://doi.org/10.1007/s12325-024-02969-9) | Advances in therapy | full_text | no |
| 8 | 2024 | Effects of magnesium and potassium supplementation on insomnia and sleep hormone | [10.3389/fendo.2024.1370733](https://doi.org/10.3389/fendo.2024.1370733) | Frontiers in endocrinology | full_text | no |
| 9 | 2024 | Comparative Efficacy of Magnesium and Potassium Towards Cholesterol and Quality  | [10.1002/edm2.511](https://doi.org/10.1002/edm2.511) | Endocrinology, diabetes & metabolism | full_text | no |
| 10 | 2024 | Effects of Supplementing Zinc Magnesium Aspartate on Sleep Quality and Submaxima | [10.3390/nu16020251](https://doi.org/10.3390/nu16020251) | Nutrients | full_text | no |
| 11 | 2024 | Comparative Clinical Study on Magnesium Absorption and Side Effects After Oral I | [10.3390/nu16244367](https://doi.org/10.3390/nu16244367) | Nutrients | full_text | no |
| 12 | 2024 | Magnesium from Deep Seawater as a Potentially Effective Natural Product against  | [10.3390/medicina60081265](https://doi.org/10.3390/medicina60081265) | Medicina (Kaunas, Lithuania) | full_text | no |
| 13 | 2024 | Magnesium and Hematoma Expansion in Intracerebral Hemorrhage: A FAST-MAG Randomi | [10.1161/strokeaha.123.043555](https://doi.org/10.1161/strokeaha.123.043555) | Stroke | full_text | no |
| 14 | 2024 | Magnesium Supplementation Modulates T-cell Function in People with Type 2 Diabet | [10.1210/clinem/dgae097](https://doi.org/10.1210/clinem/dgae097) | The Journal of clinical endocrinology an | full_text | no |
| 15 | 2023 | Relationship between short-term self-reported dietary magnesium intake and whole | [10.1080/07853890.2023.2195702](https://doi.org/10.1080/07853890.2023.2195702) | Annals of medicine | full_text | no |
| 16 | 2022 | Short-Term Magnesium Therapy Alleviates Moderate Stress in Patients with Fibromy | [10.3390/nu14102088](https://doi.org/10.3390/nu14102088) | Nutrients | full_text | no |
| 17 | 2022 | Effects of Magnesium Citrate, Magnesium Oxide, and Magnesium Sulfate Supplementa | [10.1161/jaha.121.021783](https://doi.org/10.1161/jaha.121.021783) | Journal of the American Heart Associatio | full_text | no |
| 18 | 2022 | Effect of oral magnesium supplement on cardiometabolic markers in people with pr | [10.1038/s41598-022-20277-6](https://doi.org/10.1038/s41598-022-20277-6) | Scientific reports | full_text | no |
| 19 | 2022 | The effects of magnesium supplementation on abnormal uterine bleeding, alopecia, | [10.1186/s12958-022-00982-7](https://doi.org/10.1186/s12958-022-00982-7) | Reproductive biology and endocrinology : | full_text | no |
| 20 | 2022 | A Magtein<sup>®</sup>, Magnesium L-Threonate, -Based Formula Improves Brain Cogn | [10.3390/nu14245235](https://doi.org/10.3390/nu14245235) | Nutrients | full_text | no |
| 21 | 2022 | Effect of a Combination of Magnesium, B Vitamins, Rhodiola, and Green Tea (L-The | [10.3390/nu14091863](https://doi.org/10.3390/nu14091863) | Nutrients | full_text | no |
| 22 | 2022 | Association of the Serum Folate and Total Calcium and Magnesium Levels Before Ov | [10.3389/fendo.2022.732731](https://doi.org/10.3389/fendo.2022.732731) | Frontiers in endocrinology | full_text | no |
| 23 | 2021 | Comparative study of magnesium, sodium valproate, and concurrent magnesium-sodiu | [10.1186/s10194-021-01234-6](https://doi.org/10.1186/s10194-021-01234-6) | The journal of headache and pain | full_text | no |
| 24 | 2021 | Efficacy and safety of calcium, magnesium, potassium, and sodium oxybates (lower | [10.1093/sleep/zsaa206](https://doi.org/10.1093/sleep/zsaa206) | Sleep | full_text | no |
| 25 | 2021 | Effect of magnesium and vitamin B6 supplementation on mental health and quality  | [10.1002/smi.3051](https://doi.org/10.1002/smi.3051) | Stress and health : journal of the Inter | full_text | no |
| 26 | 2021 | The effect of vitamin D and magnesium supplementation on the mental health statu | [10.1186/s12887-021-02631-1](https://doi.org/10.1186/s12887-021-02631-1) | BMC pediatrics | full_text | no |
| 27 | 2021 | Long-term magnesium supplementation improves glucocorticoid metabolism: A post-h | [10.1111/cen.14350](https://doi.org/10.1111/cen.14350) | Clinical endocrinology | full_text | no |
| 28 | 2021 | Magnesium treatment on methylation changes of transmembrane serine protease 2 (T | [10.1016/j.nut.2021.111340](https://doi.org/10.1016/j.nut.2021.111340) | Nutrition (Burbank, Los Angeles County,  | full_text | no |
| 29 | 2020 | Effect of Magnesium Supplementation on Circulating Biomarkers of Cardiovascular  | [10.3390/nu12061697](https://doi.org/10.3390/nu12061697) | Nutrients | full_text | no |
| 30 | 2020 | Lactobacillus reuteri DSM 17938 and Magnesium Oxide in Children with Functional  | [10.3390/nu12010225](https://doi.org/10.3390/nu12010225) | Nutrients | full_text | no |
| 31 | 2020 | Psychological and Sleep Effects of Tryptophan and Magnesium-Enriched Mediterrane | [10.3390/ijerph17072227](https://doi.org/10.3390/ijerph17072227) | International journal of environmental r | full_text | no |
| 32 | 2020 | Response of Vitamin D after Magnesium Intervention in a Postmenopausal Populatio | [10.3390/nu12082283](https://doi.org/10.3390/nu12082283) | Nutrients | full_text | no |
| 33 | 2020 | The Effects of Long-Term Magnesium Creatine Chelate Supplementation on Repeated  | [10.3390/nu12102961](https://doi.org/10.3390/nu12102961) | Nutrients | full_text | no |
| 34 | 2020 | Natural Magnesium-Enriched Deep-Sea Water Improves Insulin Resistance and the Li | [10.3390/nu12020515](https://doi.org/10.3390/nu12020515) | Nutrients | full_text | no |
| 35 | 2019 | A Randomized Trial of Magnesium Oxide and Oral Carbon Adsorbent for Coronary Art | [10.1681/asn.2018111150](https://doi.org/10.1681/asn.2018111150) | Journal of the American Society of Nephr | full_text | no |
| 36 | 2018 | Superiority of magnesium and vitamin B6 over magnesium alone on severe stress in | [10.1371/journal.pone.0208454](https://doi.org/10.1371/journal.pone.0208454) | PloS one | full_text | no |
| 37 | 2018 | Effect of magnesium on cognition after aneurysmal subarachnoid haemorrhage in a  | [10.1111/ene.13764](https://doi.org/10.1111/ene.13764) | European journal of neurology | full_text | no |
| 38 | 2018 | Genetic Variation, Magnesium Sulfate Exposure, and Adverse Neurodevelopmental Ou | [10.1055/s-0038-1635109](https://doi.org/10.1055/s-0038-1635109) | American journal of perinatology | full_text | no |
| 39 | 2017 | The effect of magnesium supplementation on vascular calcification in chronic kid | [10.1136/bmjopen-2017-016795](https://doi.org/10.1136/bmjopen-2017-016795) | BMJ open | full_text | no |
| 40 | 2017 | Efficacy of alginate-based reflux suppressant and magnesium-aluminium antacid ge | [10.1038/srep44830](https://doi.org/10.1038/srep44830) | Scientific reports | full_text | no |
| 41 | 2017 | Effects of long-term magnesium supplementation on endothelial function and cardi | [10.1038/s41598-017-00205-9](https://doi.org/10.1038/s41598-017-00205-9) | Scientific reports | full_text | no |
| 42 | 2016 | Effect of Spirulina maxima Supplementation on Calcium, Magnesium, Iron, and Zinc | [10.1007/s12011-016-0623-5](https://doi.org/10.1007/s12011-016-0623-5) | Biological trace element research | full_text | no |
| 43 | 2015 | Oral magnesium for relief in pregnancy-induced leg cramps: a randomised controll | [10.1111/j.1740-8709.2012.00440.x](https://doi.org/10.1111/j.1740-8709.2012.00440.x) | Maternal & child nutrition | full_text | no |
| 44 | 2015 | Improvement of migraine symptoms with a proprietary supplement containing ribofl | [10.1186/s10194-015-0516-6](https://doi.org/10.1186/s10194-015-0516-6) | The journal of headache and pain | full_text | no |
| 45 | 2015 | The effect of acute vs chronic magnesium supplementation on exercise and recover | [10.1186/s12970-015-0081-z](https://doi.org/10.1186/s12970-015-0081-z) | Journal of the International Society of  | full_text | no |
| 46 | 2015 | Comparison of the pharmacokinetics and tolerability of HCP1004 (a fixed-dose com | [10.2147/dddt.s86725](https://doi.org/10.2147/dddt.s86725) | Drug design, development and therapy | full_text | no |
| 47 | 2013 | Magnesium retention from metabolic-balance studies in female adolescents: impact | [10.3945/ajcn.112.039867](https://doi.org/10.3945/ajcn.112.039867) | The American journal of clinical nutriti | full_text | no |
| 48 | 2013 | Dietary magnesium intake improves insulin resistance among non-diabetic individu | [10.3390/nu5103910](https://doi.org/10.3390/nu5103910) | Nutrients | full_text | no |
| 49 | 2012 | The effect of different dialysate magnesium concentrations on QTc dispersion in  | [10.3109/0886022x.2012.656561](https://doi.org/10.3109/0886022x.2012.656561) | Renal failure | full_text | no |
| 50 | 2010 | Evaluation of calcium acetate/magnesium carbonate as a phosphate binder compared | [10.1093/ndt/gfq292](https://doi.org/10.1093/ndt/gfq292) | Nephrology, dialysis, transplantation :  | full_text | no |
| 51 | 2008 | Magnesium carbonate for phosphate control in patients on hemodialysis. A randomi | [10.1007/s11255-007-9300-0](https://doi.org/10.1007/s11255-007-9300-0) | International urology and nephrology | full_text | no |
| 52 | 2008 | Magnesium treatment in alcoholics: a randomized clinical trial. | [10.1186/1747-597x-3-1](https://doi.org/10.1186/1747-597x-3-1) | Substance abuse treatment, prevention, a | full_text | no |
| 53 | 1999 | Effect of chronic magnesium supplementation on magnesium distribution in healthy | [10.1046/j.1365-2125.1999.00063.x](https://doi.org/10.1046/j.1365-2125.1999.00063.x) | British journal of clinical pharmacology | full_text | no |
| 54 | 1994 | Effects of boron supplementation on bone mineral density and dietary, blood, and | [10.1289/ehp.94102s779](https://doi.org/10.1289/ehp.94102s779) | Environmental health perspectives | full_text | no |

## ECU scores — this run only

| Outcome | 0–100 | Verdict | effect | in your form | at your dose | evidence | n |
|---|---:|---|---|---|---|---|---:|
| serum_magnesium | 30 | probably does not work | -0.22 @ 100% | not tested | +0.11 @ 9% | 90% | 48 |
| memory | 24 | works, but not tested for your product | +0.30 @ 100% | not tested | +0.30 @ 100% | 51% | 6 |
| adverse_events_any | 19 | does not work | +0.17 @ 100% | not tested | +0.30 @ 11% | 44% | 8 |
| blood_pressure | 15 | does not work | -0.41 @ 100% | not tested | -0.30 @ 64% | 64% | 14 |
| muscle_strength | 15 | does not work | -0.42 @ 100% | not tested | +0.15 @ 11% | 48% | 8 |
| glycaemic_control | 12 | does not work | -0.34 @ 100% | not tested | -0.70 @ 58% | 70% | 17 |
| lean_body_mass | 10 | works, but not tested for your product | +0.30 @ 100% | not tested | not tested | 38% | 4 |
| cortisol | 9 | works, but not tested for your product | +0.30 @ 100% | not tested | not tested | 33% | 5 |
| muscle_cramps | 8 | barely studied | +1.00 @ 100% | +1.00 @ 100% | not tested | 12% | 2 |
| adverse_events_gi | 7 | does not work | -0.48 @ 100% | +0.30 @ 25% | -1.00 @ 60% | 23% | 5 |
| cognitive_function | 7 | barely studied | +0.15 @ 100% | not tested | +1.00 @ 50% | 12% | 6 |
| depressive_symptoms | 7 | does not work | -0.51 @ 100% | not tested | -0.70 @ 2% | 50% | 10 |
| muscle_power | 7 | works, but not tested for your product | +0.56 @ 100% | not tested | not tested | 22% | 7 |
| anxiety | 4 | does not work | -0.49 @ 100% | not tested | -0.70 @ 4% | 28% | 6 |
| perceived_stress | 4 | does not work | -0.19 @ 100% | not tested | not tested | 26% | 7 |
| digestive_comfort | 3 | does not work | -0.50 @ 100% | not tested | not tested | 26% | 5 |
| energy_levels | 2 | barely studied | -0.70 @ 100% | not tested | -0.70 @ 8% | 14% | 7 |
| exercise_recovery | 2 | barely studied | -0.35 @ 100% | not tested | -0.35 @ 100% | 7% | 2 |
| inflammation_crp | 2 | does not work | -0.70 @ 100% | not tested | -0.70 @ 96% | 21% | 4 |
| sleep_quality | 1 | barely studied | -0.70 @ 100% | not tested | not tested | 10% | 3 |
| sleep_duration | 0 | barely studied | -1.00 @ 100% | not tested | not tested | 9% | 2 |
| sleep_onset | 0 | barely studied | -0.70 @ 100% | not tested | not tested | 4% | 1 |

_0–100 = 100 × c × mean(effect, form, dose). Each arc shows its verdict and the share of evidence behind it. A low number with a FULL evidence arc means 'does not work'; with an EMPTY one it means 'barely studied'._


_Old rows from previous runs are not shown here._

## Database snapshot (`magnesium`)

### `grok_magnesium.sqlite`

Studies stored (corpus): **200** · ECUs: **22** · syntheses: **52

### `grok_magnesium_inte.sqlite`

Studies stored (corpus): **431** · ECUs: **16** · syntheses: **96

### `grok_magnesium_per_.sqlite`

Studies stored (corpus): **260** · ECUs: **22** · syntheses: **96

## Notes

- Claude and Grok scores are **never merged**.

- Form does **not** penalize the center score; it is the form arc only.

- Predatory venues: flagged + counted; weight zero is OFF for now.

- Inconclusive + low n is often the confidence ceiling (SPEC 13), not a bug.

- This report is **this run only** — other ingredients are not mixed in.
