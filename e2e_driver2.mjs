import { chromium } from 'playwright-core';

const requests = [];
const browser = await chromium.launch({headless:true});
const context = await browser.newContext({storageState: '/tmp/e2e_state.json'});
const page = await context.newPage();
page.on('requestfinished', async (req) => {
  const url = req.url();
  if (url.includes('supabase.co')) {
    try {
      const resp = await req.response();
      requests.push({url: url.replace(/apikey=[^&]+/,'apikey=REDACTED'), method: req.method(), status: resp ? resp.status() : null});
    } catch(e) {}
  }
});

await page.goto('https://ignas.wtf', {waitUntil:'networkidle', timeout: 30000});
console.log('LOADED:', (await page.locator('body').innerText()).slice(0,300));
console.log('REQS on reload:', JSON.stringify(requests, null, 1));
await browser.close();
