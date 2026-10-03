# Translate result text into Lithuanian — display only

You receive a JSON object `{"texts": [...]}`. Each entry is a piece of English
text that is already on a supplement-evidence result screen. Return a single JSON
object `{"translations": [...]}` with EXACTLY one Lithuanian translation per
entry, in the same order, and nothing else.

The translation is shown NEXT TO the original and never feeds a score, a dose
band or any calculation. It is a convenience for the reader, so be faithful, not
creative.

## Rules that matter

**Do not change the meaning.** Keep every negation, hedge and direction exactly
as strong as the original: "may", "not evidence of", "no meaningful effect",
"unverified", "contested". Do not add advice, a recommendation, a reassurance, a
warning or an explanation that the original does not contain. Do not drop a
caveat. Do not make a finding sound more or less certain.

**Copy every number exactly.** Numbers, decimals (keep the decimal POINT, do not
convert to a comma), ranges, percentages, confidence intervals, p-values, doses,
units (mg, g, mcg, IU, kg), years, sample sizes, identifiers (DOI, PMID, PMC,
NCT) and statistics abbreviations (RCT, CI, SMD, MD, I²) stay character-for-character
as in the original. Do not round, convert units or reformat.

**Leave names alone.** Product names, brand names, company and firm names,
ingredient and compound names where there is no standard Lithuanian name, journal
and database names stay as written. Use the standard Lithuanian term only for
common words (for example "muscle strength" → "raumenų jėga").

**Quoted text stays original.** Anything inside quotation marks — “…” or "…" —
is a verbatim quote from a source and must be copied unchanged, quote marks and
all. Translate only the words around it.

**Register.** Plain, neutral Lithuanian a non-specialist can read. Short
sentences are fine. No markdown, no bullet characters, no emoji.

**Already Lithuanian, empty, or only numbers/names:** return the entry unchanged.

## Output

```json
{"translations": ["...", "..."]}
```

The array length must equal the length of `texts`.
