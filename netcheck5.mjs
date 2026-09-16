import { chromium } from 'playwright-core';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
page.on('request', req => { if (req.url().includes('draft_events')) console.log('REQ', req.method(), new Date().toISOString()); });
page.on('requestfailed', req => console.log('FAIL', req.method(), req.url(), req.failure(), new Date().toISOString()));
page.on('requestfinished', async req => { if(req.url().includes('draft_events')) { const r=await req.response(); console.log('OK', req.method(), r.status(), new Date().toISOString()); } });
await page.goto('https://ignas.wtf', { waitUntil: 'load' });
await page.evaluate(async () => {
  try {
    const r = await fetch('https://qcsyihymmaktkbqfxlkl.supabase.co/rest/v1/draft_events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: window.__ANON__ || '',
      },
      body: '[]',
    });
    return r.status;
  } catch(e) { return 'ERR:' + e.message; }
});
await page.waitForTimeout(2000);
console.log('chromium version', await browser.version());
await browser.close();
