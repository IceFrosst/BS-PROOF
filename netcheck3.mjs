import { chromium } from 'playwright-core';
const browser = await chromium.launch({headless:true});
const page = await browser.newPage();
page.on('request', req => {
  if (req.url().includes('draft_events')) console.log('REQUEST:', req.method(), req.resourceType(), req.url());
});
page.on('requestfailed', req => console.log('FAILED:', req.method(), req.url(), req.failure()));
page.on('response', async resp => {
  if (resp.url().includes('draft_events')) console.log('RESPONSE:', resp.status(), resp.url());
});
await page.goto('https://ignas.wtf', {waitUntil:'networkidle', timeout: 30000});
await page.getByRole('button', {name:'YES', exact:true}).click();
await page.waitForTimeout(5000);
console.log('waited 5s with no nav after YES');
await browser.close();
