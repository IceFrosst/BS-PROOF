# BS-PROOF summary report (claude-top5-per_o)

Generated: **2026-08-11 17:46 UTC**


scoring_model: v8-effect-size

Ingredient: `creatine` · Form: `creatine_monohydrate` · Mode: **claude-top5-per_o**

Auto-written after every extraction (no extra steps).

Full audit: matching `*_full.md` in `reports/runs/`.

## This run — extraction stats

- Targeted studies: **150**
- Succeeded (usable): **149**
- Skipped (no text): **1**
- Partial agent failures: **63**
- Prompt version: `v1.17`
- Concurrency: 40  |  studies in flight: 40

## Token + cost accounting

- Extraction backend: **Claude subscription** (`--safe-mode`, `--max-turns 1`, one shot per call)
- Model calls: **906** (cache hits 0, failures 364)
- Input tokens: **5,002,607** (fresh 195,774 · cache-write 1,239,494 · cache-read 3,567,339)
- Output tokens: **637,808**
- **Spent on this run: $0.00** — subscription, not metered.
- **API-equivalent cost: $37.572** — what the same work would cost billed per token.
- Per study: **6.1 calls**, **$0.2522** API-equivalent across 149 scored studies.

| Agent | Tier | Model | Calls | Cache hits | Fail | In | Out | API-equiv |
|---|---|---|--:|--:|--:|--:|--:|--:|
| S3 | B | `claude-sonnet-5` | 159 | 0 | 65 | 1,433,645 | 73,321 | $13.262 |
| S4 | B | `claude-sonnet-5` | 169 | 0 | 73 | 544,056 | 45,071 | $1.862 |
| S5 | B | `claude-sonnet-5` | 169 | 0 | 75 | 1,815,612 | 164,657 | $16.652 |
| S6B | C | `claude-sonnet-5` | 91 | 0 | 22 | 312,799 | 90,982 | $2.125 |
| S7 | B | `claude-sonnet-5` | 169 | 0 | 76 | 677,168 | 46,214 | $2.232 |
| S8 | A | `claude-haiku-4-5-20251001` | 149 | 0 | 53 | 219,327 | 217,563 | $1.438 |

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
| muscle_power | 41 | probably does not work | +0.09 @ 100% | 0.80 (pooled +0.10 @ 68%) | not tested | 89% | 18 |
| muscle_strength | 32 | probably does not work | -0.18 @ 100% | 0.80 (pooled -0.21 @ 35%) | not tested | 76% | 12 |
| lean_body_mass | 24 | does not work | -0.17 @ 100% | 0.80 (pooled -0.23 @ 68%) | not tested | 58% | 5 |
| exercise_endurance | 23 | does not work | -0.27 @ 100% | 0.80 (pooled -0.29 @ 75%) | not tested | 57% | 6 |
| energy_levels | 3 | does not work | -0.03 @ 100% | all negative (-0.35 @ 50%) | not tested | 18% | 2 |

_0–100 = 100 × c × mean(effect, form, dose). Each arc shows its verdict and the share of evidence behind it. A low number with a FULL evidence arc means 'does not work'; with an EMPTY one it means 'barely studied'._


_Old rows from previous runs are not shown here._

## Which studies made each number

### muscle_power — signed +7

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:103390nu17243831` | +8.59 | 0.3438 | 1.0 | 4 | exact |
| `doi:103390nu12102961` | +4.06 | 0.1626 | 1.0 | 4 | unspecified |
| `doi:101186s12970021004077` | +4.00 | 0.1602 | 1.0 | 4 | unspecified |
| `doi:103390nu16152437` | -3.79 | 0.4341 | -0.35 | 4 | exact |
| `doi:101111sms14629` | +3.17 | 0.4234 | 0.3 | 4 | exact |
| `doi:103390nu15163567` | -2.70 | 0.3089 | -0.35 | 4 | exact |
| `doi:101038s4159802644278x` | +2.40 | 0.3201 | 0.3 | 4 | exact |
| `doi:101519jsc0000000000001223` | -1.51 | 0.1732 | -0.35 | 4 | exact |
| `doi:101136bjsm2005022558` | -1.36 | 0.1556 | -0.35 | 4 | unspecified |
| `doi:103390nu16060766` | -1.18 | 0.1349 | -0.35 | 4 | different |
| `doi:1010801550278320262617283` | -1.14 | 0.1302 | -0.35 | 4 | exact |
| `doi:10117719417381251320095` | -0.94 | 0.1079 | -0.35 | 4 | unspecified |
| `doi:1010801550278320222108683` | -0.90 | 0.1035 | -0.35 | 4 | unspecified |
| `doi:103390nu14061140` | -0.79 | 0.0903 | -0.35 | 4 | unspecified |
| `doi:101123ijspp20240310` | +0.69 | 0.0925 | 0.3 | 4 | exact |
| **sum of all 18** | **+7.28** | | | | |

### muscle_strength — signed -13

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:101249mss0000000000003202` | -4.41 | 0.36 | -0.35 | 4 | unspecified |
| `doi:101007s1260300901248` | -3.58 | 0.2922 | -0.35 | 4 | exact |
| `doi:103390nu13030826` | -2.29 | 0.1875 | -0.35 | 4 | unspecified |
| `doi:101519jsc0000000000001223` | -2.12 | 0.1732 | -0.35 | 4 | exact |
| `doi:101136bjsm2005022558` | -1.91 | 0.1556 | -0.35 | 4 | unspecified |
| `doi:103390nu10111640` | +1.75 | 0.05 | 1.0 | 4 | unspecified |
| `doi:1033549physiolres935323` | +1.68 | 0.1602 | 0.3 | 4 | exact |
| `doi:103390nu16162772` | -1.31 | 0.1074 | -0.35 | 4 | exact |
| `doi:103390nu9111169` | -0.61 | 0.05 | -0.35 | 4 | unspecified |
| `doi:103390nu8030143` | -0.61 | 0.05 | -0.35 | 4 | unspecified |
| `doi:103390nu9121359` | +0.00 | 0.1149 | 0.0 | 4 | different |
| `registry:nct01164020` | +0.00 | 0.4196 | 0.0 | 4 | unspecified |
| **sum of all 12** | **-13.41** | | | | |

### lean_body_mass — signed -10

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:103390nu12010193` | -6.69 | 0.4341 | -0.35 | 4 | exact |
| `doi:101007s1260300901248` | -4.50 | 0.2922 | -0.35 | 4 | exact |
| `doi:1033549physiolres935323` | +2.11 | 0.1602 | 0.3 | 4 | exact |
| `doi:103390nu10111640` | -0.77 | 0.05 | -0.35 | 4 | unspecified |
| `doi:101249mss0000000000003202` | +0.00 | 0.36 | 0.0 | 4 | unspecified |
| **sum of all 5** | **-9.85** | | | | |

### exercise_endurance — signed -15

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:103390nu12010193` | -6.78 | 0.4341 | -0.35 | 4 | exact |
| `doi:101111sms14629` | -6.61 | 0.4234 | -0.35 | 4 | exact |
| `doi:103390nu9121359` | -1.79 | 0.1149 | -0.35 | 4 | different |
| `doi:103390nu14061140` | -1.41 | 0.0903 | -0.35 | 4 | unspecified |
| `doi:101123ijspp20240310` | +1.24 | 0.0925 | 0.3 | 4 | exact |
| `doi:10117719417381251320095` | +0.00 | 0.1079 | 0.0 | 4 | unspecified |
| **sum of all 6** | **-15.35** | | | | |

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
