# BS-PROOF summary report (claude-top5-per_o)

Generated: **2026-08-11 10:24 UTC**


scoring_model: v6-form-ladder-per-study

Ingredient: `creatine` · Form: `creatine_monohydrate` · Mode: **claude-top5-per_o**

Auto-written after every extraction (no extra steps).

Full audit: matching `*_full.md` in `reports/runs/`.

## This run — extraction stats

- Targeted studies: **150**
- Succeeded (usable): **149**
- Skipped (no text): **1**
- Partial agent failures: **8**
- Prompt version: `v1.14`
- Concurrency: 40  |  studies in flight: 40

## Token + cost accounting

- Extraction backend: **Claude subscription** (`--safe-mode`, `--max-turns 1`, one shot per call)
- Model calls: **1012** (cache hits 0, failures 136)
- Input tokens: **10,202,737** (fresh 311,675 · cache-write 2,327,117 · cache-read 7,563,945)
- Output tokens: **881,939**
- **Spent on this run: $0.00** — subscription, not metered.
- **API-equivalent cost: $48.709** — what the same work would cost billed per token.
- Per study: **6.8 calls**, **$0.3269** API-equivalent across 149 scored studies.

| Agent | Tier | Model | Calls | Cache hits | Fail | In | Out | API-equiv |
|---|---|---|--:|--:|--:|--:|--:|--:|
| S3 | B | `claude-sonnet-5` | 169 | 0 | 24 | 4,192,148 | 114,779 | $17.205 |
| S4 | B | `claude-sonnet-5` | 197 | 0 | 50 | 835,060 | 72,292 | $3.621 |
| S5 | B | `claude-sonnet-5` | 174 | 0 | 27 | 3,219,636 | 167,733 | $17.684 |
| S6B | C | `claude-sonnet-5` | 144 | 0 | 4 | 628,563 | 142,579 | $3.626 |
| S7 | B | `claude-sonnet-5` | 179 | 0 | 31 | 973,498 | 70,364 | $4.426 |
| S8 | A | `claude-haiku-4-5-20251001` | 149 | 0 | 0 | 353,832 | 314,192 | $2.147 |

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
| muscle_strength | 42 | probably does not work | -0.42 @ 100% | 0.80 (pooled -0.44 @ 49%) | -0.42 @ 100% | 92% | 25 |
| lean_body_mass | 35 | probably does not work | -0.09 @ 100% | 0.80 (pooled -0.27 @ 58%) | not tested | 82% | 13 |
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

### muscle_strength — signed -36

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:101249mss0000000000003202` | -9.44 | 0.6 | -0.7 | 4 | exact |
| `registry:nct01164020` | -6.60 | 0.4196 | -0.7 | 4 | unspecified |
| `doi:101139apnm20140498` | +4.72 | 0.21 | 1.0 | 4 | unspecified |
| `doi:101186s1297002100456y` | -4.30 | 0.2733 | -0.7 | 4 | exact |
| `doi:101519jsc0b013e3182a361a5` | -3.92 | 0.249 | -0.7 | 4 | unspecified |
| `doi:103390nu13030826` | -2.95 | 0.1875 | -0.7 | 4 | unspecified |
| `doi:101519jsc0b013e318234eba1` | -2.79 | 0.1772 | -0.7 | 4 | exact |
| `doi:101519jsc0000000000001223` | -2.73 | 0.1732 | -0.7 | 4 | exact |
| `doi:101136bjsm2005022558` | -2.45 | 0.1556 | -0.7 | 4 | unspecified |
| `registry:nct01472393` | -1.73 | 0.11 | -0.7 | 4 | unspecified |
| `doi:1011770260106020975247` | -1.37 | 0.0869 | -0.7 | 4 | unspecified |
| `doi:101007s0042101429030` | -1.30 | 0.0828 | -0.7 | 4 | unspecified |
| `doi:1010801939021120252518408` | -1.25 | 0.0796 | -0.7 | 4 | exact |
| `doi:1010801939021120211904085` | -1.25 | 0.0796 | -0.7 | 4 | exact |
| `doi:103390nu10111640` | +1.12 | 0.05 | 1.0 | 4 | unspecified |
| **sum of all 25** | **-35.90** | | | | |

### lean_body_mass — signed -6

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:103390nu12010193` | -8.76 | 0.4341 | -0.7 | 4 | exact |
| `doi:101007bf02982622` | -7.86 | 0.3896 | -0.7 | 4 | unspecified |
| `doi:1011770260106017737013` | +6.22 | 0.2156 | 1.0 | 4 | unspecified |
| `doi:101139apnm20140498` | +6.06 | 0.21 | 1.0 | 4 | unspecified |
| `doi:1010801939021120252518408` | -1.61 | 0.0796 | -0.7 | 4 | exact |
| `doi:1010801939021120211904085` | -1.61 | 0.0796 | -0.7 | 4 | exact |
| `doi:1033549physiolres935323` | +1.39 | 0.1602 | 0.3 | 4 | exact |
| `doi:101123ijsnem20160129` | -1.37 | 0.0677 | -0.7 | 4 | exact |
| `doi:103390nu10111640` | -1.01 | 0.05 | -0.7 | 4 | unspecified |
| `registry:nct01472393` | +0.95 | 0.11 | 0.3 | 4 | unspecified |
| `doi:101016jexger201608005` | +0.71 | 0.082 | 0.3 | 4 | unspecified |
| `doi:101152physiolgenomics001572007` | +0.51 | 0.0594 | 0.3 | 4 | exact |
| `doi:101249mss0000000000003202` | +0.00 | 0.6 | 0.0 | 4 | exact |
| **sum of all 13** | **-6.38** | | | | |

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
