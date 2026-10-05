# BS-PROOF summary report (claude-sr-ft-top5-suppl)

Generated: **2026-10-05 08:00 UTC**


scoring_model: v14-applicability-discount

Ingredient: `creatine` · Form: `creatine_monohydrate` · Mode: **claude-sr-ft-top5-suppl**

Auto-written after every extraction (no extra steps).

Full audit: matching `*_full.md` in `reports/runs/`.

## This run — extraction stats

- Targeted studies: **99**
- Succeeded (usable): **98**
- Skipped (no text): **1**
- Partial agent failures: **0**
- Prompt version: `v1.35`
- Concurrency: 40  |  studies in flight: 40

## Token + cost accounting

- Extraction backend: **Claude subscription** (`--safe-mode`, `--max-turns 1`, one shot per call)
- Model calls: **94** (cache hits 745, failures 8)
- Input tokens: **837,479** (fresh 176 · cache-write 479,149 · cache-read 358,154)
- Output tokens: **272,771**
- **Spent on this run: $0.00** — subscription, not metered.
- **API-equivalent cost: $5.248** — what the same work would cost billed per token.
- Per study: **1.0 calls**, **$0.0535** API-equivalent across 98 scored studies.

| Agent | Tier | Model | Calls | Cache hits | Fail | In | Out | API-equiv |
|---|---|---|--:|--:|--:|--:|--:|--:|
| S1 | A | `claude-haiku-4-5-20251001` | 0 | 98 | 0 | 0 | 0 | $0.000 |
| S2 | B | `claude-sonnet-5` | 57 | 0 | 2 | 469,349 | 214,083 | $3.168 |
| S3 | B | `claude-sonnet-5` | 3 | 98 | 3 | 0 | 0 | $0.000 |
| S4 | B | `claude-sonnet-5` | 0 | 98 | 0 | 0 | 0 | $0.000 |
| S5 | B | `claude-sonnet-5` | 3 | 98 | 3 | 0 | 0 | $0.000 |
| S5N | B | `claude-sonnet-5` | 12 | 46 | 0 | 188,394 | 35,280 | $0.861 |
| S5R | R | `claude-opus-5` | 5 | 19 | 0 | 85,561 | 10,168 | $0.886 |
| S5T | A | `claude-haiku-4-5-20251001` | 0 | 24 | 0 | 0 | 0 | $0.000 |
| S6B | C | `claude-sonnet-5` | 14 | 68 | 0 | 94,175 | 13,240 | $0.333 |
| S7 | B | `claude-sonnet-5` | 0 | 98 | 0 | 0 | 0 | $0.000 |
| S8 | A | `claude-haiku-4-5-20251001` | 0 | 98 | 0 | 0 | 0 | $0.000 |

Tier → model is pinned in `claude_adapter.TIER_MODEL` (full ids, never aliases: an alias floats to a new model while the cache key does not change). Tier A = classification, B = extraction, C = the highest-risk agent.

## Predatory journal check (flag only — not in score)

- List entries loaded: **1162**
- Studies checked: **588**
- Publisher resolved for: **398/588** (the list is PUBLISHERS, so this is the real coverage)
- Studies flagged predatory: **4**
- Distinct publishers flagged: **1**
- Distinct journals flagged: **0**
- Affects score: **NO (count only)**
  - [publisher] Frontiers Media SA

## Systematic reviews / meta-analyses (S2)

- Requested (cap): **60**
- S2 extractions ok: **55**
- Resolved for multiplier: **48**
_SRs never add patients; only a capped confidence boost (≤ +30%)._

## ECU scores — this run only

| Outcome | 0–100 | Verdict | effect | in your form | at your dose | evidence | n |
|---|---:|---|---|---|---|---|---:|
| muscle_power | 53 | unclear | +0.23 @ 100% | 0.80 (pooled +0.25 @ 95%) | not tested | 52% | 5 |
| muscle_strength | 51 | unclear | +0.24 @ 100% | 0.80 (pooled +0.30 @ 82%) | not tested | 26% | 3 |
| lean_body_mass | 51 | unclear | +0.12 @ 100% | 0.80 (pooled +0.12 @ 100%) | not tested | 50% | 3 |
| exercise_endurance | 45 | unclear | -0.31 @ 100% | 0.80 (pooled -0.31 @ 100%) | not tested | 36% | 3 |
| energy_levels | gated | not enough human evidence | not tested | not tested | not tested | not tested | 0 |

_0–100 = 50 + signed/2, with a positive signal discounted by applicability A = mean(form strength, dose closeness); a negative signal is never softened. 50 means the evidence points nowhere. Each arc shows its verdict and the share of evidence behind it; a number near 50 with a FULL evidence arc means 'no effect found', with an EMPTY one it means 'barely studied'._


_Old rows from previous runs are not shown here._

## Which studies made each number

### muscle_power — signed +12

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:101186s12970021004077` | +7.32 | 0.1602 | 1.0 | 4 | exact |
| `doi:103390nu14061140` | +4.46 | 0.3251 | 0.3 | 4 | exact |
| `doi:103390nu16091324` | +0.00 | 0.1809 | 0.0 | 4 | exact |
| `doi:101186s1297001701622` | +0.00 | 0.3836 | 0.0 | 4 | exact |
| `doi:103305nh20132826314` | +0.00 | 0.055 | 0.0 | 4 | unspecified |
| **sum of all 5** | **+11.78** | | | | |

### muscle_strength — signed +6

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:103389fpubh20231062832` | +3.70 | 0.2067 | 0.3 | 4 | exact |
| `registry:isrctn83081058` | +2.50 | 0.1397 | 0.3 | 4 | exact |
| `doi:103390nu13030826` | -0.16 | 0.0781 | -0.03333333333333336 | 4 | unspecified |
| **sum of all 3** | **+6.04** | | | | |

### lean_body_mass — signed +6

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:101249mss0000000000003202` | +2.97 | 0.6 | 0.09876543209876537 | 4 | exact |
| `doi:1010801550278320232193556` | +2.84 | 0.1392 | 0.4074074074074074 | 4 | exact |
| `doi:1010801550278320242340574` | +0.00 | 0.2451 | 0.0 | 4 | exact |
| **sum of all 3** | **+5.81** | | | | |

### exercise_endurance — signed -11

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:103390nu14061140` | -10.94 | 0.3251 | -0.6458333333333333 | 4 | exact |
| `doi:1010801550278320242340574` | +0.00 | 0.2451 | 0.0 | 4 | exact |
| `doi:103390nu15245134` | +0.00 | 0.1108 | 0.0 | 4 | exact |
| **sum of all 3** | **-10.94** | | | | |

_`points` sum to the signed score. NEGATIVE points mean that study pushed the score down. `w` is quality (design × RoB × size × funding × OA); `s` is what it found (+1.0 meaningful benefit, +0.3 trivial/unsized, −0.7 null, −1.0 harm). The two are separate on purpose: how good a study is and what it found are different facts._

## Database snapshot (`creatine`)

_No `creatine` database files found._
