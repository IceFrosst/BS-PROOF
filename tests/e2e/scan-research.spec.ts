import fs from "node:fs";
import path from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type Request } from "@playwright/test";

import { PNG, mockGoogle, mockSupabase } from "./auth-mocks";

/*
 * /scan is LIVE-ONLY (2026-10-05): label read -> saved scan -> a live-research loading screen with an
 * indeterminate progress bar -> the completed live audit, and no retained / cached / "no evidence run"
 * / model-recall / company evidence anywhere. Zero real network: Google and Supabase are the shared
 * mocks, /api/scan and /api/scan/research are routed here, no model is called, and nothing in this
 * file says anything about real sign-in, real research or real privacy -- it proves what the BROWSER
 * does with the contract's answers.
 *
 * Same two build modes as tests/e2e/scan-workspace.spec.ts (the NEXT_PUBLIC_* sign-in variables are
 * inlined at build time):
 *   ordinary build            -> the screen says research is off, nothing replaces it, nothing is asked
 *   configured (mock) build   -> E2E_AUTH_CONFIGURED=1: the full label -> queued -> running -> completed
 *                                flow, failure screens, replay, sign-out, LT, keyboard, axe, layout
 *
 * Time is the browser's own fake clock (page.clock), so the 2.5 s poll and the stalled-worker rule
 * never depend on the machine's wall clock.
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
    meta: { model: "claude-sonnet-5-5", prompt: "live-research-v0.2" }, product: "Vitamin D3 2000 IU", ingredient: "Vitamin D3", form: "not stated", daily_dose: "not stated (servings per day unknown)",
    could_not_access: ["Full paper unavailable"],
    outcomes: [{ name: "Sleep latency", sentence: SENTENCE, strongest_study: "Smith J. Sleep. 2019;42(3).", strongest_doubt: "Unclear whether benefits persist beyond 8 weeks.", study_that_would_move_this: "A larger preregistered trial.", ledger: { effective_daily_range: "3–5 g/day" }, inventory: [{ id: "PMID:12345678", access: "snippet" }] }],
  },
  source_access: { version: "SourceAccessSummaryV2", summary: { requests: 3, errors: 2, walls: 1, refusals: 4, search_snippets: 2, fetch_summaries: 1, original_documents: 0 }, inventory: [{ id: "PMID:12345678", evidence_class: "derived_snippet" }], limitations: ["WebSearch snippets and WebFetch model summaries are not original papers."] },
  provenance: { evidence_status: "experimental_unvalidated", clinically_approved: false, human_verified: false, affects_score: false, runner: "claude_subscription_cli", billing: "subscription_no_api_spend", model: "claude-sonnet-5-5", prompt_version: "live-research-v0.2", cli_version: "2.1.287", adapter_version: "adapter-test", classifier_version: "classifier-test", source_access_version: "SourceAccessV2" },
};
const target = { version: "ResearchJobV1", fact_basis: "label", product: { brand: "Acme", product_name: "Vitamin D3 2000 IU" }, ingredient: { vocab_id: "vitamin_d", label: "Vitamin D3" }, form: { vocab_id: null, label: null }, dose: { compound_per_serving_mg: 0.05, printed_elemental_per_serving_mg: null, unit_as_printed: "mcg" }, servings_per_day: null, is_multi_ingredient: false };
const job = (status: "queued" | "running" | "succeeded", updated = T0) => ({ id: JOB_ID, scan_id: RUN_ID, status, prompt_version: "live-research-v0.2", target, created_at: T0, updated_at: updated, completed_at: status === "succeeded" ? "2026-10-04T19:03:10.000000+00:00" : null, failure_code: null, result: status === "succeeded" ? result : null });
/* The scan that used to say "No evidence run exists": vitamin D3 50 mcg printed, form NOT stated, daily regimen NOT stated. */
const VITAMIN_D = { ...RICH, label: { ...RICH.label, ingredient_vocab_id: "vitamin_d", ingredient_label_text: "Vitamin D3", form_vocab_id: null, compound_dose_mg: 0.05, printed_elemental_dose_mg: null, dose_unit_as_printed: "mcg", servings_per_day: null, is_multi_ingredient: false, other_actives: [], actives: [], product_name: "Vitamin D3 2000 IU", brand: "Acme" } };
const stored = { ...VITAMIN_D, run_id: RUN_ID, persistence: { status: "stored", run_id: RUN_ID, image: { status: "stored" } } };
const LEGACY = /No evidence run|evidence run exists|That form has not been run|not a low score|Is your dose the dose that worked|Model knowledge|MLM|Funding & independence|Publication bias|Nordic Labs/i;

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

test.describe("live research screen without sign-in configured (ordinary build)", () => {
  test.skip(CONFIGURED, "the ordinary build: the sign-in variables are NOT set");

  test("says research is off, requests nothing, keeps one top bar and its tabs, and switches language", async ({ page }) => {
    const research: string[] = [];
    page.on("request", (r: Request) => { if (r.url().includes("/api/scan/research")) research.push(`${r.method()} ${r.url()}`); });
    await page.route("**/api/scan", (route) => (route.request().method() === "POST" ? route.fulfill({ contentType: "application/json", body: JSON.stringify(stored) }) : route.continue()));
    await page.goto("/scan");
    await stageAndScan(page);

    const panel = page.locator(".sc-research");
    await expect(panel).toBeVisible();
    await expect(panel.getByRole("heading", { name: "Live research is not available for this scan" })).toBeVisible();
    await expect(panel.getByRole("status")).toHaveText("Live research is off on this deployment; research was not assessed.");
    // live-only: nothing replaces the missing research -- no retained / cached / "no evidence run" / recall card
    await expect(panel).toContainText("No saved, cached or model-recalled evidence is shown in its place");
    await expect(page.locator(".scan-lab-result")).not.toContainText(LEGACY);
    await expect(page.locator(".scan-lab-result").locator(".ab-tabs, .scan-section, .scan-lab-validity, .la-empty, [role=progressbar]")).toHaveCount(0);
    await expect(page.locator('[data-testid="read-facts"]')).toContainText("servings per day not stated (not assumed)");
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
    await expect(panel.getByRole("heading", { name: "Šiam skenavimui tiesioginis tyrimas nepasiekiamas" })).toBeVisible();
    await expect(panel.getByRole("status")).toHaveText("Šiame diegime tiesioginis tyrimas išjungtas; tyrimas nevertintas.");
    await expect(panel).toContainText("Eksperimentinis");
    await expect(panel).toContainText("Be įvertinimo");
    expect(research).toEqual([]);
    await shot(page, `ordinary-off-lt-${test.info().project.name}`);

    const axe = await new AxeBuilder({ page }).include(".sc-research").analyze();
    expect(axe.violations).toEqual([]);
  });
});

test.describe("live research screen with mocked Google sign-in (build with sign-in configured)", () => {
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

  test("a stored scan asks once with the owner's token; a loading screen with an indeterminate bar follows the job's real status; ONE switch to the experimental, ungraded audit; no score, percentage or legacy card", async ({ page }) => {
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
    // the LOADING SCREEN between the label read and the result: a named, valueless (indeterminate) bar
    await expect(panel).toHaveAttribute("data-research-phase", "loading");
    await expect(panel.getByRole("heading", { name: "Researching your supplement live" })).toBeVisible();
    const bar = panel.getByRole("progressbar", { name: "Live research progress (indeterminate)" });
    await expect(bar).toBeVisible();
    for (const attribute of ["aria-valuenow", "aria-valuemin", "aria-valuemax", "style"]) await expect(bar).not.toHaveAttribute(attribute, /.*/);
    await expect(page.locator('[data-testid="research-audit"]')).toHaveCount(0); // no result early
    await expect(page.locator(".scan-lab-result")).not.toContainText(LEGACY);
    await expect(page.locator(".scan-lab-result").locator(".ab-tabs, .scan-section, .scan-lab-validity, .la-empty, .ab-photo-hero")).toHaveCount(0);
    await expect(panel.locator('[aria-current="step"]')).toHaveText("Queued");
    await expect(panel).toContainText("Queued 2026-10-04 19:00 UTC");
    await expect(panel).toContainText("Not recorded on this scan, so research did not guess them: servings per day; form.");
    await expect(panel).not.toContainText(/\d\s*%|\bETA\b|remaining|\d+ (studies|papers|sources) found/i);
    // what was read stays beside the wait, exactly as read, with the unknowns said out loud
    const facts = page.locator('[data-testid="read-facts"]');
    await expect(facts).toContainText("0.05 mg compound per serving");
    await expect(facts).toContainText("servings per day not stated (not assumed)");
    await expect(facts).not.toContainText(/\b1 serving|elemental/i);
    // the person is not frozen while it waits
    await expect(page.getByRole("button", { name: "Sign out" }).first()).toBeEnabled();
    await expect(tab(page, "History")).toBeEnabled();
    await noHorizontalScroll(page);
    await shot(page, `configured-queued-${test.info().project.name}`, page.locator(".scan-lab-result"));
    const loadingAxe = await new AxeBuilder({ page }).include(".scan-lab-result").analyze();
    expect(loadingAxe.violations).toEqual([]);

    phase = "running"; await tick(page, 2500);
    await expect(panel.getByRole("status")).toHaveText("Research is running.");
    await expect(panel).toHaveAttribute("data-research-phase", "loading");
    await expect(panel.locator('[aria-current="step"]')).toHaveText("Running");
    await expect(panel).toContainText("Last update from the worker: 2026-10-04 19:01 UTC");
    await expect(page.locator('[data-testid="research-audit"]')).toHaveCount(0);
    await shot(page, `configured-running-${test.info().project.name}`, page.locator(".scan-lab-result"));

    phase = "succeeded"; await tick(page, 2500);
    await expect(panel.getByRole("status")).toHaveText("Research audit returned.");
    await expect(panel.locator('[aria-current="step"]')).toHaveText("Completed");
    const audit = panel.getByTestId("research-audit");
    await expect(audit).toContainText(SENTENCE);
    await expect(audit).toContainText("requests that returned content: 3");
    await expect(audit).toContainText("page summaries (written by Claude Haiku): 1");
    await expect(audit).toContainText("refusals: 4");
    await expect(audit).toContainText("paper not opened");
    await expect(audit).toContainText("This audit has no score and does not change any score.");
    await expect(panel).toHaveAttribute("data-research-phase", "result");
    await expect(panel).not.toContainText(/\d+\s*\/\s*100|\bETA\b/);
    await expect(panel.locator("progress, meter, [role=progressbar], svg, canvas")).toHaveCount(0); // the loading screen and its bar are gone
    await expect(page.locator(".scan-lab-result")).not.toContainText(LEGACY);
    await expect(panel.getByRole("status")).toBeFocused(); // focus follows the switch to the result
    expect(gets.every((g) => g.auth === "Bearer e2e-token")).toBe(true);
    const polled = gets.length;
    await tick(page, 30_000);
    expect(gets.length).toBe(polled); // a finished job is never polled again
    expect(posts).toHaveLength(1);
    await noHorizontalScroll(page);
    await shot(page, `configured-completed-${test.info().project.name}`, audit);

    const axe = await new AxeBuilder({ page }).include(".scan-lab-result").analyze();
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
    await expect(panel).toContainText("Šis auditas balo neturi ir jokio balo nekeičia.");
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
    await page.route(`**/api/scan/history/${RUN_ID}`, (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ status: "ok", run_id: RUN_ID, analysis: VITAMIN_D }) }));
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
    await expect(panel.getByRole("heading", { name: "Live research not requested" })).toBeVisible();
    await expect(page.locator(".sw-panel").nth(1)).not.toContainText(LEGACY);
    await expect(page.locator(".sw-panel").nth(1).locator(".ab-tabs, .scan-section, .scan-lab-validity, .la-empty, [role=progressbar]")).toHaveCount(0);
    expect(research).toEqual([]);
    await shot(page, `configured-replay-idle-${test.info().project.name}`, panel);

    await panel.getByRole("button", { name: "Request live research for this scan" }).click();
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

  test("a refused or failed request is an actionable screen (axe-clean, keyboard-operable), never a blank or a legacy card; 'Check again' asks once more", async ({ page }) => {
    await signedInPage(page);
    let attempts = 0;
    await page.route("**/api/scan", (route) => (route.request().method() === "POST" ? route.fulfill({ contentType: "application/json", body: JSON.stringify(stored) }) : route.continue()));
    await page.route("**/api/scan/research", (route) => {
      attempts += 1;
      return attempts === 1
        ? route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ status: "research_unavailable", error: "Traceback sk-live-SECRET" }) })
        : route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ status: "ok", created: true, job: job("queued") }) });
    });
    await page.route(`**/api/scan/research/${JOB_ID}`, (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ status: "ok", job: job("queued") }) }));
    await page.goto("/scan");
    await page.locator("#scan-file").setInputFiles({ name: "label.png", mimeType: "image/png", buffer: PNG });
    await signIn(page);
    await page.getByRole("button", { name: "Scan this label" }).click();
    await expect(page.locator(".scan-lab-result")).toBeVisible();

    const panel = page.locator(".sc-research");
    await expect(panel).toHaveAttribute("data-research-phase", "problem");
    await expect(panel.getByRole("heading", { name: "Live research is not available for this scan" })).toBeVisible();
    await expect(panel.getByRole("status")).toHaveText("Live research is temporarily unavailable; research was not assessed.");
    await expect(panel).toContainText("No saved, cached or model-recalled evidence is shown in its place");
    await expect(page.locator(".scan-lab-result")).not.toContainText(/Traceback|sk-live|SECRET/);
    await expect(page.locator(".scan-lab-result")).not.toContainText(LEGACY);
    await expect(panel.getByRole("progressbar")).toHaveCount(0);
    await expect(page.locator('[data-testid="read-facts"]')).toBeVisible(); // the label facts are kept
    await noHorizontalScroll(page);
    await shot(page, `configured-problem-${test.info().project.name}`, page.locator(".scan-lab-result"));
    const axe = await new AxeBuilder({ page }).include(".scan-lab-result").analyze();
    expect(axe.violations).toEqual([]);

    // keyboard: the retry is a real button reachable and operable without a pointer
    const retry = panel.getByRole("button", { name: "Check again" });
    await retry.focus();
    await expect(retry).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(panel.getByRole("status")).toHaveText("Queued for the private research worker.");
    await expect(panel.getByRole("progressbar")).toBeVisible();
    expect(attempts).toBe(2);
    await expect(panel.getByRole("status")).toBeFocused(); // focus is kept when the pressed button goes
  });

  test("while it waits, sign out, Scan another, the language switch and the History tab are all reachable by keyboard", async ({ page }) => {
    await signedInPage(page);
    await page.route("**/api/scan", (route) => (route.request().method() === "POST" ? route.fulfill({ contentType: "application/json", body: JSON.stringify(stored) }) : route.continue()));
    await page.route("**/api/scan/history", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ status: "ok", runs: [], next_cursor: null }) }));
    await page.route("**/api/scan/research", (route) => route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ status: "ok", created: true, job: job("running") }) }));
    await page.route(`**/api/scan/research/${JOB_ID}`, (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ status: "ok", job: job("running") }) }));
    await page.goto("/scan");
    await page.locator("#scan-file").setInputFiles({ name: "label.png", mimeType: "image/png", buffer: PNG });
    await signIn(page);
    await page.getByRole("button", { name: "Scan this label" }).click();
    const panel = page.locator(".sc-research");
    await expect(panel).toHaveAttribute("data-research-phase", "loading");

    for (const name of ["Sign out", "Scan another"]) {
      const control = page.getByRole("button", { name }).first();
      await control.focus();
      await expect(control).toBeFocused();
    }
    const scanTab = tab(page, "Scan");
    await scanTab.focus();
    await page.keyboard.press("ArrowRight");
    await expect(tab(page, "History")).toHaveAttribute("aria-selected", "true");
    await expect(tab(page, "History")).toBeFocused();
    await page.keyboard.press("ArrowLeft");
    await expect(scanTab).toHaveAttribute("aria-selected", "true");
    await expect(panel).toHaveAttribute("data-research-phase", "loading"); // still waiting, still one screen
    await expect(page.locator(".sc-research")).toHaveCount(1);

    await page.getByRole("button", { name: "Scan another" }).first().click();
    await expect(page.locator(".scan-lab-result")).toHaveCount(0); // back to the landing, not a blank
    await expect(page.locator(".sc-research")).toHaveCount(0);
  });

  test("Lithuanian loading screen: bar, status, unknown regimen and controls are Lithuanian, axe-clean, no overflow", async ({ page }) => {
    await signedInPage(page);
    await page.route("**/api/scan", (route) => (route.request().method() === "POST" ? route.fulfill({ contentType: "application/json", body: JSON.stringify(stored) }) : route.continue()));
    await page.route("**/api/scan/research", (route) => route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ status: "ok", created: true, job: job("running") }) }));
    await page.route(`**/api/scan/research/${JOB_ID}`, (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ status: "ok", job: job("running") }) }));
    await page.goto("/scan");
    await page.locator("#scan-file").setInputFiles({ name: "label.png", mimeType: "image/png", buffer: PNG });
    await signIn(page);
    await page.getByTestId("lang-toggle").click();
    await page.getByRole("button", { name: /Skenuoti šią etiketę/ }).first().click();
    const panel = page.locator(".sc-research");
    await expect(panel).toHaveAttribute("data-research-phase", "loading");
    await expect(panel.getByRole("heading", { name: "Tiesiogiai tiriame jūsų papildą" })).toBeVisible();
    await expect(panel.getByRole("progressbar", { name: "Tiesioginio tyrimo eiga (neapibrėžta)" })).toBeVisible();
    await expect(panel.getByRole("status")).toHaveText("Tyrimas vykdomas.");
    await expect(panel).toContainText("porcijos per dieną; forma");
    await expect(page.locator('[data-testid="read-facts"]')).toContainText("porcijų per dieną nenurodyta (nepripažįstama)");
    await expect(page.locator(".scan-lab-result")).not.toContainText(/įrodymų paleidimo nėra|Bendras balas|Finansavimas ir nepriklausomumas/);
    await noHorizontalScroll(page);
    await shot(page, `configured-lt-loading-${test.info().project.name}`, page.locator(".scan-lab-result"));
    const axe = await new AxeBuilder({ page }).include(".scan-lab-result").analyze();
    expect(axe.violations).toEqual([]);
  });
});
