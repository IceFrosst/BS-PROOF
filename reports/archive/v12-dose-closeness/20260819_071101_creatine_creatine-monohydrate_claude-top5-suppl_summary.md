# BS-PROOF summary report (claude-top5-suppl)

Generated: **2026-08-19 07:11 UTC**


scoring_model: v12-dose-closeness

Ingredient: `creatine` · Form: `creatine_monohydrate` · Mode: **claude-top5-suppl**

Auto-written after every extraction (no extra steps).

Full audit: matching `*_full.md` in `reports/runs/`.

## This run — extraction stats

- Targeted studies: **177**
- Succeeded (usable): **176**
- Skipped (no text): **1**
- Partial agent failures: **3**
- Prompt version: `v1.21`
- Concurrency: 40  |  studies in flight: 40

## Token + cost accounting

- Extraction backend: **Claude subscription** (`--safe-mode`, `--max-turns 1`, one shot per call)
- Model calls: **75** (cache hits 981, failures 13)
- Input tokens: **1,259,489** (fresh 23,704 · cache-write 118,361 · cache-read 1,117,424)
- Output tokens: **60,827**
- **Spent on this run: $0.00** — subscription, not metered.
- **API-equivalent cost: $1.979** — what the same work would cost billed per token.
- Per study: **0.4 calls**, **$0.0112** API-equivalent across 176 scored studies.

| Agent | Tier | Model | Calls | Cache hits | Fail | In | Out | API-equiv |
|---|---|---|--:|--:|--:|--:|--:|--:|
| S3 | B | `claude-sonnet-5` | 16 | 163 | 4 | 909,655 | 8,941 | $0.606 |
| S4 | B | `claude-sonnet-5` | 13 | 165 | 3 | 51,235 | 5,216 | $0.209 |
| S5 | B | `claude-sonnet-5` | 16 | 164 | 6 | 176,758 | 18,696 | $0.603 |
| S6B | C | `claude-sonnet-5` | 10 | 157 | 0 | 43,500 | 7,534 | $0.214 |
| S7 | B | `claude-sonnet-5` | 10 | 166 | 0 | 54,755 | 3,922 | $0.229 |
| S8 | A | `claude-haiku-4-5-20251001` | 10 | 166 | 0 | 23,586 | 16,518 | $0.118 |

Tier → model is pinned in `claude_adapter.TIER_MODEL` (full ids, never aliases: an alias floats to a new model while the cache key does not change). Tier A = classification, B = extraction, C = the highest-risk agent.

## Predatory journal check (flag only — not in score)

- List entries loaded: **1162**
- Studies checked: **1008**
- Publisher resolved for: **707/1008** (the list is PUBLISHERS, so this is the real coverage)
- Studies flagged predatory: **12**
- Distinct publishers flagged: **1**
- Distinct journals flagged: **0**
- Affects score: **NO (count only)**
  - [publisher] Frontiers Media SA

## Systematic reviews / meta-analyses (S2)

- Requested (cap): **0**
- S2 extractions ok: **0**
- Resolved for multiplier: **0**
_SRs never add patients; only a capped confidence boost (≤ +30%)._

## ECU scores — this run only

| Outcome | 0–100 | Verdict | effect | in your form | at your dose | evidence | n |
|---|---:|---|---|---|---|---|---:|
| muscle_power | 45 | unclear | +0.08 @ 100% | 0.80 (pooled +0.19 @ 54%) | not tested | 97% | 34 |
| muscle_strength | 42 | probably does not work | +0.02 @ 100% | 0.80 (pooled -0.03 @ 46%) | not tested | 93% | 26 |
| lean_body_mass | 35 | probably does not work | +0.08 @ 100% | 0.80 (pooled -0.06 @ 48%) | not tested | 75% | 14 |
| exercise_endurance | 31 | probably does not work | -0.11 @ 100% | 0.80 (pooled -0.07 @ 71%) | not tested | 72% | 12 |
| energy_levels | 17 | works, but not tested for your product | +0.38 @ 100% | 0.80 (pooled +0.30 @ 72%) | not tested | 33% | 2 |

_0–100 = 100 × c × mean(effect, form, dose). Each arc shows its verdict and the share of evidence behind it. A low number with a FULL evidence arc means 'does not work'; with an EMPTY one it means 'barely studied'._


_Old rows from previous runs are not shown here._

## Which studies made each number

### muscle_power — signed +7

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:103390nu15163567` | +5.17 | 0.3089 | 1.0 | 4 | exact |
| `doi:101186s1297001701622` | +2.72 | 0.1626 | 1.0 | 4 | unspecified |
| `doi:101038s4159802644278x` | +2.68 | 0.5334 | 0.3 | 4 | exact |
| `doi:101186s12970021004077` | +2.68 | 0.1602 | 1.0 | 4 | unspecified |
| `doi:101556aphysiol96200936` | +2.66 | 0.1589 | 1.0 | 4 | exact |
| `doi:103390nu16152437` | -2.54 | 0.4341 | -0.35 | 4 | unspecified |
| `doi:103390nu16091324` | -2.03 | 0.3473 | -0.35 | 4 | exact |
| `pmid:10573659` | +1.88 | 0.1589 | 0.7083333333333333 | 4 | exact |
| `registry:nct04048616` | -1.55 | 0.264 | -0.35 | 4 | unspecified |
| `doi:101519jsc0b013e3182a361a5` | -1.46 | 0.249 | -0.35 | 4 | unspecified |
| `doi:101123ijsnem20140146` | +1.40 | 0.126 | 0.6666666666666665 | 4 | exact |
| `doi:101519r171841` | -1.25 | 0.2143 | -0.35 | 4 | exact |
| `doi:101123ijsnem14195` | +1.20 | 0.0716 | 1.0 | 4 | exact |
| `pmid:16446682` | +1.17 | 0.0749 | 0.9333333333333332 | 4 | exact |
| `doi:101519r200051` | -1.08 | 0.1845 | -0.35 | 4 | exact |
| **sum of all 34** | **+7.36** | | | | |

### muscle_strength — signed +1

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:101139apnm20140498` | +4.69 | 0.21 | 1.0 | 4 | unspecified |
| `doi:101007s0042101225146` | +3.70 | 0.1657 | 1.0 | 4 | unspecified |
| `doi:101519r200051` | +3.43 | 0.1845 | 0.8333333333333334 | 4 | exact |
| `doi:101249mss0000000000003202` | -2.56 | 0.6 | -0.19148936170212766 | 4 | exact |
| `doi:101519jsc0b013e3182a361a5` | -1.94 | 0.249 | -0.35 | 4 | unspecified |
| `doi:103390nu9121359` | -1.35 | 0.1723 | -0.35 | 4 | different |
| `doi:101519jsc0000000000001223` | -1.35 | 0.1732 | -0.35 | 4 | exact |
| `doi:101016jnut201004001` | -1.34 | 0.1717 | -0.35 | 4 | unspecified |
| `doi:101136bjsm2005022558` | -1.22 | 0.1556 | -0.35 | 4 | unspecified |
| `doi:103390nu10111640` | +1.12 | 0.05 | 1.0 | 4 | unspecified |
| `doi:1033549physiolres935323` | +1.07 | 0.1602 | 0.3 | 4 | different |
| `doi:101519jsc0b013e31818efbcc` | +1.04 | 0.0465 | 1.0 | 4 | unspecified |
| `doi:103390nu16162772` | -0.84 | 0.1074 | -0.35 | 4 | unspecified |
| `doi:101519jsc0b013e3181a2ed11` | -0.76 | 0.097 | -0.35 | 4 | exact |
| `registry:isrctn83081058` | +0.69 | 0.1025 | 0.3 | 4 | exact |
| **sum of all 26** | **+1.49** | | | | |

### lean_body_mass — signed +6

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:101139apnm20140498` | +7.28 | 0.21 | 1.0 | 4 | unspecified |
| `registry:nct04048616` | -3.20 | 0.264 | -0.35 | 4 | unspecified |
| `doi:1033549physiolres935323` | +1.67 | 0.1602 | 0.3 | 4 | different |
| `doi:101007s0042101225146` | +1.15 | 0.1657 | 0.20000000000000004 | 4 | unspecified |
| `registry:isrctn83081058` | +1.07 | 0.1025 | 0.3 | 4 | exact |
| `doi:1010801939021120252518408` | -0.97 | 0.0796 | -0.35 | 4 | exact |
| `doi:1010801939021120211904085` | -0.97 | 0.0796 | -0.35 | 4 | exact |
| `doi:101016jexger201608005` | +0.85 | 0.082 | 0.3 | 4 | unspecified |
| `doi:101139h07072` | -0.84 | 0.069 | -0.35 | 4 | exact |
| `doi:101519jsc0b013e31818efbcc` | +0.70 | 0.0465 | 0.4333333333333333 | 4 | unspecified |
| `doi:103390nu10111640` | -0.61 | 0.05 | -0.35 | 4 | unspecified |
| `registry:nct01472393` | -0.28 | 0.0978 | -0.08333333333333333 | 4 | unspecified |
| `doi:101123ijsnem20160129` | -0.23 | 0.0677 | -0.10000000000000002 | 4 | exact |
| `doi:101249mss0000000000003202` | +0.00 | 0.6 | 0.0 | 4 | exact |
| **sum of all 14** | **+5.62** | | | | |

### exercise_endurance — signed -7

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:103390nu17243831` | +9.65 | 0.2751 | 1.0 | 4 | exact |
| `doi:103390nu12010193` | -8.88 | 0.7236 | -0.35 | 4 | exact |
| `doi:103390nu9121359` | -2.12 | 0.1723 | -0.35 | 4 | different |
| `doi:101113ep087886` | +2.01 | 0.0573 | 1.0 | 4 | unspecified |
| `doi:101111sms14629` | -1.91 | 0.1553 | -0.35 | 4 | exact |
| `doi:101055s00311283179` | -1.18 | 0.0957 | -0.35 | 4 | different |
| `doi:103390nu14061140` | -1.11 | 0.0903 | -0.35 | 4 | unspecified |
| `doi:101123ijsnem14195` | -0.88 | 0.0716 | -0.35 | 4 | exact |
| `doi:101249mss0000000000001401` | -0.85 | 0.069 | -0.35 | 4 | unspecified |
| `doi:101139h07072` | -0.85 | 0.069 | -0.35 | 4 | exact |
| `doi:101519r170441` | -0.81 | 0.0662 | -0.35 | 4 | unspecified |
| `doi:101123ijsnem20160129` | -0.24 | 0.0677 | -0.10000000000000002 | 4 | exact |
| **sum of all 12** | **-7.17** | | | | |

### energy_levels — signed +12

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:103390nu17111772` | +7.10 | 0.4326 | 0.3 | 4 | exact |
| `doi:103390nu18081192` | +5.25 | 0.1645 | 0.5833333333333334 | 4 | unspecified |
| **sum of all 2** | **+12.35** | | | | |

_`points` sum to the signed score. NEGATIVE points mean that study pushed the score down. `w` is quality (design × RoB × size × funding × OA); `s` is what it found (+1.0 meaningful benefit, +0.3 trivial/unsized, −0.7 null, −1.0 harm). The two are separate on purpose: how good a study is and what it found are different facts._

## Database snapshot (`creatine`)

### `pilot_creatine_supp.sqlite`

Studies stored (corpus): **455** · ECUs: **0** · syntheses: **69
