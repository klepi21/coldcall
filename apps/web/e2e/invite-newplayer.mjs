// Two real players on the live server: A creates a private credits table, B joins with the invite link.
import { chromium } from '@playwright/test';
const BASE = process.env.BASE || 'https://45-81-6-214.sslip.io';
const OUT = process.argv[2] ?? '/tmp';
const EXE = `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const browser = await chromium.launch({ executablePath: EXE });
async function player(name) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(name, 'PAGEERROR', String(e)));
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /play free now/i }).click();
  await page.getByRole('button', { name: /create my account/i }).click();
  await page.getByRole('button', { name: /^skip$/i }).click();
  await page.getByLabel(/your player name/i).fill(name);
  await page.getByLabel(/18 or older/i).check();
  await page.getByRole('checkbox').nth(1).check();
  await page.getByRole('button', { name: /start my free practice game/i }).click();
  await page.waitForURL(/\/play/);
  await page.goto(BASE + '/wallet', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /get 100 test usdc/i }).click();
  await page.getByText(/100 test USDC are in your wallet/i).waitFor({ timeout: 45000 });
  await page.waitForTimeout(800);
  for (let attempt = 1; ; attempt++) {
    await page.getByRole('button', { name: /^add money$/i }).first().click();
    await page.getByLabel(/amount in credits/i).fill('20');
    await page.waitForTimeout(700);
    await page.getByRole('dialog').getByRole('button', { name: /^add money$/i }).click();
    try { await page.getByText(/20\.00 credits added/i).waitFor({ timeout: 40000 }); break; }
    catch (e) { console.log(name, 'deposit attempt', attempt, 'did not land'); if (attempt >= 3) throw e; await page.keyboard.press('Escape'); await page.waitForTimeout(1000); }
  }
  console.log(name, 'funded');
  return page;
}
const a = await player('Alice');
await a.goto(BASE + '/play', { waitUntil: 'networkidle' });
await a.getByRole('button', { name: 'Play Chess' }).click();
await a.getByRole('dialog').getByRole('radio', { name: /^people$/i }).click();
await a.getByRole('dialog').getByRole('button', { name: /^1\s*\$0\.01$/ }).click();
await a.getByRole('dialog').getByLabel(/private table/i).check();
await a.getByRole('dialog').getByRole('button', { name: /create table/i }).click();
await a.waitForURL(/\/table\//, { timeout: 20000 });
await a.waitForTimeout(2000);
const m = (await a.content()).match(/https?:\/\/[^"'<\s]+\/invite\/[A-Za-z0-9_-]+/);
console.log('INVITE', m?.[0]);
// Bob has no account at all
const bctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const b = await bctx.newPage();
b.on('pageerror', (e) => console.log('Bob PAGEERR', e.message));
await b.goto(m[0], { waitUntil: 'load' });
await b.waitForURL(/\/table\//, { timeout: 20000 });
await b.waitForTimeout(2500);
await b.screenshot({ path: `${OUT}/inv-new-1.png` });
await b.getByRole('button', { name: /join|take|sit/i }).first().click();
await b.getByRole('button', { name: /create my account/i }).click();
await b.getByRole('button', { name: /^skip$/i }).click({ timeout: 15000 });
await b.getByLabel(/your player name/i).fill('Newbie');
await b.getByLabel(/18 or older/i).check();
await b.getByRole('checkbox').nth(1).check();
await b.screenshot({ path: `${OUT}/inv-new-2.png` });
await b.getByRole('button', { name: /take my seat/i }).click();
await b.waitForTimeout(4000);
await b.screenshot({ path: `${OUT}/inv-new-3.png` });
console.log('B URL', b.url());
console.log('B TEXT', (await b.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 300));
await browser.close();
