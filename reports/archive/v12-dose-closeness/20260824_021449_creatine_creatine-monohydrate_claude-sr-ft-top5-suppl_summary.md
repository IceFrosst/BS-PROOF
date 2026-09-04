# BS-PROOF summary report (claude-sr-ft-top5-suppl)

Generated: **2026-08-24 02:14 UTC**


scoring_model: v12-dose-closeness

Ingredient: `creatine` · Form: `creatine_monohydrate` · Mode: **claude-sr-ft-top5-suppl**

Auto-written after every extraction (no extra steps).

Full audit: matching `*_full.md` in `reports/runs/`.

## This run — extraction stats

- Targeted studies: **156**
- Succeeded (usable): **155**
- Skipped (no text): **1**
- Partial agent failures: **9**
- Prompt version: `v1.22`
- Concurrency: 15  |  studies in flight: 15

## Token + cost accounting

- Extraction backend: **Claude subscription** (`--safe-mode`, `--max-turns 1`, one shot per call)
- Model calls: **1999** (cache hits 403, failures 1242)
- Input tokens: **10,965,113** (fresh 511,618 · cache-write 1,967,875 · cache-read 8,485,620)
- Output tokens: **1,048,624**
- **Spent on this run: $0.00** — subscription, not metered.
- **API-equivalent cost: $50.703** — what the same work would cost billed per token.
- Per study: **12.9 calls**, **$0.3271** API-equivalent across 155 scored studies.

| Agent | Tier | Model | Calls | Cache hits | Fail | In | Out | API-equiv |
|---|---|---|--:|--:|--:|--:|--:|--:|
| S1 | A | `claude-haiku-4-5-20251001` | 345 | 56 | 234 | 636,335 | 295,896 | $2.527 |
| S3 | B | `claude-sonnet-5` | 305 | 66 | 199 | 4,302,740 | 84,834 | $18.095 |
| S4 | B | `claude-sonnet-5` | 306 | 63 | 198 | 592,642 | 51,896 | $2.656 |
| S5 | B | `claude-sonnet-5` | 309 | 65 | 199 | 3,984,866 | 205,553 | $20.199 |
| S5T | A | `claude-haiku-4-5-20251001` | 15 | 0 | 15 | 0 | 0 | $0.000 |
| S6B | C | `claude-sonnet-5` | 134 | 37 | 32 | 464,377 | 102,626 | $2.563 |
| S7 | B | `claude-sonnet-5` | 288 | 67 | 180 | 689,814 | 48,067 | $2.842 |
| S8 | A | `claude-haiku-4-5-20251001` | 297 | 49 | 185 | 294,339 | 259,752 | $1.821 |

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
| lean_body_mass | 65 | probably works | +0.02 @ 100% | 0.80 (pooled -0.04 @ 79%) | -0.30 @ 29% | 85% | 10 |
| muscle_strength | 64 | probably works | -0.24 @ 100% | 0.80 (pooled -0.26 @ 74%) | -0.27 @ 31% | 87% | 15 |
| muscle_power | 61 | probably works | -0.01 @ 100% | 0.80 (pooled -0.02 @ 54%) | +0.03 @ 30% | 95% | 24 |
| energy_levels | 29 | works, but weakly evidenced | +0.36 @ 100% | 0.80 (pooled +0.30 @ 60%) | +0.30 @ 9% | 38% | 3 |
| exercise_endurance | 27 | probably does not work | -0.30 @ 100% | all negative (-0.35 @ 78%) | -0.35 @ 36% | 68% | 7 |

_0–100 = 100 × c × mean(effect, form, dose). Each arc shows its verdict and the share of evidence behind it. A low number with a FULL evidence arc means 'does not work'; with an EMPTY one it means 'barely studied'._


_Old rows from previous runs are not shown here._

## Which studies made each number

### lean_body_mass — signed +2

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:103390nu12010193` | -7.39 | 0.7236 | -0.35 | 4 | exact |
| `doi:101249mss0000000000003202` | +5.25 | 0.6 | 0.3 | 4 | exact |
| `doi:101007bf02982622` | +4.74 | 0.3896 | 0.4166666666666667 | 4 | unspecified |
| `doi:101007s1260300901248` | -4.48 | 0.4383 | -0.35 | 4 | exact |
| `doi:1033549physiolres935323` | +1.40 | 0.1602 | 0.3 | 4 | exact |
| `registry:nct04048616` | -1.12 | 0.11 | -0.35 | 4 | unspecified |
| `doi:1010801550278320232193556` | +1.05 | 0.12 | 0.3 | 4 | exact |
| `registry:isrctn83081058` | +0.90 | 0.1025 | 0.3 | 4 | exact |
| `registry:nct01472393` | +0.86 | 0.0978 | 0.3 | 4 | unspecified |
| `doi:101007s004210031031z` | +0.59 | 0.0677 | 0.3 | 4 | exact |
| **sum of all 10** | **+1.80** | | | | |

### muscle_strength — signed -21

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:101249mss0000000000003202` | -5.84 | 0.6 | -0.35 | 4 | exact |
| `doi:101007s1260300901248` | -4.27 | 0.4383 | -0.35 | 4 | exact |
| `registry:nct01164020` | -4.08 | 0.4196 | -0.35 | 4 | exact |
| `doi:101111sms14629` | -3.63 | 0.3727 | -0.35 | 4 | exact |
| `doi:101136bjsm2005022558` | -1.51 | 0.1556 | -0.35 | 4 | unspecified |
| `doi:1033549physiolres935323` | +1.34 | 0.1602 | 0.3 | 4 | exact |
| `doi:1010801550278320232193556` | -1.17 | 0.12 | -0.35 | 4 | exact |
| `registry:nct01472393` | -0.95 | 0.0978 | -0.35 | 4 | unspecified |
| `registry:isrctn83081058` | +0.85 | 0.1025 | 0.3 | 4 | exact |
| `doi:1015191533428720030170026csaieo20co2` | -0.72 | 0.0738 | -0.35 | 4 | unspecified |
| `doi:101007s004210031031z` | +0.56 | 0.0677 | 0.3 | 4 | exact |
| `doi:103390nu9111169` | -0.49 | 0.05 | -0.35 | 4 | unspecified |
| `doi:103390nu8030143` | -0.49 | 0.05 | -0.35 | 4 | unspecified |
| `doi:103390nu13030826` | -0.26 | 0.2812 | -0.03333333333333336 | 4 | unspecified |
| `doi:103390nu9121359` | +0.00 | 0.1149 | 0.0 | 4 | different |
| **sum of all 15** | **-20.66** | | | | |

### muscle_power — signed -1

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:103390nu12102961` | +3.33 | 0.1626 | 1.0 | 4 | unspecified |
| `doi:101186s12970021004077` | +3.28 | 0.1602 | 1.0 | 4 | unspecified |
| `doi:103390nu16152437` | -3.11 | 0.4341 | -0.35 | 4 | unspecified |
| `doi:101111sms14629` | +2.29 | 0.3727 | 0.3 | 4 | exact |
| `doi:103390nu15163567` | -2.21 | 0.3089 | -0.35 | 4 | exact |
| `doi:103390nu17243831` | +2.11 | 0.3438 | 0.3 | 4 | exact |
| `doi:101123ijsnem20140146` | +1.72 | 0.126 | 0.6666666666666665 | 4 | exact |
| `doi:103390nu14061140` | -1.55 | 0.2167 | -0.35 | 4 | exact |
| `doi:101519jsc0000000000001223` | -1.24 | 0.1732 | -0.35 | 4 | exact |
| `doi:101016jjsams201510005` | +1.20 | 0.195 | 0.3 | 4 | unspecified |
| `doi:101186s1297001701622` | -1.16 | 0.1626 | -0.35 | 4 | unspecified |
| `doi:101016jnut201303003` | +1.13 | 0.1845 | 0.3 | 4 | unspecified |
| `doi:101136bjsm2005022558` | -1.11 | 0.1556 | -0.35 | 4 | unspecified |
| `doi:103390nu16060766` | -1.05 | 0.147 | -0.35 | 4 | different |
| `doi:103390nu16091324` | -1.04 | 0.1447 | -0.35 | 4 | exact |
| **sum of all 24** | **-1.04** | | | | |

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
| `doi:103390nu12010193` | -9.93 | 0.7236 | -0.35 | 4 | exact |
| `doi:101111sms14629` | -5.11 | 0.3727 | -0.35 | 4 | exact |
| `doi:103390nu14061140` | -2.97 | 0.2167 | -0.35 | 4 | exact |
| `doi:101016jjsams201510005` | -2.67 | 0.195 | -0.35 | 4 | unspecified |
| `doi:101113ep087886` | +2.25 | 0.0573 | 1.0 | 4 | unspecified |
| `doi:103390nu9121359` | -1.58 | 0.1149 | -0.35 | 4 | different |
| `doi:101017s000711451800017x` | -0.30 | 0.022 | -0.35 | 4 | exact |
| **sum of all 7** | **-20.31** | | | | |

_`points` sum to the signed score. NEGATIVE points mean that study pushed the score down. `w` is quality (design × RoB × size × funding × OA); `s` is what it found (+1.0 meaningful benefit, +0.3 trivial/unsized, −0.7 null, −1.0 harm). The two are separate on purpose: how good a study is and what it found are different facts._

## Database snapshot (`creatine`)

### `pilot_creatine_supp.sqlite`

Studies stored (corpus): **200** · ECUs: **0** · syntheses: **50
