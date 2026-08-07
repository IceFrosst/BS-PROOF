# Open questions between agents

**What this file is for:** one agent proposes a change that touches an invariant
or a constant, and the owning agent confirms or pushes back *before* it becomes
production behaviour. See the file-ownership table in `CLAUDE.md`.

**What it is NOT:** a changelog. Resolved items move to `docs/SPEC.md` §13 (if
they settle a constant or a rule) or to `docs/history/` (if they were an audit).
Delete them from here — a resolved item left sitting in a "pending" file is how
a fixed problem gets re-fixed by the next agent.

Last swept: **2026-08-08**.

---

## OPEN

### 1. Predatory-journal list is empty, and every run reports a clean bill

`vocab/predatory_journals.txt` contains `# PLACEHOLDER_WILL_REPLACE` (26 bytes).
`pipeline/predatory_b64/00.b64` and `01.b64` are 40 bytes each — truncated by a
bad push on 2026-08-07, and the two "restore" commits that followed restored
nothing.

Consequence, from the 2026-08-07 creatine run:

```
list entries loaded: 0 · studies checked: 262 · flagged: 0
```

No score is wrong — predatory is flag-only (`predatory.ZERO_WEIGHT = False`) —
but the report prints a clean bill of health it never earned, which is worse
than printing nothing.

**Blocked on the founder:** the source list is an xlsx that is not in the repo.
Drop it in `vocab/` and run `python3 -m pipeline.predatory_data`.

### 2. Venue factor has nowhere to go

`Study.venue_ok` is a boolean. SJR quartiles cannot be used until a real venue
factor exists, and that is a new constant — `docs/SPEC.md` §13 first.

---

## RESOLVED — kept only as pointers

| was | outcome |
|---|---|
| Form in `w_study` vs form arc | **Settled.** Now CLAUDE.md invariant 8: form, dose and population are OUT of the weight, and each is an arc carrying a verdict + coverage. Four arcs, not three. |
| `RETRIEVE_MAX_PRIMARIES = 600` | Still 600. Syntheses raised 120 → 400 on 2026-08-08 with marginal-yield stopping. |
| Run-scoped reports | Shipped; `reports/runs/` + `INDEX.md` + `latest.md`, stamped with `scoring_model`. |
| S8 model id `grok-4.3` invalid | **Fixed** — all Grok tiers default `grok-4.5`, preflight blocks placeholder ids. Grok found this; it was my error. See CLAUDE.md "Grok model tiers". |
| Creatine scores 22–32 for strength | **Diagnosed, not fixed.** The dominant cause is retrieval specificity: disease trials (Parkinson's, HIV, cancer) land in consumer outcomes through S6, and a null scores −0.7. This is `Next` item 2 in CLAUDE.md and the single most important open problem in the system. |
| SR path returns 0 resolved | **Fixed, unmeasured.** Six defects: prose payload instead of tables, a table filter matching 0/14 real tables, `q_s` measuring our own retrieval, an arbitrary cap slice, pilot-only backend, and no per-study direction. All in SPEC §13. Nothing has run end to end yet. |
