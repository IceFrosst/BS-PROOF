import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { PNG, mockGoogle, mockSupabase } from "./auth-mocks";

/*
 * /tester's label analyzer and the Google sign-in gate (owner finding,
 * 2026-10-03: POST /api/analyze-label spends the same model call as
 * POST /api/scan and /tester used to call it with no bearer token).
 *
 * TWO MODES, decided by how the server under test was BUILT (the three
 * NEXT_PUBLIC_* sign-in variables are inlined at build time), exactly like
 * tests/e2e/scan-workspace.spec.ts:
 *
 *   default build (no sign-in configured) -> the analyzer is unchanged: no gate,
 *     no sign-in UI, and the request carries no Authorization header.
 *
 *   build with NEXT_PUBLIC_SUPABASE_URL=https://e2e.supabase.invalid
 *              NEXT_PUBLIC_SUPABASE_ANON_KEY=e2e-anon
 *              NEXT_PUBLIC_GOOGLE_CLIENT_ID=e2e.apps.googleusercontent.com
 *     and E2E_AUTH_CONFIGURED=1 -> the Google-required flow in a real browser with
 *     every network dependency mocked (Google script, Supabase token endpoint,
 *     /api/analyze-label). Deterministic: no secrets, no model calls.
 */

const CONFIGURED = process.env.E2E_AUTH_CONFIGURED === "1";

const ANSWER = {
  schema_version: "LabelAnalysisV1",
  status: "ingredient_not_supported",
  ingredient_label_text: "Ashwagandha",
  supported_ingredients: ["creatine"],
};

test.describe("/tester analyzer without sign-in configured", () => {
  test.skip(CONFIGURED, "default-build behaviour");

  test("is not gated: Analyze sends the photo with no Authorization header and shows the answer", async ({ page }) => {
    const posts: Array<{ auth: string | undefined }> = [];
    await page.route("**/api/analyze-label", (route) => {
      if (route.request().method() !== "POST") return route.continue();
      posts.push({ auth: route.request().headers()["authorization"] });
      return route.fulfill({ contentType: "application/json", body: JSON.stringify(ANSWER) });
    });
    await page.goto("/tester");
    await expect(page.getByTestId("la-signin-hint")).toHaveCount(0);
    await page.locator("#la-file").setInputFiles({ name: "label.png", mimeType: "image/png", buffer: PNG });
    await expect(page.getByTestId("signin-card")).toHaveCount(0);
    await page.getByRole("button", { name: "Analyze", exact: true }).click();
    await expect(page.locator(".la-result")).toContainText("Ashwagandha");
    expect(posts).toEqual([{ auth: undefined }]);
  });
});

test.describe("/tester analyzer Google-required flow (build with sign-in configured)", () => {
  test.skip(!CONFIGURED, "needs a build with the three NEXT_PUBLIC_* sign-in variables and E2E_AUTH_CONFIGURED=1");

  test("signed out: the photo stays staged but NO request is sent; signing in unblocks it and the bearer token is used; sign-out removes the result", async ({ page }) => {
    const posts: Array<{ auth: string | undefined }> = [];
    await mockGoogle(page);
    await mockSupabase(page, { exchange: "ok" });
    await page.route("**/api/analyze-label", (route) => {
      if (route.request().method() !== "POST") return route.continue();
      posts.push({ auth: route.request().headers()["authorization"] });
      return route.fulfill({ contentType: "application/json", body: JSON.stringify(ANSWER) });
    });

    await page.goto("/tester");
    await expect(page.getByTestId("la-signin-hint")).toContainText("Google sign-in");

    await page.locator("#la-file").setInputFiles({ name: "label.png", mimeType: "image/png", buffer: PNG });
    await expect(page.getByRole("img", { name: "The label you staged for analysis" })).toBeVisible();
    await expect(page.getByTestId("signin-card")).toContainText("Sign in to analyze this label");
    await expect(page.getByRole("button", { name: "Analyze", exact: true })).toHaveCount(0);
    expect(posts).toHaveLength(0);

    // The sign-in card is accessible where it sits (inside the drop zone, on the dark hero page).
    const audit = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).include("#analyze").analyze();
    expect(audit.violations).toEqual([]);

    await page.locator("[data-e2e-google]").first().click();
    await expect(page.getByRole("button", { name: "Analyze", exact: true })).toBeVisible();
    expect(posts).toHaveLength(0); // signing in is not consent to analyze
    await page.getByRole("button", { name: "Analyze", exact: true }).click();
    await expect(page.locator(".la-result")).toContainText("Ashwagandha");
    expect(posts).toEqual([{ auth: "Bearer e2e-token" }]);
    await expect(page.locator(".la-result")).toContainText("e2e@example.com");

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page.locator(".la-result")).toHaveCount(0);
    await expect(page.getByText("Ashwagandha")).toHaveCount(0);
    await expect(page.getByTestId("la-signin-hint")).toBeVisible();
    expect(posts).toHaveLength(1);
  });

  // mockSupabase answers any non-exchange auth call (including the token refresh) with a 404, i.e. a refresh that cannot succeed.
  test("a server 401 with a session the server will not accept signs the person out on screen instead of looping", async ({ page }) => {
    let posts = 0;
    await mockGoogle(page);
    await mockSupabase(page, { exchange: "ok" });
    await page.route("**/api/analyze-label", (route) => {
      if (route.request().method() !== "POST") return route.continue();
      posts += 1;
      return route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ status: "unauthorized", error: "Sign in with Google to continue." }) });
    });
    await page.goto("/tester");
    await page.locator("#la-file").setInputFiles({ name: "label.png", mimeType: "image/png", buffer: PNG });
    await page.locator("[data-e2e-google]").first().click();
    await page.getByRole("button", { name: "Analyze", exact: true }).click();
    await expect(page.getByTestId("signin-card")).toBeVisible();
    await expect(page.getByTestId("signin-notice")).toContainText("session ended");
    expect(posts).toBeLessThanOrEqual(2);
    await expect(page.locator(".la-result")).toHaveCount(0);
  });
});
