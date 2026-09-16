/**
 * The scan report component (2026-09-15) rendered over REAL analyzeScan output
 * with fakes standing in for the model and the network. Each assertion guards
 * an invariant the redesign has to keep while reading like a consumer page:
 *
 *   - a composite never renders without its four arcs (invariant 8)
 *   - an unscored product shows NO gauge and no "/ 100" anywhere
 *   - every finding resting on the model is dashed and badged as an estimate
 *   - the at-a-glance card renders exactly the five questions, in order
 *   - a non-label image gets a single explanatory state, not a report
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ScanReport } from "@/components/scan-report";
import { analyzeScan } from "@/lib/analyze/scan";
import { SCENARIOS } from "@/tests/fixtures/scan-fakes";

async function render(name: keyof typeof SCENARIOS): Promise<string> {
  const data = await analyzeScan("aW1n", "image/png", SCENARIOS[name]());
  return renderToStaticMarkup(createElement(ScanReport, { data }));
}

function count(html: string, needle: string): number {
  return html.split(needle).length - 1;
}

describe("ScanReport", () => {
  it("a scored product: at-a-glance card, then every outcome card carries its gauge AND four checks", async () => {
    const html = await render("creatine");
    expect(html).toContain("At a glance");
    // The five questions, in the order a shopper asks them.
    const order = ["Does it work?", "Is the dose right?", "Is this the right form?", "Does the mix hold up?", "Who makes it?"];
    let last = -1;
    for (const q of order) {
      const at = html.indexOf(q);
      expect(at, q).toBeGreaterThan(last);
      last = at;
    }
    const cards = count(html, 'data-testid="scan-outcome"');
    expect(cards).toBeGreaterThan(0);
    // Invariant 8: gauge count == card count == count of each of the four checks.
    expect(count(html, 'class="scan-gauge"')).toBe(cards);
    for (const check of ["Direction of the evidence", "Tested in your form?", "Tested at your dose?", "How much evidence?"]) {
      expect(count(html, check), check).toBe(cards);
    }
    // The validity banner is load-bearing.
    expect(html).toContain("not a product claim");
    // The measured evidence finding is not an estimate.
    expect(html).not.toMatch(/scan-finding-[a-z]+ is-estimated">[^]*?Does it work\?/);
  });

  it("an unscored product renders no gauge and no score, and stamps the model estimate", async () => {
    const html = await render("magnesium");
    expect(html).toContain("At a glance");
    expect(html).not.toContain('class="scan-gauge"');
    expect(html).not.toContain("out of 100");
    expect(html).not.toContain("/ 100");
    expect(html).toContain("Model estimate · unverified");
    expect(html).toContain("is-estimated");
    expect(html).toContain("What the published research says");
    // Not scored is not scored badly: the evidence finding is not a concern.
    expect(html).not.toMatch(/scan-finding-concern[^>]*>[^]*?Does it work\?/);
  });

  it("a keyless deployment still gets a report with the evidence marked unknown, never as a failure", async () => {
    const html = await render("nomodel");
    expect(html).toContain("Not measured yet");
    expect(html).not.toContain('class="scan-gauge"');
    expect(html).toContain("scan-finding-unknown");
  });

  it("a registry recall surfaces as a concern with the registry badge", async () => {
    const html = await render("recall");
    expect(html).toContain("FDA recall");
    expect(html).toContain("scan-finding-concern");
    expect(html).toContain("Undeclared allergen");
  });

  it("an out-of-vocabulary ingredient gets the orientation, the mix and the company, and no gauge", async () => {
    const html = await render("shilajit");
    expect(html).toContain("has not been run through the trial pipeline yet");
    expect(html).not.toContain('class="scan-gauge"');
    expect(html).toContain("Who makes it, and what is on record?");
  });

  it("a non-label image is one explanatory state, not a report", async () => {
    const html = await render("notlabel");
    expect(html).toContain("does not look like a supplement label");
    expect(html).not.toContain("At a glance");
  });
});
