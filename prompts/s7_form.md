S7 form_normalizer

You receive the paper's methods (with `dose_snippets` and `tables`), the
target ingredient, the study's arms from S3 (`s3_arm_facts`) and the
ingredient's form vocabulary. For each arm, normalise the preparation and
record the dose. The product's form and dose are matched against these
values, so treat precision as the priority.

ARMS (load-bearing). Return `arms`: one entry per S3 arm, keyed by its exact
S3 `label`; do not re-infer roles. Put form and dose facts in the entry of the
arm that received them only. Never copy the ingredient arm's form or dose onto
a placebo, measurement-only, biomarker or other active arm. An arm with no
target ingredient gets null form and dose fields. If an arm's facts cannot be
resolved, leave its fields null rather than borrowing another arm's.

FORM
Map to a vocabulary id (`form_vocab_id`), with the paper's wording in
`form_raw`. If the text names only the element or botanical with no preparation
("magnesium", "ashwagandha"), set form_vocab_id to the unspecified variant and
form_raw to what was said. DO NOT GUESS THE SALT. A wrongly-guessed specific
form is worse than an honest unspecified one.

`unspecified` MEANS "THE PAPER NEVER SAYS", AND NOTHING ELSE. Two failures
measured 2026-08-11:

  * AN ABBREVIATION DEFINED ONCE IS A STATED FORM. A paper that writes "creatine
    monohydrate (CrM)" in its first sentence and "CrM" thereafter has stated the
    form. One such trial, the most influential in the audited corpus, was
    recorded `unspecified`, so a result in the product's own form was treated
    as indirect evidence. Search the title, abstract, methods AND the
    intervention description, not just the arm label.
  * A FORM YOU CANNOT FIND IN THE VOCABULARY IS NOT UNSPECIFIED. "Polyethylene
    glycosylated creatine (PEG-creatine)" is a specific, named preparation that
    simply has no vocabulary id. Recording it as `unspecified` tells the pipeline
    "nobody said what form this was", when the truth is "a DIFFERENT form was
    tested" -- opposite messages. Put the verbatim string in form_raw and say in
    the evidence span that the named form is absent from the vocabulary, so the
    gap is visible instead of silently collapsing into the unstated bucket.

So: whenever you answer `unspecified`, quote in the evidence span the bare-element
mention you are relying on. If you cannot produce that quote, you have not
established that the form is unstated.

Standardised botanical extracts are distinct forms, not the same plant.
"KSM-66 ashwagandha root extract" is not interchangeable with "ashwagandha
leaf powder". Record the branded/standardised name when given -- extract
standardisation is the single largest source of between-study variance in
botanicals.

DOSE -- THE ELEMENTAL TRAP
For minerals, papers report either the compound weight or the elemental
weight, often without saying which. These differ by a factor of 2 to 10.
  dose_basis = "elemental_stated"  the paper says elemental/of the element
  dose_basis = "converted"         you converted from compound to elemental
                                   using the known percentage for that salt
  dose_basis = "compound_only"     compound weight given, conversion uncertain
  dose_basis = "unstated"          cannot tell which is meant
When unsure whether a figure is elemental or compound, set "unstated" and put
the number in compound_dose_mg with elemental_dose_mg null. A dose off by 5x
silently destroys the dose-band matching that the whole product rests on.

Normalise to DAILY total: multiply per-dose by frequency. Record
dose_frequency_per_day. If a loading and maintenance phase differ, report the
maintenance dose and note the loading phase in evidence_span.

PER-KG DOSING. Many trials dose by body weight -- "0.3 g/kg/day", "0.1 g/kg".
MEASURED 2026-08-12: 25 of 76 dose-less extractions in the creatine corpus were
this shape, the single largest cause of a missing dose. Handle it with two
fields, and never merge them yourself:

  dose_per_kg_mg     the per-kg daily dose in mg/kg/day ("0.3 g/kg/day" -> 300).
                     ONLY for genuinely per-kg dosing; never convert an absolute
                     dose into it.
  mean_body_mass_kg  the paper's own stated mean body mass, if printed in the
                     baseline table or methods. On an ARM row, fill it from the
                     first of these the paper actually states: (a) that arm's
                     own mean mass; (b) the WHOLE-SAMPLE baseline mean when
                     per-arm masses are not printed. The whole-sample mean is
                     a permitted PROXY only on an administered TARGET-
                     INGREDIENT arm row; never copy it to placebo, measurement,
                     biomarker, or other-active rows, and never describe it as
                     that arm's own reported mean. Quote the stated number in
                     the evidence span and say explicitly that it is the
                     whole-sample proxy. Refusing this permitted proxy deletes
                     a reported per-kg dose.
                     MEASURED 2026-08-25: 13 papers whose stated mass the
                     previous contract captured came back null under arm
                     keying, emptying two dose bands -- over-caution here
                     destroys real data.

Do NOT multiply them into elemental_dose_mg yourself, and NEVER assume a typical
body weight -- if the paper states no mean mass, leave mean_body_mass_kg null and
the dose stays per-kg. Downstream does the multiplication deterministically,
only when both numbers are the paper's own.

The payload may include `dose_snippets`: sentences pulled from the paper's full
text wherever a dose pattern occurs, because the main text you receive can be
truncated before the dosing paragraph. Treat them as part of the paper -- same
rules, same evidence_span duty.

THE TABLES ARE WHERE THE MISSING DOSES LIVE. The payload may include `tables`:
the paper's tables serialised row by row. MEASURED 2026-08-24 on the creatine
corpus: 25 per-kg trials had no usable dose for want of a mean body mass -- while
the protocol table printed the dosing schedule and Table 1 printed the body
mass. Read from tables exactly what you read from prose, same rules, same
evidence_span duty (quote the cell or its row):
  - dosing schedules in protocol/intervention tables ("20 g/d x 5 d, then
    5 g/d" -> maintenance 5 g/d, loading noted in evidence_span);
  - the supplemented group's mean body mass in the baseline table -- this is
    the number that turns a per-kg dose into a usable one downstream. Use the
    SUPPLEMENTED arm's mass (or the whole-sample mass when arms are not
    separated); never a subgroup's, never an assumed weight.
Everything above still applies: never multiply per-kg by mass yourself, never
guess elemental vs compound from a bare table number (a bare figure in a dose
column is `compound_only` or `unstated` by the same rules as prose), and a
dose that appears only for a NON-ingredient arm is not this ingredient's dose.

evidence_span: per arm, the quote your form and dose rest on.
