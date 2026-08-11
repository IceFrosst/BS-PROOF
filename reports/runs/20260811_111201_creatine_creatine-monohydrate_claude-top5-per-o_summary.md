# BS-PROOF summary report (claude-top5-per_o)

Generated: **2026-08-11 11:12 UTC**


scoring_model: v7-null-035

Ingredient: `creatine` · Form: `creatine_monohydrate` · Mode: **claude-top5-per_o**

Auto-written after every extraction (no extra steps).

Full audit: matching `*_full.md` in `reports/runs/`.

## This run — extraction stats

- Targeted studies: **150**
- Succeeded (usable): **149**
- Skipped (no text): **1**
- Partial agent failures: **3**
- Prompt version: `v1.14`
- Concurrency: 40  |  studies in flight: 40

## Token + cost accounting

- Extraction backend: **Claude subscription** (`--safe-mode`, `--max-turns 1`, one shot per call)
- Model calls: **12** (cache hits 882, failures 12)
- Input tokens: **1,265,568** (fresh 12 · cache-write 0 · cache-read 1,265,556)
- Output tokens: **3,634**
- **Spent on this run: $0.00** — subscription, not metered.
- **API-equivalent cost: $0.437** — what the same work would cost billed per token.
- Per study: **0.1 calls**, **$0.0029** API-equivalent across 149 scored studies.

| Agent | Tier | Model | Calls | Cache hits | Fail | In | Out | API-equiv |
|---|---|---|--:|--:|--:|--:|--:|--:|
| S3 | B | `claude-sonnet-5` | 9 | 146 | 9 | 1,265,568 | 3,634 | $0.437 |
| S4 | B | `claude-sonnet-5` | 0 | 149 | 0 | 0 | 0 | $0.000 |
| S5 | B | `claude-sonnet-5` | 3 | 148 | 3 | 0 | 0 | $0.000 |
| S6B | C | `claude-sonnet-5` | 0 | 141 | 0 | 0 | 0 | $0.000 |
| S7 | B | `claude-sonnet-5` | 0 | 149 | 0 | 0 | 0 | $0.000 |
| S8 | A | `claude-haiku-4-5-20251001` | 0 | 149 | 0 | 0 | 0 | $0.000 |

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
| muscle_power | 60 | probably works | +0.06 @ 100% | 0.80 (pooled +0.09 @ 56%) | +0.06 @ 100% | 96% | 29 |
| muscle_strength | 51 | unclear | -0.17 @ 100% | 0.80 (pooled -0.20 @ 53%) | -0.17 @ 100% | 94% | 26 |
| lean_body_mass | 39 | probably does not work | +0.02 @ 100% | 0.80 (pooled -0.15 @ 63%) | not tested | 85% | 14 |
| exercise_endurance | 7 | does not work | -0.28 @ 100% | all negative (-0.35 @ 44%) | not tested | 50% | 8 |
| energy_levels | 2 | barely studied | +0.30 @ 100% | not tested in your form | not tested | 9% | 1 |

_0–100 = 100 × c × mean(effect, form, dose). Each arc shows its verdict and the share of evidence behind it. A low number with a FULL evidence arc means 'does not work'; with an EMPTY one it means 'barely studied'._


_Old rows from previous runs are not shown here._

## Which studies made each number

### muscle_power — signed +5

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:103390nu17243831` | +6.21 | 0.3438 | 1.0 | 4 | exact |
| `doi:103390nu12102961` | +2.94 | 0.1626 | 1.0 | 4 | unspecified |
| `doi:101186s12970021004077` | +2.89 | 0.1602 | 1.0 | 4 | unspecified |
| `doi:101556aphysiol96200936` | +2.87 | 0.1589 | 1.0 | 4 | exact |
| `doi:103390nu16152437` | -2.74 | 0.4341 | -0.35 | 4 | exact |
| `doi:101186s1297001701622` | -2.47 | 0.3903 | -0.35 | 4 | unspecified |
| `doi:101038s4159802644278x` | +2.31 | 0.4268 | 0.3 | 4 | exact |
| `doi:101123ijsnem20140146` | +2.27 | 0.126 | 1.0 | 4 | exact |
| `doi:101186s1297002100456y` | -1.73 | 0.2733 | -0.35 | 4 | exact |
| `doi:101519jsc0b013e3182a361a5` | -1.57 | 0.249 | -0.35 | 4 | unspecified |
| `doi:101519jsc0b013e318234eba1` | -1.12 | 0.1772 | -0.35 | 4 | exact |
| `doi:101519jsc0000000000001223` | -1.09 | 0.1732 | -0.35 | 4 | exact |
| `doi:103390nu15163567` | -1.08 | 0.1716 | -0.35 | 4 | exact |
| `doi:101016jjsams201510005` | +1.06 | 0.195 | 0.3 | 4 | unspecified |
| `doi:101016jnut201303003` | +1.00 | 0.1845 | 0.3 | 4 | unspecified |
| **sum of all 29** | **+5.10** | | | | |

### muscle_strength — signed -15

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:101249mss0000000000003202` | -4.62 | 0.6 | -0.35 | 4 | exact |
| `doi:101139apnm20140498` | +4.62 | 0.21 | 1.0 | 4 | unspecified |
| `registry:nct01164020` | -3.23 | 0.4196 | -0.35 | 4 | unspecified |
| `doi:101007s1260300901248` | -2.25 | 0.2922 | -0.35 | 4 | exact |
| `doi:101186s1297002100456y` | -2.10 | 0.2733 | -0.35 | 4 | exact |
| `doi:101519jsc0b013e3182a361a5` | -1.92 | 0.249 | -0.35 | 4 | unspecified |
| `doi:103390nu13030826` | -1.44 | 0.1875 | -0.35 | 4 | unspecified |
| `doi:101519jsc0b013e318234eba1` | -1.36 | 0.1772 | -0.35 | 4 | exact |
| `doi:101519jsc0000000000001223` | -1.33 | 0.1732 | -0.35 | 4 | exact |
| `doi:101136bjsm2005022558` | -1.20 | 0.1556 | -0.35 | 4 | unspecified |
| `doi:103390nu10111640` | +1.10 | 0.05 | 1.0 | 4 | unspecified |
| `doi:1033549physiolres935323` | +1.06 | 0.1602 | 0.3 | 4 | exact |
| `doi:101111sms14629` | +1.04 | 0.1573 | 0.3 | 4 | exact |
| `registry:nct01472393` | -0.85 | 0.11 | -0.35 | 4 | unspecified |
| `doi:1011770260106020975247` | -0.67 | 0.0869 | -0.35 | 4 | unspecified |
| **sum of all 26** | **-15.33** | | | | |

### lean_body_mass — signed +2

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:1011770260106017737013` | +6.08 | 0.2156 | 1.0 | 4 | unspecified |
| `doi:101139apnm20140498` | +5.92 | 0.21 | 1.0 | 4 | unspecified |
| `doi:103390nu12010193` | -4.28 | 0.4341 | -0.35 | 4 | exact |
| `doi:101007bf02982622` | -3.84 | 0.3896 | -0.35 | 4 | unspecified |
| `doi:101007s1260300901248` | -2.88 | 0.2922 | -0.35 | 4 | exact |
| `doi:1033549physiolres935323` | +1.35 | 0.1602 | 0.3 | 4 | exact |
| `registry:nct01472393` | +0.93 | 0.11 | 0.3 | 4 | unspecified |
| `doi:1010801939021120252518408` | -0.78 | 0.0796 | -0.35 | 4 | exact |
| `doi:1010801939021120211904085` | -0.78 | 0.0796 | -0.35 | 4 | exact |
| `doi:101016jexger201608005` | +0.69 | 0.082 | 0.3 | 4 | unspecified |
| `doi:101123ijsnem20160129` | -0.67 | 0.0677 | -0.35 | 4 | exact |
| `doi:101152physiolgenomics001572007` | +0.50 | 0.0594 | 0.3 | 4 | exact |
| `doi:103390nu10111640` | -0.49 | 0.05 | -0.35 | 4 | unspecified |
| `doi:101249mss0000000000003202` | +0.00 | 0.6 | 0.0 | 4 | exact |
| **sum of all 14** | **+1.75** | | | | |

### exercise_endurance — signed -13

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:101007s0072600603996` | -3.79 | 0.2297 | -0.35 | 4 | exact |
| `doi:101016jjsams201510005` | -3.21 | 0.195 | -0.35 | 4 | unspecified |
| `doi:101113ep087886` | +2.70 | 0.0573 | 1.0 | 4 | unspecified |
| `doi:101111sms14629` | -2.59 | 0.1573 | -0.35 | 4 | exact |
| `doi:103390nu14061140` | -2.23 | 0.1355 | -0.35 | 4 | unspecified |
| `doi:103390nu9121359` | -1.89 | 0.1149 | -0.35 | 4 | different |
| `doi:101249mss0000000000001401` | -1.14 | 0.069 | -0.35 | 4 | unspecified |
| `doi:101123ijsnem20160129` | -1.12 | 0.0677 | -0.35 | 4 | exact |
| **sum of all 8** | **-13.27** | | | | |

### energy_levels — signed +3

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:103390nu16060896` | +2.80 | 0.1464 | 0.3 | 4 | unspecified |
| **sum of all 1** | **+2.80** | | | | |

_`points` sum to the signed score. NEGATIVE points mean that study pushed the score down. `w` is quality (design × RoB × size × funding × OA); `s` is what it found (+1.0 meaningful benefit, +0.3 trivial/unsized, −0.7 null, −1.0 harm). The two are separate on purpose: how good a study is and what it found are different facts._

## Database snapshot (`creatine`)

### `pilot_creatine_supp.sqlite`

Studies stored (corpus): **200** · ECUs: **0** · syntheses: **50
