# BS-PROOF summary report (claude-top5-per_o)

Generated: **2026-08-12 07:28 UTC**


scoring_model: v8-effect-size

Ingredient: `creatine` · Form: `creatine_monohydrate` · Mode: **claude-top5-per_o**

Auto-written after every extraction (no extra steps).

Full audit: matching `*_full.md` in `reports/runs/`.

## This run — extraction stats

- Targeted studies: **150**
- Succeeded (usable): **149**
- Skipped (no text): **1**
- Partial agent failures: **12**
- Prompt version: `v1.18`
- Concurrency: 40  |  studies in flight: 40

## Token + cost accounting

- Extraction backend: **Claude subscription** (`--safe-mode`, `--max-turns 1`, one shot per call)
- Model calls: **996** (cache hits 0, failures 128)
- Input tokens: **11,253,433** (fresh 311,649 · cache-write 1,984,424 · cache-read 8,957,360)
- Output tokens: **950,753**
- **Spent on this run: $0.00** — subscription, not metered.
- **API-equivalent cost: $38.484** — what the same work would cost billed per token.
- Per study: **6.7 calls**, **$0.2583** API-equivalent across 149 scored studies.

| Agent | Tier | Model | Calls | Cache hits | Fail | In | Out | API-equiv |
|---|---|---|--:|--:|--:|--:|--:|--:|
| S3 | B | `claude-sonnet-5` | 159 | 0 | 11 | 4,657,366 | 109,909 | $6.909 |
| S4 | B | `claude-sonnet-5` | 177 | 0 | 34 | 755,383 | 70,054 | $3.058 |
| S5 | B | `claude-sonnet-5` | 193 | 0 | 50 | 3,905,770 | 247,508 | $19.186 |
| S6B | C | `claude-sonnet-5` | 139 | 0 | 2 | 609,846 | 147,504 | $3.634 |
| S7 | B | `claude-sonnet-5` | 179 | 0 | 31 | 971,236 | 71,032 | $3.633 |
| S8 | A | `claude-haiku-4-5-20251001` | 149 | 0 | 0 | 353,832 | 304,746 | $2.064 |

Tier → model is pinned in `claude_adapter.TIER_MODEL` (full ids, never aliases: an alias floats to a new model while the cache key does not change). Tier A = classification, B = extraction, C = the highest-risk agent.

## Predatory journal check (flag only — not in score)

- List entries loaded: **1162**
- Studies checked: **1899**
- Publisher resolved for: **318/1899** (the list is PUBLISHERS, so this is the real coverage)
- Studies flagged predatory: **2**
- Distinct publishers flagged: **2**
- Distinct journals flagged: **0**
- Affects score: **NO (count only)**
  - [publisher] Baishideng Publishing Group Inc.
  - [publisher] Frontiers Media SA

## Systematic reviews / meta-analyses (S2)

- Requested (cap): **0**
- S2 extractions ok: **0**
- Resolved for multiplier: **0**
_SRs never add patients; only a capped confidence boost (≤ +30%)._

## ECU scores — this run only

| Outcome | 0–100 | Verdict | effect | in your form | at your dose | evidence | n |
|---|---:|---|---|---|---|---|---:|
| muscle_power | 43 | probably does not work | +0.11 @ 100% | 0.80 (pooled +0.22 @ 50%) | not tested | 91% | 26 |
| muscle_strength | 38 | probably does not work | -0.12 @ 100% | 0.80 (pooled -0.20 @ 57%) | not tested | 88% | 24 |
| lean_body_mass | 37 | probably does not work | +0.19 @ 100% | 0.80 (pooled +0.09 @ 80%) | not tested | 76% | 12 |
| exercise_endurance | 17 | does not work | -0.23 @ 100% | all negative (-0.34 @ 71%) | -0.23 @ 100% | 67% | 9 |
| energy_levels | 7 | does not work | -0.08 @ 100% | all negative (-0.35 @ 58%) | not tested | 43% | 3 |

_0–100 = 100 × c × mean(effect, form, dose). Each arc shows its verdict and the share of evidence behind it. A low number with a FULL evidence arc means 'does not work'; with an EMPTY one it means 'barely studied'._


_Old rows from previous runs are not shown here._

## Which studies made each number

### muscle_power — signed +9

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:103390nu17243831` | +7.97 | 0.3438 | 1.0 | 4 | exact |
| `doi:103390nu12102961` | +3.77 | 0.1626 | 1.0 | 4 | unspecified |
| `doi:101186s12970021004077` | +3.71 | 0.1602 | 1.0 | 4 | unspecified |
| `doi:101556aphysiol96200936` | +3.68 | 0.1589 | 1.0 | 4 | exact |
| `doi:101123ijsnem20140146` | +2.92 | 0.126 | 1.0 | 4 | exact |
| `doi:101519jsc0b013e3182a361a5` | -2.02 | 0.249 | -0.35 | 4 | unspecified |
| `doi:101519jsc0b013e318234eba1` | -1.44 | 0.1772 | -0.35 | 4 | exact |
| `doi:101519jsc0000000000001223` | -1.41 | 0.1732 | -0.35 | 4 | exact |
| `doi:101186s1297001701622` | -1.32 | 0.1626 | -0.35 | 4 | unspecified |
| `doi:101016jnut201303003` | +1.28 | 0.1845 | 0.3 | 4 | unspecified |
| `doi:101136bjsm2005022558` | -1.26 | 0.1556 | -0.35 | 4 | unspecified |
| `doi:103390nu16060766` | -1.19 | 0.147 | -0.35 | 4 | different |
| `doi:103390nu16091324` | -1.17 | 0.1447 | -0.35 | 4 | exact |
| `doi:103390nu14061140` | -1.10 | 0.1355 | -0.35 | 4 | unspecified |
| `doi:101111sms14629` | +1.08 | 0.1553 | 0.3 | 4 | exact |
| **sum of all 26** | **+9.24** | | | | |

### muscle_strength — signed -10

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:101249mss0000000000003202` | -5.48 | 0.6 | -0.35 | 4 | exact |
| `doi:101139apnm20140498` | +5.48 | 0.21 | 1.0 | 4 | unspecified |
| `doi:101007s1260300901248` | -2.67 | 0.2922 | -0.35 | 4 | exact |
| `doi:101519jsc0b013e3182a361a5` | -2.27 | 0.249 | -0.35 | 4 | unspecified |
| `doi:101519jsc0b013e318234eba1` | -1.62 | 0.1772 | -0.35 | 4 | exact |
| `doi:101136bjsm2005022558` | -1.42 | 0.1556 | -0.35 | 4 | unspecified |
| `doi:103390nu10111640` | +1.30 | 0.05 | 1.0 | 4 | unspecified |
| `doi:1033549physiolres935323` | +1.25 | 0.1602 | 0.3 | 4 | exact |
| `doi:101111sms14629` | +1.22 | 0.1553 | 0.3 | 4 | exact |
| `doi:1010801550278320232193556` | -1.10 | 0.12 | -0.35 | 4 | exact |
| `doi:103390nu16162772` | -0.98 | 0.1074 | -0.35 | 4 | exact |
| `doi:1011770260106020975247` | -0.79 | 0.0869 | -0.35 | 4 | unspecified |
| `doi:101007s0042101429030` | -0.76 | 0.0828 | -0.35 | 4 | unspecified |
| `doi:1010801939021120211904085` | -0.73 | 0.0796 | -0.35 | 4 | exact |
| `pmid:25781214` | -0.58 | 0.063 | -0.35 | 4 | unspecified |
| **sum of all 24** | **-10.10** | | | | |

### lean_body_mass — signed +14

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:101139apnm20140498` | +7.01 | 0.21 | 1.0 | 4 | unspecified |
| `doi:101249mss0000000000003202` | +6.01 | 0.6 | 0.3 | 4 | exact |
| `doi:1010801550278320232193556` | +4.01 | 0.12 | 1.0 | 4 | exact |
| `doi:101007s1260300901248` | -3.41 | 0.2922 | -0.35 | 4 | exact |
| `doi:101093geronaglz162` | -3.08 | 0.264 | -0.35 | 4 | exact |
| `doi:1033549physiolres935323` | +1.60 | 0.1602 | 0.3 | 4 | exact |
| `doi:101152physiolgenomics001572007` | +1.43 | 0.1425 | 0.3 | 4 | exact |
| `registry:nct01472393` | +0.98 | 0.0978 | 0.3 | 4 | unspecified |
| `doi:1010801939021120211904085` | -0.93 | 0.0796 | -0.35 | 4 | exact |
| `doi:101016jexger201608005` | +0.82 | 0.082 | 0.3 | 4 | unspecified |
| `doi:103390nu10111640` | -0.58 | 0.05 | -0.35 | 4 | unspecified |
| `doi:101123ijsnem20160129` | -0.23 | 0.0677 | -0.10000000000000002 | 4 | exact |
| **sum of all 12** | **+13.63** | | | | |

### exercise_endurance — signed -15

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:103390nu12010193` | -9.96 | 0.7236 | -0.35 | 4 | exact |
| `doi:101007s0072600603996` | -3.16 | 0.2297 | -0.35 | 4 | exact |
| `doi:101113ep087886` | +2.25 | 0.0573 | 1.0 | 4 | unspecified |
| `doi:101111sms14629` | -2.14 | 0.1553 | -0.35 | 4 | exact |
| `doi:103390nu14061140` | -1.86 | 0.1355 | -0.35 | 4 | unspecified |
| `doi:103390nu9121359` | -1.58 | 0.1149 | -0.35 | 4 | different |
| `doi:10117719417381251320095` | +1.27 | 0.1079 | 0.3 | 4 | unspecified |
| `doi:1010801746139120222159539` | +0.78 | 0.0662 | 0.3 | 4 | unspecified |
| `doi:101123ijsnem20160129` | -0.27 | 0.0677 | -0.10000000000000002 | 4 | exact |
| **sum of all 9** | **-14.67** | | | | |

### energy_levels — signed -3

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:103390nu17243831` | -5.97 | 0.3438 | -0.35 | 4 | exact |
| `doi:103390nu16060896` | +5.23 | 0.3513 | 0.3 | 4 | unspecified |
| `doi:103390nu18081192` | -2.54 | 0.1462 | -0.35 | 4 | exact |
| **sum of all 3** | **-3.28** | | | | |

_`points` sum to the signed score. NEGATIVE points mean that study pushed the score down. `w` is quality (design × RoB × size × funding × OA); `s` is what it found (+1.0 meaningful benefit, +0.3 trivial/unsized, −0.7 null, −1.0 harm). The two are separate on purpose: how good a study is and what it found are different facts._

## Database snapshot (`creatine`)

### `pilot_creatine_supp.sqlite`

Studies stored (corpus): **200** · ECUs: **0** · syntheses: **50
