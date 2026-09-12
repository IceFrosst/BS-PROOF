# 2026-09-11 — Effect bar and Outcomes tab (development-only `/design-lab/ab`)

**Scope:** the A/B result card only. No production route, no pipeline file, no
scoring constant, no package dependency changed. Not commits of record for any
consumer behaviour.

## What changed, and why each one

**1. The landing tab is `Outcomes`. There is no overall number.**
It used to average the scored outcomes the user had picked and print one 0–100
with a band label. A product is not one benefit: averaging a deficiency-only
row, a clinical row and a healthy-adult row produces a number that is about
nobody. The landing tab is now a list of clickable outcomes, each qualified by
its population, and every row is keyed by **name + population** so two rows that
share a name select independently. The product-level "Worth it if / Not shown to
help if" block is no longer rendered, for the same reason: it read as one global
verdict.

**2. The Effect bar stopped drawing `effectPoints / 3`.**
That fill turned a tier a model had chosen into a magnitude, and it rendered
"nothing was graded" as an empty bar — visually identical to a measured zero.
The bar now has five states and they are deliberately not interchangeable:
`reported_interval`, `reported_point`, `not_graded` (hatched, "Size not
graded"), `no_evidence` ("No evidence found") and `no_meaningful_benefit`. The
three "nothing to show" states never render the same, because they are three
different sentences about the world.

**3. The three shipped audits were NOT re-run and NOT re-scored.**
`app/design-lab/ab/audits/*.json`, `prompts/research_audit.md` and
`schemas/research_audit.json` are untouched. Their per-row numbers and their
other four bars still show, stamped **"Previous rubric · unchanged"**; their
`absolute_effect`, `clinically_meaningful`, `strongest_doubt` and `inventory`
text is reused verbatim through a typed helper and stamped **"Previous AI audit
· not reverified"**. Nothing regex-parses that prose into a grade, and the
legacy MCID assertions are shown as claimed, not as verified. The one audit
sentence asserting "roughly a third more than training alone" is no longer
rendered as the card's own summary (see
`docs/design/2026-09-11-creatine-share-of-gain.md`); the full reported-effect
text that discusses it remains reachable under the Effect expansion.

**4. Caffeine is a NEW, effect-only, freshly researched pass.**
`prompts/effect_research.md` (`effect-research-v0.1`, its own cache domain),
`schemas/effect_research.json`, `app/design-lab/ab/effect-contract.ts` and
`app/design-lab/ab/effect-research/caffeine.json`. It carries no ledger, no
certainty, no form, dose or person score and **no numeric headline**; those bars
read "Not assessed in this run" with the reason. Two separate evidence bases
that never merge into "caffeine works":

- attention (rested healthy adults), Hedges g 0.28 with **no interval** — the
  point is drawn and the interval is called unavailable, never faked;
- endurance time-trial completion time, SMD −0.34 (−0.62 to −0.06) for **≤ 3
  mg/kg capsules**, which is not a 200 mg dose; the gap is stated in words.

Practical importance stays **unknown** for both, despite significance: no MCID,
no conversion to ms or minutes, no SMD→RR translation, no pooling of the two
reviews whose overlap could not be checked. Funding is disclosure only. The file
is validated at load: finite numbers, `ciLow <= estimate <= ciHigh`, positive
ratios for `rr`, and every quote and cross-check must resolve to a declared
source id — malformed data is refused, not scored.

## Deferred, and still open risks

- **The funding penalty in `ledger.ts` is untouched.** The displayed legacy
  rubric still penalises funding; the new effect surface treats it as
  disclosure. The two disagree and the older one is what the legacy numbers were
  computed with.
- **Person-fit** (`personFit`, `AGE_SLACK`, the 0–3 scale) is unchanged and
  still unvalidated.
- **No production wiring.** No endpoint, no background job, no consumer score
  reads any of this. `/design-lab/ab` 404s outside development.
- The caffeine pass is AI research, re-opened at the source for the numbers,
  **not human verified**, and `meta.human_verified` is pinned `false`.
- `app/design-lab/ab/effect.ts` (the quality→overlap→combine grading engine)
  stays unwired; nothing in `app/` or `lib/` imports it, pinned by a test.

## Validation

`npm run typecheck`, scoped `npx eslint`, `npm run test:unit`,
`python3 -m pipeline.invariants`, `python3 -m pipeline.selftest`,
`npm run build`, and `node scripts/check_effect_card.mjs` (4 products × 4
layouts at 390 px and 1440 px: every outcome row reachable by scrolling, Effect
expanded, no horizontal overflow, no page or console errors, no API calls).
