/**
 * Sui chain layer for the Cold Call vault (Move package in /move, ids in cold_call.config.json).
 *
 * The server builds every user transaction itself, with the user as sender and the cc-game wallet as gas
 * owner. The browser only signs the bytes. When they come back, the server checks they are exactly the
 * bytes it built (see `pending` below), adds the sponsor signature and executes. Because the server
 * builds every sponsored transaction, it only ever sponsors three calls into this package: the LOFI
 * faucet claim, a vault deposit and a vault withdraw. It never sponsors anything that touches `tx.gas`.
 */
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { z } from 'zod';
import { bcs } from '@mysten/sui/bcs';
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction, coinWithBalance } from '@mysten/sui/transactions';
import { fromBase64, toBase64, normalizeSuiAddress } from '@mysten/sui/utils';
import type { Currency } from '@coldcall/shared';
import { env } from '../env';

export const CLOCK = '0x6';

const AddrZ = z.string().regex(/^0x[0-9a-f]{64}$/);
const ConfigZ = z.object({
  network: z.string(),
  rpc: z.string().url(),
  packageId: AddrZ,
  faucetId: AddrZ,
  lofiType: z.string(),
  suiType: z.string(),
  vaults: z.object({ SUI: z.object({ id: AddrZ }), LOFI: z.object({ id: AddrZ }) }),
  gameAddress: AddrZ,
  adminAddress: AddrZ,
  gamePubkeyHex: z.string().regex(/^[0-9a-f]{64}$/),
});
export type ChainConfig = z.infer<typeof ConfigZ>;

let cfg: ChainConfig | null = null;
export function chainConfig(): ChainConfig {
  if (!cfg) {
    if (!existsSync(env.COLD_CALL_CONFIG)) throw new Error(`Missing ${env.COLD_CALL_CONFIG}. Publish the Move package first (move/scripts/publish.sh).`);
    cfg = ConfigZ.parse(JSON.parse(readFileSync(env.COLD_CALL_CONFIG, 'utf8')));
  }
  return cfg;
}

export const client = new SuiGrpcClient({ network: env.SUI_NETWORK as 'devnet', baseUrl: env.SUI_RPC });

let game: Ed25519Keypair | null = null;
/** cc-game: gas sponsor, ticket signer and sender of "Get test SUI". */
export function gameKeypair(): Ed25519Keypair {
  if (!game) {
    if (!env.CC_GAME_KEY) throw new Error('CC_GAME_KEY is not set');
    game = Ed25519Keypair.fromSecretKey(env.CC_GAME_KEY);
    const c = chainConfig();
    if (game.toSuiAddress() !== c.gameAddress) throw new Error('CC_GAME_KEY does not match gameAddress in the config');
    if (Buffer.from(game.getPublicKey().toRawBytes()).toString('hex') !== c.gamePubkeyHex) throw new Error('CC_GAME_KEY does not match the vault ticket key');
  }
  return game;
}

export const coinType = (c: Currency) => (c === 'SUI' ? chainConfig().suiType : chainConfig().lofiType);
export const vaultId = (c: Currency) => chainConfig().vaults[c].id;
export const isSuiAddress = (a: string) => /^0x[0-9a-f]{64}$/.test(a);
export const normAddr = (a: string) => normalizeSuiAddress(a);

/** Which currency a vault object id belongs to, or null if it is not ours. */
export function currencyOfVault(id: string): Currency | null {
  const c = chainConfig();
  const n = normAddr(id);
  if (n === c.vaults.LOFI.id) return 'LOFI';
  if (n === c.vaults.SUI.id) return 'SUI';
  return null;
}

// ---------- withdrawal tickets ----------

const Ticket = bcs.struct('Ticket', {
  vault: bcs.Address,
  recipient: bcs.Address,
  amount: bcs.u64(),
  nonce: bcs.u64(),
  expiry_ms: bcs.u64(),
});

/** The exact 88 bytes `vault::ticket_message` builds on chain. */
export function ticketMessage(t: { currency: Currency; recipient: string; amountBase: bigint; nonce: bigint; expiryMs: bigint }): Uint8Array {
  const bytes = Ticket.serialize({ vault: vaultId(t.currency), recipient: t.recipient, amount: t.amountBase, nonce: t.nonce, expiry_ms: t.expiryMs }).toBytes();
  if (bytes.length !== 88) throw new Error('ticket must be 88 bytes');
  return bytes;
}

/** Raw 64 byte Ed25519 signature (no intent, no hash), hex encoded. */
export async function signTicket(t: Parameters<typeof ticketMessage>[0]): Promise<string> {
  const sig = await gameKeypair().sign(ticketMessage(t));
  return Buffer.from(sig).toString('hex');
}

// ---------- sponsored transactions ----------

export type SponsoredKind = 'deposit' | 'withdraw' | 'faucet';
interface Pending {
  userId: string;
  sender: string;
  kind: SponsoredKind;
  meta: Record<string, unknown>;
  expires: number;
}
/** sha256(bytes) -> what the server built. Only these bytes are ever sponsor signed. */
const pending = new Map<string, Pending>();
const hashBytes = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

function remember(bytes: Uint8Array, p: Omit<Pending, 'expires'>) {
  const now = Date.now();
  for (const [k, v] of pending) if (v.expires < now) pending.delete(k);
  pending.set(hashBytes(bytes), { ...p, expires: now + 10 * 60_000 });
}

async function sponsor(tx: Transaction, sender: string): Promise<Uint8Array> {
  tx.setSender(sender);
  tx.setGasOwner(chainConfig().gameAddress);
  tx.setGasBudgetIfNotSet(50_000_000n);
  return tx.build({ client });
}

export class ChainUserError extends Error {
  constructor(message: string, public code: string) {
    super(message);
  }
}

/** Turn a Move abort from build (dry run) into a plain message. */
export function explainAbort(e: unknown): ChainUserError | null {
  const msg = String((e as Error)?.message ?? e);
  const m = msg.match(/abort code: (\d+), in '(0x[0-9a-f]+)::(\w+)::(\w+)'/);
  if (!m) {
    if (/insufficient|not enough|InsufficientCoinBalance|balance/i.test(msg) && /coin|balance/i.test(msg))
      return new ChainUserError('Your wallet does not hold enough of this coin for that amount.', 'wallet_insufficient');
    return null;
  }
  const [, code, , mod] = m;
  const k = `${mod}:${code}`;
  const known: Record<string, [string, string]> = {
    'lofi:100': ['You already got test LOFI recently. You can claim again a few hours after your last claim.', 'faucet_cooldown'],
    'vault:1': ['Adding money and cashing out are paused for a moment. Your balance is safe. Please try again later.', 'vault_paused'],
    'vault:3': ['This cash out ticket ran out of time. Ask for a new one, it only takes a tap.', 'ticket_expired'],
    'vault:4': ['This cash out already went through. Refresh your wallet.', 'ticket_used'],
    'vault:6': ['The vault cannot pay this right now. Your balance is safe. We have been told.', 'vault_low'],
  };
  const hit = known[k];
  return hit ? new ChainUserError(hit[0], hit[1]) : new ChainUserError('The network refused this transaction. Nothing moved. Please try again.', 'move_abort');
}

async function buildOrExplain(tx: Transaction, sender: string) {
  try {
    return await sponsor(tx, sender);
  } catch (e) {
    throw explainAbort(e) ?? e;
  }
}

/** Sponsored deposit: takes the amount from the user's own coins (never from the sponsor's gas). */
export async function buildDeposit(userId: string, sender: string, currency: Currency, amountBase: bigint) {
  const c = chainConfig();
  const tx = new Transaction();
  const coin = tx.add(coinWithBalance({ type: coinType(currency), balance: amountBase, useGasCoin: false }));
  tx.moveCall({ target: `${c.packageId}::vault::deposit`, typeArguments: [coinType(currency)], arguments: [tx.object(vaultId(currency)), coin] });
  const bytes = await buildOrExplain(tx, sender);
  remember(bytes, { userId, sender, kind: 'deposit', meta: { currency, amountBase: amountBase.toString() } });
  return toBase64(bytes);
}

/** Sponsored LOFI faucet claim (1,000 LOFI, once per cooldown, enforced by the contract). */
export async function buildFaucetClaim(userId: string, sender: string) {
  const c = chainConfig();
  const tx = new Transaction();
  tx.moveCall({ target: `${c.packageId}::lofi::claim`, arguments: [tx.object(c.faucetId), tx.object(CLOCK)] });
  const bytes = await buildOrExplain(tx, sender);
  remember(bytes, { userId, sender, kind: 'faucet', meta: { currency: 'LOFI' } });
  return toBase64(bytes);
}

/** Sponsored withdraw with a server signed ticket. The coins go to the sender, who must be the recipient. */
export async function buildWithdraw(
  userId: string,
  sender: string,
  t: { currency: Currency; amountBase: bigint; nonce: bigint; expiryMs: bigint; sigHex: string; withdrawalId: string },
) {
  const c = chainConfig();
  const tx = new Transaction();
  tx.moveCall({
    target: `${c.packageId}::vault::withdraw`,
    typeArguments: [coinType(t.currency)],
    arguments: [
      tx.object(vaultId(t.currency)),
      tx.pure.u64(t.amountBase),
      tx.pure.u64(t.nonce),
      tx.pure.u64(t.expiryMs),
      tx.pure.vector('u8', Array.from(Buffer.from(t.sigHex, 'hex'))),
      tx.object(CLOCK),
    ],
  });
  const bytes = await buildOrExplain(tx, sender);
  remember(bytes, { userId, sender, kind: 'withdraw', meta: { currency: t.currency, withdrawalId: t.withdrawalId, nonce: t.nonce.toString() } });
  return toBase64(bytes);
}

export interface VaultEvent {
  type: 'Deposited' | 'Withdrawn' | 'Funded' | 'AdminWithdrawn' | 'Other';
  digest: string;
  eventSeq: number;
  currency: Currency | null;
  user: string | null; // Deposited.user, Withdrawn.user, Funded.from, AdminWithdrawn.to
  amountBase: bigint;
  nonce: bigint | null;
  checkpoint: number | null;
}

function parseEvent(e: any, digest: string, idx: number, checkpoint: number | null): VaultEvent | null {
  const c = chainConfig();
  const type: string = e.eventType ?? e.type ?? '';
  if (!type.startsWith(`${c.packageId}::vault::`)) return null;
  const name = type.slice(`${c.packageId}::vault::`.length);
  const j = e.json ?? {};
  const kind = (['Deposited', 'Withdrawn', 'Funded', 'AdminWithdrawn'].includes(name) ? name : 'Other') as VaultEvent['type'];
  const who = j.user ?? j.from ?? j.to ?? null;
  return {
    type: kind,
    digest,
    eventSeq: idx,
    currency: j.vault ? currencyOfVault(j.vault) : null,
    user: who ? normAddr(who) : null,
    amountBase: j.amount !== undefined ? BigInt(j.amount) : 0n,
    nonce: j.nonce !== undefined ? BigInt(j.nonce) : null,
    checkpoint,
  };
}

/** Executes bytes the server built, after the user signed them. Returns the vault events read from the result. */
export async function executeSponsored(userId: string, bytesB64: string, userSignature: string) {
  const bytes = fromBase64(bytesB64);
  const key = hashBytes(bytes);
  const p = pending.get(key);
  if (!p || p.userId !== userId || p.expires < Date.now())
    throw new ChainUserError('This request is too old or was not made here. Please start again.', 'unknown_tx');
  const { signature: sponsorSig } = await gameKeypair().signTransaction(bytes);
  const r: any = await client.executeTransaction({ transaction: bytes, signatures: [userSignature, sponsorSig], include: { effects: true, events: true } });
  pending.delete(key);
  if (r.$kind !== 'Transaction') {
    const err = JSON.stringify(r.FailedTransaction?.status?.error ?? r.FailedTransaction?.status ?? 'failed');
    throw explainAbort(new Error(err)) ?? new ChainUserError('The network did not accept this transaction. Nothing moved.', 'tx_failed');
  }
  const t = r.Transaction;
  await client.waitForTransaction({ digest: t.digest }).catch(() => {});
  const events = (t.events ?? []).map((e: any, i: number) => parseEvent(e, t.digest, i, null)).filter(Boolean) as VaultEvent[];
  return { digest: t.digest as string, kind: p.kind, meta: p.meta, sender: p.sender, events };
}

/** Vault events of one transaction, read from the chain (never from the client). */
export async function transactionVaultEvents(digest: string): Promise<VaultEvent[] | null> {
  try {
    const r: any = await client.getTransaction({ digest, include: { events: true, effects: true } });
    const t = r.Transaction ?? r.transaction ?? r;
    if (r.$kind && r.$kind !== 'Transaction') return [];
    return (t.events ?? []).map((e: any, i: number) => parseEvent(e, digest, i, null)).filter(Boolean) as VaultEvent[];
  } catch {
    return null;
  }
}

/** Backup scanner: every vault event after `cursor`, oldest first. */
export async function listVaultEvents(cursor: string | null, limit = 50) {
  const c = chainConfig();
  const r: any = await client.listEvents({ filter: { emitModule: `${c.packageId}::vault` }, limit, after: cursor ?? undefined } as any);
  const events = (r.events as any[])
    .map((e) => parseEvent(e, e.transactionDigest, Number(e.eventIndex), e.checkpoint ? Number(e.checkpoint) : null))
    .filter(Boolean) as VaultEvent[];
  return { events, cursor: (r.endCursor as string | null) ?? cursor, more: !!r.hasNextPage };
}

export async function vaultBalanceBase(currency: Currency): Promise<bigint> {
  const r: any = await client.getObjects({ objectIds: [vaultId(currency)], include: { json: true } } as any);
  const o = r.objects?.[0];
  if (!o || o instanceof Error || !o.json) throw new Error(`vault ${currency} not readable`);
  return BigInt(o.json.balance);
}

/** Has this ticket nonce been used on chain? Reads `vault::is_used` through a dry run. */
export async function isNonceUsed(currency: Currency, nonce: bigint): Promise<boolean> {
  const c = chainConfig();
  const tx = new Transaction();
  tx.setSender(c.gameAddress);
  tx.moveCall({ target: `${c.packageId}::vault::is_used`, typeArguments: [coinType(currency)], arguments: [tx.object(vaultId(currency)), tx.pure.u64(nonce)] });
  const r: any = await client.simulateTransaction({ transaction: tx, include: { commandResults: true }, checksEnabled: false } as any);
  const out = r.commandResults?.[0]?.returnValues?.[0]?.bcs as Uint8Array | undefined;
  if (!out) throw new Error('is_used: no return value');
  return out[0] === 1;
}

/** Coins of this type in a wallet (base units), coin objects plus address balance. */
export async function walletBalanceBase(owner: string, currency: Currency): Promise<bigint> {
  const r: any = await client.getBalance({ owner, coinType: coinType(currency) });
  return BigInt(r.balance?.balance ?? 0);
}

/** Next time the faucet lets this address claim (ms, 0 = now). */
export async function nextFaucetClaimMs(owner: string): Promise<number> {
  const c = chainConfig();
  const tx = new Transaction();
  tx.setSender(c.gameAddress);
  tx.moveCall({ target: `${c.packageId}::lofi::next_claim_ms`, arguments: [tx.object(c.faucetId), tx.pure.address(owner)] });
  const r: any = await client.simulateTransaction({ transaction: tx, include: { commandResults: true }, checksEnabled: false } as any);
  const out = r.commandResults?.[0]?.returnValues?.[0]?.bcs as Uint8Array | undefined;
  return out ? Number(bcs.u64().parse(out)) : 0;
}

let gameLock: Promise<unknown> = Promise.resolve();
/** Transactions the game wallet sends on its own run one at a time. */
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const p = gameLock.then(fn, fn);
  gameLock = p.catch(() => {});
  return p;
}

/** "Get test SUI": the game wallet sends a small SUI coin, so the player can then add SUI. */
export function sendTestSui(to: string, amountBase: bigint) {
  return serial(async () => {
    const g = gameKeypair();
    const have = await walletBalanceBase(g.toSuiAddress(), 'SUI');
    if (have < amountBase + env.SUI_DRIP_FLOOR_BASE) throw new ChainUserError('Test SUI has run out for now. Please try again later.', 'drip_empty');
    const tx = new Transaction();
    tx.setSender(g.toSuiAddress());
    tx.transferObjects([coinWithBalance({ balance: amountBase })], to);
    const r: any = await client.signAndExecuteTransaction({ transaction: tx, signer: g, include: { effects: true } });
    if (r.$kind !== 'Transaction') throw new ChainUserError('Sending test SUI did not work. Please try again.', 'drip_failed');
    await client.waitForTransaction({ digest: r.Transaction.digest }).catch(() => {});
    return r.Transaction.digest as string;
  });
}

export const suiscan = (kind: 'tx' | 'account' | 'object', id: string) => `https://suiscan.xyz/${env.SUI_NETWORK}/${kind}/${id}`;
