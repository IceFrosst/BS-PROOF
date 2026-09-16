import { chromium } from 'playwright-core';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
page.on('requestfailed', req => { if (req.url().includes('draft_events')) console.log('FAILED', req.failure()); });
page.on('requestfinished', async req => {
  if (req.url().includes('draft_events')) {
    const resp = await req.response();
    console.log('FINISHED', resp.status());
  }
});
await page.bringToFront();
console.log('UTC start:', new Date().toISOString());
await page.goto('https://ignas.wtf', { waitUntil: 'load', timeout: 30000 });
await page.waitForTimeout(1500);
await page.getByRole('button', { name: 'YES', exact: true }).click();
console.log('clicked YES at', new Date().toISOString());
await page.waitForTimeout(3000);
console.log('waited 3s after YES, now', new Date().toISOString());
const texts = await page.locator('button').allTextContents();
for (const t of texts) { if (t && t !== 'PRIORITY') { await page.getByRole('button', { name: t, exact: true }).click(); break; } }
console.log('clicked followup at', new Date().toISOString());
await page.waitForTimeout(3000);
await page.getByRole('button', { name: 'MALE', exact: true }).click();
console.log('clicked gender at', new Date().toISOString());
await page.waitForTimeout(3000);
await page.locator('#applicant-name').fill('E2E ABANDONED-DRAFT DO-NOT-USE 30MIN-AGE-TEST');
console.log('filled name at', new Date().toISOString());
await page.waitForTimeout(4000);
console.log('final wait done at', new Date().toISOString());
await browser.close();
