# BS-PROOF summary report (claude-ft-inter)

Generated: **2026-11-03 10:10 UTC**


scoring_model: evidence-v2

Ingredient: `vitamin_c` · Form: `ascorbic_acid` · Mode: **claude-ft-inter**

Auto-written after every extraction (no extra steps).

Full audit: matching `*_full.md` in `reports/runs/`.

## This run — extraction stats

- Targeted studies: **116**
- Succeeded (usable): **52**
- Skipped (no text): **64**
- Partial agent failures: **0**
- Prompt version: `v1.39`
- Concurrency: 40  |  studies in flight: 40

## Token + cost accounting

- Extraction backend: **Claude subscription** (`--safe-mode`, `--max-turns 1`, one shot per call)
- Model calls: **141** (cache hits 234, failures 3)
- Input tokens: **2,199,478** (fresh 18,725 · cache-write 1,660,697 · cache-read 520,056)
- Output tokens: **191,881**
- **Spent on this run: $0.00** — subscription, not metered.
- **API-equivalent cost: $10.114** — what the same work would cost billed per token.
- Per study: **2.7 calls**, **$0.1945** API-equivalent across 52 scored studies.

| Agent | Tier | Model | Calls | Cache hits | Fail | In | Out | API-equiv |
|---|---|---|--:|--:|--:|--:|--:|--:|
| S3 | B | `claude-sonnet-5` | 17 | 35 | 0 | 330,659 | 13,889 | $1.179 |
| S4 | B | `claude-sonnet-5` | 21 | 32 | 1 | 347,589 | 12,614 | $1.279 |
| S4R | R | `claude-opus-5` | 5 | 6 | 0 | 99,630 | 4,801 | $0.996 |
| S5 | B | `claude-sonnet-5` | 21 | 33 | 2 | 415,056 | 44,838 | $1.648 |
| S5F | B | `claude-sonnet-5` | 0 | 1 | 0 | 0 | 0 | $0.000 |
| S5FR | R | `claude-opus-5` | 0 | 1 | 0 | 0 | 0 | $0.000 |
| S5N | B | `claude-sonnet-5` | 11 | 21 | 0 | 248,915 | 22,633 | $0.956 |
| S5R | R | `claude-opus-5` | 8 | 10 | 0 | 177,861 | 18,429 | $1.849 |
| S6B | C | `claude-sonnet-5` | 19 | 30 | 0 | 268,280 | 32,373 | $1.165 |
| S7 | B | `claude-sonnet-5` | 19 | 33 | 0 | 231,910 | 11,129 | $0.745 |
| S8 | A | `claude-haiku-4-5-20251001` | 20 | 32 | 0 | 79,578 | 31,175 | $0.297 |

Tier → model is pinned in `claude_adapter.TIER_MODEL` (full ids, never aliases: an alias floats to a new model while the cache key does not change). Tier A = classification, B = extraction, C = the highest-risk agent.

## Predatory journal check (flag only — not in score)

- List entries loaded: **1162**
- Studies checked: **1156**
- Publisher resolved for: **956/1156** (the list is PUBLISHERS, so this is the real coverage)
- Studies flagged predatory: **8**
- Distinct publishers flagged: **3**
- Distinct journals flagged: **0**
- Affects score: **NO (count only)**
  - [publisher] Baishideng Publishing Group Inc.
  - [publisher] Frontiers Media SA
  - [publisher] Science Alert

## Evidence grades — this run (`evidence-v2`, status `shadow`)

Population: `general_adult` · registry checked: **yes**

| Outcome | Grade | Benefit | Certainty | k | SMD [95% CI] | I² | refused |
|---|---|---|---|--:|---|--:|--:|
| cold_duration | **I** | large | Very low | 1 | +0.96 [+0.18, +1.75] | — | 0 |
| cold_incidence | **I** | large | Very low | 1 | +1.01 [+0.01, +2.01] | — | 0 |
| energy_levels | **I** | possible | Very low | 1 | +0.56 [-0.03, +1.15] | — | 2 |
| exercise_endurance | **I** | inconclusive | Very low | 1 | +0.14 [-0.56, +0.83] | — | 3 |
| inflammation_crp | **I** | inconclusive | Very low | 1 | +0.20 [-0.44, +0.83] | — | 3 |
| lean_body_mass | **I** | inconclusive | Very low | 1 | +0.01 [-0.68, +0.70] | — | 4 |
| adverse_events_any | **I** | no data | Very low | 0 | — | — | 17 |
| anxiety | **I** | no data | Very low | 0 | — | — | 2 |
| attention_focus | **I** | no data | Very low | 0 | — | — | 1 |
| blood_pressure | **I** | no data | Very low | 0 | — | — | 5 |
| depressive_symptoms | **I** | no data | Very low | 0 | — | — | 3 |
| digestive_comfort | **I** | no data | Very low | 0 | — | — | 1 |
| glycaemic_control | **I** | no data | Very low | 0 | — | — | 2 |
| muscle_power | **I** | no data | Very low | 0 | — | — | 2 |
| muscle_soreness | **I** | no data | Very low | 0 | — | — | 1 |
| muscle_strength | **I** | no data | Very low | 0 | — | — | 2 |
| muscular_endurance | **I** | no data | Very low | 0 | — | — | 1 |
| perceived_stress | **I** | no data | Very low | 0 | — | — | 2 |

Why trials were refused (all outcomes):

- 29 × study: no_isolated_ingredient_arm
- 11 × study: off-target population
- 5 × figure: no figure caption names this measure
- 2 × study: no_ingredient_free_arm
- 2 × arms differ in more than the ingredient (co-interventions not matched)
- 1 × no outcome values in the text read (figure-only or not reported)
- 1 × figure: readers disagree on an error bar
