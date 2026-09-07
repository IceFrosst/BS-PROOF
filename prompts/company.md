# Company background — from your own knowledge, marked as such

You are given the BRAND and, when printed, the MANUFACTURER named on a
supplement label. Return ONE JSON object describing what is widely and
publicly known about that company. You are answering from memory, and the
reader will be told so: every field you return is displayed under a
"model knowledge — unverified" badge and nothing you say enters a score.

## The rule that matters

**Unknown is the correct answer whenever you are not sure.** A supplement brand
you do not recognise gets `known: false`, a one-sentence summary saying so, and
nulls everywhere else. Do not describe a plausible company. Do not infer a
country from the brand name. Do not invent a founding year.

Regulatory history is the dangerous field. A recall, an FDA warning letter, a
class action or an FTC action is a factual claim about a named company. List
one ONLY when it was widely reported and you can state the year. If you recall
"something" without specifics, leave the list empty and say so in `caveats`.
Independent code checks the FDA enforcement database beside your answer; an
invented recall will be shown as uncorroborated, and a real one you omit will
still appear from the registry.

Do not judge whether the product works. Do not repeat marketing. Do not
recommend.

## Fields

- `brand` — echo the brand as given.
- `known` — true only when you recognise this specific company.
- `summary` — one to three sentences of what the company is and sells. Under
  400 characters. For an unknown brand: "Not a company I can identify."
- `founded_year` — integer or null.
- `headquarters_country` — country name or null.
- `parent_company` — the owner when the brand is a subsidiary, else null.
- `ownership_type` — one of `private`, `public`, `subsidiary`, `unknown`.
- `third_party_testing` — `{ "program": string|null, "status": "documented" |
  "claimed" | "unknown" }`. `documented` only when a named programme
  (NSF Certified for Sport, Informed Sport, USP Verified, ConsumerLab) lists
  the brand to your knowledge; `claimed` when the company says so about itself.
- `transparency` — `{ "coa_published": "yes" | "no" | "unknown" }` — whether
  batch certificates of analysis are publicly available.
- `regulatory_history` — list of `{ "kind": "fda_warning_letter" | "recall" |
  "class_action" | "ftc_action" | "other", "year": integer|null,
  "summary": string (under 240 chars), "confidence": "high"|"medium"|"low" }`.
  Empty when nothing widely reported.
- `reputation_notes` — up to five short neutral facts (awards, acquisitions,
  notable controversies with year). No adjectives.
- `confidence` — `high` | `medium` | `low` for the whole profile.
- `caveats` — short strings naming what you could not confirm.

## Input

Brand: {BRAND}
Manufacturer as printed: {MANUFACTURER}
Product as printed: {PRODUCT}

## Output

A single JSON object with exactly the fields above. No prose, no markdown
fence, nothing before or after.
