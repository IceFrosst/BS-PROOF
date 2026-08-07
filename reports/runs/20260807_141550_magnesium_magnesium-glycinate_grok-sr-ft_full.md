# BS-PROOF full audit report (grok-sr-ft)

Generated: **2026-08-07 14:15 UTC**


scoring_model: v2-four-arc

Ingredient: `magnesium` · Form: `magnesium_glycinate` · Mode: **grok-sr-ft**

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
SMALL-RUN PREVIEW (project, never rescale k)
  PASS  sample under 20 refuses to project  a 40-point error bar spans four bands; that is noise, not a preview
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
- Partial agent failures: **2**
- Prompt version: `v1.3+grok-cli-pure-function`
- Concurrency: 50  |  studies in flight: 40

## Predatory journal check (flag only — not in score)

- List entries loaded: **0**
- Studies checked: **148**
- Studies flagged predatory: **0**
- Distinct journals flagged: **0**
- Affects score: **NO (count only)**

## Systematic reviews / meta-analyses (S2)

- Requested (cap): **8**
- S2 extractions ok: **8**
- Resolved for multiplier: **0**
_SRs never add patients; only a capped confidence boost (≤ +30%)._

## Per-agent success rates (this run)

| Agent | OK | Fail | Cache |
|---|---:|---:|---:|
| S3 | 18 | 2 | 17 |
| S4 | 20 | 0 | 20 |
| S5 | 20 | 0 | 20 |
| S7 | 20 | 0 | 20 |
| S8 | 20 | 0 | 20 |

## SPEED REPORT

```text
============================================================
GROK SPEED REPORT
  concurrent limit (SP_GROK_CONCURRENCY): 50
  peak in-flight observed:               3
  live calls ok/fail/cache: 1/2/214
  timeouts: 0  auth failures: 0
  avg latency (ok): 17.4s   p95: 17.4s
  fail rate: 66.7%
  RECOMMENDATION: Too few calls to judge.
============================================================
```

## Studies extracted this run (20)

| # | Year | Title | DOI / PMID | Journal | OA | Predatory |
|---:|---:|---|---|---|---|---|
| 1 | 2026 | Magnesium-Rich Mineral Water Improves Stool Consistency and Bowel Habits in Heal | [10.1111/nmo.70378](https://doi.org/10.1111/nmo.70378) | Neurogastroenterology and motility | full_text | no |
| 2 | 2026 | Sequence-Dependent Analgesic Efficacy of Ketamine and Magnesium Sulfate After Ra | [10.3390/medicina62040754](https://doi.org/10.3390/medicina62040754) | Medicina (Kaunas, Lithuania) | full_text | no |
| 3 | 2026 | Magnesium supplementation did not reduce serum calciprotein crystallization and  | [10.1016/j.ajcnut.2026.101299](https://doi.org/10.1016/j.ajcnut.2026.101299) | The American journal of clinical nutriti | full_text | no |
| 4 | 2026 | Effects of B vitamins and magnesium on fatigue, disease activity and quality of  | [10.1038/s41598-026-49880-7](https://doi.org/10.1038/s41598-026-49880-7) | Scientific reports | full_text | no |
| 5 | 2026 | Efficacy of a Naturally Calcium and Magnesium-Rich Mineral Water on Musculoskele | [10.3390/nu18030470](https://doi.org/10.3390/nu18030470) | Nutrients | full_text | no |
| 6 | 2026 | Quantitative sensory testing of pain in osteoporosis: a pilot randomized clinica | [10.1007/s40520-025-03317-9](https://doi.org/10.1007/s40520-025-03317-9) | Aging clinical and experimental research | full_text | no |
| 7 | 2026 | Impact of Preoperative Calcium and Magnesium Supplementation on Quality of Life  | [10.1002/edm2.70129](https://doi.org/10.1002/edm2.70129) | Endocrinology, diabetes & metabolism | full_text | no |
| 8 | 2026 | Secondary prevention of leg cramps using compression stockings or magnesium supp | [10.1186/s13063-025-09370-z](https://doi.org/10.1186/s13063-025-09370-z) | Trials | full_text | no |
| 9 | 2026 | Comparison of oral ketorolac and oral magnesium for postoperative pain managemen | [10.1177/03000605251409937](https://doi.org/10.1177/03000605251409937) | The Journal of international medical res | full_text | no |
| 10 | 2026 | Do probiotics modulate dietary intake? Pilot data from a randomized controlled s | [10.1371/journal.pone.0350801](https://doi.org/10.1371/journal.pone.0350801) | PloS one | full_text | no |
| 11 | 2026 | The Effect of &lt;i&gt;Griffonia simplicifolia&lt;/i&gt; on Pain Intensity, Cent | [10.3390/nu18101609](https://doi.org/10.3390/nu18101609) | Nutrients | full_text | no |
| 12 | 2026 | Oral oxycodone versus sublingual buprenorphine for postoperative pain control af | [10.1136/bmjopen-2026-117594](https://doi.org/10.1136/bmjopen-2026-117594) | BMJ open | full_text | no |
| 13 | 2026 | The effect of dietary approaches to stop hypertension (DASH) diet on cardiometab | [10.1186/s12902-026-02207-z](https://doi.org/10.1186/s12902-026-02207-z) | BMC endocrine disorders | full_text | no |
| 14 | 2026 | Novel dietary FemTech based on dietary reference intakes for premenstrual and me | [10.1186/s12905-026-04382-6](https://doi.org/10.1186/s12905-026-04382-6) | BMC women's health | full_text | no |
| 15 | 2026 | The effects of Mixodin supplementation on migraine headache characteristics, oxi | [10.1186/s12937-026-01308-8](https://doi.org/10.1186/s12937-026-01308-8) | Nutrition journal | full_text | no |
| 16 | 2026 | &lt;i&gt;Pennisetum purpureum&lt;/i&gt; Schumach Supplementation Enhances Grip S | [10.7150/ijms.124224](https://doi.org/10.7150/ijms.124224) | International journal of medical science | full_text | no |
| 17 | 2026 | Consistency of Blood Pressure Response to Potassium-Enriched Salt in the China S | [10.1161/hypertensionaha.125.24723](https://doi.org/10.1161/hypertensionaha.125.24723) | Hypertension (Dallas, Tex. : 1979) | full_text | no |
| 18 | 2026 | Probiotic Effect on Quality of Life, Bowel Habits and Weight Loss after Differen | [10.1007/s11695-026-08706-1](https://doi.org/10.1007/s11695-026-08706-1) | Obesity surgery | full_text | no |
| 19 | 2026 | The role of probiotics in nutritional intake and clinical outcomes of critically | [10.1038/s41598-026-45936-w](https://doi.org/10.1038/s41598-026-45936-w) | Scientific reports | full_text | no |
| 20 | 2026 | Effects of a Prolonged Exclusive Human Milk-Based Diet on Structural and Functio | [10.3390/nu18091321](https://doi.org/10.3390/nu18091321) | Nutrients | full_text | no |

## ECU scores — this run only

| Outcome | 0–100 | Verdict | effect | in your form | at your dose | evidence | n |
|---|---:|---|---|---|---|---|---:|
| adverse_events_any | gated | not enough human evidence | not tested | not tested | not tested | not tested | 2 |
| adverse_events_gi | gated | not enough human evidence | not tested | not tested | not tested | not tested | 1 |
| anxiety | gated | not enough human evidence | not tested | not tested | not tested | not tested | 1 |
| blood_pressure | gated | not enough human evidence | not tested | not tested | not tested | not tested | 8 |
| cortisol | gated | not enough human evidence | not tested | not tested | not tested | not tested | 1 |
| depressive_symptoms | gated | not enough human evidence | not tested | not tested | not tested | not tested | 1 |
| digestive_comfort | gated | not enough human evidence | not tested | not tested | not tested | not tested | 5 |
| glycaemic_control | gated | not enough human evidence | not tested | not tested | not tested | not tested | 1 |
| lean_body_mass | gated | not enough human evidence | not tested | not tested | not tested | not tested | 5 |
| muscle_strength | gated | not enough human evidence | not tested | not tested | not tested | not tested | 4 |
| serum_magnesium | gated | not enough human evidence | not tested | not tested | not tested | not tested | 2 |
| sleep_quality | gated | not enough human evidence | not tested | not tested | not tested | not tested | 1 |
| testosterone | gated | not enough human evidence | not tested | not tested | not tested | not tested | 1 |

_0–100 = 100 × c × mean(effect, form, dose). Each arc shows its verdict and the share of evidence behind it. A low number with a FULL evidence arc means 'does not work'; with an EMPTY one it means 'barely studied'._


_Old rows from previous runs are not shown here._

## Database snapshot (`magnesium`)

### `grok_magnesium.sqlite`

Studies stored (corpus): **200** · ECUs: **22** · syntheses: **52

## Notes

- Claude and Grok scores are **never merged**.

- Form does **not** penalize the center score; it is the form arc only.

- Predatory venues: flagged + counted; weight zero is OFF for now.

- Inconclusive + low n is often the confidence ceiling (SPEC 13), not a bug.

- This report is **this run only** — other ingredients are not mixed in.
