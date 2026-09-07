import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await (await b.newContext({ viewport: { width: 1000, height: 1000 }, deviceScaleFactor: 1.4 })).newPage();
const errs = []; page.on('pageerror', e => errs.push(e.message));
await page.goto('http://127.0.0.1:4400/one-life.html', { waitUntil: 'load' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'load' });
await page.waitForSelector('.name-field', { timeout: 15000 });
await page.locator('.name-field').fill('Alex');
await page.locator('.age-up').click(); await page.waitForTimeout(600);
for (let i = 0; i < 12; i++) {
  if (await page.locator('.card-title').count()) {
    await page.locator('.choice').first().click(); await page.waitForTimeout(150);
    if (await page.locator('.btn-dark').count()) { await page.locator('.btn-dark').click(); await page.waitForTimeout(90); }
    continue;
  }
  const btn = page.locator('.age-up');
  if (await btn.count() === 0 || await btn.isDisabled()) break;
  await btn.click(); await page.waitForTimeout(170);
}
const firstAge = await page.locator('.log-age').first().textContent();
console.log('top of log:', firstAge, '| action tiles in log:', await page.locator('.log .action').count());
await page.screenshot({ path: '.shots/Q-log.png' });
console.log('errors:', errs.length ? errs.slice(0,2) : 'none');
await b.close();
