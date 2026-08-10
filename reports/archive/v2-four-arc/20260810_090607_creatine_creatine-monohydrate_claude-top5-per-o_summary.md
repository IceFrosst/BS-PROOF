# BS-PROOF summary report (claude-top5-per_o)

Generated: **2026-08-10 09:06 UTC**


scoring_model: v2-four-arc

Ingredient: `creatine` · Form: `creatine_monohydrate` · Mode: **claude-top5-per_o**

Auto-written after every extraction (no extra steps).

Full audit: matching `*_full.md` in `reports/runs/`.

## This run — extraction stats

- Targeted studies: **69**
- Succeeded (usable): **46**
- Skipped (no text): **23**
- Partial agent failures: **1**
- Prompt version: `v1.10`
- Concurrency: 40  |  studies in flight: 40

## Token + cost accounting

- Extraction backend: **Claude subscription** (`--safe-mode`, `--max-turns 1`, one shot per call)
- Model calls: **90** (cache hits 191, failures 11)
- Input tokens: **378,109** (fresh 22,585 · cache-write 156,790 · cache-read 198,734)
- Output tokens: **81,895**
- **Spent on this run: $0.00** — subscription, not metered.
- **API-equivalent cost: $2.016** — what the same work would cost billed per token.
- Per study: **2.0 calls**, **$0.0438** API-equivalent across 46 scored studies.

| Agent | Tier | Model | Calls | Cache hits | Fail | In | Out | API-equiv |
|---|---|---|--:|--:|--:|--:|--:|--:|
| S3 | B | `claude-sonnet-5` | 12 | 35 | 1 | 49,574 | 6,580 | $0.183 |
| S4 | B | `claude-sonnet-5` | 20 | 30 | 4 | 95,020 | 7,560 | $0.447 |
| S5 | B | `claude-sonnet-5` | 12 | 35 | 1 | 53,270 | 4,305 | $0.241 |
| S6B | C | `claude-sonnet-5` | 17 | 24 | 0 | 59,245 | 16,567 | $0.421 |
| S7 | B | `claude-sonnet-5` | 18 | 32 | 5 | 98,573 | 6,859 | $0.493 |
| S8 | A | `claude-haiku-4-5-20251001` | 11 | 35 | 0 | 22,427 | 40,024 | $0.232 |

Tier → model is pinned in `claude_adapter.TIER_MODEL` (full ids, never aliases: an alias floats to a new model while the cache key does not change). Tier A = classification, B = extraction, C = the highest-risk agent.

## Predatory journal check (flag only — not in score)

- List entries loaded: **1162**
- Studies checked: **1614**
- Publisher resolved for: **0/1614** (the list is PUBLISHERS, so this is the real coverage)
- Studies flagged predatory: **0**
- Distinct publishers flagged: **0**
- Distinct journals flagged: **0**
- Affects score: **NO (count only)**
- **NOT CHECKED at publisher level** — 0 flagged above is an absence of data, not a clean corpus.

## Systematic reviews / meta-analyses (S2)

- Requested (cap): **0**
- S2 extractions ok: **0**
- Resolved for multiplier: **0**
_SRs never add patients; only a capped confidence boost (≤ +30%)._

## ECU scores — this run only

| Outcome | 0–100 | Verdict | effect | in your form | at your dose | evidence | n |
|---|---:|---|---|---|---|---|---:|
| muscle_power | 5 | does not work | -0.29 @ 100% | -0.34 @ 86% | not tested | 22% | 7 |
| muscle_strength | 4 | barely studied | -0.12 @ 100% | -0.11 @ 80% | not tested | 14% | 4 |
| energy_levels | 0 | barely studied | -0.70 @ 100% | -0.70 @ 100% | not tested | 2% | 1 |
| lean_body_mass | 0 | barely studied | -0.70 @ 100% | -0.70 @ 77% | not tested | 4% | 2 |
| exercise_endurance | 0 | barely studied | -0.70 @ 100% | -0.70 @ 100% | not tested | 2% | 1 |

_0–100 = 100 × c × mean(effect, form, dose). Each arc shows its verdict and the share of evidence behind it. A low number with a FULL evidence arc means 'does not work'; with an EMPTY one it means 'barely studied'._


_Old rows from previous runs are not shown here._

## Database snapshot (`creatine`)

### `pilot_creatine_supp.sqlite`

Studies stored (corpus): **200** · ECUs: **0** · syntheses: **50
