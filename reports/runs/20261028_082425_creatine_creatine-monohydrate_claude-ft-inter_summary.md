# BS-PROOF summary report (claude-ft-inter)

Generated: **2026-10-28 08:24 UTC**


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
- Model calls: **103** (cache hits 913, failures 8)
- Input tokens: **1,590,663** (fresh 206 · cache-write 947,855 · cache-read 642,602)
- Output tokens: **247,680**
- **Spent on this run: $0.00** — subscription, not metered.
- **API-equivalent cost: $8.031** — what the same work would cost billed per token.
- Per study: **0.7 calls**, **$0.0582** API-equivalent across 138 scored studies.

| Agent | Tier | Model | Calls | Cache hits | Fail | In | Out | API-equiv |
|---|---|---|--:|--:|--:|--:|--:|--:|
| S3 | B | `claude-sonnet-5` | 1 | 137 | 0 | 11,024 | 712 | $0.051 |
| S4 | B | `claude-sonnet-5` | 14 | 124 | 0 | 128,008 | 9,101 | $0.448 |
| S5 | B | `claude-sonnet-5` | 22 | 121 | 5 | 365,210 | 52,987 | $1.201 |
| S5N | B | `claude-sonnet-5` | 36 | 107 | 3 | 646,287 | 101,581 | $2.543 |
| S5R | R | `claude-opus-5` | 12 | 40 | 0 | 209,000 | 48,681 | $2.722 |
| S6B | C | `claude-sonnet-5` | 17 | 109 | 0 | 218,436 | 34,183 | $1.009 |
| S7 | B | `claude-sonnet-5` | 1 | 137 | 0 | 12,698 | 435 | $0.055 |
| S8 | A | `claude-haiku-4-5-20251001` | 0 | 138 | 0 | 0 | 0 | $0.000 |

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
| lean_body_mass | **D** | none | Moderate | 10 | +0.14 [-0.05, +0.33] | 0% | 24 |
| muscle_power | **I** | none | Very low | 10 | +0.18 [-0.12, +0.47] | 1% | 31 |
| muscle_strength | **D** | none | Moderate | 10 | +0.11 [-0.09, +0.30] | 0% | 47 |
| exercise_endurance | **I** | inconclusive | Very low | 3 | -0.16 [-1.18, +0.87] | 0% | 18 |
| memory | **I** | inconclusive | Very low | 3 | +0.16 [-0.31, +0.63] | 0% | 4 |
| muscular_endurance | **I** | inconclusive | Very low | 3 | +0.31 [-0.73, +1.34] | 0% | 11 |
| attention_focus | **I** | inconclusive | Very low | 2 | +0.57 [-0.18, +1.33] | 62% | 3 |
| energy_levels | **I** | inconclusive | Very low | 2 | -0.01 [-0.55, +0.54] | 0% | 9 |
| exercise_recovery | **I** | inconclusive | Very low | 2 | +1.20 [-0.32, +2.71] | 81% | 7 |
| sleep_duration | **I** | inconclusive | Very low | 2 | +0.57 [-0.44, +1.58] | 66% | 0 |
| cognitive_function | **I** | inconclusive | Very low | 1 | +0.02 [-0.66, +0.70] | — | 4 |
| depressive_symptoms | **I** | inconclusive | Very low | 1 | -0.16 [-0.94, +0.63] | — | 3 |
| muscle_soreness | **I** | large | Very low | 1 | +0.97 [+0.19, +1.76] | — | 5 |
| sleep_onset | **I** | inconclusive | Very low | 1 | -0.31 [-1.05, +0.44] | — | 1 |
| sleep_quality | **I** | large | Very low | 1 | +1.05 [+0.26, +1.84] | — | 6 |
| adverse_events_any | **I** | no data | Very low | 0 | — | — | 37 |
| adverse_events_gi | **I** | no data | Very low | 0 | — | — | 7 |
| blood_pressure | **I** | no data | Very low | 0 | — | — | 5 |
| cortisol | **I** | no data | Very low | 0 | — | — | 4 |
| glycaemic_control | **I** | no data | Very low | 0 | — | — | 6 |
| inflammation_crp | **I** | no data | Very low | 0 | — | — | 3 |
| muscle_cramps | **I** | no data | Very low | 0 | — | — | 1 |
| perceived_stress | **I** | no data | Very low | 0 | — | — | 3 |
| testosterone | **I** | no data | Very low | 0 | — | — | 3 |

Why trials were refused (all outcomes):

- 59 × no outcome values in the text read (figure-only or not reported)
- 59 × study: off-target population
- 53 × study: no_isolated_ingredient_arm
- 12 × only a p-value reported, from a test that does not convert (repeated-measures, ANCOVA, non-parametric, multi-arm or one-sided)
- 10 × arms differ in more than the ingredient (co-interventions not matched)
- 10 × study: no_ingredient_free_arm
- 7 × not a contrast against an ingredient-free control
- 6 × outcome has no recorded polarity, so arm means cannot be oriented
- 3 × numbers read but not found in the paper (span check)
- 3 × arm values without an SD, SE or CI
- 3 × reviewers disagree (human adjudication)
- 3 × no verified effect estimate and incomplete arm statistics
- 2 × numbers not read (S5N call failed; re-run)
- 2 × reported mean difference has no verified CI with a stated level
- 2 × relative_percent needs its own scale; not pooled with differences
- 2 × reported SMD is interaction or anova; only a between-arm SMD is pooled
- 1 × ratio needs its own scale; not pooled with differences
- 1 × direction of this measure is unclear (accuracy and speed in one claim: direction unclear)
- 1 × only a p-value reported; favoured arm is unstated, sign unknown
- 1 × arm values in % without percentage_points kind (may be relative change)
- 1 × crossover SMD may be standardised by the SD of differences (d_z); not poolable
- 1 × reported SMD: what it compares is not stated; only a between-arm SMD is pooled
