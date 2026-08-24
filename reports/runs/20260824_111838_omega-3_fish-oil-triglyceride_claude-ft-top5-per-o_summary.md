# BS-PROOF summary report (claude-ft-top5-per_o)

Generated: **2026-08-24 11:18 UTC**


scoring_model: v12-dose-closeness

Ingredient: `omega_3` · Form: `fish_oil_triglyceride` · Mode: **claude-ft-top5-per_o**

Auto-written after every extraction (no extra steps).

Full audit: matching `*_full.md` in `reports/runs/`.

## This run — extraction stats

- Targeted studies: **8**
- Succeeded (usable): **8**
- Skipped (no text): **0**
- Partial agent failures: **8**
- Prompt version: `v1.22`
- Concurrency: 10  |  studies in flight: 10

## Token + cost accounting

- Extraction backend: **Claude subscription** (`--safe-mode`, `--max-turns 1`, one shot per call)
- Model calls: **120** (cache hits 0, failures 120)
- Input tokens: **unavailable** (not recorded for every call)
- Output tokens: **unavailable** (not recorded for every call)
- **Spent on this run: $0.00** — subscription, not metered.
- **API-equivalent cost: unavailable** — what the same work would cost billed per token.
- Per study: **15.0 calls**, **unavailable** API-equivalent across 8 scored studies.

| Agent | Tier | Model | Calls | Cache hits | Fail | In | Out | API-equiv |
|---|---|---|--:|--:|--:|--:|--:|--:|
| S3 | B | `claude-sonnet-5` | 24 | 0 | 24 | unavailable | unavailable | unavailable |
| S4 | B | `claude-sonnet-5` | 24 | 0 | 24 | unavailable | unavailable | unavailable |
| S5 | B | `claude-sonnet-5` | 24 | 0 | 24 | unavailable | unavailable | unavailable |
| S7 | B | `claude-sonnet-5` | 24 | 0 | 24 | unavailable | unavailable | unavailable |
| S8 | A | `claude-haiku-4-5-20251001` | 24 | 0 | 24 | unavailable | unavailable | unavailable |

Tier → model is pinned in `claude_adapter.TIER_MODEL` (full ids, never aliases: an alias floats to a new model while the cache key does not change). Tier A = classification, B = extraction, C = the highest-risk agent.

## Predatory journal check (flag only — not in score)

- List entries loaded: **1162**
- Studies checked: **1176**
- Publisher resolved for: **873/1176** (the list is PUBLISHERS, so this is the real coverage)
- Studies flagged predatory: **15**
- Distinct publishers flagged: **2**
- Distinct journals flagged: **0**
- Affects score: **NO (count only)**
  - [publisher] AME Publishing Company
  - [publisher] Frontiers Media SA

## Systematic reviews / meta-analyses (S2)

- Requested (cap): **0**
- S2 extractions ok: **0**
- Resolved for multiplier: **0**
_SRs never add patients; only a capped confidence boost (≤ +30%)._

## ECU scores — this run only

| Outcome | 0–100 | Verdict | effect | in your form | at your dose | evidence | n |
|---|---:|---|---|---|---|---|---:|
| inflammation_crp | gated | not enough human evidence | not tested | not tested | not tested | not tested | 0 |
| adverse_events_any | gated | not enough human evidence | not tested | not tested | not tested | not tested | 0 |
| blood_pressure | gated | not enough human evidence | not tested | not tested | not tested | not tested | 0 |
| glycaemic_control | gated | not enough human evidence | not tested | not tested | not tested | not tested | 0 |
| depressive_symptoms | gated | not enough human evidence | not tested | not tested | not tested | not tested | 0 |

_0–100 = 100 × c × mean(effect, form, dose). Each arc shows its verdict and the share of evidence behind it. A low number with a FULL evidence arc means 'does not work'; with an EMPTY one it means 'barely studied'._


_Old rows from previous runs are not shown here._

## Which studies made each number

_No scored ECU had attributable contributions._

_`points` sum to the signed score. NEGATIVE points mean that study pushed the score down. `w` is quality (design × RoB × size × funding × OA); `s` is what it found (+1.0 meaningful benefit, +0.3 trivial/unsized, −0.7 null, −1.0 harm). The two are separate on purpose: how good a study is and what it found are different facts._

## Database snapshot (`omega_3`)

_No `omega_3` database files found._
