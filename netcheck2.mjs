import { chromium } from 'playwright-core';
const browser = await chromium.launch({headless:true});
const page = await browser.newPage();
page.on('requestfailed', req => console.log('FAILED:', req.url(), req.failure(), req.headers()['content-type']));
page.on('requestfinished', async req => {
  if (req.url().includes('draft_events')) {
    const resp = await req.response();
    let body = '';
    try { body = await resp.text(); } catch {}
    console.log('FINISHED draft_events:', req.method(), resp.status(), body.slice(0,200));
    console.log('  reqHeaders:', JSON.stringify(req.headers()));
    console.log('  reqBody:', (req.postData()||'').slice(0,300));
  }
});
await page.goto('https://ignas.wtf', {waitUntil:'networkidle', timeout: 30000});
await page.getByRole('button', {name:'YES', exact:true}).click();
await page.waitForTimeout(1000);
const texts = await page.locator('button').allTextContents();
for (const t of texts) { if (t && t !== 'PRIORITY') { await page.getByRole('button',{name:t,exact:true}).click(); break; } }
await page.waitForTimeout(1000);
await page.getByRole('button', {name:'FEMALE', exact:true}).click();
await page.waitForTimeout(1000);
await page.locator('#applicant-name').fill('E2E NETCHECK');
await page.getByRole('button', {name:/CONTINUE/i}).click();
await page.waitForTimeout(3000);
console.log('done waiting');
await browser.close();
