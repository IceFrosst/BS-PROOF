/*
 * No retained artifact may be silently quarantined, and the run the analyzer
 * offers must have a page.
 *
 * Measured failure this guards against (2026-08-24): the v13 shadow block was
 * added to the artifact writer and to the Ajv JSON schema, but not to the Zod
 * schema in lib/dashboard/schema.ts, which is .strict(). Every run written
 * afterwards -- five that day -- was refused with `Unrecognized key:
 * "v13_shadow"` and dropped from the catalog. Nothing failed loudly: the
 * dashboard just kept showing an older run as newest, while
 * GET /api/analyze-label went on citing the newest artifact as its scored
 * product, so that run's page 404'd in production.
 *
 * Quarantine itself is correct and deliberate -- an artifact that fails its
 * contract must not render. What is not acceptable is quarantining a run the
 * repo intends to serve, without anything failing.
 */
import { describe, expect, it } from "vitest";

import { getRetainedRunIds, loadQuarantinedRuns } from "@/lib/dashboard/catalog";
import { availableProducts } from "@/lib/analyze/product-score";

describe("dashboard catalog and analyzer agree", () => {
  it("quarantines nothing", () => {
    const quarantined = loadQuarantinedRuns().map(
      (r) => `${r.runId}: ${String(r.reason).slice(0, 200)}`,
    );
    expect(quarantined).toEqual([]);
  });

  it("gives every product the analyzer offers a run that the dashboard serves", () => {
    const retained = new Set(getRetainedRunIds());
    const missing = availableProducts()
      .map((p) => p.run_id)
      .filter((id): id is string => typeof id === "string" && !retained.has(id));
    // A product offered from a run the dashboard cannot render sends the user
    // to a 404 for the evidence behind its own score.
    expect(missing).toEqual([]);
  });
});
