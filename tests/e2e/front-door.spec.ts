/*
 * Two audiences, two pages, and they must not drift back together.
 *
 * Founder, 2026-08-25: the public page is the waitlist and only the waitlist;
 * scanning is for "testers who are like developers and our board members".
 * That separation is a product decision, not a layout preference, so it is
 * asserted rather than left to whoever next edits the hero.
 *
 * The failure this guards against is silent and embarrassing in the same
 * moment: a scanner reappearing on the public page in front of the very people
 * it was hidden from, discovered only when someone scans a QR code at a stand.
 */
import { expect, test } from "@playwright/test";

test.describe("front door separation", () => {
  test("the public page offers the waitlist and no scanner", async ({ page }) => {
    await page.goto("/");

    // The waitlist is present and usable.
    const email = page.locator("input.waitlist-input");
    await expect(email).toBeVisible();
    await expect(email).toHaveAttribute("type", "email");
    await expect(page.getByRole("button", { name: /join/i })).toBeVisible();

    // Nothing that starts a scan. Checked by ROLE and by the analyzer's own
    // markup, so renaming a label does not quietly re-open this hole.
    await expect(page.locator(".la-drop")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /take a photo/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /upload an image/i })).toHaveCount(0);
    await expect(page.locator('input[type="file"]')).toHaveCount(0);
  });

  test("the public page does not advertise the tester route", async ({ page }) => {
    await page.goto("/");
    // Unlisted is the whole mechanism: /tester is not protected, so a link
    // from the public page would hand it to exactly the audience it excludes.
    await expect(page.locator('a[href*="/tester"]')).toHaveCount(0);
  });

  test("the tester page offers the scanner", async ({ page }) => {
    await page.goto("/tester");
    await expect(page.locator(".la-drop")).toHaveCount(1);
    await expect(page.locator('input[type="file"]')).toHaveCount(1);
  });

  test("the tester page does not carry the waitlist", async ({ page }) => {
    // A tester submitting the public signup form would pollute the list with
    // addresses that never came from the stand.
    await page.goto("/tester");
    await expect(page.locator("input.waitlist-input")).toHaveCount(0);
  });

  test("the tester page is marked noindex", async ({ page }) => {
    await page.goto("/tester");
    const robots = page.locator('meta[name="robots"]');
    await expect(robots.first()).toHaveAttribute("content", /noindex/i);
  });
});
