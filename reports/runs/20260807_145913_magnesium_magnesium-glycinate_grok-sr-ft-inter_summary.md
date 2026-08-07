# BS-PROOF summary report (grok-sr-ft-inter)

Generated: **2026-08-07 14:59 UTC**


scoring_model: v2-four-arc

Ingredient: `magnesium` · Form: `magnesium_glycinate` · Mode: **grok-sr-ft-inter**

Auto-written after every extraction (no extra steps).

Full audit: matching `*_full.md` in `reports/runs/`.

## This run — extraction stats

- Targeted studies: **20**
- Succeeded (usable): **20**
- Skipped (no text): **0**
- Partial agent failures: **6**
- Prompt version: `v1.3+grok-cli-pure-function`
- Concurrency: 50  |  studies in flight: 40

## Predatory journal check (flag only — not in score)

- List entries loaded: **0**
- Studies checked: **335**
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
| memory | 37 | probably does not work | +1.00 @ 100% | not tested | +1.00 @ 100% | 51% | 6 |
| serum_magnesium | 16 | does not work | -0.16 @ 100% | not tested | -0.25 @ 38% | 56% | 22 |
| depressive_symptoms | 8 | does not work | -0.41 @ 100% | not tested | -0.41 @ 100% | 37% | 7 |
| lean_body_mass | 8 | does not work | +0.30 @ 100% | not tested | not tested | 30% | 3 |
| perceived_stress | 8 | does not work | -0.19 @ 100% | not tested | -0.20 @ 87% | 26% | 7 |
| cortisol | 6 | does not work | +0.10 @ 100% | not tested | not tested | 28% | 5 |
| anxiety | 5 | does not work | -0.45 @ 100% | not tested | -0.45 @ 100% | 23% | 4 |
| glycaemic_control | 5 | does not work | -0.70 @ 100% | not tested | -0.70 @ 89% | 50% | 6 |
| muscle_strength | 5 | does not work | -0.25 @ 100% | not tested | -0.70 @ 10% | 23% | 4 |
| blood_pressure | 3 | does not work | -0.70 @ 100% | not tested | -0.70 @ 100% | 27% | 2 |
| inflammation_crp | 2 | does not work | -0.70 @ 100% | not tested | -0.70 @ 67% | 21% | 3 |
| adverse_events_any | 1 | barely studied | -0.70 @ 100% | not tested | -0.70 @ 100% | 12% | 2 |
| adverse_events_gi | 0 | does not work | -0.98 @ 100% | not tested | -1.00 @ 92% | 16% | 2 |
| energy_levels | 0 | barely studied | -0.70 @ 100% | not tested | -0.70 @ 67% | 4% | 3 |
| muscle_power | 0 | barely studied | -0.70 @ 100% | not tested | -0.70 @ 100% | 3% | 2 |
| sleep_quality | 0 | barely studied | -0.70 @ 100% | not tested | not tested | 1% | 1 |

_0–100 = 100 × c × mean(effect, form, dose). Each arc shows its verdict and the share of evidence behind it. A low number with a FULL evidence arc means 'does not work'; with an EMPTY one it means 'barely studied'._


_Old rows from previous runs are not shown here._

## Database snapshot (`magnesium`)

### `grok_magnesium.sqlite`

Studies stored (corpus): **200** · ECUs: **22** · syntheses: **52

### `grok_magnesium_inte.sqlite`

Studies stored (corpus): **431** · ECUs: **16** · syntheses: **96
