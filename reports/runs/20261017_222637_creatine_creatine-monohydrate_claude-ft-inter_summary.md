# BS-PROOF summary report (claude-ft-inter)

Generated: **2026-10-17 22:26 UTC**


scoring_model: evidence-v2

Ingredient: `creatine` · Form: `creatine_monohydrate` · Mode: **claude-ft-inter**

Auto-written after every extraction (no extra steps).

Full audit: matching `*_full.md` in `reports/runs/`.

## This run — extraction stats

- Targeted studies: **139**
- Succeeded (usable): **138**
- Skipped (no text): **1**
- Partial agent failures: **1**
- Prompt version: `v1.38`
- Concurrency: 10  |  studies in flight: 10

## Token + cost accounting

- Extraction backend: **Claude subscription** (`--safe-mode`, `--max-turns 1`, one shot per call)
- Model calls: **926** (cache hits 739, failures 608)
- Input tokens: **7,056,223** (fresh 95,961 · cache-write 2,508,733 · cache-read 4,451,529)
- Output tokens: **287,528**
- **Spent on this run: $0.00** — subscription, not metered.
- **API-equivalent cost: $26.329** — what the same work would cost billed per token.
- Per study: **6.7 calls**, **$0.1908** API-equivalent across 138 scored studies.

| Agent | Tier | Model | Calls | Cache hits | Fail | In | Out | API-equiv |
|---|---|---|--:|--:|--:|--:|--:|--:|
| S3 | B | `claude-sonnet-5` | 173 | 115 | 124 | 2,122,821 | 33,781 | $8.431 |
| S4 | B | `claude-sonnet-5` | 190 | 101 | 141 | 3,062,112 | 18,720 | $11.168 |
| S5 | B | `claude-sonnet-5` | 160 | 109 | 110 | 293,304 | 40,835 | $0.862 |
| S5N | B | `claude-sonnet-5` | 36 | 76 | 7 | 382,637 | 52,785 | $1.242 |
| S5R | R | `claude-opus-5` | 6 | 36 | 0 | 85,750 | 12,374 | $0.985 |
| S6B | C | `claude-sonnet-5` | 44 | 82 | 8 | 409,048 | 45,274 | $1.687 |
| S7 | B | `claude-sonnet-5` | 164 | 105 | 114 | 501,154 | 22,066 | $1.342 |
| S8 | A | `claude-haiku-4-5-20251001` | 153 | 115 | 104 | 199,397 | 61,693 | $0.612 |

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
| muscle_power | **I** | inconclusive | Very low | 12 | +0.06 [-0.49, +0.61] | 61% | 23 |
| muscle_strength | **C+** | meaningful | Low | 12 | +0.29 [+0.07, +0.50] | 3% | 27 |
| lean_body_mass | **D+** | none | Low | 9 | +0.17 [-0.14, +0.47] | 26% | 15 |
| muscular_endurance | **I** | inconclusive | Very low | 3 | +0.07 [-0.98, +1.12] | 0% | 7 |
| exercise_endurance | **I** | inconclusive | Very low | 2 | -0.09 [-0.69, +0.51] | 0% | 17 |
| memory | **I** | none | Very low | 2 | +0.14 [-0.09, +0.36] | 0% | 0 |
| attention_focus | **I** | large | Very low | 1 | +1.02 [+0.23, +1.81] | — | 2 |
| depressive_symptoms | **I** | inconclusive | Very low | 1 | -0.16 [-0.94, +0.63] | — | 3 |
| energy_levels | **I** | inconclusive | Very low | 1 | -0.17 [-0.91, +0.57] | — | 2 |
| inflammation_crp | **I** | inconclusive | Very low | 1 | +0.17 [-0.59, +0.93] | — | 2 |
| muscle_soreness | **I** | large | Very low | 1 | +0.97 [+0.19, +1.76] | — | 3 |
| sleep_duration | **I** | inconclusive | Very low | 1 | +0.09 [-0.65, +0.83] | — | 0 |
| sleep_onset | **I** | inconclusive | Very low | 1 | -0.31 [-1.05, +0.44] | — | 0 |
| sleep_quality | **I** | large | Very low | 1 | +1.05 [+0.26, +1.84] | — | 1 |
| adverse_events_any | **I** | no data | Very low | 0 | — | — | 20 |
| adverse_events_gi | **I** | no data | Very low | 0 | — | — | 7 |
| blood_pressure | **I** | no data | Very low | 0 | — | — | 2 |
| cognitive_function | **I** | no data | Very low | 0 | — | — | 1 |
| cortisol | **I** | no data | Very low | 0 | — | — | 3 |
| exercise_recovery | **I** | no data | Very low | 0 | — | — | 3 |
| glycaemic_control | **I** | no data | Very low | 0 | — | — | 3 |
| perceived_stress | **I** | no data | Very low | 0 | — | — | 1 |
| testosterone | **I** | no data | Very low | 0 | — | — | 3 |

Why trials were refused (all outcomes):

- 38 × no outcome values in the text read (figure-only or not reported)
- 38 × study: off-target population
- 28 × study: no_isolated_ingredient_arm
- 9 × only a p-value reported (no means, SDs or effect estimate)
- 8 × study: no_ingredient_free_arm
- 5 × outcome has no recorded polarity, so arm means cannot be oriented
- 4 × not a contrast against an ingredient-free control
- 4 × no verified effect estimate and incomplete arm statistics
- 3 × numbers read but not found in the paper (span check)
- 2 × relative_percent needs its own scale; not pooled with differences
- 2 × arm values without an SD, SE or CI
- 1 × ratio needs its own scale; not pooled with differences
- 1 × reported mean difference has no verified CI with a stated level
- 1 × numbers not read (S5N call failed; re-run)
- 1 × crossover SMD may be standardised by the SD of differences (d_z); not poolable
