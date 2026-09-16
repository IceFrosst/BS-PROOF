import { chromium } from 'playwright-core';
const browser = await chromium.launch({headless:true});
const page = await browser.newPage();
page.on('requestfinished', async req => {
  if (req.url().includes('draft_events')) {
    const resp = await req.response();
    let body = ''; try { body = await resp.text(); } catch {}
    console.log('=== draft_events', req.method(), resp.status(), '===');
    console.log('Prefer header:', req.headers()['prefer']);
    console.log('Content-Profile:', req.headers()['content-profile']);
    const post = req.postData() || '';
    // redact potential PII-ish fields just in case, show structure only
    console.log('postData (first 500):', post.slice(0,500));
    console.log('responseBody:', body.slice(0,200));
  }
});
page.on('requestfailed', req => { if (req.url().includes('draft_events')) console.log('FAILED', req.failure()); });
await page.goto('https://ignas.wtf', {waitUntil:'networkidle', timeout: 30000});
await page.getByRole('button', {name:'YES', exact:true}).click();
await page.waitForTimeout(5000);
await browser.close();
