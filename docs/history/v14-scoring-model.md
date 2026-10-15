# The v14 scoring model (retired 2026-10-15)

`SCORING_MODEL = "v14-applicability-discount"` scored every BS-PROOF run from
2026-09-04 until the founder committed to evidence method v2
(`docs/EVIDENCE_METHOD.md`) on 2026-10-15. This file keeps what v14 was, how it
was built and what it taught, so a v2 result can be compared against it later.

**The code is not gone, only out of the tree.** The last commit with v14 intact
is `967f997` (local tag `v14-final`):

```bash
git show v14-final:pipeline/scoring.py          # read one file
git worktree add ../bsproof-v14 v14-final       # a full working copy
```

The live site still served the v14 creatine run `20260904_185830` at the time of
retirement; the app's TypeScript ports (`lib/analyze/{scoring,vocab,product-score}.ts`)
still mirror v14 until the app is moved to v2.

Longer reasoning lives in `docs/SPEC.md` (as of `v14-final`, the v14 method
spec, §7–§10 and §13), `docs/history/spec-changelog.md` and
`docs/history/project-log.md`.

---

## 1. The idea

Every competitor scores an *ingredient*. BS-PROOF scores an **ECU**:
`(ingredient, form, dose_band, outcome, population)`, and discounts evidence
that does not match the product in hand. v14 turned each study into a signed
"vote" on whether the ingredient meaningfully helps one outcome, averaged the
votes with quality weights, scaled by how much evidence there was, and then
showed *separately* how well that evidence applied to the product's form and
dose.

## 2. The formula

```
per study i:   w_i = design × RoB × size × funding × OA       (quality weight)
               s_i ∈ [−1, +1]                                  (signed verdict)

d = Σ w_i s_i / Σ w_i                    direction (weighted mean vote)
c = 1 − e^(−E′/k)                        confidence, E′ = evidence mass (Σw, SR-boosted)
H = weighted var(s_i)                    heterogeneity
signed    (−100…+100) = 100 × d × c × (1 − 0.4 · H/1.5)
A         (0…1)       = mean(form strength, dose closeness)
composite (0…100)     = 50 + signed/2 × (A if signed > 0 else 1)
```

- **`s_i` from effect size, recentred on the meaningful threshold:**
  `s = clamp((effect − 0.20) / (0.80 − 0.20), −1, +1)` in SMD units
  (2 % / 8 % for percent changes). A measured zero gives s ≈ −0.33, so "we
  looked and found nothing" counts *against*. Used only when S5 named the
  favoured arm. Otherwise s came from the direction label via `S_VALUE`.
- **Applicability discounts benefit only.** A null or a harm was never softened
  because the evidence was in another form.
- **Form, dose and population were NOT in the weight** (founder 2026-08-07).
  Two products that differ only in form or dose share the centre number, and the
  arcs carry the difference. That is why the number could never be shown without
  its arcs (invariant 8).
- **Population policy "variant B":** studies with `pop_match == "different"`
  were excluded and stored. "Variant A" (everything counts) was printed beside
  it, never blended.
- **Sufficiency gate:** an ECU with less than 0.5 human design weight read
  "gated / not enough human evidence".

### The four arcs

| Arc | Verdict | Coverage |
|---|---|---|
| effect | `d` | share of evidence with a usable direction |
| form | pooled verdict of trials in this form; the score input was form *strength* on a ladder (`FORM_LADDER`, top 3) | share of studies whose form was known |
| dose | verdict of trials near the product dose; the score input was *closeness* to the dose range where benefit was found (`pipeline/dose.py`: flat inside, linear ramps outside, 0.10 when the dose was missing) | share of trials with a usable dose |
| evidence | `c` (a quantity, not a direction) | — |

`0.00 @ 0 %` ("untested") and `−0.70 @ 100 %` ("tested and failed") were
required never to look alike. Display labels came from the signed bands mapped
arithmetically onto 0–100 (65 / 55 / 45 / 30 ⇒ "works" / "probably works" /
"unclear" / "probably does not work" / "evidence against").

## 3. Constants at retirement (all founder-owned, none externally calibrated)

| Constant | Value |
|---|---|
| `DESIGN_W` (design rank → weight) | 4:1.00, 5:0.55, 6:0.30, 7:0.18, 8:0.12, 9:0.07, 10:0.03, 11:0.015, 12:0.004, 13:0.0015, 14:0 |
| `ROB_FACTOR` | low 1.00, some_concerns 0.60, high 0.25 |
| RoB thresholds | low ≥ 80 % of known items clean with ≥ 2 known; some ≥ 50 % |
| `FUNDING_FACTOR` | independent 1.00, industry_other 0.90, undisclosed 0.80, brand_funded 0.60 |
| `OA_FACTOR` | full_text 1.00, sr_table 0.85, abstract_only 0.55 |
| `FORM_FACTOR` (arc only) | exact 1.00, salt_family 0.50, different 0.15, unspecified 0.30 |
| `DOSE_FACTOR` (arc only) | in_band 1.00, low_50_99 0.45, below_50 0.10, above_200 0.60 |
| `POP_FACTOR` (off) | exact 1.00, adjacent 0.70, different 0.35 |
| `S_VALUE` | benefit_meaningful 1.0, benefit_trivial 0.3, null_effect −0.35, harm −1.0 |
| `EFFECT_MID_SMD` / `EFFECT_FULL_SMD` | 0.20 / 0.80 (percent: 2.0 / 8.0) |
| `K` | 1.5 (was 3.0 until 2026-08-11) |
| `H_PENALTY` / `H_NORM` | 0.4 / 1.5 |
| `LAMBDA` (SR multiplier ceiling) | 0.3, so an SR boosts confidence by at most ×1.30 |
| `GATE_MIN_HUMAN_WD` | 0.5 |
| SR review quality `Q_REVIEW` | high 1.00, moderate 0.70, low 0.40; incomplete cap 0.40 |

## 4. Structure (as of `v14-final`)

```
run_pipeline.py → bsproof/run/{options, corpus, extract, score, evidence, report}

retrieval      pipeline/{retrieve, classify, dedup, relevance, predatory, storage, showcase}, sources/*
extraction     bsproof/{claude_adapter, grok_adapter, workers, worker_payload, worker_shadow, worker_quota}
               agents S1 design facts (table route), S2 SR synthesis, S3 study, S4 RoB,
               S5 conclusion claims, S5T table selector, S6/S6B outcome mapping, S7 form+dose, S8 funding
v14 scoring    pipeline/assemble.py   worker JSON → Study objects → ECU rows; eligibility firewall
               pipeline/effect_s.py   reported effect → s
               pipeline/scoring.py    weights, s, d / c / H, signed, composite, SCORING_MODEL history
               pipeline/arcs.py       four arcs, form ladder, labels
               pipeline/dose.py       benefit dose bands and closeness
               pipeline/donut.py      text rendering of the four arcs
               pipeline/synthesis.py + synthesis_bridge.py   SR resolution, q_s, SR-table-derived trials
               pipeline/effect_harvest.py   deterministic table candidates for S5T
               pipeline/calibration.py      35-anchor harness (docs/anchors.csv, docs/ANCHORS.md)
               pipeline/preview.py          projection for capped (--limit) runs
               pipeline/product_score.py    product lookup behind the app / scripts/analyze_label.py
reports        scripts/{auto_report_push, dashboard_artifact, rescore_run, archive_reports}.py
app ports      lib/analyze/{scoring, vocab, product-score}.ts pinned to Python by
               scripts/golden_parity.py → tests/analyze-parity.test.ts
```

Features that existed only for v14:

- **SR-table route** (`--with-sr`, S2): systematic reviews added no mass
  themselves (dedup by canonical id, max review `cov` ≤ 1.30). Trials read out
  of their tables counted once at the `sr_table` tier (0.72 of a directly read
  trial) after five refusals (no direction, unclear, no design, already in
  corpus, reviews disagree).
- **Table route** (S1 + S5T + `effect_harvest.py`): deterministic table
  candidates for arm-level numbers. Off by default from v1.36, after measuring
  that S5N supplied all 277 of 277 v2 numbers.
- **Population A/B and K A/B**, printed on every run, never blended.
- **Grok backend** (`grok_adapter.py`, separate cache, never merged with
  Claude). Unused by 2026-10.
- **Dashboard artifact** `DashboardRunV1` (`schemas/dashboard_run_v1.schema.json`)
  built from the full ECU rows for `/runs`.

## 5. What v14 got right (and v2 keeps)

- The ECU as the unit, and judging the *product*, not the ingredient.
- Strict refusals: no ingredient-free arm, combination arms, all arms dosed.
  Unknown means KEEP, and nothing is inferred from the numbers (invariant 7).
- Effect sizes over vote counting, and the meaningful threshold as the reference
  point rather than zero.
- The score always travelling with its coverage.
- The model only extracts. Every number is deterministic code.

## 6. Why it was replaced (measured)

| Problem | Evidence |
|---|---|
| Not a meta-analysis | Clamped −1…+1 votes averaged under hand-set multipliers; no pooled estimate, no CI |
| Most studies still voted by label | Only ~10–16 % of mapped claims reached the effect-size path |
| Confidence ignored precision | `c` grew with the *amount* of evidence; `K` was never calibrated. At K = 3.0 the ECU split 143 studies into cells of 4–17 while c = 0.8 needed ~51 per cell |
| Failed face validity | Published meta-analyses put creatine → strength at SMD 0.28–0.46 (CIs exclude 0). v14 scored it **51 "unclear"** (signed +3, n = 12) |
| Unstable extraction | Re-wording one prompt field moved a score 15 points |
| Composite history | v13's `100 × c × mean(effect, form, dose)` made applicability a peer of direction: d = +0.04 read 38, while d = 0.00 with full form and dose read 77. v14 fixed the display, not the underlying number |

## 7. Last v14 result (creatine monohydrate, run `20260904_185830`, prompt v1.26)

156 studies targeted, 155 usable, 54 SR extractions (47 resolved).

| Outcome | 0–100 | Verdict | effect | form | dose | evidence | n |
|---|---:|---|---|---|---|---|---:|
| exercise_endurance | 60 | probably works | +0.73 @ 100 % | 0.80 | +0.47 @ 51 % | 36 % | 3 |
| muscle_power | 54 | unclear | +0.24 @ 100 % | 0.80 | +0.37 @ 22 % | 69 % | 12 |
| muscle_strength | 51 | unclear | +0.04 @ 100 % | 0.80 | +0.00 @ 47 % | 82 % | 12 |
| lean_body_mass | 51 | unclear | +0.09 @ 100 % | 0.80 | +0.00 @ 11 % | 64 % | 6 |
| energy_levels | gated | not enough human evidence | — | — | — | — | 0 |

Compare v2 on the same ingredient (run `20261013_072633`): strength k = 9,
SMD +0.31 [+0.06, +0.55], **C+**.

## 8. Ideas from v14 worth carrying into v2

- **SR forest plots as a data source.** v14's S2 read systematic reviews only
  for direction. The binding limit for v2 is that 295 of 386 creatine RCTs are
  abstract-only, and a review's forest plot often gives per-trial effects and
  variances that v2 could pool directly (deduplicated against trials already
  read).
- **Funding as a sensitivity analysis.** S8 still extracts funding. v14 used it
  as a weight; v2's method (§3 stage 5) plans "independently funded only" as a
  sensitivity check.
- **The anchors** (`docs/anchors.csv`, 35 face-validity cases) were written
  against v14 bands. They need re-expressing as v2 letters before reuse.
- **The experiments** under `scripts/experiments/` (as of `v14-final`) document
  how each v14 constant was chosen: vote counting vs effect size, the null
  penalty sweep, the form ladder width, S7 body mass. `extraction_stability.py`
  (same corpus extracted twice) applies to v2 unchanged.
