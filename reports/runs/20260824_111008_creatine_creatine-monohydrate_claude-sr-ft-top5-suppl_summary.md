# BS-PROOF summary report (claude-sr-ft-top5-suppl)

Generated: **2026-08-24 11:10 UTC**


scoring_model: v12-dose-closeness

Ingredient: `creatine` · Form: `creatine_monohydrate` · Mode: **claude-sr-ft-top5-suppl**

Auto-written after every extraction (no extra steps).

Full audit: matching `*_full.md` in `reports/runs/`.

## This run — extraction stats

- Targeted studies: **156**
- Succeeded (usable): **155**
- Skipped (no text): **1**
- Partial agent failures: **1**
- Prompt version: `v1.22`
- Concurrency: 10  |  studies in flight: 10

## Token + cost accounting

- Extraction backend: **Claude subscription** (`--safe-mode`, `--max-turns 1`, one shot per call)
- Model calls: **61** (cache hits 1067, failures 54)
- Input tokens: **36,092** (fresh 5,510 · cache-write 30,582 · cache-read 0)
- Output tokens: **6,101**
- **Spent on this run: $0.00** — subscription, not metered.
- **API-equivalent cost: $0.267** — what the same work would cost billed per token.
- Per study: **0.4 calls**, **$0.0017** API-equivalent across 155 scored studies.

| Agent | Tier | Model | Calls | Cache hits | Fail | In | Out | API-equiv |
|---|---|---|--:|--:|--:|--:|--:|--:|
| S1 | A | `claude-haiku-4-5-20251001` | 1 | 154 | 0 | 2,866 | 1,164 | $0.010 |
| S3 | B | `claude-sonnet-5` | 4 | 153 | 3 | 5,555 | 592 | $0.044 |
| S4 | B | `claude-sonnet-5` | 1 | 154 | 0 | 3,601 | 303 | $0.028 |
| S5 | B | `claude-sonnet-5` | 4 | 153 | 3 | 11,337 | 1,448 | $0.091 |
| S5T | A | `claude-haiku-4-5-20251001` | 48 | 0 | 48 | 0 | 0 | $0.000 |
| S6B | C | `claude-sonnet-5` | 1 | 145 | 0 | 4,337 | 932 | $0.041 |
| S7 | B | `claude-sonnet-5` | 1 | 154 | 0 | 5,762 | 367 | $0.042 |
| S8 | A | `claude-haiku-4-5-20251001` | 1 | 154 | 0 | 2,634 | 1,295 | $0.011 |

Tier → model is pinned in `claude_adapter.TIER_MODEL` (full ids, never aliases: an alias floats to a new model while the cache key does not change). Tier A = classification, B = extraction, C = the highest-risk agent.

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

- Requested (cap): **0**
- S2 extractions ok: **0**
- Resolved for multiplier: **0**
_SRs never add patients; only a capped confidence boost (≤ +30%)._

## ECU scores — this run only

| Outcome | 0–100 | Verdict | effect | in your form | at your dose | evidence | n |
|---|---:|---|---|---|---|---|---:|
| muscle_power | 44 | probably does not work | -0.02 @ 100% | 0.80 (pooled -0.02 @ 54%) | -0.04 @ 21% | 95% | 25 |
| lean_body_mass | 40 | probably does not work | +0.01 @ 100% | 0.80 (pooled -0.04 @ 77%) | -0.29 @ 24% | 85% | 11 |
| muscle_strength | 38 | probably does not work | -0.22 @ 100% | 0.80 (pooled -0.26 @ 72%) | -0.30 @ 27% | 88% | 16 |
| energy_levels | 20 | works, but not tested for your product | +0.36 @ 100% | 0.80 (pooled +0.30 @ 60%) | not tested | 38% | 3 |
| exercise_endurance | 9 | does not work | -0.30 @ 100% | all negative (-0.35 @ 78%) | -0.35 @ 24% | 67% | 6 |

_0–100 = 100 × c × mean(effect, form, dose). Each arc shows its verdict and the share of evidence behind it. A low number with a FULL evidence arc means 'does not work'; with an EMPTY one it means 'barely studied'._


_Old rows from previous runs are not shown here._

## Which studies made each number

### muscle_power — signed -1

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:103390nu12102961` | +3.29 | 0.1626 | 1.0 | 4 | unspecified |
| `doi:101186s12970021004077` | +3.24 | 0.1602 | 1.0 | 4 | unspecified |
| `doi:103390nu16152437` | -3.08 | 0.4341 | -0.35 | 4 | unspecified |
| `doi:101111sms14629` | +2.26 | 0.3727 | 0.3 | 4 | exact |
| `doi:103390nu15163567` | -2.19 | 0.3089 | -0.35 | 4 | exact |
| `doi:103390nu17243831` | +2.09 | 0.3438 | 0.3 | 4 | exact |
| `doi:101123ijsnem20140146` | +1.70 | 0.126 | 0.6666666666666665 | 4 | exact |
| `doi:103390nu14061140` | -1.54 | 0.2167 | -0.35 | 4 | exact |
| `doi:101519jsc0000000000001223` | -1.23 | 0.1732 | -0.35 | 4 | exact |
| `doi:101016jjsams201510005` | +1.18 | 0.195 | 0.3 | 4 | unspecified |
| `doi:101186s1297001701622` | -1.15 | 0.1626 | -0.35 | 4 | unspecified |
| `doi:101016jnut201303003` | +1.12 | 0.1845 | 0.3 | 4 | unspecified |
| `doi:101136bjsm2005022558` | -1.10 | 0.1556 | -0.35 | 4 | unspecified |
| `doi:103390nu16060766` | -1.04 | 0.147 | -0.35 | 4 | different |
| `doi:103390nu16091324` | -1.03 | 0.1447 | -0.35 | 4 | exact |
| **sum of all 25** | **-1.42** | | | | |

### lean_body_mass — signed +1

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:103390nu12010193` | -7.30 | 0.7236 | -0.35 | 4 | exact |
| `doi:101249mss0000000000003202` | +5.19 | 0.6 | 0.3 | 4 | exact |
| `doi:101007bf02982622` | +4.68 | 0.3896 | 0.4166666666666667 | 4 | unspecified |
| `doi:101007s1260300901248` | -4.42 | 0.4383 | -0.35 | 4 | exact |
| `doi:1033549physiolres935323` | +1.39 | 0.1602 | 0.3 | 4 | exact |
| `registry:nct04048616` | -1.11 | 0.11 | -0.35 | 4 | unspecified |
| `doi:1010801550278320232193556` | +1.04 | 0.12 | 0.3 | 4 | exact |
| `registry:isrctn83081058` | +0.89 | 0.1025 | 0.3 | 4 | exact |
| `registry:nct01472393` | +0.85 | 0.0978 | 0.3 | 4 | unspecified |
| `doi:101007s004210031031z` | +0.59 | 0.0677 | 0.3 | 4 | exact |
| `doi:103390nu10111640` | -0.50 | 0.05 | -0.35 | 4 | unspecified |
| **sum of all 11** | **+1.30** | | | | |

### muscle_strength — signed -19

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:101249mss0000000000003202` | -5.74 | 0.6 | -0.35 | 4 | exact |
| `doi:101007s1260300901248` | -4.19 | 0.4383 | -0.35 | 4 | exact |
| `registry:nct01164020` | -4.01 | 0.4196 | -0.35 | 4 | exact |
| `doi:101111sms14629` | -3.56 | 0.3727 | -0.35 | 4 | exact |
| `doi:101136bjsm2005022558` | -1.49 | 0.1556 | -0.35 | 4 | unspecified |
| `doi:103390nu10111640` | +1.37 | 0.05 | 1.0 | 4 | unspecified |
| `doi:1033549physiolres935323` | +1.31 | 0.1602 | 0.3 | 4 | exact |
| `doi:1010801550278320232193556` | -1.15 | 0.12 | -0.35 | 4 | exact |
| `registry:nct01472393` | -0.94 | 0.0978 | -0.35 | 4 | unspecified |
| `registry:isrctn83081058` | +0.84 | 0.1025 | 0.3 | 4 | exact |
| `doi:1015191533428720030170026csaieo20co2` | -0.71 | 0.0738 | -0.35 | 4 | unspecified |
| `doi:101007s004210031031z` | +0.55 | 0.0677 | 0.3 | 4 | exact |
| `doi:103390nu9111169` | -0.48 | 0.05 | -0.35 | 4 | unspecified |
| `doi:103390nu8030143` | -0.48 | 0.05 | -0.35 | 4 | unspecified |
| `doi:103390nu13030826` | -0.26 | 0.2812 | -0.03333333333333336 | 4 | unspecified |
| **sum of all 16** | **-18.94** | | | | |

### energy_levels — signed +14

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:103390nu17111772` | +6.83 | 0.4326 | 0.3 | 4 | exact |
| `doi:103390nu18081192` | +4.49 | 0.1462 | 0.5833333333333334 | 4 | unspecified |
| `doi:103390nu16060896` | +2.31 | 0.1464 | 0.3 | 4 | unspecified |
| **sum of all 3** | **+13.63** | | | | |

### exercise_endurance — signed -20

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:103390nu12010193` | -10.00 | 0.7236 | -0.35 | 4 | exact |
| `doi:101111sms14629` | -5.15 | 0.3727 | -0.35 | 4 | exact |
| `doi:103390nu14061140` | -2.99 | 0.2167 | -0.35 | 4 | exact |
| `doi:101016jjsams201510005` | -2.69 | 0.195 | -0.35 | 4 | unspecified |
| `doi:101113ep087886` | +2.26 | 0.0573 | 1.0 | 4 | unspecified |
| `doi:103390nu9121359` | -1.59 | 0.1149 | -0.35 | 4 | different |
| **sum of all 6** | **-20.16** | | | | |

_`points` sum to the signed score. NEGATIVE points mean that study pushed the score down. `w` is quality (design × RoB × size × funding × OA); `s` is what it found (+1.0 meaningful benefit, +0.3 trivial/unsized, −0.7 null, −1.0 harm). The two are separate on purpose: how good a study is and what it found are different facts._

## Database snapshot (`creatine`)

### `pilot_creatine_supp.sqlite`

Studies stored (corpus): **200** · ECUs: **0** · syntheses: **50
