# BS-PROOF architecture (updated 2026-08-08)

**The system in text.** For a picture, use `pipeline_v2_demo.excalidraw`, which is
generated from the code. For the rules that govern changes, use `CLAUDE.md`.
This file is the middle layer: what runs, in what order.

```text
                    ┌─────────────────────────────────────┐
                    │  PRODUCT: ingredient + form (+ dose) │
                    └─────────────────┬───────────────────┘
                                      │
          ┌───────────────────────────▼───────────────────────────┐
          │  RETRIEVE (code)  Europe PMC / PubMed / CT.gov / OA   │
          │  SRs first → primaries · dedup NCT>DOI>PMID>fp        │
          └───────────────────────────┬───────────────────────────┘
                                      │
                    ┌─────────────────▼─────────────────┐
                    │  STORE  study + registry_facts      │
                    │  (SQLite now → Postgres later)      │
                    └─────────────────┬─────────────────┘
                                      │
     ┌────────────────────────────────┼────────────────────────────────┐
     │                                │                                │
     ▼                                ▼                                ▼
┌─────────────┐              ┌────────────────┐              ┌─────────────────┐
│ S2 on SRs   │              │ RCT primaries  │              │ Prefer full-text│
│ (--with-sr) │              │ S3 S4 S5 S7 S8 │              │ in batch order  │
│ → resolve   │              │ (+ S6 map)     │              │ optional FT-only│
└──────┬──────┘              └────────┬───────┘              └────────┬────────┘
       │                              │                               │
       │         ┌────────────────────▼───────────────────┐           │
       │         │  ADAPTER (only model boundary)         │           │
       │         │  claude_adapter | pilot | grok_adapter │◄──────────┘
       │         │  pure function · pinned prompt_version │
       │         └────────────────────┬───────────────────┘
       │                              │
       └──────────────┬───────────────┘
                      ▼
          ┌───────────────────────────┐
          │  ASSEMBLE (code)          │
          │  form / dose / pop match  │
          │  dose band from trials    │
          │  form transfer mix print  │
          └─────────────┬─────────────┘
                        ▼
          ┌───────────────────────────┐
          │  SCORE (code)             │
          │  w = design×RoB×size×…    │
          │  score = 100·d·c·(1−0.4H) │
          │  SR → E' only (≤+30%)     │
          └─────────────┬─────────────┘
                        ▼
          ┌───────────────────────────┐
          │  ECU rows + DONUT         │
          │  reports/ → GitHub        │
          └───────────────────────────┘
```

## Three extraction backends (never silent-merge)

| Path | Flag | Auth |
|------|------|------|
| Claude production | (default) | Claude subscription + `--safe-mode` |
| Claude pilot | `--pilot` | Claude subscription (superseded — see `pilot_adapter.py`) |
| Grok pure-function | `--grok` | Grok CLI, signed in |

## Demo / quality flags

| Flag | Effect |
|------|--------|
| `--with-sr` | S2 on meta-analyses → capped confidence boost |
| `--demo` | Exact form only + ignore population (**not production**) |
| `--full-text-only` | Score only studies with OA full text / green OA |

## Weight factors (score path)

```text
w_study = design × RoB × size × funding × OA
          × 0.85 if rob_inherited      (another team's RoB judgement)
          × 0 if retracted or venue_ok = False
```

**Form, dose and population are NOT in the weight.** Founder decision
2026-08-07: the centre number is study QUALITY only, and form/dose/population
became arcs. `FORM_FACTOR`, `DOSE_FACTOR` and `POP_FACTOR` still exist in
`scoring.py` — they feed the arcs and the missing-subset penalties, and the
`APPLY_*_IN_WEIGHT` switches are all `False`. See CLAUDE.md invariant 8.

**OA tiers:** `full_text` 1.00 · `sr_table` 0.85 · `abstract_only` 0.55. A trial
reached only through a review's table scores at `sr_table × rob_inherited` =
**0.72** of the same trial read directly (invariant 6, amended 2026-08-08).

**Venue / predatory:** flag-only, `pipeline.predatory.ZERO_WEIGHT = False`
(founder policy). The list itself is currently EMPTY — `vocab/predatory_journals.txt`
is a placeholder and the b64 chunks are truncated, so every run reports
"0 flagged" regardless. Needs the founder xlsx.

## Diagrams

| file | use |
|------|-----|
| `pipeline_v2_demo.excalidraw` | **current.** How one run works end to end, with the arcs, backends and known limits. Regenerate with `python3 scripts/write_demo_diagram.py` — it imports its constants from `pipeline/scoring.py`, so it cannot drift from the code |
| `pipeline_v1.excalidraw` | the original technical sketch. Predates the four-arc rewrite; kept for history only |

Drop either into [excalidraw.com](https://excalidraw.com) to edit.
