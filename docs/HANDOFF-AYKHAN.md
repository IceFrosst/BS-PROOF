# Handoff — Aykhan

Written 2026-09-11. Scope: the `/tests/supplements` test site that just shipped to `main`.
Everything below is verifiable in the repo; where something is unvalidated I say so.

---

## 1. What shipped, in one paragraph

A public-but-unlisted page at **`/tests/supplements`** showing six saved supplement result cards.
It is a **test site**: saved AI research, no live research, no user accounts, no survey, no API calls.
The production scanner (`/scan`, `POST /api/scan`), the dashboard and the whole Python pipeline are
**untouched**. Nothing here feeds a production score.

| | |
|---|---|
| Public route | `app/tests/supplements/page.tsx` → renders `AbPrototype publicTest` |
| Dev-only lab | `/design-lab/ab` (still `notFound()` outside development) |
| Indexing | page-level `robots: noindex` **plus** the site-wide disallow in `app/robots.ts` |
| Data | 3 audit fixtures + 3 effect-only fixtures, all static JSON in the repo |

---

## 2. The two founder decisions encoded here

### 2.1 Funding and publication bias are warnings, never deductions

Previously both could silently cost a point of Evidence certainty. They no longer touch any number.

- `app/design-lab/ab/ledger.ts` — `score()` skips `publication_bias` in the checklist loop, and the
  `allPositiveIndustryOrOneLab` cap is gone. The four other checklist domains still deduct, and the
  trial-count / size-duration / surrogate caps are unchanged.
- `app/design-lab/ab/evidence-warnings.ts` — builds the two clickable warning panels instead.
- Pinned by `tests/evidence-warnings.test.tsx`: for **every outcome in all three audits**, flipping
  `publication_bias` through all three states and `allPositiveIndustryOrOneLab` both ways must leave
  the entire `score()` result byte-identical. If someone reintroduces a penalty, that test fails.

Two honesty rules inside the warnings, both deliberate:

- Absence of a recorded concern is shown as **"Funding completeness unknown"** / **"Not established"**,
  never as a clean bill of health. We mostly do not know who funded the included trials.
- The audit's **own limitations prose is still printed** — calcium harms (renal disease RR 1.16,
  nephrolithiasis RR 1.17), 88% heterogeneity, an Expression of Concern, n=55 pooled samples. Only the
  *deductions* were removed. The current scoring rule is appended after it, labelled `Current rubric:`,
  so old audit text can never be mistaken for a live rule.

### 2.2 The Effect axis means "how much better is your life"

`app/design-lab/ab/effect-impact.ts`, ladder:

| rung | requires |
|---|---|
| 3 · Changes your week | lived outcome **and** a published **anchor-based** threshold from a comparable population that the effect **cleared** |
| 2 · Noticeable over weeks | lived outcome, real effect, no usable threshold |
| 1 · Measurable, not felt | a **surrogate**, or an effect that **failed** its threshold |
| 0 · Nothing shown | interval spans the null, or the effect points away from benefit |

Two asymmetries are load-bearing: a surrogate is capped at 1 however large the number, and a threshold
from a **different** population may demote but never promote. Cohen's 0.2/0.5/0.8 and the
distribution-based "smallest worthwhile change" are conventions, not anchors (`anchor_based: false`
can never promote).

**Rung 3 is currently empty across all six products, and that is a finding, not a bug.** Anchor-based
thresholds barely exist for healthy people — every one found in the searches was a patient population
(OSA, COPD, cancer, Parkinson's). Full method and results: `docs/design/2026-09-11-effect-ladder-test.md`.

---

## 3. Where things live

```
app/tests/supplements/page.tsx        the public route (thin wrapper)
app/design-lab/ab/
  prototype.tsx                       the whole UI; `publicTest` switches to the public layout
  ledger.ts                           score(), personFit() — rubric v0.2, demo only
  effect-impact.ts                    the life-impact ladder
  effect-contract.ts                  effect-research-v0.3 types + runtime validation
  effect-presentation.ts              what the Effect bar is allowed to say
  evidence-warnings.ts                the two disclosure panels
  audits/{creatine,vitamin-d,magnesium}.json      earlier audit fixtures
  effect-research/{creatine-effect,caffeine,omega3-effect}.json   effect-only fixtures
prompts/effect_research.md            effect-research-v0.3  (own cache domain)
schemas/effect_research.json          its schema
tests/{evidence-warnings.test.tsx,effect-impact.test.ts,effect-presentation.test.ts,...}
scripts/check_effect_card.mjs         browser smoke, 6 products x 4 layouts at 390/1440
```

## 4. Gates before any push

```bash
npm run typecheck && npx eslint app tests && npm run test:unit   # 305 tests
python3 -m pipeline.invariants && python3 -m pipeline.selftest   # both must say PASS
npm run build
node scripts/check_effect_card.mjs        # needs npm run dev on 127.0.0.1:3000
```

`main` auto-deploys to Vercel on push. Never push half-done work to `main` (`CLAUDE.md` rule).
If you push as `aykhanstoic`, the GitHub workflow triggers the deploy hook for you after the gates
pass — see the collaborator deploy bridge note in `CLAUDE.md`.

---

## 5. Traps — things that look wrong and are not, and vice versa

1. **The numbers are heuristic rubric outputs, not probabilities of benefit.** 58 does not mean
   "58% likely to work". Do not put a score anywhere without its bars and its population.
2. **Creatine strength reads Evidence 2/4 even after removing both penalties.** That is the
   *small-RCT* cap (largest trial n=39), not funding. Correct behaviour.
3. **Two scoring systems exist.** `pipeline/` (Python, `w_study`, arcs, SCORING_MODEL v14) is the
   real historical one. `app/design-lab/ab/ledger.ts` is a **separate demo rubric** for this test
   site. They share no code and no constants. Do not sync them.
4. **`docs/design/2026-09-10-evidence-ledger-rubric.md` is now stale** — lines about a publication-bias
   deduction and an industry/one-lab cap describe v0.1. The code is v0.2.
5. **`app/design-lab/ab/effect.ts` is dead experimental code.** Invented "short-form AMSTAR-2" points,
   unvalidated pooling and CI widening. It is imported by nothing. Do not wire it in.
6. **`vitest.config.ts` include globs.** A guardrail suite that never runs is worse than none — the
   new `.tsx` test silently did not execute until the glob was widened. `tests/vitest-include.test.ts`
   now fails loudly if anyone narrows it again.
7. **Invariant 3 still applies**: editing `prompts/effect_research.md` means bumping
   `EFFECT_RESEARCH_PROMPT_VERSION` in `effect-contract.ts` in the same commit, or caches serve stale.
8. **Person fit ("Studied in you") is unvalidated.** `AGE_SLACK = 5` is an unapproved constant, ages
   come from trial *mean* ages rather than enrolment limits, and a perfect match can *raise* a score.
   Treat as a prototype, not a feature.

---

## 6. What is NOT built (do not assume otherwise)

- No research job, no queue, no cacheable research endpoint. Every card is static JSON a human pasted in.
- No scan → research → result flow. The test site starts from a product you pick, not a photo.
- No anecdote collection, no survey, no follow-up question, no users. Nothing is being stored anywhere.
- No human verification of any research on the page. Every fixture carries `human_verified: false`.
- No legal review of the wording.

## 7. If you pick this up next, in order

1. **Read the card in the browser first** (`/tests/supplements`), on a phone width. Smoke scripts have
   missed visible defects that a screenshot caught immediately.
2. Decide the open question in `docs/design/2026-09-11-effect-ladder-test.md` §Open: rung 3 stays empty,
   or a second route to the top gets defined. That needs a number and it is a founder call.
3. If wiring research for real: go through `lib/analyze/llm.ts` (the one model transport, invariant 1),
   give it its own prompt version and cache domain, and keep the "model recollection never becomes a
   measurement" rule from `docs/SYSTEM_DESIGN.md`.

Questions about why a specific number is that number: the rubric arithmetic is all in
`ledger.ts:score()` and every input is visible in the audit JSON. Nothing is hidden in a model call.
