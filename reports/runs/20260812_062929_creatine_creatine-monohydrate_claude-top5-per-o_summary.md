# BS-PROOF summary report (claude-top5-per_o)

Generated: **2026-08-12 06:29 UTC**


scoring_model: v8-effect-size

Ingredient: `creatine` · Form: `creatine_monohydrate` · Mode: **claude-top5-per_o**

Auto-written after every extraction (no extra steps).

Full audit: matching `*_full.md` in `reports/runs/`.

## This run — extraction stats

- Targeted studies: **150**
- Succeeded (usable): **149**
- Skipped (no text): **1**
- Partial agent failures: **5**
- Prompt version: `v1.17`
- Concurrency: 40  |  studies in flight: 40

## Token + cost accounting

- Extraction backend: **Claude subscription** (`--safe-mode`, `--max-turns 1`, one shot per call)
- Model calls: **388** (cache hits 542, failures 52)
- Input tokens: **6,142,130** (fresh 115,869 · cache-write 480,899 · cache-read 5,545,362)
- Output tokens: **311,038**
- **Spent on this run: $0.00** — subscription, not metered.
- **API-equivalent cost: $25.914** — what the same work would cost billed per token.
- Per study: **2.6 calls**, **$0.1739** API-equivalent across 149 scored studies.

| Agent | Tier | Model | Calls | Cache hits | Fail | In | Out | API-equiv |
|---|---|---|--:|--:|--:|--:|--:|--:|
| S3 | B | `claude-sonnet-5` | 61 | 94 | 8 | 2,672,226 | 35,020 | $11.675 |
| S4 | B | `claude-sonnet-5` | 67 | 96 | 14 | 234,571 | 22,012 | $0.913 |
| S5 | B | `claude-sonnet-5` | 65 | 94 | 14 | 2,451,373 | 52,353 | $9.481 |
| S6B | C | `claude-sonnet-5` | 72 | 69 | 1 | 310,439 | 57,683 | $1.600 |
| S7 | B | `claude-sonnet-5` | 70 | 93 | 15 | 339,016 | 26,772 | $1.433 |
| S8 | A | `claude-haiku-4-5-20251001` | 53 | 96 | 0 | 134,505 | 117,198 | $0.812 |

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
| muscle_power | 45 | unclear | +0.07 @ 100% | 0.80 (pooled +0.11 @ 58%) | not tested | 96% | 30 |
| muscle_strength | 38 | probably does not work | -0.12 @ 100% | 0.80 (pooled -0.22 @ 47%) | not tested | 89% | 25 |
| lean_body_mass | 37 | probably does not work | -0.01 @ 100% | 0.80 (pooled -0.18 @ 57%) | not tested | 82% | 14 |
| exercise_endurance | 26 | probably does not work | -0.29 @ 100% | 0.80 (pooled -0.30 @ 69%) | not tested | 66% | 9 |
| energy_levels | 3 | does not work | -0.03 @ 100% | all negative (-0.35 @ 50%) | not tested | 18% | 2 |

_0–100 = 100 × c × mean(effect, form, dose). Each arc shows its verdict and the share of evidence behind it. A low number with a FULL evidence arc means 'does not work'; with an EMPTY one it means 'barely studied'._


_Old rows from previous runs are not shown here._

## Which studies made each number

### muscle_power — signed +6

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:103390nu17243831` | +6.11 | 0.3438 | 1.0 | 4 | exact |
| `doi:103390nu12102961` | +2.89 | 0.1626 | 1.0 | 4 | unspecified |
| `doi:101186s12970021004077` | +2.85 | 0.1602 | 1.0 | 4 | unspecified |
| `doi:101556aphysiol96200936` | +2.83 | 0.1589 | 1.0 | 4 | exact |
| `doi:103390nu16152437` | -2.70 | 0.4341 | -0.35 | 4 | exact |
| `doi:101186s1297001701622` | -2.43 | 0.3903 | -0.35 | 4 | unspecified |
| `doi:101111sms14629` | +2.26 | 0.4234 | 0.3 | 4 | exact |
| `doi:103390nu15163567` | -1.92 | 0.3089 | -0.35 | 4 | exact |
| `doi:101038s4159802644278x` | +1.71 | 0.3201 | 0.3 | 4 | exact |
| `doi:101016jjsams201510005` | +1.68 | 0.195 | 0.4833333333333332 | 4 | unspecified |
| `doi:101123ijsnem20140146` | +1.49 | 0.126 | 0.6666666666666665 | 4 | exact |
| `doi:101519jsc0b013e318234eba1` | -1.10 | 0.1772 | -0.35 | 4 | exact |
| `doi:101519jsc0000000000001223` | -1.08 | 0.1732 | -0.35 | 4 | exact |
| `doi:101016jnut201303003` | +0.98 | 0.1845 | 0.3 | 4 | unspecified |
| `doi:101136bjsm2005022558` | -0.97 | 0.1556 | -0.35 | 4 | unspecified |
| **sum of all 30** | **+6.35** | | | | |

### muscle_strength — signed -10

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:101139apnm20140498` | +5.35 | 0.21 | 1.0 | 4 | unspecified |
| `doi:101249mss0000000000003202` | -3.21 | 0.36 | -0.35 | 4 | exact |
| `doi:101007s1260300901248` | -2.60 | 0.2922 | -0.35 | 4 | exact |
| `doi:103390nu13030826` | -1.67 | 0.1875 | -0.35 | 4 | unspecified |
| `doi:101519jsc0b013e318234eba1` | -1.58 | 0.1772 | -0.35 | 4 | exact |
| `doi:101519jsc0000000000001223` | -1.54 | 0.1732 | -0.35 | 4 | exact |
| `doi:101136bjsm2005022558` | -1.39 | 0.1556 | -0.35 | 4 | unspecified |
| `doi:103390nu10111640` | +1.27 | 0.05 | 1.0 | 4 | unspecified |
| `doi:1033549physiolres935323` | +1.22 | 0.1602 | 0.3 | 4 | exact |
| `doi:103390nu16162772` | -0.96 | 0.1074 | -0.35 | 4 | exact |
| `doi:101519jsc0b013e3182a361a5` | -0.92 | 0.1038 | -0.35 | 4 | unspecified |
| `registry:nct01472393` | -0.87 | 0.0978 | -0.35 | 4 | unspecified |
| `doi:1011770260106020975247` | -0.77 | 0.0869 | -0.35 | 4 | unspecified |
| `doi:101007s0042101429030` | -0.74 | 0.0828 | -0.35 | 4 | unspecified |
| `doi:101519jsc0b013e3181a2ed11` | +0.74 | 0.097 | 0.3 | 4 | exact |
| **sum of all 25** | **-10.22** | | | | |

### lean_body_mass — signed -1

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:1011770260106017737013` | +6.38 | 0.2156 | 1.0 | 4 | unspecified |
| `doi:101139apnm20140498` | +6.21 | 0.21 | 1.0 | 4 | unspecified |
| `doi:103390nu12010193` | -4.49 | 0.4341 | -0.35 | 4 | exact |
| `doi:101007bf02982622` | -4.03 | 0.3896 | -0.35 | 4 | unspecified |
| `doi:101007s1260300901248` | -3.03 | 0.2922 | -0.35 | 4 | exact |
| `doi:1033549physiolres935323` | +1.42 | 0.1602 | 0.3 | 4 | exact |
| `registry:nct01472393` | -1.01 | 0.0978 | -0.35 | 4 | unspecified |
| `doi:1011770260106020975247` | -0.90 | 0.0869 | -0.35 | 4 | unspecified |
| `doi:1010801939021120252518408` | -0.82 | 0.0796 | -0.35 | 4 | exact |
| `doi:1010801939021120211904085` | -0.82 | 0.0796 | -0.35 | 4 | exact |
| `doi:101016jexger201608005` | +0.73 | 0.082 | 0.3 | 4 | unspecified |
| `doi:103390nu10111640` | -0.52 | 0.05 | -0.35 | 4 | unspecified |
| `doi:101123ijsnem20160129` | -0.20 | 0.0677 | -0.10000000000000002 | 4 | exact |
| `doi:101249mss0000000000003202` | +0.00 | 0.36 | 0.0 | 4 | exact |
| **sum of all 14** | **-1.08** | | | | |

### exercise_endurance — signed -19

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:103390nu12010193` | -6.15 | 0.4341 | -0.35 | 4 | exact |
| `doi:101111sms14629` | -6.00 | 0.4234 | -0.35 | 4 | exact |
| `doi:101016jjsams201510005` | -2.76 | 0.195 | -0.35 | 4 | unspecified |
| `doi:103390nu9121359` | -1.63 | 0.1149 | -0.35 | 4 | different |
| `doi:101007s0072600603996` | -1.36 | 0.0957 | -0.35 | 4 | exact |
| `doi:103390nu14061140` | -1.28 | 0.0903 | -0.35 | 4 | unspecified |
| `doi:101123ijspp20240310` | +1.12 | 0.0925 | 0.3 | 4 | exact |
| `doi:101123ijsnem20160129` | -0.96 | 0.0677 | -0.35 | 4 | exact |
| `doi:10117719417381251320095` | +0.00 | 0.1079 | 0.0 | 4 | unspecified |
| **sum of all 9** | **-19.02** | | | | |

### energy_levels — signed +0

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:103390nu18081192` | -3.01 | 0.1462 | -0.35 | 4 | exact |
| `doi:103390nu16060896` | +2.58 | 0.1464 | 0.3 | 4 | unspecified |
| **sum of all 2** | **-0.43** | | | | |

_`points` sum to the signed score. NEGATIVE points mean that study pushed the score down. `w` is quality (design × RoB × size × funding × OA); `s` is what it found (+1.0 meaningful benefit, +0.3 trivial/unsized, −0.7 null, −1.0 harm). The two are separate on purpose: how good a study is and what it found are different facts._

## Database snapshot (`creatine`)

### `pilot_creatine_supp.sqlite`

Studies stored (corpus): **200** · ECUs: **0** · syntheses: **50
