# BS-PROOF summary report (claude-top5-broad)

Generated: **2026-08-19 06:52 UTC**


scoring_model: v12-dose-closeness

Ingredient: `creatine` · Form: `creatine_monohydrate` · Mode: **claude-top5-broad**

Auto-written after every extraction (no extra steps).

Full audit: matching `*_full.md` in `reports/runs/`.

## This run — extraction stats

- Targeted studies: **71**
- Succeeded (usable): **71**
- Skipped (no text): **0**
- Partial agent failures: **7**
- Prompt version: `v1.21`
- Concurrency: 40  |  studies in flight: 40

## Token + cost accounting

- Extraction backend: **Claude subscription** (`--safe-mode`, `--max-turns 1`, one shot per call)
- Model calls: **106** (cache hits 369, failures 62)
- Input tokens: **unavailable** (not recorded for every call)
- Output tokens: **unavailable** (not recorded for every call)
- **Spent on this run: $0.00** — subscription, not metered.
- **API-equivalent cost: unavailable** — what the same work would cost billed per token.
- Per study: **1.5 calls**, **unavailable** API-equivalent across 71 scored studies.

| Agent | Tier | Model | Calls | Cache hits | Fail | In | Out | API-equiv |
|---|---|---|--:|--:|--:|--:|--:|--:|
| S3 | B | `claude-sonnet-5` | 30 | 59 | 23 | unavailable | unavailable | unavailable |
| S4 | B | `claude-sonnet-5` | 16 | 64 | 10 | 24,451 | 2,184 | $0.125 |
| S5 | B | `claude-sonnet-5` | 24 | 62 | 16 | 1,601,140 | 5,606 | $9.736 |
| S6B | C | `claude-sonnet-5` | 24 | 49 | 8 | unavailable | unavailable | unavailable |
| S7 | B | `claude-sonnet-5` | 5 | 68 | 2 | 16,011 | 1,096 | $0.081 |
| S8 | A | `claude-haiku-4-5-20251001` | 7 | 67 | 3 | 14,498 | 8,315 | $0.072 |

Tier → model is pinned in `claude_adapter.TIER_MODEL` (full ids, never aliases: an alias floats to a new model while the cache key does not change). Tier A = classification, B = extraction, C = the highest-risk agent.

## Predatory journal check (flag only — not in score)

- List entries loaded: **1162**
- Studies checked: **595**
- Publisher resolved for: **398/595** (the list is PUBLISHERS, so this is the real coverage)
- Studies flagged predatory: **6**
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
| muscle_power | 35 | probably does not work | +0.02 @ 100% | 0.80 (pooled +0.26 @ 61%) | not tested | 77% | 7 |
| lean_body_mass | 25 | probably does not work | -0.04 @ 100% | 0.80 (pooled +0.00 @ 64%) | not tested | 56% | 6 |
| muscle_strength | 22 | does not work | -0.10 @ 100% | 0.80 (pooled -0.14 @ 73%) | not tested | 51% | 6 |
| energy_levels | 17 | works, but not tested for your product | +0.38 @ 100% | 0.80 (pooled +0.30 @ 72%) | not tested | 33% | 2 |
| exercise_endurance | 14 | works, but not tested for your product | +0.51 @ 100% | 0.80 (pooled +0.51 @ 100%) | not tested | 25% | 2 |

_0–100 = 100 × c × mean(effect, form, dose). Each arc shows its verdict and the share of evidence behind it. A low number with a FULL evidence arc means 'does not work'; with an EMPTY one it means 'barely studied'._


_Old rows from previous runs are not shown here._

## Which studies made each number

### muscle_power — signed +2

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:103390nu15163567` | +10.17 | 0.3089 | 1.0 | 4 | exact |
| `doi:101038s4159802644278x` | +5.27 | 0.5334 | 0.3 | 4 | exact |
| `doi:103390nu16152437` | -5.00 | 0.4341 | -0.35 | 4 | unspecified |
| `doi:103390nu16091324` | -4.00 | 0.3473 | -0.35 | 4 | exact |
| `registry:nct04048616` | -3.04 | 0.264 | -0.35 | 4 | unspecified |
| `doi:103390nu16060766` | -1.69 | 0.147 | -0.35 | 4 | different |
| `doi:101111sms14629` | +0.00 | 0.1553 | 0.0 | 4 | exact |
| **sum of all 7** | **+1.71** | | | | |

### lean_body_mass — signed -2

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `registry:nct04048616` | -4.15 | 0.264 | -0.35 | 4 | unspecified |
| `doi:1033549physiolres935323` | +2.16 | 0.1602 | 0.3 | 4 | different |
| `registry:isrctn83081058` | +1.38 | 0.1025 | 0.3 | 4 | exact |
| `doi:1010801939021120252518408` | -1.25 | 0.0796 | -0.35 | 4 | exact |
| `doi:101016jjsams202409002` | -0.35 | 0.022 | -0.35 | 4 | unspecified |
| `doi:101249mss0000000000003202` | +0.00 | 0.6 | 0.0 | 4 | exact |
| **sum of all 6** | **-2.21** | | | | |

### muscle_strength — signed -5

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:101249mss0000000000003202` | -5.40 | 0.6 | -0.19148936170212766 | 4 | exact |
| `doi:1033549physiolres935323` | +2.26 | 0.1602 | 0.3 | 4 | different |
| `doi:103390nu16162772` | -1.76 | 0.1074 | -0.35 | 4 | unspecified |
| `registry:isrctn83081058` | +1.44 | 0.1025 | 0.3 | 4 | exact |
| `doi:1010801939021120252518408` | -1.31 | 0.0796 | -0.35 | 4 | exact |
| `doi:101016jjsams202409002` | -0.36 | 0.022 | -0.35 | 4 | unspecified |
| **sum of all 6** | **-5.13** | | | | |

### energy_levels — signed +12

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:103390nu17111772` | +7.10 | 0.4326 | 0.3 | 4 | exact |
| `doi:103390nu18081192` | +5.25 | 0.1645 | 0.5833333333333334 | 4 | unspecified |
| **sum of all 2** | **+12.35** | | | | |

### exercise_endurance — signed +11

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:103390nu17243831` | +14.14 | 0.2751 | 1.0 | 4 | exact |
| `doi:101111sms14629` | -2.79 | 0.1553 | -0.35 | 4 | exact |
| **sum of all 2** | **+11.35** | | | | |

_`points` sum to the signed score. NEGATIVE points mean that study pushed the score down. `w` is quality (design × RoB × size × funding × OA); `s` is what it found (+1.0 meaningful benefit, +0.3 trivial/unsized, −0.7 null, −1.0 harm). The two are separate on purpose: how good a study is and what it found are different facts._

## Database snapshot (`creatine`)

### `pilot_creatine_supp.sqlite`

Studies stored (corpus): **455** · ECUs: **0** · syntheses: **69
