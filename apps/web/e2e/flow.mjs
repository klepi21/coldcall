// Real browser flow against the local app (:3000) + API (:4000) on real Sui devnet, with a guest wallet.
//   node apps/web/e2e/flow.mjs [outDir]
// Sign up, get test SUI and LOFI, add both, one bot game in LOFI and one in SUI (resigned), cash out both,
// check history. Screenshots of the key screens at 390 px (and 1440 px with WIDE=1).
import { chromium } from '@playwright/test';
const OUT = process.argv[2] ?? '/tmp';
const BASE = process.env.BASE ?? 'http://localhost:3000';
const WIDE = process.env.WIDE === '1';
const EXE = process.env.PW_EXE || `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const browser = await chromium.launch({ executablePath: EXE });
const ctx = await browser.newContext(
  WIDE ? { viewport: { width: 1440, height: 900 }, colorScheme: 'dark' } : { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' },
);
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && !/401|favicon|Failed to load resource/.test(m.text()) && errors.push(m.text()));
const tag = WIDE ? '1440' : '390';
const shot = async (n, full = false) => page.screenshot({ path: `${OUT}/${tag}-${n}.png`, fullPage: full });
const step = (s) => console.log('STEP', s);
const toastText = (re, timeout = 60000) => page.getByText(re).first().waitFor({ timeout });
const switchTo = async (c) => {
  await page.getByRole('radiogroup', { name: /coin to play with/i }).getByRole('radio', { name: c }).click();
  await page.waitForTimeout(800);
};

step('landing');
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
await shot('0-landing');
await page.getByRole('button', { name: /play free now/i }).first().click();
await page.getByRole('dialog').waitFor();
await page.waitForTimeout(600);
await shot('0b-auth');
await page.getByRole('button', { name: /wallet on this device/i }).click();
step('onboarding');
await page.getByRole('button', { name: /^skip$/i }).click();
await page.getByLabel(/your player name/i).fill('Tester');
await page.getByLabel(/18 or older/i).check();
await page.getByRole('checkbox').nth(1).check();
await page.getByRole('button', { name: /start my free practice game/i }).click();
await page.waitForURL(/\/play|\/table/);
await page.goto(`${BASE}/play`, { waitUntil: 'networkidle' });
await shot('1-lobby');

step('test coins');
await page.goto(`${BASE}/wallet`, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: /get test sui/i }).click();
await toastText(/test SUI are in your wallet/i);
await page.getByRole('button', { name: /get 1,000 test lofi/i }).click();
await toastText(/1,000 test LOFI are in your wallet/i);
await page.waitForTimeout(1200);
await shot('2-wallet-coins');

step('add LOFI');
await page.getByRole('button', { name: /^add lofi$/i }).first().click();
await page.getByLabel(/amount in/i).fill('200');
await page.getByRole('dialog').getByRole('button', { name: /^add lofi$/i }).click();
await toastText(/200\.00 LOFI added/i);
await page.waitForTimeout(1200);
await shot('3-wallet-lofi', true);

step('add SUI');
await switchTo('SUI');
await page.getByRole('button', { name: /^add sui$/i }).first().click();
await page.getByLabel(/amount in/i).fill('0.3');
await shot('3b-add-sui-sheet');
await page.getByRole('dialog').getByRole('button', { name: /^add sui$/i }).click();
await toastText(/0\.30 SUI added/i);
await page.waitForTimeout(1200);
await shot('4-wallet-sui', true);

for (const [cur, stakeLabel] of [['LOFI', /^10\s*LOFI$/], ['SUI', /^0\.05\s*SUI$/]]) {
  step(`bot game in ${cur}`);
  await page.goto(`${BASE}/play`, { waitUntil: 'networkidle' });
  await switchTo(cur);
  await page.getByRole('button', { name: 'Play Backgammon' }).click();
  await page.getByRole('dialog').getByRole('radio', { name: /^bot$/i }).click();
  await page.getByRole('dialog').getByRole('button', { name: stakeLabel }).click();
  await page.waitForTimeout(500);
  await shot(`5-setup-${cur}`);
  await page.getByRole('dialog').getByRole('button', { name: /start game/i }).click();
  await page.waitForURL(/\/table\//, { timeout: 20000 });
  await page.waitForTimeout(3000);
  await shot(`6-table-${cur}`);
  await page.getByRole('button', { name: /^menu$/i }).click();
  await page.getByRole('dialog', { name: 'Menu' }).getByRole('button', { name: /^resign$/i }).click();
  await page.getByRole('dialog', { name: 'Leave this game?' }).getByRole('button', { name: /^resign$/i }).click();
  await page.getByText(/good game|you won|a draw/i).first().waitFor({ timeout: 20000 });
  await page.waitForTimeout(1200);
  await shot(`7-result-${cur}`);
}

for (const [cur, amt] of [['LOFI', '50'], ['SUI', '0.1']]) {
  step(`cash out ${cur}`);
  await page.goto(`${BASE}/wallet`, { waitUntil: 'networkidle' });
  await switchTo(cur);
  await page.getByRole('button', { name: /^cash out$/i }).first().click();
  await page.getByLabel(/amount in/i).fill(amt);
  await page.getByRole('dialog').getByRole('button', { name: /^cash out$/i }).click();
  await toastText(/cashed out\./i);
  await page.waitForTimeout(1500);
  await shot(`8-after-cashout-${cur}`, true);
}

step('history');
for (const cur of ['LOFI', 'SUI']) {
  await page.goto(`${BASE}/history`, { waitUntil: 'networkidle' });
  await switchTo(cur);
  await page.waitForTimeout(800);
  await shot(`9-history-${cur}`);
}
console.log('ERRORS', JSON.stringify(errors.slice(0, 10)));
await browser.close();
console.log('FLOW OK');
