import { chromium } from 'playwright';
const SHOTS = '/tmp/claude-0/-home-user-OneLifev2/3e0d3e5d-6321-5053-860f-b2973792e6c2/scratchpad/shots';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await browser.newContext({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
const play = async () => {
await ctx.clearCookies();
await page.goto('file:///home/user/OneLifev2/apps/mobile/standalone/one-life.html', { waitUntil: 'load' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(1200);
await page.locator('.name-field').fill('Alex');
await page.locator('.age-up').click();
await page.waitForTimeout(900);

// Age to the mid-thirties so school, work and the shop all have something in them.
for (let i = 0; i < 90; i++) {
  if (await page.locator('.sh-popup').count()) {
    const sels = await page.locator('.sh-select-input').count();
    if (sels) { await page.screenshot({ path: `${SHOTS}/t-select.png` }); }
    await page.locator('.sh-btn').first().click(); await page.waitForTimeout(350); continue;
  }
  if (await page.locator('.sh-toast').count()) { await page.locator('.sh-toast-ok').click(); await page.waitForTimeout(250); continue; }
  const age = page.locator('.sh-age');
  if (await age.isDisabled()) break;
  const shown = await page.locator('.sh-station').textContent();
  if ((await page.locator('.sh-year').count()) >= 36) break;
  await age.click(); await page.waitForTimeout(300);
  void shown;
}
return (await page.locator('.sh-station').textContent()) ?? '';
};

let station = await play();
for (let tries = 0; tries < 4 && /Prisoner/.test(station); tries++) station = await play();
await page.screenshot({ path: `${SHOTS}/t-log.png` });
console.log('station:', await page.locator('.sh-station').textContent(), '| balance:', await page.locator('.sh-balance').textContent());
// Clear anything modal before touching the nav.
for (let i = 0; i < 6; i++) {
  if (await page.locator('.sh-popup').count()) { await page.locator('.sh-btn').first().click(); await page.waitForTimeout(400); continue; }
  if (await page.locator('.sh-toast').count()) { await page.locator('.sh-toast-ok').click(); await page.waitForTimeout(300); continue; }
  break;
}
for (const [n, name] of [[3,'activities'],[1,'assets'],[0,'context']]) {
  await page.locator('.sh-nav-btn').nth(n).click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${SHOTS}/t-${name}.png`, fullPage: false });
  if (name === 'activities') {
    console.log('rows:', await page.locator('.act-row').count(), 'locked:', await page.locator('.act-row.locked').count());
    console.log('sample:', (await page.locator('.act-row').allTextContents()).slice(0,6));
  }
  if (name === 'assets') console.log('finance buttons:', await page.locator('.shop-buy.finance').count());
  await page.locator('.sh-sheet-x').first().click();
  await page.waitForTimeout(250);
}
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
