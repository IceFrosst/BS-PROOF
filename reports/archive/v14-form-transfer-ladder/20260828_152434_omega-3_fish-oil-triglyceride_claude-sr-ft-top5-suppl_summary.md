# BS-PROOF summary report (claude-sr-ft-top5-suppl)

Generated: **2026-08-28 15:24 UTC**


scoring_model: v14-form-transfer-ladder

Ingredient: `omega_3` · Form: `fish_oil_triglyceride` · Mode: **claude-sr-ft-top5-suppl**

Auto-written after every extraction (no extra steps).

Full audit: matching `*_full.md` in `reports/runs/`.

## This run — extraction stats

- Targeted studies: **130**
- Succeeded (usable): **130**
- Skipped (no text): **0**
- Partial agent failures: **3**
- Prompt version: `v1.28`
- Concurrency: 40  |  studies in flight: 40

## Token + cost accounting

- Extraction backend: **Claude subscription** (`--safe-mode`, `--max-turns 1`, one shot per call)
- Model calls: **80** (cache hits 753, failures 17)
- Input tokens: **874,315** (fresh 20,509 · cache-write 390,802 · cache-read 463,004)
- Output tokens: **121,343**
- **Spent on this run: $0.00** — subscription, not metered.
- **API-equivalent cost: $3.171** — what the same work would cost billed per token.
- Per study: **0.6 calls**, **$0.0244** API-equivalent across 130 scored studies.

| Agent | Tier | Model | Calls | Cache hits | Fail | In | Out | API-equiv |
|---|---|---|--:|--:|--:|--:|--:|--:|
| S2 | B | `claude-sonnet-5` | 0 | 50 | 0 | 0 | 0 | $0.000 |
| S3 | B | `claude-sonnet-5` | 17 | 119 | 8 | 207,943 | 16,684 | $0.719 |
| S4 | B | `claude-sonnet-5` | 9 | 121 | 0 | 46,899 | 4,750 | $0.192 |
| S5 | B | `claude-sonnet-5` | 17 | 118 | 6 | 358,738 | 50,842 | $1.282 |
| S6B | C | `claude-sonnet-5` | 13 | 106 | 0 | 61,081 | 12,098 | $0.238 |
| S7 | B | `claude-sonnet-5` | 15 | 118 | 3 | 179,283 | 14,397 | $0.595 |
| S8 | A | `claude-haiku-4-5-20251001` | 9 | 121 | 0 | 20,371 | 22,572 | $0.145 |

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
- S2 extractions ok: **50**
- Resolved for multiplier: **42**
_SRs never add patients; only a capped confidence boost (≤ +30%)._

## ECU scores — this run only

| Outcome | 0–100 | Verdict | effect | in your form | at your dose | evidence | n |
|---|---:|---|---|---|---|---|---:|
| inflammation_crp | 23 | works, but weakly evidenced | +0.29 @ 100% | 0.24 (pooled -0.02 @ 32%) | +0.00 @ 10% | 72% | 7 |
| glycaemic_control | 8 | does not work | +0.08 @ 100% | 0.24 | not tested | 28% | 2 |
| blood_pressure | 3 | barely studied | +0.40 @ 100% | 0.24 | not tested | 8% | 1 |
| adverse_events_any | gated | not enough human evidence | not tested | not tested | not tested | not tested | 0 |
| depressive_symptoms | gated | not enough human evidence | not tested | not tested | not tested | not tested | 0 |

_0–100 = 100 × c × mean(effect, form, dose). Each arc shows its verdict and the share of evidence behind it. A low number with a FULL evidence arc means 'does not work'; with an EMPTY one it means 'barely studied'._


_Old rows from previous runs are not shown here._

## Which studies made each number

### inflammation_crp — signed +20

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:103390nu18030539` | +7.08 | 0.1975 | 1.0 | 4 | unspecified |
| `registry:nct02637778` | +4.87 | 0.136 | 1.0 | 4 | unspecified |
| `doi:103390nu15214516` | +4.66 | 0.1301 | 1.0 | 4 | unspecified |
| `registry:nct06480812` | +3.74 | 0.15 | 0.6966666666666665 | 4 | unspecified |
| `doi:103390nu16010097` | -0.36 | 0.6 | -0.01666666666666668 | 4 | exact |
| `doi:103390nu17213408` | +0.00 | 0.3222 | 0.0 | 4 | unspecified |
| `doi:103390md23040139` | +0.00 | 0.36 | 0.0 | 4 | unspecified |
| **sum of all 7** | **+19.99** | | | | |

### glycaemic_control — signed +2

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `registry:nct02637778` | +2.31 | 0.136 | 0.3 | 4 | unspecified |
| `doi:103390md23040139` | +0.00 | 0.36 | 0.0 | 4 | unspecified |
| **sum of all 2** | **+2.31** | | | | |

### blood_pressure — signed +3

| Study | points | w (quality) | s (direction) | rank | form |
|---|--:|--:|--:|--:|---|
| `doi:103390nu15214516` | +3.32 | 0.1301 | 0.4000000000000001 | 4 | unspecified |
| **sum of all 1** | **+3.32** | | | | |

_`points` sum to the signed score. NEGATIVE points mean that study pushed the score down. `w` is quality (design × RoB × size × funding × OA); `s` is what it found (+1.0 meaningful benefit, +0.3 trivial/unsized, −0.7 null, −1.0 harm). The two are separate on purpose: how good a study is and what it found are different facts._

## Database snapshot (`omega_3`)

_No `omega_3` database files found._
