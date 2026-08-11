# BS-PROOF summary report (claude-top5-per_o)

Generated: **2026-08-11 11:00 UTC**


scoring_model: v6-form-ladder-per-study

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
- Model calls: **22** (cache hits 876, failures 16)
- Input tokens: **1,386,080** (fresh 32 · cache-write 1,177 · cache-read 1,384,871)
- Output tokens: **9,494**
- **Spent on this run: $0.00** — subscription, not metered.
- **API-equivalent cost: $0.641** — what the same work would cost billed per token.
- Per study: **0.1 calls**, **$0.0043** API-equivalent across 149 scored studies.

| Agent | Tier | Model | Calls | Cache hits | Fail | In | Out | API-equiv |
|---|---|---|--:|--:|--:|--:|--:|--:|
| S3 | B | `claude-sonnet-5` | 12 | 145 | 11 | 1,344,483 | 6,239 | $0.553 |
| S4 | B | `claude-sonnet-5` | 3 | 147 | 1 | 16,533 | 1,094 | $0.031 |
| S5 | B | `claude-sonnet-5` | 4 | 147 | 3 | 8,069 | 898 | $0.019 |
| S6B | C | `claude-sonnet-5` | 1 | 140 | 0 | 4,225 | 381 | $0.015 |
| S7 | B | `claude-sonnet-5` | 2 | 148 | 1 | 12,770 | 882 | $0.024 |
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
| muscle_power | 53 | unclear | -0.14 @ 100% | 0.80 (pooled -0.10 @ 56%) | -0.14 @ 100% | 96% | 29 |
| muscle_strength | 42 | probably does not work | -0.44 @ 100% | 0.80 (pooled -0.48 @ 53%) | -0.44 @ 100% | 94% | 26 |
| lean_body_mass | 36 | probably does not work | -0.15 @ 100% | 0.80 (pooled -0.34 @ 63%) | not tested | 85% | 14 |
| exercise_endurance | 4 | does not work | -0.60 @ 100% | all negative (-0.70 @ 44%) | not tested | 50% | 8 |
| energy_levels | 2 | barely studied | +0.30 @ 100% | not tested in your form | not tested | 9% | 1 |

_0–100 = 100 × c × mean(effect, form, dose). Each arc shows its verdict and the share of evidence behind it. A low number with a FULL evidence arc means 'does not work'; with an EMPTY one it means 'barely studied'._


_Old rows from previous runs are not shown here._

## Which studies made each number

### muscle_power — signed -12

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:103390nu17243831` | +5.87 | 0.3438 | 1.0 | 4 | exact |
| `doi:103390nu16152437` | -5.18 | 0.4341 | -0.7 | 4 | exact |
| `doi:101186s1297001701622` | -4.66 | 0.3903 | -0.7 | 4 | unspecified |
| `doi:101186s1297002100456y` | -3.26 | 0.2733 | -0.7 | 4 | exact |
| `doi:101519jsc0b013e3182a361a5` | -2.97 | 0.249 | -0.7 | 4 | unspecified |
| `doi:103390nu12102961` | +2.77 | 0.1626 | 1.0 | 4 | unspecified |
| `doi:101186s12970021004077` | +2.73 | 0.1602 | 1.0 | 4 | unspecified |
| `doi:101556aphysiol96200936` | +2.71 | 0.1589 | 1.0 | 4 | exact |
| `doi:101038s4159802644278x` | +2.18 | 0.4268 | 0.3 | 4 | exact |
| `doi:101123ijsnem20140146` | +2.15 | 0.126 | 1.0 | 4 | exact |
| `doi:101519jsc0b013e318234eba1` | -2.12 | 0.1772 | -0.7 | 4 | exact |
| `doi:101519jsc0000000000001223` | -2.07 | 0.1732 | -0.7 | 4 | exact |
| `doi:103390nu15163567` | -2.05 | 0.1716 | -0.7 | 4 | exact |
| `doi:101136bjsm2005022558` | -1.86 | 0.1556 | -0.7 | 4 | unspecified |
| `doi:103390nu14061140` | -1.62 | 0.1355 | -0.7 | 4 | unspecified |
| **sum of all 29** | **-11.91** | | | | |

### muscle_strength — signed -38

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:101249mss0000000000003202` | -8.94 | 0.6 | -0.7 | 4 | exact |
| `registry:nct01164020` | -6.25 | 0.4196 | -0.7 | 4 | unspecified |
| `doi:101139apnm20140498` | +4.47 | 0.21 | 1.0 | 4 | unspecified |
| `doi:101007s1260300901248` | -4.35 | 0.2922 | -0.7 | 4 | exact |
| `doi:101186s1297002100456y` | -4.07 | 0.2733 | -0.7 | 4 | exact |
| `doi:101519jsc0b013e3182a361a5` | -3.71 | 0.249 | -0.7 | 4 | unspecified |
| `doi:103390nu13030826` | -2.79 | 0.1875 | -0.7 | 4 | unspecified |
| `doi:101519jsc0b013e318234eba1` | -2.64 | 0.1772 | -0.7 | 4 | exact |
| `doi:101519jsc0000000000001223` | -2.58 | 0.1732 | -0.7 | 4 | exact |
| `doi:101136bjsm2005022558` | -2.32 | 0.1556 | -0.7 | 4 | unspecified |
| `registry:nct01472393` | -1.64 | 0.11 | -0.7 | 4 | unspecified |
| `doi:1011770260106020975247` | -1.29 | 0.0869 | -0.7 | 4 | unspecified |
| `doi:101007s0042101429030` | -1.23 | 0.0828 | -0.7 | 4 | unspecified |
| `doi:1010801939021120252518408` | -1.19 | 0.0796 | -0.7 | 4 | exact |
| `doi:1010801939021120211904085` | -1.19 | 0.0796 | -0.7 | 4 | exact |
| **sum of all 26** | **-38.33** | | | | |

### lean_body_mass — signed -11

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:103390nu12010193` | -8.18 | 0.4341 | -0.7 | 4 | exact |
| `doi:101007bf02982622` | -7.34 | 0.3896 | -0.7 | 4 | unspecified |
| `doi:1011770260106017737013` | +5.80 | 0.2156 | 1.0 | 4 | unspecified |
| `doi:101139apnm20140498` | +5.65 | 0.21 | 1.0 | 4 | unspecified |
| `doi:101007s1260300901248` | -5.50 | 0.2922 | -0.7 | 4 | exact |
| `doi:1010801939021120252518408` | -1.50 | 0.0796 | -0.7 | 4 | exact |
| `doi:1010801939021120211904085` | -1.50 | 0.0796 | -0.7 | 4 | exact |
| `doi:1033549physiolres935323` | +1.29 | 0.1602 | 0.3 | 4 | exact |
| `doi:101123ijsnem20160129` | -1.27 | 0.0677 | -0.7 | 4 | exact |
| `doi:103390nu10111640` | -0.94 | 0.05 | -0.7 | 4 | unspecified |
| `registry:nct01472393` | +0.89 | 0.11 | 0.3 | 4 | unspecified |
| `doi:101016jexger201608005` | +0.66 | 0.082 | 0.3 | 4 | unspecified |
| `doi:101152physiolgenomics001572007` | +0.48 | 0.0594 | 0.3 | 4 | exact |
| `doi:101249mss0000000000003202` | +0.00 | 0.6 | 0.0 | 4 | exact |
| **sum of all 14** | **-11.46** | | | | |

### exercise_endurance — signed -29

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:101007s0072600603996` | -7.46 | 0.2297 | -0.7 | 4 | exact |
| `doi:101016jjsams201510005` | -6.33 | 0.195 | -0.7 | 4 | unspecified |
| `doi:101111sms14629` | -5.10 | 0.1573 | -0.7 | 4 | exact |
| `doi:103390nu14061140` | -4.40 | 0.1355 | -0.7 | 4 | unspecified |
| `doi:103390nu9121359` | -3.73 | 0.1149 | -0.7 | 4 | different |
| `doi:101113ep087886` | +2.66 | 0.0573 | 1.0 | 4 | unspecified |
| `doi:101249mss0000000000001401` | -2.24 | 0.069 | -0.7 | 4 | unspecified |
| `doi:101123ijsnem20160129` | -2.20 | 0.0677 | -0.7 | 4 | exact |
| **sum of all 8** | **-28.80** | | | | |

### energy_levels — signed +3

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:103390nu16060896` | +2.80 | 0.1464 | 0.3 | 4 | unspecified |
| **sum of all 1** | **+2.80** | | | | |

_`points` sum to the signed score. NEGATIVE points mean that study pushed the score down. `w` is quality (design × RoB × size × funding × OA); `s` is what it found (+1.0 meaningful benefit, +0.3 trivial/unsized, −0.7 null, −1.0 harm). The two are separate on purpose: how good a study is and what it found are different facts._

## Database snapshot (`creatine`)

### `pilot_creatine_supp.sqlite`

Studies stored (corpus): **200** · ECUs: **0** · syntheses: **50
