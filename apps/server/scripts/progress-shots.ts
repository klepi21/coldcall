/**
 * Screenshots for the progression UI against the running API (:4000) and web (:3000).
 * Signs up a fresh guest, plays a free practice Sea Battle game (aiming with knowledge of the bot fleet
 * from the database, so the result shows bonuses and achievements), and captures the result screen
 * and /progress at phone and desktop sizes.
 *   cd apps/server && npx tsx --env-file=.env scripts/progress-shots.ts [outDir]
 */
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import WebSocket from 'ws';
import { chromium } from '@playwright/test';
import { shipCells } from '@coldcall/games';
import { pool, one } from '../src/db/pool';

const API = 'http://localhost:4000';
const WEB = 'http://localhost:3000';
const OUT = process.argv[2] ?? '../../docs/screens';
const EXE = process.env.PW_EXE || `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let cookie = '';
async function api(path: string, body?: unknown) {
  const r = await fetch(API + path, { method: body === undefined ? 'GET' : 'POST', headers: { 'content-type': 'application/json', cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
  const sc = r.headers.get('set-cookie');
  if (sc) cookie = sc.split(';')[0]!;
  const j = await r.json();
  if (!r.ok) throw new Error(`${path} ${r.status} ${JSON.stringify(j)}`);
  return j;
}

const kp = new Ed25519Keypair();
const addr = kp.toSuiAddress();
const n = await api(`/api/auth/nonce?address=${addr}`);
const { signature } = await kp.signPersonalMessage(new TextEncoder().encode(n.message));
await api('/api/auth/verify', { address: addr, nonce: n.nonce, issuedAt: n.issuedAt, signature });
await api('/api/me/onboard', { displayName: 'Nikos', ageConfirmed: true, termsAccepted: true });
const sid = cookie.split('=')[1]!;
const LOSS = process.env.LOSS === '1';
const SCR = process.env.SCRATCH ?? '/tmp';
// 2D boards so the headless page updates live (no WebGL), proving the push path without a reload.
await fetch(API + '/api/me', { method: 'PATCH', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ settings: { render3d: false } }) });

const browser = await chromium.launch({ executablePath: EXE });
async function ctx(width: number, height: number) {
  const c = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, isMobile: width < 700, hasTouch: width < 700, colorScheme: 'dark' });
  await c.addCookies([{ name: 'cc_sid', value: sid, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
  return c;
}

const ws = new WebSocket(API.replace('http', 'ws') + '/ws', { headers: { cookie } });
await new Promise((r) => ws.on('open', r));
let state: any = null;
let result: any = null;
const progress: any[] = [];
ws.on('message', (d) => {
  const m = JSON.parse(d.toString());
  if (m.t === 'state') state = m;
  if (m.t === 'result') result = m;
  if (m.t === 'progress') progress.push(m);
});

const table = (await api('/api/tables', { game: 'seabattle', mode: 'practice', stake: 0, visibility: 'public', clientSeed: 'shots1' })).id as string;
ws.send(JSON.stringify({ t: 'watch', tableId: table }));
const phone = await ctx(390, 844);
const page = await phone.newPage();
page.on('pageerror', (e) => console.log('pageerror', String(e)));
page.on('console', (m) => m.type() === 'error' && console.log('console', m.text().slice(0, 200)));
await page.goto(`${WEB}/table/${table}`, { waitUntil: 'networkidle' });
await sleep(3000); // let the page finish its signed in socket reconnect before the game races ahead

let lastSeq = -1;
let targets: { row: number; col: number }[] | null = null;
const t0 = Date.now();
while (!result && Date.now() - t0 < 180_000) {
  if (state && state.toAct.includes(0) && state.seq !== lastSeq) {
    lastSeq = state.seq;
    if (state.view.phase === 'placing') ws.send(JSON.stringify({ t: 'move', tableId: table, move: { type: 'auto_place' }, seq: state.seq }));
    else {
      if (!targets) {
        const st = await one<any>(pool, `select state from game_states where table_id=$1`, [table]);
        const ships = st.state.fleets[1].flatMap((s: any) => shipCells(s));
        if (LOSS) {
          const taken = new Set(ships.map((c: any) => c.row * 10 + c.col));
          targets = Array.from({ length: 100 }, (_, k) => ({ row: Math.floor(k / 10), col: k % 10 })).filter((c) => !taken.has(c.row * 10 + c.col));
        } else targets = ships;
      }
      const t = targets!.shift();
      if (t) ws.send(JSON.stringify({ t: 'move', tableId: table, move: { type: 'fire', row: t.row, col: t.col }, seq: state.seq }));
    }
  }
  await sleep(60);
}
console.log('result', result?.result);
await sleep(4500);
console.log('page saw result live:', await page.getByText(/you won|good game/i).count(), 'xp block live:', await page.getByText(/see your progress/i).count());
if (LOSS) {
  await page.screenshot({ path: `${SCR}/result-loss-phone.png` });
  await fetch(API + '/api/me', { method: 'PATCH', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ settings: { theme: 'light' } }) });
  const pl = await phone.newPage();
  await pl.goto(`${WEB}/progress`, { waitUntil: 'networkidle' });
  await sleep(1500);
  await pl.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 300) (scrollTo(0, y), await new Promise((r) => setTimeout(r, 60))); scrollTo(0, 0); });
  await sleep(500);
  await pl.screenshot({ path: `${SCR}/progress-light.png`, fullPage: true });
  await browser.close();
  await pool.end();
  process.exit(0);
}
console.log('progress msg', JSON.stringify(progress[0]?.breakdown), 'level', progress[0]?.level, 'ach', progress[0]?.newAchievements?.map((a: any) => a.code));
await page.screenshot({ path: `${OUT}/result-xp-phone.png` });

await api('/api/progress/equip', { slot: 'title', id: 'admiral' });
await api('/api/progress/equip', { slot: 'frame', id: 'lime' });
const p2 = await phone.newPage();
await p2.goto(`${WEB}/progress`, { waitUntil: 'networkidle' });
await sleep(1800);
await p2.evaluate(async () => {
  for (let y = 0; y < document.body.scrollHeight; y += 300) (scrollTo(0, y), await new Promise((r) => setTimeout(r, 60)));
  scrollTo(0, 0);
});
await sleep(600);
await p2.screenshot({ path: `${OUT}/progress-phone.png`, fullPage: true });
console.log('phone overflow', await p2.evaluate(() => document.documentElement.scrollWidth - innerWidth));

const desk = await ctx(1440, 900);
const p3 = await desk.newPage();
await p3.goto(`${WEB}/progress`, { waitUntil: 'networkidle' });
await sleep(1800);
// trigger whileInView sections
await p3.evaluate(async () => {
  for (let y = 0; y < document.body.scrollHeight; y += 400) (scrollTo(0, y), await new Promise((r) => setTimeout(r, 60)));
  scrollTo(0, 0);
});
await sleep(600);
await p3.screenshot({ path: `${OUT}/progress-desktop.png`, fullPage: true });

const light = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'light' });
await light.addCookies([{ name: 'cc_sid', value: sid, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
const p4 = await light.newPage();
await p4.goto(`${WEB}/progress`, { waitUntil: 'networkidle' });
await sleep(1500);
await p4.screenshot({ path: `${process.env.SCRATCH ?? '/tmp'}/progress-phone-light.png`, fullPage: false });

console.log('table', table, 'sid', sid.slice(0, 6));
ws.close();
await browser.close();
await pool.end();
