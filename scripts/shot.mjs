// Usage: node scripts/shot.mjs <url> <out.png> [width] [height] [theme] [fullPage]
import { chromium } from '@playwright/test';
const [url, out, w = '390', h = '844', theme = 'dark', full = '1'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: process.env.PW_EXE || '/Users/konstantinoslepidas/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell' });
const ctx = await browser.newContext({ viewport: { width: +w, height: +h }, deviceScaleFactor: 2, isMobile: +w < 700, hasTouch: +w < 700, colorScheme: theme === 'light' ? 'light' : 'dark', reducedMotion: 'no-preference' });
const page = await ctx.newPage();
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.screenshot({ path: out, fullPage: full === '1' });
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
console.log(out, 'horizontal overflow px:', overflow);
await browser.close();
