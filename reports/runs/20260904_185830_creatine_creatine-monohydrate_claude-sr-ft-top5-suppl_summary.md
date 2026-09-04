# BS-PROOF summary report (claude-sr-ft-top5-suppl)

Generated: **2026-09-04 18:58 UTC**


scoring_model: v14-applicability-discount

Ingredient: `creatine` · Form: `creatine_monohydrate` · Mode: **claude-sr-ft-top5-suppl**

Auto-written after every extraction (no extra steps).

Full audit: matching `*_full.md` in `reports/runs/`.

## This run — extraction stats

- Targeted studies: **156**
- Succeeded (usable): **155**
- Skipped (no text): **1**
- Partial agent failures: **0**
- Prompt version: `v1.26`
- Concurrency: 8  |  studies in flight: 8


## Predatory journal check (flag only — not in score)

- List entries loaded: **1162**
- Studies checked: **2632**
- Publisher resolved for: **632/2632** (the list is PUBLISHERS, so this is the real coverage)
- Studies flagged predatory: **5**
- Distinct publishers flagged: **2**
- Distinct journals flagged: **0**
- Affects score: **NO (count only)**
  - [publisher] Baishideng Publishing Group Inc.
  - [publisher] Frontiers Media SA

## Systematic reviews / meta-analyses (S2)

- Requested (cap): **60**
- S2 extractions ok: **54**
- Resolved for multiplier: **47**
_SRs never add patients; only a capped confidence boost (≤ +30%)._

## ECU scores — this run only

| Outcome | 0–100 | Verdict | effect | in your form | at your dose | evidence | n |
|---|---:|---|---|---|---|---|---:|
| exercise_endurance | 60 | probably works | +0.73 @ 100% | 0.80 (pooled +0.70 @ 92%) | +0.47 @ 51% | 36% | 3 |
| muscle_power | 54 | unclear | +0.24 @ 100% | 0.80 (pooled +0.08 @ 73%) | +0.37 @ 22% | 69% | 12 |
| muscle_strength | 51 | unclear | +0.04 @ 100% | 0.80 (pooled +0.02 @ 87%) | +0.00 @ 47% | 82% | 12 |
| lean_body_mass | 51 | unclear | +0.09 @ 100% | 0.80 (pooled +0.07 @ 93%) | +0.00 @ 11% | 64% | 6 |
| energy_levels | gated | not enough human evidence | not tested | not tested | not tested | not tested | 0 |

_0–100 = 50 + signed/2, with a positive signal discounted by applicability A = mean(form strength, dose closeness); a negative signal is never softened. 50 means the evidence points nowhere. Each arc shows its verdict and the share of evidence behind it; a number near 50 with a FULL evidence arc means 'no effect found', with an EMPTY one it means 'barely studied'._


_Old rows from previous runs are not shown here._

## Which studies made each number

### exercise_endurance — signed +25

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:103390nu12010193` | +22.08 | 0.4341 | 1.0 | 4 | exact |
| `doi:101113ep087886` | +2.91 | 0.0573 | 1.0 | 4 | unspecified |
| `doi:103390nu15245134` | +0.00 | 0.1846 | 0.0 | 4 | exact |
| **sum of all 3** | **+24.99** | | | | |

### muscle_power — signed +16

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:103390nu12102961` | +6.09 | 0.1626 | 1.0 | 4 | unspecified |
| `doi:101186s12970021004077` | +6.00 | 0.1602 | 1.0 | 4 | unspecified |
| `doi:101123ijsnem20140146` | +3.14 | 0.126 | 0.6666666666666665 | 4 | exact |
| `doi:101007s004210031031z` | +0.76 | 0.0677 | 0.3 | 4 | exact |
| `doi:1010801550278320242340574` | +0.00 | 0.1021 | 0.0 | 4 | exact |
| `doi:103390nu16091324` | +0.00 | 0.3473 | 0.0 | 4 | exact |
| `doi:1010801550278320232193556` | +0.00 | 0.12 | 0.0 | 4 | exact |
| `doi:103390nu15163567` | +0.00 | 0.1287 | 0.0 | 4 | exact |
| `doi:1010801550278320222108683` | +0.00 | 0.1035 | 0.0 | 4 | exact |
| `doi:103390nu14061140` | +0.00 | 0.1355 | 0.0 | 4 | exact |
| `doi:101186s1297001701622` | +0.00 | 0.1626 | 0.0 | 4 | exact |
| `doi:101136bjsm2005022558` | +0.00 | 0.1556 | 0.0 | 4 | unspecified |
| **sum of all 12** | **+15.99** | | | | |

### muscle_strength — signed +3

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:103390nu10111640` | +1.60 | 0.05 | 1.0 | 4 | unspecified |
| `doi:1033549physiolres935323` | +1.53 | 0.1602 | 0.3 | 4 | exact |
| `doi:103390nu16162772` | +0.00 | 0.1048 | 0.0 | 4 | exact |
| `doi:1010801550278320232193556` | +0.00 | 0.12 | 0.0 | 4 | exact |
| `doi:101249mss0000000000003202` | +0.00 | 0.6 | 0.0 | 4 | exact |
| `doi:103390nu13030826` | +0.00 | 0.1875 | 0.0 | 4 | unspecified |
| `doi:103390nu9111169` | +0.00 | 0.05 | 0.0 | 4 | unspecified |
| `doi:103390nu8030143` | +0.00 | 0.05 | 0.0 | 4 | unspecified |
| `doi:101519jsc0000000000001223` | +0.00 | 0.1732 | 0.0 | 4 | exact |
| `registry:nct01164020` | +0.00 | 0.6993 | 0.0 | 4 | exact |
| `doi:101007s1260300901248` | +0.00 | 0.2922 | 0.0 | 4 | exact |
| `doi:101007s004210031031z` | +0.00 | 0.0677 | 0.0 | 4 | exact |
| **sum of all 12** | **+3.13** | | | | |

### lean_body_mass — signed +6

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:1033549physiolres935323` | +2.07 | 0.1602 | 0.3 | 4 | exact |
| `doi:1010801550278320232193556` | +1.53 | 0.12 | 0.2962962962962962 | 4 | exact |
| `registry:nct01472393` | +1.27 | 0.0978 | 0.3 | 4 | unspecified |
| `doi:101007s004210031031z` | +0.88 | 0.0677 | 0.3 | 4 | exact |
| `doi:101249mss0000000000003202` | +0.00 | 0.6 | 0.0 | 4 | exact |
| `doi:103390nu12010193` | +0.00 | 0.4341 | 0.0 | 4 | exact |
| **sum of all 6** | **+5.75** | | | | |

_`points` sum to the signed score. NEGATIVE points mean that study pushed the score down. `w` is quality (design × RoB × size × funding × OA); `s` is what it found (+1.0 meaningful benefit, +0.3 trivial/unsized, −0.7 null, −1.0 harm). The two are separate on purpose: how good a study is and what it found are different facts._

## Database snapshot (`creatine`)

### `pilot_creatine_supp.sqlite`

Studies stored (corpus): **455** · ECUs: **0** · syntheses: **69
