# Vocabularies

Three controlled vocabularies. S3, S6 and S7 extract *into* these; every
operation *over* them is deterministic code in `pipeline/vocab.py`.

| File | What | Consumed by |
|---|---|---|
| `outcome.json` | 30 consumer-facing outcome terms | S6 (payload + target), scoring |
| `form.json` | per-ingredient forms, salt families, molar masses | S7 (payload + target), transfer factor |
| `population.json` | 4 axes + adjacency graph + the 4 precomputed variants | transfer factor, ECU rows |

## Rules

**These are data, not code.** Adding an ingredient means adding a block to
`form.json`. If you find yourself editing `pipeline/vocab.py` to support a new
ingredient, the vocabulary shape is wrong.

**Force-map or discard.** An extraction that does not map to exactly one id is
DISCARDED. It is never approximated to the nearest id. A wrong outcome mapping
is silent and unrecoverable; a discard costs one study out of dozens.

**Never guess a specific form.** Every ingredient has exactly one `*_unspecified`
form carrying the 0.30 transfer penalty. A wrongly-guessed specific form carries
1.00 and is wrong — strictly worse than admitting ignorance.

**The model never does the dose arithmetic.** S7 reports the compound dose and
the form id. `vocab.elemental_dose_mg()` converts from the molar masses recorded
here. When `conversion_safe` is false the pipeline returns `None` rather than a
number it cannot justify.

**Growing the outcome vocabulary is driven by S6's null rationales.** S6 is
instructed to say specifically what was missing when it returns null. Those
rationales are the backlog. Do not add terms speculatively — an unused term is
one more chance for an ambiguous two-way mapping, which forces a null anyway.

## Versioning

Every file has a `version`. It lands in each ECU's `provenance.vocab_versions`,
so any published score can be traced to the vocabulary that produced it. Bump it
when you change meanings, not when you fix a typo in a definition.

Changing an outcome `definition`, `includes` or `excludes` changes what S6 does
without changing `PROMPT_VERSION` — the vocabulary is passed in the payload, so
it is part of the cache key by content. That is correct behaviour, but it means
a vocabulary edit invalidates cached S6 extractions. Expected, not a bug.

## Known-provisional

Marked `status: PROVISIONAL` in each file, and tracked in `docs/SPEC.md` §13:

- the population **adjacency graph** and the worst-axis composition rule
- which salts are `conversion_safe`
- the outcome list itself — 30 terms is a starting point, not an ontology

## Not here yet

**Dose bands.** Bands are derived from the doses trials actually used, and no
doses have been extracted. ECUs ship with `dose_band: null` / `band_version: 0`
until the first extraction pass produces real dose data to cluster.
