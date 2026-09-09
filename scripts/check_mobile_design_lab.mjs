// Local-only smoke check for /design-lab/mobile. Start npm run dev on 127.0.0.1:3000 first.
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
const browser = await chromium.launch({ headless: true });
try {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }, { width: 320, height: 640 }]) {
    const page = await browser.newPage({ viewport });
    const errors = [];
    const api = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (request.url().includes('/api/')) api.push(request.url()); });
    await page.goto('http://127.0.0.1:3000/design-lab/mobile/', { waitUntil: 'networkidle' });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
    assert.ok(overflow, `horizontal overflow at ${viewport.width}`);
    await page.getByRole('button', { name: 'Try a sample scan' }).click();
    await page.getByLabel('Brand').fill('Edited brand');
    await page.getByLabel('Servings per day').fill('');
    await page.getByRole('button', { name: /That’s my product/ }).click();
    await page.getByRole('button', { name: /Endurance/ }).click();
    await page.getByLabel('Another outcome').fill('Recovery');
    await page.getByRole('button', { name: 'Add outcome' }).click();
    assert.match(await page.locator('.mp-choice-count span').innerText(), /4 interests picked/);
    await page.getByRole('button', { name: 'Follow the research' }).click();
    await page.getByRole('button', { name: 'Pause demo' }).click();
    await page.getByRole('button', { name: 'Skip demo wait →' }).click();
    await page.getByRole('button', { name: 'Recovery', exact: true }).click();
    assert.match(await page.locator('.mp-result-card').innerText(), /recovery/i);
    assert.equal(await page.locator('.mp-result-card summary').count(), 1);
    await page.locator('.mp-result-card summary').click();
    assert.equal(await page.locator('.mp-report-details > div').count(), 11);
    await page.getByRole('button', { name: /Explore all 6 outcomes/ }).click();
    assert.equal(await page.locator('.mp-outcome-tabs button').count(), 6);
    await page.getByRole('button', { name: 'Save sample report' }).click();
    await page.getByRole('button', { name: 'My notes' }).click();
    assert.match(await page.locator('.mp-saved-card').innerText(), /Creatine/);
    await page.getByRole('button', { name: 'Safety', exact: true }).click();
    assert.match(await page.locator('.mp-info').innerText(), /No safety assessment/);
    await page.getByRole('button', { name: 'Learn', exact: true }).click();
    await page.locator('.mp-lesson summary').first().click();
    await page.getByRole('button', { name: /Dark theme|Light theme/ }).click();
    const smallTargets = await page.evaluate(() => [...document.querySelectorAll('.mp-device button, .mp-device summary, .mp-device input, .mp-device select')].filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (r.height < 44 || r.width < 44); }).map(el => `${el.className || el.tagName}:${Math.round(el.getBoundingClientRect().width)}x${Math.round(el.getBoundingClientRect().height)}`));
    assert.deepEqual(smallTargets, [], 'targets below 44px');
    await page.screenshot({ path: `/tmp/bs-proof-mobile-${viewport.width}.png`, fullPage: viewport.width < 760 });
    assert.deepEqual(errors, []);
    assert.deepEqual(api, []);
    await page.close();
    console.log(`PASS ${viewport.width}px: full journey, edits, filtering, report, themes, 44px targets, no API calls or overflow`);
  }
} finally {
  await browser.close();
}
