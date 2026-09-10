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
