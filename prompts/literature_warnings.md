# Literature disclosure warnings — from your own knowledge

You are given an ingredient and, when known, its form. Return ONE JSON object
with two INDEPENDENT disclosures about the PUBLISHED HUMAN LITERATURE for this
ingredient: who funds the trials, and whether the published record looks like
it was reported selectively. You are answering from memory, and the reader
will be told so: every field is displayed under a
"model knowledge — unverified" badge and nothing you say enters a score, an
arc or a dose band. This is not a claim about the product on the label; it is
a disclosure about the evidence base as a whole.

## The rule that matters

**`unknown` is the correct and common answer.** For most ingredients you do
not have a specific, checkable reason to raise either disclosure, and the
honest answer is `unknown` — not a guess in either direction.

**`concern` requires a SPECIFIC, widely-reported reason** — never a vague
impression that "supplement research in general is industry-funded". Reasons
that qualify:

- industry or trade-body funding dominates the trial base for THIS
  ingredient specifically;
- a named or describable meta-analysis found funnel-plot asymmetry, a
  significant Egger's test, or another documented small-study /
  publication-bias signal;
- a specific brand or manufacturer is widely known to fund most of the
  positive trials of this ingredient.

If you cannot name the specific reason, do not raise the flag — say `unknown`.

**A `concern` is a DISCLOSURE, never a verdict.** It tells the reader who
funded the evidence, or what the published record looks like; it never says a
result is wrong, invalid, rigged, fabricated or fraudulent, and it never
recommends against the product. Do not use words like "fraud", "fabricated",
"rigged" or "invalid" anywhere in your answer.

**`no_concern` requires the OPPOSITE kind of specific knowledge** — you
specifically recall that the trial base was independently or publicly funded,
or that a funnel-plot / bias analysis specifically did NOT find asymmetry.
`no_concern` is never the default for "nothing comes to mind"; that case is
`unknown`.

**Keep the two topics separate.** Funding independence and publication bias
are different questions about different things — do not let evidence for one
decide the other, and do not merge them into a single judgement.

**No brand talk, no medical advice, no recommendation.** Do not evaluate
whether the ingredient works, does not work, or is safe — that is a different
question answered elsewhere. Only name a specific company when it is
specifically and widely reported as funding the TRIALS of this ingredient,
not because it is the brand printed on the label in front of the reader.

## Plain-language rule for every sentence a person will read

Every free-text field you write is shown to one reader: someone who finished
high school, reading on a phone while standing in a shop. These rules apply to
all of them.

- Write 2 to 4 short sentences. Use active voice, sentence case and plain
  everyday words. Where a field below asks for one sentence or sets a character
  limit, that limit wins and you write fewer sentences, still plainly.
- Keep every number, unit, confidence interval, p-value and sample size exactly
  as the evidence states it. Never round one, never drop one, never invent one.
- Explain a technical term inline the first time you use it, briefly, in
  parentheses: "I2 = 83% (the trials disagreed with each other a lot)",
  "SMD 0.30 (a standardised effect size, so a small difference)".
- Never soften a claim and never strengthen it. A hedge stays a hedge. Do not
  add advice, a recommendation, or what the reader should do next.
- No markdown, no bullet characters, no emoji, no em dashes joining clauses, no
  marketing voice.
- State uncertainty as a plain fact ("nobody has tested this"), not as jargon
  ("the evidence is indirect").

## Fields

- `funding_independence` —
  `{ "status": "concern" | "no_concern" | "unknown",
     "basis": string, one factual sentence, under 300 characters,
     "confidence": "high" | "medium" | "low",
     "notable_funders": up to 5 short strings naming industry funders or
       trade bodies commonly behind this ingredient's trials — empty array
       when none specifically recalled }`.
- `publication_bias` —
  `{ "status": "concern" | "no_concern" | "unknown",
     "basis": string, under 300 characters,
     "confidence": "high" | "medium" | "low",
     "signals": up to 5 short strings, e.g. "Egger's test significant in a
       2025 meta-analysis of strength outcomes", "many small positive trials,
       few reported nulls" — empty array when none specifically recalled }`.
- `caveats` — up to 5 short strings naming what you are unsure about, overall.

## Input

Ingredient: {INGREDIENT}
Form: {FORM}
Brand (context only — never the subject of either disclosure): {BRAND}
Manufacturer as printed: {MANUFACTURER}

## Output

A single JSON object with exactly the fields above. No prose, no markdown
fence, nothing before or after.
