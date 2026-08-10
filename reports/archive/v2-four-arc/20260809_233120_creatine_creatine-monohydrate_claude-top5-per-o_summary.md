# BS-PROOF summary report (claude-top5-per_o)

Generated: **2026-08-09 23:31 UTC**


scoring_model: v2-four-arc

Ingredient: `creatine` · Form: `creatine_monohydrate` · Mode: **claude-top5-per_o**

Auto-written after every extraction (no extra steps).

Full audit: matching `*_full.md` in `reports/runs/`.

## This run — extraction stats

- Targeted studies: **80**
- Succeeded (usable): **80**
- Skipped (no text): **0**
- Partial agent failures: **3**
- Prompt version: `v1.9`
- Concurrency: 40  |  studies in flight: 40

## Token + cost accounting

- Extraction backend: **Claude subscription** (`--safe-mode`, `--max-turns 1`, one shot per call)
- Model calls: **5** (cache hits 469, failures 3)
- Input tokens: **9,454** (fresh 4 · cache-write 0 · cache-read 9,450)
- Output tokens: **844**
- **Spent on this run: $0.00** — subscription, not metered.
- **API-equivalent cost: $0.021** — what the same work would cost billed per token.
- Per study: **0.1 calls**, **$0.0003** API-equivalent across 80 scored studies.

| Agent | Tier | Model | Calls | Cache hits | Fail | In | Out | API-equiv |
|---|---|---|--:|--:|--:|--:|--:|--:|
| S3 | B | `-` | 0 | 80 | 0 | 0 | 0 | $0.000 |
| S4 | B | `claude-sonnet-5` | 1 | 79 | 0 | 3,305 | 299 | $0.007 |
| S5 | B | `-` | 0 | 80 | 0 | 0 | 0 | $0.000 |
| S6B | C | `-` | 0 | 74 | 0 | 0 | 0 | $0.000 |
| S7 | B | `claude-sonnet-5` | 4 | 76 | 3 | 6,149 | 545 | $0.014 |
| S8 | A | `-` | 0 | 80 | 0 | 0 | 0 | $0.000 |

Tier → model is pinned in `claude_adapter.TIER_MODEL` (full ids, never aliases: an alias floats to a new model while the cache key does not change). Tier A = classification, B = extraction, C = the highest-risk agent.

## Predatory journal check (flag only — not in score)

- List entries loaded: **1162**
- Studies checked: **144**
- Publisher resolved for: **136/144** (the list is PUBLISHERS, so this is the real coverage)
- Studies flagged predatory: **1**
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
| muscle_strength | 26 | probably does not work | -0.11 @ 100% | -0.09 @ 58% | -0.11 @ 100% | 58% | 18 |
| muscle_power | 21 | does not work | -0.31 @ 100% | -0.28 @ 46% | -0.31 @ 100% | 61% | 21 |
| exercise_endurance | 11 | does not work | -0.28 @ 100% | -0.38 @ 83% | -0.28 @ 100% | 32% | 7 |
| lean_body_mass | 6 | does not work | -0.37 @ 100% | -0.70 @ 52% | not tested | 34% | 13 |
| energy_levels | 0 | barely studied | -0.70 @ 100% | -0.70 @ 100% | not tested | 5% | 1 |

_0–100 = 100 × c × mean(effect, form, dose). Each arc shows its verdict and the share of evidence behind it. A low number with a FULL evidence arc means 'does not work'; with an EMPTY one it means 'barely studied'._


_Old rows from previous runs are not shown here._

## Database snapshot (`creatine`)

### `pilot_creatine_supp.sqlite`

Studies stored (corpus): **200** · ECUs: **0** · syntheses: **50
