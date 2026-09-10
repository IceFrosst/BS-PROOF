# Evidence Ledger rubric v0.1 — proposed scoring for the AI-research path

**Status: PROPOSED, not approved.** Every constant here is a founder call
(CLAUDE.md invariant 4). Nothing in this file changes `pipeline/scoring.py` or
any retained run. Prompt: `prompts/research_audit.md` (`audit-v0.1`).

## Principle

The model fills a **ledger** (inventory + gate facts + checklist judgements).
**Code** computes four dimension scores and the headline. A model never writes
the number. Same discipline as the retained-run scorer, on a different input.

## Dimensions (each an integer, computed from the ledger)

| Dimension | Points | How code derives it |
|---|---|---|
| **Effect** E | −3 … +3 | From `best_estimate` and `clinically_meaningful`: harm −3 · no meaningful effect (CI excludes the meaningful threshold) 0 · small +1 · moderate +2 · large +3 · unclear (CI spans both) → **no headline**, dimension reads "unclear" |
| **Certainty** C | 0 … 4 | Start 4 if the body is RCT/meta-analysis, 2 if observational. −1 per checklist item marked `concern` (bias, consistency, precision, directness, publication bias). `unknown` costs nothing but is displayed. Floor 0. Then apply gate caps below |
| **Form fit** F | 0 … 4 | exact preparation tested 4 · same family / same standardization 3 · different form with plausible equivalence 2 · different 1 · untested → **unknown** (rendered hatched, priced 0.1 in applicability, never shown as 0/4) |
| **Dose fit** D | 0 … 4 | product daily dose inside tested effective range 4 · within ±20% 3 · 50–80% or up to 2× 2 · <50% or >2× 1 · regimen unknown → **unknown** (same handling as form) |

## Gate caps on Certainty (reported by the model, enforced by code)

| Gate | Cap |
|---|---|
| No human controlled trial | no headline; Effect/Certainty read "insufficient" |
| Exactly one RCT | C ≤ 1 |
| Largest RCT n < 50, or longest < 4 weeks for a chronic outcome | C ≤ 2 |
| Outcome is a surrogate biomarker | C ≤ 3, and the missing link is printed |
| Every positive trial industry-funded or from one lab | C ≤ 2 |

Caps stack by taking the minimum. Each fired gate is shown as one line.

## Headline (0–100), only when E is defined and C > 0

```
signal        = (E / 3) × (C / 4)                         −1 … +1
applicability = mean(F / 4, D / 4)   (unknown axis → 0.10)  0 … 1
headline      = 50 + 50 × signal × (applicability if signal > 0 else 1)
```

This is the v14 identity from `docs/SPEC.md` §9 re-used on the ledger scale:
50 means "the evidence points nowhere", applicability only discounts a benefit
(a null or harm is never softened by an untested form), and bands map straight
onto the existing labels: ≥ 65 works · 55–64 probably works · 45–54 unclear ·
30–44 probably does not work · < 30 evidence against / harm.

Worked example (hypothetical ledger, used on the A/B demo): E +2, C 3,
F 4, D 3 → signal 0.5, applicability 0.875 → **72 "works"**. Same ledger with the
product form untested and dose fit 1 (the A/B demo's "wrong form" case) →
applicability (0.1 + 0.25)/2 = 0.175 → **54 "unclear"**; with dose fit 3 it would be
0.425 → **61 "probably works"**. Same ledger with E 0 → **50** regardless of fit. E −3, C 4 → **0**.

## Overall tab (founder direction 2026-09-11, prototype only)

The result screen lands on an **Overall** tab: `overall = mean(headline of every
scored outcome)`, unscored outcomes excluded and counted in the sentence ("Average
of 3 scored outcomes · 1 not scored"). Each bar on that tab is one outcome at its
own headline; tapping drills into that outcome's four dimensions. Recorded caveat
(earlier design discussion): averaging unrelated outcomes can hide a strong
result behind weak ones; the drill-down and the per-outcome tabs are the
mitigation. Whether the average should be weighted (e.g. by certainty or by the
outcomes the user selected) is an open founder call.

## Overall averages only what the user picked (founder 2026-09-11)

`overall = mean(headline of picked AND scored outcomes)`. Unpicked outcomes stay
visible, dimmed, marked "Not picked", and are excluded from the average.

## First live audits (2026-09-11) — calibration observations, not fixes

Three products were audited by grok-4.6 with live web search against audit-v0.1
(`app/design-lab/ab/audits/*.json`, not yet human-verified). Code computed:

| product | outcome | E | C | F | D | headline |
|---|---|---|---|---|---|---|
| Creatine monohydrate 4 g | muscle strength | 1 | 2 | 4 | 4 | 58 probably works |
| | lean body mass | 1 | 2 | 4 | 4 | 58 |
| | cognitive function | 0 | 0 | 4 | 2 | not scored (C=0) |
| Vitamin D3 2000 IU | fractures | 0 | 4 | 4 | 4 | 50 no meaningful benefit |
| | respiratory infections | 0 | 2 | 4 | 3 | 50 unclear |
| | depressive symptoms | 0 | 2 | 4 | 4 | 50 unclear |
| Magnesium glycinate 300 mg | sleep quality | 1 | 1 | 4 | 3 | 54 unclear |
| | anxiety | 0 | 0 | 2 | 3 | not scored (C=0) |
| | muscle cramps | 0 | 3 | 2 | 4 | 50 no meaningful benefit |

Observations to take to calibration:
1. **−1 per concern is harsh on huge trial bases.** VITAL (n=25,871, exact dose)
   lands at Certainty 2 "Low" for infections/mood because the model flagged
   inconsistency with older pooled analyses and possible publication bias. A
   high-certainty null then reads "Unclear" instead of "No meaningful benefit".
   Candidate fix: a large-precise-RCT floor (e.g. largest RCT n ≥ 5,000 → C ≥ 3),
   or make `precision: supported` on a very large trial offset one concern.
2. **C = 0 → "Not scored" hides a real null.** Creatine/cognition has 8 RCTs and
   an EFSA rejection, but four concerns zero out certainty. "Not scored" is
   indistinguishable from "never studied". Candidate: floor C at 1 whenever
   `rctCount ≥ 3`, so the card reads "Unclear / very low" instead.
3. **Label fix already applied:** E = 0 with C ≥ 3 now reads "No meaningful
   benefit" (was "Unclear", which is the wrong message for a well-shown null).
4. **The model classifies effect/fit categories itself** in this first pass. The
   rubric intends code to derive them from `best_estimate` numbers; the audit
   JSON keeps `effect_basis` and `effective_daily_range` so that can be checked.
5. Elemental-vs-compound on the magnesium label is flagged by the model and
   would move dose fit 3 → 1 if the label means compound mass.

## What is deliberately NOT in the number

Safety (always its own visible block), marketing red flags, company background,
source counts (more papers is not more evidence), and the model's
`self_confidence` (displayed beside the score, never inside it).

## Open before this can ship

1. Founder approval of every constant above and of the 0.10 unknown-axis price.
2. Anchor test: run the audit on 6–8 well-known claims (creatine/strength,
   melatonin/sleep onset, vitamin C/cold incidence, magnesium oxide/sleep,
   tongkat ali/testosterone, a proprietary blend) and check band membership,
   not decimals.
3. Repeat-run stability: same claim twice, same day — dimensions must agree.
4. `schemas/research_audit.json` and a deterministic `ledgerToScore()` with
   golden tests, before any UI shows a number.
