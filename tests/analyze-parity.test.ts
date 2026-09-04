/*
 * PYTHON <-> TYPESCRIPT SCORING PARITY.
 *
 * lib/analyze/{scoring,vocab}.ts are ports of pipeline/{dose,arcs,vocab}.py so
 * the label-upload route can run on Vercel, where there is no Python. CLAUDE.md
 * warns that "two copies of the same number is how they disagree later" — this
 * file is the mitigation. Every case in tests/golden_scoring_parity.json was
 * COMPUTED BY THE PYTHON ORIGINALS (regenerate with
 * `python3 scripts/golden_parity.py`). If a founder retunes a constant or
 * reshapes a ramp in Python, this test fails until the TS port is updated —
 * a loud disagreement instead of a silent drift.
 *
 * scoreProduct's behaviour (refusals, no-dose reproduction, demo exclusion) is
 * pinned separately in pipeline/selftest.py against the same artifacts this
 * suite loads, so the two implementations are checked against one dataset.
 */
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { composite, doseFactorFor, doseMatchFor, verdictLabel, type DoseBand } from "@/lib/analyze/scoring";
import { elementalDoseRangeMg } from "@/lib/analyze/vocab";
import { scoreProduct } from "@/lib/analyze/product-score";

interface GoldenCase {
  args: unknown[];
  expect: unknown;
}

const golden = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "tests", "golden_scoring_parity.json"), "utf8"),
) as Record<string, GoldenCase[]>;

describe("dose_factor_for parity", () => {
  it.each(golden.dose_factor.map((c, i) => [i, c] as const))("case %i", (_i, c) => {
    const [low, high, band] = c.args as [number | null, number | null, DoseBand];
    expect(doseFactorFor(low, high, band)).toBe(c.expect);
  });
});

describe("dose_match_for parity", () => {
  it.each(golden.dose_match.map((c, i) => [i, c] as const))("case %i", (_i, c) => {
    const [low, high, band] = c.args as [number | null, number | null, DoseBand];
    expect(doseMatchFor(low, high, band)).toBe(c.expect);
  });
});

describe("composite parity", () => {
  it.each(golden.composite.map((c, i) => [i, c] as const))("case %i", (_i, c) => {
    const [effect, form, dose, conf, h] = c.args as [
      number | null,
      number | null,
      number | null,
      number,
      number,
    ];
    expect(composite(effect, form, dose, conf, h)).toBe(c.expect);
  });
});

describe("verdict label parity", () => {
  it.each(golden.label.map((c, i) => [i, c] as const))("case %i", (_i, c) => {
    const [comp, conf, effect, limited, fit] = c.args as [
      number | null,
      number | null,
      number | null,
      boolean,
      number | null,
    ];
    expect(verdictLabel(comp, conf, effect, limited, fit ?? null)).toBe(c.expect);
  });
});

describe("elemental dose conversion parity", () => {
  it.each(golden.elemental.map((c, i) => [i, c] as const))("case %i", (_i, c) => {
    const [ingredient, form, dose] = c.args as [string, string | null, number | null];
    expect(elementalDoseRangeMg(ingredient, form, dose)).toEqual(c.expect);
  });
});

describe("scoreProduct against the retained artifacts", () => {
  it("passing the run's own dose reproduces its composites exactly", () => {
    // The regression pipeline/selftest.py pins for the Python implementation,
    // asserted here for the TS port against the real retained run: scoring at
    // the SAME product dose the run itself was scored at must round-trip every
    // composite. For a dose-less run that dose is null (the original pin: the
    // dose term takes MISSING_DOSE_PENALTY both times). Runs scored WITH a
    // --dose (first one: 20260823_181048, 4396 mg elemental) bake a real dose
    // term into the stored composite, so the round-trip must use that dose --
    // recomputing them at NO dose is a different product and rightly differs.
    const probe = scoreProduct("creatine", "creatine_monohydrate", null);
    if (probe.status === "not_scored") return; // no artifact in this checkout
    expect(probe.status).toBe("scored");
    const ownDose = ((probe.run ?? {}) as Record<string, unknown>)
      .scored_product_dose_mg as number | null | undefined;
    const result = ownDose == null
      ? probe
      : scoreProduct("creatine", "creatine_monohydrate", ownDose);
    expect(result.status).toBe("scored");
    for (const row of result.rows as Array<Record<string, unknown>>) {
      expect(row.composite).toBe(row.run_composite);
    }
  });

  it("an unscored ingredient returns not_scored, never a number", () => {
    const result = scoreProduct("ashwagandha", "ashwagandha_ksm66", 600);
    expect(result.status).toBe("not_scored");
    expect(result.rows).toBeUndefined();
  });

  it("a form with no run is distinguished from an ingredient with no run", () => {
    const result = scoreProduct("creatine", "creatine_hcl", 3000);
    if (result.status === "not_scored") return; // no artifact in this checkout
    expect(result.status).toBe("form_not_scored");
    expect(result.scored_forms).toContain("creatine_monohydrate");
  });

  it("every scored row carries its four arcs and the validity block", () => {
    const result = scoreProduct("creatine", "creatine_monohydrate", 3868.5);
    if (result.status !== "scored") return;
    const validity = result.validity as Record<string, unknown>;
    expect(typeof validity.public_claims_allowed).toBe("boolean");
    for (const row of result.rows as Array<Record<string, unknown>>) {
      const arcs = row.arcs as Record<string, unknown>;
      for (const key of ["effect", "form", "dose", "evidence"]) {
        expect(arcs[key]).toBeDefined();
      }
    }
  });
});
