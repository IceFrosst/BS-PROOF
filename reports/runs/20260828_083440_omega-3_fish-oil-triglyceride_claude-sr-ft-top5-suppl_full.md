# BS-PROOF full audit report (claude-sr-ft-top5-suppl)

Generated: **2026-08-28 08:34 UTC**


scoring_model: v13-universal-negative-contract

Ingredient: `omega_3` · Form: `fish_oil_triglyceride` · Mode: **claude-sr-ft-top5-suppl**

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

PRODUCT LOOKUP: RECOMPUTING ONE PRODUCT'S DOSE TERM
  PASS  benefit range is read off the row  
  PASS  no dose reproduces the run's own composite  a missing dose must take MISSING_DOSE_PENALTY, not a recomputed term
  PASS  a dose inside the benefit range outscores one far below it  6000 mg -> 70, 1000 mg -> 44
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

- Targeted studies: **130**
- Succeeded (usable): **130**
- Skipped (no text): **0**
- Partial agent failures: **6**
- Prompt version: `v1.28`
- Concurrency: 40  |  studies in flight: 40

## Token + cost accounting

- Extraction backend: **Claude subscription** (`--safe-mode`, `--max-turns 1`, one shot per call)
- Model calls: **805** (cache hits 101, failures 100)
- Input tokens: **unavailable** (not recorded for every call)
- Output tokens: **unavailable** (not recorded for every call)
- **Spent on this run: $0.00** — subscription, not metered.
- **API-equivalent cost: unavailable** — what the same work would cost billed per token.
- Per study: **6.2 calls**, **unavailable** API-equivalent across 130 scored studies.

| Agent | Tier | Model | Calls | Cache hits | Fail | In | Out | API-equiv |
|---|---|---|--:|--:|--:|--:|--:|--:|
| S2 | B | `claude-sonnet-5` | 17 | 36 | 3 | 114,435 | 23,580 | $0.530 |
| S3 | B | `claude-sonnet-5` | 137 | 11 | 20 | 1,721,015 | 145,883 | $6.037 |
| S4 | B | `claude-sonnet-5` | 128 | 11 | 9 | unavailable | unavailable | unavailable |
| S5 | B | `claude-sonnet-5` | 132 | 11 | 15 | unavailable | unavailable | unavailable |
| S6B | C | `claude-sonnet-5` | 122 | 10 | 18 | unavailable | unavailable | unavailable |
| S7 | B | `claude-sonnet-5` | 148 | 11 | 32 | unavailable | unavailable | unavailable |
| S8 | A | `claude-haiku-4-5-20251001` | 121 | 11 | 3 | unavailable | unavailable | unavailable |

Tier → model is pinned in `claude_adapter.TIER_MODEL` (full ids, never aliases: an alias floats to a new model while the cache key does not change). Tier A = classification, B = extraction, C = the highest-risk agent.

## Predatory journal check (flag only — not in score)

- List entries loaded: **1162**
- Studies checked: **576**
- Publisher resolved for: **396/576** (the list is PUBLISHERS, so this is the real coverage)
- Studies flagged predatory: **4**
- Distinct publishers flagged: **2**
- Distinct journals flagged: **0**
- Affects score: **NO (count only)**
  - [publisher] AME Publishing Company
  - [publisher] Frontiers Media SA

## Systematic reviews / meta-analyses (S2)

- Requested (cap): **60**
- S2 extractions ok: **50**
- Resolved for multiplier: **42**
_SRs never add patients; only a capped confidence boost (≤ +30%)._

## Per-agent success rates (this run)

| Agent | Studies OK | Studies failed | Cache | Retries | Why it failed |
|---|---:|---:|---:|---:|---|
| S3 | 128 | 2 | 11 | 7 | exit 1: max_turns (x2) |
| S4 | 130 | 0 | 11 | 0 | — |
| S5 | 128 | 2 | 11 | 2 | exit -9:  (x1); exit -9: Ignoring 16 permissions.allow entries from .claude/settings.json: this workspace  (x1) |
| S7 | 127 | 3 | 11 | 18 | exit 1: max_turns (x2); exit -9: Ignoring 16 permissions.allow entries from .claude/settings.json: this workspace  (x1) |
| S8 | 129 | 1 | 11 | 0 | exit -9: Ignoring 16 permissions.allow entries from .claude/settings.json: this workspace  (x1) |

_One row per STUDY. The cost table above counts CLI ATTEMPTS, so its totals are higher by exactly the retries column._

**Telemetry does not reconcile — do not quote these rates:**
- S2: 17 attempts in the cost table but no row in the success table -- its failures are invisible to anyone reading success rates
- S6B: 122 attempts in the cost table but no row in the success table -- its failures are invisible to anyone reading success rates
- S4: 128 attempts for 130 studies -- impossible, every study needs at least one attempt
- S8: 121 attempts for 130 studies -- impossible, every study needs at least one attempt

## SPEED REPORT
_Not available._

## Studies extracted this run (130)

| # | Year | Title | DOI / PMID | Journal | OA | Predatory |
|---:|---:|---|---|---|---|---|
| 1 | 2026 | Effect of 21-Day Omega-3 Polyunsaturated Fatty Acid Supplementation on Exercise- | [10.3390/nu18030539](https://doi.org/10.3390/nu18030539) | Nutrients | full_text | no |
| 2 | 2026 | Improved muscle recovery after omega-3 supplementation is associated with increa | [10.1038/s41598-026-44339-1](https://doi.org/10.1038/s41598-026-44339-1) | Scientific reports | full_text | no |
| 3 | 2026 | Effects of 8 Weeks of Resistance Training Combined with a High-Protein Diet and  | [10.3390/nu18040611](https://doi.org/10.3390/nu18040611) | Nutrients | full_text | no |
| 4 | 2026 | Factors associated with adherence to allocated treatment in the ASCEND trial: a  | [10.1186/s13063-026-09551-4](https://doi.org/10.1186/s13063-026-09551-4) | Trials | full_text | no |
| 5 | 2026 | A multicomponent intervention consisting of exercise, proteins and omega-3 suppl | [10.1016/j.tjfa.2025.100129](https://doi.org/10.1016/j.tjfa.2025.100129) | The Journal of frailty & aging | full_text | no |
| 6 | 2026 | Investigating enhancement of learning and memory following supplementation with  | [10.1007/s00394-026-04012-9](https://doi.org/10.1007/s00394-026-04012-9) | European journal of nutrition | full_text | no |
| 7 | 2026 | Effects of Structured Lipid Supplementation for Eight Weeks on Substrate Utiliza | [10.3390/nu18040567](https://doi.org/10.3390/nu18040567) | Nutrients | full_text | no |
| 8 | 2026 | Do the effects of krill oil supplementation on skeletal muscle function and size | [10.1016/j.jnha.2025.100747](https://doi.org/10.1016/j.jnha.2025.100747) | The journal of nutrition, health & aging | full_text | no |
| 9 | 2026 | Microencapsulated docosahexaenoic acid increases the Omega-3 Index and attenuate | [10.1007/s00394-026-03998-6](https://doi.org/10.1007/s00394-026-03998-6) | European journal of nutrition | full_text | no |
| 10 | 2026 | Effect of isotretinoin and omega-3 fatty acid combination on lipid metabolism in | [10.1186/s12944-026-02902-9](https://doi.org/10.1186/s12944-026-02902-9) | Lipids in health and disease | full_text | no |
| 11 | 2026 | Effects of EPA+DHA and Corn Oil Supplementation on PUFA Concentrations across Pl | [10.1016/j.tjnut.2025.101274](https://doi.org/10.1016/j.tjnut.2025.101274) | The Journal of nutrition | full_text | no |
| 12 | 2026 | Modulation of inflammasome components in patients with heart failure using oral  | [10.1007/s00394-025-03878-5](https://doi.org/10.1007/s00394-025-03878-5) | European journal of nutrition | full_text | no |
| 13 | 2026 | Maternal characteristics associated with ovalbumin concentrations in breast milk | [10.1111/pai.70365](https://doi.org/10.1111/pai.70365) | Pediatric allergy and immunology : offic | full_text | no |
| 14 | 2026 | Effects of eight weeks of eicosapentaenoic acid and medium-chain triacylglycerol | [10.1080/15502783.2026.2658774](https://doi.org/10.1080/15502783.2026.2658774) | Journal of the International Society of  | full_text | no |
| 15 | 2026 | Effects of a nutritional supplement containing fish protein, vitamin D, and ω3 f | [10.1007/s00394-026-03983-z](https://doi.org/10.1007/s00394-026-03983-z) | European journal of nutrition | full_text | no |
| 16 | 2026 | Marine n-3 fatty acid treatment for carotid plaques in patients with type 2 diab | [10.1186/s12933-026-03082-7](https://doi.org/10.1186/s12933-026-03082-7) | Cardiovascular diabetology | full_text | no |
| 17 | 2026 | Effect of a culturally adapted heart-healthy diet with phytosterols and/or krill | [10.1136/bmjopen-2026-119951](https://doi.org/10.1136/bmjopen-2026-119951) | BMJ open | full_text | no |
| 18 | 2026 | Association between lid margin collarettes and dry eye disease severity in the D | [10.1038/s41433-025-04105-5](https://doi.org/10.1038/s41433-025-04105-5) | Eye (London, England) | full_text | no |
| 19 | 2026 | ω-3 Fatty Acids in Pediatric Major Depressive Disorder: A Randomized Clinical Tr | [10.1001/jamanetworkopen.2025.48703](https://doi.org/10.1001/jamanetworkopen.2025.48703) | JAMA network open | full_text | no |
| 20 | 2025 | The anti-inflammatory effects of three different dietary supplement intervention | [10.1186/s12967-025-07167-x](https://doi.org/10.1186/s12967-025-07167-x) | Journal of translational medicine | full_text | no |
| 21 | 2025 | Efficacy of probiotic co-supplementation with omega-3 PUFAs on pancreatic beta-c | [10.1038/s41598-025-07861-2](https://doi.org/10.1038/s41598-025-07861-2) | Scientific reports | full_text | no |
| 22 | 2025 | Impact of Omega-3 and Vitamin D Supplementation on Bone Turnover Markers in Chil | [10.3390/nu17152526](https://doi.org/10.3390/nu17152526) | Nutrients | full_text | no |
| 23 | 2025 | Identification of individuals who benefit from omega-3 fatty acid supplementatio | [10.1007/s10654-025-01259-0](https://doi.org/10.1007/s10654-025-01259-0) | European journal of epidemiology | full_text | no |
| 24 | 2025 | Synbiotic Supplementation with Probiotics and Omega-3 Fatty Acids Enhances Upper | [10.3390/nu17182959](https://doi.org/10.3390/nu17182959) | Nutrients | full_text | no |
| 25 | 2025 | Omega and heart rate variability in overweight and obese schoolchildren. | [10.1038/s41390-025-03913-5](https://doi.org/10.1038/s41390-025-03913-5) | Pediatric research | full_text | no |
| 26 | 2025 | A preliminary study of lipid complex supplementation on fatty acid profile and b | [10.1038/s41598-025-13209-7](https://doi.org/10.1038/s41598-025-13209-7) | Scientific reports | full_text | no |
| 27 | 2025 | Synergistic Effects of Probiotic and Omega-3 Supplementation with Ultra-Short Ra | [10.3390/nu17142296](https://doi.org/10.3390/nu17142296) | Nutrients | full_text | no |
| 28 | 2025 | The Effects of Omega-3 Supplementation Combined with Strength Training on Neuro- | [10.3390/nu17132088](https://doi.org/10.3390/nu17132088) | Nutrients | full_text | no |
| 29 | 2025 | Anti-Inflammatory Diet and Probiotic Supplementation as Strategies to Modulate I | [10.3390/nu17162664](https://doi.org/10.3390/nu17162664) | Nutrients | full_text | no |
| 30 | 2025 | Myokine Circulating Levels in Postmenopausal Women with Overweight or Obesity: E | [10.3390/nu17152553](https://doi.org/10.3390/nu17152553) | Nutrients | full_text | no |
| 31 | 2025 | A Bayesian analysis of the VITAL trial: effects of ω-3 fatty acid supplementatio | [10.1016/j.ajcnut.2025.02.028](https://doi.org/10.1016/j.ajcnut.2025.02.028) | The American journal of clinical nutriti | full_text | no |
| 32 | 2025 | Influence of Fish Consumption and ω-3 Supplementation on the ω-3 Index of Young  | [10.1016/j.tjnut.2025.10.010](https://doi.org/10.1016/j.tjnut.2025.10.010) | The Journal of nutrition | full_text | no |
| 33 | 2025 | Vitamin D&lt;sub&gt;3&lt;/sub&gt; and marine ω-3 fatty acids supplementation and | [10.1016/j.ajcnut.2025.05.003](https://doi.org/10.1016/j.ajcnut.2025.05.003) | The American journal of clinical nutriti | full_text | no |
| 34 | 2025 | Effect of Beetroot Extract Supplementation on Serum Fatty Acid Profiles and Oxid | [10.1155/bmri/6654492](https://doi.org/10.1155/bmri/6654492) | BioMed research international | full_text | no |
| 35 | 2025 | Effects of Acute Fish Oil Supplementation on Muscle Function and Soreness After  | [10.3390/nu17213408](https://doi.org/10.3390/nu17213408) | Nutrients | full_text | no |
| 36 | 2025 | Benefits of Krill Oil Supplementation During Alternate-Day Fasting in Adults Wit | [10.1002/oby.24354](https://doi.org/10.1002/oby.24354) | Obesity (Silver Spring, Md.) | full_text | no |
| 37 | 2025 | Effects of maternal allergy and supplementation with ω-3 fatty acid and probioti | [10.1111/pai.70162](https://doi.org/10.1111/pai.70162) | Pediatric allergy and immunology : offic | full_text | no |
| 38 | 2025 | An Adapted Cardioprotective Diet with or Without Phytosterol and/or Krill Oil Su | [10.3390/nu17122008](https://doi.org/10.3390/nu17122008) | Nutrients | full_text | no |
| 39 | 2025 | Effects of spirulina (Arthrospira) platensis supplementation on inflammation, ph | [10.1186/s12937-025-01200-x](https://doi.org/10.1186/s12937-025-01200-x) | Nutrition journal | full_text | no |
| 40 | 2025 | Flaxseed intervention and reproductive endocrine profiles in patients with polyc | [10.3389/fendo.2025.1531762](https://doi.org/10.3389/fendo.2025.1531762) | Frontiers in endocrinology | full_text | YES |
| 41 | 2025 | Effects of docosahexaenoic acid supplementation on aggressive behavior among peo | [10.1097/wad.0000000000000674](https://doi.org/10.1097/wad.0000000000000674) | Alzheimer disease and associated disorde | full_text | no |
| 42 | 2025 | Effects of Omega-3 PUFAs on lipid profiles and antioxidant response in depressed | [10.1016/j.redox.2025.103617](https://doi.org/10.1016/j.redox.2025.103617) | Redox biology | full_text | no |
| 43 | 2025 | Calanus Oil and Lifestyle Interventions Improve Glucose Homeostasis in Obese Sub | [10.3390/md23040139](https://doi.org/10.3390/md23040139) | Marine drugs | full_text | no |
| 44 | 2025 | Effects of Prenatal DHA Dose on Infant Visual Attention. | [10.1002/dev.70072](https://doi.org/10.1002/dev.70072) | Developmental psychobiology | full_text | no |
| 45 | 2025 | Major depressive disorder in children and adolescents is associated with reduced | [10.1038/s41398-025-03401-8](https://doi.org/10.1038/s41398-025-03401-8) | Translational psychiatry | full_text | no |
| 46 | 2025 | Oral Antioxidant and Lutein/Zeaxanthin Supplements Slow Geographic Atrophy Progr | [10.1016/j.ophtha.2024.07.014](https://doi.org/10.1016/j.ophtha.2024.07.014) | Ophthalmology | full_text | no |
| 47 | 2025 | Effect of vitamin D, omega-3 supplementation, or a home exercise program on musc | [10.1111/jgs.19266](https://doi.org/10.1111/jgs.19266) | Journal of the American Geriatrics Socie | full_text | no |
| 48 | 2025 | Effects of vitamin D3, omega-3s, and a simple home exercise program on incident  | [10.1093/jbmr/zjaf058](https://doi.org/10.1093/jbmr/zjaf058) | Journal of bone and mineral research : t | full_text | no |
| 49 | 2025 | Effects of vitamin D3, omega-3 fatty acids and a simple home exercise program on | [10.1016/j.jnha.2025.100528](https://doi.org/10.1016/j.jnha.2025.100528) | The journal of nutrition, health & aging | full_text | no |
| 50 | 2025 | Maternal and umbilical cord serum lipids in gestational diabetes predict offspri | [10.1007/s11306-025-02281-9](https://doi.org/10.1007/s11306-025-02281-9) | Metabolomics : Official journal of the M | full_text | no |
| 51 | 2025 | Multifunctional dietary approach reduces intestinal inflammation in relation wit | [10.1080/19490976.2024.2438823](https://doi.org/10.1080/19490976.2024.2438823) | Gut microbes | full_text | no |
| 52 | 2025 | Reduction of cardiovascular risk factors by the diet - Evaluation of the MoKaRi  | [10.1186/s12944-025-02500-1](https://doi.org/10.1186/s12944-025-02500-1) | Lipids in health and disease | full_text | no |
| 53 | 2024 | Efficacy of AI-Guided (GenAIS<sup>TM</sup>) Dietary Supplement Prescriptions ver | [10.3390/nu16132023](https://doi.org/10.3390/nu16132023) | Nutrients | full_text | no |
| 54 | 2024 | Omega-3 Supplementation Reduces Schizotypal Personality in Children: A Randomize | [10.1093/schbul/sbae009](https://doi.org/10.1093/schbul/sbae009) | Schizophrenia bulletin | full_text | no |
| 55 | 2024 | Effect of Omega-3 Polyunsaturated Fatty Acid Supplementation on Clinical Outcome | [10.3390/nu16172829](https://doi.org/10.3390/nu16172829) | Nutrients | full_text | no |
| 56 | 2024 | Krill oil supplementation improves transepidermal water loss, hydration and elas | [10.1111/jocd.16513](https://doi.org/10.1111/jocd.16513) | Journal of cosmetic dermatology | full_text | no |
| 57 | 2024 | No Effects of Omega-3 Supplementation on Kynurenine Pathway, Inflammation, Depre | [10.3390/nu16213744](https://doi.org/10.3390/nu16213744) | Nutrients | full_text | no |
| 58 | 2024 | Boosting Recovery: Omega-3 and Whey Protein Enhance Strength and Ease Muscle Sor | [10.3390/nu16244263](https://doi.org/10.3390/nu16244263) | Nutrients | full_text | no |
| 59 | 2024 | Effects of Supplemental Vitamin D3, Omega-3 Fatty Acids on Physical Performance  | [10.1210/clinem/dgae150](https://doi.org/10.1210/clinem/dgae150) | The Journal of clinical endocrinology an | full_text | no |
| 60 | 2024 | Effects of Omega-3 Supplementation on the Delayed Onset Muscle Soreness after Cy | [10.52082/jssm.2024.317](https://doi.org/10.52082/jssm.2024.317) | Journal of sports science & medicine | full_text | no |
| 61 | 2024 | Prenatal Fish Oil Supplementation, Maternal COX1 Genotype, and Childhood Atopic  | [10.1001/jamadermatol.2024.2849](https://doi.org/10.1001/jamadermatol.2024.2849) | JAMA dermatology | full_text | no |
| 62 | 2024 | Phosphatidylserine enriched with polyunsaturated n-3 fatty acid supplementation  | [10.1002/epi4.12892](https://doi.org/10.1002/epi4.12892) | Epilepsia open | full_text | no |
| 63 | 2024 | Baseline engagement with healthy lifestyles and their associations with health o | [10.1111/ene.16429](https://doi.org/10.1111/ene.16429) | European journal of neurology | full_text | no |
| 64 | 2024 | <i>FADS1</i> Genetic Variant and Omega-3 Supplementation Are Associated with Cha | [10.3390/nu16203522](https://doi.org/10.3390/nu16203522) | Nutrients | full_text | no |
| 65 | 2024 | Effects of Supplementation with Omega-3 and Omega-6 Polyunsaturated Fatty Acids  | [10.3390/nu16172914](https://doi.org/10.3390/nu16172914) | Nutrients | full_text | no |
| 66 | 2024 | Maternal and Offspring Fatty Acid Desaturase Variants, Prenatal DHA Supplementat | [10.1016/j.tjnut.2024.03.004](https://doi.org/10.1016/j.tjnut.2024.03.004) | The Journal of nutrition | full_text | no |
| 67 | 2024 | The Role of Omega-3 Polyunsaturated Fatty Acids in Patients with Metabolic Syndr | [10.3390/medicina61010043](https://doi.org/10.3390/medicina61010043) | Medicina (Kaunas, Lithuania) | full_text | no |
| 68 | 2024 | Use of a Micronutrient Cocktail to Improve Metabolic Dysfunction-Associated Stea | [10.3390/medicina60081366](https://doi.org/10.3390/medicina60081366) | Medicina (Kaunas, Lithuania) | full_text | no |
| 69 | 2024 | Feasibility of Fish Oil Supplementation on Headache Symptoms and Blood Lipids in | [10.1002/brb3.70149](https://doi.org/10.1002/brb3.70149) | Brain and behavior | full_text | no |
| 70 | 2024 | The effect of curcumin and high-content eicosapentaenoic acid supplementations i | [10.1038/s41387-024-00274-6](https://doi.org/10.1038/s41387-024-00274-6) | Nutrition & diabetes | full_text | no |
| 71 | 2024 | Assessing the Potential of an Enzymatically Liberated Salmon Oil to Support Immu | [10.3390/ijms25136917](https://doi.org/10.3390/ijms25136917) | International journal of molecular scien | full_text | no |
| 72 | 2024 | Nonsurgical Treatment of Periodontitis in Menopausal Patients: A Randomized Cont | [10.1155/2024/6997142](https://doi.org/10.1155/2024/6997142) | BioMed research international | full_text | no |
| 73 | 2024 | Synbiotic <i>Bacillus megaterium</i> DSM 32963 and n-3 PUFA Salt Composition Ele | [10.3390/nu16091354](https://doi.org/10.3390/nu16091354) | Nutrients | full_text | no |
| 74 | 2024 | Vitamin D and Marine n-3 Fatty Acids for Autoimmune Disease Prevention: Outcomes | [10.1002/art.42811](https://doi.org/10.1002/art.42811) | Arthritis & rheumatology (Hoboken, N.J.) | full_text | no |
| 75 | 2024 | Sex, Body Mass Index, and APOE4 Increase Plasma Phospholipid-Eicosapentaenoic Ac | [10.1016/j.tjnut.2024.03.013](https://doi.org/10.1016/j.tjnut.2024.03.013) | The Journal of nutrition | full_text | no |
| 76 | 2024 | Apolipoprotein E and Its Association With Cognitive Change and Modification of T | [10.1093/gerona/glad260](https://doi.org/10.1093/gerona/glad260) | The journals of gerontology. Series A, B | full_text | no |
| 77 | 2024 | Monocyte transcriptomic profile following EPA and DHA supplementation in men and | [10.1016/j.atherosclerosis.2023.117407](https://doi.org/10.1016/j.atherosclerosis.2023.117407) | Atherosclerosis | full_text | no |
| 78 | 2024 | Effect of Omega-3 fatty acid supplementation on sexual function of pregnant wome | [10.1038/s41443-022-00598-w](https://doi.org/10.1038/s41443-022-00598-w) | International journal of impotence resea | full_text | no |
| 79 | 2024 | Sex differences in lipid mediators derived from omega-3 fatty acids in older ind | [10.1016/j.plefa.2024.102655](https://doi.org/10.1016/j.plefa.2024.102655) | Prostaglandins, leukotrienes, and essent | full_text | no |
| 80 | 2024 | Narcissism Is Not Associated With Success in U.S. Army Soldier Training. | [10.1093/milmed/usad365](https://doi.org/10.1093/milmed/usad365) | Military medicine | full_text | no |
| 81 | 2024 | Effects of vitamin D, omega-3 and a simple strength exercise programme in cardio | [10.1016/j.jnha.2024.100037](https://doi.org/10.1016/j.jnha.2024.100037) | The journal of nutrition, health & aging | full_text | no |
| 82 | 2024 | Dietary n-3 polyunsaturated fatty acids alter the number, fatty acid profile and | [10.1016/j.ajcnut.2024.03.008](https://doi.org/10.1016/j.ajcnut.2024.03.008) | The American journal of clinical nutriti | full_text | no |
| 83 | 2023 | Evaluating the Impact of Omega-3 Fatty Acid (Soloways<sup>TM</sup>) Supplementat | [10.3390/nu16010097](https://doi.org/10.3390/nu16010097) | Nutrients | full_text | no |
| 84 | 2023 | Effect of long-chain omega-3 polyunsaturated fatty acids on cardiometabolic fact | [10.3389/fendo.2023.1120364](https://doi.org/10.3389/fendo.2023.1120364) | Frontiers in endocrinology | full_text | YES |
| 85 | 2023 | The effect of fish oil supplementation on resistance training-induced adaptation | [10.1080/15502783.2023.2174704](https://doi.org/10.1080/15502783.2023.2174704) | Journal of the International Society of  | full_text | no |
| 86 | 2023 | Lipid profile after omega-3 supplementation in neonates with intrauterine growth | [10.1038/s41390-023-02632-z](https://doi.org/10.1038/s41390-023-02632-z) | Pediatric research | full_text | no |
| 87 | 2023 | Efficacy of <i>Boswellia serrata</i> Extract and/or an Omega-3-Based Product for | [10.3390/nu15173848](https://doi.org/10.3390/nu15173848) | Nutrients | full_text | no |
| 88 | 2023 | Predictors of compliance with higher dose omega-3 fatty acid supplementation dur | [10.1136/bmjopen-2023-076507](https://doi.org/10.1136/bmjopen-2023-076507) | BMJ open | full_text | no |
| 89 | 2023 | Identifying women who may benefit from higher dose omega-3 supplementation durin | [10.1136/bmjopen-2022-070220](https://doi.org/10.1136/bmjopen-2022-070220) | BMJ open | full_text | no |
| 90 | 2023 | Effect of Omega-3 Fatty Acid Supplementation on the Postprandial Metabolism of A | [10.5551/jat.63587](https://doi.org/10.5551/jat.63587) | Journal of atherosclerosis and thrombosi | full_text | no |
| 91 | 2023 | Effect of Vitamin D Supplementation on Overactive Bladder and Urinary Incontinen | [10.1097/ju.0000000000002942](https://doi.org/10.1097/ju.0000000000002942) | The Journal of urology | full_text | no |
| 92 | 2023 | Omega-3 fatty acids reduce depressive symptoms only among the socially stressed: | [10.1037/hea0001301](https://doi.org/10.1037/hea0001301) | Health psychology : official journal of  | full_text | no |
| 93 | 2023 | Effects of prenatal docosahexaenoic acid supplementation on offspring cardiometa | [10.1016/j.ajcnut.2023.10.005](https://doi.org/10.1016/j.ajcnut.2023.10.005) | The American journal of clinical nutriti | full_text | no |
| 94 | 2023 | Eicosapentaenoic and docosahexaenoic acid supplementation and coronary artery ca | [10.1016/j.atherosclerosis.2023.117388](https://doi.org/10.1016/j.atherosclerosis.2023.117388) | Atherosclerosis | full_text | no |
| 95 | 2023 | Effects of Varied Omega-3 Fatty Acid Supplementation on Postpartum Mental Health | [10.3390/nu15204388](https://doi.org/10.3390/nu15204388) | Nutrients | full_text | no |
| 96 | 2023 | Docosahexaenoic acid (DHA) intake estimated from a 7-question survey identifies  | [10.1016/j.clnesp.2022.12.004](https://doi.org/10.1016/j.clnesp.2022.12.004) | Clinical nutrition ESPEN | full_text | no |
| 97 | 2023 | Marine n-3 Fatty Acids and Prevention of Cardiovascular Disease: A Novel Analysi | [10.3390/nu15194235](https://doi.org/10.3390/nu15194235) | Nutrients | full_text | no |
| 98 | 2023 | Potential Modulation of Inflammation and Physical Function by Combined Probiotic | [10.3390/ijms24108567](https://doi.org/10.3390/ijms24108567) | International journal of molecular scien | full_text | no |
| 99 | 2023 | Effects of Vitamin D<sub>3</sub> and Marine Omega-3 Fatty Acids Supplementation  | [10.4088/jcp.22m14629](https://doi.org/10.4088/jcp.22m14629) | The Journal of clinical psychiatry | full_text | no |
| 100 | 2023 | Clinical response to EPA supplementation in patients with major depressive disor | [10.1038/s41386-022-01527-7](https://doi.org/10.1038/s41386-022-01527-7) | Neuropsychopharmacology : official publi | full_text | no |
| 101 | 2023 | Anti-inflammatory effect of combining fish oil and evening primrose oil suppleme | [10.1038/s41598-023-28411-8](https://doi.org/10.1038/s41598-023-28411-8) | Scientific reports | full_text | no |
| 102 | 2023 | Alleviation of Pain, PAIN Interference, and Oxidative Stress by a Novel Combinat | [10.3390/nu15122654](https://doi.org/10.3390/nu15122654) | Nutrients | full_text | no |
| 103 | 2023 | Fish Oil Supplementation with Resistance Exercise Training Enhances Physical Fun | [10.3390/nu15214516](https://doi.org/10.3390/nu15214516) | Nutrients | full_text | no |
| 104 | 2023 | Cognitive impact of multidomain intervention and omega 3 according to blood Aβ42 | [10.1186/s13195-023-01325-3](https://doi.org/10.1186/s13195-023-01325-3) | Alzheimer's research & therapy | full_text | no |
| 105 | 2023 | Monitoring and modifying recruitment and retention strategies for an ongoing ran | [10.1111/iwj.13957](https://doi.org/10.1111/iwj.13957) | International wound journal | full_text | no |
| 106 | 2023 | Supplementation with Flaxseed Oil Rich in Alpha-Linolenic Acid Improves Verbal F | [10.3390/nu15061499](https://doi.org/10.3390/nu15061499) | Nutrients | full_text | no |
| 107 | 2023 | Effect of Docosahexaenoic Acid (DHA) Supplementation of Preterm Infants on Growt | [10.3390/nu15020335](https://doi.org/10.3390/nu15020335) | Nutrients | full_text | no |
| 108 | 2023 | Mediation Analysis to Untangle Opposing Associations of High-Dose Docosahexaenoi | [10.1001/jamanetworkopen.2023.17870](https://doi.org/10.1001/jamanetworkopen.2023.17870) | JAMA network open | full_text | no |
| 109 | 2023 | Early and late preterm birth rates in participants adherent to randomly assigned | [10.1016/j.clnu.2023.01.009](https://doi.org/10.1016/j.clnu.2023.01.009) | Clinical nutrition (Edinburgh, Scotland) | full_text | no |
| 110 | 2023 | The Dose-Response Effect of Docosahexaenoic Acid on the Omega-3 Index in America | [10.1249/mss.0000000000003117](https://doi.org/10.1249/mss.0000000000003117) | Medicine and science in sports and exerc | full_text | no |
| 111 | 2023 | Changes in fatty acid levels after consumption of a novel docosahexaenoic supple | [10.1007/s00394-022-03050-3](https://doi.org/10.1007/s00394-022-03050-3) | European journal of nutrition | full_text | no |
| 112 | 2023 | Dietary supplements for aggressive behaviour in people with intellectual disabil | [10.1111/jar.13041](https://doi.org/10.1111/jar.13041) | Journal of applied research in intellect | full_text | no |
| 113 | 2023 | Comparative membrane incorporation of omega-3 fish oil triglyceride preparations | [10.1371/journal.pone.0265462](https://doi.org/10.1371/journal.pone.0265462) | PloS one | full_text | no |
| 114 | 2023 | Effects of Long-Chain Polyunsaturated Fatty Acids in Combination with Lutein and | [10.3390/nu15132825](https://doi.org/10.3390/nu15132825) | Nutrients | full_text | no |
| 115 | 2023 | Icosapent ethyl therapy for very high triglyceride levels: a 12-week, multi-cent | [10.1186/s12944-023-01838-8](https://doi.org/10.1186/s12944-023-01838-8) | Lipids in health and disease | full_text | no |
| 116 | 2023 | Enhanced Production of EPA-Derived Anti-Inflammatory Metabolites after Oral Admi | [10.5551/jat.64135](https://doi.org/10.5551/jat.64135) | Journal of atherosclerosis and thrombosi | full_text | no |
| 117 | 2022 | Potential Modulation of Inflammation by Probiotic and Omega-3 Supplementation in | [10.3390/nu14193998](https://doi.org/10.3390/nu14193998) | Nutrients | full_text | no |
| 118 | 2022 | DHA status influences effects of B-vitamin supplementation on cognitive ageing:  | [10.1007/s00394-022-02924-w](https://doi.org/10.1007/s00394-022-02924-w) | European journal of nutrition | full_text | no |
| 119 | 2022 | Randomized Controlled Trial of Omega-3 and -6 Fatty Acid Supplementation to Redu | [10.1007/s10803-021-05396-9](https://doi.org/10.1007/s10803-021-05396-9) | Journal of autism and developmental diso | full_text | no |
| 120 | 2022 | Calanus Oil Supplementation Does Not Further Improve Short-Term Memory or Brain- | [10.2147/cia.s368079](https://doi.org/10.2147/cia.s368079) | Clinical interventions in aging | full_text | no |
| 121 | 2022 | Prevention of covid-19 and other acute respiratory infections with cod liver oil | [10.1136/bmj-2022-071245](https://doi.org/10.1136/bmj-2022-071245) | BMJ (Clinical research ed.) | full_text | no |
| 122 | 2022 | Randomised Controlled Trial of Fish Oil Supplementation on Responsiveness to Res | [10.3390/nu14142844](https://doi.org/10.3390/nu14142844) | Nutrients | full_text | no |
| 123 | 2022 | Mechanistic insights into the health benefits of fish-oil supplementation agains | [10.1186/s12940-022-00908-1](https://doi.org/10.1186/s12940-022-00908-1) | Environmental health : a global access s | full_text | no |
| 124 | 2022 | Supplementation with omega-3 or omega-6 fatty acids attenuates platelet reactivi | [10.1111/cts.13366](https://doi.org/10.1111/cts.13366) | Clinical and translational science | full_text | no |
| 125 | 2022 | Krill Oil Supplementation Does Not Change Waist Circumference and Sagittal Abdom | [10.3390/ijerph192013574](https://doi.org/10.3390/ijerph192013574) | International journal of environmental r | full_text | no |
| 126 | 2022 | Omega-3 fatty acids enhance the beneficial effect of BCAA supplementation on mus | [10.1080/15502783.2022.2117994](https://doi.org/10.1080/15502783.2022.2117994) | Journal of the International Society of  | full_text | no |
| 127 | 2022 | Effect of Vitamin D and Docosahexaenoic Acid Co-Supplementation on Vitamin D Sta | [10.3390/nu14071397](https://doi.org/10.3390/nu14071397) | Nutrients | full_text | no |
| 128 | 2022 | Effects of Omega-3-6-9 fatty acid supplementation on behavior and sleep in prete | [10.1016/j.earlhumdev.2022.105588](https://doi.org/10.1016/j.earlhumdev.2022.105588) | Early human development | full_text | no |
| 129 | 2022 | Salmon fish protein supplement increases serum vitamin B12 and selenium concentr | [10.1007/s00394-022-02857-4](https://doi.org/10.1007/s00394-022-02857-4) | European journal of nutrition | full_text | no |
| 130 | 2022 | Effect of vitamin D supplementation on urinary incontinence in older women: anci | [10.1016/j.ajog.2021.10.017](https://doi.org/10.1016/j.ajog.2021.10.017) | American journal of obstetrics and gynec | full_text | no |

## ECU scores — this run only

| Outcome | 0–100 | Verdict | effect | in your form | at your dose | evidence | n |
|---|---:|---|---|---|---|---|---:|
| inflammation_crp | 17 | works, but weakly evidenced | +0.29 @ 100% | all negative (-0.02 @ 32%) | +0.00 @ 10% | 72% | 7 |
| glycaemic_control | 6 | does not work | +0.08 @ 100% | not tested in your form | not tested | 28% | 2 |
| blood_pressure | 2 | barely studied | +0.40 @ 100% | not tested in your form | not tested | 8% | 1 |
| adverse_events_any | gated | not enough human evidence | not tested | not tested | not tested | not tested | 0 |
| depressive_symptoms | gated | not enough human evidence | not tested | not tested | not tested | not tested | 0 |

_0–100 = 100 × c × mean(effect, form, dose). Each arc shows its verdict and the share of evidence behind it. A low number with a FULL evidence arc means 'does not work'; with an EMPTY one it means 'barely studied'._


_Old rows from previous runs are not shown here._

## Which studies made each number

### inflammation_crp — signed +20

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:103390nu18030539` | +7.08 | 0.1975 | 1.0 | 4 | unspecified |
| `registry:nct02637778` | +4.87 | 0.136 | 1.0 | 4 | unspecified |
| `doi:103390nu15214516` | +4.66 | 0.1301 | 1.0 | 4 | unspecified |
| `registry:nct06480812` | +3.74 | 0.15 | 0.6966666666666665 | 4 | unspecified |
| `doi:103390nu16010097` | -0.36 | 0.6 | -0.01666666666666668 | 4 | exact |
| `doi:103390nu17213408` | +0.00 | 0.3222 | 0.0 | 4 | unspecified |
| `doi:103390md23040139` | +0.00 | 0.36 | 0.0 | 4 | unspecified |
| **sum of all 7** | **+19.99** | | | | |

### glycaemic_control — signed +2

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `registry:nct02637778` | +2.31 | 0.136 | 0.3 | 4 | unspecified |
| `doi:103390md23040139` | +0.00 | 0.36 | 0.0 | 4 | unspecified |
| **sum of all 2** | **+2.31** | | | | |

### blood_pressure — signed +3

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:103390nu15214516` | +3.32 | 0.1301 | 0.4000000000000001 | 4 | unspecified |
| **sum of all 1** | **+3.32** | | | | |

_`points` sum to the signed score. NEGATIVE points mean that study pushed the score down. `w` is quality (design × RoB × size × funding × OA); `s` is what it found (+1.0 meaningful benefit, +0.3 trivial/unsized, −0.7 null, −1.0 harm). The two are separate on purpose: how good a study is and what it found are different facts._

## Database snapshot (`omega_3`)

_No `omega_3` database files found._

## Notes

- Claude and Grok scores are **never merged**.

- Form does **not** penalize the center score; it is the form arc only.

- Predatory venues: flagged + counted; weight zero is OFF for now.

- Inconclusive + low n is often the confidence ceiling (SPEC 13), not a bug.

- This report is **this run only** — other ingredients are not mixed in.
