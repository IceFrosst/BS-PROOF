import { chromium } from 'playwright-core';

const TS = new Date().toISOString();
const TEST_NAME = `E2E COMPLETED-SUBMISSION DO-NOT-USE ${TS}`;
const TEST_HANDLE = `e2e-completed-${Date.now()}`;
const PNG_1x1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.bringToFront();

function ts() { return new Date().toISOString(); }
async function step(name, fn) {
  console.log(`\n[${ts()}] >>> ${name}`);
  await fn();
  await page.waitForTimeout(1200);
}

try {
  await step('goto landing', async () => {
    await page.goto('https://ignas.wtf', { waitUntil: 'load', timeout: 30000 });
  });

  await step('YES', async () => {
    await page.getByRole('button', { name: 'YES', exact: true }).click();
  });

  await step('follow-up answer', async () => {
    const texts = await page.locator('button').allTextContents();
    for (const t of texts) { if (t && t !== 'PRIORITY') { await page.getByRole('button', { name: t, exact: true }).click(); break; } }
  });

  await step('gender FEMALE', async () => {
    await page.getByRole('button', { name: 'FEMALE', exact: true }).click();
  });

  await step('identity name', async () => {
    await page.locator('#applicant-name').fill(TEST_NAME);
    await page.getByRole('button', { name: /CONTINUE/i }).click();
  });

  await step('visa: SIDEQUEST', async () => {
    await page.locator('button:has-text("SIDEQUEST")').first().click();
  });

  await step('sidequest idea', async () => {
    await page.locator('#sidequest-idea').fill('E2E SMOKE TEST — SYNTHETIC ENTRY, SAFE TO IGNORE, DO NOT ACTION');
    await page.locator('button[type=submit]').click();
  });

  await step('sidequest supplies (declare none, submit)', async () => {
    await page.locator('button[type=submit]').click();
  });

  await step('appointment: wait for calendar + pick first available day', async () => {
    await page.waitForSelector('text=SELECT DAY', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1500);
    // find first available day button (green bordered, inside calendar grid)
    const dayBtn = page.locator('div.grid button[type=button]').first();
    await dayBtn.click({ timeout: 10000 });
  });

  await step('appointment: pick a time slot', async () => {
    const bodyText = await page.locator('body').innerText();
    console.log('after day pick:', bodyText.slice(0, 500));
    await page.getByRole('button', { name: 'MORNING', exact: true }).click({ timeout: 10000 });
  });

  await step('handle page', async () => {
    const bodyText = await page.locator('body').innerText();
    console.log('handle page text:', bodyText.slice(0, 400));
    await page.locator('#applicant-handle').fill(TEST_HANDLE);
    await page.getByRole('button', { name: /CONTINUE/i }).click();
  });

  await step('biometric: upload fake photo', async () => {
    const bodyText = await page.locator('body').innerText();
    console.log('biometric page text:', bodyText.slice(0, 300));
    const fileInput = page.locator('input[type=file]');
    await fileInput.setInputFiles({ name: 'e2e-selfie.png', mimeType: 'image/png', buffer: PNG_1x1 });
    await page.waitForTimeout(800);
    await page.getByRole('button', { name: /SUBMIT|CONFIRM|ACCEPT/i }).click({ timeout: 5000 }).catch(async () => {
      console.log('submit-by-role failed, dumping buttons:', await page.locator('button').allTextContents());
    });
  });

  await step('screening: submit', async () => {
    const bodyText = await page.locator('body').innerText();
    console.log('screening page text:', bodyText.slice(0, 300));
    const submitBtn = page.locator('button').last();
    console.log('screening buttons:', await page.locator('button').allTextContents());
    await page.getByRole('button', { name: /SUBMIT|CONFIRM|CLEAR/i }).click({ timeout: 5000 }).catch(async () => {
      console.log('fallback click last button');
      await submitBtn.click();
    });
  });

  await step('processing -> wait for visa-issued', async () => {
    await page.waitForTimeout(6000);
    console.log('current url:', page.url());
    console.log('final page text:', (await page.locator('body').innerText()).slice(0, 500));
  });

  console.log('\nTEST_NAME:', TEST_NAME);
  console.log('TEST_HANDLE:', TEST_HANDLE);
  console.log('FINAL URL:', page.url());
} catch (e) {
  console.error('SCRIPT ERROR at', ts(), e.message);
  console.log('URL at error:', page.url());
  console.log('body at error:', (await page.locator('body').innerText().catch(() => 'n/a')).slice(0, 500));
} finally {
  await browser.close();
}
