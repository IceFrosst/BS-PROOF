# BS-PROOF summary report (claude-top5-per_o)

Generated: **2026-08-10 23:09 UTC**


scoring_model: v4-k15

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
- Model calls: **10** (cache hits 873, failures 5)
- Input tokens: **453,867** (fresh 14 · cache-write 0 · cache-read 453,853)
- Output tokens: **3,550**
- **Spent on this run: $0.00** — subscription, not metered.
- **API-equivalent cost: $0.212** — what the same work would cost billed per token.
- Per study: **0.1 calls**, **$0.0014** API-equivalent across 149 scored studies.

| Agent | Tier | Model | Calls | Cache hits | Fail | In | Out | API-equiv |
|---|---|---|--:|--:|--:|--:|--:|--:|
| S3 | B | `claude-sonnet-5` | 4 | 147 | 3 | 416,853 | 625 | $0.134 |
| S4 | B | `claude-sonnet-5` | 1 | 148 | 0 | 5,664 | 298 | $0.009 |
| S5 | B | `claude-sonnet-5` | 0 | 149 | 0 | 0 | 0 | $0.000 |
| S6B | C | `claude-sonnet-5` | 0 | 134 | 0 | 0 | 0 | $0.000 |
| S7 | B | `claude-sonnet-5` | 5 | 146 | 2 | 31,350 | 2,627 | $0.068 |
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
| muscle_strength | 34 | probably does not work | +0.10 @ 100% | +0.02 @ 61% | +0.10 @ 100% | 64% | 11 |
| muscle_power | 21 | does not work | -0.01 @ 100% | -0.28 @ 39% | not tested | 69% | 10 |
| lean_body_mass | 17 | does not work | -0.13 @ 100% | +0.00 @ 21% | not tested | 51% | 6 |
| exercise_endurance | 3 | does not work | -0.56 @ 100% | -0.70 @ 37% | not tested | 23% | 4 |
| energy_levels | gated | not enough human evidence | not tested | not tested | not tested | not tested | 0 |

_0–100 = 100 × c × mean(effect, form, dose). Each arc shows its verdict and the share of evidence behind it. A low number with a FULL evidence arc means 'does not work'; with an EMPTY one it means 'barely studied'._


_Old rows from previous runs are not shown here._

## Database snapshot (`creatine`)

### `pilot_creatine_supp.sqlite`

Studies stored (corpus): **200** · ECUs: **0** · syntheses: **50
