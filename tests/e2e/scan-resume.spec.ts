import fs from "node:fs";
import path from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type Request } from "@playwright/test";

import { PNG, mockGoogle, mockSupabase } from "./auth-mocks";

/*
 * RELOAD / RESUME in a REAL browser (2026-10-06; user bug: "it says research is running, then I refresh and stuff is
 * gone, and the results don't appear by themselves when research completes").
 *
 * `page.reload()` and `page.goBack()` are DESTRUCTIVE: the page, its React tree, every in-memory map and timer are
 * thrown away exactly as a user's refresh does; only the tab's sessionStorage and the (mock) Supabase session in
 * localStorage survive. A small in-process SERVER stands in for the API (owner-filtered scans, ONE research job per scan,
 * uniform 404) and counts what money depends on: label reads, research POSTs, jobs created. Real timers: the real 2.5 s
 * poll runs, so "the card appears BY ITSELF" is what is measured. Zero real network, no model, no real job.
 *
 * Needs the configured (mock sign-in) build: NEXT_PUBLIC_SUPABASE_URL=https://e2e.supabase.invalid
 * NEXT_PUBLIC_SUPABASE_ANON_KEY=e2e-anon NEXT_PUBLIC_GOOGLE_CLIENT_ID=e2e.apps.googleusercontent.com + E2E_AUTH_CONFIGURED=1.
 * RESEARCH_SHOTS_DIR=<dir> additionally saves the named screenshots there.
 */

const CONFIGURED = process.env.E2E_AUTH_CONFIGURED === "1";
const SHOTS = process.env.RESEARCH_SHOTS_DIR;
const RICH = JSON.parse(fs.readFileSync(path.join(process.cwd(), "tests", "fixtures", "scan-photo-rich.json"), "utf8"));
const OWNER = "3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
const RUN_ID = "5c0e0478-b5c0-4bbe-b8b7-d45b2a5d3878";
const JOB_ID = "7d1f2a9e-3b4c-4d5e-8f60-123456789abc";
const T0 = "2026-10-06T10:00:00.000000+00:00";
const SENTENCE = "May modestly shorten sleep latency (−0.31 SD, 95% CI −0.52 to −0.10; p<0.05; n=1,204; 400 mg/day), and “no serious adverse events” were reported (Smith et al., 2019; PMID:12345678).";

const result = {
  audit: {
    meta: { model: "claude-sonnet-5-5", prompt: "live-research-v0.5" }, product: "Vitamin D3 2000 IU", ingredient: "Vitamin D3", form: "not stated", daily_dose: "not stated (servings per day unknown)",
    could_not_access: ["Full paper unavailable"],
    outcomes: [{ name: "Sleep latency", sentence: SENTENCE, strongest_study: "Smith J. Sleep. 2019;42(3).", strongest_doubt: "Unclear whether benefits persist beyond 8 weeks.", study_that_would_move_this: "A larger preregistered trial.", ledger: { effective_daily_range: "3–5 g/day" }, inventory: [{ id: "PMID:12345678", access: "snippet" }] }],
  },
  source_access: { version: "SourceAccessSummaryV2", summary: { requests: 3, errors: 2, walls: 1, refusals: 4, search_snippets: 2, fetch_summaries: 1, original_documents: 0 }, inventory: [{ id: "PMID:12345678", evidence_class: "derived_snippet" }], limitations: ["WebSearch snippets and WebFetch model summaries are not original papers."] },
  provenance: { evidence_status: "experimental_unvalidated", clinically_approved: false, human_verified: false, affects_score: false, runner: "claude_subscription_cli", billing: "subscription_no_api_spend", model: "claude-sonnet-5-5", prompt_version: "live-research-v0.5", cli_version: "2.0.0", adapter_version: "adapter-1", classifier_version: "classifier-1", source_access_version: "SourceAccessV3" },
};
const target = { version: "ResearchJobV1", fact_basis: "label", product: { brand: "Acme", product_name: "Vitamin D3 2000 IU" }, ingredient: { vocab_id: "vitamin_d", label: "Vitamin D3" }, form: { vocab_id: null, label: null }, dose: { compound_per_serving_mg: 0.05, printed_elemental_per_serving_mg: null, unit_as_printed: "mcg" }, servings_per_day: null, is_multi_ingredient: false };
const VITAMIN_D = { ...RICH, label: { ...RICH.label, ingredient_vocab_id: "vitamin_d", ingredient_label_text: "Vitamin D3", form_vocab_id: null, compound_dose_mg: 0.05, printed_elemental_dose_mg: null, dose_unit_as_printed: "mcg", servings_per_day: null, is_multi_ingredient: false, other_actives: [], actives: [], product_name: "Vitamin D3 2000 IU", brand: "Acme" } };
const stored = { ...VITAMIN_D, run_id: RUN_ID, persistence: { status: "stored", run_id: RUN_ID, image: { status: "stored" } } };

type Status = "queued" | "running" | "succeeded" | "failed";
const json = (body: unknown, status = 200) => ({ status, contentType: "application/json", body: JSON.stringify(body) });

/** The API as far as the browser can tell. Lives in the test process, so it survives every reload. */
class Server {
  scanStored = false;
  job: Status | null = null;
  jobsCreated = 0;
  scanPosts = 0;
  requests: string[] = [];
  jobGetFault: "none" | "abort" = "none";
  jobGetFaults = 0;
  /** The next N lookups of a scan's job answer 503 `research_unavailable` (as before migration 003 is applied / the database is down). */
  lookupFaults = 0;
  view(status: Status) {
    // A job that is still open was heard from just now (the browser's own clock decides "no update from the worker"), so a screenshot is not a stalled one.
    return { id: JOB_ID, scan_id: RUN_ID, status, prompt_version: "live-research-v0.5", target, created_at: T0, updated_at: status === "queued" || status === "running" ? new Date().toISOString() : T0, completed_at: status === "succeeded" || status === "failed" ? T0 : null, failure_code: status === "failed" ? "worker_failed" : null, result: status === "succeeded" ? result : null };
  }
  get posts() { return this.requests.filter((r) => r === "POST /api/scan/research").length; }
  async install(page: Page) {
    page.on("request", (r: Request) => { const p = new URL(r.url()); if (p.pathname.startsWith("/api/scan")) this.requests.push(`${r.method()} ${p.pathname}`); });
    await page.route("**/api/scan", (route) => {
      if (route.request().method() !== "POST") return route.continue();
      this.scanPosts += 1;
      this.scanStored = true;
      return route.fulfill(json(stored));
    });
    await page.route("**/api/scan/history", (route) => route.fulfill(json({ status: "ok", runs: this.scanStored ? [{ id: RUN_ID, created_at: "2026-10-06T09:59:00Z", source: "photo", status: "ok", product_name: "Vitamin D3 2000 IU" }] : [], next_cursor: null })));
    await page.route(`**/api/scan/history/${RUN_ID}`, (route) => route.fulfill(this.scanStored ? json({ status: "ok", run_id: RUN_ID, analysis: VITAMIN_D }) : json({ status: "not_found" }, 404)));
    await page.route(/\/api\/scan\/research\?scan_id=/, (route) => {
      if (this.lookupFaults > 0) { this.lookupFaults -= 1; return route.fulfill(json({ status: "research_unavailable" }, 503)); }
      return route.fulfill(this.job ? json({ status: "ok", job: this.view(this.job) }) : json({ status: "not_found" }, 404));
    });
    await page.route("**/api/scan/research", (route) => {
      if (route.request().method() !== "POST") return route.continue();
      if (this.job) return route.fulfill(json({ status: "ok", created: false, job: this.view(this.job) }));
      this.job = "queued";
      this.jobsCreated += 1;
      return route.fulfill(json({ status: "ok", created: true, job: this.view("queued") }, 201));
    });
    await page.route(`**/api/scan/research/${JOB_ID}`, (route) => {
      if (this.jobGetFault === "abort" && this.jobGetFaults > 0) { this.jobGetFaults -= 1; return route.abort("failed"); }
      return route.fulfill(this.job ? json({ status: "ok", job: this.view(this.job) }) : json({ status: "not_found" }, 404));
    });
  }
}

const tab = (page: Page, name: string) => page.getByRole("tab", { name, exact: true });
const card = (page: Page) => page.locator(".sc-research");
async function shot(page: Page, name: string) {
  if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await card(page).first().scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: false }); }
}
async function noHorizontalScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
}
const checkpoint = (page: Page) => page.evaluate(() => window.sessionStorage.getItem("bsproof.scan.resume"));

test.describe("reload and resume of the Scan tab and its live research (build with sign-in configured)", () => {
  test.skip(!CONFIGURED, "needs a build with the three NEXT_PUBLIC_* sign-in variables and E2E_AUTH_CONFIGURED=1");

  async function signedInPage(page: Page) {
    const server = new Server();
    await mockGoogle(page);
    await mockSupabase(page, { exchange: "ok", userId: OWNER });
    await server.install(page);
    return server;
  }
  /** A photo is staged first (the sign-in card appears with it), then Google sign-in (mocked) unlocks the scan. */
  async function signIn(page: Page) {
    await page.goto("/scan");
    await page.locator("#scan-file").setInputFiles({ name: "label.png", mimeType: "image/png", buffer: PNG });
    await page.locator("[data-e2e-google]").first().click();
    await expect(page.getByRole("button", { name: "Scan this label" })).toBeVisible();
  }
  async function firstScan(page: Page) {
    await signIn(page);
    await page.getByRole("button", { name: "Scan this label" }).click();
    await expect(page.locator(".scan-lab-result")).toBeVisible();
    await expect(card(page)).toHaveAttribute("data-research-state", "queued");
  }

  test("a FULL RELOAD while research is running puts the same scan and job back, and the finished card replaces the loading screen BY ITSELF: one label read, one research POST, one job", async ({ page }) => {
    const server = await signedInPage(page);
    await firstScan(page);
    server.job = "running";
    await expect(card(page)).toHaveAttribute("data-research-state", "running", { timeout: 10_000 });
    expect(JSON.parse((await checkpoint(page)) ?? "null")).toEqual({ v: 1, owner: OWNER, scan: RUN_ID, intent: "saved" });
    expect(await page.evaluate(() => Object.keys(window.localStorage).filter((k) => k.includes("bsproof.scan.resume")))).toEqual([]);

    await page.reload(); // DESTRUCTIVE: a new document; nothing of the old page survives but the tab's storage
    await expect(page.locator(".scan-lab-result")).toBeVisible();
    await expect(card(page)).toHaveAttribute("data-research-phase", "loading");
    await expect(card(page)).toHaveAttribute("data-research-state", "running");
    await expect(page.getByTestId("replay-note")).toContainText("This page was reloaded");
    await expect(card(page).getByRole("progressbar")).toHaveCount(1);
    await expect(page.getByRole("button", { name: /Request live research/ })).toHaveCount(0);
    await noHorizontalScroll(page);
    await shot(page, `resume-restored-loading-${test.info().project.name}`);
    expect(server.scanPosts).toBe(1);
    expect(server.posts).toBe(1);

    server.job = "succeeded"; // the worker finishes; the person does nothing
    await expect(card(page)).toHaveAttribute("data-research-phase", "result", { timeout: 10_000 });
    await expect(card(page).getByTestId("research-audit")).toContainText(SENTENCE);
    await expect(card(page).getByRole("progressbar")).toHaveCount(0);
    await noHorizontalScroll(page);
    await shot(page, `resume-auto-card-${test.info().project.name}`);
    const axe = await new AxeBuilder({ page }).include(".scan-lab-result").analyze();
    expect(axe.violations).toEqual([]);
    expect(server.scanPosts).toBe(1);
    expect(server.posts).toBe(1);
    expect(server.jobsCreated).toBe(1);
    const settled = server.requests.length;
    await page.waitForTimeout(6000);
    expect(server.requests.length).toBe(settled); // a finished job is never read again
  });

  test("reload after the job COMPLETED shows the card from the saved scan and its job: no rescan, no POST", async ({ page }) => {
    const server = await signedInPage(page);
    await firstScan(page);
    server.job = "succeeded";
    await expect(card(page)).toHaveAttribute("data-research-phase", "result", { timeout: 10_000 });
    await page.reload();
    await expect(card(page)).toHaveAttribute("data-research-phase", "result");
    await expect(card(page).getByTestId("research-audit")).toContainText(SENTENCE);
    expect(server.scanPosts).toBe(1);
    expect(server.posts).toBe(1);
    expect(server.jobsCreated).toBe(1);
  });

  test("a scan opened from History (no job) and refreshed: only GETs, never a POST; 'Scan another' and sign-out clear the pointer", async ({ page }) => {
    const server = await signedInPage(page);
    server.scanStored = true; // an old saved scan without research
    await signIn(page);
    await tab(page, "History").click();
    await page.getByRole("button", { name: /Vitamin D3 2000 IU/ }).click();
    await expect(card(page).last().getByRole("heading", { name: "Live research not requested" })).toBeVisible();
    expect(await checkpoint(page)).toBeNull(); // looking at History writes nothing
    await page.reload();
    await expect(page.locator(".scan-lab-result")).toHaveCount(0); // the landing, not the old scan
    await tab(page, "History").click();
    await page.getByRole("button", { name: /Vitamin D3 2000 IU/ }).click();
    await expect(card(page).last().getByRole("heading", { name: "Live research not requested" })).toBeVisible();
    expect(server.posts).toBe(0);
    expect(server.requests.filter((r) => r.startsWith("POST"))).toEqual([]);
    await page.waitForTimeout(3000);
    expect(server.jobsCreated).toBe(0);
  });

  test("'Check again' after a failed lookup of a History scan only READS: the lookup now says none -> 'not requested', NO POST; only the explicit button then asks, exactly once", async ({ page }) => {
    const server = await signedInPage(page);
    server.scanStored = true; // an old saved scan without research
    server.lookupFaults = 1; // the first lookup: 503 research_unavailable
    await signIn(page);
    await tab(page, "History").click();
    await page.getByRole("button", { name: /Vitamin D3 2000 IU/ }).click();
    const panel = page.locator(".sw-panel").nth(1).locator(".sc-research");
    await expect(panel).toHaveAttribute("data-research-state", "unavailable");
    await panel.getByRole("button", { name: "Check again" }).click();
    await expect(panel.getByRole("heading", { name: "Live research not requested" })).toBeVisible();
    await page.waitForTimeout(1500);
    expect(server.posts).toBe(0); // 'Check again' started nothing
    expect(server.jobsCreated).toBe(0);
    await panel.getByRole("button", { name: "Request live research for this scan" }).click();
    await expect(panel).toHaveAttribute("data-research-state", "queued");
    expect(server.posts).toBe(1); // the deliberate press: exactly one POST, one job
    expect(server.jobsCreated).toBe(1);
  });

  test("a job that already exists is found when its scan is opened from History, and the card arrives by itself", async ({ page }) => {
    const server = await signedInPage(page);
    server.scanStored = true;
    server.job = "running";
    await signIn(page);
    await tab(page, "History").click();
    await page.getByRole("button", { name: /Vitamin D3 2000 IU/ }).click();
    const panel = page.locator(".sw-panel").nth(1).locator(".sc-research");
    await expect(panel).toHaveAttribute("data-research-state", "running");
    server.job = "succeeded";
    await expect(panel).toHaveAttribute("data-research-phase", "result", { timeout: 10_000 });
    expect(server.posts).toBe(0);
  });

  test("navigating away and BACK (tab history), and the window regaining focus, keep the same job: no new POST, no second poll loop", async ({ page }) => {
    const server = await signedInPage(page);
    await firstScan(page);
    server.job = "running";
    await expect(card(page)).toHaveAttribute("data-research-state", "running", { timeout: 10_000 });
    await page.goto("/methodology");
    await page.goBack();
    await expect(page.locator(".scan-lab-result")).toBeVisible();
    await expect(card(page)).toHaveAttribute("data-research-state", "running");
    expect(server.posts).toBe(1);
    expect(server.scanPosts).toBe(1);
    const before = server.requests.length;
    await page.evaluate(() => { document.dispatchEvent(new Event("visibilitychange")); window.dispatchEvent(new Event("focus")); window.dispatchEvent(new Event("online")); });
    await page.waitForTimeout(400);
    const reads = server.requests.slice(before).filter((r) => r === `GET /api/scan/research/${JOB_ID}`);
    expect(reads.length).toBeLessThanOrEqual(1); // a burst of focus events is one read of the same job
    expect(server.requests.slice(before).some((r) => r.startsWith("POST"))).toBe(false);
    server.job = "succeeded";
    await expect(card(page)).toHaveAttribute("data-research-phase", "result", { timeout: 10_000 });
    expect(server.posts).toBe(1);
  });

  test("a transient network failure while following the job is shown as 'retrying' and recovers by itself: the card still arrives", async ({ page }) => {
    const server = await signedInPage(page);
    await firstScan(page);
    await page.reload();
    await expect(card(page)).toHaveAttribute("data-research-state", "queued");
    server.jobGetFault = "abort";
    server.jobGetFaults = 2;
    await expect(page.getByTestId("research-reconnecting")).toBeVisible({ timeout: 10_000 });
    await expect(card(page)).toHaveAttribute("data-research-phase", "loading");
    server.job = "succeeded";
    await expect(card(page)).toHaveAttribute("data-research-phase", "result", { timeout: 20_000 });
    await expect(page.getByTestId("research-reconnecting")).toHaveCount(0);
    expect(server.posts).toBe(1);
  });

  test("a lost or edited pointer is the same uniform 404: a clean landing, the pointer deleted, no research request", async ({ page }) => {
    const server = await signedInPage(page);
    await signIn(page);
    await page.evaluate(([owner, scan]) => window.sessionStorage.setItem("bsproof.scan.resume", JSON.stringify({ v: 1, owner, scan, intent: "fresh" })), [OWNER, RUN_ID]);
    await page.reload(); // the saved scan is not the signed-in person's (the server has none): 404
    await expect(page.locator(".scan-lab-result")).toHaveCount(0);
    await expect(page.getByTestId("resume-failed")).toHaveCount(0);
    await expect.poll(() => checkpoint(page)).toBeNull();
    expect(server.requests.filter((r) => r.includes("/api/scan/research"))).toEqual([]);
    expect(server.jobsCreated).toBe(0);
  });

  test("signing out clears the pointer and the screen; a reload then shows the sign-in card and nothing of the account", async ({ page }) => {
    const server = await signedInPage(page);
    await firstScan(page);
    expect(await checkpoint(page)).not.toBeNull();
    await page.getByRole("button", { name: "Sign out" }).first().click();
    await expect.poll(() => checkpoint(page)).toBeNull();
    await expect(page.locator(".sc-research")).toHaveCount(0);
    await page.reload();
    await expect(page.locator(".scan-lab-result")).toHaveCount(0);
    await expect(page.getByText("Vitamin D3")).toHaveCount(0);
    expect(server.posts).toBe(1);
  });

  test("Lithuanian: the restore line, the failure card and the 'reloaded' note are Lithuanian", async ({ page }) => {
    const server = await signedInPage(page);
    await firstScan(page);
    server.job = "running";
    await page.getByTestId("lang-toggle").click();
    await page.reload();
    await expect(page.getByTestId("replay-note")).toContainText("Šis puslapis buvo perkrautas");
    await expect(card(page)).toHaveAttribute("data-research-state", /queued|running/);
    expect(server.posts).toBe(1);
  });
});
