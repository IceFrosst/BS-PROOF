# BS-PROOF summary report (claude-sr-ft-top5-per_o)

Generated: **2026-09-04 15:13 UTC**


scoring_model: v15-dose-unassessable-neutral

Ingredient: `magnesium` · Form: `magnesium_glycinate` · Mode: **claude-sr-ft-top5-per_o**

Auto-written after every extraction (no extra steps).

Full audit: matching `*_full.md` in `reports/runs/`.

## This run — extraction stats

- Targeted studies: **70**
- Succeeded (usable): **70**
- Skipped (no text): **0**
- Partial agent failures: **29**
- Prompt version: `v1.28`
- Concurrency: 40  |  studies in flight: 40

## Token + cost accounting

- Extraction backend: **Claude subscription** (`--safe-mode`, `--max-turns 1`, one shot per call)
- Model calls: **523** (cache hits 44, failures 139)
- Input tokens: **5,565,936** (fresh 166,046 · cache-write 1,803,798 · cache-read 3,596,092)
- Output tokens: **758,495**
- **Spent on this run: $0.00** — subscription, not metered.
- **API-equivalent cost: $18.907** — what the same work would cost billed per token.
- Per study: **7.5 calls**, **$0.2701** API-equivalent across 70 scored studies.

| Agent | Tier | Model | Calls | Cache hits | Fail | In | Out | API-equiv |
|---|---|---|--:|--:|--:|--:|--:|--:|
| S2 | B | `claude-sonnet-5` | 0 | 44 | 0 | 0 | 0 | $0.000 |
| S3 | B | `claude-sonnet-5` | 83 | 0 | 15 | 1,066,555 | 76,014 | $3.902 |
| S4 | B | `claude-sonnet-5` | 76 | 0 | 6 | 398,902 | 38,176 | $1.481 |
| S5 | B | `claude-sonnet-5` | 84 | 0 | 15 | 1,845,187 | 324,035 | $7.106 |
| S6B | C | `claude-sonnet-5` | 66 | 0 | 2 | 325,068 | 56,840 | $1.156 |
| S7 | B | `claude-sonnet-5` | 144 | 0 | 101 | 1,753,216 | 124,599 | $4.283 |
| S8 | A | `claude-haiku-4-5-20251001` | 70 | 0 | 0 | 177,008 | 138,831 | $0.979 |

Tier → model is pinned in `claude_adapter.TIER_MODEL` (full ids, never aliases: an alias floats to a new model while the cache key does not change). Tier A = classification, B = extraction, C = the highest-risk agent.

## Predatory journal check (flag only — not in score)

- List entries loaded: **1162**
- Studies checked: **744**
- Publisher resolved for: **556/744** (the list is PUBLISHERS, so this is the real coverage)
- Studies flagged predatory: **6**
- Distinct publishers flagged: **2**
- Distinct journals flagged: **0**
- Affects score: **NO (count only)**
  - [publisher] AME Publishing Company
  - [publisher] Frontiers Media SA

## Systematic reviews / meta-analyses (S2)

- Requested (cap): **60**
- S2 extractions ok: **44**
- Resolved for multiplier: **38**
_SRs never add patients; only a capped confidence boost (≤ +30%)._

## ECU scores — this run only

| Outcome | 0–100 | Verdict | effect | in your form | at your dose | evidence | n |
|---|---:|---|---|---|---|---|---:|
| serum_magnesium | 21 | does not work | +0.12 @ 100% | not tested in your form | +0.18 @ 61% | 50% | 3 |
| blood_pressure | 6 | works, but not tested for your product | +0.30 @ 100% | not tested in your form | +0.30 @ 80% | 16% | 1 |
| glycaemic_control | 6 | does not work | +0.00 @ 100% | not tested in your form | +0.00 @ 10% | 19% | 1 |
| adverse_events_any | gated | not enough human evidence | not tested | not tested | not tested | not tested | 0 |
| energy_levels | gated | not enough human evidence | not tested | not tested | not tested | not tested | 0 |

_0–100 = 100 × c × mean(effect, form, dose). Each arc shows its verdict and the share of evidence behind it. A low number with a FULL evidence arc means 'does not work'; with an EMPTY one it means 'barely studied'._


_Old rows from previous runs are not shown here._

## Which studies made each number

### serum_magnesium — signed +6

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `registry:nct02837328` | +6.10 | 0.425 | 0.3 | 4 | different |
| `registry:nct02235805` | +0.00 | 0.3074 | 0.0 | 4 | different |
| `doi:101038s41598017002059` | +0.00 | 0.3089 | 0.0 | 4 | different |
| **sum of all 3** | **+6.10** | | | | |

### blood_pressure — signed +5

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:101186s129700150081z` | +4.90 | 0.2673 | 0.3 | 4 | different |
| **sum of all 1** | **+4.90** | | | | |

### glycaemic_control — signed +0

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:101038s41598017002059` | +0.00 | 0.3089 | 0.0 | 4 | different |
| **sum of all 1** | **+0.00** | | | | |

_`points` sum to the signed score. NEGATIVE points mean that study pushed the score down. `w` is quality (design × RoB × size × funding × OA); `s` is what it found (+1.0 meaningful benefit, +0.3 trivial/unsized, −0.7 null, −1.0 harm). The two are separate on purpose: how good a study is and what it found are different facts._

## Database snapshot (`magnesium`)

_No `magnesium` database files found._
