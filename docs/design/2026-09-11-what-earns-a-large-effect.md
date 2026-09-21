# What actually earns `effectPoints: 3` under the Evidence Ledger rubric — live-source audit

**Run:** read-only investigation, no repo edits, no commits, no Grok/xAI used.
**Rubric read first:** `prompts/research_audit.md` (audit-v0.2), `docs/design/2026-09-10-evidence-ledger-rubric.md` (rubric v0.1, PROPOSED).
**Formula used:** the real `score()` in `app/design-lab/ab/ledger.ts` — I compiled the actual file with the repo's own `node_modules/.bin/tsc` and executed it against constructed ledgers. Every headline in this report is a program output, not arithmetic I did in my head.
**Retrieval:** Europe PMC REST (`/search?...&resultType=core`, `/{PMCID}/fullTextXML`) via `curl`, plus live WHO and CDC pages. No source is cited from memory; every DOI/PMID below was returned by a query I ran and whose text I read in this session.

---

## 0. The machine I am judging against

`app/design-lab/ab/ledger.ts:88-108`, verbatim behaviour:

```
certainty  = (bodyIsRct ? 4 : 2) − 1 per checklist "concern", floored at 0
caps       = rctCount 0 → 0 | rctCount 1 → 1
             largestRctN < 50 OR (chronicOutcome && longestRctWeeks < 4) → 2
             surrogate → 3
             allPositiveIndustryOrOneLab → disclosure only (no cap)
applicability = mean(formFit/4, doseFit/4)   unknown axis → 0.10
signal        = (E/3) × (C/4)
headline      = round(50 + 50 × signal × (signal > 0 ? applicability : 1))
label         = E===0 && C>=3 ? "No meaningful benefit" : bandLabel(headline)
bandLabel     ≥65 Works · ≥55 Probably works · ≥45 Unclear · ≥30 Probably does not work · <30 Evidence against
```

Ceilings that matter for this question: **E=3 + C=4 + perfect fit = 100**; **E=3 + surrogate cap = 88**; **E=3 + single-RCT cap = 63**; **E=1 + C=4 = 67, and 67 is labelled "Works"**.

### Meaningfulness thresholds I judged against (named, with live sources)

| ID | Threshold | Named source, verbatim |
|---|---|---|
| **T1** ratio outcomes | large = **≥ 2-fold** change in risk (RR ≤ 0.50 or ≥ 2.0); very large = **≥ 5-fold** (RR ≤ 0.20 or ≥ 5.0) | GRADE guidelines 9, Guyatt et al., *J Clin Epidemiol* 2011 — PMID **21802902**, DOI **10.1016/j.jclinepi.2011.06.004**: "GRADE suggests considering rating up quality of evidence one level when methodologically rigorous observational studies show at least a two-fold reduction or increase in risk, and rating up two levels for at least a five-fold reduction or increase in risk." (access: abstract) |
| **T2** SMD outcomes | 0.2 small · 0.5 medium · 0.8 large | Andrade, *J Clin Psychiatry* 2023 — PMID **37555679**, DOI **10.4088/jcp.23f15028**: "SMDs of 0.2, 0.5, and 0.8 are conventionally considered to be small, medium, and large, respectively." (access: abstract) |
| **T3** zinc/diarrhoea | guideline-recognised benefit | WHO fact sheet "Diarrhoeal disease", fetched live HTTP 200: "a 10–14 day supplemental treatment course of dispersible zinc tablets shortens diarrhoea duration and improves outcomes." (access: full page) |
| **T4** folic acid | guideline-recognised dose/indication | CDC "About Folic Acid", fetched live HTTP 200: "All women capable of becoming pregnant should get 400 micrograms (mcg) of folic acid daily… can help prevent serious birth defects called neural tube defects." (access: full page) |

I applied T1/T2 to the **point estimate**, which is the plain reading of the rubric's "large +3 · unclear (CI spans both)". Where a strict "whole CI beyond the threshold" reading would demote a candidate, I say so explicitly — see **Finding F4**, because the rubric does not define which reading is correct and it is worth up to 5 headline points on the flagship case.

Gate fields (`rctCount`, `largestRctN`, `longestRctWeeks`) are **my constructed ledger inputs** derived from the trial counts and participant totals printed in each source. Where a source gave a total rather than a largest-trial n, I say so. Only the effect sizes are verbatim.

---

## 1. Verified candidates that legitimately earn `effectPoints: 3`

### C1 — Folic acid 4 mg/d oral tablet, periconceptional → recurrence of neural tube defect, women with a previous NTD pregnancy

- **Effect verbatim** — Cochrane De-Regil 2015, PMID **26662928**, DOI **10.1002/14651858.CD007950.pub3** (access: abstract): "a protective effect of daily folic acid supplementation … in preventing NTDs … (risk ratio (RR) **0.31, 95% confidence interval (CI) 0.17 to 0.58**); five studies; 6708 births; **high quality evidence**)". Recurrence specifically: "RR **0.34, 95% CI 0.18 to 0.64**); four studies; 1846 births".
- **Pivotal RCT verbatim** — MRC Vitamin Study, *Lancet* 1991, PMID **1677062** (access: abstract): "6 in the folic acid groups and 21 in the two other groups, a **72% protective effect (relative risk 0.28, 95% confidence interval 0.12-0.71)**", 1817 women randomised, 1195 completed pregnancies.
- **Threshold** — T1 (GRADE ≥2-fold): 0.31 is a 3.2-fold reduction. Passes. T4 confirms guideline standing.
- **Proposed E = 3.** Largest, cleanest replacement effect on the disease itself in the whole supplement literature.
- **Gates**: rctCount 5 · largestRctN 1817 · 52 wk · not surrogate (the NTD *is* the outcome) · not industry/one-lab. **Nothing caps it.**
- **Computed headline** (E3, C3 with one `risk_of_bias` concern — Cochrane: "The risk of bias of the trials was variable. Only one trial was considered to be at low risk of bias" — F4 D4): **88 "Works"**. With all five checklist items `supported`: **100 "Works"**.
- **Honesty note that the rubric currently hides**: the *same* Cochrane review reports, for first-occurrence NTD in the general population — the population every 400 µg product is sold to — "Only one study assessed the incidence of NTDs and showed **no evidence of an effect (RR 0.07, 95% CI 0.00 to 1.32; 4862 births)**". A CI spanning 0.00–1.32 is `unclear` → **no headline at all**. The strongest supplement claim in existence is a 3 for ~2% of buyers and unscoreable for the rest.

### C2 — Vitamin A 200,000 IU × 2 consecutive days → mortality in children < 2 y with measles

- **Effect verbatim** — Cochrane Huiming 2005, PMID **16235283**, DOI **10.1002/14651858.CD001479.pub3** (access: abstract): "Using two doses of vitamin A (200,000 IU) on consecutive days was associated with a reduction in the risk of mortality in children under the age of two years (**RR 0.18; 95% CI 0.03 to 0.61**) and a reduction in the risk of pneumonia-specific mortality (**RR 0.33; 95% CI 0.08 to 0.92**)". Croup **RR 0.53 (0.29–0.89)**. All studies pooled, all ages/doses: **RR 0.70 (0.42–1.15)** — not significant.
- **Threshold** — T1: RR 0.18 is a **5.6-fold** reduction, i.e. beyond GRADE's "very large" line. Passes with room.
- **Proposed E = 3.**
- **Gates**: 2 trials in this subgroup, both small, short. **Critical caveat the code cannot express**: this is a *subgroup* result with no interaction test reported in the review text → audit-v0.2 requires the label `subgroup_hypothesis_only`, and `Ledger` has no such field (**Finding F6**).
- **Computed headline** (E3, C2 via two concerns, F4 D4): **75 "Works"**.

### C3 — Vitamin A 200,000 IU periodic → night blindness / Bitot's spots, children 6–59 mo in VAD-prevalent settings

- **Effect verbatim** — Cochrane Imdad 2022, PMID **35294044**, DOI **10.1002/14651858.CD008524.pub4** (access: abstract): "night blindness (**RR 0.32, 95% CI 0.21 to 0.50**; 2 studies, 22,972 children; moderate-certainty evidence)"; "Bitot's spots (**RR 0.42, 95% CI 0.33 to 0.53**; 5 studies, 1,063,278 children; moderate-certainty)"; measles incidence **RR 0.45 (0.30–0.69)**; VAD **RR 0.71 (0.65–0.78)**.
- **Threshold** — T1: 0.32 = 3.1-fold. **This is my only candidate whose entire 95% CI (0.21–0.50) sits at or beyond the large threshold**, so it survives even the strict reading in F4.
- **Proposed E = 3.** Night blindness is the deficiency syndrome, not a surrogate for it.
- **Gates**: rctCount 2 · largestRctN 22,972 · not surrogate · independent labs. No cap fires.
- **Computed headline** (E3, C3, F4 D4): **88 "Works"**; with two concerns: **75 "Works"**.

### C4 — Ferrous salt ≈ 60 mg elemental iron/d → iron-deficiency anaemia at term, pregnant women

- **Effect verbatim** — Cochrane Finkelstein 2024, PMID **39145520**, DOI **10.1002/14651858.CD004736.pub6** (access: abstract): "probably reduces maternal iron-deficiency anaemia at term (**5.0% versus 18.4%; RR 0.41, 95% CI 0.26 to 0.63**; 7 trials, 2704 women; moderate-certainty evidence)"; maternal anaemia "**4.0% versus 7.4%; RR 0.30, 95% CI 0.20 to 0.47**; 14 trials, 13,543 women"; iron deficiency at term "**44.0% versus 66.0%; RR 0.51, 95% CI 0.38 to 0.68**".
- **Magnitude in the natural unit** — J Nutr 2026, PMID **42302886**, DOI **10.1016/j.tjnut.2026.101672** (access: abstract), 60 mg elemental iron as ferrous sulfate + 400 µg folic acid, nonpregnant Bangladeshi women with IDA, n=184 in that arm, 12 wk: "Mean hemoglobin change at 12 wk was −0.2 ± 0.8 g/dL, 0.0 ± 0.9 g/dL, and **1.1 ± 1.3 g/dL**, respectively" (bLF 200 mg, bLF 400 mg, ferrous sulfate).
- **Threshold** — T1: 2.4-fold reduction; absolute **13.4 percentage points, NNT ≈ 7.5**.
- **Proposed E = 3.**
- **Gates**: "anaemia at term" is a laboratory-defined diagnosis. Arguably `surrogate: true` (the patient-felt outcomes — fatigue, transfusion, maternal death — mostly showed "little to no difference" in the same review). With the surrogate flag on and a clean checklist: **88 "Works"**; as I scored it (2 concerns): **75 "Works"**. Either way the surrogate gate never bites because the concerns already bind — see **F2**.

### C5 — Multi-strain probiotic ≥ 5×10⁹ CFU/d → incidence of antibiotic-associated diarrhoea, children 0–18 on antibiotics

- **Effect verbatim** — Cochrane Guo 2019, PMID **31039287**, DOI **10.1002/14651858.CD004827.pub5** (access: abstract): "the incidence of AAD in the probiotic group was **8% (259/3232)** compared to **19% (598/3120)** in the control group (**RR 0.45, 95% CI 0.36 to 0.56**; I² = 57%, 6352 participants; **NNTB 9, 95% CI 7 to 13**; moderate certainty evidence)". Loss-to-follow-up-robust ITT: "**RR 0.61; 95% CI 0.49 to 0.77**".
- **Threshold** — T1: 2.2-fold on the primary analysis (passes); **1.6-fold on the robust ITT analysis (fails → E=2)**. Honest verdict: **E = 3 with an explicit note that the bias-robust estimate is a 2.**
- **Gates**: 33 RCTs, no cap. But `formFit` is structurally limited — "probiotics" is 9 genera, not a product; any single SKU is `same_family` at best → F 3, and CFU labelling vs measured viability puts D at 3.
- **Computed headline** (E3, C2, F3 D3): **69 "Works"**.

### C6 — Vitamin C 0.2–1 g/d → common cold incidence in people under brief extreme physical stress (marathon runners, skiers, soldiers on subarctic exercises)

- **Effect verbatim** — Cochrane Hemilä & Chalker 2013, PMID **23440782**, DOI **10.1002/14651858.CD000980.pub4** (access: abstract): "**Five trials involving a total of 598 marathon runners, skiers and soldiers on subarctic exercises yielded a pooled RR of 0.48 (95% CI 0.35 to 0.64)**." Same review, general community: "In the general community trials involving 10,708 participants, the pooled **RR was 0.97 (95% CI 0.94 to 1.00)**."
- **Threshold** — T1: 2.1-fold. Passes on point estimate; upper CI 0.64 → moderate under the strict reading (F4).
- **Proposed E = 3 for the stressed-athlete population, E = 0 for the general population.**
- **Computed headlines**: athletes E3/C3 → **88 "Works"**; athletes with a clean checklist → **100 "Works"**; general population E0/C4 → **50 "No meaningful benefit"**.
- This is the single best demonstration in my set that the *product* has no score — only the (product × outcome × population) triple does. Same bottle, same dose, 100 vs 50.

### C7 — Vitamin E (RRR-α-tocopherol) 800 IU/d → histological improvement in non-diabetic biopsy-proven NASH

- **Effect verbatim** — PIVENS, Sanyal et al., *NEJM* 2010, PMID **20427778**, DOI **10.1056/NEJMoa0907929** (access: abstract): "Vitamin E therapy, as compared with placebo, was associated with a significantly higher rate of improvement in nonalcoholic steatohepatitis (**43% vs. 19%, P=0.001**)". 247 randomised (84 vitamin E / 83 placebo), 96 weeks.
- **Threshold** — T1: **RR ≈ 2.26**, ARR 24 pp, **NNT ≈ 4.2**. Passes the 2-fold line.
- **Proposed E = 3.**
- **Gates that cap it**: **one RCT → C ≤ 1**, and histology is a **surrogate** for cirrhosis/liver death → C ≤ 3. Min = 1.
- **Computed headline**: **63 "Probably works"** with gates printed "Only one RCT; Outcome is a surrogate marker".
- **This is the report's clearest miscalibration**: a large, NIH-funded, placebo-controlled, biopsy-endpoint result reads *worse* (63) than zinc shaving 26 hours off a diarrhoea episode (83).

### C8 — Zinc acetate lozenges ≈ 80–92 mg elemental Zn/d, dissolved in the mouth → duration of the common cold, adults treated within ~24 h of onset

- **Effect verbatim** — Hemilä, *Front Pharmacol* 2022, PMID **35177991**, DOI **10.3389/fphar.2022.817522** (access: abstract): "In the Mossad (1996) trial, zinc gluconate lozenges **shortened common cold duration on average by 4.0 days (95% CI 2.3-5.7 days)**"; pooled zinc acetate trials: "The average effect of **2.7 days (95% CI 1.8-3.3 days)**". Hemilä, *BMC Med Res Methodol* 2017, PMID **28494765**, DOI **10.1186/s12874-017-0356-y** (access: abstract): "Mossad … found 4.0 days and **43% reduction**, and Petrus … found 1.77 days and **25% reduction**, in the duration of colds."
- **Threshold** — no consensus MCID for cold duration exists; I judged on the relative scale the authors argue for: 2.7 days off a ~7-day illness ≈ 35%, and 43% in Mossad. Both exceed any plausible patient-noticeable threshold. I did **not** verify individual trial n values — flagged as unverified.
- **Proposed E = 3**, restricted to the lozenge form and the ≤24 h start window.
- **Gates**: the zinc-acetate lozenge series is effectively one laboratory → `allPositiveIndustryOrOneLab: true` → **C ≤ 2**.
- **Computed headlines**: as a **lozenge** (F3 D3) → **69 "Works"**. As a **swallowed capsule** of the same elemental dose (F1 D2) → **59 "Probably works"** (program output Q1). The form axis works exactly as designed here — this is the rubric's best case.

### C9 — Cranberry (juice or PAC-standardised tablet) → symptomatic culture-verified UTI, children; and people made UTI-susceptible by an intervention

- **Effect verbatim** — Cochrane Williams 2023, PMID **37068952**, DOI **10.1002/14651858.CD001321.pub6** (access: abstract). Six populations, five different answers:
  - children: "5 studies, 504 participants: **RR 0.46, 95% CI 0.32 to 0.68**; I² = 21%"
  - susceptibility due to an intervention: "6 studies, 1434 participants: **RR 0.47, 95% CI 0.37 to 0.61**; I² = 0%"
  - women with recurrent UTI: "8 studies, 1555 participants: **RR 0.74, 95% CI 0.55 to 0.99**; I² = 54%"
  - elderly institutionalised: "3 studies, 1489 participants: **RR 0.93, 95% CI 0.67 to 1.30**"
  - pregnant women: "3 studies, 765 participants: **RR 1.06, 95% CI 0.75 to 1.50**"
  - neuromuscular bladder dysfunction: "3 studies, 464 participants: **RR 0.97, 95% CI 0.78 to 1.19**"
  - overall: "6211 participants: **RR 0.70, 95% CI 0.58 to 0.84**; I² = 69%"
- **Threshold** — T1: 0.46/0.47 = ~2.2-fold, passes on point estimate.
- **Proposed E = 3 (children, intervention-susceptible); E = 2 (recurrent-UTI women); E = 0 (elderly, pregnant, neuromuscular).**
- **Computed headlines**: children E3/C2/F3/D2 → **66 "Works"**; recurrent-UTI women E2/C2/F3/D2 → **60 "Probably works"**; elderly E0 → 50.
- Note the pooled row (RR 0.70) is a **weighted average of a 3, a 2 and three 0s** — precisely the averaging failure the rubric doc already flagged on 2026-09-11.

### C10 — Oral iron (ferrous salt) → incidence of anaemia in already-anaemic pregnant women (treatment, not prevention)

- **Effect verbatim** — Cochrane Reveiz 2011, PMID **21975735**, DOI **10.1002/14651858.CD003094.pub3** (access: abstract): "Oral iron in pregnancy showed a reduction in the incidence of anaemia (**risk ratio 0.38, 95% confidence interval 0.26 to 0.55, one trial, 125 women**) and better haematological indices than placebo (two trials)." Authors: "there is a paucity of good quality trials assessing clinical maternal and neonatal effects".
- **Threshold** — T1: 2.6-fold. Passes.
- **Proposed E = 3.**
- **Gates that cap it**: **one RCT (n=125) → C ≤ 1**; lab-defined outcome → surrogate → C ≤ 3. Min = 1.
- **Computed headline**: **63 "Probably works"**. The most established therapeutic nutrient replacement in clinical medicine renders "Probably works", because nobody has run a second placebo-controlled trial of iron for anaemia — and never will, because it would not pass an ethics committee.

---

## 2. Near-misses: verified `effectPoints: 2` (and the number that stopped them at 2)

| # | Supplement · dose · outcome · population | Effect verbatim | Stopped at 2 by | Computed |
|---|---|---|---|---|
| **N1** | Zinc sulphate/acetate 20 mg/d × 10–14 d · duration of acute diarrhoea · children > 6 mo, zinc-deficiency-prevalent settings. Cochrane Lazzerini 2016, PMID **27996088**, DOI **10.1002/14651858.CD005436.pub5** (access: **full text**, PMC5450879) | "**MD −11.46 hours, 95% CI −19.72 to −3.19**; 2581 children, 9 trials, low certainty"; day-7 persistence "**RR 0.73, 95% CI 0.61 to 0.88**; 3865 children, 6 trials, moderate certainty"; malnourished "**MD −26.39 hours, 95% CI −36.54 to −16.23**; 419 children, 5 trials, high certainty"; persistent diarrhoea "**MD −15.84 [−25.43, −6.24]**"; **< 6 mo: "MD 5.23 hours, 95% CI −4.00 to 14.45" → E = 0**; harm "vomiting **RR 1.57, 95% CI 1.32 to 1.86**" | **RR 0.73 > 0.50** (T1) and −11.5 h ≈ 12% of a 3–4 day episode. WHO endorses it (T3) but endorsement ≠ large | **75 "Works"**; malnourished subgroup with a clean checklist **83 "Works"** |
| **N2** | Caffeine anhydrous 4–6 mg/kg (≈ 280–420 mg) · aerobic time-trial completion time · trained adults 18–59. *Nutrients* 2026, PMID **42356375**, DOI **10.3390/nu18121989** | low dose "**SMD of −0.27 (95% CI: −0.44 to −0.11; p = 0.001)**"; moderate dose "**SMD of −0.52 (95% CI: −0.77 to −0.28)**"; 48 studies, 689 participants | **SMD 0.52 < 0.80** (T2) | **67 "Works"** — and the "Best RCT is small or short" gate fires spuriously (mean n ≈ 14 because these are crossovers) → **F5** |
| **N3** | Caffeine · resistance-exercise outcomes · **female** participants. *Front Physiol* 2026, PMID **42591203**, DOI **10.3389/fphys.2026.1892370** | maximal strength "**g = 0.17, 95% CI 0.06 to 0.29; low GRADE**"; muscular endurance "**g = 0.54, 95% CI 0.06 to 1.02; low GRADE**"; movement speed "g = 0.13; CR2 p = 0.072; very low GRADE" | g 0.17 = **small** (T2); the 0.54 has a prediction interval the authors call "low reproducibility" | E=1 for strength · E=2 unstable for endurance |
| **N4** | Multi-strain probiotic · NEC · very preterm / VLBW infants. Cochrane Sharif 2023, PMID **37493095**, DOI **10.1002/14651858.CD005496.pub6** | "**RR 0.54, 95% CI 0.46 to 0.65**; I² = 17%; 57 trials, 10,918 infants; low certainty. The **NNTB was 33** (95% CI 25 to 50)"; mortality "**RR 0.77, 95% CI 0.66 to 0.90**"; **ELBW subgroup NEC "RR 0.92, 95% CI 0.69 to 1.22"** | **RR 0.54 > 0.50** (T1); absolute benefit **3 pp** | **58 "Probably works"** |
| **N5** | Icosapent ethyl / high-dose omega-3 **4 g/d** · triglycerides · very high TG (5.6–22.6 mmol/L). *Lipids Health Dis* 2023, PMID **37301827**, DOI **10.1186/s12944-023-01838-8**; MARINE lipoprotein analysis PMID **23312052**, DOI **10.1016/j.jacl.2012.07.001** | "IPE (4 g/day) lowered TG levels by an average of 28.4% from baseline and by an average of **19.9% after correction for placebo (95% CI: 29.8%-10.0%)**", n=373, 12 wk; MARINE n=229: "large VLDL **−27.9%**; total LDL **−16.3%**" | **19.9% placebo-corrected**, nowhere near a doubling-equivalent; and **pure surrogate** — TG lowering per se has no established event benefit. Prescription drug; OTC fish oil is a different ester → F 2 | **63 "Probably works"** |
| **N6** | Nicotinamide 500 mg twice daily · new nonmelanoma skin cancers · adults with ≥ 2 NMSC in 5 y. ONTRAC, *NEJM* 2015, PMID **26488693**, DOI **10.1056/NEJMoa1506197** | "the rate of new nonmelanoma skin cancers was **lower by 23% (95% confidence interval [CI], 4 to 38)** in the nicotinamide group … (P=0.02)"; BCC "**20% [95% CI, −6 to 39]** lower, P=0.12"; SCC "**30% [95% CI, 0 to 51]** lower, P=0.05"; n=386, 12 mo | **23% ≪ 50%** (T1), and CI lower bound 4% | **58 "Probably works"** (single RCT → C ≤ 1) |
| **N7** | Natto red yeast rice 1950 mg/d · LDL-C · dyslipidaemia. *JACC Asia* 2026, PMID **42212982**, DOI **10.1016/j.jacasi.2026.03.019** | vs placebo "**−21.02 mg/dL (95% CI: −27.98 to −14.06 mg/dL)/−13.21% (95% CI: −17.88% to −8.54%)**"; simvastatin 20 mg arm −25.80 mg/dL / −17.08%; n=1110, 3 mo | **13.2%** → **E = 1** (T1); surrogate; monacolin K is unstandardised across SKUs so form fit collapses | **59 "Probably works"** |
| **N8** | Melatonin · sleep-onset latency · adults, primary sleep disorders. Ferracioli-Oda 2013, PMID **23691095**, DOI **10.1371/journal.pone.0063773** | "melatonin demonstrated significant efficacy in reducing sleep latency (**weighted mean difference (WMD) = 7.06 minutes [95% CI 4.37 to 9.75]**, Z = 5.15)"; 19 studies, 1683 subjects; authors: "**The effects of melatonin on sleep are modest**" | **7 minutes** → **E = 1** | **57 "Probably works"** — see F8 |
| **N9** | Melatonin 3–6 mg · sleep onset · children with ASD / with atopic dermatitis. *Sleep Breath* 2025, PMID **40768003**, DOI **10.1007/s11325-025-03432-x**; *Front Med* 2025, PMID **41647028**, DOI **10.3389/fmed.2025.1718859** | ASD: "The **Hedges' g values for these two indicators were 0.75 and 0.58**" (sleep quality, total sleep time). AD: "**SMD of −0.63 (95% CI: −1.00 to −0.26, p = 0.0009)**" for SOL; SCORAD "**MD −6.60 (95% CI −10.11 to −3.10)**, but **this did not exceed the MCID**" | g 0.75 / 0.63 = **medium** (T2), just short of 0.80. Note the AD paper does the exact thing audit-v0.2 asks for: names an MCID and reports failing it | E = 2 in these defined child populations vs E = 1 in adults — a legitimate population split |
| **N10** | Vitamin A 200,000 IU periodic · **all-cause mortality** · children 6–59 mo. Cochrane Imdad 2022, PMID **35294044** | "a **12% observed reduction** in the risk of all-cause mortality … (**risk ratio (RR) 0.88, 95% CI 0.83 to 0.93**; **high-certainty evidence**)", 19 trials, **1,202,382 children**; diarrhoea mortality "**RR 0.88, 95% CI 0.79 to 0.98**"; authors: "VAS is associated with a **clinically meaningful** reduction in morbidity and mortality" | **RR 0.88 → E = 1** under T1 | **63 "Probably works"** — see **F11** |
| **N11** | Oral vitamin B12 1000–2000 µg/d · **serum B12 normalisation** · B12 deficiency. Cochrane Wang 2018, PMID **29543316**, DOI **10.1002/14651858.CD004655.pub3** | 3 RCTs, 153 participants, 3–4 mo. "One trial used 2000 μg/day … and demonstrated a **mean difference of 680 pg/mL (95% confidence interval 392.7 to 967.3)** in favour of oral vitamin B12." And: "**No trial reported on clinical signs and symptoms of vitamin B12 deficiency, health-related quality of life, or acceptability**" | The lab effect is enormous; the clinical effect was **never measured**. Pure surrogate + n < 60 arms | **63 "Probably works"** for a claim with zero measured clinical outcomes. **The most dangerous computed number in this report.** |

---

## 3. Explicitly REJECTED for `effectPoints: 3` — with the disqualifying number

| Candidate | Disqualifying number (verbatim) | Source |
|---|---|---|
| Preventive zinc → all-cause child mortality | "**RR 0.93, 95% CI 0.84 to 1.03**; 16 studies, 17 comparisons, 143,474 participants" (**high-certainty**); LRTI morbidity "**RR 1.01, 95% CI 0.95 to 1.08**" (high-certainty) | Cochrane Imdad 2023, PMID **36994923**, DOI **10.1002/14651858.CD009384.pub3** → **E = 0**, computed **50 "No meaningful benefit"** (rubric handles this correctly) |
| Calcium in pregnancy → pre-eclampsia | "Sensitivity analysis excluding small studies indicates little to no difference in pre-eclampsia (**RR 0.92, 95% CI 0.79 to 1.05**; 4 RCTs, 14,730 women; **high-certainty evidence**)" | Cochrane 2025, PMID **41330480**, DOI **10.1002/14651858.CD001059.pub6** → **E = 0** |
| Peppermint oil 182 mg bd/tds → paediatric IBS / FAP | "treatment success was comparable … peppermint oil (n = 30; 44.0%) and placebo (n = 28; 37.3%) (**odds ratio [OR], 1.33; 97.5% CI, 0.58-3.09; P = .44**)"; n=228 | *Clin Gastroenterol Hepatol* 2026, PMID **41610933**, DOI **10.1016/j.cgh.2026.01.014** → **E = 0 / unclear** |
| Bovine lactoferrin 200/400 mg → Hb in IDA | "mean differences were **−1.2 g/dL (95% CI: −1.6 to −0.9)** and **−1.1 g/dL (95% CI: −1.4 to −0.8)**" — i.e. **inferior to 60 mg ferrous sulfate**; "both bLF doses were inferior" | *J Nutr* 2026, PMID **42302886** → not a 3; a marketed iron alternative that **loses** to the cheap salt |
| Low-dose omega-3 825–903 mg/d → triglycerides | "Mean TG levels decreased slightly in the PL group (**−9.1 mg/dL**) and increased in the standard group (**+15.2 mg/dL**), with **no statistically significant difference between-groups (p = 0.416)**"; n=44 | *BMC Complement Med Ther* 2026, PMID **41514392** → **E = 0/unclear.** The 4 g result (N5) does **not** transfer to a 1 g capsule |
| Iodine supplementation → maternal/child outcomes in mild–moderate deficiency | Only clear finding: "increased the likelihood of the adverse effect of digestive intolerance in pregnancy **by 15 times (average RR 15.33; 95% CI 2.07 to 113.70**, one trial … 76 women, very low-quality)"; no clear benefit on hypothyroidism, preterm birth, TPO-ab | Cochrane Harding 2017, PMID **28260263**, DOI **10.1002/14651858.CD011761.pub2** → **E = unknown, with a documented harm**. The IQ evidence (PMID **30920622**, DOI 10.1210/jc.2018-02559) is an **observational cohort IPD meta-analysis**, not RCTs → `bodyIsRct: false` |
| Thiamine → Wernicke–Korsakoff | "Two studies … only one contained sufficient data … randomly assigned participants (**n = 107**) to one of five doses of **intramuscular** thiamine and measured outcomes after **2 days** … (**MD −17.90, 95% CI −35.4 to −0.40, P = 0.04**)" on a delayed alternation test | Cochrane Day 2013, PMID **23818100**, DOI **10.1002/14651858.CD004033.pub3** → **cannot be scored for an oral supplement at all**: no oral RCT, no placebo arm, IM route, 2-day follow-up |
| Vitamin D → nutritional rickets | "**pooled OR 0.38 (95% CI 0.01, 10.20; P = 0.57)**" for radiological improvement, **low vs high dose — there is no placebo arm** | *Indian Pediatr* 2026, PMID **41701309**, DOI **10.1007/s13312-026-00273-z** → the most dramatic nutrient cure in paediatrics is **unscoreable**, because placebo would be unethical |
| ORS vs IV rehydration | "There were more treatment failures with ORT (**RD 4%, 95% CI 1 to 7** … **NNT = 25**)"; no difference in weight gain, duration of diarrhoea, or fluid intake | Cochrane Hartling 2006, PMID **16856044**, DOI **10.1002/14651858.CD004390.pub2** → **E = 0** on the head-to-head: ORS is a logistics win, not an efficacy win |
| Vitamin C → cold incidence, general population | "In the general community trials involving 10,708 participants, the pooled **RR was 0.97 (95% CI 0.94 to 1.00)**"; duration in adults reduced by "**8% (3% to 12%)**" | Cochrane 2013, PMID **23440782** → **E = 0** for incidence, **E = 1** for duration |
| Melatonin in adults (N8), red yeast rice (N7), nicotinamide (N6), caffeine (N2/N3), probiotics/NEC (N4), zinc/diarrhoea (N1), omega-3 4 g (N5), vitamin A all-cause mortality (N10) | see §2 for the exact numbers | all → **E = 1 or 2** |

**Also rejected as unscoreable rather than small**, because no controlled trial exists and none can ethically be run: vitamin C for scurvy, thiamine for infantile/wet beriberi, B12 for pernicious anaemia, zinc for acrodermatitis enteropathica, pyridoxine for pyridoxine-dependent epilepsy. I searched for RCTs of these and found none; the rickets and Wernicke rows above are the closest published attempts and both compare *doses*, never placebo. Program output **P1** confirms the consequence: `rctCount: 0` → headline `null`, label **"Not scored"**.

---

## 4. Is there a systematic pattern in what earns a 3?

**Yes, and it is sharp.** Every verified 3 in §1 satisfies all three of the following. Every candidate that failed, failed at least one.

1. **Replacement, not enhancement.** The intervention supplies a molecule the body cannot make and the person is not getting. C1–C4, C6, C10 are replacement. C5, C8, C9 are the only non-replacement 3s, and all three are *pharmacological* actions in a host under active challenge (antibiotic disruption, a live rhinovirus, bacterial adherence) — not the improvement of a functioning system.
2. **A population defined by deficiency or high baseline risk**, which is what makes a 2-fold ratio also a large *absolute* effect. Iron: 18.4% → 5.0%. Probiotic AAD: 19% → 8%, NNT 9. Vitamin E NASH: 19% → 43%, NNT 4. Where the control-arm rate is low, the same relative effect becomes trivial: probiotics/NEC is RR 0.54 but NNT 33.
3. **The outcome is the deficiency syndrome itself**, not a distal composite the nutrient only partly drives. Night blindness (E=3) vs all-cause mortality (E=1) come from *the same Cochrane review, the same intervention, the same children*. The nutrient fully determines the first and marginally determines the second.

**Not one enhancement-in-healthy-people claim reached 3 anywhere in the live literature I searched.** Caffeine 0.52. Melatonin 7 minutes. Red yeast rice 13%. Nicotinamide 23%. Vitamin C in the general population 0.97. Creatine, per the repo's own first live audit table in the rubric doc, E=1. The ceiling for "make a working system work better with an oral supplement" appears to be **effectPoints 2**, and the two ways a healthy-person claim reaches 3 in this dataset are both artefacts: **a surrogate endpoint** (serum B12, TG, LDL) or **a single small trial** (PIVENS).

### Consumer-facing implication for how BS Proof should frame scores

**Implication 1 — the score belongs to a person, not to a bottle.** Vitamin C at 1 g/d computes to **100 "Works"** for a marathon runner and **50 "No meaningful benefit"** for a desk worker (program outputs Q4, Q5). Cranberry has six populations and five different answers (0.46 → 1.06). Folic acid is a 3 for women with a prior NTD pregnancy and **unscoreable** for everyone else. The honest consumer question is not *"does this work?"* but **"am I the person it was shown to work in, and am I actually missing the thing it replaces?"** The Overall tab as currently specified (`mean(headline of picked AND scored outcomes)`) averages across exactly the axis that carries all the signal. The rubric doc already flags this for vitamin D on 2026-09-11; cranberry is a far worse case and it is a real product on real shelves.

**Implication 2 — lead with "are you deficient?", not with a number.** The pattern means the highest-value screen BS Proof could show before any score is a deficiency/risk triage: *"This ingredient earns its best evidence in people who are short of it. Are you?"* That is a cheap, defensible, non-clinical question and it converts a misleading 88 into an honest 88-for-you or 50-for-you.

**Implication 3 — "Works" is currently reachable from "Small benefit", and users will read that as a lie.** `bandLabel` (`ledger.ts:81`) is a pure function of the headline, so E=1 with clean evidence and perfect fit → 67 → **"Works"** (program output P7). A 7-minute sleep-latency improvement renders **"Probably works"** (N8, 57). Recommend gating the word "Works" on E ≥ 2, or rendering the effect word at equal visual weight to the number.

---

## 5. Can the current rubric express these cases at all?

Partly. Two of the three categories in the brief are handled; the third is silently dropped, and a large effect on a surrogate is actively mishandled. Findings are ordered by severity; every one is backed by a program output from the real `ledger.ts`.

**F1 — BLOCKER · `app/design-lab/ab/ledger.ts:92` and `:105`. Frank deficiency disease with no RCT is rendered identically to "never studied".**
`rctCount === 0` → cap 0, and `certainty > 0 && rctCount > 0` gates the headline → `null` → label **"Not scored"** (probe **P1**: E=3, no RCT → `head=NULL "Not scored"`). Vitamin C/scurvy, thiamine/beriberi, B12/pernicious anaemia, zinc/acrodermatitis enteropathica, vitamin D/rickets, pyridoxine/PDE — the **most certain nutrient effects in all of medicine** — are therefore unscoreable, and indistinguishable on screen from tongkat ali. `prompts/research_audit.md` is explicit that '"No evidence found" and "evidence of no benefit" are different findings' — the ledger loses a third, worse case: *"the effect is so certain that a trial is unethical."* GRADE itself has a route for this (rating up two levels for a ≥5-fold effect, PMID 21802902); the rubric borrows GRADE's shape without borrowing that route. There is no `dramatic_response`, `historical_control`, or `withdrawal_rechallenge` field on `Ledger`.

**F2 — BLOCKER · `ledger.ts:94, 105-107`. A large effect on a pure surrogate renders 88 "Works".**
The surrogate gate caps certainty at 3 and prints one line; it does not touch the effect axis or the band label. Probe **P4**: E=3, surrogate, clean checklist → **88 "Works"**. Program output **Q6** (iron → anaemia at term with the surrogate flag on) → **88 "Works"**. And the live-verified worst case, **N11**: oral B12 → serum B12 computes **63 "Probably works"** for a body of evidence where Cochrane states in terms that "No trial reported on clinical signs and symptoms of vitamin B12 deficiency, health-related quality of life". A screen that says "Probably works" there is making a claim no trial has ever tested. Recommend: surrogate should cap the **headline** (e.g. ≤ 60) or force the missing link into the label, not a footnote.

**F3 — BLOCKER · `ledger.ts:11, 77`. The effect scale is asymmetric and cannot express small or moderate harm.**
`effectPoints: -3 | 0 | 1 | 2 | 3` — there is no −1 or −2. Zinc's own live-verified harm ("vomiting **RR 1.57, 95% CI 1.32 to 1.86**; moderate certainty", CD005436.pub5) has nowhere to go: it must be flattened into "No meaningful effect" or escalated to "Harm reported" → headline **0 "Evidence against"** (probe P11). A supplement that helps a bit *and* harms a bit — which is what zinc, iron (GI intolerance), iodine (RR 15.33 for digestive intolerance) and vitamin E (dose above the UL) all are — cannot be represented. The rubric's decision to keep safety in a separate visible block is defensible, but the enum still advertises a −3 that the scale can only reach as a cliff.

**F4 — MAJOR · rubric §Dimensions + `ledger.ts:11`. The rubric never says whether the band comes from the point estimate or the CI, and it is worth 5–17 headline points.**
"large +3 · unclear (CI spans both)" implies the point estimate sets the band. Under that reading folic acid RR 0.31 (0.17–**0.58**) is a 3 → **88**. Under a strict "whole CI beyond the large threshold" reading it is a 2 → **75** (program output Q2), or **83** with a clean checklist (Q3). The same swing hits vitamin C in athletes (upper 0.64), cranberry in children (upper 0.68) and probiotics/AAD (upper 0.56). **Only C3 (night blindness, 0.21–0.50) survives the strict reading.** This must be written down before `ledgerToScore()` gets golden tests, or repeat-run stability (open item 3 in the rubric doc) will fail for reasons that are not the model's fault.

**F5 — MAJOR · `ledger.ts:93`. `largestRctN < 50` mis-fires on crossover designs.**
The caffeine literature is 48 studies / 689 participants — mean n ≈ 14 — because ergogenic trials are within-subject crossovers where n=14 is adequately powered. The gate prints "Best RCT is small or short" and caps C at 2 for a body of evidence that is not weak in the way the gate means. There is no `design: crossover` or `within_subject` field on `Ledger["gates"]`.

**F6 — MAJOR · `prompts/research_audit.md` v0.2 point 5 vs `ledger.ts:10-17`. `subgroup_hypothesis_only` has no field and is silently dropped at the scoring boundary.**
The prompt is explicit: "A subgroup effect needs an INTERACTION test, not a bare subgroup p-value; otherwise label it `subgroup_hypothesis_only`." **Every one of my strongest 3s is a subgroup**: vitamin A/measles mortality is the <2 y two-dose subgroup (RR 0.18), vitamin C is the extreme-exercise subgroup (RR 0.48), zinc's best result is the malnourished subgroup (MD −26.39 h), cranberry's 3s are two of six population strata. None of the reviews reports an interaction test in the text I read. `Ledger` has no field to carry the flag and `score()` has no term to price it, so v0.2's most important epistemic safeguard cannot reach the number.

**F7 — MAJOR · `ledger.ts:97, 101-103`. The 0.10 unknown-fit price is too weak for a product-level score.**
Probe **P9**: E=3, C=4, form **untested** and dose **unknown** → applicability 0.100 → **55 "Probably works"**. "We have no idea whether this bottle contains a tested form at a working dose" cannot push a claim out of the positive bands. Compare C8, where a real form mismatch (lozenge evidence applied to a swallowed capsule) only moves 69 → 59, still "Probably works" (Q1).

**F8 — MAJOR · `ledger.ts:81, 115`. `bandLabel` is a function of the headline alone, so "Works" is reachable from "Small benefit".**
Probe **P7**: E=1, C=4, F4 D4 → **67 "Works"**, while `effectWord` simultaneously reads "Small benefit". The two strings contradict each other on the same card.

**F9 — MINOR · `ledger.ts:88, 105, 146`. `bodyIsRct` and `gates.rctCount` can contradict each other and nothing checks it.**
Probe **P13**: `bodyIsRct: false` with `rctCount: 5` yields C=2 and a headline of **75 "Works"**. `ledgerFromAudit()` copies both fields straight out of model JSON with no consistency assertion. This is the exact shape the iodine case would take (observational IPD meta-analysis for the IQ claim, RCTs for the thyroid claims).

**F10 — MINOR (already known, now confirmed for positives) · `ledger.ts:92`. The single-mega-RCT cap bites large benefits, not just nulls.**
The rubric doc records this for VITAL-DEP. Probe **P10**: E=3 from a single n=18,353 trial → C=1 → **63**. Real instances in my set: C7 (PIVENS, n=247, 96 wk, NNT 4 → 63) and C10 (Cochrane's oral-iron treatment row, n=125 → 63).

**F11 — CALIBRATION INVERSION (evidence, not code).** The computed ordering, all from the real `score()`:

| Claim | Verified effect | Headline |
|---|---|---|
| Zinc 20 mg → diarrhoea duration, malnourished children | −26.4 h (−36.5, −16.2), high certainty | **83 "Works"** |
| Caffeine 4–6 mg/kg → time-trial performance | SMD −0.52 (−0.77, −0.28) | **67 "Works"** |
| Vitamin A → **all-cause child mortality** | RR 0.88 (0.83, 0.93), **high certainty, 1,202,382 children** | **63 "Probably works"** |
| Vitamin E 800 IU → NASH histology | 43% vs 19%, **NNT 4.2** | **63 "Probably works"** |
| Oral iron → anaemia in anaemic pregnant women | RR 0.38 (0.26, 0.55) | **63 "Probably works"** |
| Melatonin → sleep-onset latency, adults | **7.06 min** (4.37, 9.75) | **57 "Probably works"** |

A supplement that demonstrably averts hundreds of thousands of child deaths scores **below** a supplement that shaves seconds off a bike time trial, and only 6 points above a 7-minute sleep improvement. Cause: E is a magnitude grade that C can only *shrink*, so an overwhelming trial base cannot compensate for a modest-but-vital effect; and the gate caps punish precisely the designs that settle questions (one huge trial, one definitive trial).

### Direct answer to "can the rubric express these cases at all?"

- **Category (a), frank deficiency disease:** expressible **only where a placebo RCT happens to exist** (folic acid, iron, vitamin A, vitamin C in athletes). For the classic deficiency cures — scurvy, beriberi, pernicious anaemia, rickets, acrodermatitis enteropathica — **no, it cannot be expressed at all**; they render "Not scored" (F1). This is the largest single gap.
- **Category (b), drug-like effects at supplement doses:** **expressible and mostly well handled.** They land at 1–2 and the form/dose axes do real work (the zinc-lozenge-vs-capsule case, C8/Q1, is the rubric at its best). One exception: **surrogate-heavy drug-like claims are mishandled** — 4 g omega-3 → TG and 2 mg B12 → serum B12 both compute into positive bands on endpoints nobody feels (F2).
- **Category (c), genuinely large effect in a defined group:** **expressible in principle, unreliable in practice**, because the defined group is almost always a **subgroup** and the rubric's own subgroup safeguard has no field in the code (F6), and because a definitive single trial is capped to C=1 (F10).

**Net:** the rubric's four dimensions are the right dimensions and the code correctly refuses to let a model write the number. What it cannot yet do is distinguish *"large and it matters"* from *"large on a marker"*, *"unstudied"* from *"unstudiable"*, and *"the effect exists"* from *"the effect is worth your money"*. All three of those distinctions are exactly what a consumer buys BS Proof for.

Per `CLAUDE.md` invariant 4 and `AGENTS.md`, I proposed no constant changes and made no edits. Every item in §5 that implies a numeric change (surrogate headline cap, unknown-fit price, E ≥ 2 gate on the word "Works", a large-precise-RCT floor, a −1/−2 harm grade) is a **founder call** and belongs in `docs/REVIEW_PENDING.md`.

---

## Appendix A — reproduction

```bash
# abstracts (resultType=core) — the query shape used throughout
curl -s -G "https://www.ebi.ac.uk/europepmc/webservices/rest/search" \
  --data-urlencode 'query=DOI:"10.1002/14651858.CD005436.pub5"' \
  --data-urlencode 'format=json' --data-urlencode 'resultType=core'

# the one full text I opened
curl -s "https://www.ebi.ac.uk/europepmc/webservices/rest/PMC5450879/fullTextXML"

# guideline bodies (both HTTP 200)
curl -sL "https://www.who.int/news-room/fact-sheets/detail/diarrhoeal-disease"
curl -sL "https://www.cdc.gov/folic-acid/about/index.html"

# headlines: the REAL ledger.ts, compiled with the repo's own tsc
cp app/design-lab/ab/ledger.ts /tmp/bsp/calc/ && cd /tmp/bsp/calc
node_modules/.bin/tsc --target es2020 --module es2022 --moduleResolution bundler \
  --outDir out run.ts ledger.ts && node out/run.js
```

## Appendix B — access ledger (per `prompts/research_audit.md` STEP 1)

- **full_text (1):** PMC5450879 (Cochrane CD005436.pub5, zinc/diarrhoea) — read the analysis tables directly.
- **abstract (24):** all other PMIDs cited. Europe PMC `resultType=core` returns the complete structured Cochrane abstract, which is where Cochrane prints its effect estimates with CI, GRADE certainty and participant counts — so effect sizes are verbatim from the source, not from a secondary description.
- **full page (2):** WHO diarrhoeal-disease fact sheet; CDC folic-acid page.
- **could_not_access:** `fullTextXML` returned 0 bytes for PMC8783750, PMC8925277, PMC6494183, PMC10636779 (Cochrane reviews not open in EPMC full text); NEJM full texts for ONTRAC and PIVENS (abstract only — absolute event counts and per-arm CIs not verified); `who.int/publications/i/item/9789241593180` returned **404**; individual trial n values for the zinc-lozenge trials (Mossad 1996, Petrus 1998) **not verified** — flagged inline.
- **overlap / dedup:** the Cochrane reviews and their included trials are counted **once**. MRC Vitamin Study 1991 (PMID 1677062) is `pooled_in: 10.1002/14651858.CD007950.pub3` and is quoted only to give the pivotal trial's own numbers, not to raise certainty. CD001321.pub6 and .pub7 are the same review; CD008524.pub3 and .pub4 likewise (pub4 found no new RCTs).
- **self_confidence:** medium-high on effect sizes (all verbatim from opened text); medium on the E assignments (T1/T2 are defensible but the point-estimate-vs-CI ambiguity in F4 is unresolved in the rubric); **high** on the computed headlines and on every finding in §5, because those are outputs of the repo's own code.

## Appendix C — searches run

`DOI:"..."` and `EXT_ID:"..."` lookups for every ID cited, plus title searches for: oral zinc for treating diarrhoea in children · periconceptional oral folate supplementation · vitamin A supplementation for preventing morbidity and mortality in children 6 mo–5 y · vitamin A for treating measles in children · oral vs intramuscular vitamin B12 · cranberries for preventing urinary tract infections · nicotinamide for skin-cancer chemoprevention · pioglitazone/vitamin E/placebo for NASH · probiotics to prevent necrotising enterocolitis · probiotics for prevention of pediatric antibiotic-associated diarrhea · melatonin for primary sleep disorders · melatonin in children/ASD/atopic dermatitis · lactase + lactose intolerance · daily oral iron supplementation during pregnancy · treatments for iron-deficiency anaemia in pregnancy · iron for restless legs syndrome · ferrous + iron deficiency anaemia RCTs · caffeine + exercise performance meta-analyses · icosapent/AMR101/very high triglycerides · omega-3 + hypertriglyceridemia RCTs · red yeast rice + lipids · psyllium/ispaghula + constipation · peppermint oil + irritable bowel · potassium citrate + calcium oxalate · nutritional rickets + vitamin D · thiamine for Wernicke-Korsakoff · iodine supplementation preconception/pregnancy/postpartum · iodine + cognition/IQ · calcium supplementation during pregnancy for hypertensive disorders · oral versus intravenous rehydration · zinc for preventing mortality/morbidity/growth failure · zinc + common cold + lozenges/duration · vitamin C for preventing and treating the common cold · MRC Vitamin Study · GRADE guidelines 9 rating up · SMD interpretation/effect size · MCID insomnia/sleep.

```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "Report delivers 10 verified effectPoints-3 candidates and 11 verified near-misses/rejections, each with a DOI/PMID I opened this session, the effect size verbatim with CI, the named meaningfulness threshold (GRADE guidelines 9 PMID 21802902 for ratio measures; Andrade PMID 37555679 for SMD; live WHO and CDC pages for guideline standing), plus 11 severity-tagged structural findings with concrete file paths and line numbers in app/design-lab/ab/ledger.ts (lines 11, 77, 81, 88, 92, 93, 94, 97, 101-103, 105-107, 115, 146), prompts/research_audit.md and docs/design/2026-09-10-evidence-ledger-rubric.md. All headlines are outputs of the repo's real score() function compiled with node_modules/.bin/tsc, not hand arithmetic."
    }
  ],
  "changedFiles": [],
  "testsAddedOrUpdated": [],
  "commandsRun": [
    {
      "command": "curl -s -G https://www.ebi.ac.uk/europepmc/webservices/rest/search --data-urlencode 'query=...' --data-urlencode format=json --data-urlencode resultType=core  (approx 30 queries)",
      "result": "passed",
      "summary": "Retrieved verbatim structured abstracts with effect sizes and CIs for 25 sources; recorded 4 Cochrane reviews whose fullTextXML returned 0 bytes"
    },
    {
      "command": "curl -s https://www.ebi.ac.uk/europepmc/webservices/rest/PMC5450879/fullTextXML",
      "result": "passed",
      "summary": "699 KB full text of Cochrane CD005436.pub5 (zinc/diarrhoea); read the analysis tables directly"
    },
    {
      "command": "curl -sL https://www.who.int/news-room/fact-sheets/detail/diarrhoeal-disease ; curl -sL https://www.cdc.gov/folic-acid/about/index.html",
      "result": "passed",
      "summary": "Both HTTP 200; extracted the WHO zinc-for-diarrhoea recommendation and the CDC 400 mcg folic-acid recommendation verbatim. who.int/publications/i/item/9789241593180 returned 404 and is recorded as could-not-access."
    },
    {
      "command": "node_modules/.bin/tsc --target es2020 --module es2022 --moduleResolution bundler --outDir out run.ts ledger.ts && node out/run.js  (plus probe.ts, probe2.ts)",
      "result": "passed",
      "summary": "Compiled and ran an unmodified copy of app/design-lab/ab/ledger.ts against 22 candidate ledgers and 22 structural probes; every headline, certainty, applicability, label and fired-gate string in the report is a captured program output"
    }
  ],
  "validationOutput": [
    "22 candidate ledgers scored by the real score(): C1 folic acid/NTD E=3 C=3 -> 88 Works; C3 vitamin A/night blindness E=3 C=3 -> 88 Works; C7 vitamin E/NASH E=3 C=1 -> 63 Probably works (gates: Only one RCT; Outcome is a surrogate marker); C10 oral iron/anaemia treatment E=3 C=1 -> 63 Probably works; N10 vitamin A/all-cause child mortality E=1 C=3 -> 63 Probably works; N8 melatonin/7.06 min E=1 C=2 -> 57 Probably works; N12 preventive zinc/mortality E=0 C=4 -> 50 No meaningful benefit",
      "Structural probes: P1 rctCount=0 with E=3 -> headline NULL 'Not scored' (deficiency cures unscoreable); P4 E=3 pure surrogate -> 88 'Works'; P7 E=1 C=4 -> 67 labelled 'Works' while effectWord reads 'Small benefit'; P9 E=3 with formFit and doseFit both unknown -> applicability 0.100 -> 55 'Probably works'; P10 E=3 from a single n=18353 RCT -> C=1 -> 63; P13 bodyIsRct=false with rctCount=5 -> C=2 -> 75 (contradictory ledger not rejected)",
      "Reading-ambiguity quantified: folic acid RR 0.31 (0.17-0.58) scores 88 under the point-estimate reading and 75-83 under a strict whole-CI reading; only vitamin A/night blindness RR 0.32 (0.21-0.50) survives the strict reading",
      "Population split quantified on one product: vitamin C 0.2-1 g/d -> 100 'Works' in marathon runners/skiers/soldiers (RR 0.48, 95% CI 0.35-0.64) vs 50 'No meaningful benefit' in the general community (RR 0.97, 95% CI 0.94-1.00)"
  ],
  "residualRisks": [
    "24 of 27 sources were read at abstract level via Europe PMC resultType=core. For Cochrane reviews that abstract is where the effect estimates, CIs, GRADE certainty and participant counts are printed, so effect sizes are verbatim from source; but per-arm event counts and risk-of-bias detail behind those numbers were not independently checked except for CD005436.pub5.",
    "fullTextXML returned 0 bytes for PMC8783750, PMC8925277, PMC6494183 and PMC10636779; NEJM full texts for ONTRAC (PMID 26488693) and PIVENS (PMID 20427778) were not accessible, so absolute event counts for those two trials are unverified.",
    "Individual trial n values for the zinc-lozenge trials (Mossad 1996, Petrus 1998) are not verified and are flagged inline; the C8 gate inputs are therefore my constructed estimates.",
    "Gate-field values (rctCount, largestRctN, longestRctWeeks) are constructed ledger inputs derived from the trial counts and participant totals printed in each source, not verified largest-single-trial figures; several sources give totals only. Only the effect sizes are verbatim. Headlines shift if a real audit assigns different gate values.",
    "Checklist concern counts are my judgement calls, not source-stated values, and each concern moves the headline by roughly 8-25 points; the sensitivity is shown explicitly for C1, C3, C6 and C7.",
    "Nearly every strongest effectPoints-3 candidate is a subgroup result and I found no interaction test reported in the text I read; under audit-v0.2 these should be labelled subgroup_hypothesis_only, which the Ledger interface cannot represent (finding F6).",
    "Searches were English-language Europe PMC title/DOI queries; a systematic search could surface additional large-effect candidates I did not reach, particularly in orphan metabolic disease where I found no RCTs at all."
  ],
  "noStagedFiles": true,
  "diffSummary": "No repo changes. Read-only investigation. Working files created only under /tmp/bsp (scratch XML, abstract dumps, and a compiled copy of ledger.ts used to compute headlines); the single report artifact was written to the mandated output path.",
  "reviewFindings": [
    "blocker: app/design-lab/ab/ledger.ts:92,105 - rctCount===0 caps certainty at 0 and gates the headline to null, so frank deficiency cures with no placebo RCT (vitamin C/scurvy, thiamine/beriberi, B12/pernicious anaemia, vitamin D/rickets, zinc/acrodermatitis enteropathica) render 'Not scored', identical to never-studied. Verified by probe P1 and by three live searches that found only dose-comparison trials (Cochrane CD004033.pub3 PMID 23818100; Indian Pediatr PMID 41701309, pooled OR 0.38 95% CI 0.01-10.20 low vs high dose, no placebo arm). GRADE itself has a rate-up route for >=5-fold effects (PMID 21802902) that the rubric does not borrow.",
    "blocker: app/design-lab/ab/ledger.ts:94,105-107 - the surrogate gate caps certainty at 3 but does not touch the effect axis or bandLabel, so a large effect on a pure biomarker renders 88 'Works' (probe P4, output Q6). Live worst case: Cochrane CD004655.pub3 (PMID 29543316) oral B12 raises serum B12 by MD 680 pg/mL (95% CI 392.7-967.3) while stating 'No trial reported on clinical signs and symptoms of vitamin B12 deficiency, health-related quality of life' - computes to 63 'Probably works'.",
    "blocker: app/design-lab/ab/ledger.ts:11,77 - effectPoints is -3|0|1|2|3 with no -1 or -2, so small and moderate harms cannot be expressed. Zinc's own verified harm (vomiting RR 1.57, 95% CI 1.32-1.86, moderate certainty, CD005436.pub5) must be flattened to 'No meaningful effect' or escalated to 'Harm reported' -> headline 0 'Evidence against' (probe P11). Same problem for iodine (digestive intolerance RR 15.33, 95% CI 2.07-113.70, CD011761.pub2) and vitamin E 800 IU above the UL.",
    "major: docs/design/2026-09-10-evidence-ledger-rubric.md (Dimensions table) and app/design-lab/ab/ledger.ts:11 - the rubric never states whether the effect band comes from the point estimate or from the confidence interval. Folic acid RR 0.31 (0.17-0.58) is E=3 -> 88 under the point-estimate reading and E=2 -> 75-83 under a strict whole-CI reading (outputs Q2, Q3). Same swing on vitamin C in athletes (upper 0.64), cranberry in children (upper 0.68) and probiotics/AAD (upper 0.56). Only vitamin A/night blindness (0.21-0.50) survives the strict reading. Must be written down before ledgerToScore() gets golden tests, or the repeat-run stability item in the rubric doc will fail for non-model reasons.",
    "major: app/design-lab/ab/ledger.ts:93 - 'largestRctN < 50' mis-fires on within-subject crossover designs. The caffeine literature is 48 studies / 689 participants (mean n ~14) because ergogenic trials are crossovers; the gate prints 'Best RCT is small or short' and caps certainty at 2 for a body that is not weak in the way the gate means. No design:crossover field exists on Ledger['gates'].",
    "major: prompts/research_audit.md (v0.2 change 5) vs app/design-lab/ab/ledger.ts:10-17 - subgroup_hypothesis_only has no field on Ledger and no term in score(), so v0.2's interaction-test safeguard is silently dropped at the scoring boundary. Every strongest effectPoints-3 candidate is a subgroup: vitamin A/measles mortality <2y two-dose (RR 0.18, 95% CI 0.03-0.61), vitamin C extreme-exercise (RR 0.48, 95% CI 0.35-0.64), zinc malnourished (MD -26.39h, 95% CI -36.54 to -16.23), cranberry 2 of 6 population strata.",
    "major: app/design-lab/ab/ledger.ts:97,101-103 - the 0.10 unknown-axis price is too weak for a product-level score. E=3 with formFit and doseFit both 'unknown' yields applicability 0.100 and still renders 55 'Probably works' (probe P9). A real form mismatch (lozenge evidence applied to a swallowed capsule) only moves 69 -> 59, still in a positive band (output Q1).",
    "major: app/design-lab/ab/ledger.ts:81,115 - bandLabel is a pure function of the headline, so E=1 with a clean checklist and perfect fit renders 67 'Works' while effectWord on the same card reads 'Small benefit' (probe P7). Melatonin's verified 7.06 min (95% CI 4.37-9.75) sleep-latency effect renders 57 'Probably works'.",
    "major: calibration inversion (evidence, not code) - vitamin A vs all-cause child mortality (RR 0.88, 95% CI 0.83-0.93, high certainty, 1,202,382 children, CD008524.pub4) computes 63 'Probably works', while zinc shaving 26.4 hours off a diarrhoea episode computes 83 'Works' and caffeine improving a time trial (SMD -0.52) computes 67 'Works'. Cause: E is a magnitude grade that certainty can only shrink, and the gate caps punish the designs that settle questions.",
    "minor: app/design-lab/ab/ledger.ts:88,105,146 - bodyIsRct and gates.rctCount can contradict each other with no assertion; bodyIsRct=false with rctCount=5 yields certainty 2 and a headline of 75 'Works' (probe P13). ledgerFromAudit() copies both straight from model JSON. This is the exact shape the iodine claim would take (observational IPD cohort meta-analysis PMID 30920622 for IQ, RCTs for thyroid outcomes).",
    "minor: app/design-lab/ab/ledger.ts:92 - the single-RCT cap is confirmed to bite large benefits, not only nulls as already recorded for VITAL-DEP. E=3 from one n=18,353 trial -> certainty 1 -> 63 (probe P10). Real instances: PIVENS (n=247, 96 wk, 43% vs 19%, NNT 4.2) and Cochrane CD003094.pub3 oral iron treatment (RR 0.38, 95% CI 0.26-0.55, one trial, 125 women), both 63 'Probably works'."
  ],
  "manualNotes": "Direct answers to the three questions asked. (1) Systematic pattern: a legitimate 3 needs all three of - replacement of a molecule the body cannot make, a population defined by deficiency or high baseline risk so a 2-fold ratio is also a large absolute effect, and an outcome that IS the deficiency syndrome rather than a distal composite. Proof from a single Cochrane review: vitamin A gives night blindness RR 0.32 (E=3, headline 88) and all-cause mortality RR 0.88 (E=1, headline 63) in the same children with the same intervention. Not one enhancement-in-healthy-people claim reached 3 anywhere in the live literature I searched; the ceiling for enhancement appears to be effectPoints 2 (caffeine SMD 0.52, red yeast rice 13%, nicotinamide 23%, melatonin 7 min), and the only two routes to a 3 in a healthy person are artefacts - a surrogate endpoint or a single small trial. (2) Consumer implication: the score belongs to a person, not a bottle. Same vitamin C bottle at the same dose computes 100 for a marathon runner and 50 for a desk worker; cranberry has six populations and five different answers (RR 0.46 to 1.06); folic acid is a 3 for women with a prior NTD pregnancy and formally 'unclear' (RR 0.07, 95% CI 0.00-1.32) for the general population every 400 mcg product is sold to. Recommend a deficiency/risk triage question before any number is shown, and gating the word 'Works' on E >= 2. The Overall tab as specified averages across exactly the axis that carries all the signal - cranberry is a far worse case than the vitamin D one already recorded on 2026-09-11. (3) Rubric expressiveness: category (b) drug-like effects is handled well and the form/dose axes do real work (zinc lozenge vs swallowed capsule, 69 -> 59); category (c) large effect in a defined group is expressible in principle but unreliable because the group is almost always a subgroup and the subgroup safeguard has no field; category (a) frank deficiency disease is the big gap - expressible only where a placebo RCT happens to exist, and structurally unscoreable for the classic cures. A large effect on a surrogate is not merely mishandled but actively misleading (88 'Works'), and a rare disease with no RCT is silently equated with never-studied. Per CLAUDE.md invariant 4 I proposed no constant changes and made no edits; every numeric remedy implied above (surrogate headline cap, unknown-fit price, E>=2 gate on 'Works', large-precise-RCT floor, -1/-2 harm grades) is a founder call for docs/REVIEW_PENDING.md. No Grok/xAI tooling was used at any point."
}
```
