import fs from "node:fs";
import path from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type Request } from "@playwright/test";

import { PNG, mockGoogle, mockSupabase } from "./auth-mocks";

/*
 * Live research panel under a /scan result (owner-private; 2026-10-04).
 * Zero real network: Google and Supabase are the shared mocks, /api/scan and
 * /api/scan/research are routed here, no model is called, and nothing in this
 * file says anything about real sign-in, real research or real privacy -- it
 * proves what the BROWSER does with the contract's answers.
 *
 * Same two build modes as tests/e2e/scan-workspace.spec.ts (the NEXT_PUBLIC_*
 * sign-in variables are inlined at build time):
 *   ordinary build            -> the panel says research is off and asks for nothing
 *   configured (mock) build   -> E2E_AUTH_CONFIGURED=1: the full queued/running/
 *                                succeeded flow, replay, sign-out, LT, layout
 *
 * Time is the browser's own fake clock (page.clock), so the 2.5 s poll and the
 * stalled-worker rule never depend on the machine's wall clock.
 *
 * RESEARCH_SHOTS_DIR=<dir> additionally saves the named screenshots there.
 */

const CONFIGURED = process.env.E2E_AUTH_CONFIGURED === "1";
const SHOTS = process.env.RESEARCH_SHOTS_DIR;
const RICH = JSON.parse(fs.readFileSync(path.join(process.cwd(), "tests", "fixtures", "scan-photo-rich.json"), "utf8"));
const RUN_ID = "5c0e0478-b5c0-4bbe-b8b7-d45b2a5d3878";
const JOB_ID = "7d1f2a9e-3b4c-4d5e-8f60-123456789abc";
const NOW = new Date("2026-10-04T19:00:00.000Z");
const T0 = "2026-10-04T19:00:00.000000+00:00";
const SENTENCE = "May modestly shorten sleep latency (−0.31 SD, 95% CI −0.52 to −0.10; p<0.05; n=1,204; 400 mg/day), and “no serious adverse events” were reported (Smith et al., 2019; PMID:12345678).";

const result = {
  audit: {
    meta: { model: "claude-sonnet-5-5", prompt: "live-research-v0.2" }, product: "Creatine Pro 5000", ingredient: "Creatine", form: "Creatine monohydrate", daily_dose: "4,000 mg per day (as printed)",
    could_not_access: ["Full paper unavailable"],
    outcomes: [{ name: "Sleep latency", sentence: SENTENCE, strongest_study: "Smith J. Sleep. 2019;42(3).", strongest_doubt: "Unclear whether benefits persist beyond 8 weeks.", study_that_would_move_this: "A larger preregistered trial.", ledger: { effective_daily_range: "3–5 g/day" }, inventory: [{ id: "PMID:12345678", access: "snippet" }] }],
  },
  source_access: { version: "SourceAccessSummaryV2", summary: { requests: 3, errors: 2, walls: 1, refusals: 4, search_snippets: 2, fetch_summaries: 1, original_documents: 0 }, inventory: [{ id: "PMID:12345678", evidence_class: "derived_snippet" }], limitations: ["WebSearch snippets and WebFetch model summaries are not original papers."] },
  provenance: { evidence_status: "experimental_unvalidated", clinically_approved: false, human_verified: false, affects_score: false, runner: "claude_subscription_cli", billing: "subscription_no_api_spend", model: "claude-sonnet-5-5", prompt_version: "live-research-v0.2", cli_version: "2.1.287", adapter_version: "adapter-test", classifier_version: "classifier-test", source_access_version: "SourceAccessV2" },
};
const target = { version: "ResearchJobV1", fact_basis: "label", product: { brand: null, product_name: "Creatine Pro 5000" }, ingredient: { vocab_id: "creatine", label: "Creatine" }, form: { vocab_id: "creatine_monohydrate", label: null }, dose: { compound_per_serving_mg: 4000, printed_elemental_per_serving_mg: null, unit_as_printed: "mg" }, servings_per_day: null, is_multi_ingredient: false };
const job = (status: "queued" | "running" | "succeeded", updated = T0) => ({ id: JOB_ID, scan_id: RUN_ID, status, prompt_version: "live-research-v0.2", target, created_at: T0, updated_at: updated, completed_at: status === "succeeded" ? "2026-10-04T19:03:10.000000+00:00" : null, failure_code: null, result: status === "succeeded" ? result : null });
const stored = { ...RICH, run_id: RUN_ID, persistence: { status: "stored", run_id: RUN_ID, image: { status: "stored" } } };

const tab = (page: Page, name: string) => page.getByRole("tab", { name, exact: true });
async function shot(page: Page, name: string, locator = page.locator(".sc-research")) {
  if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await locator.scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: false }); }
}
async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}
async function stageAndScan(page: Page) {
  await page.locator("#scan-file").setInputFiles({ name: "label.png", mimeType: "image/png", buffer: PNG });
  await page.getByRole("button", { name: "Scan this label" }).click();
  await expect(page.locator(".scan-lab-result")).toBeVisible();
}

test.describe("live research panel without sign-in configured (ordinary build)", () => {
  test.skip(CONFIGURED, "the ordinary build: the sign-in variables are NOT set");

  test("says research is off, requests nothing, keeps one top bar and its tabs, and switches language", async ({ page }) => {
    const research: string[] = [];
    page.on("request", (r: Request) => { if (r.url().includes("/api/scan/research")) research.push(`${r.method()} ${r.url()}`); });
    await page.route("**/api/scan", (route) => (route.request().method() === "POST" ? route.fulfill({ contentType: "application/json", body: JSON.stringify(stored) }) : route.continue()));
    await page.goto("/scan");
    await stageAndScan(page);

    const panel = page.locator(".sc-research");
    await expect(panel).toBeVisible();
    await expect(panel.getByRole("heading", { name: "Live research" })).toBeVisible();
    await expect(panel.getByRole("status")).toHaveText("Live research is off on this deployment; research was not assessed.");
    await expect(panel).toContainText("Experimental");
    await expect(panel).toContainText("Ungraded");
    await expect(panel.getByRole("button")).toHaveCount(0);
    expect(research).toEqual([]);

    // one top bar and one Scan/History tab list: the panel adds none (and no heading above h2)
    await expect(page.locator(".sc-topbar")).toHaveCount(1);
    await expect(page.locator(".sw-tabs")).toHaveCount(1);
    await expect(tab(page, "Scan")).toHaveCount(1);
    await expect(tab(page, "History")).toHaveCount(1);
    await expect(panel.getByRole("tablist")).toHaveCount(0);
    await expect(panel.locator("h1, nav, header")).toHaveCount(0);
    await noHorizontalScroll(page);
    await shot(page, `ordinary-off-en-${test.info().project.name}`);

    await page.getByTestId("lang-toggle").click();
    await expect(panel.getByRole("heading", { name: "Tiesioginis tyrimas" })).toBeVisible();
    await expect(panel.getByRole("status")).toHaveText("Šiame diegime tiesioginis tyrimas išjungtas; tyrimas nevertintas.");
    await expect(panel).toContainText("Eksperimentinis");
    await expect(panel).toContainText("Be įvertinimo");
    expect(research).toEqual([]);
    await shot(page, `ordinary-off-lt-${test.info().project.name}`);

    const axe = await new AxeBuilder({ page }).include(".sc-research").analyze();
    expect(axe.violations).toEqual([]);
  });
});

test.describe("live research panel with mocked Google sign-in (build with sign-in configured)", () => {
  test.skip(!CONFIGURED, "needs a build with the three NEXT_PUBLIC_* sign-in variables and E2E_AUTH_CONFIGURED=1");

  async function signedInPage(page: Page) {
    await page.clock.install({ time: NOW });
    await mockGoogle(page);
    await mockSupabase(page, { exchange: "ok" });
  }
  async function signIn(page: Page) {
    await page.locator("[data-e2e-google]").first().click();
    await expect(page.getByRole("button", { name: "Scan this label" })).toBeVisible();
  }
  const tick = (page: Page, ms: number) => page.clock.runFor(ms);

  test("a stored scan asks once with the owner's token; queued → running → completed from the job's real status; experimental, ungraded, no score or percentage", async ({ page }) => {
    await signedInPage(page);
    const posts: Array<{ auth: string | undefined; body: string | null }> = [];
    const gets: Array<{ auth: string | undefined }> = [];
    let phase: "queued" | "running" | "succeeded" = "queued";
    await page.route("**/api/scan", (route) => (route.request().method() === "POST" ? route.fulfill({ contentType: "application/json", body: JSON.stringify(stored) }) : route.continue()));
    await page.route("**/api/scan/history", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ status: "ok", runs: [], next_cursor: null }) }));
    await page.route("**/api/scan/research", (route) => {
      posts.push({ auth: route.request().headers()["authorization"], body: route.request().postData() });
      return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ status: "ok", created: true, job: job("queued") }) });
    });
    await page.route(`**/api/scan/research/${JOB_ID}`, (route) => {
      gets.push({ auth: route.request().headers()["authorization"] });
      return route.fulfill({ contentType: "application/json", body: JSON.stringify({ status: "ok", job: job(phase, phase === "running" ? "2026-10-04T19:01:00+00:00" : T0) }) });
    });
    await page.goto("/scan");
    await page.locator("#scan-file").setInputFiles({ name: "label.png", mimeType: "image/png", buffer: PNG });
    await signIn(page);
    await page.getByRole("button", { name: "Scan this label" }).click();
    await expect(page.locator(".scan-lab-result")).toBeVisible();

    const panel = page.locator(".sc-research");
    await expect(panel.getByRole("status")).toHaveText("Queued for the private research worker.");
    expect(posts).toEqual([{ auth: "Bearer e2e-token", body: JSON.stringify({ scan_id: RUN_ID }) }]);
    await expect(panel.locator('[aria-current="step"]')).toHaveText("Queued");
    await expect(panel).toContainText("Queued 2026-10-04 19:00 UTC");
    await expect(panel).toContainText("Not recorded on this scan, so research did not guess them: servings per day.");
    await shot(page, `configured-queued-${test.info().project.name}`);

    phase = "running"; await tick(page, 2500);
    await expect(panel.getByRole("status")).toHaveText("Research is running.");
    await expect(panel.locator('[aria-current="step"]')).toHaveText("Running");
    await expect(panel).toContainText("Last update from the worker: 2026-10-04 19:01 UTC");

    phase = "succeeded"; await tick(page, 2500);
    await expect(panel.getByRole("status")).toHaveText("Research audit returned.");
    await expect(panel.locator('[aria-current="step"]')).toHaveText("Completed");
    const audit = panel.getByTestId("research-audit");
    await expect(audit).toContainText(SENTENCE);
    await expect(audit).toContainText("requests that returned content: 3");
    await expect(audit).toContainText("page summaries (written by Claude Haiku): 1");
    await expect(audit).toContainText("refusals: 4");
    await expect(audit).toContainText("paper not opened");
    await expect(audit).toContainText("This audit does not change the retained scan score.");
    await expect(panel).not.toContainText(/\d+\s*\/\s*100|\bETA\b/);
    await expect(panel.locator("progress, meter, [role=progressbar], svg, canvas")).toHaveCount(0);
    expect(gets.every((g) => g.auth === "Bearer e2e-token")).toBe(true);
    const polled = gets.length;
    await tick(page, 30_000);
    expect(gets.length).toBe(polled); // a finished job is never polled again
    expect(posts).toHaveLength(1);
    await noHorizontalScroll(page);
    await shot(page, `configured-completed-${test.info().project.name}`, audit);

    const axe = await new AxeBuilder({ page }).include(".sc-research").analyze();
    expect(axe.violations).toEqual([]);
    await expect(page.locator(".sc-topbar")).toHaveCount(1);
    await expect(page.locator(".sw-tabs")).toHaveCount(1);
    await expect(panel.getByRole("tablist")).toHaveCount(0);
  });

  test("Lithuanian: every control is Lithuanian and the model's own text stays English, tagged and byte-identical", async ({ page }) => {
    await signedInPage(page);
    await page.route("**/api/scan", (route) => (route.request().method() === "POST" ? route.fulfill({ contentType: "application/json", body: JSON.stringify(stored) }) : route.continue()));
    await page.route("**/api/scan/research", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "ok", created: false, job: job("succeeded") }) }));
    await page.route("**/api/scan/translate", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ status: "translator_unavailable" }) }));
    await page.goto("/scan");
    await page.locator("#scan-file").setInputFiles({ name: "label.png", mimeType: "image/png", buffer: PNG });
    await signIn(page);
    await page.getByTestId("lang-toggle").click();
    await page.getByRole("button", { name: /Skenuoti šią etiketę/ }).first().click();
    await expect(page.locator(".scan-lab-result")).toBeVisible();
    const panel = page.locator(".sc-research");
    await expect(panel.getByRole("heading", { name: "Tiesioginis tyrimas" })).toBeVisible();
    await expect(panel.getByRole("status")).toHaveText("Gautas tyrimo auditas.");
    await expect(panel).toContainText("Be įvertinimo");
    await expect(panel).toContainText("Šis auditas nekeičia išsaugoto skenavimo balo.");
    await expect(panel).toContainText("puslapių santraukos (parašė Claude Haiku): 1");
    await expect(panel.getByRole("note")).toContainText("neišverstas");
    const narrative = panel.locator('[lang="en"]', { hasText: SENTENCE });
    await expect(narrative.first()).toBeVisible();
    await expect(narrative.first()).toContainText(SENTENCE);
    await expect(panel.getByRole("button")).toHaveCount(0);
    await noHorizontalScroll(page);
    await shot(page, `configured-lt-${test.info().project.name}`, panel.getByTestId("research-audit"));
    const axe = await new AxeBuilder({ page }).include(".sc-research").analyze();
    expect(axe.violations).toEqual([]);
  });

  test("History replay asks for nothing by itself; the button asks once; signing out discards the panel and stops polling", async ({ page }) => {
    await signedInPage(page);
    const research: string[] = [];
    page.on("request", (r: Request) => { if (r.url().includes("/api/scan/research")) research.push(`${r.method()} ${new URL(r.url()).pathname}`); });
    await page.route("**/api/scan/history", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ status: "ok", runs: [{ id: RUN_ID, created_at: "2026-09-20T10:30:00Z", source: "photo", status: "ok", product_name: "Creatine Pro 5000" }], next_cursor: null }) }));
    await page.route(`**/api/scan/history/${RUN_ID}`, (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ status: "ok", run_id: RUN_ID, analysis: RICH }) }));
    await page.route("**/api/scan/research", (route) => route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ status: "ok", created: true, job: job("running") }) }));
    await page.route(`**/api/scan/research/${JOB_ID}`, (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ status: "ok", job: job("running") }) }));
    await page.goto("/scan");
    await page.locator("#scan-file").setInputFiles({ name: "label.png", mimeType: "image/png", buffer: PNG });
    await signIn(page);

    await tab(page, "History").click();
    await page.getByRole("button", { name: /Creatine Pro 5000/ }).click();
    await expect(page.getByTestId("replay-note")).toContainText("Saved scan from");
    const panel = page.locator(".sw-panel").nth(1).locator(".sc-research");
    await expect(panel.getByRole("status")).toContainText("Nothing was re-run");
    expect(research).toEqual([]);
    await shot(page, `configured-replay-idle-${test.info().project.name}`, panel);

    await panel.getByRole("button", { name: "Look up live research for this scan" }).click();
    await expect(panel.getByRole("status")).toHaveText("Research is running.");
    expect(research).toEqual(["POST /api/scan/research"]);
    await expect(panel.getByRole("status")).toBeFocused();

    await tick(page, 2500);
    await expect.poll(() => research).toEqual(["POST /api/scan/research", `GET /api/scan/research/${JOB_ID}`]);

    // sign out from History: the panel and its poll go with the account's data
    await page.getByRole("button", { name: "Back to history" }).first().click();
    const before = research.length;
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page.getByText("Sign in to see your history")).toBeVisible();
    await expect(page.locator(".sc-research")).toHaveCount(0);
    await tick(page, 30_000);
    await page.waitForTimeout(250); // let any (unexpected) request event arrive before counting
    expect(research.length).toBe(before);
  });

  test("a running job with no worker signal past its lease is shown as stalled, from the browser's clock only, and keeps polling", async ({ page }) => {
    await signedInPage(page);
    await page.route("**/api/scan", (route) => (route.request().method() === "POST" ? route.fulfill({ contentType: "application/json", body: JSON.stringify(stored) }) : route.continue()));
    await page.route("**/api/scan/research", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "ok", created: false, job: job("running") }) }));
    let gets = 0;
    await page.route(`**/api/scan/research/${JOB_ID}`, (route) => { gets += 1; return route.fulfill({ contentType: "application/json", body: JSON.stringify({ status: "ok", job: job("running") }) }); });
    await page.goto("/scan");
    await page.locator("#scan-file").setInputFiles({ name: "label.png", mimeType: "image/png", buffer: PNG });
    await signIn(page);
    await page.getByRole("button", { name: "Scan this label" }).click();
    const panel = page.locator(".sc-research");
    await expect(panel.getByRole("status")).toHaveText("Research is running.");
    await page.clock.setSystemTime(new Date(NOW.getTime() + 301_000));
    await tick(page, 2500);
    await expect(panel.getByRole("status")).toContainText("No update from the worker since 2026-10-04 19:00 UTC");
    expect(gets).toBeGreaterThanOrEqual(1);
    await shot(page, `configured-stalled-${test.info().project.name}`, panel);
  });
});
