# BS-PROOF summary report (claude-sr-ft-inter)

Generated: **2026-10-14 18:50 UTC**


scoring_model: v14-applicability-discount

Ingredient: `creatine` · Form: `creatine_monohydrate` · Mode: **claude-sr-ft-inter**

Auto-written after every extraction (no extra steps).

Full audit: matching `*_full.md` in `reports/runs/`.

## This run — extraction stats

- Targeted studies: **139**
- Succeeded (usable): **138**
- Skipped (no text): **1**
- Partial agent failures: **1**
- Prompt version: `v1.36`
- Concurrency: 40  |  studies in flight: 40

## Token + cost accounting

- Extraction backend: **Claude subscription** (`--safe-mode`, `--max-turns 1`, one shot per call)
- Model calls: **158** (cache hits 860, failures 23)
- Input tokens: **3,230,794** (fresh 3,063 · cache-write 977,639 · cache-read 2,250,092)
- Output tokens: **274,580**
- **Spent on this run: $0.00** — subscription, not metered.
- **API-equivalent cost: $14.173** — what the same work would cost billed per token.
- Per study: **1.1 calls**, **$0.1027** API-equivalent across 138 scored studies.

| Agent | Tier | Model | Calls | Cache hits | Fail | In | Out | API-equiv |
|---|---|---|--:|--:|--:|--:|--:|--:|
| S2 | B | `claude-sonnet-5` | 57 | 0 | 2 | 480,658 | 110,402 | $2.210 |
| S3 | B | `claude-sonnet-5` | 4 | 137 | 3 | 6,561 | 908 | $0.035 |
| S4 | B | `claude-sonnet-5` | 7 | 135 | 4 | 755,123 | 1,128 | $3.168 |
| S5 | B | `claude-sonnet-5` | 11 | 132 | 5 | 875,381 | 16,721 | $3.513 |
| S5N | B | `claude-sonnet-5` | 37 | 70 | 8 | 575,960 | 89,918 | $2.021 |
| S5R | R | `claude-opus-5` | 9 | 27 | 0 | 175,188 | 18,447 | $1.854 |
| S6B | C | `claude-sonnet-5` | 27 | 88 | 0 | 308,245 | 31,459 | $1.213 |
| S7 | B | `claude-sonnet-5` | 4 | 135 | 1 | 41,522 | 2,933 | $0.123 |
| S8 | A | `claude-haiku-4-5-20251001` | 2 | 136 | 0 | 12,156 | 2,664 | $0.035 |

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
- Resolved for multiplier: **50**
_SRs never add patients; only a capped confidence boost (≤ +30%)._

## ECU scores — this run only

| Outcome | 0–100 | Verdict | effect | in your form | at your dose | evidence | n |
|---|---:|---|---|---|---|---|---:|
| muscle_power | 55 | probably works | +0.26 @ 100% | 0.80 (pooled +0.27 @ 92%) | not tested | 94% | 16 |
| attention_focus | 54 | works, but not tested for your product | +0.39 @ 100% | 0.80 (pooled +0.39 @ 100%) | not tested | 52% | 3 |
| muscle_strength | 54 | unclear | +0.19 @ 100% | 0.80 (pooled +0.16 @ 84%) | not tested | 87% | 14 |
| cortisol | 51 | barely studied | +0.30 @ 100% | 0.80 (pooled +0.30 @ 100%) | not tested | 10% | 1 |
| glycaemic_control | 51 | barely studied | +0.30 @ 100% | 0.80 (pooled +0.30 @ 100%) | not tested | 9% | 1 |
| lean_body_mass | 51 | unclear | +0.09 @ 100% | 0.80 (pooled +0.09 @ 100%) | not tested | 68% | 7 |
| memory | 51 | unclear | +0.15 @ 100% | 0.80 (pooled +0.15 @ 100%) | not tested | 41% | 3 |
| muscular_endurance | 51 | unclear | +0.13 @ 100% | 0.80 (pooled +0.00 @ 43%) | not tested | 20% | 2 |
| cognitive_function | 50 | unclear | +0.11 @ 100% | 0.80 (pooled +0.11 @ 100%) | not tested | 16% | 2 |
| depressive_symptoms | 50 | unclear | +0.05 @ 100% | 0.80 (pooled +0.05 @ 100%) | not tested | 30% | 2 |
| energy_levels | 50 | unclear | +0.00 @ 100% | 0.80 (pooled +0.00 @ 100%) | not tested | 43% | 2 |
| exercise_endurance | 50 | unclear | +0.03 @ 100% | 0.80 (pooled +0.00 @ 97%) | not tested | 75% | 5 |
| exercise_recovery | 50 | works, but not tested for your product | +0.26 @ 100% | not tested in your form | not tested | 24% | 2 |
| perceived_stress | 50 | unclear | +0.00 @ 100% | 0.80 (pooled +0.00 @ 100%) | not tested | 26% | 1 |
| sleep_duration | 50 | unclear | +0.00 @ 100% | 0.80 (pooled +0.00 @ 100%) | not tested | 31% | 2 |
| sleep_onset | 50 | unclear | +0.00 @ 100% | 0.80 (pooled +0.00 @ 100%) | not tested | 26% | 1 |
| sleep_quality | 50 | unclear | +0.00 @ 100% | 0.80 (pooled +0.00 @ 100%) | not tested | 26% | 1 |
| testosterone | 50 | unclear | +0.00 @ 100% | 0.80 (pooled +0.00 @ 100%) | not tested | 41% | 1 |
| muscle_soreness | 39 | probably does not work | -0.57 @ 100% | all negative (-1.00 @ 57%) | not tested | 42% | 2 |
| adverse_events_any | 29 | does not work | -0.84 @ 100% | 0.80 (pooled -0.84 @ 100%) | not tested | 53% | 2 |

_0–100 = 50 + signed/2, with a positive signal discounted by applicability A = mean(form strength, dose closeness); a negative signal is never softened. 50 means the evidence points nowhere. Each arc shows its verdict and the share of evidence behind it; a number near 50 with a FULL evidence arc means 'no effect found', with an EMPTY one it means 'barely studied'._


_Old rows from previous runs are not shown here._

## Which studies made each number

### muscle_power — signed +24

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:103390nu17243831` | +10.11 | 0.4585 | 1.0 | 4 | exact |
| `doi:1010801550278320262721147` | +5.30 | 0.801 | 0.3 | 4 | exact |
| `doi:101186s12970021004077` | +3.53 | 0.1602 | 1.0 | 4 | exact |
| `doi:1010801550278320232193556` | +2.43 | 0.12 | 0.9166666666666662 | 4 | exact |
| `doi:103390nu12102961` | +1.08 | 0.1626 | 0.3 | 4 | unspecified |
| `doi:103390nu14061140` | +0.83 | 0.0903 | 0.4166666666666667 | 4 | exact |
| `doi:101007s004210031031z` | +0.45 | 0.0677 | 0.3 | 4 | exact |
| `doi:1010801550278320242340574` | +0.00 | 0.1021 | 0.0 | 4 | exact |
| `doi:103390nu16091324` | +0.00 | 0.4341 | 0.0 | 4 | exact |
| `doi:101111sms14629` | +0.00 | 0.3774 | 0.0 | 4 | exact |
| `doi:103390nu15163567` | +0.00 | 0.4118 | 0.0 | 4 | exact |
| `doi:1010801550278320222108683` | +0.00 | 0.138 | 0.0 | 4 | exact |
| `doi:101186s1297002100456y` | +0.00 | 0.2733 | 0.0 | 4 | exact |
| `doi:101186s1297001701622` | +0.00 | 0.1626 | 0.0 | 4 | exact |
| `doi:101519jsc0000000000001223` | +0.00 | 0.1732 | 0.0 | 4 | exact |
| **sum of all 16** | **+23.73** | | | | |

### attention_focus — signed +19

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:103390nu17243831` | +19.27 | 0.4585 | 0.95 | 4 | exact |
| `doi:103390nu18081192` | +0.00 | 0.3948 | 0.0 | 4 | exact |
| `doi:101017s0007114510004733` | +0.00 | 0.264 | 0.0 | 4 | exact |
| **sum of all 3** | **+19.27** | | | | |

### muscle_strength — signed +16

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:103390nu10111640` | +5.28 | 0.1846 | 1.0 | 4 | unspecified |
| `doi:103389fpubh20231062832` | +4.26 | 0.496 | 0.3 | 4 | exact |
| `doi:101111sms14629` | +3.24 | 0.3774 | 0.3 | 4 | exact |
| `doi:1033549physiolres935323` | +1.37 | 0.1602 | 0.3 | 4 | exact |
| `doi:101113jphysiol2006107359` | +1.30 | 0.0887 | 0.5105820105820105 | 4 | exact |
| `registry:isrctn83081058` | +1.20 | 0.1397 | 0.3 | 4 | exact |
| `doi:103390nu13030826` | -0.18 | 0.1875 | -0.03333333333333336 | 4 | unspecified |
| `doi:101249mss0000000000003202` | +0.00 | 0.36 | 0.0 | 4 | exact |
| `doi:101186s1297002100456y` | +0.00 | 0.2733 | 0.0 | 4 | exact |
| `doi:103390nu9111169` | +0.00 | 0.05 | 0.0 | 4 | unspecified |
| `doi:103390nu8030143` | +0.00 | 0.05 | 0.0 | 4 | unspecified |
| `registry:nct01164020` | +0.00 | 0.4196 | 0.0 | 4 | exact |
| `doi:101007s1260300901248` | +0.00 | 0.1217 | 0.0 | 4 | exact |
| `doi:101007s004210031031z` | +0.00 | 0.0677 | 0.0 | 4 | exact |
| **sum of all 14** | **+16.47** | | | | |

### cortisol — signed +3

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:1033549physiolres935323` | +3.03 | 0.1602 | 0.3 | 4 | exact |
| **sum of all 1** | **+3.03** | | | | |

### glycaemic_control — signed +3

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `registry:isrctn83081058` | +2.67 | 0.1397 | 0.3 | 4 | exact |
| **sum of all 1** | **+2.67** | | | | |

### lean_body_mass — signed +6

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:1033549physiolres935323` | +1.94 | 0.1602 | 0.3 | 4 | exact |
| `registry:isrctn83081058` | +1.69 | 0.1397 | 0.3 | 4 | exact |
| `doi:1010801550278320232193556` | +1.43 | 0.12 | 0.2962962962962962 | 4 | exact |
| `doi:101007s004210031031z` | +0.82 | 0.0677 | 0.3 | 4 | exact |
| `doi:1010801550278320242340574` | +0.00 | 0.1021 | 0.0 | 4 | exact |
| `doi:101249mss0000000000003202` | +0.00 | 0.36 | 0.0 | 4 | exact |
| `doi:103390nu12010193` | +0.00 | 0.7236 | 0.0 | 4 | exact |
| **sum of all 7** | **+5.88** | | | | |

### memory — signed +6

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:101017s0007114510004733` | +4.07 | 0.264 | 0.3 | 4 | exact |
| `registry:isrctn83081058` | +2.15 | 0.1397 | 0.3 | 4 | exact |
| `doi:103390nu18081192` | +0.00 | 0.3948 | 0.0 | 4 | exact |
| **sum of all 3** | **+6.22** | | | | |

### muscular_endurance — signed +3

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:103390nu13030826` | +2.60 | 0.1875 | 0.2333333333333333 | 4 | unspecified |
| `doi:10159000013765202420230559` | +0.00 | 0.1425 | 0.0 | 4 | exact |
| **sum of all 2** | **+2.60** | | | | |

### cognitive_function — signed +2

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `registry:isrctn83081058` | +2.54 | 0.1397 | 0.3 | 4 | exact |
| `doi:1010801550278320232193556` | -0.82 | 0.12 | -0.11263318112633182 | 4 | exact |
| **sum of all 2** | **+1.72** | | | | |

### depressive_symptoms — signed +1

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:1010801550278320232193556` | +1.49 | 0.12 | 0.22222222222222224 | 4 | exact |
| `registry:nct01164020` | +0.00 | 0.4196 | 0.0 | 4 | exact |
| **sum of all 2** | **+1.49** | | | | |

### energy_levels — signed +0

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:103390nu18081192` | +0.00 | 0.3948 | 0.0 | 4 | exact |
| `doi:103390nu17243831` | +0.00 | 0.4585 | 0.0 | 4 | exact |
| **sum of all 2** | **+0.00** | | | | |

### exercise_endurance — signed +2

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:101113ep087886` | +2.06 | 0.0573 | 1.0 | 4 | unspecified |
| `doi:1010801550278320262721147` | +0.00 | 0.801 | 0.0 | 4 | exact |
| `doi:1010801550278320242340574` | +0.00 | 0.1021 | 0.0 | 4 | exact |
| `doi:101111sms14629` | +0.00 | 0.3774 | 0.0 | 4 | exact |
| `doi:103390nu12010193` | +0.00 | 0.7236 | 0.0 | 4 | exact |
| **sum of all 5** | **+2.06** | | | | |

### exercise_recovery — signed +6

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:103390nu16060896` | +6.12 | 0.3513 | 0.3 | 4 | unspecified |
| `doi:101113ep087886` | +0.00 | 0.0573 | 0.0 | 4 | unspecified |
| **sum of all 2** | **+6.12** | | | | |

### perceived_stress — signed +0

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:103390nu17243831` | +0.00 | 0.4585 | 0.0 | 4 | exact |
| **sum of all 1** | **+0.00** | | | | |

### sleep_duration — signed +0

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:103390nu17243831` | +0.00 | 0.4585 | 0.0 | 4 | exact |
| `doi:103390nu16162772` | +0.00 | 0.1048 | 0.0 | 4 | exact |
| **sum of all 2** | **+0.00** | | | | |

### sleep_onset — signed +0

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:103390nu17243831` | +0.00 | 0.4585 | 0.0 | 4 | exact |
| **sum of all 1** | **+0.00** | | | | |

### sleep_quality — signed +0

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:103390nu17243831` | +0.00 | 0.4585 | 0.0 | 4 | exact |
| **sum of all 1** | **+0.00** | | | | |

### testosterone — signed +0

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:1010801550278320252495229` | +0.00 | 0.7955 | 0.0 | 4 | exact |
| **sum of all 1** | **+0.00** | | | | |

### muscle_soreness — signed -22

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:103390nu17243831` | -22.05 | 0.4585 | -1.0 | 4 | exact |
| `doi:103390nu16060896` | +0.00 | 0.3513 | 0.0 | 4 | unspecified |
| **sum of all 2** | **-22.05** | | | | |

### adverse_events_any — signed -43

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:101186s12916023031465` | -44.41 | 1.0 | -1.0 | 4 | exact |
| `registry:isrctn83081058` | +1.86 | 0.1397 | 0.3 | 4 | exact |
| **sum of all 2** | **-42.55** | | | | |

_`points` sum to the signed score. NEGATIVE points mean that study pushed the score down. `w` is quality (design × RoB × size × funding × OA); `s` is what it found (+1.0 meaningful benefit, +0.3 trivial/unsized, −0.7 null, −1.0 harm). The two are separate on purpose: how good a study is and what it found are different facts._

## Database snapshot (`creatine`)

_No `creatine` database files found._
