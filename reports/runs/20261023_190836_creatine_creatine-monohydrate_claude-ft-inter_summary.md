# BS-PROOF summary report (claude-ft-inter)

Generated: **2026-10-23 19:08 UTC**


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
- Model calls: **640** (cache hits 1274, failures 399)
- Input tokens: **3,576,014** (fresh 78,467 · cache-write 1,781,595 · cache-read 1,715,952)
- Output tokens: **400,788**
- **Spent on this run: $0.00** — subscription, not metered.
- **API-equivalent cost: $16.590** — what the same work would cost billed per token.
- Per study: **4.6 calls**, **$0.1202** API-equivalent across 138 scored studies.

| Agent | Tier | Model | Calls | Cache hits | Fail | In | Out | API-equiv |
|---|---|---|--:|--:|--:|--:|--:|--:|
| S3 | B | `claude-sonnet-5` | 75 | 225 | 47 | 480,039 | 21,910 | $1.709 |
| S4 | B | `claude-sonnet-5` | 96 | 204 | 65 | 696,812 | 12,564 | $2.736 |
| S5 | B | `claude-sonnet-5` | 107 | 195 | 76 | 583,135 | 59,012 | $2.325 |
| S5N | B | `claude-sonnet-5` | 86 | 89 | 47 | 689,718 | 109,399 | $2.838 |
| S5R | R | `claude-opus-5` | 17 | 28 | 0 | 302,095 | 52,748 | $3.704 |
| S6B | C | `claude-sonnet-5` | 70 | 132 | 35 | 407,085 | 71,741 | $1.921 |
| S7 | B | `claude-sonnet-5` | 99 | 196 | 69 | 325,241 | 13,766 | $0.954 |
| S8 | A | `claude-haiku-4-5-20251001` | 90 | 205 | 60 | 91,889 | 59,648 | $0.404 |

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
| muscle_strength | **C+** | meaningful | Low | 12 | +0.22 [+0.04, +0.41] | 0% | 42 |
| lean_body_mass | **D+** | none | Low | 11 | +0.18 [-0.05, +0.40] | 17% | 21 |
| muscle_power | **I** | inconclusive | Very low | 10 | +0.08 [-0.23, +0.39] | 0% | 29 |
| muscular_endurance | **I** | inconclusive | Very low | 4 | +0.49 [-0.16, +1.14] | 0% | 6 |
| exercise_endurance | **I** | inconclusive | Very low | 3 | -0.19 [-1.38, +0.99] | 0% | 22 |
| cognitive_function | **I** | inconclusive | Very low | 2 | +0.20 [-0.44, +0.84] | 0% | 3 |
| memory | **I** | none | Very low | 2 | +0.16 [-0.08, +0.40] | 0% | 4 |
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
- 8 × only a p-value reported (no means, SDs or effect estimate)
- 7 × no verified effect estimate and incomplete arm statistics
- 6 × outcome has no recorded polarity, so arm means cannot be oriented
- 5 × numbers read but not found in the paper (span check)
- 4 × numbers not read (S5N call failed; re-run)
- 4 × arm values without an SD, SE or CI
- 3 × ratio needs its own scale; not pooled with differences
- 2 × relative_percent needs its own scale; not pooled with differences
- 2 × study: no_administered_intervention_arm
- 2 × crossover SMD may be standardised by the SD of differences (d_z); not poolable
- 1 × estimate kind unstated cannot be pooled
- 1 × reported mean difference has no verified CI with a stated level
- 1 × reviewers disagree (human adjudication)
- 1 × arm values in % without percentage_points kind (may be relative change)
