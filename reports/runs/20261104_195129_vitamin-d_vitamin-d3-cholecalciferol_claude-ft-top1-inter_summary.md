# BS-PROOF summary report (claude-ft-top1-inter)

Generated: **2026-11-04 19:51 UTC**


scoring_model: evidence-v2

Ingredient: `vitamin_d` · Form: `vitamin_d3_cholecalciferol` · Mode: **claude-ft-top1-inter**

Auto-written after every extraction (no extra steps).

Full audit: matching `*_full.md` in `reports/runs/`.

## This run — extraction stats

- Outcome screen (`--outcome muscle_strength`): **144** studies name it in title or abstract; 579 dropped (3 had no abstract). A trial that measured it without naming it is missed; see the benchmark coverage.
- Targeted studies: **144**
- Succeeded (usable): **54**
- Skipped (no text): **90**
- Partial agent failures: **0**
- Prompt version: `v1.39`
- Concurrency: 40  |  studies in flight: 40

## Token + cost accounting

- Extraction backend: **Claude subscription** (`--safe-mode`, `--max-turns 1`, one shot per call)
- Model calls: **133** (cache hits 241, failures 2)
- Input tokens: **1,860,160** (fresh 35,379 · cache-write 1,313,430 · cache-read 511,351)
- Output tokens: **207,547**
- **Spent on this run: $0.00** — subscription, not metered.
- **API-equivalent cost: $7.644** — what the same work would cost billed per token.
- Per study: **2.5 calls**, **$0.1416** API-equivalent across 54 scored studies.

| Agent | Tier | Model | Calls | Cache hits | Fail | In | Out | API-equiv |
|---|---|---|--:|--:|--:|--:|--:|--:|
| S3 | B | `claude-sonnet-5` | 20 | 34 | 0 | 361,754 | 17,590 | $1.323 |
| S4 | B | `claude-sonnet-5` | 20 | 34 | 0 | 333,288 | 14,325 | $1.250 |
| S4R | R | `claude-opus-5` | 2 | 6 | 0 | 27,493 | 1,856 | $0.291 |
| S5 | B | `claude-sonnet-5` | 23 | 33 | 2 | 481,705 | 65,889 | $1.937 |
| S5N | B | `claude-sonnet-5` | 8 | 22 | 0 | 192,454 | 17,242 | $0.756 |
| S5R | R | `claude-opus-5` | 2 | 12 | 0 | 39,150 | 5,555 | $0.475 |
| S6B | C | `claude-sonnet-5` | 18 | 32 | 0 | 103,078 | 28,448 | $0.478 |
| S7 | B | `claude-sonnet-5` | 20 | 34 | 0 | 251,577 | 13,878 | $0.816 |
| S8 | A | `claude-haiku-4-5-20251001` | 20 | 34 | 0 | 69,661 | 42,764 | $0.318 |

Tier → model is pinned in `claude_adapter.TIER_MODEL` (full ids, never aliases: an alias floats to a new model while the cache key does not change). Tier A = classification, B = extraction, C = the highest-risk agent.

## Predatory journal check (flag only — not in score)

- List entries loaded: **1162**
- Studies checked: **3262**
- Publisher resolved for: **2470/3262** (the list is PUBLISHERS, so this is the real coverage)
- Studies flagged predatory: **23**
- Distinct publishers flagged: **6**
- Distinct journals flagged: **0**
- Affects score: **NO (count only)**
  - [publisher] AME Publishing Company
  - [publisher] Baishideng Publishing Group Inc.
  - [publisher] Canadian Center of Science and Education
  - [publisher] Frontiers Media SA
  - [publisher] Impact Journals, LLC
  - [publisher] Science Alert

## Evidence grades — this run (`evidence-v2`, status `shadow`)

Population: `general_adult` · registry checked: **yes**

| Outcome | Grade | Benefit | Certainty | k | SMD [95% CI] | I² | refused |
|---|---|---|---|--:|---|--:|--:|
| muscle_strength | **I** | inconclusive | Low | 3 | +0.08 [-0.26, +0.42] | 0% | 25 |

Why trials were refused (all outcomes):

- 8 × study: off-target population
- 7 × study: no_isolated_ingredient_arm
- 7 × study: no_ingredient_free_arm
- 1 × no outcome values in the text read (figure-only or not reported)
- 1 × favoured arm is unstated; sign unknown; figure: no figure caption names this measure
- 1 × figure: no figure caption names this measure
