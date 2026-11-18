// Real browser flow against the running app + API + local chain.
// node apps/web/e2e/flow.mjs [outDir]
import { chromium } from '@playwright/test';
const OUT = process.argv[2] ?? '/tmp';
const EXE = process.env.PW_EXE || `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const browser = await chromium.launch({ executablePath: EXE });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && !/401|favicon/.test(m.text()) && errors.push(m.text()));
const shot = async (n) => page.screenshot({ path: `${OUT}/flow-${n}.png` });
const step = (s) => console.log('STEP', s);

step('landing');
await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
await page.getByRole('button', { name: /play free now/i }).click();
await page.getByRole('button', { name: /create my account/i }).click();
step('onboarding');
await page.getByRole('button', { name: /^skip$/i }).click();
await page.getByLabel(/your player name/i).fill('Testy');
await page.getByLabel(/18 or older/i).check();
await page.getByRole('checkbox').nth(1).check();
await page.getByRole('button', { name: /start my free practice game/i }).click();
await page.waitForURL(/\/play/);
await shot('1-lobby');

step('faucet and deposit');
await page.goto('http://localhost:3000/wallet', { waitUntil: 'networkidle' });
await page.getByRole('button', { name: /get 100 test usdc/i }).click();
await page.getByText(/100 test USDC are in your wallet/i).waitFor({ timeout: 30000 });
await page.waitForTimeout(800);
await page.getByRole('button', { name: /^add money$/i }).first().click();
await page.getByLabel(/amount in credits/i).fill('50');
await page.getByRole('dialog').getByRole('button', { name: /^add money$/i }).click();
await page.getByText(/50\.00 credits added/i).waitFor({ timeout: 45000 });
await shot('2-wallet');

for (const game of ['seabattle', 'chess', 'backgammon', 'tichu']) {
  step(`bot game ${game}`);
  await page.goto('http://localhost:3000/play', { waitUntil: 'networkidle' });
  const name = { seabattle: 'Sea Battle', chess: 'Chess', backgammon: 'Backgammon', tichu: 'Tichu' }[game];
  await page.getByRole('button', { name: `Play ${name}` }).click();
  await page.getByRole('dialog').getByRole('radio', { name: /^bot$/i }).click();
  await page.getByRole('dialog').getByRole('button', { name: /^1\s*\$0\.01$/ }).click();
  await shot(`3-${game}-setup`);
  await page.getByRole('dialog').getByRole('button', { name: /start game/i }).click();
  await page.waitForURL(/\/table\//, { timeout: 20000 });
  await page.waitForTimeout(3500);
  await shot(`4-${game}-table`);
  // resign through the menu to finish the game and check settlement
  await page.getByRole('button', { name: /^menu$/i }).click();
  await page.getByRole('dialog', { name: 'Menu' }).getByRole('button', { name: /^resign$/i }).click();
  await page.getByRole('dialog', { name: 'Leave this game?' }).getByRole('button', { name: /^resign$/i }).click();
  await page.getByText(/good game|you won|a draw/i).first().waitFor({ timeout: 20000 });
  await page.waitForTimeout(800);
  await shot(`5-${game}-result`);
}

step('cash out');
await page.goto('http://localhost:3000/wallet', { waitUntil: 'networkidle' });
await page.getByRole('button', { name: /^cash out$/i }).first().click();
await page.getByLabel(/amount in credits/i).fill('10');
await page.getByRole('dialog').getByRole('button', { name: /^cash out$/i }).click();
await page.getByText(/cashed out\. the money is in your wallet/i).waitFor({ timeout: 60000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/flow-7-wallet-after-cashout.png`, fullPage: true });

step('history');
await page.goto('http://localhost:3000/history', { waitUntil: 'networkidle' });
await shot('6-history');
console.log('ERRORS', JSON.stringify(errors.slice(0, 10)));
await browser.close();
console.log('FLOW OK');
