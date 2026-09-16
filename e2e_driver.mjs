import { chromium } from 'playwright-core';

const requests = [];
const browser = await chromium.launch({headless:true});
const context = await browser.newContext();
const page = await context.newPage();
page.on('requestfinished', async (req) => {
  const url = req.url();
  if (url.includes('draft_events') || url.includes('applications') || url.includes('appointments')) {
    try {
      const resp = await req.response();
      requests.push({url, method: req.method(), status: resp ? resp.status() : null});
    } catch(e) {}
  }
});

await page.goto('https://ignas.wtf', {waitUntil:'networkidle', timeout: 30000});
await page.getByRole('button', {name:'YES', exact:true}).click();
await page.waitForTimeout(800);
console.log('AFTER YES:', (await page.locator('body').innerText()).slice(0,700));
await page.screenshot({path:'/tmp/step1.png'});
await context.storageState({path:'/tmp/e2e_state.json'});
console.log('REQS SO FAR:', JSON.stringify(requests));
await browser.close();
