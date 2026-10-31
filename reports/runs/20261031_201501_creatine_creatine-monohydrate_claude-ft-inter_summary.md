# BS-PROOF summary report (claude-ft-inter)

Generated: **2026-10-31 20:15 UTC**


scoring_model: evidence-v2

Ingredient: `creatine` · Form: `creatine_monohydrate` · Mode: **claude-ft-inter**

Auto-written after every extraction (no extra steps).

Full audit: matching `*_full.md` in `reports/runs/`.

## This run — extraction stats

- Targeted studies: **138**
- Succeeded (usable): **98**
- Skipped (no text): **40**
- Partial agent failures: **1**
- Prompt version: `v1.39`
- Concurrency: 10  |  studies in flight: 10

## Token + cost accounting

- Extraction backend: **Claude subscription** (`--safe-mode`, `--max-turns 1`, one shot per call)
- Model calls: **30** (cache hits 791, failures 6)
- Input tokens: **383,821** (fresh 60 · cache-write 254,677 · cache-read 129,084)
- Output tokens: **28,625**
- **Spent on this run: $0.00** — subscription, not metered.
- **API-equivalent cost: $3.049** — what the same work would cost billed per token.
- Per study: **0.3 calls**, **$0.0311** API-equivalent across 98 scored studies.

| Agent | Tier | Model | Calls | Cache hits | Fail | In | Out | API-equiv |
|---|---|---|--:|--:|--:|--:|--:|--:|
| S3 | B | `claude-sonnet-5` | 0 | 98 | 0 | 0 | 0 | $0.000 |
| S4 | B | `claude-sonnet-5` | 0 | 98 | 0 | 0 | 0 | $0.000 |
| S4R | R | `claude-opus-5` | 20 | 7 | 0 | 253,564 | 18,717 | $2.433 |
| S5 | B | `claude-sonnet-5` | 0 | 98 | 0 | 0 | 0 | $0.000 |
| S5F | B | `claude-sonnet-5` | 1 | 23 | 0 | 5,055 | 328 | $0.023 |
| S5FR | R | `claude-opus-5` | 5 | 22 | 3 | 23,290 | 4,562 | $0.230 |
| S5N | B | `claude-sonnet-5` | 3 | 113 | 3 | 85,029 | 3,706 | $0.162 |
| S5R | R | `claude-opus-5` | 1 | 46 | 0 | 16,883 | 1,312 | $0.202 |
| S6B | C | `claude-sonnet-5` | 0 | 90 | 0 | 0 | 0 | $0.000 |
| S7 | B | `claude-sonnet-5` | 0 | 98 | 0 | 0 | 0 | $0.000 |
| S8 | A | `claude-haiku-4-5-20251001` | 0 | 98 | 0 | 0 | 0 | $0.000 |

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
| muscle_strength | **D** | none | Moderate | 14 | +0.14 [-0.03, +0.30] | 0% | 30 |
| muscle_power | **D+** | none | Low | 12 | +0.10 [-0.15, +0.35] | 0% | 21 |
| lean_body_mass | **D** | none | Moderate | 11 | +0.12 [-0.06, +0.30] | 0% | 14 |
| muscular_endurance | **I** | inconclusive | Very low | 4 | +0.15 [-0.52, +0.82] | 0% | 8 |
| exercise_endurance | **I** | inconclusive | Very low | 3 | -0.07 [-0.90, +0.76] | 0% | 15 |
| energy_levels | **I** | inconclusive | Very low | 2 | -0.01 [-0.55, +0.54] | 0% | 9 |
| memory | **I** | inconclusive | Very low | 2 | +0.21 [-0.09, +0.52] | 15% | 4 |
| attention_focus | **I** | large | Very low | 1 | +1.02 [+0.23, +1.81] | — | 4 |
| cognitive_function | **I** | inconclusive | Very low | 1 | +0.02 [-0.66, +0.70] | — | 2 |
| depressive_symptoms | **I** | inconclusive | Very low | 1 | -0.16 [-0.94, +0.63] | — | 1 |
| exercise_recovery | **I** | large | Very low | 1 | +0.58 [+0.05, +1.11] | — | 7 |
| muscle_soreness | **I** | large | Very low | 1 | +0.97 [+0.19, +1.76] | — | 5 |
| sleep_duration | **I** | inconclusive | Very low | 1 | +0.09 [-0.65, +0.83] | — | 1 |
| sleep_onset | **I** | inconclusive | Very low | 1 | -0.31 [-1.05, +0.44] | — | 1 |
| sleep_quality | **I** | large | Very low | 1 | +1.05 [+0.26, +1.84] | — | 6 |
| adverse_events_any | **I** | no data | Very low | 0 | — | — | 29 |
| adverse_events_gi | **I** | no data | Very low | 0 | — | — | 5 |
| blood_pressure | **I** | no data | Very low | 0 | — | — | 5 |
| cortisol | **I** | no data | Very low | 0 | — | — | 2 |
| glycaemic_control | **I** | no data | Very low | 0 | — | — | 4 |
| muscle_cramps | **I** | no data | Very low | 0 | — | — | 1 |
| perceived_stress | **I** | no data | Very low | 0 | — | — | 3 |
| testosterone | **I** | no data | Very low | 0 | — | — | 2 |

Why trials were refused (all outcomes):

- 38 × study: no_isolated_ingredient_arm
- 38 × study: off-target population
- 28 × figure: a reader returned nothing
- 14 × no outcome values in the text read (figure-only or not reported)
- 10 × study: no_ingredient_free_arm
- 7 × outcome has no recorded polarity, so arm means cannot be oriented; figure: a reader returned nothing
- 5 × only a p-value reported, from a test that does not convert (repeated-measures, ANCOVA, non-parametric, multi-arm or one-sided); figure: a reader returned nothing
- 4 × reviewers disagree (human adjudication)
- 3 × relative_percent needs its own scale; not pooled with differences; figure: a reader returned nothing
- 3 × figure: readers disagree (more than 2 % of the axis)
- 3 × arms differ in more than the ingredient (co-interventions not matched)
- 2 × numbers not read (S5N call failed; re-run)
- 2 × figure: readers disagree on what is plotted
- 2 × figure: readers disagree on what the error bars are
- 2 × figure: readers disagree on an error bar
- 2 × figure: error bars unstated or absent, no SD
- 1 × ratio needs its own scale; not pooled with differences; figure: a reader returned nothing
- 1 × arm values without an SD, SE or CI
- 1 × direction of this measure is unclear (accuracy and speed in one claim: direction unclear)
- 1 × SE or CI of a result pooled over visits is not per participant; no SD; figure: the panel was not found
- 1 × only a p-value reported, from a test that does not convert (repeated-measures, ANCOVA, non-parametric, multi-arm or one-sided); figure: error bars unstated or absent, no SD
- 1 × relative_percent needs its own scale; not pooled with differences
- 1 × only a p-value reported; favoured arm is unstated, sign unknown; figure: error bars unstated or absent, no SD
- 1 × arm values in % without percentage_points kind (may be relative change)
- 1 × SE or CI of a result pooled over visits is not per participant; no SD; figure: a reader returned nothing
- 1 × no verified effect estimate and incomplete arm statistics
- 1 × arm values in % without percentage_points kind (may be relative change); figure: a reader returned nothing
- 1 × crossover SMD may be standardised by the SD of differences (d_z); not poolable; figure: a reader returned nothing
- 1 × reported SMD is interaction or anova; only a between-arm SMD is pooled; figure: readers disagree on what the error bars are
- 1 × reported SMD is interaction or anova; only a between-arm SMD is pooled; figure: a reader returned nothing
- 1 × only a p-value reported, from a test that does not convert (repeated-measures, ANCOVA, non-parametric, multi-arm or one-sided)
- 1 × direction of this measure is unclear (sleepiness at bedtime has no settled direction)
