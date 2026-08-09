import fs from "node:fs";
import path from "node:path";

import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * These tests must not encode the numbers of any single run.
 *
 * Every expected value below is READ FROM the retained artifact under
 * reports/runs/, so committing a second run changes what the tests derive
 * rather than breaking them. Runs are selected by run id, never by a text
 * regex that a second creatine run would also match.
 *
 * The formatters below are DELIBERATE re-implementations of
 * lib/dashboard/format.ts. Importing that module would make the assertions
 * tautological: the test would agree with the renderer even when both are
 * wrong. What is asserted here is "the page shows the artifact's value".
 */

const RUNS_DIR = path.join(process.cwd(), "reports", "runs");

const ARC_KEYS = ["effect", "form", "dose", "evidence"] as const;

type ArcKey = (typeof ARC_KEYS)[number];

interface ArtifactArc {
  verdict: number | null;
  coverage: number | null;
  is_quantity?: boolean;
}

interface ArtifactRow {
  outcome_vocab_id?: string;
  outcome?: { id?: string; label?: string };
  score: number | null;
  composite: number | null;
  arcs: Record<ArcKey, ArtifactArc>;
}

interface ArtifactUsage {
  telemetry_status: string;
  currency: string | null;
  metered_run_spend: number | null;
  metered_spend_basis: string | null;
  api_equivalent_cost: number | null;
  live_calls: number | null;
  cache_hits: number | null;
  retries: number | null;
  failures: number | null;
  tokens: {
    fresh_input: number | null;
    cache_write: number | null;
    cache_read: number | null;
    output: number | null;
    total: number | null;
  };
  latency: {
    wall_time_s: number | null;
    average_s: number | null;
    p95_s: number | null;
    peak_concurrency: number | null;
    basis: string | null;
  };
}

interface Artifact {
  run: { id: string; generated_at?: string | null };
  product?: { ingredient?: string; form?: string };
  stats?: {
    studies?: { targeted?: number | null };
    ecus?: { total?: number; scored?: number; gated?: number };
  };
  usage: ArtifactUsage;
  ecu_rows: ArtifactRow[];
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

const artifacts = loadArtifacts();

/** Interaction tests need one run, not every run; take the newest deterministically. */
const sample = artifacts.slice(0, 1);

function outcomeId(row: ArtifactRow): string {
  return row.outcome?.id ?? row.outcome_vocab_id ?? "";
}

function scoredRows(artifact: Artifact): ArtifactRow[] {
  return artifact.ecu_rows.filter((row) => row.composite !== null);
}

function gatedRows(artifact: Artifact): ArtifactRow[] {
  return artifact.ecu_rows.filter((row) => row.composite === null);
}

function expectedHumanized(value: string | null | undefined): string {
  if (!value) return "Unavailable";
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function expectedNumber(value: number | null, digits = 0): string {
  return value === null
    ? "Unavailable"
    : new Intl.NumberFormat("en", { maximumFractionDigits: digits }).format(value);
}

function expectedSeconds(value: number | null): string {
  return value === null ? "Unavailable" : `${expectedNumber(value, 1)} s`;
}

function expectedPercent(value: number | null): string {
  return value === null ? "Unavailable" : `${(value * 100).toFixed(1)}%`;
}

function expectedMoney(value: number | null, currency = "USD"): string {
  return value === null
    ? "Unavailable"
    : new Intl.NumberFormat("en", {
        style: "currency",
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 4,
      }).format(value);
}

function expectedSigned(value: number | null, digits = 3): string {
  if (value === null) return "—";
  let magnitude = Math.abs(value).toFixed(digits);
  if (magnitude.includes(".")) {
    magnitude = magnitude.replace(/0+$/, "").replace(/\.$/, "");
  }
  if (value > 0) return `+${magnitude}`;
  if (value < 0) return `−${magnitude}`;
  return "0";
}

/** The value of the <dd> whose sibling <dt> is exactly `term`. */
function definitionValue(page: Page, scope: Locator, term: string): Locator {
  return scope
    .locator("dl > div")
    .filter({ has: page.locator("dt", { hasText: new RegExp(`^${term}$`) }) })
    .locator("dd");
}

function runCard(page: Page, runId: string): Locator {
  return page
    .getByTestId("run-card")
    .filter({ has: page.locator(`a[href="/runs/${runId}/"], a[href="/runs/${runId}"]`) });
}

function outcomeCard(page: Page, runId: string, id: string): Locator {
  const href = `/runs/${runId}/outcomes/${id}`;
  return page
    .getByTestId("outcome-card")
    .filter({ has: page.locator(`a[href="${href}/"], a[href="${href}"]`) });
}

test("the repository retains at least one dashboard artifact to assert against", () => {
  expect(artifacts.map((artifact) => artifact.run.id)).not.toHaveLength(0);
});

for (const artifact of artifacts) {
  const runId = artifact.run.id;
  const scored = scoredRows(artifact);
  const gated = gatedRows(artifact);

  test(`catalog lists ${runId} with the counts its artifact declares`, async ({ page }) => {
    await page.goto("/");

    await expect(page.locator("main#main-content")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: /BS.?PROOF/i })).toBeVisible();

    // Every retained artifact must have a card; a second run adds a card, it
    // does not make an existing selector ambiguous.
    expect(await page.getByTestId("run-card").count()).toBeGreaterThanOrEqual(artifacts.length);

    const card = runCard(page, runId);
    await expect(card).toHaveCount(1);
    await expect(card.getByTestId("run-status")).toBeVisible();
    await expect(definitionValue(page, card, "Scored")).toHaveText(String(scored.length));
    await expect(definitionValue(page, card, "Gated")).toHaveText(String(gated.length));
  });

  test(`${runId} renders exactly the outcomes its artifact declares`, async ({ page }) => {
    await page.goto(`/runs/${runId}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    // The artifact must agree with itself before the page is asked to agree with it.
    const declared = artifact.stats?.ecus;
    if (declared) {
      expect(declared.total ?? artifact.ecu_rows.length).toBe(artifact.ecu_rows.length);
      expect(declared.scored ?? scored.length).toBe(scored.length);
      expect(declared.gated ?? gated.length).toBe(gated.length);
    }

    await expect(page.getByTestId("outcome-card")).toHaveCount(artifact.ecu_rows.length);
    await expect(page.locator('[data-outcome-state="scored"]')).toHaveCount(scored.length);
    await expect(page.locator('[data-outcome-state="unavailable"]')).toHaveCount(gated.length);

    const heroStats = page.locator("dl.run-hero-stats");
    await expect(definitionValue(page, heroStats, "Outcomes")).toHaveText(
      String(artifact.ecu_rows.length),
    );
    await expect(definitionValue(page, heroStats, "Scored")).toHaveText(String(scored.length));
    await expect(definitionValue(page, heroStats, "Unavailable")).toHaveText(String(gated.length));

    for (const outcome of await page.locator('[data-outcome-state="scored"]').all()) {
      for (const key of ARC_KEYS) {
        await expect(outcome.getByTestId(`arc-${key}`)).toBeVisible();
      }
    }
  });

  test(`${runId} never renders unavailable evidence as a numeric zero`, async ({ page }) => {
    await page.goto(`/runs/${runId}`);

    for (const row of gated.slice(0, 3)) {
      const card = outcomeCard(page, runId, outcomeId(row));
      await expect(card).toHaveCount(1);
      await expect(card).toHaveAttribute("data-outcome-state", "unavailable");
      await expect(card).toContainText("Evidence gated");
      // The accessible name is where a screen reader would hear a fabricated zero.
      await expect(card.getByRole("figure")).toHaveAccessibleName(/score unavailable$/);
      // Arc verdicts are not shown at all when the gate fired.
      for (const key of ARC_KEYS) {
        await expect(card.getByTestId(`arc-${key}`)).toHaveCount(0);
      }
    }

    // The other half of the same invariant: a real zero must read as zero.
    for (const row of scored.filter((item) => item.composite === 0).slice(0, 1)) {
      const card = outcomeCard(page, runId, outcomeId(row));
      await expect(card).toHaveCount(1);
      await expect(card).toHaveAttribute("data-outcome-state", "scored");
      await expect(card).not.toContainText("Evidence gated");
      await expect(card.getByRole("figure")).toHaveAccessibleName(/composite score 0 out of 100$/);
      for (const key of ARC_KEYS) {
        await expect(card.getByTestId(`arc-${key}`)).toBeVisible();
      }
    }
  });

  test(`${runId} arc table reports each arc exactly as the artifact recorded it`, async ({
    page,
  }) => {
    // A gated outcome plus the extremes of the signed range: the rows most
    // likely to expose a formatter that rounds, drops, or invents a digit.
    const bySignedScore = [...scored].sort((left, right) => (left.score ?? 0) - (right.score ?? 0));
    const probes = [gated[0], bySignedScore[0], bySignedScore.at(-1)].filter(
      (row): row is ArtifactRow => Boolean(row),
    );
    const seen = new Set<string>();

    for (const row of probes) {
      const id = outcomeId(row);
      if (seen.has(id)) continue;
      seen.add(id);

      await page.goto(`/runs/${runId}/outcomes/${id}`);
      const arcSection = page.locator("section").filter({
        has: page.getByRole("heading", { name: "Arc values" }),
      });
      await expect(arcSection).toBeVisible();

      for (const key of ARC_KEYS) {
        const cells = arcSection
          .locator("tr")
          .filter({ has: page.getByRole("rowheader", { name: expectedHumanized(key), exact: true }) })
          .locator("td");
        const arc = row.arcs[key];
        const verdict =
          arc.is_quantity || key === "evidence" ? "Quantity" : expectedSigned(arc.verdict);
        // A missing verdict renders as an em dash, a measured 0 renders as "0",
        // and 0% coverage is a real measurement, not a missing one.
        await expect(cells.nth(0)).toHaveText(verdict);
        await expect(cells.nth(1)).toHaveText(expectedPercent(arc.coverage));
      }

      const signalSection = page.locator("section").filter({
        has: page.getByRole("heading", { name: "Signal and confidence" }),
      });
      await expect(definitionValue(page, signalSection, "Internal signed score")).toHaveText(
        row.score === null ? "—" : expectedSigned(row.score, 0),
      );
    }
  });

  test(`${runId} telemetry shows the artifact's own figures and nothing it lacks`, async ({
    page,
  }) => {
    const usage = artifact.usage;
    const currency = usage.currency ?? "USD";
    await page.goto(`/runs/${runId}`);

    const telemetry = page.getByTestId("telemetry-panel");
    await expect(telemetry).toBeVisible();
    await expect(page.getByTestId("telemetry-status")).toHaveText(
      expectedHumanized(usage.telemetry_status),
    );

    const metrics = telemetry.locator("dl.telemetry-metrics");
    await expect(definitionValue(page, metrics, "Live calls")).toHaveText(
      expectedNumber(usage.live_calls),
    );
    await expect(definitionValue(page, metrics, "Cache hits")).toHaveText(
      expectedNumber(usage.cache_hits),
    );
    await expect(definitionValue(page, metrics, "Retries")).toHaveText(
      expectedNumber(usage.retries),
    );
    await expect(definitionValue(page, metrics, "Failures")).toHaveText(
      expectedNumber(usage.failures),
    );
    await expect(definitionValue(page, metrics, "Wall time")).toHaveText(
      expectedSeconds(usage.latency.wall_time_s),
    );
    await expect(definitionValue(page, metrics, "Average latency")).toHaveText(
      expectedSeconds(usage.latency.average_s),
    );
    await expect(definitionValue(page, metrics, "P95 latency")).toHaveText(
      expectedSeconds(usage.latency.p95_s),
    );
    await expect(definitionValue(page, metrics, "Peak concurrency")).toHaveText(
      expectedNumber(usage.latency.peak_concurrency),
    );

    const spend = telemetry
      .locator("article")
      .filter({ has: page.getByText("Recorded marginal spend", { exact: true }) });
    await expect(spend.locator("strong")).toHaveText(
      expectedMoney(usage.metered_run_spend, currency),
    );
    if (usage.metered_spend_basis) {
      await expect(spend).toContainText(usage.metered_spend_basis);
    }

    // An unrecorded price is the case the pipeline must never round to free.
    const apiEquivalent = telemetry
      .locator("article")
      .filter({ has: page.getByText("API-equivalent estimate", { exact: true }) });
    await expect(apiEquivalent.locator("strong")).toHaveText(
      expectedMoney(usage.api_equivalent_cost, currency),
    );
    if (usage.api_equivalent_cost === null) {
      await expect(apiEquivalent.locator("strong")).not.toHaveText(expectedMoney(0, currency));
      await expect(apiEquivalent).toContainText(/not recorded|not inferred/i);
    }

    const tokenParts = [
      usage.tokens.fresh_input,
      usage.tokens.cache_write,
      usage.tokens.cache_read,
      usage.tokens.output,
    ];
    if (tokenParts.some((part) => part === null)) {
      await expect(telemetry).toContainText(/tokens unavailable/i);
      await expect(telemetry).toContainText(/not recorded/i);
    } else {
      const total = tokenParts.reduce<number>((sum, part) => sum + (part ?? 0), 0);
      await expect(telemetry).toContainText(`${expectedNumber(total)} tokens`);
    }
  });
}

for (const artifact of sample) {
  const runId = artifact.run.id;

  test("a run card opens exactly the run it names", async ({ page }) => {
    await page.goto("/");
    await runCard(page, runId).getByRole("link").click();
    await expect(page).toHaveURL(new RegExp(`/runs/${runId}/?$`));
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("keyboard users can skip navigation and open a run", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Tab");
    const skipLink = page.getByRole("link", { name: /skip to (main )?content/i });
    await expect(skipLink).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("main#main-content")).toBeFocused();

    const runLink = runCard(page, runId).getByRole("link");
    await runLink.focus();
    await expect(runLink).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(new RegExp(`/runs/${runId}/?$`));
  });

  test("dashboard routes do not overflow at their configured viewport", async ({ page }) => {
    const probes = [scoredRows(artifact)[0], gatedRows(artifact)[0]].filter(
      (row): row is ArtifactRow => Boolean(row),
    );
    for (const route of [
      "/",
      "/methodology",
      `/runs/${runId}`,
      ...probes.map((row) => `/runs/${runId}/outcomes/${outcomeId(row)}`),
      "/runs/not-a-real-run",
    ]) {
      await page.goto(route);
      const overflows = await page.evaluate(
        () =>
          document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      );
      expect(overflows, `${route} has horizontal overflow`).toBe(false);
    }
  });
}

test("unknown runs fail closed with an accessible missing state", async ({ page }) => {
  const response = await page.goto("/runs/not-a-real-run");
  expect(response?.status()).toBe(404);
  await expect(
    page.getByRole("heading", { name: /run not found|report not found|not found/i }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /all runs|dashboard|back/i })).toBeVisible();
});
