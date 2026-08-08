# Predatory / questionable publisher list

**Human reference:** https://www.predatoryjournals.org/the-list/publishers
**Machine source:** `stop-predatory-journals` `publishers.csv` (Beall-derived, open)

## Refresh it

```bash
python3 scripts/refresh_predatory_list.py
```

Writes `vocab/predatory_journals.txt` — one publisher per line, ~1160 entries.
The file is COMMITTED. There is no expand-on-import step any more; the
gzip+base64 chunks that used to do that were truncated in every commit they
ever appeared in, and the expander swallowed its own failure so each run
printed `list entries loaded: 0` beside `flagged: 0`.

`pipeline.predatory` now refuses quietly-broken states: under
`MIN_PLAUSIBLE_ENTRIES` (200) the run says **LIST BROKEN — "0 flagged" means
NOT CHECKED, not clean.**

## How matching works, and why it flags so little

The list is **publishers**. Europe PMC gives us a **journal title**. Matching one
inside the other is a category error:

| rule | flagged, on a 2076-study corpus |
|---|---|
| raw substring | **274 (13.2%)** — incl. *American Journal of Obstetrics and Gynecology*, *Alzheimer\'s & Dementia*, *Acta oto-laryngologica* |
| word-bounded, ≥12 chars | 47 (2.3%) — still flagged the *American Journal of…* family |
| **exact title / ISSN only (current)** | **0** |

The 13.2% run matched `'lar'` (3 characters) inside *Acta oto-**lar**yngologica*
and `'e journal'` inside *Th**e journal** of…*.

Flagging a real journal as predatory is not a scoring error — it is a
defamation-shaped error that would appear in a published report next to the
journal's real name, and `ZERO_WEIGHT = True` would eventually delete that
journal's evidence. So:

- **journal title** → exact normalised equality only
- **publisher field** → containment allowed (publisher vs publisher is what the
  list is for)
- **ISSN** → exact

Most true positives are therefore unreachable until records carry a publisher
field. That is a coverage gap, recorded in `docs/SPEC.md` §13 — not a bug.

## Policy

Flag + count only. `pipeline.predatory.ZERO_WEIGHT = False`; venue does not
change any score.
