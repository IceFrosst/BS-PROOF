# The Effect axis: how much better a healthy person's life gets

Founder direction 2026-09-11: the Effect axis must mean **improvement to someone's life**, not deficiency correction and not a lab reading. This records the ladder, the live test of whether its top rung is reachable, and what the test changed.

Status: PROPOSED, development-only. `app/design-lab/ab/effect-impact.ts`, pinned by `tests/effect-impact.test.ts`. Nothing is wired to production; no pipeline constant moved.

## The ladder

| | rung | what it has to earn |
|---|---|---|
| **3** | Changes your week | lived outcome **and** a published **anchor-based** bar, derived in a comparable population, was **cleared** |
| **2** | Noticeable over weeks | lived outcome, real effect, no usable bar |
| **1** | Measurable, not felt | a surrogate, **or** an effect that **failed** its bar |
| **0** | Nothing shown | the interval spans the null, or the effect points away from benefit |
| — | Size not graded | a magnitude exists but cannot be stood behind |
| — | Different question | deficiency correction or treatment: not enhancement |

Two asymmetries are deliberate:

- **A surrogate is capped at 1 however large the number.** A blood level, a P300 amplitude or a reaction-time task is a stand-in. Nobody has shown you would feel it.
- **A bar from a different population cannot promote, but may still demote.** Importing a COPD threshold to bless a healthy-adult effect would be laundering; using a domain-matched bar to say an effect is *too small* is the conservative direction.

Cohen's 0.2/0.5/0.8 and sport science's distribution-based "smallest worthwhile change" are **conventions, not thresholds**. `anchor_based: false` can never promote.

## The test: three best-shot products, researched live

Each was researched on its strongest candidate outcome, with instructions that an honest 1 was a more useful result than a manufactured 3.

| | best-shot outcome | magnitude | threshold | rung |
|---|---|---|---|---|
| Creatine | back squat 1RM | **+5.64 kg** (3.87–7.40), I²=4%, Egger p=0.92 | none exists | **2** |
| Caffeine | attention (lab task) | g = 0.28, no CI published | none exists | **1** surrogate |
| Caffeine | endurance time trial | SMD −0.34 (−0.62 to −0.06) | none exists | **2** |
| Omega-3 | muscle soreness | **−0.93 pts** (−1.44 to −0.42) | **1.4 pts — failed** | **1** |

**Nothing reached 3, and all three failed for the same reason.** Anchor-based thresholds barely exist for healthy people: the caffeine lane searched Karolinska Sleepiness, Epworth, Profile of Mood States, Borg, alertness VAS and smallest worthwhile change, and every hit was a patient population — OSA, COPD, cancer, fibromyalgia, Parkinson's. An independent search for 1RM thresholds found only COPD patients. Nobody funds the study that asks a healthy person whether they noticed.

**That is a fact about the literature, not about supplements.** Rung 3 is defined and implemented; it is currently empty, and the card says why on every row that lands at 2.

## What the test changed

**Omega-3 is the case the axis exists for.** A threshold exists, the review authors applied it themselves, and the effect fails it:

> "the effect size of less muscle soreness with n-3 PUFA was lower than the MCID, suggesting that the statistically significant difference in pain reduction was very unlikely to represent meaningful or important differences in clinical practice."

Most products would render this as "reduces soreness, p = 0.0004". We render **Measurable, not felt**, and quote the authors.

**Our creatine number was wrong, against our own interest.** The +1.43 kg bench figure we had been carrying pools 18 intervention arms **with no exercise at all**. For someone who trains, the review's own split is **+2.16 kg (1.13–3.18)**. Squat is also the better headline: bench shows publication bias in that review (Egger p = 0.0003), squat does not (p = 0.92).

**Population is now the studied population.** "General healthy adults" is a construct that mostly does not appear in this literature — the creatine base is trained, younger and male-skewed. Rows say so instead of laundering it into a generic adult.

**Overlapping reviews stay cross-checks.** The 23-study creatine review is contained in the 69-study one; they disagree roughly threefold on upper body. The larger, cleaner pool is the headline, the disagreement is shown, and the two are never averaged.

## Contract change

`effect-research-v0.1` → **v0.2** (`app/design-lab/ab/effect-contract.ts`, `schemas/effect_research.json`). Bump the caller's cache key with it (invariant 3).

- new metric **`raw`** — a magnitude in the unit a person lives in (kg, VAS points, minutes). v0.1 carried only standardised units, which is the form nobody can feel.
- new required **`outcome_kind`**: `lived | surrogate`.
- new required **`threshold`**: value, unit, source, `derived_in`, `anchor_based`, `population_match`, `verdict` (`cleared | failed | none`), note. A `cleared`/`failed` verdict must carry a real value and resolve to a declared source; `none` must carry a null value.

## Open

1. **Rung 3 is empty.** Either accept that (supplement enhancement genuinely is modest) or add a second route to the top: a lived outcome whose effect is large relative to the person's own baseline, under a declared, labelled convention. That is a founder call and a number I will not pick alone.
2. **Generating our own thresholds.** The missing science is an anchor question — "did you notice anything?" at 4 weeks, paired with the measured change. An app with users is the one entity that could produce it. Not on the card at launch; worth collecting from day one.
3. Anecdote stays off the card until there are users, and never inside the evidence axis.
4. Still unwired: no research job, no product entry, no production route. The axis is now defined and testable; the wrapper around it is not built.
