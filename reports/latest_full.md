> **STALE — predates the 2026-08-07 scoring redesign.** This report shows the
> old signed-only score with form/dose/population in the weight. The current
> model is four arcs + a 0–100 composite; see `docs/SPEC.md` §9 and CLAUDE.md.
> Regenerated on the next run.

# BS-PROOF full audit report (grok-sr)

Generated: **2026-08-07 12:41 UTC**

Ingredient: `magnesium` · Form: `magnesium_glycinate` · Mode: **grok-sr**

Auto-written with the summary after every extraction.

## How the score is built

Deterministic (`pipeline/scoring.py`). Models extract fields only.

```text
w = design × RoB × size × funding × OA × form × dose × pop
    (0 if retracted or predatory venue)
score = clamp(round(100 × d × c × (1 − 0.4 × H)), −100, +100)
```

SRs (`--with-sr`) only raise confidence E′, never invent patients.
Predatory list: human ref https://www.predatoryjournals.org/the-list/publishers

## Selftest: **PASS**

```text
  PASS  filter miss falls back to all tables, never to nothing  the heuristic filters; S2 decides

EFFECTIVE DOSE BAND (derived, not invented)
  PASS  band is the observed benefit range, nothing chosen  a percentile or margin would be a new free constant
  PASS  null doses reported separately  a dose where trials found NOTHING is the useful warning
  PASS  undosed trial excluded, never guessed  
  PASS  no dosed benefit trial -> no band, band_version 0  
  PASS  dose inside the band  
  PASS  just under the low end  
  PASS  far under  
  PASS  far over  
  PASS  interval straddling a tier edge REFUSES to pick  rounding to the likelier side would silently move the score
  PASS  no band -> unspecified, not a free pass  

DONUT (score in the centre, arc = confidence)
  PASS  arc length tracks c, not the score  same +4 -- one is genuine conflict, one is nobody-has-looked
  PASS  gated row draws an EMPTY ring  'no number' must not look like 'zero'
  PASS  gated centre is not a number  
  PASS  sign is shown explicitly  
  PASS  band drives colour  inconclusive is grey, never pale green
  PASS  confidence has plain-words labels  
  PASS  svg is self-contained  

THREE-ARC DONUT (effect / form / dose)
  PASS  three independent fills, not thirds of one total  they do not sum to anything -- each is its own condition
  PASS  unassessed dose is None, NOT zero  'we did not check' and 'your dose is wrong' are opposite messages
  PASS  unassessed arc renders hatched  
  PASS  measured arcs are not hatched  
  PASS  form arc reflects the exact-form share only  

STORAGE (SQLite on a Postgres-shaped schema)
  PASS  studies persisted  
  PASS  unclassified queryable as the S1 budget  
  PASS  refuses records that skipped dedup  no _canonical -> one trial would land four times
  PASS  ECU round-trips  
  PASS  audit trail links study to ECU  every published number must be reconstructible
  PASS  band_version bump invalidates cached ECUs  SPEC section 5 complexity flag, made queryable
  PASS  re-scoring updates in place, no duplicate row  

ALL PASSED
```

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

## Notes

- Claude and Grok scores are **never merged**.

- Predatory venues (list) get weight 0 when journal/publisher matches.

- Inconclusive scores with low n are often the confidence ceiling (SPEC 13), not a bug.
