# BS-PROOF summary report (claude-sr-ft-top5-suppl)

Generated: **2026-08-27 19:46 UTC**


scoring_model: v13-universal-negative-contract

Ingredient: `omega_3` · Form: `fish_oil_triglyceride` · Mode: **claude-sr-ft-top5-suppl**

Auto-written after every extraction (no extra steps).

Full audit: matching `*_full.md` in `reports/runs/`.

## This run — extraction stats

- Targeted studies: **18**
- Succeeded (usable): **18**
- Skipped (no text): **0**
- Partial agent failures: **0**
- Prompt version: `v1.28`
- Concurrency: 40  |  studies in flight: 40

## Token + cost accounting

- Extraction backend: **Claude subscription** (`--safe-mode`, `--max-turns 1`, one shot per call)
- Model calls: **151** (cache hits 0, failures 8)
- Input tokens: **1,405,294** (fresh 42,403 · cache-write 628,080 · cache-read 734,811)
- Output tokens: **264,135**
- **Spent on this run: $0.00** — subscription, not metered.
- **API-equivalent cost: $5.699** — what the same work would cost billed per token.
- Per study: **8.4 calls**, **$0.3166** API-equivalent across 18 scored studies.

| Agent | Tier | Model | Calls | Cache hits | Fail | In | Out | API-equiv |
|---|---|---|--:|--:|--:|--:|--:|--:|
| S2 | B | `claude-sonnet-5` | 38 | 0 | 2 | 286,912 | 82,357 | $1.586 |
| S3 | B | `claude-sonnet-5` | 18 | 0 | 0 | 216,977 | 20,030 | $0.844 |
| S4 | B | `claude-sonnet-5` | 18 | 0 | 0 | 86,423 | 8,135 | $0.327 |
| S5 | B | `claude-sonnet-5` | 21 | 0 | 3 | 462,981 | 69,519 | $1.592 |
| S6B | C | `claude-sonnet-5` | 17 | 0 | 0 | 82,991 | 10,263 | $0.253 |
| S7 | B | `claude-sonnet-5` | 21 | 0 | 3 | 222,161 | 22,443 | $0.760 |
| S8 | A | `claude-haiku-4-5-20251001` | 18 | 0 | 0 | 46,849 | 51,388 | $0.337 |

Tier → model is pinned in `claude_adapter.TIER_MODEL` (full ids, never aliases: an alias floats to a new model while the cache key does not change). Tier A = classification, B = extraction, C = the highest-risk agent.

## Predatory journal check (flag only — not in score)

- List entries loaded: **1162**
- Studies checked: **576**
- Publisher resolved for: **396/576** (the list is PUBLISHERS, so this is the real coverage)
- Studies flagged predatory: **4**
- Distinct publishers flagged: **2**
- Distinct journals flagged: **0**
- Affects score: **NO (count only)**
  - [publisher] AME Publishing Company
  - [publisher] Frontiers Media SA

## Systematic reviews / meta-analyses (S2)

- Requested (cap): **60**
- S2 extractions ok: **36**
- Resolved for multiplier: **32**
_SRs never add patients; only a capped confidence boost (≤ +30%)._

## ECU scores — this run only

| Outcome | 0–100 | Verdict | effect | in your form | at your dose | evidence | n |
|---|---:|---|---|---|---|---|---:|
| inflammation_crp | 3 | barely studied | +0.70 @ 100% | not tested in your form | not tested | 10% | 1 |
| adverse_events_any | gated | not enough human evidence | not tested | not tested | not tested | not tested | 0 |
| blood_pressure | gated | not enough human evidence | not tested | not tested | not tested | not tested | 0 |
| glycaemic_control | gated | not enough human evidence | not tested | not tested | not tested | not tested | 0 |
| depressive_symptoms | gated | not enough human evidence | not tested | not tested | not tested | not tested | 0 |

_0–100 = 100 × c × mean(effect, form, dose). Each arc shows its verdict and the share of evidence behind it. A low number with a FULL evidence arc means 'does not work'; with an EMPTY one it means 'barely studied'._


_Old rows from previous runs are not shown here._

## Which studies made each number

### inflammation_crp — signed +7

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `registry:nct06480812` | +6.62 | 0.15 | 0.6966666666666665 | 4 | unspecified |
| **sum of all 1** | **+6.62** | | | | |

_`points` sum to the signed score. NEGATIVE points mean that study pushed the score down. `w` is quality (design × RoB × size × funding × OA); `s` is what it found (+1.0 meaningful benefit, +0.3 trivial/unsized, −0.7 null, −1.0 harm). The two are separate on purpose: how good a study is and what it found are different facts._

## Database snapshot (`omega_3`)

_No `omega_3` database files found._
