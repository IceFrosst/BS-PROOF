# v1 Calibration Anchor Set

**35 anchors** (`anchors.csv`; this document said 28 until 2026-08-06 — the
CSV is authoritative and `pipeline/calibration.py` validates it). Top-tier evidence only — every entry is backed by large RCTs,
Cochrane reviews, or policy-level consensus. No contested-frontier science.

**Purpose:** these are not a gold standard for *magnitude*. They are a face-validity
harness: if the pipeline puts any of these on the wrong side of zero, or fires the
sufficiency gate on a well-studied ECU, it is broken and you know it without needing
a scientist.

**What this set cannot do:** calibrate `k` or the transfer factor constants. Those
need Tier-3 expert ratings. This set validates *sign and band*, not precision.

---

## Why 28 and not 10

The set must cover the score range *and* stress the mechanisms that are unique to
this system. Minimum viable coverage:

| Requirement | Anchors |
|---|---|
| Each of the 7 score bands, ≥2 anchors | 14 |
| Sufficiency gate fires correctly | 2 |
| Form sensitivity (transfer) | 3 |
| Dose sensitivity (transfer) | 2 |
| Population flip (transfer) | 4 |
| Dedup stress (overlapping SR literature) | 2 |
| Funding-penalty stress | 1 |

Ten anchors would test the score range and none of the mechanisms — which is to say,
none of the things that make this product different from a lookup table.

---

## FIRST RESULT — anchor #1 FAILS, 2026-08-10

Run against the 80-study creatine corpus
(`reports/runs/20260809_233120_creatine_creatine-monohydrate_claude-top5-per-o`),
Claude production backend, `PROMPT_VERSION` v1.9:

| anchor | expected | measured | verdict |
|---|---|---|---|
| #1 creatine / monohydrate / 3–5 g/d / muscle strength+power / healthy trained adults | **+80 … +95** (conf A) | muscle_strength **−6**, muscle_power **−17** | **SIGN ERROR** |

`pipeline.calibration.evaluate({"1": -6})` returns `face_valid: false` with a
`sign_errors` entry. That class is documented in `calibration.py` as *FATAL —
the system is broken*, and this is exactly the job this set exists to do: put a
result on the wrong side of zero and say so without needing a scientist.

**Reproduce:**

```python
from pipeline import calibration as cal
cal.evaluate({"1": -6})     # -> face_valid: False, sign_errors: [...]
```

**What is NOT the cause** (each measured, not assumed):

- *Claim double-counting* — fixed 2026-08-10 (`_one_study_one_vote`). On this
  corpus it collapsed 31 duplicate claims; the score moved, the sign did not.
- *The collapse overruling primary endpoints* — fixed the same day. It had
  contradicted the trial's own primary in 31 of 87 extractions, 28 of them
  benefit→null. Fixing it moved muscle_strength −14 → −6. Still negative.
- *Population contamination* — the A/B (disease trials excluded) moves every
  outcome by ≤1 point.

**The leading remaining hypothesis:** S5 extracts **73–80% `null_effect` claims**
(measured, three reps per effort level). Invariant 7 prices a null at −0.7, so a
null-dominated claim set drives `d` negative regardless of what the trials
found. Whether that reflects the literature (creatine trials genuinely carry
many null secondary endpoints) or an over-null-calling extractor is the open
question, and it is the next thing to measure.

Until anchor #1 passes, **no score from this pipeline should be published.**

---

## Confidence key

- **A** — policy-level consensus, large RCTs, Cochrane. Sign is not seriously disputed.
- **B** — multiple meta-analyses agree on direction; magnitude debated.
- **C** — direction is the majority view but a competent skeptic could argue. Wider tolerance.

Anything below C was excluded.

---

## Band 1 — Strong positive (+70 … +100)

| # | Ingredient | Form | Dose | Outcome | Population | Expected | Conf |
|---|---|---|---|---|---|---|---|
| 1 | Creatine | monohydrate | 3–5 g/d | muscle strength / power output | healthy trained adults | +80 … +95 | A |
| 2 | Folic acid | folic acid | 400 µg/d preconception | neural tube defect prevention | pregnant / preconception | +85 … +100 | A |
| 3 | Vitamin D | D3 (cholecalciferol) | 800–2000 IU/d | serum 25(OH)D increase | deficient adults | +85 … +100 | A |
| 4 | Iron | ferrous sulfate | 60–120 mg elemental | haemoglobin increase | iron-deficiency anaemia | +85 … +100 | A |
| 5 | Caffeine | anhydrous | 3–6 mg/kg | endurance performance | healthy adults | +75 … +95 | A |

**Note on 3 and 4:** biomarker outcomes, deliberately included. They should be the
easiest possible cases. If the pipeline can't get "vitamin D raises vitamin D levels"
right, stop and debug before looking at anything else.

---

## Band 2 — Moderate positive (+30 … +69)

| # | Ingredient | Form | Dose | Outcome | Population | Expected | Conf |
|---|---|---|---|---|---|---|---|
| 6 | Omega-3 | EPA/DHA ethyl ester | ~4 g/d | triglyceride reduction | hypertriglyceridaemic adults | +60 … +85 | A |
| 7 | Melatonin | melatonin | 0.5–5 mg | sleep onset latency | adults with insomnia | +35 … +60 | B |
| 8 | Probiotics | *S. boulardii* / *L. rhamnosus* GG | strain-specific | antibiotic-associated diarrhoea prevention | adults on antibiotics | +40 … +65 | B |
| 9 | Zinc | acetate or gluconate lozenge | ≥75 mg/d, within 24 h of onset | common cold **duration** | healthy adults | +25 … +55 | C |

**Note on 9:** wide tolerance deliberately. Meta-analyses agree on direction but
disagree substantially on effect size, and formulation matters (acetate vs gluconate,
and lozenges with citric acid chelate the zinc and lose the effect). This is also a
form-sensitivity probe — see #22.

---

## Band 3 — Weak positive (+10 … +29)

| # | Ingredient | Form | Dose | Outcome | Population | Expected | Conf |
|---|---|---|---|---|---|---|---|
| 10 | Magnesium | glycinate / citrate | 200–400 mg elemental | sleep quality | general adults | +5 … +30 | C |
| 11 | Ashwagandha | KSM-66 root extract | 300–600 mg/d | perceived stress | chronically stressed adults | +10 … +35 | C |

**Note on 11:** this is the **funding-penalty stress test**. The positive literature
is heavily industry-funded and small-n. If the funding factor and RoB proxy are
working, this should land noticeably lower than its raw meta-analytic effect size
would suggest. If it comes out at +60, the funding penalty isn't firing.

---

## Band 4 — Inconclusive (−9 … +9)

| # | Ingredient | Form | Dose | Outcome | Population | Expected | Conf |
|---|---|---|---|---|---|---|---|
| 12 | Glucosamine | sulfate or HCl | 1500 mg/d | knee osteoarthritis pain | adults with knee OA | −25 … +10 | B |
| 13 | Collagen | hydrolysed peptides | 2.5–10 g/d | skin elasticity | adult women | −10 … +25 | C |

**Note on 12:** large independent trials (GAIT) were null; several industry-linked
meta-analyses positive. A well-functioning pipeline should land this near zero or
mildly negative. If it lands strongly positive, the funding and RoB layers are not
doing their job.

---

## Band 5 — Weak to moderate negative (−10 … −69)

| # | Ingredient | Form | Dose | Outcome | Population | Expected | Conf |
|---|---|---|---|---|---|---|---|
| 14 | Vitamin D | D3 | 2000 IU/d | fracture prevention | community-dwelling **replete** adults | −40 … −70 | A |
| 15 | Omega-3 | EPA/DHA | ~1 g/d | major cardiovascular event prevention | general adults | −30 … −60 | A |
| 16 | Multivitamin | multi | standard RDA blend | all-cause mortality reduction | well-nourished general adults | −45 … −75 | A |

**Note on 15:** deliberately paired with #6. Same ingredient, same form, *different
outcome and dose* — strongly positive for triglycerides, negative for cardiovascular
events. If both come out the same sign, the ECU decomposition is not working.

---

## Band 6 — Strong negative (−70 … −100)

| # | Ingredient | Form | Dose | Outcome | Population | Expected | Conf |
|---|---|---|---|---|---|---|---|
| 17 | Vitamin C | ascorbic acid | ≥200 mg/d ongoing | common cold **incidence** (prevention) | general adults | −70 … −95 | A |
| 18 | Ginkgo biloba | EGb 761 extract | 120–240 mg/d | dementia / cognitive decline prevention | older adults | −70 … −95 | A |
| 19 | Vitamin E | alpha-tocopherol | ≥400 IU/d | cardiovascular event prevention | general adults | −70 … −95 | A |
| 20 | Selenium | selenomethionine | 200 µg/d | prostate cancer prevention | healthy men | −70 … −95 | A |

**Note on 17:** paired with the cold-*duration* literature, which is weakly positive.
Prevention vs. duration is the same ingredient with opposite verdicts. Another
outcome-decomposition test.

---

## Band 7 — Harm (−80 … −100, with harm flag)

| # | Ingredient | Form | Dose | Outcome | Population | Expected | Conf |
|---|---|---|---|---|---|---|---|
| 21 | Beta-carotene | synthetic beta-carotene | 20–30 mg/d | lung cancer prevention | **smokers** | −85 … −100 + harm flag | A |

The CARET and ATBC trials found *increased* lung cancer incidence. This is the only
anchor where `s_i = −1.0` (harm) rather than −0.7 (null) should dominate. If the
pipeline cannot distinguish "doesn't work" from "actively harmful," the harm tier
is not wired up.

---

## Mechanism test A — Form sensitivity (transfer factor)

| # | Comparison | Expected relationship | Conf |
|---|---|---|---|
| 22 | Vitamin D2 (ergocalciferol) vs D3 (cholecalciferol), raising 25(OH)D | D3 **clearly higher** than D2 | A |
| 23 | Magnesium oxide vs glycinate/citrate, any absorption-dependent outcome | oxide **substantially lower** (bioavailability ~4%) | A |
| 24 | Curcumin plain vs piperine-enhanced or phytosome, any systemic outcome | plain **substantially lower** | B |

These are the cleanest available tests of the moat. If #22 and #23 come out equal,
the form factor is not being applied and the product's core differentiator is dead.

**These relationships are now MACHINE-READABLE** (`pair_id` + `pair_expect` in
`docs/anchors.csv`, scored by `calibration.evaluate_pairs`). Until 2026-08-11 they
existed only as this prose and all 14 pair rows were silently `skipped`, so the
tests this section calls the cleanest available had never once run. An inverted pair
is now graded FATAL, the same class as a sign error — it means the transfer model is
backwards, not imprecise. Edit the prose and the CSV together.

---

## Mechanism test B — Dose sensitivity

| # | Comparison | Expected relationship | Conf |
|---|---|---|---|
| 25 | Omega-3 ~1 g vs ~4 g for triglyceride reduction | 4 g **clearly higher** | A |
| 26 | Creatine 3 g/d maintenance vs 20 g/d loading, strength | **roughly equal** (loading only accelerates onset) | A |

**#26 is a false-positive check.** Higher dose should not automatically score higher.
If it does, your dose factor is a monotone function rather than a band-match function,
which would penalise correctly-dosed products.

---

## Mechanism test C — Population flip

| # | Ingredient / outcome | Deficient / at-risk | Replete / general | Conf |
|---|---|---|---|---|
| 27 | Vitamin D, fracture prevention | institutionalised elderly, deficient → **positive** | community-dwelling replete → **negative** (= #14) | A |
| 28 | Iron, fatigue reduction | iron-deficient (± anaemia) → **positive** | iron-replete → **negative / null** | A |

These two anchors justify the entire population axis. They are the demonstration
that the "+12 general adults / +71 if deficient" hook is real and not marketing.

---

## Mechanism test D — Deduplication stress

Not separate anchors — instrumentation on existing ones.

| Anchor | Why it stresses dedup |
|---|---|
| #15 Omega-3 / cardiovascular | Dozens of overlapping meta-analyses re-analysing largely the same mega-trials (VITAL, ASCEND, REDUCE-IT, STRENGTH). If evidence mass scales with document count, this explodes. |
| #14 / #27 Vitamin D | Enormous overlapping SR literature over a shared trial pool. |

**Pass criterion:** for each, log `|P|` (unique primaries) and `|S|` (syntheses).
If `|S| > |P|`, dedup is working and the ratio is exactly the trap being avoided.
If evidence mass tracks `|S|`, it is not.

---

## How to run this

1. Freeze the set. Version it.
2. Run the full pipeline on all 28. Record: score, band, `d`, `c`, `H`, `|P|`, `|S|`,
   gate fired y/n.
3. **Score by band membership, not by numeric distance.** Getting +52 when the
   expected band was +35…+60 is a pass. Getting the sign wrong is a hard failure.
4. **Report per-component error.** If magnesium oxide and glycinate come out equal,
   the failure is in the form factor — not in "the score." Aggregate accuracy hides
   exactly the failures that matter here.
5. Hard-fail conditions, any one of which blocks release:
   - any Band 1 or Band 6 anchor on the wrong side of zero
   - #21 not flagged as harm
   - #22 or #23 showing no form differential
   - gate firing on any anchor in Bands 1–2

---

## Known weaknesses of this set

- **Class imbalance toward negatives.** Bands 5–7 have 8 anchors, Bands 1–2 have 9.
  Real-world supplement claims skew far more negative than this. The set is not a
  sample of the market; it's a probe of the score range. Don't use it to estimate
  base rates.
- **Nothing tests the "insufficient evidence" gate at the top of the range.** Add
  2 obscure ingredients with animal-only literature once you've picked which
  ingredients v1 covers — the gate needs to fire on something.
- **Confidence-C anchors (9, 10, 11, 13, 24) have wide tolerance bands** and should
  not be used to tune constants, only to check sign.
- **Every band boundary here was set by judgment, not measurement.** The tolerance
  ranges are my estimate of where consensus sits, not a derived quantity. Have the
  scientist review the expected bands before you trust a failure — a "failure" may
  be a wrong anchor.
