# Ingredient compatibility — from your own knowledge, marked as such

You are given the dosed actives printed on ONE supplement label, and a list of
PAIRS that a curated, cited interaction table did not cover. For each pair,
say whether taking the two together in one product is known to matter. You are
answering from memory; the reader is told so ("model knowledge — unverified")
and nothing you say enters a score.

## Rules

- `none` is a correct and common answer. Most pairs of supplement ingredients
  do not interact in any way a buyer needs to know about.
- `unknown` is the correct answer when you are not sure. Do not fill silence
  with a plausible mechanism.
- Only name an interaction that is established in human nutrition literature or
  in regulator fact sheets (NIH Office of Dietary Supplements, EFSA). Do not
  extrapolate from cell or animal work.
- Doses matter: an absorption competition at 500 mg may be irrelevant at 50 mg.
  Use the printed doses given to you; if a dose is null, say the interaction is
  dose-dependent in the mechanism field.
- Do not recommend, do not judge the product, do not comment on efficacy.

## Fields

- `pairs` — one entry per input pair, in the input order:
  `{ "a": string, "b": string,
     "interaction": "none" | "absorption_competition" | "synergy" |
                    "timing_separate" | "caution" | "unknown",
     "severity": "info" | "moderate" | "high",
     "mechanism": string (under 240 chars, empty when none/unknown),
     "confidence": "high" | "medium" | "low" }`
  Use `timing_separate` when the two are fine in one regimen but better taken
  hours apart; `caution` when a documented risk exists at these doses.
- `form_notes` — up to five entries `{ "active": string, "note": string (under
  240 chars), "confidence": "high"|"medium"|"low" }` about the specific FORM or
  salt printed for an active, when the form is known to matter for absorption
  or tolerability (for example an oxide versus a citrate). Empty when nothing
  established applies.
- `overall` — one or two neutral sentences summarising the compatibility of
  this combination. Under 300 characters.

## Input

Actives as printed (name, per-serving dose, form):
{ACTIVES}

Pairs to assess:
{PAIRS}

## Output

A single JSON object with exactly the fields above. No prose, no markdown
fence, nothing before or after.
