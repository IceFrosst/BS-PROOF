# BS-PROOF summary report (grok-sr-ft-per_o)

Generated: **2026-08-07 15:41 UTC**


scoring_model: v2-four-arc

Ingredient: `magnesium` · Form: `magnesium_glycinate` · Mode: **grok-sr-ft-per_o**

Auto-written after every extraction (no extra steps).

Full audit: matching `*_full.md` in `reports/runs/`.

## This run — extraction stats

- Targeted studies: **54**
- Succeeded (usable): **54**
- Skipped (no text): **0**
- Partial agent failures: **13**
- Prompt version: `v1.4+grok-cli-pure-function`
- Concurrency: 50  |  studies in flight: 40

## Predatory journal check (flag only — not in score)

- List entries loaded: **0**
- Studies checked: **164**
- Studies flagged predatory: **0**
- Distinct journals flagged: **0**
- Affects score: **NO (count only)**

## Systematic reviews / meta-analyses (S2)

- Requested (cap): **4**
- S2 extractions ok: **4**
- Resolved for multiplier: **1**
_SRs never add patients; only a capped confidence boost (≤ +30%)._

## ECU scores — this run only

| Outcome | 0–100 | Verdict | effect | in your form | at your dose | evidence | n |
|---|---:|---|---|---|---|---|---:|
| serum_magnesium | 30 | probably does not work | -0.22 @ 100% | not tested | +0.11 @ 9% | 90% | 48 |
| memory | 24 | works, but not tested for your product | +0.30 @ 100% | not tested | +0.30 @ 100% | 51% | 6 |
| adverse_events_any | 19 | does not work | +0.17 @ 100% | not tested | +0.30 @ 11% | 44% | 8 |
| blood_pressure | 15 | does not work | -0.41 @ 100% | not tested | -0.30 @ 64% | 64% | 14 |
| muscle_strength | 15 | does not work | -0.42 @ 100% | not tested | +0.15 @ 11% | 48% | 8 |
| glycaemic_control | 12 | does not work | -0.34 @ 100% | not tested | -0.70 @ 58% | 70% | 17 |
| lean_body_mass | 10 | works, but not tested for your product | +0.30 @ 100% | not tested | not tested | 38% | 4 |
| cortisol | 9 | works, but not tested for your product | +0.30 @ 100% | not tested | not tested | 33% | 5 |
| muscle_cramps | 8 | barely studied | +1.00 @ 100% | +1.00 @ 100% | not tested | 12% | 2 |
| adverse_events_gi | 7 | does not work | -0.48 @ 100% | +0.30 @ 25% | -1.00 @ 60% | 23% | 5 |
| cognitive_function | 7 | barely studied | +0.15 @ 100% | not tested | +1.00 @ 50% | 12% | 6 |
| depressive_symptoms | 7 | does not work | -0.51 @ 100% | not tested | -0.70 @ 2% | 50% | 10 |
| muscle_power | 7 | works, but not tested for your product | +0.56 @ 100% | not tested | not tested | 22% | 7 |
| anxiety | 4 | does not work | -0.49 @ 100% | not tested | -0.70 @ 4% | 28% | 6 |
| perceived_stress | 4 | does not work | -0.19 @ 100% | not tested | not tested | 26% | 7 |
| digestive_comfort | 3 | does not work | -0.50 @ 100% | not tested | not tested | 26% | 5 |
| energy_levels | 2 | barely studied | -0.70 @ 100% | not tested | -0.70 @ 8% | 14% | 7 |
| exercise_recovery | 2 | barely studied | -0.35 @ 100% | not tested | -0.35 @ 100% | 7% | 2 |
| inflammation_crp | 2 | does not work | -0.70 @ 100% | not tested | -0.70 @ 96% | 21% | 4 |
| sleep_quality | 1 | barely studied | -0.70 @ 100% | not tested | not tested | 10% | 3 |
| sleep_duration | 0 | barely studied | -1.00 @ 100% | not tested | not tested | 9% | 2 |
| sleep_onset | 0 | barely studied | -0.70 @ 100% | not tested | not tested | 4% | 1 |

_0–100 = 100 × c × mean(effect, form, dose). Each arc shows its verdict and the share of evidence behind it. A low number with a FULL evidence arc means 'does not work'; with an EMPTY one it means 'barely studied'._


_Old rows from previous runs are not shown here._

## Database snapshot (`magnesium`)

### `grok_magnesium.sqlite`

Studies stored (corpus): **200** · ECUs: **22** · syntheses: **52

### `grok_magnesium_inte.sqlite`

Studies stored (corpus): **431** · ECUs: **16** · syntheses: **96

### `grok_magnesium_per_.sqlite`

Studies stored (corpus): **260** · ECUs: **22** · syntheses: **96
