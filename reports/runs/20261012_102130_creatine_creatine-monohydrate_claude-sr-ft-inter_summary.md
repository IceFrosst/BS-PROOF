# BS-PROOF summary report (claude-sr-ft-inter)

Generated: **2026-10-12 10:21 UTC**


scoring_model: v14-applicability-discount

Ingredient: `creatine` · Form: `creatine_monohydrate` · Mode: **claude-sr-ft-inter**

Auto-written after every extraction (no extra steps).

Full audit: matching `*_full.md` in `reports/runs/`.

## This run — extraction stats

- Targeted studies: **139**
- Succeeded (usable): **138**
- Skipped (no text): **1**
- Partial agent failures: **0**
- Prompt version: `v1.35`
- Concurrency: 40  |  studies in flight: 40

## Token + cost accounting

- Extraction backend: **Claude subscription** (`--safe-mode`, `--max-turns 1`, one shot per call)
- Model calls: **200** (cache hits 971, failures 9)
- Input tokens: **2,510,854** (fresh 388 · cache-write 1,716,217 · cache-read 794,249)
- Output tokens: **291,242**
- **Spent on this run: $0.00** — subscription, not metered.
- **API-equivalent cost: $11.765** — what the same work would cost billed per token.
- Per study: **1.4 calls**, **$0.0853** API-equivalent across 138 scored studies.

| Agent | Tier | Model | Calls | Cache hits | Fail | In | Out | API-equiv |
|---|---|---|--:|--:|--:|--:|--:|--:|
| S1 | A | `claude-haiku-4-5-20251001` | 0 | 138 | 0 | 0 | 0 | $0.000 |
| S2 | B | `claude-sonnet-5` | 0 | 55 | 0 | 0 | 0 | $0.000 |
| S3 | B | `claude-sonnet-5` | 3 | 138 | 3 | 0 | 0 | $0.000 |
| S4 | B | `claude-sonnet-5` | 0 | 138 | 0 | 0 | 0 | $0.000 |
| S5 | B | `claude-sonnet-5` | 3 | 138 | 3 | 0 | 0 | $0.000 |
| S5N | B | `claude-sonnet-5` | 60 | 42 | 3 | 896,781 | 106,011 | $3.215 |
| S5R | R | `claude-opus-5` | 17 | 19 | 0 | 284,306 | 36,839 | $3.046 |
| S5T | A | `claude-haiku-4-5-20251001` | 0 | 28 | 0 | 0 | 0 | $0.000 |
| S6B | C | `claude-sonnet-5` | 116 | 0 | 0 | 1,317,254 | 147,638 | $5.446 |
| S7 | B | `claude-sonnet-5` | 1 | 137 | 0 | 12,513 | 754 | $0.058 |
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

## Systematic reviews / meta-analyses (S2)

- Requested (cap): **60**
- S2 extractions ok: **55**
- Resolved for multiplier: **48**
_SRs never add patients; only a capped confidence boost (≤ +30%)._

## ECU scores — this run only

| Outcome | 0–100 | Verdict | effect | in your form | at your dose | evidence | n |
|---|---:|---|---|---|---|---|---:|
| attention_focus | 55 | probably works | +0.62 @ 100% | 0.80 (pooled +0.62 @ 100%) | not tested | 37% | 4 |
| sleep_quality | 54 | works, but not tested for your product | +1.00 @ 100% | 0.80 (pooled +1.00 @ 100%) | not tested | 17% | 1 |
| muscle_power | 53 | unclear | +0.17 @ 100% | 0.80 (pooled +0.20 @ 89%) | not tested | 73% | 9 |
| exercise_endurance | 52 | unclear | +0.17 @ 100% | 0.80 (pooled +0.17 @ 100%) | not tested | 58% | 5 |
| lean_body_mass | 52 | unclear | +0.13 @ 100% | 0.80 (pooled +0.12 @ 91%) | not tested | 52% | 4 |
| cognitive_function | 51 | barely studied | +0.59 @ 100% | 0.80 (pooled +0.59 @ 100%) | not tested | 9% | 1 |
| muscle_strength | 51 | unclear | +0.09 @ 100% | 0.80 (pooled +0.14 @ 70%) | not tested | 53% | 6 |
| depressive_symptoms | 50 | unclear | +0.00 @ 100% | 0.80 (pooled +0.00 @ 100%) | not tested | 24% | 1 |
| memory | 50 | barely studied | +0.00 @ 100% | 0.80 (pooled +0.00 @ 100%) | not tested | 7% | 1 |
| muscular_endurance | 50 | barely studied | +0.13 @ 100% | 0.80 (pooled +0.00 @ 43%) | not tested | 9% | 2 |
| sleep_duration | 50 | unclear | +0.08 @ 100% | 0.80 (pooled +0.08 @ 100%) | not tested | 22% | 2 |
| sleep_onset | 50 | unclear | +0.00 @ 100% | 0.80 (pooled +0.00 @ 100%) | not tested | 17% | 1 |
| testosterone | 50 | unclear | +0.00 @ 100% | 0.80 (pooled +0.00 @ 100%) | not tested | 27% | 1 |
| muscle_soreness | 42 | probably does not work | -1.00 @ 100% | all negative (-1.00 @ 100%) | not tested | 17% | 1 |
| adverse_events_any | 34 | probably does not work | -1.00 @ 100% | all negative (-1.00 @ 100%) | not tested | 33% | 1 |

_0–100 = 50 + signed/2, with a positive signal discounted by applicability A = mean(form strength, dose closeness); a negative signal is never softened. 50 means the evidence points nowhere. Each arc shows its verdict and the share of evidence behind it; a number near 50 with a FULL evidence arc means 'no effect found', with an EMPTY one it means 'barely studied'._


_Old rows from previous runs are not shown here._

## Which studies made each number

### attention_focus — signed +21

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:103390nu17243831` | +13.15 | 0.2751 | 0.95 | 4 | exact |
| `doi:103390nu18081192` | +8.28 | 0.1645 | 1.0 | 4 | exact |
| `registry:isrctn83081058` | +0.00 | 0.1397 | 0.0 | 4 | exact |
| `doi:101017s0007114510004733` | +0.00 | 0.11 | 0.0 | 4 | exact |
| **sum of all 4** | **+21.43** | | | | |

### sleep_quality — signed +17

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:103390nu17243831` | +16.80 | 0.2751 | 1.0 | 4 | exact |
| **sum of all 1** | **+16.80** | | | | |

### muscle_power — signed +12

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:101186s12970021004077` | +5.85 | 0.1602 | 1.0 | 4 | exact |
| `doi:103390nu14061140` | +3.56 | 0.3251 | 0.3 | 4 | exact |
| `doi:103390nu17243831` | +3.01 | 0.2751 | 0.3 | 4 | exact |
| `doi:1010801550278320242340574` | +0.00 | 0.2451 | 0.0 | 4 | exact |
| `doi:103390nu16091324` | +0.00 | 0.1809 | 0.0 | 4 | exact |
| `doi:101111sms14629` | +0.00 | 0.1702 | 0.0 | 4 | exact |
| `doi:101186s1297001701622` | +0.00 | 0.3836 | 0.0 | 4 | exact |
| `doi:101136bjsm2005022558` | +0.00 | 0.1556 | 0.0 | 4 | unspecified |
| `doi:103305nh20132826314` | +0.00 | 0.055 | 0.0 | 4 | unspecified |
| **sum of all 9** | **+12.42** | | | | |

### exercise_endurance — signed +9

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:103390nu12010193` | +17.32 | 0.4341 | 1.0 | 4 | exact |
| `doi:103390nu14061140` | -8.38 | 0.3251 | -0.6458333333333333 | 4 | exact |
| `doi:1010801550278320242340574` | +0.00 | 0.2451 | 0.0 | 4 | exact |
| `doi:101111sms14629` | +0.00 | 0.1702 | 0.0 | 4 | exact |
| `doi:103390nu15245134` | +0.00 | 0.1108 | 0.0 | 4 | exact |
| **sum of all 5** | **+8.94** | | | | |

### lean_body_mass — signed +7

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:101249mss0000000000003202` | +2.86 | 0.6 | 0.09876543209876537 | 4 | exact |
| `doi:1010801550278320232193556` | +2.74 | 0.1392 | 0.4074074074074074 | 4 | exact |
| `registry:nct01472393` | +1.41 | 0.0978 | 0.3 | 4 | unspecified |
| `doi:1010801550278320242340574` | +0.00 | 0.2451 | 0.0 | 4 | exact |
| **sum of all 4** | **+7.01** | | | | |

### cognitive_function — signed +5

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:1010801550278320232193556` | +5.24 | 0.1392 | 0.5874125874125872 | 4 | exact |
| **sum of all 1** | **+5.24** | | | | |

### muscle_strength — signed +5

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:103389fpubh20231062832` | +2.96 | 0.2067 | 0.3 | 4 | exact |
| `registry:isrctn83081058` | +2.00 | 0.1397 | 0.3 | 4 | exact |
| `doi:103390nu13030826` | -0.12 | 0.0781 | -0.03333333333333336 | 4 | unspecified |
| `registry:nct01164020` | +0.00 | 0.4196 | 0.0 | 4 | exact |
| `doi:101136bjsm2005022558` | +0.00 | 0.1556 | 0.0 | 4 | unspecified |
| `registry:nct01472393` | +0.00 | 0.0978 | 0.0 | 4 | unspecified |
| **sum of all 6** | **+4.84** | | | | |

### depressive_symptoms — signed +0

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `registry:nct01164020` | +0.00 | 0.4196 | 0.0 | 4 | exact |
| **sum of all 1** | **+0.00** | | | | |

### memory — signed +0

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:101017s0007114510004733` | +0.00 | 0.11 | 0.0 | 4 | exact |
| **sum of all 1** | **+0.00** | | | | |

### muscular_endurance — signed +1

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:103390nu13030826` | +1.17 | 0.0781 | 0.2333333333333333 | 4 | unspecified |
| `doi:10159000013765202420230559` | +0.00 | 0.0594 | 0.0 | 4 | exact |
| **sum of all 2** | **+1.17** | | | | |

### sleep_duration — signed +2

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:103390nu16162772` | +1.89 | 0.1074 | 0.3 | 4 | exact |
| `doi:103390nu17243831` | +0.00 | 0.2751 | 0.0 | 4 | exact |
| **sum of all 2** | **+1.89** | | | | |

### sleep_onset — signed +0

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:103390nu17243831` | +0.00 | 0.2751 | 0.0 | 4 | exact |
| **sum of all 1** | **+0.00** | | | | |

### testosterone — signed +0

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:1010801550278320252495229` | +0.00 | 0.4773 | 0.0 | 4 | exact |
| **sum of all 1** | **+0.00** | | | | |

### muscle_soreness — signed -17

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:103390nu17243831` | -16.80 | 0.2751 | -1.0 | 4 | exact |
| **sum of all 1** | **-16.80** | | | | |

### adverse_events_any — signed -33

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:101186s12916023031465` | -33.00 | 0.6 | -1.0 | 4 | exact |
| **sum of all 1** | **-33.00** | | | | |

_`points` sum to the signed score. NEGATIVE points mean that study pushed the score down. `w` is quality (design × RoB × size × funding × OA); `s` is what it found (+1.0 meaningful benefit, +0.3 trivial/unsized, −0.7 null, −1.0 harm). The two are separate on purpose: how good a study is and what it found are different facts._

## Database snapshot (`creatine`)

_No `creatine` database files found._
