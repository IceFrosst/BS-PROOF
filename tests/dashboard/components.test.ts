import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { within } from "@testing-library/dom";
import { afterEach, describe, expect, it } from "vitest";

import { FourRingScore } from "@/components/four-ring-score";
import { StatusBadge } from "@/components/status-badge";
import type { DashboardOutcome } from "@/lib/dashboard/types";

/**
 * The rendering layer is where a null last has a chance to become a zero.
 * These render real components and read the result the way a browser (and a
 * screen reader) would.
 *
 * Components are constructed with createElement rather than JSX so the test
 * needs no JSX transform configuration to run; the vitest include glob accepts
 * .tsx as well, for tests that want it.
 */

function outcome(overrides: Partial<DashboardOutcome> = {}): DashboardOutcome {
  return {
    ecuKey: null,
    ingredient: "creatine",
    formVocabId: "creatine_monohydrate",
    doseBand: null,
    bandVersion: null,
    id: "muscle_strength",
    label: "Muscle strength",
    kind: "performance",
    definition: null,
    polarity: "higher_better",
    displayScore: 22,
    signedScore: -12,
    verdictLabel: "weak evidence against",
    band: "weak evidence against",
    gateFired: false,
    population: null,
    dose: null,
    doseRangeMg: null,
    studyIds: [],
    formMix: null,
    applicability: null,
    flags: [],
    provenance: null,
    arcs: {
      effect: { verdict: 0.6, coverage: 1, isQuantity: false },
      form: { verdict: 0.4, coverage: 0.75, isQuantity: false },
      dose: { verdict: null, coverage: null, isQuantity: false },
      evidence: { verdict: null, coverage: 0.8, isQuantity: true },
    },
    components: {
      d: 0.6,
      c: 0.8,
      heterogeneity: 0.1,
      evidenceMass: 4,
      adjustedEvidenceMass: 4.5,
      coverage: 0.8,
    },
    nPrimaries: 12,
    nSyntheses: null,
    promptVersion: "v1.7",
    ...overrides,
  };
}

function render(element: Parameters<typeof renderToStaticMarkup>[0]): HTMLElement {
  const host = document.createElement("div");
  host.innerHTML = renderToStaticMarkup(element);
  document.body.append(host);
  return host;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("FourRingScore", () => {
  it("announces a gated outcome as unavailable, never as a score", () => {
    const host = render(
      createElement(FourRingScore, {
        outcome: outcome({
          displayScore: null,
          signedScore: null,
          band: "no usable evidence retrieved",
          gateFired: true,
          arcs: {
            effect: { verdict: null, coverage: 0, isQuantity: false },
            form: { verdict: null, coverage: 0, isQuantity: false },
            dose: { verdict: null, coverage: 0, isQuantity: false },
            evidence: { verdict: null, coverage: 0, isQuantity: true },
          },
        }),
      }),
    );

    expect(within(host).getByLabelText(/Muscle strength: score unavailable$/)).toBeTruthy();
    expect(host.textContent).toContain("gated");
    expect(host.textContent).not.toMatch(/\/ 100/);
    // No arc verdict is offered for evidence that was never read.
    expect(host.querySelectorAll('[data-testid^="arc-"]')).toHaveLength(0);
  });

  it("announces a measured zero as a zero", () => {
    const host = render(
      createElement(FourRingScore, {
        outcome: outcome({
          displayScore: 0,
          signedScore: 0,
          arcs: {
            effect: { verdict: 0, coverage: 1, isQuantity: false },
            form: { verdict: 0, coverage: 1, isQuantity: false },
            dose: { verdict: 0, coverage: 1, isQuantity: false },
            evidence: { verdict: null, coverage: 0.013, isQuantity: true },
          },
        }),
      }),
    );

    expect(
      within(host).getByLabelText(/Muscle strength: composite score 0 out of 100$/),
    ).toBeTruthy();
    expect(host.textContent).toContain("/ 100");
    expect(host.textContent).not.toContain("gated");
    expect(host.querySelectorAll('[data-testid^="arc-"]')).toHaveLength(4);
  });

  it('renders "tested and found nothing" differently from "never tested"', () => {
    const host = render(
      createElement(FourRingScore, {
        outcome: outcome({
          arcs: {
            // Measured: the form was tested, across all the evidence, at zero effect.
            effect: { verdict: 0, coverage: 1, isQuantity: false },
            // Missing: nobody tested this product's form.
            form: { verdict: null, coverage: 0, isQuantity: false },
            // Not retained at all.
            dose: { verdict: null, coverage: null, isQuantity: false },
            evidence: { verdict: null, coverage: 0.8, isQuantity: true },
          },
        }),
      }),
    );

    const effect = host.querySelector('[data-testid="arc-effect"]')?.textContent ?? "";
    const form = host.querySelector('[data-testid="arc-form"]')?.textContent ?? "";
    const dose = host.querySelector('[data-testid="arc-dose"]')?.textContent ?? "";
    const evidence = host.querySelector('[data-testid="arc-evidence"]')?.textContent ?? "";

    expect(effect).toContain("100.0%");
    expect(effect).not.toContain("—");
    expect(form).toContain("—");
    expect(form).toContain("0.0%");
    expect(dose).toContain("Unavailable");
    expect(dose).not.toContain("0.0%");
    expect(effect).not.toBe(form);
    expect(form).not.toBe(dose);
    // The evidence arc is a quantity; it has no direction to report.
    expect(evidence).toContain("quantity");
  });
});

describe("StatusBadge", () => {
  it("only marks a run validated when the artifact says so", () => {
    const validated = render(createElement(StatusBadge, { status: "validated" }));
    expect(validated.querySelector(".status-positive")).not.toBeNull();
    expect(validated.textContent).toContain("Validated");

    for (const status of ["invalid", "experimental", "superseded", "unreviewed"]) {
      const host = render(createElement(StatusBadge, { status }));
      expect(host.querySelector(".status-positive")).toBeNull();
    }
  });

  it("exposes a test id only when the caller asks for one", () => {
    const host = render(createElement(StatusBadge, { status: "invalid", testId: "run-status" }));
    expect(host.querySelector('[data-testid="run-status"]')).not.toBeNull();
    expect(host.textContent).toContain("Invalid");
  });
});
