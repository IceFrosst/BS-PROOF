// Local-only smoke check: start npm run dev on 127.0.0.1:3000 first.
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
const browser = await chromium.launch({ headless: true });
try {
  for (const viewport of [{ width: 1440, height: 1100 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport });
    const errors = [];
    const apiRequests = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (request.url().includes('/api/')) apiRequests.push(request.url()); });
    await page.goto('http://127.0.0.1:3000/design-lab/', { waitUntil: 'networkidle' });
    for (const layout of ['A · Guided', 'B · Workspace', 'C · Conversation']) {
      await page.getByRole('button', { name: 'Restart ↻' }).click();
      await page.getByRole('button', { name: layout, exact: true }).click();
      await page.getByLabel('Brand', { exact: true }).fill('Edited demo brand');
      await page.getByRole('button', { name: 'Confirm product →', exact: true }).click();
      await page.getByRole('button', { name: /Muscle growth/ }).click();
      await page.getByLabel('Add another outcome').fill('Recovery');
      await page.getByRole('button', { name: 'Add outcome', exact: true }).click();
      await page.getByRole('button', { name: 'Continue to research' }).click();
      await page.getByRole('button', { name: /Skip demo wait|See my results/ }).click();
      assert.equal(await page.locator('.dl-result-card').count(), 2);
      assert.match(await page.locator('.dl-product-strip').innerText(), /Edited demo brand/);
      await page.locator('.dl-result-card summary').first().click();
      assert.equal(await page.locator('.dl-report').first().locator('strong').count(), 11);
      await page.getByRole('button', { name: /Show all 6 researched outcomes/ }).click();
      assert.equal(await page.locator('.dl-result-card').count(), 6);
      await page.getByRole('button', { name: 'Show my selected outcomes' }).click();
      await page.screenshot({ path: `/tmp/bs-proof-${layout[0]}-${viewport.width}-results.png`, fullPage: true });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Horizontal overflow');
      await page.getByRole('button', { name: 'Edit', exact: true }).click();
      await page.getByLabel('Form', { exact: true }).fill('Unknown');
      assert.ok(await page.getByRole('button', { name: '04Results' }).isDisabled());
      await page.screenshot({ path: `/tmp/bs-proof-${layout[0]}-${viewport.width}-confirm.png`, fullPage: true });
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(apiRequests, []);
    await page.close();
    console.log(`PASS ${viewport.width}px: all three layouts, editing, filtering, details, no API calls or overflow`);
  }
} finally {
  await browser.close();
}
