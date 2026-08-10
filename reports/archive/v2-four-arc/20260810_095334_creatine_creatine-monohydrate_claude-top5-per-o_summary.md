# BS-PROOF summary report (claude-top5-per_o)

Generated: **2026-08-10 09:53 UTC**


scoring_model: v2-four-arc

Ingredient: `creatine` · Form: `creatine_monohydrate` · Mode: **claude-top5-per_o**

Auto-written after every extraction (no extra steps).

Full audit: matching `*_full.md` in `reports/runs/`.

## This run — extraction stats

- Targeted studies: **150**
- Succeeded (usable): **143**
- Skipped (no text): **7**
- Partial agent failures: **8**
- Prompt version: `v1.11`
- Concurrency: 40  |  studies in flight: 40

## Token + cost accounting

- Extraction backend: **Claude subscription** (`--safe-mode`, `--max-turns 1`, one shot per call)
- Model calls: **934** (cache hits 0, failures 96)
- Input tokens: **3,911,176** (fresh 292,802 · cache-write 724,699 · cache-read 2,893,675)
- Output tokens: **697,635**
- **Spent on this run: $0.00** — subscription, not metered.
- **API-equivalent cost: $14.580** — what the same work would cost billed per token.
- Per study: **6.5 calls**, **$0.1020** API-equivalent across 143 scored studies.

| Agent | Tier | Model | Calls | Cache hits | Fail | In | Out | API-equiv |
|---|---|---|--:|--:|--:|--:|--:|--:|
| S3 | B | `claude-sonnet-5` | 146 | 0 | 3 | 613,344 | 84,413 | $1.788 |
| S4 | B | `claude-sonnet-5` | 183 | 0 | 45 | 818,671 | 69,930 | $2.548 |
| S5 | B | `claude-sonnet-5` | 153 | 0 | 10 | 718,951 | 78,955 | $2.662 |
| S6B | C | `claude-sonnet-5` | 132 | 0 | 1 | 453,566 | 89,204 | $2.507 |
| S7 | B | `claude-sonnet-5` | 177 | 0 | 37 | 971,565 | 70,658 | $3.089 |
| S8 | A | `claude-haiku-4-5-20251001` | 143 | 0 | 0 | 335,079 | 304,475 | $1.985 |

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
