import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { normalizeRun } from "@/lib/dashboard/normalize";

import {
  legacyAliasFixture,
  modernRunFixture,
  RETAINED_CONTEXT_PATH,
} from "./fixtures";
import {
  apiEquivalentUsdOf,
  billingBasisOf,
  compositeOf,
  countOf,
  outcomeIdOf,
  providerOf,
  rowsOf,
  spentUsdOf,
  telemetryAvailabilityOf,
  telemetryNumberOf,
} from "./helpers";

describe("normalizeRun", () => {
  it("normalizes legacy snake_case aliases without changing score meaning", () => {
    const normalized = normalizeRun(
      structuredClone(legacyAliasFixture),
      "20260807_164410_creatine_creatine-monohydrate_grok-sr-ft-per-o_context.json",
    );
    const rows = rowsOf(normalized);

    expect(providerOf(normalized)).toBe("grok");
    expect(countOf(normalized, "studiesTargeted")).toBe(2);
    expect(countOf(normalized, "partialFailures")).toBe(1);
    expect(outcomeIdOf(rows[0])).toBe("muscle_power");
    expect(compositeOf(rows[0])).toBe(32);
    expect(compositeOf(rows[1])).toBeNull();
  });

  it("never coerces unavailable or gated outcomes into a numeric zero", () => {
    const normalized = normalizeRun(structuredClone(modernRunFixture));
    const rows = rowsOf(normalized);
    const unavailable = rows.find((row) => outcomeIdOf(row) === "sleep_onset");

    expect(unavailable).toBeDefined();
    expect(compositeOf(unavailable!)).toBeNull();
    expect(rows.filter((row) => compositeOf(row) === 0)).toHaveLength(0);
  });

  it("keeps actual subscription spend separate from API-equivalent cost", () => {
    const normalized = normalizeRun(structuredClone(modernRunFixture));

    expect(spentUsdOf(normalized)).toBe(0);
    expect(apiEquivalentUsdOf(normalized)).toBe(8.75);
    expect(spentUsdOf(normalized)).not.toBe(apiEquivalentUsdOf(normalized));
  });

  it("allowlists downloadable usage metadata and drops prompts, cache keys, and auth", () => {
    const fixture = structuredClone(modernRunFixture) as typeof modernRunFixture & {
      usage: Record<string, unknown>;
    };
    fixture.usage = {
      ...fixture.usage,
      prompt: "DO-NOT-SHIP-PROMPT",
      cache_key: "DO-NOT-SHIP-CACHE-KEY",
      authentication: "DO-NOT-SHIP-AUTH",
      raw_structured_usage: {
        source: "test envelope",
        records: [{
          agent: "S1",
          reasoning_effort: "high",
          outcome: "success",
          tokens: { fresh_input: 10, output: 2 },
          prompt: "DO-NOT-SHIP-RECORD-PROMPT",
          cache_key: "DO-NOT-SHIP-RECORD-CACHE",
          authorization: "DO-NOT-SHIP-RECORD-AUTH",
        }],
        redactions: ["prompts", "cache_keys", "authentication"],
      },
    };
    const usage = normalizeRun(fixture).usage;
    expect(usage).not.toBeNull();
    const downloadable = JSON.stringify(usage?.raw);
    expect(downloadable).not.toMatch(/DO-NOT-SHIP/);
    expect(downloadable).toContain("reasoning_effort");
    expect(downloadable).toContain("fresh_input");
  });

  it("retains the committed 80-study run as a golden legacy fixture", () => {
    const source = resolve(process.cwd(), RETAINED_CONTEXT_PATH);
    const raw = JSON.parse(readFileSync(source, "utf8"));
    const normalized = normalizeRun(raw, source);

    expect(countOf(normalized, "studiesTargeted")).toBe(80);
    expect(countOf(normalized, "studiesOk")).toBe(80);
    expect(countOf(normalized, "partialFailures")).toBe(80);
    expect(countOf(normalized, "outcomesTotal")).toBe(30);
    expect(countOf(normalized, "outcomesScored")).toBe(19);
    expect(countOf(normalized, "outcomesUnavailable")).toBe(11);
    expect(normalized.usage).not.toBeNull();
    expect(telemetryAvailabilityOf(normalized)).toBe("partial");
    expect(telemetryNumberOf(normalized, ["calls", "liveCalls", "live_calls"])).toBe(797);
    expect(telemetryNumberOf(normalized, ["cacheHits", "cache_hits"])).toBe(6);
    expect(telemetryNumberOf(normalized, ["failures"])).toBe(86);
    expect(
      telemetryNumberOf(normalized, [
        "latencyAverageSeconds",
        "averageLatencySeconds",
        "avg_latency_seconds",
        "average_s",
      ]),
    ).toBe(113.6);
    expect(
      telemetryNumberOf(normalized, [
        "latencyP95Seconds",
        "p95LatencySeconds",
        "p95_latency_seconds",
        "p95_s",
      ]),
    ).toBe(146.9);
    expect(
      telemetryNumberOf(normalized, ["inputTokens", "input_tokens", "freshInput", "fresh_input"]) == null,
    ).toBe(true);
    expect(
      telemetryNumberOf(normalized, ["outputTokens", "output_tokens", "output"]) == null,
    ).toBe(true);
    expect(spentUsdOf(normalized)).toBe(0);
    expect(billingBasisOf(normalized)).toMatch(/subscription/i);
    expect(apiEquivalentUsdOf(normalized) == null).toBe(true);
  });
});
