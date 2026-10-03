import fs from "node:fs";
import path from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { PNG, mockGoogle, mockSupabase } from "./auth-mocks";

/*
 * /scan workspace: the Scan / History tabs and the Google-required result flow
 * (2026-09-23).
 *
 * TWO MODES, decided by how the server under test was BUILT -- the three
 * NEXT_PUBLIC_* sign-in variables are inlined into the client bundle at build
 * time, so they cannot be toggled per test:
 *
 *   default build (no sign-in configured; what CI and `npm run build` produce)
 *     -> the tab pattern, History's "not available here" note, accessibility.
 *
 *   build with NEXT_PUBLIC_SUPABASE_URL=https://e2e.supabase.invalid
 *              NEXT_PUBLIC_SUPABASE_ANON_KEY=e2e-anon
 *              NEXT_PUBLIC_GOOGLE_CLIENT_ID=e2e.apps.googleusercontent.com
 *     and E2E_AUTH_CONFIGURED=1 when running the tests
 *     -> the mandatory-Google flow, end to end in a real browser with EVERY
 *        network dependency mocked: the Google Identity Services script, the
 *        Supabase token endpoint and the scan/history API. Deterministic, no
 *        secrets, no model calls.
 */

const CONFIGURED = process.env.E2E_AUTH_CONFIGURED === "1";
const RICH = JSON.parse(fs.readFileSync(path.join(process.cwd(), "tests", "fixtures", "scan-photo-rich.json"), "utf8"));
const RUN_ID = "5c0e0478-b5c0-4bbe-b8b7-d45b2a5d3878";

const tab = (page: Page, name: string) => page.getByRole("tab", { name, exact: true });

test.describe("workspace tabs", () => {
  test("Scan is the default tab and the page keeps its single h1", async ({ page }) => {
    await page.goto("/scan");
    await expect(page.getByRole("tablist", { name: "Scan workspace" })).toBeVisible();
    await expect(tab(page, "Scan")).toHaveAttribute("aria-selected", "true");
    await expect(tab(page, "History")).toHaveAttribute("aria-selected", "false");
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Does your Supplement actually work?");
    await expect(page.getByRole("button", { name: "Search your supplement" })).toBeVisible();
  });

  test("tabs switch by click and by keyboard without leaving the route", async ({ page }) => {
    await page.goto("/scan");
    await tab(page, "Scan").focus();
    await page.keyboard.press("ArrowRight");
    await expect(tab(page, "History")).toHaveAttribute("aria-selected", "true");
    await expect(tab(page, "History")).toBeFocused();
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Your scans");
    expect(new URL(page.url()).pathname).toBe("/scan/");

    await page.keyboard.press("Home");
    await expect(tab(page, "Scan")).toHaveAttribute("aria-selected", "true");
    await tab(page, "History").click();
    await expect(tab(page, "History")).toHaveAttribute("aria-selected", "true");
    await tab(page, "Scan").click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Does your Supplement actually work?");
  });

  test("the tab bar fits the viewport and leaves the search pill reachable", async ({ page }) => {
    await page.goto("/scan");
    const viewport = page.viewportSize()!;
    const box = (await page.getByRole("tablist", { name: "Scan workspace" }).boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    const pill = (await page.getByRole("button", { name: "Search your supplement" }).boundingBox())!;
    expect(pill.y).toBeLessThan(viewport.height);
  });

  test("both tabs have no automatically detectable accessibility violations", async ({ page }) => {
    await page.goto("/scan");
    await page.locator("main#main-content").waitFor();
    const audit = () => new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect((await audit()).violations).toEqual([]);
    await tab(page, "History").click();
    expect((await audit()).violations).toEqual([]);
  });
});

test.describe("History without sign-in configured", () => {
  test.skip(CONFIGURED, "default-build behaviour");

  test("says plainly that history is not available here, and scanning is not gated", async ({ page }) => {
    await page.goto("/scan");
    await tab(page, "History").click();
    await expect(page.getByText("History is not available here.")).toBeVisible();
    await expect(page.getByTestId("history-unconfigured")).toContainText("Google sign-in");
    // No sign-in prompt anywhere on an unconfigured deployment.
    await tab(page, "Scan").click();
    await expect(page.getByTestId("signin-hint")).toHaveCount(0);
    await expect(page.getByTestId("signin-card")).toHaveCount(0);
  });
});

/* ------------------------------------------------------------------------ */

test.describe("Google-required flow (build with sign-in configured)", () => {
  test.skip(!CONFIGURED, "needs a build with the three NEXT_PUBLIC_* sign-in variables and E2E_AUTH_CONFIGURED=1");

  test("signed out: a photo can be staged but nothing is sent until Google sign-in; then the bearer token is used and the result is saved and replayable", async ({ page }) => {
    const scanPosts: Array<{ auth: string | undefined }> = [];
    const historyGets: Array<{ url: string; auth: string | undefined }> = [];
    const exchange = { exchange: "ok" as const };
    await mockGoogle(page);
    await mockSupabase(page, exchange);
    await page.route("**/api/scan", (route) => {
      if (route.request().method() !== "POST") return route.continue();
      scanPosts.push({ auth: route.request().headers()["authorization"] });
      return route.fulfill({ contentType: "application/json", body: JSON.stringify({ ...RICH, run_id: RUN_ID, persistence: { status: "stored", run_id: RUN_ID, image: { status: "stored" } } }) });
    });
    await page.route("**/api/scan/history", (route) => {
      historyGets.push({ url: route.request().url(), auth: route.request().headers()["authorization"] });
      return route.fulfill({ contentType: "application/json", body: JSON.stringify({ status: "ok", runs: [{ id: RUN_ID, created_at: "2026-09-20T10:30:00Z", source: "photo", status: "ok", product_name: "Creatine Pro 5000" }], next_cursor: null }) });
    });
    await page.route(`**/api/scan/history/${RUN_ID}`, (route) =>
      historyGets.push({ url: route.request().url(), auth: route.request().headers()["authorization"] }) && route.fulfill({ contentType: "application/json", body: JSON.stringify({ status: "ok", run_id: RUN_ID, analysis: RICH }) }),
    );

    await page.goto("/scan");
    await expect(page.getByTestId("signin-hint")).toContainText("Google sign-in");

    // Stage a photo while signed out: it is kept, and the scan button is replaced by the sign-in card.
    await page.locator("#scan-file").setInputFiles({ name: "label.png", mimeType: "image/png", buffer: PNG });
    await expect(page.getByRole("img", { name: "The label you staged for analysis" })).toBeVisible();
    await expect(page.getByTestId("signin-card")).toContainText("Sign in to scan this label");
    await expect(page.getByRole("button", { name: "Scan this label" })).toHaveCount(0);
    expect(scanPosts).toHaveLength(0);

    // History is gated too.
    await tab(page, "History").click();
    await expect(page.getByText("Sign in to see your history")).toBeVisible();
    await tab(page, "Scan").click();

    // Sign in through the (mocked) Google button -> (mocked) Supabase exchange.
    await page.locator("[data-e2e-google]").first().click();
    await expect(page.getByRole("button", { name: "Scan this label" })).toBeVisible();
    await page.getByRole("button", { name: "Scan this label" }).click();
    await expect(page.locator(".scan-lab-result")).toBeVisible();
    expect(scanPosts).toEqual([{ auth: "Bearer e2e-token" }]);
    await expect(page.getByTestId("save-status")).toHaveText("Saved to your history.");

    // History lists it; opening it replays the same card with no new scan request.
    await tab(page, "History").click();
    await expect(page.getByRole("button", { name: /Creatine Pro 5000/ })).toBeVisible();
    expect(historyGets[0].auth).toBe("Bearer e2e-token");
    await page.getByRole("button", { name: /Creatine Pro 5000/ }).click();
    await expect(page.getByTestId("replay-note")).toContainText("Saved scan from");
    // The Scan tab stays mounted (hidden) holding its own result, so the replayed card is
    // asserted inside the History panel; the hidden Scan-tab result must not be what is shown.
    const panels = page.locator(".sw-panel");
    await expect(panels.nth(1).locator(".scan-lab-result")).toBeVisible();
    await expect(panels.nth(0).locator(".scan-lab-result")).toBeHidden();
    expect(scanPosts).toHaveLength(1);

    // Signing out removes everything account-specific.
    await page.getByRole("button", { name: "Back to history" }).first().click();
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page.getByText("Sign in to see your history")).toBeVisible();
    await expect(page.getByRole("button", { name: /Creatine Pro 5000/ })).toHaveCount(0);
    await tab(page, "Scan").click();
    await expect(page.locator(".scan-lab-result")).toHaveCount(0);
  });

  test("a Google credential Supabase refuses leaves an actionable error, not a blank card", async ({ page }) => {
    await mockGoogle(page);
    await mockSupabase(page, { exchange: "fail" });
    await page.goto("/scan");
    await page.locator("#scan-file").setInputFiles({ name: "label.png", mimeType: "image/png", buffer: PNG });
    await page.locator("[data-e2e-google]").first().click();
    await expect(page.getByTestId("google-exchange-error")).toContainText("sign-in did not finish");
    await expect(page.getByTestId("google-exchange-error")).not.toContainText("e2e-fake-credential");
    await expect(page.locator("[data-e2e-google]").first()).toBeVisible();
  });

  test("a blocked Google script shows how to recover", async ({ page }) => {
    await page.route("https://accounts.google.com/gsi/client", (route) => route.abort());
    await page.goto("/scan");
    await page.locator("#scan-file").setInputFiles({ name: "label.png", mimeType: "image/png", buffer: PNG });
    await expect(page.getByTestId("google-signin-error")).toContainText("Google sign-in did not load");
    await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  });
});
