import { chromium } from 'playwright-core';
import fs from 'fs';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
let draftEventsSeen = [];
page.on('requestfinished', async req => {
  if (req.url().includes('draft_events') && req.method() === 'POST') {
    const resp = await req.response();
    let status = null; try { status = resp.status(); } catch {}
    draftEventsSeen.push({ status, at: new Date().toISOString() });
  }
});
await page.bringToFront();
console.log('UTC start:', new Date().toISOString());
await page.goto('https://ignas.wtf', { waitUntil: 'networkidle', timeout: 30000 });
// Click YES then immediately answer follow-up + gender + identity name with a
// clearly labeled abandoned-draft marker, then STOP without ever submitting.
await page.getByRole('button', { name: 'YES', exact: true }).click();
await page.waitForTimeout(2500);
const texts = await page.locator('button').allTextContents();
for (const t of texts) { if (t && t !== 'PRIORITY') { await page.getByRole('button', { name: t, exact: true }).click(); break; } }
await page.waitForTimeout(2500);
await page.getByRole('button', { name: 'MALE', exact: true }).click();
await page.waitForTimeout(2500);
await page.locator('#applicant-name').fill('E2E ABANDONED-DRAFT DO-NOT-USE 30MIN-AGE-TEST');
await page.waitForTimeout(2500);
// Deliberately abandon here: no CONTINUE click, no further steps.
console.log('draftEventsSeen:', JSON.stringify(draftEventsSeen));
console.log('UTC end (abandon point):', new Date().toISOString());
await browser.close();
