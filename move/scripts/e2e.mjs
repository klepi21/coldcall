// End to end proof on live devnet with a fresh user holding 0 SUI. Every user tx is sponsored by cc-game.
//   node e2e.mjs
import { Transaction, coinWithBalance } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import {
  loadEnv, loadConfig, makeClient, keypair, run, runSponsored, created, signTicket, verifyTicket,
  addWithdraw, addDeposit, CLOCK,
} from './lib.mjs';

const cfg = loadConfig();
const env = loadEnv();
const client = makeClient(cfg.rpc);
const admin = keypair(env.CC_ADMIN_KEY);
const game = keypair(env.CC_GAME_KEY);
const user = new Ed25519Keypair();
const U = user.toSuiAddress();
const P = cfg.packageId;
const LOFI = cfg.lofiType, SUI = cfg.suiType;
const E9 = 10n ** 9n;

let step = 0;
const log = (...a) => console.log(`[${++step}]`, ...a);
const results = [];
const pass = (name, extra = '') => { results.push(['PASS', name]); console.log(`    PASS ${name} ${extra}`); };

/** Runs fn, expects a Move abort with `code` in `module`. Abort may surface from build() or as a failed result. */
async function expectAbort(name, module, code, fn) {
  try {
    await fn();
  } catch (e) {
    const msg = String(e?.message ?? e);
    // Format: "MoveAbort in 1st command, abort code: 100, in '0x<pkg>::lofi::claim' (instruction 44)"
    const m = msg.match(/abort code: (\d+), in '(0x[0-9a-f]+)::(\w+)::(\w+)'/);
    if (m && Number(m[1]) === code && m[2] === P && m[3] === module) {
      pass(name, `(aborted ${module}::${m[4]} code ${code})`);
      return msg;
    }
    throw new Error(`${name}: wrong error: ${msg}`);
  }
  throw new Error(`${name}: expected abort ${module}:${code} but tx succeeded`);
}

const balanceOf = async (owner, coinType) => BigInt((await client.getBalance({ owner, coinType })).balance.balance);
const ownedCoins = async (owner, coinType) => (await client.listCoins({ owner, coinType })).objects;
const parseEvents = (t, suffix) => (t.events ?? []).filter((e) => e.eventType.endsWith(suffix));
const nonceNow = () => BigInt(Date.now()) * 1000n + BigInt(Math.floor(Math.random() * 1000));

console.log('package', P);
console.log('user   ', U);

log('fresh user holds 0 SUI');
if ((await balanceOf(U, SUI)) !== 0n) throw new Error('user not empty');
pass('user starts with 0 SUI');

log('sponsored LOFI faucet claim');
{
  const tx = new Transaction();
  tx.moveCall({ target: `${P}::lofi::claim`, arguments: [tx.object(cfg.faucetId), tx.object(CLOCK)] });
  const t = await runSponsored(client, tx, user, game, 'claim');
  const ev = parseEvents(t, '::lofi::Claimed');
  const bal = await balanceOf(U, LOFI);
  if (bal !== 1000n * E9 || ev.length !== 1) throw new Error('claim: unexpected balance ' + bal);
  pass('faucet claim (sponsored)', `1000 LOFI, digest ${t.digest}`);
  if ((await balanceOf(U, SUI)) !== 0n) throw new Error('user paid gas?');
  pass('user still 0 SUI after sponsored tx');
}

log('second claim inside cooldown is rejected');
await expectAbort('faucet cooldown rejection', 'lofi', 100, async () => {
  const tx = new Transaction();
  tx.moveCall({ target: `${P}::lofi::claim`, arguments: [tx.object(cfg.faucetId), tx.object(CLOCK)] });
  await runSponsored(client, tx, user, game, 'claim2');
});

const deposits = [];
log('sponsored deposit of 100 LOFI');
{
  const [coin] = await ownedCoins(U, LOFI);
  const tx = new Transaction();
  const [part] = tx.splitCoins(tx.object(coin.objectId), [100n * E9]);
  addDeposit(tx, { packageId: P, coinType: LOFI, vaultId: cfg.vaults.LOFI.id, coin: part });
  const t = await runSponsored(client, tx, user, game, 'deposit LOFI');
  deposits.push(t);
  pass('deposit 100 LOFI (sponsored)', t.digest);
}

log('SUI deposit, option A: sponsored tx that splits 0.1 SUI from the sponsor gas');
let suiDepositMethod;
try {
  const tx = new Transaction();
  const [part] = tx.splitCoins(tx.gas, [E9 / 10n]);
  addDeposit(tx, { packageId: P, coinType: SUI, vaultId: cfg.vaults.SUI.id, coin: part });
  const t = await runSponsored(client, tx, user, game, 'deposit SUI from gas');
  deposits.push(t);
  suiDepositMethod = 'A: split from sponsor gas worked (sponsor funds the deposit, credited to the user sender!)';
  console.log('    NOTE option A succeeded:', t.digest);
} catch (e) {
  suiDepositMethod = 'A rejected: ' + String(e.message ?? e).slice(0, 300);
  console.log('    NOTE option A rejected:', String(e.message ?? e).slice(0, 300));
}

log('SUI deposit, option B: cc-game sends 0.2 SUI to the user, then sponsored deposit of 0.1 SUI from the user coin');
{
  const tx = new Transaction();
  tx.transferObjects([coinWithBalance({ balance: 2n * E9 / 10n })], U);
  const t0 = await run(client, tx, game, 'send 0.2 SUI');
  const coins = await ownedCoins(U, SUI);
  if (!coins.length) throw new Error('user has no SUI coin object after transfer ' + t0.digest);
  const tx2 = new Transaction();
  const [part] = tx2.splitCoins(tx2.object(coins[0].objectId), [E9 / 10n]);
  addDeposit(tx2, { packageId: P, coinType: SUI, vaultId: cfg.vaults.SUI.id, coin: part });
  const t = await runSponsored(client, tx2, user, game, 'deposit SUI');
  deposits.push(t);
  suiDepositMethod += ' | B: transfer 0.2 SUI coin then sponsored split+deposit worked';
  pass('deposit 0.1 SUI from user coin (sponsored)', t.digest);
}

log('read Deposited events from effects (what the game server verifies before crediting)');
for (const t of deposits) {
  const ev = parseEvents(t, '::vault::Deposited');
  if (ev.length !== 1) throw new Error('no Deposited event in ' + t.digest);
  const e = ev[0];
  const json = e.json ?? null;
  console.log('    event', t.digest, e.eventType, 'sender', e.sender, json ? JSON.stringify(json) : '(json not included)');
  if (json && json.user !== U && json.user?.toLowerCase?.() !== U) throw new Error('Deposited.user mismatch');
}
pass('Deposited events present in effects');

async function cashOut(coinType, vaultKey, amount) {
  const vaultId = cfg.vaults[vaultKey].id;
  const ticket = { vaultId, recipient: U, amount, nonce: nonceNow(), expiryMs: BigInt(Date.now() + 10 * 60_000) };
  const sig = await signTicket(game, ticket);
  if (!(await verifyTicket(cfg.gamePubkeyHex, ticket, sig))) throw new Error('local verify failed');
  const tx = new Transaction();
  addWithdraw(tx, { packageId: P, coinType, vaultId, amount, nonce: ticket.nonce, expiryMs: ticket.expiryMs, sig });
  const t = await runSponsored(client, tx, user, game, 'withdraw ' + vaultKey);
  const ev = parseEvents(t, '::vault::Withdrawn');
  if (ev.length !== 1) throw new Error('no Withdrawn event');
  return { t, ticket, sig };
}

log('server signed withdrawal of 40 LOFI (sponsored)');
const lofiBefore = await balanceOf(U, LOFI);
const w1 = await cashOut(LOFI, 'LOFI', 40n * E9);
if ((await balanceOf(U, LOFI)) - lofiBefore !== 40n * E9) throw new Error('LOFI not received');
pass('withdraw 40 LOFI', w1.t.digest);

log('server signed withdrawal of 0.05 SUI (sponsored)');
const suiBefore = await balanceOf(U, SUI);
const w2 = await cashOut(SUI, 'SUI', E9 / 20n);
if ((await balanceOf(U, SUI)) - suiBefore !== E9 / 20n) throw new Error('SUI not received (user should pay no gas)');
pass('withdraw 0.05 SUI', w2.t.digest);

log('replay of the LOFI ticket is rejected');
await expectAbort('replay rejected', 'vault', 4, async () => {
  const tx = new Transaction();
  addWithdraw(tx, { packageId: P, coinType: LOFI, vaultId: cfg.vaults.LOFI.id, amount: w1.ticket.amount, nonce: w1.ticket.nonce, expiryMs: w1.ticket.expiryMs, sig: w1.sig });
  await runSponsored(client, tx, user, game, 'replay');
});

log('expired ticket is rejected');
await expectAbort('expired ticket rejected', 'vault', 3, async () => {
  const ticket = { vaultId: cfg.vaults.LOFI.id, recipient: U, amount: 1n * E9, nonce: nonceNow(), expiryMs: BigInt(Date.now() - 60_000) };
  const sig = await signTicket(game, ticket);
  const tx = new Transaction();
  addWithdraw(tx, { packageId: P, coinType: LOFI, vaultId: ticket.vaultId, amount: ticket.amount, nonce: ticket.nonce, expiryMs: ticket.expiryMs, sig });
  await runSponsored(client, tx, user, game, 'expired');
});

log('ticket signed by a non server key is rejected');
await expectAbort('wrong signer rejected', 'vault', 5, async () => {
  const ticket = { vaultId: cfg.vaults.LOFI.id, recipient: U, amount: 1n * E9, nonce: nonceNow(), expiryMs: BigInt(Date.now() + 60_000) };
  const sig = await signTicket(user, ticket);
  const tx = new Transaction();
  addWithdraw(tx, { packageId: P, coinType: LOFI, vaultId: ticket.vaultId, amount: ticket.amount, nonce: ticket.nonce, expiryMs: ticket.expiryMs, sig });
  await runSponsored(client, tx, user, game, 'wrong signer');
});

log('pause blocks deposit');
const setPaused = async (paused) => {
  const tx = new Transaction();
  tx.moveCall({ target: `${P}::vault::set_paused`, typeArguments: [LOFI], arguments: [tx.object(cfg.adminCapId), tx.object(cfg.vaults.LOFI.id), tx.pure.bool(paused)] });
  return run(client, tx, admin, 'set_paused ' + paused);
};
await setPaused(true);
try {
  await expectAbort('pause blocks deposit', 'vault', 1, async () => {
    const [coin] = await ownedCoins(U, LOFI);
    const tx = new Transaction();
    const [part] = tx.splitCoins(tx.object(coin.objectId), [1n * E9]);
    addDeposit(tx, { packageId: P, coinType: LOFI, vaultId: cfg.vaults.LOFI.id, coin: part });
    await runSponsored(client, tx, user, game, 'deposit paused');
  });
} finally {
  await setPaused(false);
  console.log('    LOFI vault unpaused');
}

console.log('\nSUI deposit method:', suiDepositMethod);
console.log(`\nE2E OK: ${results.length} checks passed`);
