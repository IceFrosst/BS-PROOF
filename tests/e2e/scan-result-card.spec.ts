import fs from "node:fs";
import path from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { audit, blendAudit, liveResult, outcome, publicD3K2Audit, UNKNOWN_ROW } from "../helpers/live-result-card-fixtures";
import { PNG, mockGoogle, mockSupabase } from "./auth-mocks";

/*
 * The completed live audit as the ESTABLISHED result card (Outcomes tab, one tab per outcome, a warnings block, four
 * expandable horizontal rows Effect / Evidence / Form / Dose), in a real browser at desktop and Pixel 7 widths.
 * Every answer is mocked (Google, Supabase, /api/scan, /api/scan/research): no model, no network, no real job. The audits
 * are GENERATED MOCKS (tests/helpers/live-result-card-fixtures.ts) plus the public D3 + K2 fixture; nothing here claims a
 * real finding. Needs the configured (mock sign-in) build, like tests/e2e/scan-research.spec.ts.
 *
 * RESEARCH_SHOTS_DIR=<dir> saves the named screenshots there (private; not committed).
 */
const CONFIGURED = process.env.E2E_AUTH_CONFIGURED === "1";
const SHOTS = process.env.RESEARCH_SHOTS_DIR;
const RICH = JSON.parse(fs.readFileSync(path.join(process.cwd(), "tests", "fixtures", "scan-photo-rich.json"), "utf8"));
const RUN_ID = "5c0e0478-b5c0-4bbe-b8b7-d45b2a5d3878";
const JOB_ID = "7d1f2a9e-3b4c-4d5e-8f60-123456789abc";
const NOW = new Date("2026-10-04T19:00:00.000Z");
const T0 = "2026-10-04T19:00:00.000000+00:00";

const targetOf = (over: Record<string, unknown> = {}) => ({
  version: "ResearchJobV1", fact_basis: "label", product: { brand: "Acme", product_name: "Mock supplement" }, ingredient: { vocab_id: "magnesium", label: "Magnesium" },
  form: { vocab_id: "magnesium_bisglycinate", label: "Magnesium bisglycinate" }, dose: { compound_per_serving_mg: 1000, printed_elemental_per_serving_mg: 200, unit_as_printed: "mg" },
  servings_per_day: 2, is_multi_ingredient: false, ...over,
});
const jobWith = (result: unknown, target: unknown) => ({ id: JOB_ID, scan_id: RUN_ID, status: "succeeded", prompt_version: "live-research-v0.5", target, created_at: T0, updated_at: T0, completed_at: "2026-10-04T19:03:10.000000+00:00", failure_code: null, result });
const SCAN = { ...RICH, label: { ...RICH.label, ingredient_vocab_id: "magnesium", ingredient_label_text: "Magnesium", compound_dose_mg: 1000, printed_elemental_dose_mg: 200, dose_unit_as_printed: "mg", servings_per_day: 2, is_multi_ingredient: false, other_actives: [], actives: [], product_name: "Mock supplement", brand: "Acme" } };
const stored = { ...SCAN, run_id: RUN_ID, persistence: { status: "stored", run_id: RUN_ID, image: { status: "stored" } } };

async function shot(page: Page, name: string) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  const card = page.locator(".sc-research").first();
  await card.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(SHOTS, `${name}-${test.info().project.name}.png`), fullPage: false });
  await card.screenshot({ path: path.join(SHOTS, `${name}-${test.info().project.name}-card.png`) });
}
async function noHorizontalScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
}
async function noClippedCard(page: Page) {
  // Run BEFORE any scrollIntoView / screenshot (those scroll an overflow-hidden container and hide a clipped edge):
  // the card and every container around it fit the viewport width, and nothing inside the card sticks out on either side.
  const problems = await page.evaluate(() => {
    const limit = document.documentElement.clientWidth;
    const out: string[] = [];
    for (const sel of [".scan-lab-result", ".la-result", ".sc-research", ".sc-live-card"]) {
      const el = document.querySelector(sel) as HTMLElement | null;
      if (el && el.scrollWidth > el.clientWidth + 1) out.push(`${sel} scrolls: ${el.scrollWidth} > ${el.clientWidth}`);
      if (el && el.getBoundingClientRect().right > limit + 1) out.push(`${sel} right edge ${Math.round(el.getBoundingClientRect().right)} > ${limit}`);
    }
    for (const n of Array.from(document.querySelectorAll(".sc-live-card *")) as HTMLElement[]) {
      if (n.closest(".ab-tabs") && !n.classList.contains("ab-tabs")) continue; // the tab strip scrolls inside itself
      const r = n.getBoundingClientRect();
      if (r.width > 0 && (r.right > limit + 1 || r.left < -1)) out.push(`${n.className || n.tagName} ${Math.round(r.left)}..${Math.round(r.right)}`);
    }
    return out.slice(0, 8);
  });
  expect(problems).toEqual([]);
}

test.describe("live result card (build with sign-in configured; mocked sign-in and API)", () => {
  test.skip(!CONFIGURED, "needs a build with the three NEXT_PUBLIC_* sign-in variables and E2E_AUTH_CONFIGURED=1");

  async function open(page: Page, result: unknown, target: unknown, lt = false) {
    await page.clock.install({ time: NOW });
    await mockGoogle(page);
    await mockSupabase(page, { exchange: "ok" });
    await page.route("**/api/scan", (route) => (route.request().method() === "POST" ? route.fulfill({ contentType: "application/json", body: JSON.stringify(stored) }) : route.continue()));
    await page.route("**/api/scan/history", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ status: "ok", runs: [], next_cursor: null }) }));
    await page.route("**/api/scan/translate", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ status: "translator_unavailable" }) }));
    await page.route("**/api/scan/research", (route) => route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ status: "ok", created: true, job: jobWith(result, target) }) }));
    await page.goto("/scan");
    await page.locator("#scan-file").setInputFiles({ name: "label.png", mimeType: "image/png", buffer: PNG });
    await page.locator("[data-e2e-google]").first().click();
    if (lt) await page.getByTestId("lang-toggle").click();
    await page.getByRole("button", { name: lt ? /Skenuoti šią etiketę/ : "Scan this label" }).first().click();
    await expect(page.locator(".sc-research")).toHaveAttribute("data-research-phase", "result");
    await noClippedCard(page); // first look, before anything scrolls: the tab strip of a long combination must not widen the page
  }
  const tabs = (page: Page) => page.locator(".sc-live-card").getByRole("tab");
  const row = (page: Page, id: string) => page.locator(`[data-testid="research-axes"] > li[data-row-id="${id}"]`);
  async function axe(page: Page) {
    const results = await new AxeBuilder({ page }).include(".scan-lab-result").analyze();
    expect(results.violations).toEqual([]);
  }

  test("known product: Outcomes tab, outcome tabs by keyboard, the warnings block, and four rows whose bars are filled ONLY where the audit's own number and the scan's facts allow", async ({ page }) => {
    await open(page, liveResult(audit([outcome(), UNKNOWN_ROW()])), targetOf());
    const card = page.locator(".sc-live-card");
    await expect(card).toBeVisible();
    await expect(tabs(page)).toHaveCount(3);
    await expect(tabs(page).first()).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("research-outcome-list").locator("> li")).toHaveCount(2);
    await noHorizontalScroll(page); await noClippedCard(page);
    await shot(page, "card-1-outcomes");

    // keyboard: focus the selected tab, ArrowRight selects the first outcome and focus follows
    await tabs(page).first().focus();
    await page.keyboard.press("ArrowRight");
    await expect(tabs(page).nth(1)).toHaveAttribute("aria-selected", "true");
    await expect(tabs(page).nth(1)).toBeFocused();
    await expect(page.locator('[data-testid="research-axes"] > li')).toHaveCount(4);
    await expect(page.locator('[data-testid="research-axes"] > li .ab-bar-name')).toHaveText(["Effect", "Evidence", "Form", "Dose"]);
    await expect(row(page, "effect")).toHaveAttribute("data-axis-state", "data");
    await expect(row(page, "form")).toHaveAttribute("data-axis-state", "filled");
    await expect(row(page, "form").locator(".ab-bar-track i")).toHaveCSS("width", /.+/);
    await expect(row(page, "effect").locator(".ab-bar-track i")).toHaveCount(0);
    await expect(row(page, "evidence").locator(".ab-bar-track i")).toHaveCount(0);
    const trackBox = await row(page, "form").locator(".ab-bar-track").boundingBox();
    const fillBox = await row(page, "form").locator(".ab-bar-track i").boundingBox();
    expect(Math.round((fillBox!.width / trackBox!.width) * 100)).toBeGreaterThanOrEqual(73); // 3/4, minus the track's 1px borders
    expect(Math.round((fillBox!.width / trackBox!.width) * 100)).toBeLessThanOrEqual(77);

    // the warnings block: 3 for this outcome, collapsed, then opened
    const warnings = page.getByTestId("research-warnings");
    await expect(warnings).toHaveAttribute("data-warning-count", "3");
    await shot(page, "card-2-outcome");
    await warnings.locator("> summary").click();
    await warnings.locator('[data-warning="funding"] summary').click();
    await expect(warnings.locator('[data-warning="funding"]')).toContainText("Mock: two small trials; funded by the manufacturer");
    await shot(page, "card-3-warnings-open");
    await warnings.locator("> summary").click();

    // rows expand by keyboard (Enter/Space), one at a time
    await row(page, "effect").locator("> button").focus();
    await page.keyboard.press("Enter");
    await expect(row(page, "effect").locator("> button")).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByTestId("research-axis-effect")).toContainText("Mock study note — probably not generalisable");
    await expect(page.getByTestId("research-axis-effect")).toContainText("PMID:10000001");
    await noHorizontalScroll(page); await noClippedCard(page);
    await shot(page, "card-4-effect-open");
    await axe(page);
    await row(page, "dose").locator("> button").click();
    await expect(page.getByTestId("research-axis-dose")).toContainText("Servings per day on your scan 2");
    await shot(page, "card-5-dose-open");

    // the other outcome: nothing cited, so nothing is assessed and nothing is filled; its warnings are its own
    await tabs(page).nth(2).click();
    await expect(page.locator('[data-testid="research-axes"] .ab-bar-track i')).toHaveCount(0);
    await expect(page.locator('[data-testid="research-axes"] > li .ab-bar-word')).toHaveText(["Not assessed", "Not assessed", "Not assessed", "Not assessed"]);
    await expect(page.getByTestId("research-warnings")).toHaveAttribute("data-warning-count", "1");
    await shot(page, "card-6-unknown-outcome");
    await axe(page);
  });

  test("the user's D3 + K2 case (public audit, combination, nothing cited): every row empty and named, the audit's finding expanded, no formula efficacy", async ({ page }) => {
    const target = targetOf({ ingredient: { vocab_id: "vitamin_d", label: "Vitamin D3" }, form: { vocab_id: null, label: "Vitamin D3 (cholecalciferol)" }, servings_per_day: null, is_multi_ingredient: true });
    await open(page, liveResult(publicD3K2Audit()), target);
    await tabs(page).nth(1).click();
    await expect(page.locator('[data-testid="research-axes"] .ab-bar-track i')).toHaveCount(0);
    await expect(row(page, "effect").locator(".ab-bar-word")).toHaveText("Not assessed");
    await expect(row(page, "form").locator(".ab-bar-word")).toHaveText("Not gradeable");
    await expect(row(page, "dose").locator(".ab-bar-word")).toHaveText("Not gradeable");
    await row(page, "evidence").locator("> button").click();
    await expect(page.getByTestId("research-axis-evidence")).toContainText("This is a case of no verified evidence, not evidence of no benefit.");
    await page.getByTestId("research-warnings").locator("> summary").click();
    await expect(page.getByTestId("research-warnings").locator('[data-warning="blend"]')).toHaveCount(1);
    await noHorizontalScroll(page); await noClippedCard(page);
    await shot(page, "card-7-d3k2");
    await axe(page);
  });

  test("a combination with a CONTEXT ONLY row: the context row is tagged, shown, and not graded", async ({ page }) => {
    await open(page, liveResult(blendAudit()), targetOf({ is_multi_ingredient: true }));
    await expect(tabs(page).nth(2)).toContainText("Context only");
    await tabs(page).nth(2).click();
    await expect(page.getByTestId("research-context-banner")).toBeVisible();
    await expect(page.locator('[data-testid="research-axes"] .ab-bar-track i')).toHaveCount(0);
    await expect(page.locator('[data-testid="research-axes"] > li .ab-bar-word')).toHaveText(["Not gradeable", "Not gradeable", "Not gradeable", "Not gradeable"]);
    await noHorizontalScroll(page); await noClippedCard(page);
    await shot(page, "card-8-context-row");
    await axe(page);
  });

  test("Lithuanian: tabs, rows, states, reasons and warnings are Lithuanian; the model's own sentences stay English and tagged", async ({ page }) => {
    await open(page, liveResult(audit([outcome(), UNKNOWN_ROW()])), targetOf({ servings_per_day: null }), true);
    await expect(tabs(page).first()).toHaveText("Rezultatai");
    await tabs(page).nth(1).click();
    await expect(page.locator('[data-testid="research-axes"] > li .ab-bar-name')).toHaveText(["Poveikis", "Įrodymai", "Forma", "Dozė"]);
    await expect(row(page, "dose").locator(".ab-bar-word")).toHaveText("Nežinoma");
    await expect(page.getByTestId("research-warnings")).toHaveAttribute("data-warning-count", "4");
    await page.getByTestId("research-warnings").locator("> summary").click();
    await row(page, "effect").locator("> button").click();
    await expect(page.getByTestId("research-axis-effect").locator('[lang="en"]', { hasText: "Mock study note — probably not generalisable" }).first()).toBeVisible();
    await noHorizontalScroll(page); await noClippedCard(page);
    await shot(page, "card-9-lt");
    await axe(page);
  });
});
