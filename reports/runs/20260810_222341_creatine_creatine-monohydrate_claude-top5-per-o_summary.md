# BS-PROOF summary report (claude-top5-per_o)

Generated: **2026-08-10 22:23 UTC**


scoring_model: v3-rob-known

Ingredient: `creatine` · Form: `creatine_monohydrate` · Mode: **claude-top5-per_o**

Auto-written after every extraction (no extra steps).

Full audit: matching `*_full.md` in `reports/runs/`.

## This run — extraction stats

- Targeted studies: **150**
- Succeeded (usable): **144**
- Skipped (no text): **6**
- Partial agent failures: **3**
- Prompt version: `v1.12`
- Concurrency: 40  |  studies in flight: 40

## Token + cost accounting

- Extraction backend: **Claude subscription** (`--safe-mode`, `--max-turns 1`, one shot per call)
- Model calls: **26** (cache hits 835, failures 13)
- Input tokens: **939,542** (fresh 2,287 · cache-write 47,598 · cache-read 889,657)
- Output tokens: **16,875**
- **Spent on this run: $0.00** — subscription, not metered.
- **API-equivalent cost: $3.323** — what the same work would cost billed per token.
- Per study: **0.2 calls**, **$0.0231** API-equivalent across 144 scored studies.

| Agent | Tier | Model | Calls | Cache hits | Fail | In | Out | API-equiv |
|---|---|---|--:|--:|--:|--:|--:|--:|
| S3 | B | `claude-sonnet-5` | 9 | 141 | 9 | 848,715 | 3,410 | $2.822 |
| S4 | B | `claude-sonnet-5` | 10 | 137 | 3 | 56,974 | 5,212 | $0.274 |
| S5 | B | `claude-sonnet-5` | 1 | 143 | 0 | 4,435 | 788 | $0.039 |
| S6B | C | `claude-sonnet-5` | 1 | 130 | 0 | 3,865 | 732 | $0.035 |
| S7 | B | `claude-sonnet-5` | 4 | 141 | 1 | 23,308 | 1,969 | $0.125 |
| S8 | A | `claude-haiku-4-5-20251001` | 1 | 143 | 0 | 2,245 | 4,764 | $0.027 |

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
