import { describe, expect, it } from "vitest";

import { score, type Ledger } from "@/app/design-lab/ab/ledger";

// Pins the worked examples in docs/design/2026-09-10-evidence-ledger-rubric.md
// so the design doc and the demo arithmetic cannot drift apart silently.
const base: Ledger = {
  effectPoints: 2,
  bodyIsRct: true,
  checklist: { risk_of_bias: "supported", consistency: "concern", precision: "supported", directness: "supported", publication_bias: "unknown" },
  gates: { rctCount: 24, largestRctN: 120, longestRctWeeks: 12, chronicOutcome: true, surrogate: false, allPositiveIndustryOrOneLab: false },
  formFit: 4,
  doseFit: 3,
};

describe("evidence ledger rubric v0.1 (proposed, demo only)", () => {
  it("worked example: E+2 C3 F4 D3 -> 72 works", () => {
    const r = score(base);
    expect(r.certainty).toBe(3);
    expect(r.headline).toBe(72);
    expect(r.label).toBe("Works");
  });
  it("untested form + poor dose fit discounts a benefit toward 50", () => {
    expect(score({ ...base, formFit: "unknown", doseFit: 1 }).headline).toBe(54);
    expect(score({ ...base, formFit: "unknown", doseFit: 3 }).headline).toBe(61);
  });
  it("no meaningful effect reads 50 whatever the fit", () => {
    expect(score({ ...base, effectPoints: 0 }).headline).toBe(50);
  });
  it("harm is never softened by applicability", () => {
    expect(score({ ...base, effectPoints: -3, checklist: { ...base.checklist, consistency: "supported" }, formFit: "unknown", doseFit: "unknown" }).headline).toBe(0);
  });
  it("gates cap certainty and are reported", () => {
    const r = score({ ...base, gates: { ...base.gates, rctCount: 1 } });
    expect(r.certainty).toBe(1);
    expect(r.firedGates).toEqual(["Only one RCT"]);
  });
  it("no RCT -> no headline, never a low number", () => {
    const r = score({ ...base, effectPoints: "unclear", gates: { ...base.gates, rctCount: 0 } });
    expect(r.headline).toBeNull();
    expect(r.label).toMatch(/Not enough evidence/);
  });
});
