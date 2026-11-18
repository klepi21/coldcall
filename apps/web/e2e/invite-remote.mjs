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
const [a, b] = await Promise.all([player('Alice'), player('Bob')]);
await a.goto(BASE + '/play', { waitUntil: 'networkidle' });
await a.getByRole('button', { name: 'Play Chess' }).click();
await a.getByRole('dialog').getByRole('radio', { name: /^people$/i }).click();
await a.getByRole('dialog').getByRole('button', { name: /^1\s*\$0\.01$/ }).click();
await a.getByRole('dialog').getByLabel(/private table/i).check();
await a.getByRole('dialog').getByRole('button', { name: /create table/i }).click();
await a.waitForURL(/\/table\//, { timeout: 20000 });
await a.waitForTimeout(2000);
await a.screenshot({ path: `${OUT}/inv-1-alice-waiting.png` });
const html = await a.content();
const m = html.match(/https?:\/\/[^"'<\s]+\/invite\/[A-Za-z0-9_-]+/);
if (!m) { console.log('NO INVITE LINK FOUND'); console.log((await a.locator('body').innerText()).slice(0, 1500)); process.exit(1); }
console.log('INVITE', m[0]);
await b.goto(m[0], { waitUntil: 'networkidle' });
await b.waitForTimeout(2500);
await b.screenshot({ path: `${OUT}/inv-2-bob-invite.png` });
const join = b.getByRole('button', { name: /join|take the seat|sit/i }).first();
if (await join.isVisible().catch(() => false)) { await join.click(); }
const confirm = b.getByRole('dialog').getByRole('button', { name: /join|confirm|pay|sit/i }).first();
if (await confirm.isVisible().catch(() => false)) await confirm.click();
await b.waitForTimeout(5000);
await a.waitForTimeout(500);
await a.screenshot({ path: `${OUT}/inv-3-alice-game.png` });
await b.screenshot({ path: `${OUT}/inv-4-bob-game.png` });
console.log('B URL', b.url());
console.log('A TEXT', (await a.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 400));
console.log('B TEXT', (await b.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 400));
await browser.close();
