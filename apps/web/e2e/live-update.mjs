// Opens the live site, waits while a new release is deployed, then checks the tab moved to it on its own.
import { chromium } from '@playwright/test';
const BASE = 'https://45-81-6-214.sslip.io';
const b = await chromium.launch({ executablePath: `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell` });
const page = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
let errors = 0;
page.on('pageerror', () => errors++);
await page.goto(BASE + '/how-it-works', { waitUntil: 'load' });
const before = await page.evaluate(async () => (await (await fetch('/version.json')).json()).build);
await page.evaluate(() => (window.__oldTab = true));
console.log('tab opened on build', before);
// wait until the server reports a new build (deploy running in parallel)
for (let i = 0; i < 120; i++) {
  const now = await page.evaluate(async () => { try { return (await (await fetch('/version.json', { cache: 'no-store' })).json()).build; } catch { return null; } });
  if (now && now !== before) { console.log('server now on', now, 'after', i * 5, 's'); break; }
  await page.waitForTimeout(5000);
}
await page.waitForTimeout(65000); // the watcher checks every minute
// a normal in-app navigation should now land on the new version
console.log('tab noticed update:', await page.evaluate(() => document.documentElement.dataset.update ?? 'no'));
await page.locator('a[href="/wallet"]:visible').first().click();
await page.waitForTimeout(6000);
const still = await page.evaluate(() => !!window.__oldTab);
console.log(still ? 'TAB DID NOT RELOAD' : 'TAB SWITCHED TO NEW RELEASE', 'page errors:', errors);
await b.close();
