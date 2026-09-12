/**
 * The Effect axis = how much better a healthy person's life gets.
 *
 * These pin the three decisions that make the axis honest, each one measured
 * against a real product researched live on 2026-09-11:
 *   - a SURROGATE is capped at 1 however large the number (caffeine attention)
 *   - a published bar that was FAILED demotes to 1 (omega-3 soreness)
 *   - a real effect on a lived outcome with no usable bar is 2 (creatine squat)
 * and the reason rung 3 is empty today: anchor-based thresholds in healthy
 * populations essentially do not exist.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { parseEffectResearch, type EffectOutcome, type EffectThreshold } from "@/app/design-lab/ab/effect-contract";
import { IMPACT_WORDS, canPromote, impact, isBenefit, spansNull } from "@/app/design-lab/ab/effect-impact";

const load = (name: string) =>
  parseEffectResearch(JSON.parse(readFileSync(join(process.cwd(), `app/design-lab/ab/effect-research/${name}.json`), "utf8")));
const CREATINE = load("creatine-effect");
const CAFFEINE = load("caffeine");
const OMEGA3 = load("omega3-effect");
const row = (file: ReturnType<typeof load>, id: string): EffectOutcome => {
  const o = file.outcomes.find((x) => x.id === id);
  if (!o) throw new Error(`no outcome ${id}`);
  return o;
};
const noBar: EffectThreshold = { value: null, unit: "", source: null, derived_in: "none", anchor_based: false, population_match: "unknown", verdict: "none", note: "-" };

describe("the three researched products, as the ladder actually grades them", () => {
  it("creatine squat: a real effect you live, no usable bar -> 2", () => {
    const r = impact({ outcome: row(CREATINE, "O1") });
    expect(r.level).toBe(2);
    expect(r.word).toBe(IMPACT_WORDS[2]);
    expect(r.because).toMatch(/No published bar/i);
    expect(r.toMoveUp).toMatch(/asks a comparable group whether they noticed/);
  });

  it("caffeine attention: a lab task is a surrogate, capped at 1 whatever the number", () => {
    const r = impact({ outcome: row(CAFFEINE, "O1") });
    expect(r.level).toBe(1);
    expect(r.because).toMatch(/stand-in/);
  });

  it("caffeine endurance: a lived outcome with no bar -> 2, same as creatine", () => {
    expect(impact({ outcome: row(CAFFEINE, "O2") }).level).toBe(2);
  });

  it("omega-3 soreness: the bar exists and the effect FAILS it -> 1, not 2", () => {
    const o = row(OMEGA3, "O1");
    expect(o.threshold.verdict).toBe("failed");
    const r = impact({ outcome: o });
    expect(r.level).toBe(1);
    expect(r.because).toContain("1.4");
    // This is the case competitors render as "reduces soreness, p = 0.0004".
    expect(r.because).toMatch(/below what was defined as mattering/);
  });

  it("nothing reaches 3 today, and that is a fact about thresholds, not about supplements", () => {
    const all = [...CREATINE.outcomes, ...CAFFEINE.outcomes, ...OMEGA3.outcomes];
    expect(all.some((o) => impact({ outcome: o }).level === 3)).toBe(false);
    expect(all.every((o) => o.threshold.verdict !== "cleared")).toBe(true);
  });
});

describe("what each rung requires", () => {
  const lived = row(CREATINE, "O1");

  it("promotes to 3 only on a cleared, anchor-based, population-matched bar", () => {
    const bar: EffectThreshold = { value: 3, unit: "kg", source: "S1", derived_in: "trained adults asked whether they noticed", anchor_based: true, population_match: "comparable", verdict: "cleared", note: "-" };
    expect(canPromote(bar)).toBe(true);
    const r = impact({ outcome: { ...lived, threshold: bar } });
    expect(r.level).toBe(3);
    expect(r.toMoveUp).toBe("");
  });

  it("a CONVENTION never promotes, even when cleared: Cohen and smallest-worthwhile-change are not thresholds", () => {
    const convention: EffectThreshold = { ...noBar, value: 0.2, unit: "SMD", source: "S1", derived_in: "Cohen's convention", anchor_based: false, population_match: "same", verdict: "cleared", note: "-" };
    expect(canPromote(convention)).toBe(false);
    const r = impact({ outcome: { ...lived, threshold: convention } });
    expect(r.level).toBe(2);
    expect(r.because).toMatch(/statistical convention/);
  });

  it("a bar derived in a DIFFERENT population cannot promote, but may still demote", () => {
    const patients: EffectThreshold = { value: 5, unit: "kg", source: "S1", derived_in: "COPD patients", anchor_based: true, population_match: "different", verdict: "cleared", note: "-" };
    expect(impact({ outcome: { ...lived, threshold: patients } }).level).toBe(2);
    const failed: EffectThreshold = { ...patients, verdict: "failed" };
    expect(impact({ outcome: { ...lived, threshold: failed } }).level).toBe(1);
  });

  it("an interval spanning the null is 0, however large the point estimate", () => {
    const o = { ...lived, estimate: { ...lived.estimate, value: 9, ciLow: -2, ciHigh: 20 } };
    expect(spansNull(o.estimate)).toBe(true);
    expect(impact({ outcome: o }).level).toBe(0);
  });

  it("an effect pointing the wrong way is 0, and an unknown sign is not graded", () => {
    expect(impact({ outcome: { ...lived, estimate: { ...lived.estimate, value: -3, ciLow: -5, ciHigh: -1 } } }).level).toBe(0);
    const unclear = impact({ outcome: { ...lived, estimate: { ...lived.estimate, direction: "unclear" } } });
    expect(unclear.kind).toBe("not_graded");
    expect(unclear.because).toMatch(/guessing would invert/);
  });

  it("direction is read against the metric's own null: 0 for SMD, 1 for a ratio", () => {
    const rr = { ...lived.estimate, metric: "rr" as const, value: 0.7, ciLow: 0.5, ciHigh: 0.95, direction: "lower_better" as const };
    expect(isBenefit(rr)).toBe(true);
    expect(spansNull({ ...rr, ciLow: 0.8, ciHigh: 1.3 })).toBe(true);
  });

  it("deficiency correction and treatment leave the axis entirely", () => {
    const r = impact({ outcome: lived, separateTrack: { reason: "This corrects a shortfall rather than improving a healthy person." } });
    expect(r.kind).toBe("separate_track");
    expect(r.level).toBeNull();
  });

  it("a magnitude that cannot be stood behind is not graded, never 0", () => {
    const r = impact({ outcome: lived, notGraded: { reason: "Two trials of 25 and 32 people, I-squared 83%." } });
    expect(r.kind).toBe("not_graded");
    expect(r.level).toBeNull();
  });
});

describe("the numbers stay in the unit a person lives in", () => {
  it("creatine is kilograms on the bar, not a standardised effect", () => {
    const e = row(CREATINE, "O1").estimate;
    expect(e.metric).toBe("raw");
    expect(e.unit).toContain("kg");
    expect(e.value).toBe(5.64);
    expect([e.ciLow, e.ciHigh]).toEqual([3.87, 7.4]);
  });

  it("the bench figure is the training-only split, not the all-arms number that includes non-exercisers", () => {
    const also = row(CREATINE, "O1").also_reported[0];
    expect(also.value).toBe(2.16);
    expect(also.interval_note).toMatch(/18 arms with no exercise/);
  });

  it("the overlapping second review is a cross-check, never averaged into the headline", () => {
    const c = row(CREATINE, "O1").cross_checks[0];
    expect(c.overlap).toBe("likely_substantial");
    expect(c.independent_replication).toBe(false);
  });
});
