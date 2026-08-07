> **STALE — predates the 2026-08-07 scoring redesign.** This report shows the
> old signed-only score with form/dose/population in the weight. The current
> model is four arcs + a 0–100 composite; see `docs/SPEC.md` §9 and CLAUDE.md.
> Regenerated on the next run.

# BS-PROOF summary report (grok-sr)

Generated: **2026-08-07 12:41 UTC**

Ingredient: `magnesium` · Form: `magnesium_glycinate` · Mode: **grok-sr**

Auto-written after every extraction (no extra steps).

Full audit for this run: see matching `*_full.md` in `reports/runs/`.

## Grok databases

### `grok_creatine.sqlite`

Studies=200, ECUs=17, syntheses=50

| Outcome | Score | Band | n | prompt | when |
|---|---:|---|---:|---|---|
| muscle_power | 4 | inconclusive | 11 | `v1.2+grok-cli-pure-function` | 2026-08-06T21:52:09+00:00 |
| cognitive_function | 1 | inconclusive | 2 | `v1.2+grok-cli-pure-function` | 2026-08-06T21:52:09+00:00 |
| exercise_endurance | 1 | inconclusive | 8 | `v1.2+grok-cli-pure-function` | 2026-08-06T21:52:09+00:00 |
| inflammation_crp | 1 | inconclusive | 16 | `v1.2+grok-cli-pure-function` | 2026-08-06T21:52:09+00:00 |
| sleep_quality | 1 | inconclusive | 1 | `v1.2+grok-cli-pure-function` | 2026-08-06T21:52:09+00:00 |
| attention_focus | 0 | inconclusive | 4 | `v1.2+grok-cli-pure-function` | 2026-08-06T21:52:09+00:00 |
| blood_pressure | 0 | inconclusive | 1 | `v1.2+grok-cli-pure-function` | 2026-08-06T21:52:09+00:00 |
| energy_levels | 0 | inconclusive | 1 | `v1.2+grok-cli-pure-function` | 2026-08-06T21:52:09+00:00 |
| glycaemic_control | 0 | inconclusive | 5 | `v1.2+grok-cli-pure-function` | 2026-08-06T21:52:09+00:00 |
| lean_body_mass | 0 | inconclusive | 9 | `v1.2+grok-cli-pure-function` | 2026-08-06T21:52:09+00:00 |
| testosterone | 0 | inconclusive | 2 | `v1.2+grok-cli-pure-function` | 2026-08-06T21:52:09+00:00 |
| cortisol | -1 | inconclusive | 4 | `v1.2+grok-cli-pure-function` | 2026-08-06T21:52:09+00:00 |
| muscle_soreness | -1 | inconclusive | 3 | `v1.2+grok-cli-pure-function` | 2026-08-06T21:52:09+00:00 |
| muscle_strength | -2 | inconclusive | 13 | `v1.2+grok-cli-pure-function` | 2026-08-06T21:52:09+00:00 |
| sleep_duration | -2 | inconclusive | 1 | `v1.2+grok-cli-pure-function` | 2026-08-06T21:52:09+00:00 |
| sleep_onset | -2 | inconclusive | 1 | `v1.2+grok-cli-pure-function` | 2026-08-06T21:52:09+00:00 |
| adverse_events_any | -3 | inconclusive | 10 | `v1.2+grok-cli-pure-function` | 2026-08-06T21:52:09+00:00 |

### `grok_llm_cache.sqlite`

Studies=0, ECUs=0, syntheses=0

_No ECU rows._

### `grok_magnesium.sqlite`

Studies=200, ECUs=22, syntheses=52

| Outcome | Score | Band | n | prompt | when |
|---|---:|---|---:|---|---|
| inflammation_crp | 3 | inconclusive | 16 | `v1.2+grok-cli-pure-function` | 2026-08-06T22:26:09+00:00 |
| cognitive_function | 1 | inconclusive | 2 | `v1.2+grok-cli-pure-function` | 2026-08-06T22:26:09+00:00 |
| glycaemic_control | 1 | inconclusive | 1 | `v1.3+grok-cli-pure-function` | 2026-08-07T12:41:39+00:00 |
| lean_body_mass | 1 | inconclusive | 5 | `v1.3+grok-cli-pure-function` | 2026-08-07T12:41:39+00:00 |
| muscle_cramps | 1 | inconclusive | 1 | `v1.2+grok-cli-pure-function` | 2026-08-06T22:26:09+00:00 |
| anxiety | 0 | inconclusive | 1 | `v1.3+grok-cli-pure-function` | 2026-08-07T12:41:39+00:00 |
| attention_focus | 0 | inconclusive | 1 | `v1.2+grok-cli-pure-function` | 2026-08-06T22:00:21+00:00 |
| blood_pressure | 0 | inconclusive | 8 | `v1.3+grok-cli-pure-function` | 2026-08-07T12:41:39+00:00 |
| depressive_symptoms | 0 | inconclusive | 1 | `v1.3+grok-cli-pure-function` | 2026-08-07T12:41:39+00:00 |
| exercise_recovery | 0 | inconclusive | 1 | `v1.2+grok-cli-pure-function` | 2026-08-06T22:00:21+00:00 |
| memory | 0 | inconclusive | 1 | `v1.2+grok-cli-pure-function` | 2026-08-06T22:26:09+00:00 |
| serum_magnesium | 0 | inconclusive | 2 | `v1.3+grok-cli-pure-function` | 2026-08-07T12:41:39+00:00 |
| sleep_quality | 0 | inconclusive | 1 | `v1.3+grok-cli-pure-function` | 2026-08-07T12:41:39+00:00 |
| energy_levels | 0 | inconclusive | 2 | `v1.2+grok-cli-pure-function` | 2026-08-06T22:26:09+00:00 |
| sleep_onset | 0 | inconclusive | 1 | `v1.2+grok-cli-pure-function` | 2026-08-06T22:26:09+00:00 |
| adverse_events_gi | -1 | inconclusive | 1 | `v1.3+grok-cli-pure-function` | 2026-08-07T12:41:39+00:00 |
| cortisol | -1 | inconclusive | 1 | `v1.3+grok-cli-pure-function` | 2026-08-07T12:41:39+00:00 |
| muscle_soreness | -1 | inconclusive | 2 | `v1.2+grok-cli-pure-function` | 2026-08-06T22:26:09+00:00 |
| testosterone | -1 | inconclusive | 1 | `v1.3+grok-cli-pure-function` | 2026-08-07T12:41:39+00:00 |
| digestive_comfort | -2 | inconclusive | 5 | `v1.3+grok-cli-pure-function` | 2026-08-07T12:41:39+00:00 |
| adverse_events_any | -3 | inconclusive | 2 | `v1.3+grok-cli-pure-function` | 2026-08-07T12:41:39+00:00 |
| muscle_strength | -3 | inconclusive | 4 | `v1.3+grok-cli-pure-function` | 2026-08-07T12:41:39+00:00 |

## Claude pilot databases

_No `pilot*.sqlite` files._
