# BS-PROOF summary report (claude-top5-per_o)

Generated: **2026-08-09 23:22 UTC**


scoring_model: v2-four-arc

Ingredient: `creatine` · Form: `creatine_monohydrate` · Mode: **claude-top5-per_o**

Auto-written after every extraction (no extra steps).

Full audit: matching `*_full.md` in `reports/runs/`.

## This run — extraction stats

- Targeted studies: **80**
- Succeeded (usable): **80**
- Skipped (no text): **0**
- Partial agent failures: **5**
- Prompt version: `v1.9`
- Concurrency: 40  |  studies in flight: 40

## Token + cost accounting

- Extraction backend: **Claude subscription** (`--safe-mode`, `--max-turns 1`, one shot per call)
- Model calls: **474** (cache hits 0, failures 5)
- Input tokens: **1,975,904** (fresh 159,558 · cache-write 800,244 · cache-read 1,016,102)
- Output tokens: **383,921**
- **Spent on this run: $0.00** — subscription, not metered.
- **API-equivalent cost: $10.166** — what the same work would cost billed per token.
- Per study: **5.9 calls**, **$0.1271** API-equivalent across 80 scored studies.

| Agent | Tier | Model | Calls | Cache hits | Fail | In | Out | API-equiv |
|---|---|---|--:|--:|--:|--:|--:|--:|
| S3 | B | `claude-sonnet-5` | 80 | 0 | 0 | 337,114 | 45,523 | $1.607 |
| S4 | B | `claude-sonnet-5` | 80 | 0 | 1 | 383,680 | 31,458 | $1.845 |
| S5 | B | `claude-sonnet-5` | 80 | 0 | 0 | 373,649 | 46,197 | $1.640 |
| S6B | C | `claude-sonnet-5` | 74 | 0 | 0 | 256,396 | 62,967 | $1.654 |
| S7 | B | `claude-sonnet-5` | 80 | 0 | 4 | 441,710 | 31,268 | $2.291 |
| S8 | A | `claude-haiku-4-5-20251001` | 80 | 0 | 0 | 183,355 | 166,508 | $1.129 |

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
| muscle_power | 21 | does not work | -0.31 @ 100% | -0.28 @ 46% | -0.31 @ 100% | 61% | 21 |
| muscle_strength | 20 | does not work | -0.27 @ 100% | -0.36 @ 58% | -0.27 @ 100% | 58% | 18 |
| exercise_endurance | 11 | does not work | -0.30 @ 100% | -0.38 @ 83% | -0.30 @ 100% | 32% | 7 |
| lean_body_mass | 6 | does not work | -0.37 @ 100% | -0.70 @ 52% | not tested | 34% | 13 |
| energy_levels | 0 | barely studied | -0.70 @ 100% | -0.70 @ 100% | not tested | 5% | 1 |

_0–100 = 100 × c × mean(effect, form, dose). Each arc shows its verdict and the share of evidence behind it. A low number with a FULL evidence arc means 'does not work'; with an EMPTY one it means 'barely studied'._


_Old rows from previous runs are not shown here._

## Database snapshot (`creatine`)

### `pilot_creatine_supp.sqlite`

Studies stored (corpus): **200** · ECUs: **0** · syntheses: **50
