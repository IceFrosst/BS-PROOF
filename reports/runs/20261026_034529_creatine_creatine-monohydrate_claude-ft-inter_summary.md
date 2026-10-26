# BS-PROOF summary report (claude-ft-inter)

Generated: **2026-10-26 03:45 UTC**


scoring_model: evidence-v2

Ingredient: `creatine` · Form: `creatine_monohydrate` · Mode: **claude-ft-inter**

Auto-written after every extraction (no extra steps).

Full audit: matching `*_full.md` in `reports/runs/`.

## This run — extraction stats

- Targeted studies: **139**
- Succeeded (usable): **138**
- Skipped (no text): **1**
- Partial agent failures: **1**
- Prompt version: `v1.39`
- Concurrency: 10  |  studies in flight: 10

## Token + cost accounting

- Extraction backend: **Claude subscription** (`--safe-mode`, `--max-turns 1`, one shot per call)
- Model calls: **360** (cache hits 1898, failures 193)
- Input tokens: **2,751,587** (fresh 342 · cache-write 1,805,938 · cache-read 945,307)
- Output tokens: **456,374**
- **Spent on this run: $0.00** — subscription, not metered.
- **API-equivalent cost: $17.040** — what the same work would cost billed per token.
- Per study: **2.6 calls**, **$0.1235** API-equivalent across 138 scored studies.

| Agent | Tier | Model | Calls | Cache hits | Fail | In | Out | API-equiv |
|---|---|---|--:|--:|--:|--:|--:|--:|
| S3 | B | `claude-sonnet-5` | 3 | 318 | 3 | 0 | 0 | $0.000 |
| S4 | B | `claude-sonnet-5` | 3 | 318 | 3 | 0 | 0 | $0.000 |
| S5 | B | `claude-sonnet-5` | 3 | 318 | 3 | 0 | 0 | $0.000 |
| S5N | B | `claude-sonnet-5` | 308 | 4 | 184 | 2,021,913 | 331,570 | $8.602 |
| S5R | R | `claude-opus-5` | 43 | 1 | 0 | 729,674 | 124,804 | $8.438 |
| S6B | C | `claude-sonnet-5` | 0 | 303 | 0 | 0 | 0 | $0.000 |
| S7 | B | `claude-sonnet-5` | 0 | 318 | 0 | 0 | 0 | $0.000 |
| S8 | A | `claude-haiku-4-5-20251001` | 0 | 318 | 0 | 0 | 0 | $0.000 |

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
| muscle_strength | **B+** | meaningful | Moderate | 12 | +0.24 [+0.04, +0.44] | 2% | 43 |
| lean_body_mass | **D** | none | Moderate | 11 | +0.18 [-0.05, +0.41] | 22% | 21 |
| muscle_power | **I** | none | Very low | 10 | +0.13 [-0.19, +0.44] | 0% | 30 |
| muscular_endurance | **I** | inconclusive | Very low | 4 | +0.49 [-0.16, +1.14] | 0% | 6 |
| exercise_endurance | **I** | inconclusive | Very low | 3 | -0.19 [-1.38, +0.99] | 0% | 22 |
| cognitive_function | **I** | inconclusive | Very low | 2 | +0.07 [-0.57, +0.71] | 0% | 3 |
| memory | **I** | inconclusive | Very low | 2 | +0.24 [-0.15, +0.64] | 27% | 4 |
| sleep_duration | **I** | inconclusive | Very low | 2 | +0.57 [-0.44, +1.58] | 66% | 0 |
| attention_focus | **I** | large | Very low | 1 | +1.02 [+0.23, +1.81] | — | 6 |
| depressive_symptoms | **I** | inconclusive | Very low | 1 | -0.16 [-0.94, +0.63] | — | 4 |
| energy_levels | **I** | inconclusive | Very low | 1 | -0.17 [-0.91, +0.57] | — | 9 |
| muscle_soreness | **I** | large | Very low | 1 | +0.97 [+0.19, +1.76] | — | 4 |
| sleep_onset | **I** | inconclusive | Very low | 1 | -0.31 [-1.05, +0.44] | — | 0 |
| sleep_quality | **I** | large | Very low | 1 | +1.05 [+0.26, +1.84] | — | 4 |
| adverse_events_any | **I** | no data | Very low | 0 | — | — | 35 |
| adverse_events_gi | **I** | no data | Very low | 0 | — | — | 5 |
| blood_pressure | **I** | no data | Very low | 0 | — | — | 6 |
| cortisol | **I** | no data | Very low | 0 | — | — | 4 |
| exercise_recovery | **I** | no data | Very low | 0 | — | — | 4 |
| glycaemic_control | **I** | no data | Very low | 0 | — | — | 6 |
| inflammation_crp | **I** | no data | Very low | 0 | — | — | 3 |
| perceived_stress | **I** | no data | Very low | 0 | — | — | 1 |
| testosterone | **I** | no data | Very low | 0 | — | — | 3 |

Why trials were refused (all outcomes):

- 54 × no outcome values in the text read (figure-only or not reported)
- 52 × study: no_isolated_ingredient_arm
- 49 × study: off-target population
- 10 × study: no_ingredient_free_arm
- 9 × not a contrast against an ingredient-free control
- 7 × only a p-value reported, from a test that does not convert (repeated-measures, ANCOVA, non-parametric, multi-arm or one-sided)
- 6 × no verified effect estimate and incomplete arm statistics
- 5 × relative_percent needs its own scale; not pooled with differences
- 5 × outcome has no recorded polarity, so arm means cannot be oriented
- 4 × arm values without an SD, SE or CI
- 4 × numbers not read (S5N call failed; re-run)
- 3 × numbers read but not found in the paper (span check)
- 3 × ratio needs its own scale; not pooled with differences
- 3 × reviewers disagree (human adjudication)
- 2 × study: no_administered_intervention_arm
- 2 × only a p-value reported, the test behind it is not stated
- 2 × crossover SMD may be standardised by the SD of differences (d_z); not poolable
- 1 × reported mean difference has no verified CI with a stated level
- 1 × arm values in % without percentage_points kind (may be relative change)
- 1 × only a p-value reported; favoured arm is neither, sign unknown
