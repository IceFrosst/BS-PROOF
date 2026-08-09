import fs from "node:fs";
import path from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/**
 * Routes are derived from the retained artifacts, not hardcoded. A second run
 * changes which routes are audited; it does not leave this file pointing at a
 * run id or an outcome id that no longer exists.
 */

const RUNS_DIR = path.join(process.cwd(), "reports", "runs");

interface Artifact {
  run: { id: string; generated_at?: string | null };
  ecu_rows: Array<{
    outcome_vocab_id?: string;
    outcome?: { id?: string };
    composite: number | null;
  }>;
}

function loadArtifacts(): Artifact[] {
  if (!fs.existsSync(RUNS_DIR)) return [];
  return fs
    .readdirSync(RUNS_DIR)
    .filter((name) => name.endsWith("_dashboard.json"))
    .map((name) => JSON.parse(fs.readFileSync(path.join(RUNS_DIR, name), "utf8")) as Artifact)
    .sort((left, right) =>
      (right.run.generated_at ?? right.run.id).localeCompare(left.run.generated_at ?? left.run.id),
    );
}

function outcomeId(row: Artifact["ecu_rows"][number]): string {
  return row.outcome?.id ?? row.outcome_vocab_id ?? "";
}

function auditedRoutes(): string[] {
  const routes = ["/", "/methodology", "/runs/not-a-real-run"];
  for (const artifact of loadArtifacts()) {
    const runId = artifact.run.id;
    routes.push(`/runs/${runId}`);
    // Audit both evidence states: a gated outcome renders a different tree
    // (no arc readout, a different accessible name) from a scored one.
    const scored = artifact.ecu_rows.find((row) => row.composite !== null);
    const gated = artifact.ecu_rows.find((row) => row.composite === null);
    for (const row of [scored, gated]) {
      if (row) routes.push(`/runs/${runId}/outcomes/${outcomeId(row)}`);
    }
  }
  return [...new Set(routes)];
}

for (const route of auditedRoutes()) {
  test(`${route} has no automatically detectable accessibility violations`, async ({
    page,
  }) => {
    await page.goto(route);
    await page.locator("main#main-content").waitFor();

    const result = await new AxeBuilder({ page })
      .withTags([
        "wcag2a",
        "wcag2aa",
        "wcag21a",
        "wcag21aa",
        "wcag22a",
        "wcag22aa",
      ])
      .analyze();

    expect(
      result.violations,
      result.violations
        .map(
          (violation) =>
            `${violation.id}: ${violation.help}\n${violation.nodes
              .map((node) => `  ${node.target.join(" ")}: ${node.failureSummary}`)
              .join("\n")}`,
        )
        .join("\n\n"),
    ).toEqual([]);
  });
}
