# BS-PROOF summary report (claude-top5-per_o)

Generated: **2026-08-10 00:06 UTC**


scoring_model: v2-four-arc

Ingredient: `creatine` · Form: `creatine_monohydrate` · Mode: **claude-top5-per_o**

Auto-written after every extraction (no extra steps).

Full audit: matching `*_full.md` in `reports/runs/`.

## This run — extraction stats

- Targeted studies: **80**
- Succeeded (usable): **80**
- Skipped (no text): **0**
- Partial agent failures: **41**
- Prompt version: `v1.10`
- Concurrency: 40  |  studies in flight: 40

## Token + cost accounting

- Extraction backend: **Claude subscription** (`--safe-mode`, `--max-turns 1`, one shot per call)
- Model calls: **493** (cache hits 0, failures 214)
- Input tokens: **1,470,304** (fresh 111,019 · cache-write 70,192 · cache-read 1,289,093)
- Output tokens: **253,962**
- **Spent on this run: $0.00** — subscription, not metered.
- **API-equivalent cost: $4.262** — what the same work would cost billed per token.
- Per study: **6.2 calls**, **$0.0533** API-equivalent across 80 scored studies.

| Agent | Tier | Model | Calls | Cache hits | Fail | In | Out | API-equiv |
|---|---|---|--:|--:|--:|--:|--:|--:|
| S3 | B | `claude-sonnet-5` | 83 | 0 | 32 | 228,204 | 32,114 | $0.828 |
| S4 | B | `claude-sonnet-5` | 97 | 0 | 49 | 344,490 | 24,400 | $0.654 |
| S5 | B | `claude-sonnet-5` | 86 | 0 | 34 | 280,970 | 36,544 | $0.743 |
| S6B | C | `claude-sonnet-5` | 50 | 0 | 24 | 90,237 | 17,200 | $0.493 |
| S7 | B | `claude-sonnet-5` | 97 | 0 | 49 | 415,928 | 29,608 | $0.816 |
| S8 | A | `claude-haiku-4-5-20251001` | 80 | 0 | 26 | 110,475 | 114,096 | $0.728 |

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
| muscle_strength | 6 | barely studied | +0.30 @ 100% | +0.30 @ 50% | not tested | 13% | 3 |
| muscle_power | 3 | barely studied | -0.19 @ 100% | -0.19 @ 100% | not tested | 11% | 2 |
| lean_body_mass | 2 | barely studied | -0.15 @ 100% | -0.70 @ 35% | not tested | 9% | 3 |
| energy_levels | gated | not enough human evidence | not tested | not tested | not tested | not tested | 0 |
| exercise_endurance | gated | not enough human evidence | not tested | not tested | not tested | not tested | 0 |

_0–100 = 100 × c × mean(effect, form, dose). Each arc shows its verdict and the share of evidence behind it. A low number with a FULL evidence arc means 'does not work'; with an EMPTY one it means 'barely studied'._


_Old rows from previous runs are not shown here._

## Database snapshot (`creatine`)

### `pilot_creatine_supp.sqlite`

Studies stored (corpus): **200** · ECUs: **0** · syntheses: **50
