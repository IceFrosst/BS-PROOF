# BS-PROOF summary report (claude-top5-per_o)

Generated: **2026-08-10 22:30 UTC**


scoring_model: v3-rob-known

Ingredient: `creatine` · Form: `creatine_monohydrate` · Mode: **claude-top5-per_o**

Auto-written after every extraction (no extra steps).

Full audit: matching `*_full.md` in `reports/runs/`.

## This run — extraction stats

- Targeted studies: **150**
- Succeeded (usable): **144**
- Skipped (no text): **6**
- Partial agent failures: **2**
- Prompt version: `v1.12`
- Concurrency: 40  |  studies in flight: 40

## Token + cost accounting

- Extraction backend: **Claude subscription** (`--safe-mode`, `--max-turns 1`, one shot per call)
- Model calls: **9** (cache hits 848, failures 8)
- Input tokens: **1,265,568** (fresh 12 · cache-write 0 · cache-read 1,265,556)
- Output tokens: **3,839**
- **Spent on this run: $0.00** — subscription, not metered.
- **API-equivalent cost: $0.441** — what the same work would cost billed per token.
- Per study: **0.1 calls**, **$0.0031** API-equivalent across 144 scored studies.

| Agent | Tier | Model | Calls | Cache hits | Fail | In | Out | API-equiv |
|---|---|---|--:|--:|--:|--:|--:|--:|
| S3 | B | `claude-sonnet-5` | 9 | 141 | 8 | 1,265,568 | 3,839 | $0.441 |
| S4 | B | `claude-sonnet-5` | 0 | 144 | 0 | 0 | 0 | $0.000 |
| S5 | B | `claude-sonnet-5` | 0 | 144 | 0 | 0 | 0 | $0.000 |
| S6B | C | `claude-sonnet-5` | 0 | 131 | 0 | 0 | 0 | $0.000 |
| S7 | B | `claude-sonnet-5` | 0 | 144 | 0 | 0 | 0 | $0.000 |
| S8 | A | `claude-haiku-4-5-20251001` | 0 | 144 | 0 | 0 | 0 | $0.000 |

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
| muscle_power | 21 | does not work | -0.08 @ 100% | -0.09 @ 68% | not tested | 64% | 15 |
| muscle_strength | 19 | does not work | +0.08 @ 100% | -0.14 @ 42% | not tested | 55% | 17 |
| lean_body_mass | 11 | works, but not tested for your product | +0.45 @ 100% | -0.35 @ 23% | not tested | 28% | 8 |
| exercise_endurance | 2 | barely studied | -0.48 @ 100% | -0.70 @ 16% | not tested | 14% | 4 |
| energy_levels | gated | not enough human evidence | not tested | not tested | not tested | not tested | 0 |

_0–100 = 100 × c × mean(effect, form, dose). Each arc shows its verdict and the share of evidence behind it. A low number with a FULL evidence arc means 'does not work'; with an EMPTY one it means 'barely studied'._


_Old rows from previous runs are not shown here._

## Database snapshot (`creatine`)

### `pilot_creatine_supp.sqlite`

Studies stored (corpus): **200** · ECUs: **0** · syntheses: **50
