// Local-only smoke check for /design-lab/ab (development-only route).
// Start `npm run dev` on 127.0.0.1:3000 first, then: node scripts/check_effect_card.mjs
//
// Covers all 4 products x 4 layouts at 390px and desktop. Per combination it
// asserts: the landing tab is Outcomes with NO overall number, EVERY outcome
// row is reachable by scrolling inside the phone's scroll region, the Effect
// bar expands and never shows a graded fill it did not earn, no horizontal
// body overflow, and no page errors or API calls.
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

const URL = 'http://127.0.0.1:3000/design-lab/ab/';
const PRODUCTS = [
  { name: 'Creatine monohydrate · 4 g', kind: 'legacy' },
  { name: 'Vitamin D3 · 2000 IU', kind: 'legacy' },
  { name: 'Magnesium glycinate · 300 mg', kind: 'legacy' },
  { name: 'Caffeine anhydrous · 200 mg', kind: 'research' },
];
const LAYOUTS = ['1 · Hero', '2 · Middle', '3 · Overlap', '4 · Split'];
const HONEST_EFFECT_STATES = new Set([
  'reported_interval', 'reported_point', 'not_graded', 'no_evidence', 'no_meaningful_benefit', 'fictional_points',
]);

const browser = await chromium.launch({ headless: true });
try {
  for (const viewport of [{ width: 1440, height: 1100 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport });
    const errors = [];
    const apiRequests = [];
    page.on('pageerror', error => errors.push(error.message));
    // console errors too: a duplicate React key or a hydration mismatch never
    // throws, so pageerror alone would let it ship.
    page.on('console', message => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
    page.on('request', request => { if (request.url().includes('/api/')) apiRequests.push(request.url()); });
    await page.goto(URL, { waitUntil: 'networkidle' });

    for (const layout of LAYOUTS) {
      await page.getByRole('tab', { name: layout }).click();
      for (const product of PRODUCTS) {
        await page.getByRole('button', { name: new RegExp(product.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).first().click();

        // 1. The landing tab is Outcomes. No overall average, number or band.
        const tabs = page.locator('.ab-tabs button');
        assert.equal(await tabs.first().innerText(), 'Outcomes');
        assert.equal(await page.locator('.ab-number').count(), 0, 'overall number on the Outcomes tab');
        const listText = await page.locator('.ab-listhead').innerText();
        assert.match(listText, /not\b.*a promise of benefit/i);
        assert.doesNotMatch(listText, /Average of the/i);

        // 2. EVERY outcome row is reachable by scrolling the phone content.
        const rows = page.locator('.ab-bars.outcomes > li');
        const rowCount = await rows.count();
        assert.ok(rowCount > 0, `no outcome rows for ${product.name}`);
        for (let i = 0; i < rowCount; i += 1) {
          const row = rows.nth(i);
          await row.scrollIntoViewIfNeeded();
          assert.ok(await row.isVisible(), `row ${i} of ${product.name} is not reachable`);
          const name = await row.locator('.ab-bar-name').innerText();
          assert.ok(name.trim().length > 0, 'outcome row without a name');
        }

        // 3. Drill into the last row (the deepest scroll) and expand Effect.
        await rows.nth(rowCount - 1).locator('button').click();
        const population = await page.locator('.ab-pop').innerText();
        assert.match(population, /Population/);
        const effect = page.locator('[data-row-id="effect"]');
        const kind = await effect.getAttribute('data-effect-kind');
        assert.ok(HONEST_EFFECT_STATES.has(kind), `unexpected effect state ${kind}`);
        if (kind !== 'fictional_points') {
          assert.equal(await effect.locator('.ab-bar-track i').count(), kind === 'no_meaningful_benefit' ? 1 : 0,
            'a non-fictional effect bar drew a graded fill');
        }
        await effect.locator('button').first().click();
        const detail = effect.locator('.ab-bar-detail');
        await detail.waitFor({ state: 'visible' });
        const detailText = await detail.innerText();
        assert.ok(detailText.length > 40, 'empty Effect expansion');
        if (product.kind === 'research') {
          assert.equal(await page.locator('.ab-number').count(), 0, 'caffeine must have no numeric headline');
          assert.equal(await page.locator('.ab-bars .ab-bar-word', { hasText: 'Not assessed in this run' }).count(), 4);
          assert.match(detailText, /Reported estimate, not a grade/);
          assert.ok(await detail.locator('a[href^="https://"]').count() > 0, 'no source link on the caffeine effect row');
        } else {
          assert.match(detailText, /Previous AI audit · not reverified/);
        }

        // 4. Nothing overflows the page horizontally.
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Horizontal overflow');
        await page.locator('.ab-tabs button').first().click();
      }
      await page.screenshot({ path: `/tmp/bs-proof-ab-${layout[0]}-${viewport.width}.png`, fullPage: true });
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(apiRequests, []);
    await page.close();
    console.log(`PASS ${viewport.width}px: 4 products x 4 layouts, every outcome row reachable, Effect expanded, no overflow, no API calls`);
  }
} finally {
  await browser.close();
}
