// Mobile responsive audit against the live site.
// node apps/web/e2e/mobile-audit.mjs <outDir> [width]
import { chromium } from '@playwright/test';
const OUT = process.argv[2] ?? '/tmp';
const W = +(process.argv[3] ?? 390);
const BASE = process.env.BASE ?? 'http://localhost:3000';
const EXE = process.env.PW_EXE || `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const browser = await chromium.launch({ executablePath: EXE });
const ctx = await browser.newContext({ viewport: { width: W, height: +(process.env.H ?? (W < 380 ? 667 : 844)) }, deviceScaleFactor: 2, isMobile: W < 700, hasTouch: W < 700, colorScheme: 'dark' });
const page = await ctx.newPage();
const audit = async (name) => {
  await page.waitForTimeout(1500);
  const r = await page.evaluate(() => {
    const vw = innerWidth; const out = [];
    for (const el of document.querySelectorAll('body *')) {
      const b = el.getBoundingClientRect();
      if (b.width === 0 || b.height === 0) continue;
      const cs = getComputedStyle(el);
      if (cs.position === 'fixed' && b.right <= vw + 1) continue;
      if (b.right > vw + 1 || b.left < -1) {
        let p = el.parentElement, clipped = false;
        while (p) { const o = getComputedStyle(p).overflowX; if (o === 'hidden' || o === 'auto' || o === 'scroll' || o === 'clip') { clipped = true; break; } p = p.parentElement; }
        if (!clipped) out.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)} [${Math.round(b.left)}..${Math.round(b.right)}] "${(el.textContent || '').trim().slice(0, 30)}"`);
      }
    }
    const small = [];
    for (const el of document.querySelectorAll('button, a, [role=button], input, select')) {
      const b = el.getBoundingClientRect();
      if (b.width && b.height && (b.width < 40 || b.height < 40)) small.push(`${el.tagName.toLowerCase()} ${Math.round(b.width)}x${Math.round(b.height)} "${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 25)}"`);
    }
    return { overflow: document.documentElement.scrollWidth - vw, out: out.slice(0, 12), small: small.slice(0, 15) };
  });
  await page.screenshot({ path: `${OUT}/${W}-${name}.png` }); await page.evaluate(() => scrollTo(0, document.body.scrollHeight)); await page.waitForTimeout(400); await page.screenshot({ path: `${OUT}/${W}-${name}-end.png` }); await page.evaluate(() => scrollTo(0, 0));
  console.log(`\n== ${name} overflow=${r.overflow}`);
  r.out.forEach((x) => console.log('  OUT', x));
  r.small.forEach((x) => console.log('  SMALL', x));
};
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
await audit('landing');
await page.getByRole('button', { name: /play free now/i }).first().click();
await page.waitForTimeout(800);
await audit('signin');
await page.getByRole('button', { name: /create my account/i }).click();
await page.waitForTimeout(800);
await audit('onboarding');
await page.getByRole('button', { name: /^skip$/i }).click();
await page.getByLabel(/your player name/i).fill('Mobi' + Math.floor(Math.random() * 1000));
await page.getByLabel(/18 or older/i).check();
await page.getByRole('checkbox').nth(1).check();
await page.getByRole('button', { name: /start my free practice game/i }).click();
await page.waitForURL(/\/(play|table)/);
await audit('after-onboarding');
for (const r of ['play', 'wallet', 'history', 'profile', 'progress', 'how-it-works', 'rules/chess', 'rules/tichu']) {
  await page.goto(`${BASE}/${r}`, { waitUntil: 'networkidle' });
  await audit(r.replace('/', '-'));
}
for (const game of ['Chess', 'Backgammon', 'Tichu', 'Ice Floe Battle']) {
  await page.goto(`${BASE}/play`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: `Play ${game}` }).click();
  await page.waitForTimeout(600);
  await audit(`setup-${game}`);
  const d = page.getByRole('dialog');
  const pr = d.getByRole('radio', { name: /practice/i });
  if (await pr.count()) await pr.first().click();
  await d.getByRole('button', { name: /start/i }).first().click();
  await page.waitForURL(/\/table\//, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(4000);
  await audit(`table-${game}`);
  const menu = page.getByRole('button', { name: /^menu$/i });
  if (await menu.count()) { await menu.click(); await page.waitForTimeout(500); await audit(`menu-${game}`); }
}
await browser.close();
