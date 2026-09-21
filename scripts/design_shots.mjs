// Phone screenshots of every /scan state against a mocked API. Usage:
//   npm run build && PORT=3111 npm run start &   then   node scripts/design_shots.mjs [outdir]
//
// POST /api/scan is mocked with tests/fixtures/scan-photo-rich.json (a photo
// result with 3 actives, a recall, an MLM-suspected company, funding +
// publication concerns). Besides the landing / search / staged / loading /
// result frames it captures:
//   - consecutive viewport TILES of the result page (tile-NN), the honest way
//     to review a long phone page;
//   - the manual (typed) result, the 503 analyzer_unavailable error, the
//     not_a_supplement_label and ingredient_not_supported states, by mutating
//     the fixture / status per run.
// Also prints the full-page height of the result at each width.
import fs from "node:fs";
import { chromium, devices } from "@playwright/test";

const out = process.argv[2] ?? "/tmp/design-shots";
fs.mkdirSync(out, { recursive: true });
const base = process.env.BASE ?? "http://localhost:3111";
const fixture = JSON.parse(fs.readFileSync("tests/fixtures/scan-photo-rich.json", "utf8"));
const cameraFallbackAsset = "docs/design/ref/tabs-preview/lab-ab-hero.png";

// A product that DOES match a retained audit: creatine monohydrate, single
// active, 4,000 mg printed compound per day. The mocked body is exactly the
// shape `POST /api/scan` returns for such a label — the retained audit file,
// its plain sidecar and the provenance stamp — so the fully populated card can
// be reviewed. Without it every review shot is the unmatched "Not assessed"
// shell and the scored design is never seen.
const retainedAudit = JSON.parse(fs.readFileSync("app/design-lab/ab/audits/creatine.json", "utf8"));
const retainedPlain = JSON.parse(fs.readFileSync("app/design-lab/ab/audits/plain/creatine.json", "utf8"));
const matchedFixture = {
  ...fixture,
  label: {
    ...fixture.label,
    product_name: "Creatine Pro 4000",
    compound_dose_mg: 4000,
    is_multi_ingredient: false,
    other_actives: [],
    actives: [{ name: "Creatine Monohydrate", compound_dose_mg: 4000, form_text: "monohydrate" }],
  },
  ledger_audit: {
    audit: retainedAudit,
    plain: retainedPlain,
    provenance: {
      kind: "retained_previous_audit",
      prompt_version: retainedAudit.meta.prompt,
      target_product: "Creatine monohydrate",
      target_dose: "4,000 mg (4 g) printed compound per day",
      note: "Retained previous audit. It was not re-verified on this scan.",
    },
  },
};

const manualFixture = {
  ...fixture,
  source: "manual",
  label: undefined,
  input: {
    ingredient: "creatine",
    ingredient_label: "Creatine",
    form: "creatine_monohydrate",
    form_label: "Creatine monohydrate",
    dose_per_serving: { value: 5, unit: "g", mg: 5000 },
    servings_per_day: 1,
    basis: "user_input",
  },
  caveats: [
    { code: "typed_not_verified", text: "You typed these figures. Nobody read them off a label. This analysis is about the ingredient, form and dose you entered. Nothing here checked that a real product contains them." },
    ...(fixture.caveats ?? []),
  ],
  company: { ...fixture.company, status: "no_brand_on_label", brand: null, manufacturer: null, basis_used: [] },
  meta: { ...fixture.meta, models: { vision: null, text: fixture.meta.models.text } },
};
delete manualFixture.label;

const notLabel = {
  schema_version: fixture.schema_version,
  analyzed_at: fixture.analyzed_at,
  source: "photo",
  status: "not_a_supplement_label",
  basis_legend: fixture.basis_legend,
  meta: fixture.meta,
  caveats: [],
  literature_warnings: { status: "skipped", basis: "model_prior", reason: "no ingredient", data: null },
  run_id: fixture.run_id,
  app_version: fixture.app_version,
};

const notSupported = {
  ...notLabel,
  status: "ingredient_not_supported",
  ingredient_label_text: "Ashwagandha",
  supported_ingredients: ["creatine", "magnesium", "vitamin d", "omega-3", "zinc"],
  queue: { queued: true },
  literature_warnings: fixture.literature_warnings,
  label: { ...fixture.label, ingredient_label_text: "Ashwagandha", ingredient_vocab_id: null, form_vocab_id: null, product_name: "Calm Root 600", brand: "Herbal Co", compound_dose_mg: 600 },
};

const unavailable = { status: 503, body: { error: "The label analyzer is not configured on this deployment (no model API key).", status: "analyzer_unavailable", basis_legend: fixture.basis_legend } };

const b = await chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });

async function captureOrUpload(p) {
  if (await p.locator(".sc-shutter").count()) {
    await p.locator(".sc-shutter").click();
    return;
  }
  // CI's fake camera is not available on every browser build. Exercise the
  // same durable preview lifecycle with a real PNG rather than weakening the
  // loaded-image assertion below.
  await p.locator("#scan-file").setInputFiles(cameraFallbackAsset);
}

async function tiles(p, prefix) {
  const height = await p.evaluate(() => document.documentElement.scrollHeight);
  const vh = p.viewportSize().height;
  let i = 0;
  for (let y = 0; y < height && i < 20; y += vh, i++) {
    await p.evaluate((yy) => window.scrollTo(0, yy), y);
    await p.waitForTimeout(120);
    await p.screenshot({ path: `${out}/${prefix}-tile-${String(i).padStart(2, "0")}.png` });
  }
  await p.evaluate(() => window.scrollTo(0, 0));
  return height;
}

for (const [name, dev] of [["390", devices["iPhone 13"]], ["360", { ...devices["Pixel 5"], viewport: { width: 360, height: 740 } }]]) {
  const ctx = await b.newContext({ ...dev, permissions: ["camera"] });
  const p = await ctx.newPage();
  let reply = { status: 200, body: fixture };
  let delay = 2500;
  await p.route(/\/api\/scan\/?$/, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    await new Promise((r) => setTimeout(r, delay));
    await route.fulfill({ status: reply.status, contentType: "application/json", body: JSON.stringify(reply.body) });
  });

  // --- photo flow: landing, search sheet, staged, loading, result ---
  await p.goto(`${base}/scan/`, { waitUntil: "networkidle" });
  await p.waitForTimeout(2000);
  await p.screenshot({ path: `${out}/${name}-1-landing.png` });
  await p.click(".sc-search-cta");
  await p.waitForTimeout(500);
  await p.screenshot({ path: `${out}/${name}-2-search.png` });
  await p.keyboard.press("Escape");
  await p.waitForTimeout(300);
  await captureOrUpload(p);
  await p.waitForTimeout(600);
  await p.screenshot({ path: `${out}/${name}-3-staged.png`, fullPage: true });
  await p.locator("button.la-analyze").click();
  await p.waitForTimeout(900);
  await p.screenshot({ path: `${out}/${name}-4-loading.png` });
  await p.waitForSelector(".scan-result", { timeout: 15000 });
  // A real photo result must show the captured preview; silently accepting a
  // broken image leaves an empty 240px hero in the review shots.
  if (await p.locator(".scan-lab-photo").count()) {
    await p.locator(".scan-lab-photo").evaluate((img) => {
      if (!(img instanceof HTMLImageElement) || img.naturalWidth <= 0) throw new Error("photo result hero has no loaded image");
    });
  }
  await p.waitForTimeout(600);
  await p.screenshot({ path: `${out}/${name}-5-result-top.png` });
  const height = await tiles(p, `${name}-5-result`);
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.screenshot({ path: `${out}/${name}-5-result-full.png`, fullPage: true });
  console.log(`${name}: result page height ${height}px`);
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  console.log(`${name}: horizontal overflow ${overflow}px`);

  // --- warnings bundle, expanded: the summary plus every notice opened, so
  //     the caveat / disclosure BODIES can be read at review size (2026-09-16,
  //     the plain-language rewrite). ---
  if (await p.locator(".ab-warnings").count()) {
    await p.locator(".ab-warnings > summary").click();
    await p.waitForTimeout(200);
    const notices = p.locator(".ab-warning-list .ab-warning-row > summary");
    for (let i = 0; i < (await notices.count()); i++) {
      await notices.nth(i).click();
      await p.waitForTimeout(80);
    }
    await p.locator(".ab-warnings").scrollIntoViewIfNeeded();
    await p.evaluate(() => window.scrollBy(0, -24));
    await p.waitForTimeout(250);
    await p.screenshot({ path: `${out}/${name}-5a-warnings-open.png` });
    // The whole bundle as one image, so every body can be read in review.
    await p.locator(".ab-warnings").screenshot({ path: `${out}/${name}-5a-warnings-open-block.png` });
    await p.locator(".ab-warnings > summary").click();
    await p.waitForTimeout(150);
  }

  // --- outcome tabs: scroll the Outcomes list into view, then open one outcome ---
  await p.locator(".ab-tabs").scrollIntoViewIfNeeded();
  await p.evaluate(() => window.scrollBy(0, -72));
  await p.waitForTimeout(300);
  await p.screenshot({ path: `${out}/${name}-5b-tabs-outcomes.png` });
  await p.locator(".ab-bars.outcomes li > button").nth(0).click();
  await p.waitForTimeout(400);
  await p.locator(".ab-tabs").scrollIntoViewIfNeeded();
  await p.evaluate(() => window.scrollBy(0, -72));
  await p.waitForTimeout(300);
  await p.screenshot({ path: `${out}/${name}-5c-tabs-outcome.png` });
  // --- one expanded dimension detail ---
  await p.locator(".ab-bars:not(.outcomes) li > button").nth(0).click();
  await p.waitForTimeout(180);
  await p.locator(".ab-bars:not(.outcomes)").scrollIntoViewIfNeeded();
  await p.screenshot({ path: `${out}/${name}-5d-detail.png` });
  await p.locator(".ab-tabs [role='tab']").nth(0).click();
  await p.waitForTimeout(200);

  // --- manual (typed) result via the sheet ---
  delay = 300;
  reply = { status: 200, body: manualFixture };
  await p.click(".sc-again-bottom");
  await p.waitForTimeout(400);
  await p.click(".sc-search-cta");
  await p.fill('input[role="combobox"]', "creatine");
  await p.keyboard.press("ArrowDown");
  await p.keyboard.press("Enter");
  await p.selectOption("select", "creatine_monohydrate");
  await p.screenshot({ path: `${out}/${name}-6-search-filled.png` });
  await p.click("button.sc-submit");
  await p.waitForSelector(".scan-result", { timeout: 15000 });
  await p.waitForTimeout(400);
  await p.screenshot({ path: `${out}/${name}-7-manual-top.png` });
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.screenshot({ path: `${out}/${name}-7-manual-full.png`, fullPage: true });

  // --- error: 503 analyzer_unavailable ---
  reply = unavailable;
  await p.click(".sc-again-bottom");
  await p.waitForTimeout(400);
  await captureOrUpload(p);
  await p.waitForTimeout(500);
  await p.locator("button.la-analyze").click();
  await p.waitForSelector(".sc-scanned", { timeout: 15000 });
  await p.waitForTimeout(300);
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.screenshot({ path: `${out}/${name}-8-error-503.png`, fullPage: true });

  // --- not a supplement label ---
  reply = { status: 200, body: notLabel };
  await p.click(".sc-again-bottom");
  await p.waitForTimeout(400);
  await captureOrUpload(p);
  await p.waitForTimeout(500);
  await p.locator("button.la-analyze").click();
  await p.waitForSelector(".scan-result", { timeout: 15000 });
  await p.waitForTimeout(300);
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.screenshot({ path: `${out}/${name}-9-not-a-label.png`, fullPage: true });

  // --- ingredient not supported ---
  reply = { status: 200, body: notSupported };
  await p.click(".sc-again-bottom");
  await p.waitForTimeout(400);
  await captureOrUpload(p);
  await p.waitForTimeout(500);
  await p.locator("button.la-analyze").click();
  await p.waitForSelector(".scan-result", { timeout: 15000 });
  await p.waitForTimeout(300);
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.screenshot({ path: `${out}/${name}-10-not-supported.png`, fullPage: true });

  // --- a product that MATCHES a retained audit: the fully scored card ---
  reply = { status: 200, body: matchedFixture };
  await p.click(".sc-again-bottom");
  await p.waitForTimeout(400);
  await captureOrUpload(p);
  await p.waitForTimeout(500);
  await p.locator("button.la-analyze").click();
  await p.waitForSelector(".scan-result", { timeout: 15000 });
  await p.waitForTimeout(600);
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.screenshot({ path: `${out}/${name}-11-matched-outcomes.png` });
  await p.screenshot({ path: `${out}/${name}-11-matched-full.png`, fullPage: true });
  await p.locator(".ab-bars.outcomes li > button").nth(0).click();
  await p.waitForTimeout(400);
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.screenshot({ path: `${out}/${name}-11-matched-outcome.png` });
  await p.locator(".ab-bars:not(.outcomes) li > button").nth(0).click();
  await p.waitForTimeout(250);
  await p.locator(".ab-bars:not(.outcomes)").scrollIntoViewIfNeeded();
  await p.evaluate(() => window.scrollBy(0, -72));
  await p.waitForTimeout(200);
  await p.screenshot({ path: `${out}/${name}-11-matched-detail.png` });
  console.log(`${name}: matched result height ${await p.evaluate(() => document.documentElement.scrollHeight)}px, overflow ${await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)}px`);

  await ctx.close();
}
await b.close();
console.log("wrote", out);
