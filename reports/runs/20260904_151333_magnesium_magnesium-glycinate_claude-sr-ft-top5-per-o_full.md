# BS-PROOF full audit report (claude-sr-ft-top5-per_o)

Generated: **2026-09-04 15:13 UTC**


scoring_model: v15-dose-unassessable-neutral

Ingredient: `magnesium` · Form: `magnesium_glycinate` · Mode: **claude-sr-ft-top5-per_o**

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

PRODUCT LOOKUP: RECOMPUTING ONE PRODUCT'S DOSE TERM
  PASS  benefit range is read off the row  
  PASS  no dose reproduces the run's own composite  a missing dose must take MISSING_DOSE_PENALTY, not a recomputed term
  PASS  a dose inside the benefit range outscores one far below it  6000 mg -> 70, 1000 mg -> 44
  PASS  three dose-axis states, not two  
  PASS  an assessable axis is unchanged by v15  v15 must move ONLY the unassessable case
  PASS  no derivable benefit range is neutral, not punished  the effect term already prices 'nothing worked'; punishing it again in the dose slot double-counts the same evidence
  PASS  withholding the product dose is still punished  None keeps the caller's MISSING_DOSE_PENALTY fallback
  PASS  declaring a bad dose beats hiding it  far-but-declared 44 vs withheld 42 -- a product must not profit from silence about its own label
  PASS  an unassessable axis outscores a dose measured far from the evidence  unassessable 56 vs measured-far 44: not knowing is not the same finding as knowing it is wrong
  PASS  the synthetic demo artifact can never back a product answer  
  PASS  a real run is not mistaken for the demo  
  PASS  invalid runs cannot back a displayed score  
  PASS  a row with no form strength is refused, not inverted  
  PASS  an ingredient with no run returns not_scored, never a number  
  PASS  bounded compound product conversion is refused  never pass a bounded low endpoint as an exact elemental dose
  PASS  known compound product conversion is accepted  known-form compound input is converted inside score_product
  PASS  a form with no run is distinguished from an ingredient with no run  ['creatine_monohydrate']
  PASS  available products all carry a validity status  2 product(s) offered
  PASS  no available product claims public-claim approval it was not granted  flip this test the day a run is genuinely validated

ALL PASSED
```

## This run — extraction stats

- Targeted studies: **70**
- Succeeded (usable): **70**
- Skipped (no text): **0**
- Partial agent failures: **29**
- Prompt version: `v1.28`
- Concurrency: 40  |  studies in flight: 40

## Token + cost accounting

- Extraction backend: **Claude subscription** (`--safe-mode`, `--max-turns 1`, one shot per call)
- Model calls: **523** (cache hits 44, failures 139)
- Input tokens: **5,565,936** (fresh 166,046 · cache-write 1,803,798 · cache-read 3,596,092)
- Output tokens: **758,495**
- **Spent on this run: $0.00** — subscription, not metered.
- **API-equivalent cost: $18.907** — what the same work would cost billed per token.
- Per study: **7.5 calls**, **$0.2701** API-equivalent across 70 scored studies.

| Agent | Tier | Model | Calls | Cache hits | Fail | In | Out | API-equiv |
|---|---|---|--:|--:|--:|--:|--:|--:|
| S2 | B | `claude-sonnet-5` | 0 | 44 | 0 | 0 | 0 | $0.000 |
| S3 | B | `claude-sonnet-5` | 83 | 0 | 15 | 1,066,555 | 76,014 | $3.902 |
| S4 | B | `claude-sonnet-5` | 76 | 0 | 6 | 398,902 | 38,176 | $1.481 |
| S5 | B | `claude-sonnet-5` | 84 | 0 | 15 | 1,845,187 | 324,035 | $7.106 |
| S6B | C | `claude-sonnet-5` | 66 | 0 | 2 | 325,068 | 56,840 | $1.156 |
| S7 | B | `claude-sonnet-5` | 144 | 0 | 101 | 1,753,216 | 124,599 | $4.283 |
| S8 | A | `claude-haiku-4-5-20251001` | 70 | 0 | 0 | 177,008 | 138,831 | $0.979 |

Tier → model is pinned in `claude_adapter.TIER_MODEL` (full ids, never aliases: an alias floats to a new model while the cache key does not change). Tier A = classification, B = extraction, C = the highest-risk agent.

## Predatory journal check (flag only — not in score)

- List entries loaded: **1162**
- Studies checked: **744**
- Publisher resolved for: **556/744** (the list is PUBLISHERS, so this is the real coverage)
- Studies flagged predatory: **6**
- Distinct publishers flagged: **2**
- Distinct journals flagged: **0**
- Affects score: **NO (count only)**
  - [publisher] AME Publishing Company
  - [publisher] Frontiers Media SA

## Systematic reviews / meta-analyses (S2)

- Requested (cap): **60**
- S2 extractions ok: **44**
- Resolved for multiplier: **38**
_SRs never add patients; only a capped confidence boost (≤ +30%)._

## Per-agent success rates (this run)

| Agent | Studies OK | Studies failed | Cache | Retries | Why it failed |
|---|---:|---:|---:|---:|---|
| S3 | 68 | 2 | 0 | 13 | exit 1: max_turns (x2) |
| S4 | 70 | 0 | 0 | 6 | — |
| S5 | 69 | 1 | 0 | 14 | exit 1: max_turns (x1) |
| S7 | 43 | 27 | 0 | 74 | exit 1: max_turns (x27) |
| S8 | 70 | 0 | 0 | 0 | — |

_One row per STUDY. The cost table above counts CLI ATTEMPTS, so its totals are higher by exactly the retries column._

**Telemetry does not reconcile — do not quote these rates:**
- S2: 0 attempts in the cost table but no row in the success table -- its failures are invisible to anyone reading success rates
- S6B: 66 attempts in the cost table but no row in the success table -- its failures are invisible to anyone reading success rates

## SPEED REPORT
_Not available._

## Studies extracted this run (70)

| # | Year | Title | DOI / PMID | Journal | OA | Predatory |
|---:|---:|---|---|---|---|---|
| 1 | 2026 | The effect of oral magnesium supplementation on glycemic control and metabolic p | [10.3389/fendo.2026.1883483](https://doi.org/10.3389/fendo.2026.1883483) | Frontiers in endocrinology | full_text | YES |
| 2 | 2026 | Efficacy of a Naturally Calcium and Magnesium-Rich Mineral Water on Musculoskele | [10.3390/nu18030470](https://doi.org/10.3390/nu18030470) | Nutrients | full_text | no |
| 3 | 2025 | Therapeutic efficacy of quetiapine combined with magnesium valproate in schizoph | [10.1097/md.0000000000045955](https://doi.org/10.1097/md.0000000000045955) | Medicine | full_text | no |
| 4 | 2025 | Beneficial Effects of Long-Lasting Bicarbonate-Sulfate-Calcium-Magnesium Water I | [10.3390/nu17213452](https://doi.org/10.3390/nu17213452) | Nutrients | full_text | no |
| 5 | 2025 | The Association of Gut Microbiota With TRPM7 Genotype, Colorectal Polyps, and Ma | [10.1016/j.tjnut.2025.07.015](https://doi.org/10.1016/j.tjnut.2025.07.015) | The Journal of nutrition | full_text | no |
| 6 | 2025 | Effects of a &lt;i&gt;Scutellaria baicalensis&lt;/i&gt;/&lt;i&gt;Crataegus laevi | [10.1177/02698811251381261](https://doi.org/10.1177/02698811251381261) | Journal of psychopharmacology (Oxford, E | full_text | no |
| 7 | 2024 | Magnesium and Hematoma Expansion in Intracerebral Hemorrhage: A FAST-MAG Randomi | [10.1161/strokeaha.123.043555](https://doi.org/10.1161/strokeaha.123.043555) | Stroke | full_text | no |
| 8 | 2024 | Probiotics and magnesium orotate for the treatment of major depressive disorder: | [10.1038/s41598-024-71093-z](https://doi.org/10.1038/s41598-024-71093-z) | Scientific reports | full_text | no |
| 9 | 2024 | Comparative Clinical Study on Magnesium Absorption and Side Effects After Oral I | [10.3390/nu16244367](https://doi.org/10.3390/nu16244367) | Nutrients | full_text | no |
| 10 | 2024 | Magnesium from Deep Seawater as a Potentially Effective Natural Product against  | [10.3390/medicina60081265](https://doi.org/10.3390/medicina60081265) | Medicina (Kaunas, Lithuania) | full_text | no |
| 11 | 2024 | Comparative Efficacy of Magnesium and Potassium Towards Cholesterol and Quality  | [10.1002/edm2.511](https://doi.org/10.1002/edm2.511) | Endocrinology, diabetes & metabolism | full_text | no |
| 12 | 2024 | Magnesium Supplementation Modulates T-cell Function in People with Type 2 Diabet | [10.1210/clinem/dgae097](https://doi.org/10.1210/clinem/dgae097) | The Journal of clinical endocrinology an | full_text | no |
| 13 | 2024 | Evaluation of Aluminum and Magnesium Absorption Following the Oral Administratio | [10.1007/s12325-024-02969-9](https://doi.org/10.1007/s12325-024-02969-9) | Advances in therapy | full_text | no |
| 14 | 2024 | Effects of magnesium and potassium supplementation on insomnia and sleep hormone | [10.3389/fendo.2024.1370733](https://doi.org/10.3389/fendo.2024.1370733) | Frontiers in endocrinology | full_text | YES |
| 15 | 2024 | Effects of Supplementing Zinc Magnesium Aspartate on Sleep Quality and Submaxima | [10.3390/nu16020251](https://doi.org/10.3390/nu16020251) | Nutrients | full_text | no |
| 16 | 2022 | Effects of Magnesium Citrate, Magnesium Oxide, and Magnesium Sulfate Supplementa | [10.1161/jaha.121.021783](https://doi.org/10.1161/jaha.121.021783) | Journal of the American Heart Associatio | full_text | no |
| 17 | 2023 | Relationship between short-term self-reported dietary magnesium intake and whole | [10.1080/07853890.2023.2195702](https://doi.org/10.1080/07853890.2023.2195702) | Annals of medicine | full_text | no |
| 18 | 2022 | Short-Term Magnesium Therapy Alleviates Moderate Stress in Patients with Fibromy | [10.3390/nu14102088](https://doi.org/10.3390/nu14102088) | Nutrients | full_text | no |
| 19 | 2022 | A Magtein<sup>®</sup>, Magnesium L-Threonate, -Based Formula Improves Brain Cogn | [10.3390/nu14245235](https://doi.org/10.3390/nu14245235) | Nutrients | full_text | no |
| 20 | 2022 | Effect of a Combination of Magnesium, B Vitamins, Rhodiola, and Green Tea (L-The | [10.3390/nu14091863](https://doi.org/10.3390/nu14091863) | Nutrients | full_text | no |
| 21 | 2022 | Effect of oral magnesium supplement on cardiometabolic markers in people with pr | [10.1038/s41598-022-20277-6](https://doi.org/10.1038/s41598-022-20277-6) | Scientific reports | full_text | no |
| 22 | 2022 | The effects of magnesium supplementation on abnormal uterine bleeding, alopecia, | [10.1186/s12958-022-00982-7](https://doi.org/10.1186/s12958-022-00982-7) | Reproductive biology and endocrinology : | full_text | no |
| 23 | 2022 | Magnesium-based resorbable scaffold vs permanent metallic sirolimus-eluting sten | [10.4244/eij-d-21-00651](https://doi.org/10.4244/eij-d-21-00651) | EuroIntervention : journal of EuroPCR in | full_text | no |
| 24 | 2021 | Long-term magnesium supplementation improves glucocorticoid metabolism: A post-h | [10.1111/cen.14350](https://doi.org/10.1111/cen.14350) | Clinical endocrinology | full_text | no |
| 25 | 2021 | The effect of vitamin D and magnesium supplementation on the mental health statu | [10.1186/s12887-021-02631-1](https://doi.org/10.1186/s12887-021-02631-1) | BMC pediatrics | full_text | no |
| 26 | 2021 | Efficacy and safety of calcium, magnesium, potassium, and sodium oxybates (lower | [10.1093/sleep/zsaa206](https://doi.org/10.1093/sleep/zsaa206) | Sleep | full_text | no |
| 27 | 2021 | Comparative study of magnesium, sodium valproate, and concurrent magnesium-sodiu | [10.1186/s10194-021-01234-6](https://doi.org/10.1186/s10194-021-01234-6) | The journal of headache and pain | full_text | no |
| 28 | 2021 | Magnesium Sulfate: an adjunctive therapy in the first hour of management of rapi | [PMID 33899191](https://pubmed.ncbi.nlm.nih.gov/33899191/) | La Tunisie medicale | full_text | no |
| 29 | 2021 | The Effect of Magnesium Supplementation on Endothelial Function: A Randomised Cr | [10.3390/ijerph18158169](https://doi.org/10.3390/ijerph18158169) | International journal of environmental r | full_text | no |
| 30 | 2021 | Magnesium treatment on methylation changes of transmembrane serine protease 2 (T | [10.1016/j.nut.2021.111340](https://doi.org/10.1016/j.nut.2021.111340) | Nutrition (Burbank, Los Angeles County,  | full_text | no |
| 31 | 2021 | The Acute Effect of Magnesium Supplementation on Endothelial Function: A Randomi | [10.3390/ijerph18105303](https://doi.org/10.3390/ijerph18105303) | International journal of environmental r | full_text | no |
| 32 | 2021 | Effect of magnesium and vitamin B6 supplementation on mental health and quality  | [10.1002/smi.3051](https://doi.org/10.1002/smi.3051) | Stress and health : journal of the Inter | full_text | no |
| 33 | 2020 | Effect of Magnesium Supplementation on Circulating Biomarkers of Cardiovascular  | [10.3390/nu12061697](https://doi.org/10.3390/nu12061697) | Nutrients | full_text | no |
| 34 | 2020 | Response of Vitamin D after Magnesium Intervention in a Postmenopausal Populatio | [10.3390/nu12082283](https://doi.org/10.3390/nu12082283) | Nutrients | full_text | no |
| 35 | 2020 | Natural Magnesium-Enriched Deep-Sea Water Improves Insulin Resistance and the Li | [10.3390/nu12020515](https://doi.org/10.3390/nu12020515) | Nutrients | full_text | no |
| 36 | 2020 | Consequences of Supraphysiological Dialysate Magnesium on Arterial Stiffness, He | [10.1007/s12325-020-01505-9](https://doi.org/10.1007/s12325-020-01505-9) | Advances in therapy | full_text | no |
| 37 | 2020 | Lactobacillus reuteri DSM 17938 and Magnesium Oxide in Children with Functional  | [10.3390/nu12010225](https://doi.org/10.3390/nu12010225) | Nutrients | full_text | no |
| 38 | 2020 | [Evaluation of drug-drug interactions between yimitasvir phosphate capsules with | [10.3760/cma.j.cn501113-20200907-00503](https://doi.org/10.3760/cma.j.cn501113-20200907-00503) | Zhonghua gan zang bing za zhi = Zhonghua | full_text | no |
| 39 | 2020 | Circulating Ionized Magnesium: Comparisons with Circulating Total Magnesium and  | [10.3390/nu12010263](https://doi.org/10.3390/nu12010263) | Nutrients | full_text | no |
| 40 | 2020 | Psychological and Sleep Effects of Tryptophan and Magnesium-Enriched Mediterrane | [10.3390/ijerph17072227](https://doi.org/10.3390/ijerph17072227) | International journal of environmental r | full_text | no |
| 41 | 2020 | Circulating Ionized Magnesium as a Measure of Supplement Bioavailability: Result | [10.3390/nu12051245](https://doi.org/10.3390/nu12051245) | Nutrients | full_text | no |
| 42 | 2019 | Effects of Bardoxolone Methyl on Magnesium in Patients with Type 2 Diabetes Mell | [10.1159/000500612](https://doi.org/10.1159/000500612) | Cardiorenal medicine | full_text | no |
| 43 | 2019 | A randomized clinical prospective trial comparing split-dose picosulfate/ magnes | [10.1371/journal.pone.0211136](https://doi.org/10.1371/journal.pone.0211136) | PloS one | full_text | no |
| 44 | 2018 | The Effects of Oral Magnesium Supplementation on Glycemic Response among Type 2  | [10.3390/nu11010044](https://doi.org/10.3390/nu11010044) | Nutrients | full_text | no |
| 45 | 2020 | The Effects of Long-Term Magnesium Creatine Chelate Supplementation on Repeated  | [10.3390/nu12102961](https://doi.org/10.3390/nu12102961) | Nutrients | full_text | no |
| 46 | 2019 | Control of metabolic predisposition to cardiovascular complications of chronic k | [10.1007/s40620-018-0559-2](https://doi.org/10.1007/s40620-018-0559-2) | Journal of nephrology | full_text | no |
| 47 | 2019 | A Randomized Trial of Magnesium Oxide and Oral Carbon Adsorbent for Coronary Art | [10.1681/asn.2018111150](https://doi.org/10.1681/asn.2018111150) | Journal of the American Society of Nephr | full_text | no |
| 48 | 2018 | Superiority of magnesium and vitamin B6 over magnesium alone on severe stress in | [10.1371/journal.pone.0208454](https://doi.org/10.1371/journal.pone.0208454) | PloS one | full_text | no |
| 49 | 2017 | Effect of Magnesium Supplements on Insulin Secretion After Kidney Transplantatio | [10.12659/aot.903439](https://doi.org/10.12659/aot.903439) | Annals of transplantation | full_text | no |
| 50 | 2019 | Calcium: magnesium intake ratio and colorectal carcinogenesis, results from the  | [10.1038/s41416-019-0579-2](https://doi.org/10.1038/s41416-019-0579-2) | British journal of cancer | full_text | no |
| 51 | 2017 | Effects of long-term magnesium supplementation on endothelial function and cardi | [10.1038/s41598-017-00205-9](https://doi.org/10.1038/s41598-017-00205-9) | Scientific reports | full_text | no |
| 52 | 2015 | The effect of acute vs chronic magnesium supplementation on exercise and recover | [10.1186/s12970-015-0081-z](https://doi.org/10.1186/s12970-015-0081-z) | Journal of the International Society of  | full_text | no |
| 53 | 2017 | The effect of magnesium supplementation on vascular calcification in chronic kid | [10.1136/bmjopen-2017-016795](https://doi.org/10.1136/bmjopen-2017-016795) | BMJ open | full_text | no |
| 54 | 2011 | Magnesium supplementation, metabolic and inflammatory markers, and global genomi | [10.3945/ajcn.110.002949](https://doi.org/10.3945/ajcn.110.002949) | The American journal of clinical nutriti | full_text | no |
| 55 | 2017 | Efficacy of alginate-based reflux suppressant and magnesium-aluminium antacid ge | [10.1038/srep44830](https://doi.org/10.1038/srep44830) | Scientific reports | full_text | no |
| 56 | 2016 | Effects of Potassium Magnesium Citrate Supplementation on 24-Hour Ambulatory Blo | [10.1016/j.amjcard.2016.06.041](https://doi.org/10.1016/j.amjcard.2016.06.041) | The American journal of cardiology | full_text | no |
| 57 | 2026 | Serum magnesium is linked with sperm concentration, motile sperm count and serum | [10.1016/j.rbmo.2025.105232](https://doi.org/10.1016/j.rbmo.2025.105232) | Reproductive biomedicine online | abstract_only | no |
| 58 | 2015 | Comparison of the pharmacokinetics and tolerability of HCP1004 (a fixed-dose com | [10.2147/dddt.s86725](https://doi.org/10.2147/dddt.s86725) | Drug design, development and therapy | full_text | no |
| 59 | 2015 | Improvement of migraine symptoms with a proprietary supplement containing ribofl | [10.1186/s10194-015-0516-6](https://doi.org/10.1186/s10194-015-0516-6) | The journal of headache and pain | full_text | no |
| 60 | 2016 | Effect of Spirulina maxima Supplementation on Calcium, Magnesium, Iron, and Zinc | [10.1007/s12011-016-0623-5](https://doi.org/10.1007/s12011-016-0623-5) | Biological trace element research | full_text | no |
| 61 | 2025 | Comparing the Bioavailability of Two Seawater-Derived Magnesium Preparations. | [10.1177/1096620x251380191](https://doi.org/10.1177/1096620x251380191) | Journal of medicinal food | abstract_only | no |
| 62 | 2015 | Indomethacin, amiloride, or eplerenone for treating hypokalemia in Gitelman synd | [10.1681/asn.2014030293](https://doi.org/10.1681/asn.2014030293) | Journal of the American Society of Nephr | full_text | no |
| 63 | 2013 | Dietary magnesium intake improves insulin resistance among non-diabetic individu | [10.3390/nu5103910](https://doi.org/10.3390/nu5103910) | Nutrients | full_text | no |
| 64 | 2015 | Oral magnesium for relief in pregnancy-induced leg cramps: a randomised controll | [10.1111/j.1740-8709.2012.00440.x](https://doi.org/10.1111/j.1740-8709.2012.00440.x) | Maternal & child nutrition | full_text | no |
| 65 | 2020 | Impact of magnesium supplementation, in combination with vitamin B6, on stress a | [10.1684/mrh.2020.0468](https://doi.org/10.1684/mrh.2020.0468) | Magnesium research | abstract_only | no |
| 66 | 2013 | Magnesium retention from metabolic-balance studies in female adolescents: impact | [10.3945/ajcn.112.039867](https://doi.org/10.3945/ajcn.112.039867) | The American journal of clinical nutriti | full_text | no |
| 67 | 2020 | Serum magnesium, hepatocyte nuclear factor 1β genotype and post-transplant diabe | [10.1093/ndt/gfz145](https://doi.org/10.1093/ndt/gfz145) | Nephrology, dialysis, transplantation :  | abstract_only | no |
| 68 | 2011 | Feasibility and antihypertensive effect of replacing regular salt with mineral s | [10.1186/1475-2891-10-88](https://doi.org/10.1186/1475-2891-10-88) | Nutrition journal | full_text | no |
| 69 | 2025 | Dark Chocolate Mitigates Premenstrual Performance Impairments and Muscle Sorenes | [10.3390/nu17081374](https://doi.org/10.3390/nu17081374) | Nutrients | full_text | no |
| 70 | 2022 | Food and Nutrient Displacement by Walnut Supplementation in a Randomized Crossov | [10.3390/nu14051017](https://doi.org/10.3390/nu14051017) | Nutrients | full_text | no |

## ECU scores — this run only

| Outcome | 0–100 | Verdict | effect | in your form | at your dose | evidence | n |
|---|---:|---|---|---|---|---|---:|
| serum_magnesium | 21 | does not work | +0.12 @ 100% | not tested in your form | +0.18 @ 61% | 50% | 3 |
| blood_pressure | 6 | works, but not tested for your product | +0.30 @ 100% | not tested in your form | +0.30 @ 80% | 16% | 1 |
| glycaemic_control | 6 | does not work | +0.00 @ 100% | not tested in your form | +0.00 @ 10% | 19% | 1 |
| adverse_events_any | gated | not enough human evidence | not tested | not tested | not tested | not tested | 0 |
| energy_levels | gated | not enough human evidence | not tested | not tested | not tested | not tested | 0 |

_0–100 = 100 × c × mean(effect, form, dose). Each arc shows its verdict and the share of evidence behind it. A low number with a FULL evidence arc means 'does not work'; with an EMPTY one it means 'barely studied'._


_Old rows from previous runs are not shown here._

## Which studies made each number

### serum_magnesium — signed +6

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `registry:nct02837328` | +6.10 | 0.425 | 0.3 | 4 | different |
| `registry:nct02235805` | +0.00 | 0.3074 | 0.0 | 4 | different |
| `doi:101038s41598017002059` | +0.00 | 0.3089 | 0.0 | 4 | different |
| **sum of all 3** | **+6.10** | | | | |

### blood_pressure — signed +5

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:101186s129700150081z` | +4.90 | 0.2673 | 0.3 | 4 | different |
| **sum of all 1** | **+4.90** | | | | |

### glycaemic_control — signed +0

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:101038s41598017002059` | +0.00 | 0.3089 | 0.0 | 4 | different |
| **sum of all 1** | **+0.00** | | | | |

_`points` sum to the signed score. NEGATIVE points mean that study pushed the score down. `w` is quality (design × RoB × size × funding × OA); `s` is what it found (+1.0 meaningful benefit, +0.3 trivial/unsized, −0.7 null, −1.0 harm). The two are separate on purpose: how good a study is and what it found are different facts._

## Database snapshot (`magnesium`)

_No `magnesium` database files found._

## Notes

- Claude and Grok scores are **never merged**.

- Form does **not** penalize the center score; it is the form arc only.

- Predatory venues: flagged + counted; weight zero is OFF for now.

- Inconclusive + low n is often the confidence ceiling (SPEC 13), not a bug.

- This report is **this run only** — other ingredients are not mixed in.
