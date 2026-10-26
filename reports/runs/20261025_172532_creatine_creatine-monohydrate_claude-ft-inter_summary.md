# BS-PROOF summary report (claude-ft-inter)

Generated: **2026-10-25 17:25 UTC**


scoring_model: evidence-v2

Ingredient: `creatine` · Form: `creatine_monohydrate` · Mode: **claude-ft-inter**

Auto-written after every extraction (no extra steps).

Full audit: matching `*_full.md` in `reports/runs/`.

## This run — extraction stats

- Targeted studies: **2**
- Succeeded (usable): **2**
- Skipped (no text): **0**
- Partial agent failures: **0**
- Prompt version: `v1.39`
- Concurrency: 40  |  studies in flight: 40

## Token + cost accounting

- Extraction backend: **Claude subscription** (`--safe-mode`, `--max-turns 1`, one shot per call)
- Model calls: **5** (cache hits 12, failures 0)
- Input tokens: **171,149** (fresh 10 · cache-write 159,085 · cache-read 12,054)
- Output tokens: **21,366**
- **Spent on this run: $0.00** — subscription, not metered.
- **API-equivalent cost: $1.130** — what the same work would cost billed per token.
- Per study: **2.5 calls**, **$0.5650** API-equivalent across 2 scored studies.

| Agent | Tier | Model | Calls | Cache hits | Fail | In | Out | API-equiv |
|---|---|---|--:|--:|--:|--:|--:|--:|
| S3 | B | `claude-sonnet-5` | 0 | 2 | 0 | 0 | 0 | $0.000 |
| S4 | B | `claude-sonnet-5` | 0 | 2 | 0 | 0 | 0 | $0.000 |
| S5 | B | `claude-sonnet-5` | 0 | 2 | 0 | 0 | 0 | $0.000 |
| S5N | B | `claude-sonnet-5` | 4 | 0 | 0 | 140,256 | 15,218 | $0.667 |
| S5R | R | `claude-opus-5` | 1 | 0 | 0 | 30,893 | 6,148 | $0.463 |
| S6B | C | `claude-sonnet-5` | 0 | 2 | 0 | 0 | 0 | $0.000 |
| S7 | B | `claude-sonnet-5` | 0 | 2 | 0 | 0 | 0 | $0.000 |
| S8 | A | `claude-haiku-4-5-20251001` | 0 | 2 | 0 | 0 | 0 | $0.000 |

Tier → model is pinned in `claude_adapter.TIER_MODEL` (full ids, never aliases: an alias floats to a new model while the cache key does not change). Tier A = classification, B = extraction, C = the highest-risk agent.

## Predatory journal check (flag only — not in score)

- List entries loaded: **1162**
- Studies checked: **848**
- Publisher resolved for: **669/848** (the list is PUBLISHERS, so this is the real coverage)
- Studies flagged predatory: **5**
- Distinct publishers flagged: **2**
- Distinct journals flagged: **0**
- Affects score: **NO (count only)**
  - [publisher] Baishideng Publishing Group Inc.
  - [publisher] Frontiers Media SA

## Evidence grades — this run (`evidence-v2`, status `shadow`)

Population: `general_adult` · registry checked: **yes**

| Outcome | Grade | Benefit | Certainty | k | SMD [95% CI] | I² | refused |
|---|---|---|---|--:|---|--:|--:|
| adverse_events_any | **I** | no data | Very low | 0 | — | — | 1 |
| attention_focus | **I** | no data | Very low | 0 | — | — | 2 |
| cognitive_function | **I** | no data | Very low | 0 | — | — | 1 |
| energy_levels | **I** | no data | Very low | 0 | — | — | 1 |
| exercise_endurance | **I** | no data | Very low | 0 | — | — | 1 |
| glycaemic_control | **I** | no data | Very low | 0 | — | — | 1 |
| lean_body_mass | **I** | no data | Very low | 0 | — | — | 2 |
| memory | **I** | no data | Very low | 0 | — | — | 2 |
| muscle_strength | **I** | no data | Very low | 0 | — | — | 1 |
| sleep_quality | **I** | no data | Very low | 0 | — | — | 1 |

Why trials were refused (all outcomes):

- 7 × study: no_isolated_ingredient_arm
- 5 × no outcome values in the text read (figure-only or not reported)
- 1 × reported mean difference has no verified CI with a stated level
