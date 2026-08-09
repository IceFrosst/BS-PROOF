import { describe, expect, it } from "vitest";

import { normalizeRun } from "@/lib/dashboard/normalize";
import { reconcileRun } from "@/lib/dashboard/reconcile";

import { modernRunFixture } from "./fixtures";
import {
  providerOf,
  scoringModelOf,
} from "./helpers";

describe("reconcileRun", () => {
  it("accepts matching legacy report metadata without replacing JSON outcomes", () => {
    const normalized = normalizeRun(structuredClone(modernRunFixture));
    normalized.run.provider = "claude";
    const retained = structuredClone(normalized);
    const reconciled = reconcileRun(normalized, retained);

    expect(reconciled.ok).toBe(true);
    expect(reconciled.issues).toEqual([]);
    expect(reconciled.checked).toBeGreaterThanOrEqual(2);
  });

  it("refuses to blend providers or scoring models", () => {
    const primary = normalizeRun(structuredClone(modernRunFixture));
    primary.run.provider = "claude";
    primary.run.scoringModel = "v2-four-arc";
    const foreign = structuredClone(primary);
    foreign.run.id = "foreign-grok-run";
    foreign.run.provider = "grok";
    foreign.run.scoringModel = "v3-foreign";
    expect(providerOf(primary)).toBe("claude");
    expect(providerOf(foreign)).toBe("grok");
    expect(scoringModelOf(primary)).toBe("v2-four-arc");
    expect(scoringModelOf(foreign)).toBe("v3-foreign");

    const reconciled = reconcileRun(primary, foreign);
    expect(reconciled.ok).toBe(false);
    expect(reconciled.issues.map((issue) => issue.path).join(" ")).toMatch(
      /provider|backend|scoring.?model|model/i,
    );
  });

  it("rejects complete usage breakdowns that do not sum to run totals", () => {
    const run = normalizeRun(structuredClone(modernRunFixture));
    expect(run.usage).not.toBeNull();
    if (!run.usage) return;
    Object.assign(run.usage, {
      breakdownStatus: "complete",
      calls: 2,
      cacheHits: 0,
      retries: 0,
      failures: 0,
      terminalFailures: 0,
      freshInputTokens: 2,
      cacheWriteTokens: 0,
      cacheReadTokens: 0,
      outputTokens: 1,
      totalTokens: 3,
      apiEquivalentUsd: 1,
    });
    const consistent = {
      calls: 2,
      cache_hits: 0,
      retries: 0,
      failures: 0,
      terminal_failures: 0,
      api_equivalent_cost: 1,
      tokens: { fresh_input: 2, cache_write: 0, cache_read: 0, output: 1, total: 3 },
    };
    run.usage.byAgent = [{ agent: "S1", ...consistent, calls: 1 }];
    run.usage.byTier = [{ tier: "A", ...consistent }];
    run.usage.byModel = [{ model: "model", ...consistent }];

    const reconciled = reconcileRun(run);
    expect(reconciled.ok).toBe(false);
    expect(reconciled.issues.some((item) => item.path === "usage.byAgent.calls")).toBe(true);
  });

  it("rejects a dashboard artifact that drops a retained outcome", () => {
    const retained = normalizeRun(structuredClone(modernRunFixture));
    const truncated = structuredClone(retained);
    truncated.outcomes = truncated.outcomes.slice(0, 1);

    const reconciled = reconcileRun(truncated, retained);
    expect(reconciled.ok).toBe(false);
    expect(reconciled.issues.map((item) => item.code)).toContain("outcome_count_mismatch");
    expect(reconciled.issues.map((item) => item.code)).toContain("outcome_set_mismatch");
  });
});
