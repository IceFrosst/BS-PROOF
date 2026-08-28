# BS-PROOF summary report (claude-top5-per_o)

Generated: **2026-08-12 18:05 UTC**


scoring_model: v12-dose-closeness

Ingredient: `creatine` · Form: `creatine_monohydrate` · Mode: **claude-top5-per_o**

Auto-written after every extraction (no extra steps).

Full audit: matching `*_full.md` in `reports/runs/`.

## This run — extraction stats

- Targeted studies: **100**
- Succeeded (usable): **100**
- Skipped (no text): **0**
- Partial agent failures: **2**
- Prompt version: `v1.21`
- Concurrency: 40  |  studies in flight: 40

## Token + cost accounting

- Extraction backend: **Claude subscription** (`--safe-mode`, `--max-turns 1`, one shot per call)
- Model calls: **24** (cache hits 579, failures 11)
- Input tokens: **3,604,499** (fresh 48 · cache-write 2,532 · cache-read 3,601,919)
- Output tokens: **18,803**
- **Spent on this run: $0.00** — subscription, not metered.
- **API-equivalent cost: $1.428** — what the same work would cost billed per token.
- Per study: **0.2 calls**, **$0.0143** API-equivalent across 100 scored studies.

| Agent | Tier | Model | Calls | Cache hits | Fail | In | Out | API-equiv |
|---|---|---|--:|--:|--:|--:|--:|--:|
| S3 | B | `claude-sonnet-5` | 6 | 98 | 5 | 3,493,680 | 3,403 | $1.099 |
| S4 | B | `claude-sonnet-5` | 10 | 95 | 6 | 53,443 | 6,362 | $0.141 |
| S5 | B | `claude-sonnet-5` | 2 | 98 | 0 | 29,373 | 2,326 | $0.055 |
| S6B | C | `claude-sonnet-5` | 5 | 89 | 0 | 21,885 | 5,790 | $0.115 |
| S7 | B | `claude-sonnet-5` | 1 | 99 | 0 | 6,118 | 922 | $0.018 |
| S8 | A | `claude-haiku-4-5-20251001` | 0 | 100 | 0 | 0 | 0 | $0.000 |

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
| muscle_power | 74 | works | +0.05 @ 100% | 0.80 (pooled +0.17 @ 54%) | +0.47 @ 28% | 96% | 24 |
| muscle_strength | 68 | probably works | -0.04 @ 100% | 0.80 (pooled -0.08 @ 70%) | -0.11 @ 35% | 90% | 16 |
| lean_body_mass | 60 | probably works | -0.03 @ 100% | 0.80 (pooled -0.05 @ 79%) | -0.20 @ 34% | 84% | 8 |
| exercise_endurance | 53 | unclear | -0.23 @ 100% | 0.80 (pooled -0.27 @ 76%) | -0.30 @ 35% | 78% | 10 |
| energy_levels | 14 | works, but not tested for your product | +0.38 @ 100% | not tested in your form | +0.30 @ 30% | 28% | 2 |

_0–100 = 100 × c × mean(effect, form, dose). Each arc shows its verdict and the share of evidence behind it. A low number with a FULL evidence arc means 'does not work'; with an EMPTY one it means 'barely studied'._


_Old rows from previous runs are not shown here._

## Which studies made each number

### muscle_power — signed +5

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:103390ijerph18136919` | +7.06 | 0.3903 | 1.0 | 4 | exact |
| `doi:103390nu17243831` | +6.22 | 0.3438 | 1.0 | 4 | exact |
| `doi:103390nu15163567` | +3.10 | 0.1716 | 1.0 | 4 | exact |
| `doi:103390nu12102961` | +2.94 | 0.1626 | 1.0 | 4 | unspecified |
| `doi:101186s12970021004077` | +2.90 | 0.1602 | 1.0 | 4 | unspecified |
| `doi:103390nu16152437` | -2.75 | 0.4341 | -0.35 | 4 | unspecified |
| `doi:101038s4159802644278x` | -2.70 | 0.4268 | -0.35 | 4 | exact |
| `doi:101111sms14629` | -2.68 | 0.4234 | -0.35 | 4 | exact |
| `doi:101186s1297001701622` | -2.47 | 0.3903 | -0.35 | 4 | unspecified |
| `doi:103390nu16091324` | -2.20 | 0.3473 | -0.35 | 4 | exact |
| `doi:101016jjsams201510005` | -1.23 | 0.195 | -0.35 | 4 | unspecified |
| `doi:101519jsc0000000000001223` | -1.10 | 0.1732 | -0.35 | 4 | exact |
| `doi:101136bjsm2005022558` | -0.99 | 0.1556 | -0.35 | 4 | unspecified |
| `doi:101123ijsnem20140146` | +0.95 | 0.0525 | 1.0 | 4 | exact |
| `doi:103390nu16060766` | -0.85 | 0.1349 | -0.35 | 4 | different |
| **sum of all 24** | **+4.49** | | | | |

### muscle_strength — signed -4

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:101249mss0000000000003202` | -5.25 | 0.6 | -0.35 | 4 | exact |
| `doi:103390nu10111640` | +4.62 | 0.1846 | 1.0 | 4 | unspecified |
| `doi:101111sms14629` | +3.18 | 0.4234 | 0.3 | 4 | exact |
| `doi:101007s1260300901248` | -2.56 | 0.2922 | -0.35 | 4 | exact |
| `doi:101519jsc0000000000001223` | -1.52 | 0.1732 | -0.35 | 4 | exact |
| `doi:101136bjsm2005022558` | -1.36 | 0.1556 | -0.35 | 4 | unspecified |
| `doi:103390nu8030143` | +1.25 | 0.05 | 1.0 | 4 | unspecified |
| `doi:1033549physiolres935323` | +1.20 | 0.1602 | 0.3 | 4 | exact |
| `doi:103390nu16162772` | -0.94 | 0.1074 | -0.35 | 4 | unspecified |
| `doi:101519jsc0b013e3182a361a5` | -0.91 | 0.1038 | -0.35 | 4 | unspecified |
| `doi:1011770260106020975247` | -0.76 | 0.0869 | -0.35 | 4 | unspecified |
| `doi:1010801939021120211904085` | -0.70 | 0.0796 | -0.35 | 4 | exact |
| `registry:nct01164020` | +0.58 | 0.6993 | 0.03333333333333336 | 4 | exact |
| `doi:103390nu9111169` | -0.44 | 0.05 | -0.35 | 4 | unspecified |
| `doi:103390nu13030826` | -0.16 | 0.1875 | -0.03333333333333336 | 4 | unspecified |
| **sum of all 16** | **-3.77** | | | | |

### lean_body_mass — signed -2

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:103390nu12010193` | -7.52 | 0.7236 | -0.35 | 4 | exact |
| `doi:101249mss0000000000003202` | +5.34 | 0.6 | 0.3 | 4 | exact |
| `doi:101007bf02982622` | +3.85 | 0.3896 | 0.3333333333333333 | 4 | unspecified |
| `doi:101007s1260300901248` | -3.04 | 0.2922 | -0.35 | 4 | exact |
| `doi:103390nu10111640` | -2.53 | 0.1846 | -0.46237731733914933 | 4 | unspecified |
| `doi:1033549physiolres935323` | +1.43 | 0.1602 | 0.3 | 4 | exact |
| `doi:103390nu17061081` | +1.19 | 0.3239 | 0.12345679012345667 | 4 | exact |
| `doi:1010801939021120211904085` | -0.83 | 0.0796 | -0.35 | 4 | exact |
| **sum of all 8** | **-2.11** | | | | |

### exercise_endurance — signed -17

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:103390nu12010193` | -8.54 | 0.7236 | -0.35 | 4 | exact |
| `doi:101111sms14629` | -5.00 | 0.4234 | -0.35 | 4 | exact |
| `doi:101016jjsams201510005` | -2.30 | 0.195 | -0.35 | 4 | unspecified |
| `doi:103390ijerph18136919` | -2.19 | 0.3903 | -0.16666666666666666 | 4 | exact |
| `doi:101113ep087886` | +1.93 | 0.0573 | 1.0 | 4 | unspecified |
| `doi:103390nu9121359` | -1.36 | 0.1149 | -0.35 | 4 | different |
| `doi:10117719417381251320095` | +1.09 | 0.1079 | 0.3 | 4 | unspecified |
| `doi:103390nu14061140` | -1.07 | 0.0903 | -0.35 | 4 | exact |
| `doi:101123ijspp20240310` | +0.94 | 0.0925 | 0.3 | 4 | exact |
| `doi:101249mss0000000000001401` | -0.82 | 0.069 | -0.35 | 4 | unspecified |
| **sum of all 10** | **-17.32** | | | | |

### energy_levels — signed +11

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:103390nu16060896` | +5.94 | 0.3513 | 0.3 | 4 | unspecified |
| `doi:103390nu18081192` | +4.81 | 0.1462 | 0.5833333333333334 | 4 | unspecified |
| **sum of all 2** | **+10.75** | | | | |

_`points` sum to the signed score. NEGATIVE points mean that study pushed the score down. `w` is quality (design × RoB × size × funding × OA); `s` is what it found (+1.0 meaningful benefit, +0.3 trivial/unsized, −0.7 null, −1.0 harm). The two are separate on purpose: how good a study is and what it found are different facts._

## Database snapshot (`creatine`)

### `pilot_creatine_supp.sqlite`

Studies stored (corpus): **200** · ECUs: **0** · syntheses: **50
