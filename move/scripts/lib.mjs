// COLD CALL Sui helpers. Self contained so the game server can copy this file as is.
// SDK: @mysten/sui 2.39.1 (gRPC client; public fullnodes no longer serve JSON-RPC).
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { bcs } from '@mysten/sui/bcs';
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { Ed25519Keypair, Ed25519PublicKey } from '@mysten/sui/keypairs/ed25519';

const here = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(here, '../..'); // ~/Desktop/coldcall
export const SECRETS = resolve(ROOT, '.secrets/devnet.env');
export const CONFIG = resolve(ROOT, 'cold_call.config.json');
export const DEFAULT_RPC = 'https://fullnode.devnet.sui.io:443';
export const CLOCK = '0x6';

// ---------------------------------------------------------------------------
// Withdrawal ticket
//
// The game server signs these exact 88 bytes with raw ed25519 (no intent prefix, no hashing):
//   [ 0..32)  vault object id   (32 bytes)
//   [32..64)  recipient address (32 bytes, must be the tx sender)
//   [64..72)  amount            u64 little endian, base units (9 decimals for SUI and LOFI)
//   [72..80)  nonce             u64 little endian, unique per vault, single use
//   [80..88)  expiry_ms         u64 little endian, valid while on-chain clock < expiry_ms
// ---------------------------------------------------------------------------
export const Ticket = bcs.struct('Ticket', {
  vault: bcs.Address,
  recipient: bcs.Address,
  amount: bcs.u64(),
  nonce: bcs.u64(),
  expiry_ms: bcs.u64(),
});

/** @returns {Uint8Array} 88 bytes */
export function ticketMessage({ vaultId, recipient, amount, nonce, expiryMs }) {
  const bytes = Ticket.serialize({
    vault: vaultId,
    recipient,
    amount: BigInt(amount),
    nonce: BigInt(nonce),
    expiry_ms: BigInt(expiryMs),
  }).toBytes();
  if (bytes.length !== 88) throw new Error('ticket must be 88 bytes');
  return bytes;
}

/** Signs a ticket with the server key. Returns the raw 64 byte signature. */
export async function signTicket(serverKeypair, ticket) {
  return serverKeypair.sign(ticketMessage(ticket));
}

/** Off-chain check of a ticket signature (same check the contract does). */
export async function verifyTicket(pubkeyHex, ticket, sig) {
  return new Ed25519PublicKey(Buffer.from(pubkeyHex, 'hex')).verify(ticketMessage(ticket), sig);
}

/** Adds a vault::withdraw call to `tx`. The sender of `tx` must be the ticket recipient. */
export function addWithdraw(tx, { packageId, coinType, vaultId, amount, nonce, expiryMs, sig }) {
  tx.moveCall({
    target: `${packageId}::vault::withdraw`,
    typeArguments: [coinType],
    arguments: [
      tx.object(vaultId),
      tx.pure.u64(BigInt(amount)),
      tx.pure.u64(BigInt(nonce)),
      tx.pure.u64(BigInt(expiryMs)),
      tx.pure.vector('u8', Array.from(sig)),
      tx.object(CLOCK),
    ],
  });
}

/** Adds a vault::deposit call. `coin` is a transaction argument holding Coin<coinType>. */
export function addDeposit(tx, { packageId, coinType, vaultId, coin }) {
  tx.moveCall({ target: `${packageId}::vault::deposit`, typeArguments: [coinType], arguments: [tx.object(vaultId), coin] });
}

// ---------------------------------------------------------------------------
// Client, keys, execution
// ---------------------------------------------------------------------------
export function loadEnv(path = SECRETS) {
  const env = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}

export function loadConfig(path = CONFIG) {
  if (!existsSync(path)) throw new Error('cold_call.config.json missing, run publish.sh first');
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function makeClient(rpc = DEFAULT_RPC) {
  return new SuiGrpcClient({ network: 'devnet', baseUrl: rpc });
}

export const keypair = (suiprivkey) => Ed25519Keypair.fromSecretKey(suiprivkey);

export const TX_INCLUDE = { effects: true, objectTypes: true, events: true, balanceChanges: true };

/** Throws if the transaction failed; returns the Transaction payload. */
export function ok(result, label = 'tx') {
  if (result.$kind !== 'Transaction') {
    const f = result.FailedTransaction;
    throw new Error(`${label} failed: ${JSON.stringify(f?.status?.error ?? f?.status ?? result)}`);
  }
  return result.Transaction;
}

/** Sign and execute with one signer (it is sender and gas owner), wait until indexed. */
export async function run(client, tx, signer, label) {
  tx.setSenderIfNotSet(signer.toSuiAddress());
  const r = await client.signAndExecuteTransaction({ transaction: tx, signer, include: TX_INCLUDE });
  const t = ok(r, label);
  await client.waitForTransaction({ digest: t.digest });
  return t;
}

/**
 * Builds a sponsored transaction: `sender` is the user, `sponsorAddress` (cc-game) pays gas.
 * Returns the bytes both parties sign. Note: a Move abort usually throws here (dry run during build).
 */
export async function buildSponsored(client, tx, senderAddress, sponsorAddress) {
  tx.setSender(senderAddress);
  tx.setGasOwner(sponsorAddress);
  return tx.build({ client });
}

/** Executes sponsored bytes with [userSig, sponsorSig]. */
export async function executeSponsored(client, bytes, userSig, sponsorSig, label) {
  const r = await client.executeTransaction({ transaction: bytes, signatures: [userSig, sponsorSig], include: TX_INCLUDE });
  const t = ok(r, label);
  await client.waitForTransaction({ digest: t.digest });
  return t;
}

/** Convenience when both keypairs are local (scripts, tests). */
export async function runSponsored(client, tx, user, sponsor, label) {
  const bytes = await buildSponsored(client, tx, user.toSuiAddress(), sponsor.toSuiAddress());
  const { signature: userSig } = await user.signTransaction(bytes);
  const { signature: sponsorSig } = await sponsor.signTransaction(bytes);
  return executeSponsored(client, bytes, userSig, sponsorSig, label);
}

/** Created object ids from a transaction, optionally filtered by a type substring. */
export function created(t, typeIncludes) {
  return t.effects.changedObjects
    .filter((o) => o.idOperation === 'Created')
    .map((o) => ({ id: o.objectId, type: t.objectTypes?.[o.objectId] ?? '' }))
    .filter((o) => !typeIncludes || o.type.includes(typeIncludes));
}

/** Events of a given type suffix (for example '::vault::Deposited') with parsed BCS-free JSON. */
export function eventsOf(t, suffix) {
  return (t.events ?? []).filter((e) => (e.eventType ?? e.type ?? '').endsWith(suffix));
}
