// Signs up a guest on the live site, waits for the lead to grant admin, then screenshots the admin pages.
import { chromium } from '@playwright/test';
import { execSync } from 'node:child_process';
const BASE = 'https://45-81-6-214.sslip.io';
const OUT = process.argv[2] ?? '/tmp';
const b = await chromium.launch({ executablePath: `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell` });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGEERR', e.message));
await page.goto(BASE + '/', { waitUntil: 'load' });
await page.getByRole('button', { name: /play free now/i }).click();
await page.getByRole('button', { name: /create my account/i }).click();
await page.getByRole('button', { name: /^skip$/i }).click();
await page.getByLabel(/your player name/i).fill('AdminCheck');
await page.getByLabel(/18 or older/i).check();
await page.getByRole('checkbox').nth(1).check();
await page.getByRole('button', { name: /start my free practice game/i }).click();
await page.waitForURL(/\/play/);
const me = await page.evaluate(async () => (await (await fetch('/api/me')).json()).user.walletAddress);
console.log('wallet', me);
console.log(execSync(`ssh evens 'cd /opt/evens/app/apps/server && sudo -u evens ./node_modules/.bin/tsx --env-file=.env scripts/grant-admin.ts ${me}' 2>&1 | tail -2`).toString());
for (const [path, name] of [['/admin', 'overview'], ['/admin/accounts', 'accounts'], ['/admin/games', 'games'], ['/admin/money', 'money']]) {
  await page.goto(BASE + path, { waitUntil: 'load' });
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `${OUT}/live-admin-${name}.png`, fullPage: true });
  console.log(name, 'ok');
}
// revoke the temporary admin again
console.log(execSync(`ssh evens 'cd /opt/evens/app/apps/server && sudo -u evens ./node_modules/.bin/tsx --env-file=.env scripts/grant-admin.ts ${me} --revoke' 2>&1 | tail -1`).toString());
await b.close();
