import { chromium } from 'playwright-core';
import fs from 'fs';

const TS = new Date().toISOString().replace(/[:.]/g, '-');
const TEST_NAME = `E2E TEST DO-NOT-USE ${TS}`;
const TEST_HANDLE = `e2e-test-${TS.toLowerCase()}`;
const PNG_1x1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');

const netLog = [];
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();

page.on('requestfinished', async (req) => {
  const url = req.url();
  if (url.includes('supabase.co')) {
    let status = null, bodySnippet = null;
    try {
      const resp = await req.response();
      status = resp ? resp.status() : null;
      try { bodySnippet = (await resp.text()).slice(0, 300); } catch {}
    } catch {}
    const u = new URL(url);
    netLog.push({ path: u.pathname, method: req.method(), status, bodySnippet });
  }
});

function log(step) { console.log(`\n=== ${step} ===`); }

try {
  log('goto landing');
  await page.goto('https://ignas.wtf', { waitUntil: 'networkidle', timeout: 30000 });

  log('click YES');
  await page.getByRole('button', { name: 'YES', exact: true }).click();
  await page.waitForTimeout(600);

  log('answer follow-up (first option)');
  const followBtns = page.locator('main button, .paper-card button');
  const texts = await page.locator('button').allTextContents();
  console.log('buttons:', texts);
  // click the first button that's not PRIORITY
  for (const t of texts) {
    if (t && t !== 'PRIORITY') {
      await page.getByRole('button', { name: t, exact: true }).click();
      break;
    }
  }
  await page.waitForTimeout(600);

  log('gender select FEMALE');
  await page.getByRole('button', { name: 'FEMALE', exact: true }).click();
  await page.waitForTimeout(600);

  log('identity page');
  console.log((await page.locator('body').innerText()).slice(0, 300));
  await page.locator('#applicant-name').fill(TEST_NAME);
  await page.getByRole('button', { name: /CONTINUE/i }).click();
  await page.waitForTimeout(800);

  log('visa selection page - choose sidequest/tourist');
  console.log((await page.locator('body').innerText()).slice(0, 600));
  // Click the first visa button (SIDEQUEST)
  const visaButtons = page.locator('button:has-text("SIDEQUEST")');
  if (await visaButtons.count() > 0) {
    await visaButtons.first().click();
  } else {
    console.log('SIDEQUEST button not found, dumping all buttons');
    console.log(await page.locator('button').allTextContents());
  }
  await page.waitForTimeout(800);

  log('tourist idea step');
  console.log((await page.locator('body').innerText()).slice(0, 400));
  const ideaBox = page.locator('#sidequest-idea');
  if (await ideaBox.count() > 0) {
    await ideaBox.fill('E2E SMOKE TEST — SYNTHETIC ENTRY, SAFE TO IGNORE');
    await page.locator('button[type=submit]').click();
    await page.waitForTimeout(600);
  }

  log('tourist supplies step');
  console.log((await page.locator('body').innerText()).slice(0, 400));
  const supplySubmit = page.locator('button[type=submit]');
  if (await supplySubmit.count() > 0) {
    await supplySubmit.click();
    await page.waitForTimeout(1000);
  }

  log('appointment page (waiting for calendar)');
  await page.waitForTimeout(2000);
  console.log((await page.locator('body').innerText()).slice(0, 600));

  await fs.promises.writeFile('/tmp/netlog_partial.json', JSON.stringify(netLog, null, 2));
  await page.screenshot({ path: '/tmp/appointment.png' });
  await context.storageState({ path: '/tmp/unused_state.json' });
} catch (e) {
  console.error('SCRIPT ERROR', e);
  await page.screenshot({ path: '/tmp/error.png' }).catch(() => {});
  await fs.promises.writeFile('/tmp/netlog_partial.json', JSON.stringify(netLog, null, 2));
}

console.log('\nNETLOG SO FAR:', JSON.stringify(netLog, null, 1));
console.log('TEST_NAME:', TEST_NAME, 'TEST_HANDLE:', TEST_HANDLE);
// keep browser+page alive for continuation? We'll just close for this phase.
await browser.close();
