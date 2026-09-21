# What the literature says about this ingredient — from your own knowledge

You are given ONE supplement's ingredient, its form, and the daily dose printed
on the label. Return a single JSON object describing what the published human
literature says about it. You are answering from memory, and the reader is told
so: everything you return is displayed under a "model estimate — unverified"
badge, beside a legend saying it is not an extracted-trial score.

This is the fallback path. When this product's ingredient has been through the
extraction pipeline, the reader sees measured scores with per-trial provenance
instead, and you are not called. You are here because nobody has run it yet, so
your job is to give an honest orientation, not to imitate a measurement.

## The rules that matter

**Answer per OUTCOME, and pick the outcomes people actually take this for.**
Up to six. Use the outcome names a buyer would recognise ("sleep quality",
"muscle strength", "migraine frequency"), not biomarker jargon, unless the
biomarker is the point (for example "serum 25(OH)D").

**`insufficient` is a correct and common answer.** Most supplement-outcome
pairs have no dependable human evidence. Say so. Do not manufacture a verdict
from mechanism, from animal work, or from what the category is assumed to do.

**Distinguish the strength of the literature from the direction of the
finding.** A large well-replicated null is `no_effect` with `strong` evidence.
Three small trials pointing up is `benefit` with `limited` evidence. Those are
different messages and both are useful.

**Report what the literature PUBLISHES.** Meta-analyses report pooled effect
sizes; if you recall one, put it in `pooled_effect_recalled` verbatim in its own
units ("SMD 0.30 [0.10, 0.50]", "MD −1.4 points"). If you do not recall a
specific figure, null. Never invent an interval.

**Doses are DAILY and ELEMENTAL where the distinction matters** (magnesium,
iron, zinc: the elemental amount, not the salt mass). Give the range at which
benefit was actually observed in trials, not a marketing range and not an upper
limit. Null when you cannot state one.

**No medical advice, no brand talk, no recommendation.** Describe the
literature. Safety notes are limited to well-established tolerable upper
intakes and common documented adverse effects.

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

- `ingredient` — echo the ingredient as given.
- `recognised` — true only when you recognise this as a real supplement
  ingredient with a literature you can describe.
- `summary` — two to four sentences: what it is, what it is taken for, and how
  good the evidence is overall. Under 600 characters.
- `evidence_landscape` — `{ "syntheses_exist": "many" | "few" | "none" |
  "unknown", "note": string under 240 chars }` — whether systematic reviews or
  meta-analyses of this ingredient exist at all.
- `outcomes` — up to six entries:
  `{ "outcome": string,
     "direction": "benefit" | "no_effect" | "harm" | "insufficient",
     "evidence_strength": "strong" | "moderate" | "limited" | "none",
     "effective_daily_dose_low_mg": number|null,
     "effective_daily_dose_high_mg": number|null,
     "pooled_effect_recalled": string|null,
     "population": string|null,
     "note": string under 300 chars,
     "confidence": "high" | "medium" | "low" }`
  `note` says what the finding rests on ("several meta-analyses of RCTs in
  adults with insomnia", "two small trials, no replication").
- `form_assessment` — `{ "form": string, "verdict": "well_absorbed" |
  "poorly_absorbed" | "no_established_difference" | "unknown",
  "note": string under 300 chars }` about the specific form given.
- `safety_notes` — up to four short strings: established upper intakes,
  documented common adverse effects. Empty when nothing established.
- `confidence` — `high` | `medium` | `low` for the whole answer.
- `caveats` — up to five short strings naming what you are unsure about.

## Input

Ingredient as printed: {INGREDIENT}
Form as printed: {FORM}
Daily dose on this label: {DOSE}

## Output

A single JSON object with exactly the fields above. No prose, no markdown
fence, nothing before or after.
