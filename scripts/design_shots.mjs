// Phone screenshots of every /scan state against a mocked API. Usage:
//   npm run build && PORT=3111 npm run start &   then   node scripts/design_shots.mjs [outdir]
import fs from "node:fs";
import { chromium, devices } from "@playwright/test";
const out = process.argv[2] ?? "/tmp/design-shots"; fs.mkdirSync(out, { recursive: true });
const base = process.env.BASE ?? "http://localhost:3111";
const fixture = JSON.parse(fs.readFileSync("tests/fixtures/scan-photo-rich.json", "utf8"));
const b = await chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
for (const [name, dev] of [["390", devices["iPhone 13"]], ["360", { ...devices["Pixel 5"], viewport: { width: 360, height: 740 } }]]) {
  const ctx = await b.newContext({ ...dev, permissions: ["camera"] });
  const p = await ctx.newPage();
  let delay = 2500;
  await p.route(/\/api\/scan\/?$/, async (route) => { if (route.request().method() !== "POST") return route.continue(); await new Promise(r => setTimeout(r, delay)); await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(fixture) }); });
  await p.goto(`${base}/scan/`, { waitUntil: "networkidle" }); await p.waitForTimeout(2000);
  await p.screenshot({ path: `${out}/${name}-1-landing.png` });
  await p.click(".sc-search-cta"); await p.waitForTimeout(500);
  await p.screenshot({ path: `${out}/${name}-2-search.png` });
  await p.keyboard.press("Escape"); await p.waitForTimeout(300);
  await p.click(".sc-shutter"); await p.waitForTimeout(600);
  await p.screenshot({ path: `${out}/${name}-3-staged.png`, fullPage: true });
  await p.locator("button.la-analyze").click(); await p.waitForTimeout(900);
  await p.screenshot({ path: `${out}/${name}-4-loading.png` });
  await p.waitForSelector(".scan-result", { timeout: 15000 }); await p.waitForTimeout(500);
  await p.screenshot({ path: `${out}/${name}-5-results.png`, fullPage: true });
  await ctx.close();
}
await b.close(); console.log("wrote", out);
