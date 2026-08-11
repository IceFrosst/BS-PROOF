# BS-PROOF summary report (claude-top5-per_o)

Generated: **2026-08-11 10:02 UTC**


scoring_model: v6-form-ladder-per-study

Ingredient: `creatine` · Form: `creatine_monohydrate` · Mode: **claude-top5-per_o**

Auto-written after every extraction (no extra steps).

Full audit: matching `*_full.md` in `reports/runs/`.

## This run — extraction stats

- Targeted studies: **150**
- Succeeded (usable): **149**
- Skipped (no text): **1**
- Partial agent failures: **1**
- Prompt version: `v1.13`
- Concurrency: 40  |  studies in flight: 40

## Token + cost accounting

- Extraction backend: **Claude subscription** (`--safe-mode`, `--max-turns 1`, one shot per call)
- Model calls: **3** (cache hits 878, failures 3)
- Input tokens: **0** (fresh 0 · cache-write 0 · cache-read 0)
- Output tokens: **0**
- **Spent on this run: $0.00** — subscription, not metered.
- **API-equivalent cost: $0.000** — what the same work would cost billed per token.
- Per study: **0.0 calls**, **$0.0000** API-equivalent across 149 scored studies.

| Agent | Tier | Model | Calls | Cache hits | Fail | In | Out | API-equiv |
|---|---|---|--:|--:|--:|--:|--:|--:|
| S3 | B | `claude-sonnet-5` | 3 | 148 | 3 | 0 | 0 | $0.000 |
| S4 | B | `claude-sonnet-5` | 0 | 149 | 0 | 0 | 0 | $0.000 |
| S5 | B | `claude-sonnet-5` | 0 | 149 | 0 | 0 | 0 | $0.000 |
| S6B | C | `claude-sonnet-5` | 0 | 134 | 0 | 0 | 0 | $0.000 |
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
| muscle_strength | 40 | probably does not work | +0.10 @ 100% | 0.80 (pooled +0.02 @ 61%) | +0.10 @ 100% | 64% | 11 |
| muscle_power | 31 | probably does not work | -0.01 @ 100% | 0.80 (pooled -0.28 @ 39%) | not tested | 69% | 10 |
| lean_body_mass | 22 | does not work | -0.13 @ 100% | 0.80 (pooled +0.00 @ 21%) | not tested | 51% | 6 |
| exercise_endurance | 2 | does not work | -0.56 @ 100% | all negative (-0.70 @ 37%) | not tested | 23% | 4 |
| energy_levels | gated | not enough human evidence | not tested | not tested | not tested | not tested | 0 |

_0–100 = 100 × c × mean(effect, form, dose). Each arc shows its verdict and the share of evidence behind it. A low number with a FULL evidence arc means 'does not work'; with an EMPTY one it means 'barely studied'._


_Old rows from previous runs are not shown here._

## Which studies made each number

### muscle_strength — signed +6

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:101139apnm20140498` | +8.08 | 0.21 | 1.0 | 4 | unspecified |
| `doi:101007s1260300901248` | +5.06 | 0.4383 | 0.3 | 4 | exact |
| `doi:101519jsc0b013e318234eba1` | -4.77 | 0.1772 | -0.7 | 4 | exact |
| `doi:101136bjsm2005022558` | -4.19 | 0.1556 | -0.7 | 4 | unspecified |
| `doi:1010801939021120252518408` | -2.14 | 0.0796 | -0.7 | 4 | exact |
| `doi:1033549physiolres935323` | +1.85 | 0.1602 | 0.3 | 4 | exact |
| `doi:101007s0042101429030` | +0.96 | 0.0828 | 0.3 | 4 | unspecified |
| `doi:1023736s0022470718084062` | +0.80 | 0.069 | 0.3 | 4 | exact |
| `doi:103390nu10111640` | +0.00 | 0.05 | 0.0 | 4 | unspecified |
| `doi:103390nu9111169` | +0.00 | 0.05 | 0.0 | 4 | unspecified |
| `doi:103390nu8030143` | +0.00 | 0.05 | 0.0 | 4 | unspecified |
| **sum of all 11** | **+5.65** | | | | |

### muscle_power — signed -1

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:101519jsc0b013e318234eba1` | -4.65 | 0.1772 | -0.7 | 4 | exact |
| `doi:101136bjsm2005022558` | -4.08 | 0.1556 | -0.7 | 4 | unspecified |
| `doi:101519jsc0b013e3182a361a5` | +2.80 | 0.249 | 0.3 | 4 | unspecified |
| `doi:101519jsc0b013e3181a2ed11` | -2.54 | 0.097 | -0.7 | 4 | exact |
| `doi:101016jjsams201510005` | +2.19 | 0.195 | 0.3 | 4 | unspecified |
| `doi:103390nu12102961` | +1.83 | 0.1626 | 0.3 | 4 | unspecified |
| `doi:101186s12970021004077` | +1.80 | 0.1602 | 0.3 | 4 | unspecified |
| `pmid:25289715` | +1.02 | 0.0904 | 0.3 | 4 | unspecified |
| `pmid:23715246` | +0.74 | 0.0662 | 0.3 | 4 | unspecified |
| `doi:103390nu15163567` | +0.00 | 0.4118 | 0.0 | 4 | exact |
| **sum of all 10** | **-0.89** | | | | |

### lean_body_mass — signed -6

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:103390nu17061081` | -15.70 | 0.5398 | -0.7 | 4 | unspecified |
| `doi:1011770260106017737013` | +8.96 | 0.2156 | 1.0 | 4 | unspecified |
| `doi:101123ijsnem20160129` | -1.97 | 0.0677 | -0.7 | 4 | exact |
| `doi:101016jexger201608005` | +1.02 | 0.082 | 0.3 | 4 | unspecified |
| `doi:1010801939021120252518408` | +0.99 | 0.0796 | 0.3 | 4 | exact |
| `doi:1010801939021120211904085` | +0.99 | 0.0796 | 0.3 | 4 | exact |
| **sum of all 6** | **-5.71** | | | | |

### exercise_endurance — signed -13

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:101016jjsams201510005` | -7.72 | 0.195 | -0.7 | 4 | unspecified |
| `doi:1010801939021120252518408` | -3.15 | 0.0796 | -0.7 | 4 | exact |
| `doi:101123ijsnem20160129` | -2.68 | 0.0677 | -0.7 | 4 | exact |
| `doi:101113ep087886` | +0.97 | 0.0573 | 0.3 | 4 | unspecified |
| **sum of all 4** | **-12.58** | | | | |

_`points` sum to the signed score. NEGATIVE points mean that study pushed the score down. `w` is quality (design × RoB × size × funding × OA); `s` is what it found (+1.0 meaningful benefit, +0.3 trivial/unsized, −0.7 null, −1.0 harm). The two are separate on purpose: how good a study is and what it found are different facts._

## Database snapshot (`creatine`)

### `pilot_creatine_supp.sqlite`

Studies stored (corpus): **200** · ECUs: **0** · syntheses: **50
