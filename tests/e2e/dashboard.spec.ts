import { expect, test } from "@playwright/test";

const retainedRunId =
  "20260807_164410_creatine_creatine-monohydrate_grok-sr-ft-per-o";

test("catalog and retained run routes expose the audit, not a naked score", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page.locator("main#main-content")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: /BS.?PROOF/i })).toBeVisible();
  const card = page.getByTestId("run-card").filter({ hasText: /creatine/i });
  await expect(card).toBeVisible();
  await expect(card.getByTestId("run-status")).toBeVisible();

  await card.getByRole("link").click();
  await expect(page).toHaveURL(new RegExp(`/runs/${retainedRunId}/?$`));
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/creatine/i);

  const outcomeCards = page.getByTestId("outcome-card");
  await expect(outcomeCards).toHaveCount(30);
  await expect(page.locator('[data-outcome-state="scored"]')).toHaveCount(19);
  await expect(page.locator('[data-outcome-state="unavailable"]')).toHaveCount(11);

  for (const outcome of await page.locator('[data-outcome-state="scored"]').all()) {
    await expect(outcome.getByTestId("arc-effect")).toBeVisible();
    await expect(outcome.getByTestId("arc-form")).toBeVisible();
    await expect(outcome.getByTestId("arc-dose")).toBeVisible();
    await expect(outcome.getByTestId("arc-evidence")).toBeVisible();
  }

  const telemetry = page.getByTestId("telemetry-panel");
  await expect(page.getByTestId("telemetry-status")).toContainText(/partial/i);
  await expect(telemetry).toContainText(/797/);
  await expect(telemetry).toContainText(/113\.6/);
  await expect(telemetry).toContainText(/146\.9/);
  await expect(telemetry).toContainText(/subscription/i);
  await expect(telemetry).toContainText(/\$0(?:\.00)?/);
  await expect(telemetry).toContainText(/tokens?.*(?:unavailable|not recorded)|(?:unavailable|not recorded).*tokens?/i);
  await expect(telemetry).toContainText(
    /API.?equivalent.*(?:unavailable|not recorded)|(?:unavailable|not recorded).*API.?equivalent/i,
  );
});

test("unknown runs fail closed with an accessible missing state", async ({ page }) => {
  const response = await page.goto("/runs/not-a-real-run");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: /run not found|not found/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /all runs|dashboard|back/i })).toBeVisible();
});

test("gated outcome details keep missing arcs distinct from numeric zero", async ({
  page,
}) => {
  await page.goto(`/runs/${retainedRunId}/outcomes/adverse_events_gi`);
  await expect(page.getByText("Evidence gated", { exact: true })).toBeVisible();
  const arcTableSection = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Arc values" }),
  });
  await expect(arcTableSection).toBeVisible();
  await expect(arcTableSection).not.toContainText("0.0%");
  await expect(arcTableSection).toContainText(/unavailable|not reported|\u2014/i);
});

test("keyboard users can skip navigation and open a run", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  const skipLink = page.getByRole("link", { name: /skip to (main )?content/i });
  await expect(skipLink).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("main#main-content")).toBeFocused();

  const runLink = page
    .getByTestId("run-card")
    .filter({ hasText: /creatine/i })
    .getByRole("link");
  await runLink.focus();
  await expect(runLink).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`/runs/${retainedRunId}/?$`));
});

test("dashboard routes do not overflow at their configured viewport", async ({ page }) => {
  for (const route of [
    "/",
    "/methodology",
    `/runs/${retainedRunId}`,
    `/runs/${retainedRunId}/outcomes/muscle_strength`,
    "/runs/not-a-real-run",
  ]) {
    await page.goto(route);
    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(overflows, `${route} has horizontal overflow`).toBe(false);
  }
});
