# BS-PROOF summary report (claude-top5-per_o)

Generated: **2026-08-10 09:56 UTC**


scoring_model: v2-four-arc

Ingredient: `creatine` · Form: `creatine_monohydrate` · Mode: **claude-top5-per_o**

Auto-written after every extraction (no extra steps).

Full audit: matching `*_full.md` in `reports/runs/`.

## This run — extraction stats

- Targeted studies: **150**
- Succeeded (usable): **143**
- Skipped (no text): **7**
- Partial agent failures: **0**
- Prompt version: `v1.11`
- Concurrency: 40  |  studies in flight: 40

## Token + cost accounting

- Extraction backend: **Claude subscription** (`--safe-mode`, `--max-turns 1`, one shot per call)
- Model calls: **12** (cache hits 838, failures 4)
- Input tokens: **62,024** (fresh 24 · cache-write 0 · cache-read 62,000)
- Output tokens: **5,491**
- **Spent on this run: $0.00** — subscription, not metered.
- **API-equivalent cost: $0.135** — what the same work would cost billed per token.
- Per study: **0.1 calls**, **$0.0009** API-equivalent across 143 scored studies.

| Agent | Tier | Model | Calls | Cache hits | Fail | In | Out | API-equiv |
|---|---|---|--:|--:|--:|--:|--:|--:|
| S3 | B | `claude-sonnet-5` | 0 | 143 | 0 | 0 | 0 | $0.000 |
| S4 | B | `claude-sonnet-5` | 9 | 138 | 4 | 41,424 | 3,665 | $0.088 |
| S5 | B | `claude-sonnet-5` | 0 | 143 | 0 | 0 | 0 | $0.000 |
| S6B | C | `claude-sonnet-5` | 0 | 131 | 0 | 0 | 0 | $0.000 |
| S7 | B | `claude-sonnet-5` | 3 | 140 | 0 | 20,600 | 1,826 | $0.047 |
| S8 | A | `claude-haiku-4-5-20251001` | 0 | 143 | 0 | 0 | 0 | $0.000 |

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
| muscle_strength | 14 | does not work | -0.21 @ 100% | -0.31 @ 34% | not tested | 52% | 27 |
| muscle_power | 11 | does not work | -0.22 @ 100% | -0.35 @ 51% | not tested | 44% | 18 |
| lean_body_mass | 7 | does not work | +0.09 @ 100% | -0.28 @ 26% | not tested | 22% | 10 |
| exercise_endurance | 3 | does not work | -0.57 @ 100% | -0.70 @ 52% | not tested | 22% | 11 |
| energy_levels | gated | not enough human evidence | not tested | not tested | not tested | not tested | 0 |

_0–100 = 100 × c × mean(effect, form, dose). Each arc shows its verdict and the share of evidence behind it. A low number with a FULL evidence arc means 'does not work'; with an EMPTY one it means 'barely studied'._


_Old rows from previous runs are not shown here._

## Database snapshot (`creatine`)

### `pilot_creatine_supp.sqlite`

Studies stored (corpus): **200** · ECUs: **0** · syntheses: **50
