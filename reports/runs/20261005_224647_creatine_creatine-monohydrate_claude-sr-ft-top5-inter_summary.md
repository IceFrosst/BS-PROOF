# BS-PROOF summary report (claude-sr-ft-top5-inter)

Generated: **2026-10-05 22:46 UTC**


scoring_model: v14-applicability-discount

Ingredient: `creatine` · Form: `creatine_monohydrate` · Mode: **claude-sr-ft-top5-inter**

Auto-written after every extraction (no extra steps).

Full audit: matching `*_full.md` in `reports/runs/`.

## This run — extraction stats

- Targeted studies: **139**
- Succeeded (usable): **138**
- Skipped (no text): **1**
- Partial agent failures: **1**
- Prompt version: `v1.35`
- Concurrency: 40  |  studies in flight: 40

## Token + cost accounting

- Extraction backend: **Claude subscription** (`--safe-mode`, `--max-turns 1`, one shot per call)
- Model calls: **126** (cache hits 1032, failures 21)
- Input tokens: **1,930,694** (fresh 45,576 · cache-write 549,656 · cache-read 1,335,462)
- Output tokens: **217,788**
- **Spent on this run: $0.00** — subscription, not metered.
- **API-equivalent cost: $7.853** — what the same work would cost billed per token.
- Per study: **0.9 calls**, **$0.0569** API-equivalent across 138 scored studies.

| Agent | Tier | Model | Calls | Cache hits | Fail | In | Out | API-equiv |
|---|---|---|--:|--:|--:|--:|--:|--:|
| S1 | A | `claude-haiku-4-5-20251001` | 16 | 125 | 3 | 77,324 | 37,899 | $0.280 |
| S2 | B | `claude-sonnet-5` | 0 | 55 | 0 | 0 | 0 | $0.000 |
| S3 | B | `claude-sonnet-5` | 11 | 133 | 6 | 455,297 | 8,775 | $1.847 |
| S4 | B | `claude-sonnet-5` | 13 | 125 | 0 | 69,549 | 10,179 | $0.273 |
| S5 | B | `claude-sonnet-5` | 18 | 126 | 6 | 657,711 | 45,972 | $2.526 |
| S5N | B | `claude-sonnet-5` | 14 | 65 | 2 | 210,614 | 26,850 | $0.675 |
| S5R | R | `claude-opus-5` | 4 | 30 | 0 | 87,584 | 6,460 | $0.903 |
| S5T | A | `claude-haiku-4-5-20251001` | 2 | 26 | 0 | 10,226 | 13,164 | $0.086 |
| S6B | C | `claude-sonnet-5` | 18 | 98 | 0 | 121,193 | 16,580 | $0.436 |
| S7 | B | `claude-sonnet-5` | 17 | 124 | 4 | 185,489 | 24,960 | $0.602 |
| S8 | A | `claude-haiku-4-5-20251001` | 13 | 125 | 0 | 55,707 | 26,949 | $0.226 |

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

## Systematic reviews / meta-analyses (S2)

- Requested (cap): **60**
- S2 extractions ok: **55**
- Resolved for multiplier: **48**
_SRs never add patients; only a capped confidence boost (≤ +30%)._

## ECU scores — this run only

| Outcome | 0–100 | Verdict | effect | in your form | at your dose | evidence | n |
|---|---:|---|---|---|---|---|---:|
| lean_body_mass | 52 | unclear | +0.13 @ 100% | 0.80 (pooled +0.12 @ 91%) | not tested | 52% | 4 |
| muscle_power | 52 | unclear | +0.18 @ 100% | 0.80 (pooled +0.21 @ 85%) | not tested | 62% | 7 |
| muscle_strength | 51 | unclear | +0.11 @ 100% | 0.80 (pooled +0.14 @ 81%) | not tested | 47% | 5 |
| exercise_endurance | 45 | unclear | -0.25 @ 100% | 0.80 (pooled -0.25 @ 100%) | not tested | 43% | 4 |
| energy_levels | gated | not enough human evidence | not tested | not tested | not tested | not tested | 0 |

_0–100 = 50 + signed/2, with a positive signal discounted by applicability A = mean(form strength, dose closeness); a negative signal is never softened. 50 means the evidence points nowhere. Each arc shows its verdict and the share of evidence behind it; a number near 50 with a FULL evidence arc means 'no effect found', with an EMPTY one it means 'barely studied'._


_Old rows from previous runs are not shown here._

## Which studies made each number

### lean_body_mass — signed +7

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:101249mss0000000000003202` | +2.86 | 0.6 | 0.09876543209876537 | 4 | exact |
| `doi:1010801550278320232193556` | +2.74 | 0.1392 | 0.4074074074074074 | 4 | exact |
| `registry:nct01472393` | +1.41 | 0.0978 | 0.3 | 4 | unspecified |
| `doi:1010801550278320242340574` | +0.00 | 0.2451 | 0.0 | 4 | exact |
| **sum of all 4** | **+7.01** | | | | |

### muscle_power — signed +11

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:101186s12970021004077` | +6.70 | 0.1602 | 1.0 | 4 | exact |
| `doi:103390nu14061140` | +4.08 | 0.3251 | 0.3 | 4 | exact |
| `doi:103390nu16091324` | +0.00 | 0.1809 | 0.0 | 4 | exact |
| `doi:101111sms14629` | +0.00 | 0.1702 | 0.0 | 4 | exact |
| `doi:101186s1297001701622` | +0.00 | 0.3836 | 0.0 | 4 | exact |
| `doi:101136bjsm2005022558` | +0.00 | 0.1556 | 0.0 | 4 | unspecified |
| `doi:103305nh20132826314` | +0.00 | 0.055 | 0.0 | 4 | unspecified |
| **sum of all 7** | **+10.78** | | | | |

### muscle_strength — signed +5

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:103389fpubh20231062832` | +3.10 | 0.2067 | 0.3 | 4 | exact |
| `registry:isrctn83081058` | +2.10 | 0.1397 | 0.3 | 4 | exact |
| `doi:103390nu13030826` | -0.13 | 0.0781 | -0.03333333333333336 | 4 | unspecified |
| `registry:nct01164020` | +0.00 | 0.4196 | 0.0 | 4 | exact |
| `registry:nct01472393` | +0.00 | 0.0978 | 0.0 | 4 | unspecified |
| **sum of all 5** | **+5.07** | | | | |

### exercise_endurance — signed -10

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:103390nu14061140` | -10.40 | 0.3251 | -0.6458333333333333 | 4 | exact |
| `doi:1010801550278320242340574` | +0.00 | 0.2451 | 0.0 | 4 | exact |
| `doi:101111sms14629` | +0.00 | 0.1702 | 0.0 | 4 | exact |
| `doi:103390nu15245134` | +0.00 | 0.1108 | 0.0 | 4 | exact |
| **sum of all 4** | **-10.40** | | | | |

_`points` sum to the signed score. NEGATIVE points mean that study pushed the score down. `w` is quality (design × RoB × size × funding × OA); `s` is what it found (+1.0 meaningful benefit, +0.3 trivial/unsized, −0.7 null, −1.0 harm). The two are separate on purpose: how good a study is and what it found are different facts._

## Database snapshot (`creatine`)

_No `creatine` database files found._
