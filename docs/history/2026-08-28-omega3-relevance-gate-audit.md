# Audit — the relevance gate on omega-3: precision 1.00, recall 0.067

**Date:** 2026-08-28 · **Subject:** run `20260827_194637_omega-3_fish-oil-triglyceride_claude-sr-ft-top5-suppl`
· **Method:** deterministic replay of `pipeline.relevance.relevance_check`, zero model calls
· **Per-study table:** `2026-08-28-omega3-relevance-gate-audit.csv` (378 rows)

## Verdict

**The gate is not doing its job on omega-3.** It rejects nothing it should keep out
(precision 1.00, zero false positives) and discards **93% of what it should let
through**. Of 378 studies handed to it, 267 were real omega-3 trials; **18** reached
extraction.

| | count | share |
|---|--:|--:|
| gate input (RCT-rank, full text or green OA) | 378 | |
| true positives — omega-3 trial, kept | **18** | 4.8% |
| false positives — non-omega-3 kept | **0** | 0.0% |
| **false negatives — omega-3 trial, dropped** | **249** | **65.9%** |
| true negatives — correctly dropped | 111 | 29.4% |

**precision 1.00 · recall 0.067.** Reconciles exactly with the run: 326 full-text
+ 52 green-OA = 378 in, 16 + 2 = 18 out.

All 249 false negatives were dropped with the same reason string:
`"ingredient not in title/abstract"` — reported in the run log as
*"dropped 360 noise"*, which reads like the gate working.

## Root cause: a vocab id is not a spelling

`relevance_check` converts the vocab id to text with underscore→space
(`pipeline/relevance.py:69`), giving `omega_3` → `"omega 3"`, then requires that
**literal substring** in title or abstract. The literature writes **`omega-3`**.

```
DROP  omega_3  'ingredient not in title/abstract'  "Effect of omega-3 supplementation on CRP: an RCT"
PASS  omega_3  'ingredient in title'               "Effect of omega 3 supplementation on CRP: an RCT"
```

This is the **same class of defect** as the `vitamin_d` incident documented in the
file's own comment (2026-08-09, "dropped ALL 175 as ingredient not in
title/abstract"). That fix addressed the symptom — one substitution — not the
class: **a vocab id is not a spelling, and one substitution is not a synonym set.**

### Retrieval and the gate disagree about the same string

`sources.europepmc.search_term("omega_3")` also returns `"omega 3"`, but Europe PMC
**tokenizes**, so it matched hyphenated papers correctly and retrieved a genuine
600-primary omega-3 corpus. The gate then rejected that corpus with an **exact
Python substring check** on the identical string. Retrieval was never the problem
here; the tokenized-search / exact-match asymmetry is.

### It is not omega-3-specific

Two of the 19 vocab ingredients are silently zeroed by their canonical spelling:

| ingredient | literature spelling | gate |
|---|---|---|
| `omega_3` | `omega-3` | **DROP** |
| `beta_carotene` | `beta-carotene`, `β-carotene` | **DROP** |
| `vitamin_d`, `folic_acid`, `ginkgo_biloba`, `magnesium`, … | space or single word | PASS |

`beta_carotene` has never been run. It would fail the same way, for the same
reason, and report it as noise.

## What was lost, conservatively

The 249 false negatives, refined by how strong the evidence is that each is a
scoreable single-ingredient trial:

| bucket | n | note |
|---|--:|---|
| **clean omega-3 trial, named in TITLE** | **149** | no co-intervention marker, no secondary-analysis language — **indefensible drops** |
| abstract-level, unclassified | 49 | omega-3 + intervention phrasing in abstract |
| secondary / ancillary analysis | 28 | e.g. VITAL Rhythm sex-differences analysis — downstream rules should judge these |
| co-supplementation / factorial | 23 | invariant 7's `no_isolated_ingredient_arm` should judge these |

**149 is the robust floor.** The last two buckets (51) would very likely be refused
downstream anyway — but by rules built to make that judgement, for a stated
reason, not by a spelling accident.

Beyond spelling, a second tier is lost to synonyms: of the 171 records with no
`omega 3`/`omega-3` spelling at all, **62 name only a synonym** — 44 EPA/DHA,
18 fish oil, 17 PUFA, 11 n-3, 5 krill/algal/cod. `vocab/form.json` has no synonym
field for the gate to read.

Counterfactual, simulated without touching `pipeline/`: making rule 1 hyphen-aware
alone takes the kept corpus from **16 → 155 of 326** full-text records (**8.7×**),
with every other rule unchanged.

## The survivors are a biased sample, not a small one

This is the part that matters more than the count. Every one of the 18 passed on an
**orthographic accident** — the one place a paper happened to type a space. The
accident is not random:

```
nct05581108   "...925 mg blend of algae-derived omega 3-, 7-, and 9-FA"   <- space from a LIST
nct01683565   "...oleic acid (omega 3-6-9) on caregiver..."               <- space from a LIST
nct03550209   "...Omega 3-6 treatment was associated..."                  <- space from a LIST
epi412892     "...allocated either to placebo or to PS-Omega 3 group"     <- combination product
bmri6654492   "...favorable effects on serum omega 3 fatty acids"         <- BEETROOT trial; omega-3 is an OUTCOME
nh05747       "...combining arginine, omega 3 fatty acids, and..."        <- immunonutrition blend
```

Hyphenated prose (`omega-3`) is how a **single-ingredient** trial writes it.
A space survives most often in **multi-ingredient product names** (`omega 3-6-9`,
`omega 3, 7, and 9`) and in prose treating omega-3 as a **measured analyte**. So the
gate selected *for* blends and biomarker papers and *against* clean trials.

That fully explains three downstream numbers previously logged as separate puzzles:

- **form transfer was 100% `unspecified ×0.3`** (7/7 claims) — no surviving trial
  named a triglyceride or ethyl-ester form, because blends don't.
- **8 of 18 trials could not vote**, including 3 `no_isolated_ingredient_arm` —
  the survivors *are* combination designs.
- **4 of 5 showcase outcomes gated at n=0.**

## The one score in the run rests on the same accident

`inflammation_crp = 3/100` (n=1, signed +7) comes entirely from
`registry:nct06480812`, "The anti-inflammatory effects of three different dietary
supplement interventions". The extraction is **faithful** — S3 correctly read an
isolated 500 mg/day omega-3 arm against a no-supplement control
(`ingredient_isolated: yes`, `comparator: ingredient_free`), so the row is
legitimate. But it passed the gate on the single string
`"omega 3 (n = 33; 500 mg/day)"`; its title and body use `omega-3`. **Had those
authors been typographically consistent, the run would have produced zero scores.**

Separate defect on the same study: S7 returned **all nulls** — no form, no dose —
though `500 mg/day` is in the abstract it was given (confidence 0.75).

## Why 433 selftest checks pass

`pipeline/selftest.py:2503-2511` tests the gate with `vitamin_d`, and elsewhere
`creatine`, `magnesium`, `zinc`, `ginkgo_biloba` — **every one spelled with a space
or a single word.** No test asserts the gate against an ingredient whose canonical
spelling is hyphenated. The suite is green and the gate is blind.

## Recommendations (none applied — see below)

1. **Make rule 1 spelling-tolerant, not id-literal.** Match a normalised form on
   both sides (collapse `-`, `‐`, `–`, `_`, whitespace) so `omega-3`, `omega 3` and
   `omega3` are one token. Recovers 139 of 326 full-text records on its own.
2. **Give `vocab/form.json` an ingredient synonym list** the gate reads — `fish oil`,
   `n-3`, `EPA`, `DHA`, `PUFA`, `krill oil` for omega-3; `β-carotene` for
   beta-carotene. Worth a further ~62 records. This adds a vocab field, not a
   scoring constant.
3. **Selftest the class, not the case.** Assert every `vocab/form.json` ingredient
   against a realistic hyphenated/Greek-letter title. `beta_carotene` fails today.
4. **Re-run omega-3 after the fix.** The current run's 18-study corpus is
   unrepresentative in *kind*, not merely small; its scores should not be compared
   against a fixed-gate run as if the difference were evidence.
5. **Treat "dropped N noise" as a metric that needs a denominator.** Twice now
   (vitamin D 175/175, omega-3 249/267) a total gate failure has been logged as the
   gate succeeding. A drop rate above ~50% should print a warning naming the single
   dominant reason.

**Nothing here was applied.** `pipeline/relevance.py`, prompts, schemas and
constants were out of scope for the session that ran the extraction, and the fix
touches a shared gate on every ingredient's corpus — it wants its own change,
its own selftest, and the owner's review, not a drive-by edit inside an
extraction session.

## Standing of run `20260827_194637`

Already registered `experimental` / `public_claims_allowed: false`. This audit adds
a specific reason beyond sample size: **its corpus is a biased 6.7% sample selected
by typography.** The extraction itself was clean (18/18, zero partial failures) and
the per-study facts audited here are faithful. The *corpus selection* is what is
unsound, and it is a code defect with a known fix, not a limitation of the
literature.
