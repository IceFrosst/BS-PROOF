# BS-PROOF summary report (claude-sr-ft-top5-suppl)

Generated: **2026-08-23 18:10 UTC**


scoring_model: v12-dose-closeness

Ingredient: `creatine` · Form: `creatine_monohydrate` · Mode: **claude-sr-ft-top5-suppl**

Auto-written after every extraction (no extra steps).

Full audit: matching `*_full.md` in `reports/runs/`.

## This run — extraction stats

- Targeted studies: **156**
- Succeeded (usable): **155**
- Skipped (no text): **1**
- Partial agent failures: **5**
- Prompt version: `v1.21`
- Concurrency: 40  |  studies in flight: 40

## Token + cost accounting

- Extraction backend: **Claude subscription** (`--safe-mode`, `--max-turns 1`, one shot per call)
- Model calls: **396** (cache hits 566, failures 48)
- Input tokens: **3,812,498** (fresh 121,244 · cache-write 1,003,693 · cache-read 2,687,561)
- Output tokens: **378,403**
- **Spent on this run: $0.00** — subscription, not metered.
- **API-equivalent cost: $19.204** — what the same work would cost billed per token.
- Per study: **2.6 calls**, **$0.1239** API-equivalent across 155 scored studies.

| Agent | Tier | Model | Calls | Cache hits | Fail | In | Out | API-equiv |
|---|---|---|--:|--:|--:|--:|--:|--:|
| S3 | B | `claude-sonnet-5` | 73 | 95 | 15 | 1,484,482 | 49,231 | $7.982 |
| S4 | B | `claude-sonnet-5` | 74 | 96 | 16 | 319,975 | 28,984 | $1.416 |
| S5 | B | `claude-sonnet-5` | 69 | 96 | 13 | 1,242,575 | 74,374 | $5.890 |
| S6B | C | `claude-sonnet-5` | 61 | 85 | 1 | 266,173 | 53,644 | $1.435 |
| S7 | B | `claude-sonnet-5` | 61 | 97 | 3 | 349,057 | 25,028 | $1.484 |
| S8 | A | `claude-haiku-4-5-20251001` | 58 | 97 | 0 | 150,236 | 147,142 | $0.998 |

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
| muscle_strength | 69 | probably works | -0.01 @ 100% | 0.80 (pooled -0.07 @ 71%) | -0.07 @ 37% | 91% | 17 |
| lean_body_mass | 67 | probably works | -0.00 @ 100% | 0.80 (pooled -0.02 @ 74%) | -0.16 @ 33% | 87% | 11 |
| muscle_power | 63 | probably works | +0.04 @ 100% | 0.80 (pooled +0.17 @ 51%) | +0.41 @ 29% | 97% | 26 |
| exercise_endurance | 31 | probably does not work | -0.25 @ 100% | all negative (-0.31 @ 78%) | -0.29 @ 36% | 76% | 9 |
| energy_levels | 14 | works, but not tested for your product | +0.38 @ 100% | not tested in your form | +0.30 @ 30% | 28% | 2 |

_0–100 = 100 × c × mean(effect, form, dose). Each arc shows its verdict and the share of evidence behind it. A low number with a FULL evidence arc means 'does not work'; with an EMPTY one it means 'barely studied'._


_Old rows from previous runs are not shown here._

## Which studies made each number

### muscle_strength — signed -1

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:101249mss0000000000003202` | -5.17 | 0.6 | -0.35 | 4 | exact |
| `doi:103390nu10111640` | +4.55 | 0.1846 | 1.0 | 4 | unspecified |
| `doi:101111sms14629` | +3.13 | 0.4234 | 0.3 | 4 | exact |
| `doi:101007s1260300901248` | -2.52 | 0.2922 | -0.35 | 4 | exact |
| `doi:101519jsc0000000000001223` | -1.49 | 0.1732 | -0.35 | 4 | exact |
| `doi:101136bjsm2005022558` | -1.34 | 0.1556 | -0.35 | 4 | unspecified |
| `doi:103390nu8030143` | +1.23 | 0.05 | 1.0 | 4 | unspecified |
| `doi:1033549physiolres935323` | +1.18 | 0.1602 | 0.3 | 4 | exact |
| `doi:103390nu16162772` | -0.93 | 0.1074 | -0.35 | 4 | unspecified |
| `doi:1015191533428720030170026csaieo20co2` | +0.91 | 0.0738 | 0.5 | 4 | unspecified |
| `registry:isrctn83081058` | +0.76 | 0.1025 | 0.3 | 4 | exact |
| `doi:101007s004210031031z` | -0.58 | 0.0677 | -0.35 | 4 | exact |
| `registry:nct01164020` | +0.57 | 0.6993 | 0.03333333333333336 | 4 | exact |
| `doi:103390nu9111169` | -0.43 | 0.05 | -0.35 | 4 | unspecified |
| `registry:nct01472393` | -0.28 | 0.0978 | -0.11666666666666665 | 4 | unspecified |
| **sum of all 17** | **-0.56** | | | | |

### lean_body_mass — signed +0

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:103390nu12010193` | -7.01 | 0.7236 | -0.35 | 4 | exact |
| `doi:101249mss0000000000003202` | +4.98 | 0.6 | 0.3 | 4 | exact |
| `doi:101007bf02982622` | +3.60 | 0.3896 | 0.3333333333333333 | 4 | unspecified |
| `doi:101007s1260300901248` | -2.83 | 0.2922 | -0.35 | 4 | exact |
| `doi:103390nu10111640` | -2.36 | 0.1846 | -0.46237731733914933 | 4 | unspecified |
| `doi:1033549physiolres935323` | +1.33 | 0.1602 | 0.3 | 4 | exact |
| `doi:103390nu17061081` | +1.11 | 0.3239 | 0.12345679012345667 | 4 | exact |
| `registry:nct04048616` | -1.07 | 0.11 | -0.35 | 4 | unspecified |
| `registry:isrctn83081058` | +0.85 | 0.1025 | 0.3 | 4 | exact |
| `registry:nct01472393` | +0.81 | 0.0978 | 0.3 | 4 | unspecified |
| `doi:101007s004210031031z` | +0.56 | 0.0677 | 0.3 | 4 | exact |
| **sum of all 11** | **-0.03** | | | | |

### muscle_power — signed +4

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:103390ijerph18136919` | +6.72 | 0.3903 | 1.0 | 4 | exact |
| `doi:103390nu17243831` | +5.92 | 0.3438 | 1.0 | 4 | exact |
| `doi:103390nu15163567` | +2.96 | 0.1716 | 1.0 | 4 | exact |
| `doi:103390nu12102961` | +2.80 | 0.1626 | 1.0 | 4 | unspecified |
| `doi:101186s12970021004077` | +2.76 | 0.1602 | 1.0 | 4 | unspecified |
| `doi:103390nu16152437` | -2.62 | 0.4341 | -0.35 | 4 | unspecified |
| `doi:101038s4159802644278x` | -2.57 | 0.4268 | -0.35 | 4 | exact |
| `doi:101111sms14629` | -2.55 | 0.4234 | -0.35 | 4 | exact |
| `doi:101186s1297001701622` | -2.35 | 0.3903 | -0.35 | 4 | unspecified |
| `doi:103390nu16091324` | -2.09 | 0.3473 | -0.35 | 4 | exact |
| `doi:101016jjsams201510005` | -1.18 | 0.195 | -0.35 | 4 | unspecified |
| `doi:101519jsc0000000000001223` | -1.04 | 0.1732 | -0.35 | 4 | exact |
| `doi:101016jnut201303003` | +0.95 | 0.1845 | 0.3 | 4 | unspecified |
| `doi:101136bjsm2005022558` | -0.94 | 0.1556 | -0.35 | 4 | unspecified |
| `doi:101123ijsnem20140146` | +0.90 | 0.0525 | 1.0 | 4 | exact |
| **sum of all 26** | **+3.94** | | | | |

### exercise_endurance — signed -18

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:103390nu12010193` | -8.86 | 0.7236 | -0.35 | 4 | exact |
| `doi:101111sms14629` | -5.19 | 0.4234 | -0.35 | 4 | exact |
| `doi:101016jjsams201510005` | -2.39 | 0.195 | -0.35 | 4 | unspecified |
| `doi:103390ijerph18136919` | -2.28 | 0.3903 | -0.16666666666666666 | 4 | exact |
| `doi:101113ep087886` | +2.00 | 0.0573 | 1.0 | 4 | unspecified |
| `doi:103390nu9121359` | -1.41 | 0.1149 | -0.35 | 4 | different |
| `doi:10117719417381251320095` | +1.13 | 0.1079 | 0.3 | 4 | unspecified |
| `doi:103390nu14061140` | -1.11 | 0.0903 | -0.35 | 4 | exact |
| `doi:101017s000711451800017x` | -0.27 | 0.022 | -0.35 | 4 | exact |
| **sum of all 9** | **-18.38** | | | | |

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
