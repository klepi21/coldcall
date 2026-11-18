// Screenshots of admin and wallet screens (dark and light, 390 and 1440) with a temporary local admin.
//   node apps/web/e2e/admin-shots.mjs <outDir>     (needs the local API, web and Postgres)
import { chromium } from '@playwright/test';
import { execSync } from 'node:child_process';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
const OUT = process.argv[2] ?? '/tmp';
const API = 'http://localhost:4000';
const WEB = process.env.BASE ?? 'http://localhost:3000';
const EXE = process.env.PW_EXE || `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
let cookie = '';
async function api(path, body) {
  const r = await fetch(API + path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', cookie }, body: body ? JSON.stringify(body) : undefined });
  const sc = r.headers.get('set-cookie');
  if (sc) cookie = sc.split(';')[0];
  return r.json();
}
const kp = new Ed25519Keypair();
const addr = kp.toSuiAddress();
const n = await api(`/api/auth/nonce?address=${addr}`);
const { signature } = await kp.signPersonalMessage(new TextEncoder().encode(n.message));
await api('/api/auth/verify', { address: addr, nonce: n.nonce, issuedAt: n.issuedAt, signature });
await api('/api/me/onboard', { displayName: 'Admin Shot', ageConfirmed: true, termsAccepted: true });
execSync(`psql -d coldcall_devnet -qc "update users set role='admin' where wallet_address='${addr}'"`);
const browser = await chromium.launch({ executablePath: EXE });
try {
  for (const [w, h, scheme] of [[1440, 900, 'dark'], [390, 844, 'dark'], [1440, 900, 'light'], [390, 844, 'light']]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: scheme, deviceScaleFactor: w < 500 ? 2 : 1 });
    await ctx.addCookies([{ name: 'cc_sid', value: cookie.split('=')[1], url: WEB }]);
    const page = await ctx.newPage();
    await page.addInitScript((t) => localStorage.setItem('coldcall:theme', t), scheme);
    for (const [name, path] of [['admin', '/admin'], ['admin-money', '/admin/money?tab=reserve'], ['wallet', '/wallet'], ['how', '/how-it-works']]) {
      await page.goto(WEB + path, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `${OUT}/${w}-${scheme}-${name}.png`, fullPage: name !== 'how' });
    }
    await ctx.close();
  }
} finally {
  execSync(`psql -d coldcall_devnet -qc "update users set role='user' where wallet_address='${addr}'"`);
  await browser.close();
}
console.log('SHOTS OK');
