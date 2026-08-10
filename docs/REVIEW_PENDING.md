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

### 1. Predatory list flags nothing, and that is now deliberate

**Fixed 2026-08-08, but read the second half.**

The list is real again — 1162 publishers, fetched by
`scripts/refresh_predatory_list.py` and committed. The old gzip+base64 chunks
were truncated in every commit they ever appeared in (4400 → 1988 → 0 → 40
bytes, each described as "the full list"), so the list had never once loaded.

The bigger defect was hiding behind that. With the list present, the substring
matcher flagged **274 of 2076 studies (13.2%)** including *American Journal of
Obstetrics and Gynecology* and *Acta oto-laryngologica* — on entries like
`'lar'` and `'e journal'`. Matching is now exact-only on journal titles.

**Open question for the founder:** matching a PUBLISHER list against a JOURNAL
title reaches almost nothing, so the current honest answer is 0 flagged. To make
this useful we need a publisher field on each record. Crossref returns one per
DOI. Worth a resolver call, or worth dropping the feature?

### 2. Venue factor has nowhere to go

`Study.venue_ok` is a boolean. SJR quartiles cannot be used until a real venue
factor exists, and that is a new constant — `docs/SPEC.md` §13 first.

### 3. The anchor bands and the null penalty contradict each other — FOUNDER CALL

**Raised 2026-08-10. This is the blocking question for anchor eval, and it is not
a bug report — three things could be wrong and only the founder may pick.**

Commit `333c0db` recorded "Anchor #1 fails: creatine scores −6 where the set
expects +80..+95" and treated it as a probable sign error. It is not. Run
`python3 -m pipeline.calibration` and read the new feasibility table:

| anchor | floor | max null-effect share that still reaches it |
|---|---:|---:|
| #2 folic acid / NTD | +85 | **6.4%** |
| #3 vitamin D / 25OHD | +85 | **6.4%** |
| #4 iron / haemoglobin | +85 | **6.4%** |
| #1 creatine / strength | +80 | **8.6%** |
| #5 caffeine / endurance | +75 | **11.1%** |

Those are ceilings at *perfect* confidence, no risk of bias, no funding penalty,
every non-null study maximally positive. So anchor #1 requires **≥91% of every
extracted claim across the creatine corpus to be `benefit_meaningful`** — on the
most-studied sports supplement in existence. Real literature does not look like
that at the individual-trial level.

Why this was not visible before: `H` is not a free parameter. `score_ecu` derives
it from the weighted variance of the same `s_i` that produce `d`, so a corpus
cannot have a high mean and a low spread. Any back-of-envelope that holds `H`
constant overstates every reachable score — including the first estimate made
while investigating this, which read +91.5 at 5% nulls where the truth is +88.2.

Three candidates, all legitimate, one founder decision:

1. **`S_VALUE["null_effect"] = −0.7`** prices a well-run null at 70% of documented
   *harm*. Invariant 4 constant, "awaiting Tier-3 calibration". If a null belongs
   nearer 0 than −1, every ceiling above moves up sharply.
2. **`H_PENALTY = 0.4`** punishes exactly the mixed literature any real ingredient
   produces, and it is what pulls +83 down to +77 at a 10% null share.
3. **The bands.** `docs/ANCHORS.md` says it plainly: *"Every band boundary here was
   set by judgment, not measurement… a 'failure' may be a wrong anchor."* Five
   confidence-A anchors were written expecting a textbook result to score like a
   textbook, which may simply not be what this formula means.

**Do not tune any of them to make an anchor pass** — `pipeline/calibration.py`'s
docstring and invariant 4 both forbid it, and it would make the score meaningless
while turning the harness green.

Also unresolved and interacting: the run behind the −6 lost **~145 model calls to
the subscription session limit** (S3 29, S4 32, S5 28, S7 32, S8 26). Since
`Study.direction` defaults to `null_effect` = −0.7, a truncated corpus biases the
score negative *by construction*, so −6 is not a clean measurement of anything.
A clean re-run inside the session budget must precede any conclusion here.

Pinned meanwhile by `pipeline/selftest.py` → `ANCHOR BAND FEASIBILITY`, so the
five tolerances cannot move without turning the suite red.

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
