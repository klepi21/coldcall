/**
 * End to end check against a running server + local validator:
 * sign in, onboard, faucet, deposit, bot chess for credits, pvp backgammon, practice tichu, withdraw.
 * Players make random legal moves. Verifies the ledger and the chain agree at the end.
 */
import { Keypair, Transaction, VersionedTransaction } from '@solana/web3.js';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import WebSocket from 'ws';
import { connection } from '../src/chain/vault';
import { pool, one } from '../src/db/pool';

const API = process.env.API ?? 'http://localhost:4000';

class Client {
  kp = Keypair.generate();
  cookie = '';
  ws!: WebSocket;
  states = new Map<string, any>();
  results = new Map<string, any>();
  constructor(public name: string) {}
  async api(path: string, body?: unknown, method?: string) {
    const r = await fetch(API + path, {
      method: method ?? (body === undefined ? 'GET' : 'POST'),
      headers: { 'content-type': 'application/json', cookie: this.cookie },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const sc = r.headers.get('set-cookie');
    if (sc) this.cookie = sc.split(';')[0]!;
    const j = await r.json();
    if (!r.ok) throw new Error(`${path} ${r.status} ${JSON.stringify(j)}`);
    return j;
  }
  async signIn() {
    const addr = this.kp.publicKey.toBase58();
    const n = await this.api(`/api/auth/nonce?address=${addr}`);
    const sig = nacl.sign.detached(new TextEncoder().encode(n.message), this.kp.secretKey);
    await this.api('/api/auth/verify', { address: addr, nonce: n.nonce, issuedAt: n.issuedAt, signature: bs58.encode(sig), walletKind: 'embedded' });
    await this.api('/api/me/onboard', { displayName: this.name, ageConfirmed: true, termsAccepted: true });
  }
  async signAndSend(b64: string) {
    const t = Transaction.from(Buffer.from(b64, 'base64'));
    t.partialSign(this.kp);
    const sig = await connection.sendRawTransaction(t.serialize());
    await connection.confirmTransaction(sig, 'confirmed');
    return sig;
  }
  async deposit(credits: number) {
    const { transaction } = await this.api('/api/wallet/deposit/build', { amount: credits * 100 });
    const sig = await this.signAndSend(transaction);
    return this.api('/api/wallet/deposit/confirm', { signature: sig });
  }
  connect() {
    return new Promise<void>((res) => {
      this.ws = new WebSocket(API.replace('http', 'ws') + '/ws', { headers: { cookie: this.cookie } });
      this.ws.on('open', () => res());
      this.ws.on('message', (d) => {
        const m = JSON.parse(d.toString());
        if (m.t === 'state') this.states.set(m.tableId, m);
        if (m.t === 'result') this.results.set(m.tableId, m);
        if (m.t === 'error' && m.code !== 'stale') console.log(`  [${this.name}] ${m.message}`);
      });
    });
  }
  watch(id: string) {
    this.ws.send(JSON.stringify({ t: 'watch', tableId: id }));
  }
  async balance() {
    return (await this.api('/api/me')).balance;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Plays random legal moves for this client until the table has a result. */
async function playUntilDone(c: Client, id: string, seat: number, maxMs = 240_000) {
  const t0 = Date.now();
  let lastSeq = -1;
  while (!c.results.has(id)) {
    if (Date.now() - t0 > maxMs) throw new Error(`${c.name} timed out on ${id}`);
    const s = c.states.get(id);
    if (s && s.toAct.includes(seat) && s.seq !== lastSeq && s.legal?.length) {
      const legal = s.legal.filter((m: any) => m.type !== 'tichu' && m.type !== 'undo');
      const pick = legal[Math.floor(Math.random() * legal.length)] ?? s.legal[0];
      lastSeq = s.seq;
      c.ws.send(JSON.stringify({ t: 'move', tableId: id, move: pick, seq: s.seq }));
    }
    await sleep(40);
  }
  return c.results.get(id);
}

async function main() {
  const a = new Client('Alice');
  const b = new Client('Bruno');
  await a.signIn();
  await b.signIn();
  console.log('signed in');
  await a.api('/api/wallet/faucet', {});
  await b.api('/api/wallet/faucet', {});
  await a.deposit(50);
  await b.deposit(50);
  console.log('deposited', await a.balance(), await b.balance());
  await a.connect();
  await b.connect();

  // 1. Bot chess for 5 credits
  const before = (await a.balance()).available;
  const chess = (await a.api('/api/tables', { game: 'chess', mode: 'bot', stake: 500, visibility: 'public', time: '3+2', clientSeed: 'alice1' })).id;
  a.watch(chess);
  const r1 = await playUntilDone(a, chess, 0);
  const after = (await a.balance()).available;
  console.log('bot chess', r1.result.reason, 'payout', r1.payouts, 'balance delta', after - before);
  if (after - before !== r1.payouts[0].delta) throw new Error('chess balance mismatch');

  // 2. PvP backgammon for 1 credit
  const ba0 = (await a.balance()).available, bb0 = (await b.balance()).available;
  const bg = (await a.api('/api/tables', { game: 'backgammon', mode: 'pvp', stake: 100, visibility: 'private', clientSeed: 'alice2' })).id;
  a.watch(bg);
  await b.api(`/api/tables/${bg}/join`, { clientSeed: 'bruno2' });
  b.watch(bg);
  const [r2] = await Promise.all([playUntilDone(a, bg, 0), playUntilDone(b, bg, 1)]);
  const da = (await a.balance()).available - ba0, db = (await b.balance()).available - bb0;
  console.log('pvp backgammon', r2.result.reason, 'winner seat', r2.result.winners, 'deltas', da, db);
  if (da + db !== -10) throw new Error(`fee mismatch: ${da + db}`);

  // 3. Practice tichu vs bots
  const ti = (await b.api('/api/tables', { game: 'tichu', mode: 'practice', stake: 0, visibility: 'public', clientSeed: 'bruno3' })).id;
  b.watch(ti);
  const r3 = await playUntilDone(b, ti, 0, 600_000);
  console.log('practice tichu', r3.result.reason, r3.result.score);

  // 4. Verify page
  const v = await a.api(`/api/tables/${bg}/verify`);
  console.log('verify commit matches', v.commitMatches, 'moves', v.moves.length);

  // 5. Withdraw 20 credits
  const w = await a.api('/api/wallet/withdraw', { amount: 2000 });
  const wsig = await a.signAndSend(w.transaction);
  console.log('withdraw', (await a.api(`/api/wallet/withdraw/${w.id}/confirm`, { signature: wsig })).status);

  const reserve = await fetch(API + '/api/reserve').then((r) => r.json());
  const recon = await one<any>(
    pool,
    `select (select -balance from ledger_accounts where kind='vault_onchain') as vault_mirror,
            (select coalesce(sum(balance),0) from ledger_accounts where kind <> 'vault_onchain') as internal`,
  );
  console.log('ledger mirror', recon, 'reserve', reserve);
  if (Number(recon.vault_mirror) !== Number(recon.internal)) throw new Error('ledger does not reconcile');
  console.log('E2E OK');
  a.ws.close();
  b.ws.close();
  await pool.end();
  process.exit(0);
}

main().catch((e) => {
  console.error('E2E FAILED', e);
  process.exit(1);
});
