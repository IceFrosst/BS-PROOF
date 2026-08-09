import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { assertDashboardRunV1, DashboardRunSchema } from "@/lib/dashboard/schema";
import { canonicalArtifactFixture } from "./fixtures";

describe("DashboardRunSchema", () => {
  it("accepts a normalized, fully attributed run", () => {
    expect(
      DashboardRunSchema.safeParse(structuredClone(canonicalArtifactFixture)),
    ).toMatchObject({ success: true });
  });

  it("rejects a display score outside the public 0-100 range", () => {
    const artifact = structuredClone(canonicalArtifactFixture);
    artifact.ecu_rows[0].composite = 101;
    expect(DashboardRunSchema.safeParse(artifact)).toMatchObject({ success: false });
  });

  it("rejects a numeric score that has lost its arc evidence", () => {
    const artifact = structuredClone(canonicalArtifactFixture);
    // @ts-expect-error: intentionally corrupting the artifact for validation.
    delete artifact.ecu_rows[0].arcs;
    expect(DashboardRunSchema.safeParse(artifact)).toMatchObject({ success: false });
  });

  it("rejects unknown usage fields that could leak prompts or cache keys", () => {
    const artifact = structuredClone(canonicalArtifactFixture);
    Object.assign(artifact.usage, {
      prompt: "DO-NOT-DEPLOY",
      cache_key: "DO-NOT-DEPLOY",
    });
    expect(DashboardRunSchema.safeParse(artifact)).toMatchObject({ success: false });
  });

  it("enforces the exact JSON contract used by the production build", () => {
    const retained = JSON.parse(
      readFileSync(
        resolve(process.cwd(), "reports/runs/20260807_164410_creatine_creatine-monohydrate_grok-sr-ft-per-o_dashboard.json"),
        "utf8",
      ),
    );
    expect(() => assertDashboardRunV1(retained)).not.toThrow();

    const missingUsage = structuredClone(retained);
    delete missingUsage.usage;
    expect(() => assertDashboardRunV1(missingUsage)).toThrow(/usage/i);

    const leakedAuditField = structuredClone(retained);
    leakedAuditField.run.prompt = "DO-NOT-DEPLOY";
    expect(() => assertDashboardRunV1(leakedAuditField)).toThrow(/additional properties/i);
  });
});
