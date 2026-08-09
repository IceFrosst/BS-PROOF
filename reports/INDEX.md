# Report runs index

`runs/` holds runs from the **current** scoring model only.
`archive/<model>/` holds everything produced under an earlier one.

A score is only comparable to another computed the same way, so runs from
different models are never listed in the same table. `scripts/archive_reports.py`
sweeps `runs/` whenever `scoring.SCORING_MODEL` changes.

## Current model — `v2-four-arc`

| When (UTC) | Mode | Ingredient | Form | Selftest | File |
|---|---|---|---|---|---|
| 2026-08-09 23:31 UTC | claude-top5-per_o | `creatine` | `creatine_monohydrate` | summary | [runs/20260809_233120_creatine_creatine-monohydrate_claude-top5-per-o_summary.md](runs/20260809_233120_creatine_creatine-monohydrate_claude-top5-per-o_summary.md) |
| 2026-08-09 23:31 UTC | claude-top5-per_o | `creatine` | `creatine_monohydrate` | full | [runs/20260809_233120_creatine_creatine-monohydrate_claude-top5-per-o_full.md](runs/20260809_233120_creatine_creatine-monohydrate_claude-top5-per-o_full.md) |
| 2026-08-09 23:22 UTC | claude-top5-per_o | `creatine` | `creatine_monohydrate` | summary | [runs/20260809_232219_creatine_creatine-monohydrate_claude-top5-per-o_summary.md](runs/20260809_232219_creatine_creatine-monohydrate_claude-top5-per-o_summary.md) |
| 2026-08-09 23:22 UTC | claude-top5-per_o | `creatine` | `creatine_monohydrate` | full | [runs/20260809_232219_creatine_creatine-monohydrate_claude-top5-per-o_full.md](runs/20260809_232219_creatine_creatine-monohydrate_claude-top5-per-o_full.md) |
| 2026-08-07 16:44 UTC | grok-sr-ft-per_o | `creatine` | `creatine_monohydrate` | summary | [runs/20260807_164410_creatine_creatine-monohydrate_grok-sr-ft-per-o_summary.md](runs/20260807_164410_creatine_creatine-monohydrate_grok-sr-ft-per-o_summary.md) |
| 2026-08-07 16:44 UTC | grok-sr-ft-per_o | `creatine` | `creatine_monohydrate` | full | [runs/20260807_164410_creatine_creatine-monohydrate_grok-sr-ft-per-o_full.md](runs/20260807_164410_creatine_creatine-monohydrate_grok-sr-ft-per-o_full.md) |

Pruned 2026-08-09 (founder): four earlier `v2-four-arc` magnesium runs deleted
— three 20-study and one 54-study, all superseded by the 80-study creatine run
above. Recoverable from git history if a comparison ever needs them.

## Archived

| Model | Runs | What it was |
|---|---:|---|
| [`v1-transfer-in-weight`](archive/v1-transfer-in-weight/) | 0 | Signed −100…+100 only; form × dose × population multiplied into `w_study`; no arcs. Superseded 2026-08-07. Run files pruned 2026-08-09; the build report below is kept for its measurements. |

Retained from the archive: [`20260807_creatine_pilot_build_report.md`](archive/v1-transfer-in-weight/20260807_creatine_pilot_build_report.md)
— a build report, not a scored run. It records measured facts (subscription
call costs, the `--bare` auth finding) that cannot be recovered by re-running
anything.
