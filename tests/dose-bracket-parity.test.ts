/*
 * The unspecified-form bracket, pinned to the values pipeline/vocab.py produces.
 *
 * Two copies of a formula is how they disagree later. These goldens were
 * computed by the Python original on 2026-08-24:
 *
 *   python -c "import pipeline.vocab as V;
 *              print(V.elemental_dose_range_mg('creatine','creatine_unspecified',5000))"
 *   -> {'low': 3912.209, 'high': 5000.0, 'basis': 'bounded'}
 */
import { describe, expect, it } from "vitest";

import { elementalDoseRangeMg } from "@/lib/analyze/vocab";

describe("unspecified-form elemental bracket", () => {
  it("brackets a stated dose across the ingredient's known salts", () => {
    expect(elementalDoseRangeMg("creatine", "creatine_unspecified", 5000)).toEqual({
      low: 3912.209,
      high: 5000,
      basis: "bounded",
    });
    expect(elementalDoseRangeMg("creatine", "creatine_unspecified", 3000)).toEqual({
      low: 2347.326,
      high: 3000,
      basis: "bounded",
    });
    expect(elementalDoseRangeMg("creatine", "creatine_unspecified", 20000)).toEqual({
      low: 15648.838,
      high: 20000,
      basis: "bounded",
    });
  });

  it("leaves an exactly-convertible named form on the exact path", () => {
    expect(elementalDoseRangeMg("creatine", "creatine_monohydrate", 5000)).toEqual({
      low: 4396.062,
      high: 4396.062,
      basis: "converted",
    });
  });

  it("still refuses a NAMED salt whose molar data is missing", () => {
    // We know which salt it is and merely lack its mass. Bracketing across
    // other salts would answer a different question, so this must refuse.
    expect(elementalDoseRangeMg("creatine", "creatine_citrate", 5000)).toEqual({
      low: null,
      high: null,
      basis: "compound_only",
    });
  });

  it("refuses when no dose was printed at all", () => {
    expect(elementalDoseRangeMg("creatine", "creatine_unspecified", null)).toEqual({
      low: null,
      high: null,
      basis: "unstated",
    });
  });
});
