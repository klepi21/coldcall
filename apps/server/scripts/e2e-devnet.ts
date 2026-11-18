/**
 * Live end to end check against the local API (:4000) on real Sui devnet, with a fresh guest wallet.
 *   cd apps/server && npx tsx --env-file=.env scripts/e2e-devnet.ts
 * Steps: sign in, get test SUI, get test LOFI, add both, a LOFI bot game and a SUI bot game (resigned,
 * so the stake goes to the house in that currency only), cash out both, check history and reserve.
 */
import WebSocket from 'ws';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { fromBase64 } from '@mysten/sui/utils';

const API = process.env.API ?? 'http://localhost:4000';
let cookie = '';
async function api(path: string, body?: unknown, method?: string) {
  const r = await fetch(API + path, {
    method: method ?? (body === undefined ? 'GET' : 'POST'),
    headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const sc = r.headers.get('set-cookie');
  if (sc) cookie = sc.split(';')[0]!;
  const j: any = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`${path} ${r.status} ${JSON.stringify(j)}`);
  return j;
}
const step = (s: string) => console.log(`\n== ${s}`);
const ok = (cond: unknown, msg: string) => {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`   PASS ${msg}`);
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const kp = new Ed25519Keypair();
const addr = kp.toSuiAddress();
async function signAndSubmit(bytes: string) {
  const { signature } = await kp.signTransaction(fromBase64(bytes));
  return api('/api/wallet/submit', { bytes, signature });
}
const bal = async () => (await api('/api/me')).balances as Record<'LOFI' | 'SUI', { available: number; locked: number }>;

step('sign in with a guest wallet');
const n = await api(`/api/auth/nonce?address=${addr}`);
const { signature } = await kp.signPersonalMessage(new TextEncoder().encode(n.message));
await api('/api/auth/verify', { address: addr, nonce: n.nonce, issuedAt: n.issuedAt, signature });
await api('/api/me/onboard', { displayName: 'Devnet Tester', ageConfirmed: true, termsAccepted: true });
ok(true, `signed in as ${addr}`);

step('get test SUI (game wallet sends a coin)');
const drip = await api('/api/wallet/faucet/sui', {});
ok(drip.digest, `test SUI sent, ${drip.amount} SUI, digest ${drip.digest}`);
let again = false;
try {
  await api('/api/wallet/faucet/sui', {});
} catch (e) {
  again = /recently/.test(String(e));
}
ok(again, 'second test SUI claim is rate limited');

step('get test LOFI (sponsored faucet claim)');
const f = await api('/api/wallet/faucet/lofi', {});
const fr = await signAndSubmit(f.bytes);
ok(fr.digest, `faucet claim digest ${fr.digest}`);
await sleep(1500);
const w0 = await api('/api/wallet?currency=LOFI');
ok(BigInt(w0.walletCoins.LOFI) === 1_000_000_000_000n, `wallet holds 1000 LOFI (${w0.walletCoins.LOFI})`);
ok(BigInt(w0.walletCoins.SUI) > 0n, `wallet holds SUI (${w0.walletCoins.SUI})`);

step('add 200 LOFI and 0.30 SUI');
const dl = await api('/api/wallet/deposit/build', { currency: 'LOFI', amount: 20_000 });
const dlr = await signAndSubmit(dl.bytes);
ok(dlr.credited === 20_000, `LOFI deposit credited 200.00 LOFI, digest ${dlr.digest}`);
const ds = await api('/api/wallet/deposit/build', { currency: 'SUI', amount: 30 });
const dsr = await signAndSubmit(ds.bytes);
ok(dsr.credited === 30, `SUI deposit credited 0.30 SUI, digest ${dsr.digest}`);
// Replaying the same confirmation never credits twice.
const again2 = await api('/api/wallet/deposit/confirm', { digest: dlr.digest });
ok(again2.credited === 0, 'confirming the same digest again credits nothing');
let b = await bal();
ok(b.LOFI.available === 20_000 && b.SUI.available === 30, `balances LOFI ${b.LOFI.available} SUI ${b.SUI.available}`);

async function botGameResign(currency: 'LOFI' | 'SUI', stake: number) {
  const { id } = await api('/api/tables', { game: 'backgammon', mode: 'bot', currency, stake, visibility: 'public', clientSeed: 'e2e' + currency });
  const sid = cookie.split('=')[1]!;
  const ws = new WebSocket(API.replace('http', 'ws') + '/ws', { headers: { cookie: `cc_sid=${sid}` } });
  await new Promise((r) => ws.once('open', r));
  const result = new Promise<any>((resolve) => ws.on('message', (raw) => {
    const m = JSON.parse(String(raw));
    if (m.t === 'result' && m.tableId === id) resolve(m);
  }));
  ws.send(JSON.stringify({ t: 'watch', tableId: id }));
  await sleep(800);
  ws.send(JSON.stringify({ t: 'resign', tableId: id }));
  const r = await Promise.race([result, sleep(20_000).then(() => null)]);
  ws.close();
  return { id, r };
}

step('bot game in LOFI (10 LOFI stake, resigned)');
const before = await bal();
const g1 = await botGameResign('LOFI', 1_000);
ok(g1.r, `LOFI game ${g1.id} settled`);
await sleep(500);
b = await bal();
ok(b.LOFI.available === before.LOFI.available - 1_000, `LOFI went down by exactly 10.00 (now ${b.LOFI.available})`);
ok(b.SUI.available === before.SUI.available, 'SUI balance untouched by the LOFI game');

step('bot game in SUI (0.05 SUI stake, resigned)');
const before2 = await bal();
const g2 = await botGameResign('SUI', 5);
ok(g2.r, `SUI game ${g2.id} settled`);
await sleep(500);
b = await bal();
ok(b.SUI.available === before2.SUI.available - 5, `SUI went down by exactly 0.05 (now ${b.SUI.available})`);
ok(b.LOFI.available === before2.LOFI.available, 'LOFI balance untouched by the SUI game');

step('a LOFI sized stake is refused at a SUI table');
let refused = false;
try {
  await api('/api/tables', { game: 'backgammon', mode: 'bot', currency: 'SUI', stake: 1_000, visibility: 'public', clientSeed: 'x' });
} catch (e) {
  refused = /biggest/.test(String(e));
}
ok(refused, 'SUI table with a 10.00 stake refused');

step('cash out 50 LOFI and 0.10 SUI');
for (const [currency, amount] of [['LOFI', 5_000], ['SUI', 10]] as const) {
  const coinsBefore = BigInt((await api(`/api/wallet?currency=${currency}`)).walletCoins[currency]);
  const w = await api('/api/wallet/withdraw', { currency, amount });
  ok(w.status === 'pending' && w.bytes, `${currency} ticket issued (${w.id})`);
  const r = await signAndSubmit(w.bytes);
  ok(r.digest, `${currency} withdraw digest ${r.digest}`);
  await sleep(1500);
  const ov = await api(`/api/wallet?currency=${currency}`);
  ok(ov.pendingWithdrawals.length === 0, `${currency} cash out confirmed`);
  ok(BigInt(ov.walletCoins[currency]) - coinsBefore === BigInt(amount) * 10_000_000n, `${currency} arrived in the wallet`);
}
b = await bal();
ok(b.LOFI.available === 20_000 - 1_000 - 5_000 && b.LOFI.locked === 0, `LOFI final ${b.LOFI.available}`);
ok(b.SUI.available === 30 - 5 - 10 && b.SUI.locked === 0, `SUI final ${b.SUI.available}`);

step('history per currency');
const hl = await api('/api/wallet?currency=LOFI');
const hs = await api('/api/wallet?currency=SUI');
ok(hl.history.every((h: any) => h.currency === 'LOFI') && hl.history.length >= 4, `LOFI history has ${hl.history.length} rows, all LOFI`);
ok(hs.history.every((h: any) => h.currency === 'SUI') && hs.history.length >= 4, `SUI history has ${hs.history.length} rows, all SUI`);
const games = await api('/api/me/history');
ok(games.some((g: any) => g.currency === 'LOFI') && games.some((g: any) => g.currency === 'SUI'), 'game history shows one LOFI and one SUI game');

step('reserve check per currency');
const res = await api('/api/reserve');
console.log(res.map((r: any) => `${r.currency} vault ${r.vault_minor} owed ${r.liabilities_minor} ok ${r.ok}`).join('\n'));
const v = await api('/api/vault');
ok(v.vaults.every((x: any) => x.backed), 'both vaults cover what is held');
console.log(`\nE2E OK for ${addr}`);
process.exit(0);
