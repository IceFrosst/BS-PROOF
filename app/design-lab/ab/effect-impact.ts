/*
 * The Effect axis: HOW MUCH BETTER IS A PERSON'S LIFE.
 * PROPOSED, demo-only. Not wired to production.
 *
 * Founder direction 2026-09-11: the axis must mean improvement to someone's
 * life, not deficiency correction and not a lab reading.
 *
 * The ladder, and what each rung has to earn:
 *
 *   3  changes your week     lived outcome AND a published anchor-based bar,
 *                            derived in a comparable population, was CLEARED
 *   2  noticeable over weeks lived outcome, real effect, no usable bar
 *   1  measurable, not felt  a surrogate, or an effect that FAILED its bar
 *   0  nothing shown         the effect is null
 *   -  not graded            a magnitude exists but cannot be stood behind
 *   -  separate track        deficiency correction or treatment: not enhancement
 *
 * WHY RUNG 3 IS HARD, measured rather than assumed. Three best-shot products
 * were researched live on 2026-09-11 (docs/design/2026-09-11-effect-ladder-test.md):
 * creatine squat +5.64 kg, caffeine tiredness -12.34 VAS, omega-3 soreness
 * -0.93 VAS. All three landed at 2, and all three for the SAME reason - almost
 * every published important-difference threshold is derived in patients
 * (OSA, COPD, cancer, Parkinson's), because nobody funds the study that asks a
 * healthy person whether they noticed. So:
 *
 *   - a threshold derived in a DIFFERENT population cannot promote to 3, but it
 *     is still allowed to demote (omega-3's soreness effect fails a domain-
 *     matched bar, and that is the most useful thing we can say about it);
 *   - Cohen's 0.2/0.5/0.8 and the distribution-based "smallest worthwhile
 *     change" are conventions, not thresholds. `anchor_based: false` can never
 *     promote.
 */
import type { EffectOutcome, EffectThreshold, ReportedEstimate } from "./effect-contract";

export type ImpactLevel = 3 | 2 | 1 | 0;
export type ImpactKind = "graded" | "not_graded" | "separate_track";

export interface Impact {
  kind: ImpactKind;
  /** null unless kind === "graded". */
  level: ImpactLevel | null;
  word: string;
  /** The single fact that decided it. Always shown; never a black box. */
  because: string;
  /** What would move it up one rung. Empty when already at the top. */
  toMoveUp: string;
}

export const IMPACT_WORDS: Record<ImpactLevel, string> = {
  3: "Changes your week",
  2: "Noticeable over weeks",
  1: "Measurable, not felt",
  0: "Nothing shown",
};
export const NOT_GRADED_WORD = "Size not graded";
export const SEPARATE_TRACK_WORD = "Different question";

/** An interval that spans the null cannot support a claim of benefit. */
export function spansNull(e: ReportedEstimate): boolean {
  if (e.ciLow === null || e.ciHigh === null) return false;
  const nullValue = e.metric === "rr" ? 1 : 0;
  return e.ciLow < nullValue && e.ciHigh > nullValue;
}

/** Is the effect pointing the way the person wants, on this metric? */
export function isBenefit(e: ReportedEstimate): boolean | null {
  if (e.direction === "unclear") return null;
  const nullValue = e.metric === "rr" ? 1 : 0;
  const above = e.value > nullValue;
  return e.direction === "higher_better" ? above : !above;
}

/** A bar may promote only if someone asked a comparable group whether they noticed. */
export function canPromote(t: EffectThreshold): boolean {
  return t.verdict === "cleared" && t.anchor_based && (t.population_match === "same" || t.population_match === "comparable");
}

export interface ImpactInput {
  outcome: Pick<EffectOutcome, "outcome_kind" | "threshold" | "estimate" | "population">;
  /** Set when this row is deficiency correction or treatment, not enhancement. */
  separateTrack?: { reason: string } | null;
  /** Set when the magnitude exists but is not trustworthy (tiny or heterogeneous base). */
  notGraded?: { reason: string } | null;
}

export function impact({ outcome, separateTrack, notGraded }: ImpactInput): Impact {
  if (separateTrack) {
    return {
      kind: "separate_track", level: null, word: SEPARATE_TRACK_WORD,
      because: separateTrack.reason,
      toMoveUp: "Nothing. This is a real benefit, but it is not an improvement to a healthy person's life, so it is answered on its own track.",
    };
  }
  if (notGraded) {
    return { kind: "not_graded", level: null, word: NOT_GRADED_WORD, because: notGraded.reason, toMoveUp: "A pooled estimate from a trial base large and consistent enough to stand behind." };
  }

  const e = outcome.estimate;
  const t = outcome.threshold;
  const benefit = isBenefit(e);

  // 0. Null result, or an interval that cannot tell benefit from harm.
  if (spansNull(e)) {
    return {
      kind: "graded", level: 0, word: IMPACT_WORDS[0],
      because: `The interval (${e.ciLow} to ${e.ciHigh}) includes no effect at all, so a benefit has not been shown.`,
      toMoveUp: "A larger or better-matched trial base whose interval excludes no effect.",
    };
  }
  if (benefit === false) {
    return { kind: "graded", level: 0, word: IMPACT_WORDS[0], because: "The measured effect points away from benefit on this outcome.", toMoveUp: "Evidence of benefit in this population." };
  }
  if (benefit === null) {
    return { kind: "not_graded", level: null, word: NOT_GRADED_WORD, because: "The source does not let us recover which direction is the better one, and guessing would invert the finding.", toMoveUp: "A source that states its sign convention." };
  }

  // 1. A surrogate is capped, however large the number.
  if (outcome.outcome_kind === "surrogate") {
    return {
      kind: "graded", level: 1, word: IMPACT_WORDS[1],
      because: "What was measured is a stand-in — a lab reading or a task score — not something you would live. A change here is real, but nobody has shown you would feel it.",
      toMoveUp: "A trial measuring an outcome the person actually experiences, not the marker.",
    };
  }

  // 1. A bar that exists and was FAILED demotes, whatever population it came from.
  if (t.verdict === "failed") {
    return {
      kind: "graded", level: 1, word: IMPACT_WORDS[1],
      because: `The effect is smaller than the published bar for this outcome (${t.value} ${t.unit}${t.source ? `, ${t.source}` : ""}), so it is measurable but below what was defined as mattering.`,
      toMoveUp: "An effect larger than that published bar, in this population.",
    };
  }

  // 3. Only a cleared, anchor-based, population-matched bar reaches the top.
  if (canPromote(t)) {
    return {
      kind: "graded", level: 3, word: IMPACT_WORDS[3],
      because: `The effect clears a published bar for noticing a difference (${t.value} ${t.unit}, derived in ${t.derived_in}).`,
      toMoveUp: "",
    };
  }

  // 2. A real effect on something you live, with no bar we can use.
  const why = t.verdict === "cleared"
    ? (t.anchor_based
      ? `A published bar exists but was derived in ${t.derived_in}, which is not comparable to ${outcome.population}, so it cannot be used to promise you would notice.`
      : `The only available bar (${t.value} ${t.unit}) is a statistical convention, not a measure of whether anyone noticed.`)
    : "No published bar exists for this outcome in a comparable population, so how much you would notice is genuinely unknown.";
  return {
    kind: "graded", level: 2, word: IMPACT_WORDS[2],
    because: why,
    toMoveUp: "A study that asks a comparable group whether they noticed a difference, and reports the change that corresponds to 'a little better'.",
  };
}
