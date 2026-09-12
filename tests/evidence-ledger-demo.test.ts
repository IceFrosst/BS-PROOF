import { describe, expect, it } from "vitest";

import { score, type Ledger, personFit, type StudiedIn } from "@/app/design-lab/ab/ledger";

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
  it("no meaningful effect reads 50 whatever the fit, and a HIGH-certainty null says so", () => {
    const r = score({ ...base, effectPoints: 0 });
    expect(r.headline).toBe(50);
    expect(r.label).toBe("No meaningful benefit");
    // low certainty null stays 'Unclear' -- we do not know, rather than 'we know it does nothing'
    expect(score({ ...base, effectPoints: 0, checklist: { ...base.checklist, precision: "concern", risk_of_bias: "concern" } }).label).toBe("Unclear");
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
    expect(r.label).toBe("Not scored");
  });
});

describe("person fit — fifth bar (founder scale, 2026-09-11)", () => {
  const youngMen: StudiedIn = { sex: "male", age_min: 18, age_max: 30 };
  const mixedOld: StudiedIn = { sex: "mixed", age_min: 60, age_max: 85 };

  it("3 = same sex and similar age", () => {
    expect(personFit({ age: 25, sex: "male" }, youngMen)).toBe(3);
  });
  it("2 = mixed-sex trials at a similar age, OR your sex but the wrong age", () => {
    expect(personFit({ age: 70, sex: "female" }, mixedOld)).toBe(2);
    expect(personFit({ age: 60, sex: "male" }, youngMen)).toBe(2);
  });
  it("1 = other sex, similar age", () => {
    expect(personFit({ age: 25, sex: "female" }, youngMen)).toBe(1);
  });
  it("0 = other sex and the age is off too", () => {
    expect(personFit({ age: 68, sex: "female" }, youngMen)).toBe(0);
  });
  it("age slack is a band, not a cliff", () => {
    expect(personFit({ age: 34, sex: "male" }, youngMen)).toBe(3); // 30 + 5 slack
    expect(personFit({ age: 36, sex: "male" }, youngMen)).toBe(2);
  });
  it("stays 'unknown' rather than guessing when we do not know who was enrolled or who is asking", () => {
    expect(personFit({ age: 30, sex: "male" }, undefined)).toBe("unknown");
    expect(personFit({ age: null, sex: null }, youngMen)).toBe("unknown");
    expect(personFit({ age: 30, sex: "male" }, { sex: "unknown", age_min: null, age_max: null })).toBe("unknown");
  });

  const base: Ledger = {
    effectPoints: 2, bodyIsRct: true,
    checklist: { risk_of_bias: "supported", consistency: "supported", precision: "supported", directness: "supported", publication_bias: "supported" },
    gates: { rctCount: 12, largestRctN: 400, longestRctWeeks: 26, chronicOutcome: true, surrogate: false, allPositiveIndustryOrOneLab: false },
    formFit: 4, doseFit: 4,
  };

  it("a poor person-match lowers a positive score but never flips a null into a benefit", () => {
    const ignored = score(base).headline as number;
    const matched = score(base, 3).headline as number;
    const mismatched = score(base, 0).headline as number;
    expect(matched).toBe(ignored); // perfect match == the un-personalised score
    expect(mismatched).toBeLessThan(matched);
    // a null stays exactly 50 no matter who is asking
    expect(score({ ...base, effectPoints: 0 }, 0).headline).toBe(50);
    expect(score({ ...base, effectPoints: 0 }, 3).headline).toBe(50);
  });
  it("person fit cannot rescue a harm signal into a benefit", () => {
    expect(score({ ...base, effectPoints: -3 }, 3).headline as number).toBeLessThan(50);
  });
});
