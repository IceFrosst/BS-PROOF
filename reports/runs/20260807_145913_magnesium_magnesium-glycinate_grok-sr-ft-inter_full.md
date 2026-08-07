# BS-PROOF full audit report (grok-sr-ft-inter)

Generated: **2026-08-07 14:59 UTC**


scoring_model: v2-four-arc

Ingredient: `magnesium` · Form: `magnesium_glycinate` · Mode: **grok-sr-ft-inter**

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
  PASS  d is carried through unchanged, not rescaled  d is a weighted MEAN -- sample-size independent by construction
  PASS  projected c exceeds sample c  
  PASS  projection lands nearer the truth than the raw sample score  raw +100 -> projected +100 vs true +100
  PASS  error bar shrinks with sample size  
  PASS  cheap evidence needs far more of it  301 vs 13 studies for c=0.9

FOUR ARCS + 0-100 COMPOSITE
  PASS  harmful product cannot accumulate points from a good form match  summing arcs gave it 74/100; the form arc is now the VERDICT, -1.00
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

- Targeted studies: **20**
- Succeeded (usable): **20**
- Skipped (no text): **0**
- Partial agent failures: **6**
- Prompt version: `v1.3+grok-cli-pure-function`
- Concurrency: 50  |  studies in flight: 40

## Predatory journal check (flag only — not in score)

- List entries loaded: **0**
- Studies checked: **335**
- Studies flagged predatory: **0**
- Distinct journals flagged: **0**
- Affects score: **NO (count only)**

## Systematic reviews / meta-analyses (S2)

- Requested (cap): **4**
- S2 extractions ok: **4**
- Resolved for multiplier: **1**
_SRs never add patients; only a capped confidence boost (≤ +30%)._

## Per-agent success rates (this run)

| Agent | OK | Fail | Cache |
|---|---:|---:|---:|
| S3 | 14 | 6 | 0 |
| S4 | 20 | 0 | 0 |
| S5 | 20 | 0 | 0 |
| S7 | 20 | 0 | 0 |
| S8 | 20 | 0 | 0 |

## SPEED REPORT

```text
============================================================
GROK SPEED REPORT
  concurrent limit (SP_GROK_CONCURRENCY): 50
  peak in-flight observed:               50
  live calls ok/fail/cache: 265/6/2
  timeouts: 0  auth failures: 0
  avg latency (ok): 42.9s   p95: 132.1s
  fail rate: 2.2%
  RECOMMENDATION: HEADROOM — optional set SP_GROK_CONCURRENCY=58
============================================================
```

## Studies extracted this run (20)

| # | Year | Title | DOI / PMID | Journal | OA | Predatory |
|---:|---:|---|---|---|---|---|
| 1 | 2026 | Efficacy of a Naturally Calcium and Magnesium-Rich Mineral Water on Musculoskele | [10.3390/nu18030470](https://doi.org/10.3390/nu18030470) | Nutrients | full_text | no |
| 2 | 2025 | Effects of a &lt;i&gt;Scutellaria baicalensis&lt;/i&gt;/&lt;i&gt;Crataegus laevi | [10.1177/02698811251381261](https://doi.org/10.1177/02698811251381261) | Journal of psychopharmacology (Oxford, E | full_text | no |
| 3 | 2025 | The Association of Gut Microbiota With TRPM7 Genotype, Colorectal Polyps, and Ma | [10.1016/j.tjnut.2025.07.015](https://doi.org/10.1016/j.tjnut.2025.07.015) | The Journal of nutrition | full_text | no |
| 4 | 2025 | Beneficial Effects of Long-Lasting Bicarbonate-Sulfate-Calcium-Magnesium Water I | [10.3390/nu17213452](https://doi.org/10.3390/nu17213452) | Nutrients | full_text | no |
| 5 | 2024 | Magnesium Supplementation Modulates T-cell Function in People with Type 2 Diabet | [10.1210/clinem/dgae097](https://doi.org/10.1210/clinem/dgae097) | The Journal of clinical endocrinology an | full_text | no |
| 6 | 2024 | Comparative Clinical Study on Magnesium Absorption and Side Effects After Oral I | [10.3390/nu16244367](https://doi.org/10.3390/nu16244367) | Nutrients | full_text | no |
| 7 | 2024 | Magnesium from Deep Seawater as a Potentially Effective Natural Product against  | [10.3390/medicina60081265](https://doi.org/10.3390/medicina60081265) | Medicina (Kaunas, Lithuania) | full_text | no |
| 8 | 2024 | Effects of magnesium and potassium supplementation on insomnia and sleep hormone | [10.3389/fendo.2024.1370733](https://doi.org/10.3389/fendo.2024.1370733) | Frontiers in endocrinology | full_text | no |
| 9 | 2024 | Effects of Supplementing Zinc Magnesium Aspartate on Sleep Quality and Submaxima | [10.3390/nu16020251](https://doi.org/10.3390/nu16020251) | Nutrients | full_text | no |
| 10 | 2024 | Comparative Efficacy of Magnesium and Potassium Towards Cholesterol and Quality  | [10.1002/edm2.511](https://doi.org/10.1002/edm2.511) | Endocrinology, diabetes & metabolism | full_text | no |
| 11 | 2024 | Probiotics and magnesium orotate for the treatment of major depressive disorder: | [10.1038/s41598-024-71093-z](https://doi.org/10.1038/s41598-024-71093-z) | Scientific reports | full_text | no |
| 12 | 2024 | Evaluation of Aluminum and Magnesium Absorption Following the Oral Administratio | [10.1007/s12325-024-02969-9](https://doi.org/10.1007/s12325-024-02969-9) | Advances in therapy | full_text | no |
| 13 | 2022 | Short-Term Magnesium Therapy Alleviates Moderate Stress in Patients with Fibromy | [10.3390/nu14102088](https://doi.org/10.3390/nu14102088) | Nutrients | full_text | no |
| 14 | 2022 | Effect of oral magnesium supplement on cardiometabolic markers in people with pr | [10.1038/s41598-022-20277-6](https://doi.org/10.1038/s41598-022-20277-6) | Scientific reports | full_text | no |
| 15 | 2022 | Effects of Magnesium Citrate, Magnesium Oxide, and Magnesium Sulfate Supplementa | [10.1161/jaha.121.021783](https://doi.org/10.1161/jaha.121.021783) | Journal of the American Heart Associatio | full_text | no |
| 16 | 2022 | The effects of magnesium supplementation on abnormal uterine bleeding, alopecia, | [10.1186/s12958-022-00982-7](https://doi.org/10.1186/s12958-022-00982-7) | Reproductive biology and endocrinology : | full_text | no |
| 17 | 2022 | Effect of a Combination of Magnesium, B Vitamins, Rhodiola, and Green Tea (L-The | [10.3390/nu14091863](https://doi.org/10.3390/nu14091863) | Nutrients | full_text | no |
| 18 | 2022 | A Magtein<sup>®</sup>, Magnesium L-Threonate, -Based Formula Improves Brain Cogn | [10.3390/nu14245235](https://doi.org/10.3390/nu14245235) | Nutrients | full_text | no |
| 19 | 2022 | Association of the Serum Folate and Total Calcium and Magnesium Levels Before Ov | [10.3389/fendo.2022.732731](https://doi.org/10.3389/fendo.2022.732731) | Frontiers in endocrinology | full_text | no |
| 20 | 2021 | Long-term magnesium supplementation improves glucocorticoid metabolism: A post-h | [10.1111/cen.14350](https://doi.org/10.1111/cen.14350) | Clinical endocrinology | full_text | no |

## ECU scores — this run only

| Outcome | 0–100 | Verdict | effect | in your form | at your dose | evidence | n |
|---|---:|---|---|---|---|---|---:|
| memory | 37 | probably does not work | +1.00 @ 100% | not tested | +1.00 @ 100% | 51% | 6 |
| serum_magnesium | 16 | does not work | -0.16 @ 100% | not tested | -0.25 @ 38% | 56% | 22 |
| depressive_symptoms | 8 | does not work | -0.41 @ 100% | not tested | -0.41 @ 100% | 37% | 7 |
| lean_body_mass | 8 | does not work | +0.30 @ 100% | not tested | not tested | 30% | 3 |
| perceived_stress | 8 | does not work | -0.19 @ 100% | not tested | -0.20 @ 87% | 26% | 7 |
| cortisol | 6 | does not work | +0.10 @ 100% | not tested | not tested | 28% | 5 |
| anxiety | 5 | does not work | -0.45 @ 100% | not tested | -0.45 @ 100% | 23% | 4 |
| glycaemic_control | 5 | does not work | -0.70 @ 100% | not tested | -0.70 @ 89% | 50% | 6 |
| muscle_strength | 5 | does not work | -0.25 @ 100% | not tested | -0.70 @ 10% | 23% | 4 |
| blood_pressure | 3 | does not work | -0.70 @ 100% | not tested | -0.70 @ 100% | 27% | 2 |
| inflammation_crp | 2 | does not work | -0.70 @ 100% | not tested | -0.70 @ 67% | 21% | 3 |
| adverse_events_any | 1 | barely studied | -0.70 @ 100% | not tested | -0.70 @ 100% | 12% | 2 |
| adverse_events_gi | 0 | does not work | -0.98 @ 100% | not tested | -1.00 @ 92% | 16% | 2 |
| energy_levels | 0 | barely studied | -0.70 @ 100% | not tested | -0.70 @ 67% | 4% | 3 |
| muscle_power | 0 | barely studied | -0.70 @ 100% | not tested | -0.70 @ 100% | 3% | 2 |
| sleep_quality | 0 | barely studied | -0.70 @ 100% | not tested | not tested | 1% | 1 |

_0–100 = 100 × c × mean(effect, form, dose). Each arc shows its verdict and the share of evidence behind it. A low number with a FULL evidence arc means 'does not work'; with an EMPTY one it means 'barely studied'._


_Old rows from previous runs are not shown here._

## Database snapshot (`magnesium`)

### `grok_magnesium.sqlite`

Studies stored (corpus): **200** · ECUs: **22** · syntheses: **52

### `grok_magnesium_inte.sqlite`

Studies stored (corpus): **431** · ECUs: **16** · syntheses: **96

## Notes

- Claude and Grok scores are **never merged**.

- Form does **not** penalize the center score; it is the form arc only.

- Predatory venues: flagged + counted; weight zero is OFF for now.

- Inconclusive + low n is often the confidence ceiling (SPEC 13), not a bug.

- This report is **this run only** — other ingredients are not mixed in.
