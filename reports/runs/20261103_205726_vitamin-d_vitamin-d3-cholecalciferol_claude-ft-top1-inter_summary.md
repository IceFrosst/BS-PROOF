# BS-PROOF summary report (claude-ft-top1-inter)

Generated: **2026-11-03 20:57 UTC**


scoring_model: evidence-v2

Ingredient: `vitamin_d` · Form: `vitamin_d3_cholecalciferol` · Mode: **claude-ft-top1-inter**

Auto-written after every extraction (no extra steps).

Full audit: matching `*_full.md` in `reports/runs/`.

## This run — extraction stats

- Outcome screen (`--outcome muscle_strength`): **71** studies name it in title or abstract; 553 dropped (3 had no abstract). A trial that measured it without naming it is missed; see the benchmark coverage.
- Targeted studies: **71**
- Succeeded (usable): **34**
- Skipped (no text): **37**
- Partial agent failures: **1**
- Prompt version: `v1.39`
- Concurrency: 40  |  studies in flight: 40

## Token + cost accounting

- Extraction backend: **Claude subscription** (`--safe-mode`, `--max-turns 1`, one shot per call)
- Model calls: **224** (cache hits 25, failures 8)
- Input tokens: **2,746,562** (fresh 71,551 · cache-write 1,741,448 · cache-read 933,563)
- Output tokens: **290,665**
- **Spent on this run: $0.00** — subscription, not metered.
- **API-equivalent cost: $11.401** — what the same work would cost billed per token.
- Per study: **6.6 calls**, **$0.3353** API-equivalent across 34 scored studies.

| Agent | Tier | Model | Calls | Cache hits | Fail | In | Out | API-equiv |
|---|---|---|--:|--:|--:|--:|--:|--:|
| S3 | B | `claude-sonnet-5` | 32 | 3 | 1 | 466,213 | 27,058 | $1.549 |
| S4 | B | `claude-sonnet-5` | 31 | 4 | 1 | 406,458 | 19,240 | $1.426 |
| S4R | R | `claude-opus-5` | 5 | 1 | 0 | 71,696 | 6,323 | $0.725 |
| S5 | B | `claude-sonnet-5` | 36 | 3 | 6 | 592,879 | 91,202 | $2.434 |
| S5N | B | `claude-sonnet-5` | 19 | 3 | 0 | 362,978 | 26,928 | $1.216 |
| S5R | R | `claude-opus-5` | 11 | 1 | 0 | 210,262 | 15,060 | $1.866 |
| S6B | C | `claude-sonnet-5` | 29 | 3 | 0 | 160,794 | 36,189 | $0.631 |
| S7 | B | `claude-sonnet-5` | 31 | 3 | 0 | 385,831 | 19,091 | $1.198 |
| S8 | A | `claude-haiku-4-5-20251001` | 30 | 4 | 0 | 89,451 | 49,574 | $0.356 |

Tier → model is pinned in `claude_adapter.TIER_MODEL` (full ids, never aliases: an alias floats to a new model while the cache key does not change). Tier A = classification, B = extraction, C = the highest-risk agent.

## Predatory journal check (flag only — not in score)

- List entries loaded: **1162**
- Studies checked: **3162**
- Publisher resolved for: **2348/3162** (the list is PUBLISHERS, so this is the real coverage)
- Studies flagged predatory: **21**
- Distinct publishers flagged: **5**
- Distinct journals flagged: **0**
- Affects score: **NO (count only)**
  - [publisher] AME Publishing Company
  - [publisher] Baishideng Publishing Group Inc.
  - [publisher] Canadian Center of Science and Education
  - [publisher] Frontiers Media SA
  - [publisher] Science Alert

## Evidence grades — this run (`evidence-v2`, status `shadow`)

Population: `general_adult` · registry checked: **yes**

| Outcome | Grade | Benefit | Certainty | k | SMD [95% CI] | I² | refused |
|---|---|---|---|--:|---|--:|--:|
| muscle_strength | **C-** | possible | Moderate | 2 | +0.06 [-0.11, +0.22] | 0% | 18 |

Why trials were refused (all outcomes):

- 8 × study: off-target population
- 5 × study: no_isolated_ingredient_arm
- 2 × study: no_ingredient_free_arm
- 1 × no outcome values in the text read (figure-only or not reported)
- 1 × favoured arm is unstated; sign unknown; figure: no figure caption names this measure
- 1 × figure: no figure caption names this measure
