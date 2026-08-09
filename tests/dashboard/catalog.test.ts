import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RETAINED_CONTEXT_PATH, RETAINED_RUN_ID } from "./fixtures";
import { compositeOf, outcomeIdOf, rowsOf } from "./helpers";

/**
 * The catalog is the only code that decides which runs exist. Its failure modes
 * are structural rather than numeric: one corrupt file hiding every other run,
 * a legacy projection quietly outranking a canonical artifact, or a retained
 * context being merged into an artifact instead of checked against it.
 *
 * Fixtures are built from the committed artifacts so they always satisfy the
 * real DashboardRunV1 contract; only identity and the field under test change.
 *
 * NOTE: two expectations here — "one unreadable artifact does not take the rest
 * of the catalog down" and "a legacy context run is retained alongside runs that
 * do have artifacts" — are written against a change to lib/dashboard/catalog.ts
 * that is being made concurrently by another author. They describe the intended
 * behaviour, not the behaviour at the time this file was written.
 */

type Json = Record<string, unknown>;

const REPO_ROOT = process.cwd();
const RETAINED_ARTIFACT_PATH = `reports/runs/${RETAINED_RUN_ID}_dashboard.json`;

const RUN_A = "20260807_164410_creatine_creatine-monohydrate_grok-a";
const RUN_B = "20260809_090000_creatine_creatine-monohydrate_grok-b";
const STAMP_A = "2026-08-07T16:44:10Z";
const STAMP_B = "2026-08-09T09:00:00Z";

let root = "";

function readRepoJson(relativePath: string): Json {
  return JSON.parse(fs.readFileSync(path.join(REPO_ROOT, relativePath), "utf8")) as Json;
}

function runsDir(): string {
  return path.join(root, "reports", "runs");
}

function write(fileName: string, contents: string): void {
  fs.writeFileSync(path.join(runsDir(), fileName), contents, "utf8");
}

function dashboardArtifact(runId: string, generatedAt: string): Json {
  const artifact = readRepoJson(RETAINED_ARTIFACT_PATH);
  const run = artifact.run as Json;
  run.id = runId;
  run.generated_at = generatedAt;
  (artifact.validity as Json).registry_key = runId;
  artifact.reports = {
    summary: `reports/runs/${runId}_summary.md`,
    full: `reports/runs/${runId}_full.md`,
    context: `reports/runs/${runId}_context.json`,
    dashboard: `reports/runs/${runId}_dashboard.json`,
  };
  return artifact;
}

function writeDashboardArtifact(runId: string, generatedAt: string, mutate?: (artifact: Json) => void): Json {
  const artifact = dashboardArtifact(runId, generatedAt);
  mutate?.(artifact);
  write(`${runId}_dashboard.json`, JSON.stringify(artifact));
  return artifact;
}

function writeLegacyContext(runId: string, mutate?: (context: Json) => void): Json {
  const context = readRepoJson(RETAINED_CONTEXT_PATH);
  mutate?.(context);
  write(`${runId}_context.json`, JSON.stringify(context));
  return context;
}

async function loadCatalogModule() {
  vi.spyOn(process, "cwd").mockReturnValue(root);
  vi.resetModules();
  return import("@/lib/dashboard/catalog");
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "bs-proof-catalog-"));
  fs.mkdirSync(runsDir(), { recursive: true });
  fs.mkdirSync(path.join(root, "vocab"), { recursive: true });
  fs.copyFileSync(
    path.join(REPO_ROOT, "vocab", "outcome.json"),
    path.join(root, "vocab", "outcome.json"),
  );
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe("loadDashboardCatalog", () => {
  it("returns an empty catalog rather than failing when no run is retained", async () => {
    const { loadDashboardCatalog, getRetainedRunIds } = await loadCatalogModule();

    expect(loadDashboardCatalog()).toEqual([]);
    expect(getRetainedRunIds()).toEqual([]);
  });

  it("loads every retained artifact and orders them newest first", async () => {
    writeDashboardArtifact(RUN_A, STAMP_A);
    writeDashboardArtifact(RUN_B, STAMP_B);
    const { loadDashboardCatalog, getRetainedRunIds } = await loadCatalogModule();

    const runs = loadDashboardCatalog();
    expect(runs.map((run) => run.run.id)).toEqual([RUN_B, RUN_A]);
    expect(getRetainedRunIds()).toEqual([RUN_B, RUN_A]);
    expect(runs[0].schemaVersion).toBe("DashboardRunV1");
  });

  it("carries gated outcomes through as unavailable and scored zeros as zero", async () => {
    const artifact = writeDashboardArtifact(RUN_A, STAMP_A);
    const { loadDashboardRun } = await loadCatalogModule();

    const run = loadDashboardRun(RUN_A);
    expect(run).not.toBeNull();
    const sourceRows = rowsOf(artifact);
    const gatedIds = sourceRows.filter((row) => compositeOf(row) === null).map(outcomeIdOf);
    const zeroIds = sourceRows.filter((row) => compositeOf(row) === 0).map(outcomeIdOf);

    expect(run!.outcomes).toHaveLength(sourceRows.length);
    expect(
      run!.outcomes.filter((outcome) => outcome.displayScore === null).map((outcome) => outcome.id),
    ).toEqual(gatedIds);
    // A zero that the run measured must survive as a zero, not become a gate.
    expect(
      run!.outcomes.filter((outcome) => outcome.displayScore === 0).map((outcome) => outcome.id),
    ).toEqual(zeroIds);
  });

  it("attaches outcome vocabulary so a direction can be read off the score", async () => {
    writeDashboardArtifact(RUN_A, STAMP_A);
    const { loadDashboardRun } = await loadCatalogModule();

    const vocabulary = new Map(
      (readRepoJson("vocab/outcome.json").outcomes as Array<Record<string, unknown>>).map(
        (entry) => [String(entry.id), entry],
      ),
    );
    const outcomes = loadDashboardRun(RUN_A)!.outcomes.filter((outcome) =>
      vocabulary.has(outcome.id),
    );

    expect(outcomes.length).toBeGreaterThan(0);
    for (const outcome of outcomes) {
      const entry = vocabulary.get(outcome.id)!;
      expect(outcome.label).toBe(entry.label);
      expect(outcome.polarity).toBe(entry.polarity ?? null);
    }
  });

  it("returns null for a run id that was never retained", async () => {
    writeDashboardArtifact(RUN_A, STAMP_A);
    const { loadDashboardRun } = await loadCatalogModule();

    expect(loadDashboardRun("not-a-real-run")).toBeNull();
    expect(loadDashboardRun(`${RUN_A}_dashboard`)).toBeNull();
  });

  it("does not let one unreadable artifact take the rest of the catalog down", async () => {
    writeDashboardArtifact(RUN_A, STAMP_A);
    write("20260101_000000_broken_syntax_dashboard.json", "{ not json");
    write(
      "20260102_000000_broken_contract_dashboard.json",
      JSON.stringify({ schema_version: "DashboardRunV1", run: { id: "20260102_000000_broken_contract" } }),
    );
    const { loadDashboardCatalog } = await loadCatalogModule();

    const runs = loadDashboardCatalog();
    expect(runs.map((run) => run.run.id)).toContain(RUN_A);
    // A file the contract rejects must never be presented as a readable run:
    // absent is fine, an empty shell labelled valid is not.
    for (const run of runs.filter((item) => item.run.id.includes("broken"))) {
      expect(run.outcomes).toHaveLength(0);
      expect(run.run.validity.status.toLowerCase()).not.toBe("validated");
    }
  });

  it("retains a legacy context run alongside runs that do have artifacts", async () => {
    writeDashboardArtifact(RUN_A, STAMP_A);
    writeLegacyContext(RUN_B);
    const { loadDashboardCatalog } = await loadCatalogModule();

    const runs = loadDashboardCatalog();
    expect(runs.map((run) => run.run.id).sort()).toEqual([RUN_A, RUN_B].sort());

    const legacy = runs.find((run) => run.run.id === RUN_B)!;
    expect(legacy.schemaVersion).toBe("LegacyContextV0");
    // A projection of a pre-contract report must not pass itself off as validated.
    expect(legacy.run.validity.status.toLowerCase()).not.toBe("validated");
    expect(legacy.run.validity.publicClaimsAllowed).toBe(false);
    expect(legacy.run.validity.reasonCodes).toContain("legacy_context");
  });

  it("checks a run's retained context against its artifact instead of merging it", async () => {
    const artifact = writeDashboardArtifact(RUN_A, STAMP_A);
    writeLegacyContext(RUN_A);
    // The legacy projection reads its scoring model off the retained report.
    write(`${RUN_A}_summary.md`, "scoring_model: v2-four-arc\n\n# Summary\n");
    const { loadDashboardRun } = await loadCatalogModule();

    const run = loadDashboardRun(RUN_A)!;
    const readerCheck = run.reconciliation?.reader_check as { ok?: boolean } | undefined;
    expect(readerCheck?.ok).toBe(true);
    // The context is evidence about the artifact, never a source of rows.
    expect(run.outcomes.map((outcome) => outcome.id)).toEqual(rowsOf(artifact).map(outcomeIdOf));
  });

  it("never reports a disagreeing context as reconciled", async () => {
    writeDashboardArtifact(RUN_A, STAMP_A);
    writeLegacyContext(RUN_A, (context) => {
      (context.ecu_rows as unknown[]).splice(0, 1);
    });
    write(`${RUN_A}_summary.md`, "scoring_model: v2-four-arc\n\n# Summary\n");
    writeDashboardArtifact(RUN_B, STAMP_B);
    const { loadDashboardCatalog } = await loadCatalogModule();

    const runs = loadDashboardCatalog();
    expect(runs.map((run) => run.run.id)).toContain(RUN_B);
    const mismatched = runs.find((run) => run.run.id === RUN_A);
    if (mismatched) {
      const readerCheck = mismatched.reconciliation?.reader_check as { ok?: boolean } | undefined;
      expect(readerCheck?.ok).not.toBe(true);
    }
  });
});

describe("loadReportMarkdown", () => {
  it("reads a report the run actually retains", async () => {
    writeDashboardArtifact(RUN_A, STAMP_A);
    write(`${RUN_A}_summary.md`, "scoring_model: v2-four-arc\n\n# Summary\n");
    const { loadDashboardRun, loadReportMarkdown } = await loadCatalogModule();

    const run = loadDashboardRun(RUN_A)!;
    expect(run.reports.summaryPath).toBe(`reports/runs/${RUN_A}_summary.md`);
    expect(loadReportMarkdown(run.reports.summaryPath)).toContain("# Summary");
  });

  it("returns null for an absent report rather than an empty document", async () => {
    writeDashboardArtifact(RUN_A, STAMP_A);
    const { loadReportMarkdown } = await loadCatalogModule();

    expect(loadReportMarkdown(null)).toBeNull();
    expect(loadReportMarkdown(`reports/runs/${RUN_A}_full.md`)).toBeNull();
  });

  it("refuses to read anything outside the retained runs directory", async () => {
    const { loadReportMarkdown } = await loadCatalogModule();

    expect(() => loadReportMarkdown("../package.json")).toThrow(/outside the retained runs/i);
    expect(() => loadReportMarkdown("reports/runs/../../package.json")).toThrow(
      /outside the retained runs/i,
    );
    expect(() => loadReportMarkdown("/etc/passwd")).toThrow(/outside the retained runs/i);
    expect(() => loadReportMarkdown("reports/runs/nested/report.md")).toThrow(
      /outside the retained runs/i,
    );
  });
});
