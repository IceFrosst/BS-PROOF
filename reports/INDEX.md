# Report runs index

`runs/` holds runs from the **current** scoring model only.
`archive/<model>/` holds everything produced under an earlier one.

A score is only comparable to another computed the same way, so runs from
different models are never listed in the same table. `scripts/archive_reports.py`
sweeps `runs/` whenever `scoring.SCORING_MODEL` changes.

## Current model — `v2-four-arc`

| When (UTC) | Mode | Ingredient | Form | Selftest | File |
|---|---|---|---|---|---|
| 2026-08-07 14:15 UTC | grok-sr-ft | `magnesium` | `magnesium_glycinate` | summary | [runs/20260807_141550_magnesium_magnesium-glycinate_grok-sr-ft_summary.md](runs/20260807_141550_magnesium_magnesium-glycinate_grok-sr-ft_summary.md) |
| 2026-08-07 14:15 UTC | grok-sr-ft | `magnesium` | `magnesium_glycinate` | full | [runs/20260807_141550_magnesium_magnesium-glycinate_grok-sr-ft_full.md](runs/20260807_141550_magnesium_magnesium-glycinate_grok-sr-ft_full.md) |
| — | — | — | — | — | _No runs yet under this model._ |

## Archived

| Model | Runs | What it was |
|---|---:|---|
| [`v1-transfer-in-weight`](archive/v1-transfer-in-weight/) | 5 | Signed −100…+100 only; form × dose × population multiplied into `w_study`; no arcs. Superseded 2026-08-07. |
