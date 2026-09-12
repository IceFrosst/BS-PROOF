/**
 * Effect grading: quality -> overlap -> combine -> disagreement.
 * The point of these is that the EFFECT TIER IS COMPUTED, not chosen by a
 * model, so the same sources always produce the same tier.
 */
import { describe, expect, it } from "vitest";

import {
  CCA_SAME_SOURCE, QUALITY_FLOOR, combineSources, correctedCoveredArea, dedupeByOverlap,
  containment, disagree, gradeEffect, qualityScore, sameEvidence, tierFromEstimate, type EvidenceSource, type QualityFacts,
} from "@/app/design-lab/ab/effect";

const facts = (o: Partial<QualityFacts> = {}): QualityFacts => ({
  isCochrane: false, prosperoRegistered: false, gradeReported: false, robToolUsed: false,
  heterogeneityReported: false, publicationBiasTested: false, trialCount: 5, totalN: 300, ...o,
});
const src = (o: Partial<EvidenceSource> & { id: string }): EvidenceSource => ({
  year: 2024, design: "sr_ma", metric: "smd", estimate: 0.3, ciLow: 0.1, ciHigh: 0.5,
  quality: facts(), trialIds: ["t1", "t2", "t3", "t4", "t5"], ...o,
});

describe("step 1 — quality from objective facts, funding excluded", () => {
  it("rewards registration, GRADE, a RoB tool, heterogeneity and bias testing", () => {
    expect(qualityScore(facts())).toBe(0);
    expect(qualityScore(facts({ prosperoRegistered: true, gradeReported: true, robToolUsed: true }))).toBe(3);
    expect(qualityScore(facts({ isCochrane: true, gradeReported: true, robToolUsed: true, heterogeneityReported: true, publicationBiasTested: true, trialCount: 20, totalN: 5000 }))).toBe(8);
  });
  it("industry funding is NOT part of the score — it is a separate disclosure", () => {
    // The type has no funding field at all; this pins that decision.
    expect(Object.keys(facts())).not.toContain("funding");
  });
  it("size alone cannot buy a good score", () => {
    expect(qualityScore(facts({ trialCount: 99, totalN: 999999 }))).toBeLessThan(QUALITY_FLOOR);
  });
});

describe("step 2 — overlap: reviews sharing trials are one source", () => {
  it("CCA is 0 for disjoint trial sets and 1 for identical ones", () => {
    expect(correctedCoveredArea([src({ id: "a", trialIds: ["1", "2"] }), src({ id: "b", trialIds: ["3", "4"] })])).toBe(0);
    expect(correctedCoveredArea([src({ id: "a", trialIds: ["1", "2"] }), src({ id: "b", trialIds: ["1", "2"] })])).toBe(1);
  });
  it("a big review containing a small one collapses to the better-conducted one", () => {
    const small = src({ id: "small-23", trialIds: Array.from({ length: 23 }, (_, i) => `t${i}`), quality: facts({ trialCount: 23, totalN: 509, heterogeneityReported: true, publicationBiasTested: true }) });
    const big = src({ id: "big-69", year: 2025, trialIds: Array.from({ length: 69 }, (_, i) => `t${i}`), quality: facts({ trialCount: 69, totalN: 1937, heterogeneityReported: true, publicationBiasTested: true, prosperoRegistered: true, robToolUsed: true }) });
    // CCA alone understates subsumption (0.33 here); containment catches it.
    expect(correctedCoveredArea([small, big])).toBeLessThan(CCA_SAME_SOURCE);
    expect(containment(small, big)).toBe(1);
    expect(sameEvidence(small, big)).toBe(true);
    const { kept, dropped } = dedupeByOverlap([small, big]);
    expect(kept.map((k) => k.id)).toEqual(["big-69"]);
    expect(dropped[0]).toMatchObject({ id: "small-23", supersededBy: "big-69" });
  });
  it("overlap is broken by METHODOLOGY, not by size — a Cochrane review beats a bigger weak one", () => {
    const shared = Array.from({ length: 12 }, (_, i) => `t${i}`);
    const cochrane = src({ id: "cochrane", trialIds: shared, quality: facts({ isCochrane: true, gradeReported: true, robToolUsed: true, trialCount: 12, totalN: 900 }) });
    const bigWeak = src({ id: "big-weak", trialIds: [...shared, "x1", "x2"], quality: facts({ trialCount: 14, totalN: 9000 }) });
    expect(dedupeByOverlap([cochrane, bigWeak]).kept.map((k) => k.id)).toEqual(["cochrane"]);
  });
});

describe("step 3 — combine independent sources by precision", () => {
  it("a tighter interval pulls the pooled estimate towards it", () => {
    const vague = src({ id: "vague", estimate: 0.6, ciLow: 0.1, ciHigh: 1.1, trialIds: ["a1", "a2"], quality: facts({ prosperoRegistered: true, gradeReported: true, robToolUsed: true, heterogeneityReported: true }) });
    const tight = src({ id: "tight", estimate: 0.2, ciLow: 0.15, ciHigh: 0.25, trialIds: ["b1", "b2"], quality: facts({ prosperoRegistered: true, gradeReported: true, robToolUsed: true, heterogeneityReported: true }) });
    const c = combineSources([vague, tight]);
    expect(c!.usedSourceIds.sort()).toEqual(["tight", "vague"]);
    expect(c!.estimate).toBeLessThan(0.3);
    expect(c!.estimate).toBeGreaterThan(0.19);
  });
  it("caps at three sources and reports what it excluded for methodology", () => {
    const ok = (i: number) => src({ id: `ok${i}`, trialIds: [`o${i}a`, `o${i}b`], quality: facts({ prosperoRegistered: true, gradeReported: true, robToolUsed: true, heterogeneityReported: true }) });
    const junk = src({ id: "junk", trialIds: ["j1"], quality: facts() });
    const c = combineSources([ok(1), ok(2), ok(3), ok(4), junk]);
    expect(c!.usedSourceIds).toHaveLength(3);
    expect(c!.excludedForQuality).toContain("junk");
  });
  it("ratio metrics combine on the log scale", () => {
    const a = src({ id: "a", metric: "rr", estimate: 0.5, ciLow: 0.4, ciHigh: 0.62, trialIds: ["a1"], quality: facts({ isCochrane: true, gradeReported: true, robToolUsed: true }) });
    const b = src({ id: "b", metric: "rr", estimate: 0.8, ciLow: 0.65, ciHigh: 0.98, trialIds: ["b1"], quality: facts({ isCochrane: true, gradeReported: true, robToolUsed: true }) });
    const c = combineSources([a, b])!;
    expect(c.estimate).toBeGreaterThan(0.5);
    expect(c.estimate).toBeLessThan(0.8);
  });
});

describe("step 4 — disagreement costs a tier and cannot be averaged away", () => {
  it("non-overlapping intervals are flagged", () => {
    expect(disagree(src({ id: "a", ciLow: 0.4, ciHigh: 0.8 }), src({ id: "b", ciLow: 0.0, ciHigh: 0.2 }))).toBe(true);
    expect(disagree(src({ id: "a", ciLow: 0.1, ciHigh: 0.5 }), src({ id: "b", ciLow: 0.3, ciHigh: 0.7 }))).toBe(false);
  });
  it("widens the interval to cover every point estimate rather than faking precision", () => {
    const hi = src({ id: "hi", estimate: 0.7, ciLow: 0.6, ciHigh: 0.8, trialIds: ["h1"], quality: facts({ isCochrane: true, gradeReported: true, robToolUsed: true }) });
    const lo = src({ id: "lo", estimate: 0.15, ciLow: 0.1, ciHigh: 0.2, trialIds: ["l1"], quality: facts({ isCochrane: true, gradeReported: true, robToolUsed: true }) });
    const g = gradeEffect([hi, lo])!;
    expect(g.disagreement).toBe(true);
    expect(g.ciLow).toBeLessThanOrEqual(0.15);
    expect(g.ciHigh).toBeGreaterThanOrEqual(0.7);
    expect(g.tier).toBe(g.tierBeforeDisagreement - 1);
  });
});

describe("bands are calibrated against things you can check by feel", () => {
  it("caffeine-sized alertness effect is a 3", () => {
    expect(tierFromEstimate("smd", 0.55, 0.4, 0.7)).toBe(3);
  });
  it("creatine-sized strength effect is a 2", () => {
    expect(tierFromEstimate("smd", 0.35, 0.16, 0.53)).toBe(2);
  });
  it("melatonin-sized 7-minute effect is a 1", () => {
    expect(tierFromEstimate("smd", 0.15, 0.08, 0.22)).toBe(1);
  });
  it("magnesium-sized sleep effect is a 0", () => {
    expect(tierFromEstimate("smd", 0.05, -0.05, 0.15)).toBe(0);
  });
  it("an interval spanning no effect is 0 however large the point estimate", () => {
    expect(tierFromEstimate("smd", 0.9, -0.2, 2.0)).toBe(0);
    expect(tierFromEstimate("rr", 0.4, 0.15, 1.6)).toBe(0);
  });
  it("halving a risk is large; a 10% relative change is nothing", () => {
    expect(tierFromEstimate("rr", 0.45, 0.32, 0.63)).toBe(3);
    expect(tierFromEstimate("rr", 0.9, 0.84, 0.96)).toBe(0);
  });
  it("harm is graded, not silently dropped", () => {
    expect(tierFromEstimate("smd", -0.4, -0.6, -0.2)).toBe(-3);
    expect(tierFromEstimate("rr", 1.6, 1.3, 1.9)).toBe(-3);
  });
});

describe("the creatine case that motivated all of this", () => {
  // 23-study MA (+4.43 kg, SMD ~0.35) vs the 69-study MA that contains it (+1.43 kg, SMD ~0.12).
  const ma23 = src({
    id: "PMID 39519498", year: 2024, estimate: 0.35, ciLow: 0.16, ciHigh: 0.53,
    trialIds: Array.from({ length: 23 }, (_, i) => `c${i}`),
    quality: facts({ trialCount: 23, totalN: 509, heterogeneityReported: true, publicationBiasTested: true, robToolUsed: true }),
  });
  const ma69 = src({
    id: "PMID 40944139", year: 2025, estimate: 0.12, ciLow: 0.04, ciHigh: 0.2,
    trialIds: Array.from({ length: 69 }, (_, i) => `c${i}`),
    quality: facts({ trialCount: 69, totalN: 1937, heterogeneityReported: true, publicationBiasTested: true, robToolUsed: true, prosperoRegistered: true }),
  });

  it("does not average two overlapping reviews — it keeps the better-conducted one", () => {
    const g = gradeEffect([ma23, ma69])!;
    expect(g.usedSourceIds).toEqual(["PMID 40944139"]);
    expect(g.droppedForOverlap[0]).toMatchObject({ id: "PMID 39519498", supersededBy: "PMID 40944139" });
    // One source retained, so no spurious disagreement penalty.
    expect(g.disagreement).toBe(false);
    expect(g.tier).toBe(1);
  });

  it("reaches by rule the answer that took a hand extraction to find", () => {
    // The audit shipped effectPoints "1" only after a deep dive uncovered the
    // larger review. The rule gets there from the source list alone.
    expect(gradeEffect([ma23])!.tier).toBe(2);
    expect(gradeEffect([ma23, ma69])!.tier).toBe(1);
  });
});
