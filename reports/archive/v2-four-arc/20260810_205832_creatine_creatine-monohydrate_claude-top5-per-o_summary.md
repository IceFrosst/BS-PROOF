# BS-PROOF summary report (claude-top5-per_o)

Generated: **2026-08-10 20:58 UTC**


scoring_model: v2-four-arc

Ingredient: `creatine` · Form: `creatine_monohydrate` · Mode: **claude-top5-per_o**

Auto-written after every extraction (no extra steps).

Full audit: matching `*_full.md` in `reports/runs/`.

## This run — extraction stats

- Targeted studies: **150**
- Succeeded (usable): **144**
- Skipped (no text): **6**
- Partial agent failures: **9**
- Prompt version: `v1.12`
- Concurrency: 40  |  studies in flight: 40

## Token + cost accounting

- Extraction backend: **Claude subscription** (`--safe-mode`, `--max-turns 1`, one shot per call)
- Model calls: **943** (cache hits 0, failures 102)
- Input tokens: **6,694,849** (fresh 303,412 · cache-write 1,912,788 · cache-read 4,478,649)
- Output tokens: **767,597**
- **Spent on this run: $0.00** — subscription, not metered.
- **API-equivalent cost: $32.797** — what the same work would cost billed per token.
- Per study: **6.5 calls**, **$0.2278** API-equivalent across 144 scored studies.

| Agent | Tier | Model | Calls | Cache hits | Fail | In | Out | API-equiv |
|---|---|---|--:|--:|--:|--:|--:|--:|
| S3 | B | `claude-sonnet-5` | 151 | 0 | 9 | 3,362,128 | 102,732 | $16.992 |
| S4 | B | `claude-sonnet-5` | 184 | 0 | 46 | 813,837 | 68,954 | $3.617 |
| S5 | B | `claude-sonnet-5` | 153 | 0 | 9 | 717,492 | 73,528 | $2.529 |
| S6B | C | `claude-sonnet-5` | 135 | 0 | 4 | 511,786 | 91,070 | $2.596 |
| S7 | B | `claude-sonnet-5` | 174 | 0 | 32 | 943,917 | 68,870 | $4.687 |
| S8 | A | `claude-haiku-4-5-20251001` | 146 | 0 | 2 | 345,689 | 362,443 | $2.376 |

Tier → model is pinned in `claude_adapter.TIER_MODEL` (full ids, never aliases: an alias floats to a new model while the cache key does not change). Tier A = classification, B = extraction, C = the highest-risk agent.

## Predatory journal check (flag only — not in score)

- List entries loaded: **1162**
- Studies checked: **1899**
- Publisher resolved for: **318/1899** (the list is PUBLISHERS, so this is the real coverage)
- Studies flagged predatory: **2**
- Distinct publishers flagged: **2**
- Distinct journals flagged: **0**
- Affects score: **NO (count only)**
  - [publisher] Baishideng Publishing Group Inc.
  - [publisher] Frontiers Media SA

## Systematic reviews / meta-analyses (S2)

- Requested (cap): **0**
- S2 extractions ok: **0**
- Resolved for multiplier: **0**
_SRs never add patients; only a capped confidence boost (≤ +30%)._

## ECU scores — this run only

| Outcome | 0–100 | Verdict | effect | in your form | at your dose | evidence | n |
|---|---:|---|---|---|---|---|---:|
| muscle_strength | 12 | does not work | -0.00 @ 100% | -0.50 @ 20% | not tested | 43% | 16 |
| muscle_power | 12 | does not work | -0.25 @ 100% | -0.32 @ 50% | not tested | 49% | 16 |
| lean_body_mass | 7 | works, but not tested for your product | +0.26 @ 100% | -0.35 @ 35% | not tested | 19% | 7 |
| exercise_endurance | 2 | barely studied | -0.40 @ 100% | -0.70 @ 21% | not tested | 10% | 4 |
| energy_levels | gated | not enough human evidence | not tested | not tested | not tested | not tested | 0 |

_0–100 = 100 × c × mean(effect, form, dose). Each arc shows its verdict and the share of evidence behind it. A low number with a FULL evidence arc means 'does not work'; with an EMPTY one it means 'barely studied'._


_Old rows from previous runs are not shown here._

## Database snapshot (`creatine`)

### `pilot_creatine_supp.sqlite`

Studies stored (corpus): **200** · ECUs: **0** · syntheses: **50
