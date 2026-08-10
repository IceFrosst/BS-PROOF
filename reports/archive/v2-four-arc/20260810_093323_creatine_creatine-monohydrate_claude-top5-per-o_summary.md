# BS-PROOF summary report (claude-top5-per_o)

Generated: **2026-08-10 09:33 UTC**


scoring_model: v2-four-arc

Ingredient: `creatine` · Form: `creatine_monohydrate` · Mode: **claude-top5-per_o**

Auto-written after every extraction (no extra steps).

Full audit: matching `*_full.md` in `reports/runs/`.

## This run — extraction stats

- Targeted studies: **150**
- Succeeded (usable): **143**
- Skipped (no text): **7**
- Partial agent failures: **3**
- Prompt version: `v1.10`
- Concurrency: 40  |  studies in flight: 40

## Token + cost accounting

- Extraction backend: **Claude subscription** (`--safe-mode`, `--max-turns 1`, one shot per call)
- Model calls: **550** (cache hits 347, failures 50)
- Input tokens: **2,153,283** (fresh 163,074 · cache-write 708,320 · cache-read 1,281,889)
- Output tokens: **397,309**
- **Spent on this run: $0.00** — subscription, not metered.
- **API-equivalent cost: $9.905** — what the same work would cost billed per token.
- Per study: **3.8 calls**, **$0.0693** API-equivalent across 143 scored studies.

| Agent | Tier | Model | Calls | Cache hits | Fail | In | Out | API-equiv |
|---|---|---|--:|--:|--:|--:|--:|--:|
| S3 | B | `claude-sonnet-5` | 84 | 60 | 1 | 351,785 | 47,337 | $1.203 |
| S4 | B | `claude-sonnet-5` | 109 | 61 | 29 | 435,442 | 39,619 | $1.782 |
| S5 | B | `claude-sonnet-5` | 84 | 61 | 2 | 354,679 | 44,342 | $1.505 |
| S6B | C | `claude-sonnet-5` | 92 | 43 | 0 | 317,907 | 70,994 | $1.910 |
| S7 | B | `claude-sonnet-5` | 101 | 59 | 18 | 487,477 | 36,843 | $2.352 |
| S8 | A | `claude-haiku-4-5-20251001` | 80 | 63 | 0 | 205,993 | 158,174 | $1.153 |

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
| muscle_strength | 13 | does not work | -0.25 @ 100% | -0.37 @ 38% | not tested | 52% | 25 |
| muscle_power | 11 | does not work | -0.34 @ 100% | -0.37 @ 46% | not tested | 48% | 20 |
| exercise_endurance | 7 | does not work | -0.24 @ 100% | -0.03 @ 54% | not tested | 25% | 12 |
| lean_body_mass | 5 | does not work | -0.18 @ 100% | -0.61 @ 28% | not tested | 24% | 13 |
| energy_levels | 0 | barely studied | -0.70 @ 100% | -0.70 @ 100% | not tested | 2% | 1 |

_0–100 = 100 × c × mean(effect, form, dose). Each arc shows its verdict and the share of evidence behind it. A low number with a FULL evidence arc means 'does not work'; with an EMPTY one it means 'barely studied'._


_Old rows from previous runs are not shown here._

## Database snapshot (`creatine`)

### `pilot_creatine_supp.sqlite`

Studies stored (corpus): **200** · ECUs: **0** · syntheses: **50
