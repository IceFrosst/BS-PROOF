# BS-PROOF summary report (claude-ft-inter)

Generated: **2026-10-19 23:57 UTC**


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
- Model calls: **72** (cache hits 1009, failures 30)
- Input tokens: **1,985,340** (fresh 90 · cache-write 472,699 · cache-read 1,512,551)
- Output tokens: **85,326**
- **Spent on this run: $0.00** — subscription, not metered.
- **API-equivalent cost: $9.195** — what the same work would cost billed per token.
- Per study: **0.5 calls**, **$0.0666** API-equivalent across 138 scored studies.

| Agent | Tier | Model | Calls | Cache hits | Fail | In | Out | API-equiv |
|---|---|---|--:|--:|--:|--:|--:|--:|
| S3 | B | `claude-sonnet-5` | 3 | 151 | 3 | 0 | 0 | $0.000 |
| S4 | B | `claude-sonnet-5` | 3 | 151 | 3 | 0 | 0 | $0.000 |
| S5 | B | `claude-sonnet-5` | 24 | 133 | 11 | 1,425,329 | 9,591 | $5.885 |
| S5N | B | `claude-sonnet-5` | 24 | 111 | 11 | 322,941 | 40,954 | $1.208 |
| S5R | R | `claude-opus-5` | 9 | 40 | 1 | 145,134 | 22,753 | $1.702 |
| S6B | C | `claude-sonnet-5` | 9 | 121 | 1 | 91,936 | 12,028 | $0.400 |
| S7 | B | `claude-sonnet-5` | 0 | 151 | 0 | 0 | 0 | $0.000 |
| S8 | A | `claude-haiku-4-5-20251001` | 0 | 151 | 0 | 0 | 0 | $0.000 |

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
| lean_body_mass | **I** | inconclusive | Low | 11 | +0.22 [-0.06, +0.50] | 45% | 22 |
| muscle_power | **I** | inconclusive | Very low | 11 | -0.02 [-0.42, +0.37] | 40% | 30 |
| muscle_strength | **D+** | none | Low | 11 | +0.17 [-0.04, +0.38] | 0% | 42 |
| exercise_endurance | **I** | inconclusive | Very low | 3 | -0.01 [-1.19, +1.18] | 0% | 20 |
| muscular_endurance | **I** | inconclusive | Very low | 3 | -0.09 [-1.65, +1.47] | 53% | 7 |
| memory | **I** | none | Very low | 2 | +0.16 [-0.08, +0.40] | 0% | 4 |
| sleep_duration | **I** | inconclusive | Very low | 2 | +0.57 [-0.44, +1.58] | 66% | 0 |
| attention_focus | **I** | large | Very low | 1 | +1.02 [+0.23, +1.81] | — | 4 |
| cognitive_function | **I** | inconclusive | Very low | 1 | +0.10 [-0.68, +0.89] | — | 4 |
| depressive_symptoms | **I** | inconclusive | Very low | 1 | -0.16 [-0.94, +0.63] | — | 3 |
| energy_levels | **I** | inconclusive | Very low | 1 | -0.17 [-0.91, +0.57] | — | 6 |
| inflammation_crp | **I** | inconclusive | Very low | 1 | +0.17 [-0.59, +0.93] | — | 2 |
| muscle_soreness | **I** | large | Very low | 1 | +0.97 [+0.19, +1.76] | — | 3 |
| sleep_onset | **I** | inconclusive | Very low | 1 | -0.31 [-1.05, +0.44] | — | 0 |
| sleep_quality | **I** | large | Very low | 1 | +1.05 [+0.26, +1.84] | — | 4 |
| adverse_events_any | **I** | no data | Very low | 0 | — | — | 35 |
| adverse_events_gi | **I** | no data | Very low | 0 | — | — | 7 |
| blood_pressure | **I** | no data | Very low | 0 | — | — | 4 |
| cortisol | **I** | no data | Very low | 0 | — | — | 4 |
| exercise_recovery | **I** | no data | Very low | 0 | — | — | 4 |
| glycaemic_control | **I** | no data | Very low | 0 | — | — | 5 |
| perceived_stress | **I** | no data | Very low | 0 | — | — | 2 |
| testosterone | **I** | no data | Very low | 0 | — | — | 3 |

Why trials were refused (all outcomes):

- 54 × no outcome values in the text read (figure-only or not reported)
- 49 × study: no_isolated_ingredient_arm
- 49 × study: off-target population
- 11 × only a p-value reported (no means, SDs or effect estimate)
- 10 × study: no_ingredient_free_arm
- 9 × no verified effect estimate and incomplete arm statistics
- 6 × outcome has no recorded polarity, so arm means cannot be oriented
- 5 × arm values without an SD, SE or CI
- 5 × not a contrast against an ingredient-free control
- 4 × numbers not read (S5N call failed; re-run)
- 4 × relative_percent needs its own scale; not pooled with differences
- 3 × arm values in % without percentage_points kind (may be relative change)
- 2 × study: no_administered_intervention_arm
- 2 × crossover SMD may be standardised by the SD of differences (d_z); not poolable
- 1 × numbers read but not found in the paper (span check)
- 1 × ratio needs its own scale; not pooled with differences
