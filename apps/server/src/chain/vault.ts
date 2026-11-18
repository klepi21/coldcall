import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  Ed25519Program,
  LAMPORTS_PER_SOL,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getAccount,
} from '@solana/spl-token';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { env } from '../env';

export const PROGRAM_ID = new PublicKey(env.PROGRAM_ID);
/**
 * Public RPC endpoints drop connections now and then ("fetch failed"). Retry network errors and
 * 429/5xx with backoff. Safe for sendTransaction too: a resent signed transaction has the same
 * signature and lands at most once.
 */
const retryingFetch: typeof fetch = async (input, init) => {
  let last: unknown;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const r = await fetch(input, { ...init, signal: AbortSignal.timeout(10_000) });
      if (r.status !== 429 && r.status < 500) return r;
      last = new Error(`RPC HTTP ${r.status}`);
    } catch (e) {
      last = e;
    }
    await new Promise((res) => setTimeout(res, 250 * 2 ** attempt));
  }
  throw last;
};
export const connection = new Connection(env.SOLANA_RPC, { commitment: 'confirmed', fetch: retryingFetch, disableRetryOnRateLimit: true });

export function loadKeypair(path: string): Keypair {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path, 'utf8'))));
}

export const disc = (name: string) => createHash('sha256').update(`global:${name}`).digest().subarray(0, 8);
export const eventDisc = (name: string) => createHash('sha256').update(`event:${name}`).digest().subarray(0, 8);

export const configPda = () => PublicKey.findProgramAddressSync([Buffer.from('config')], PROGRAM_ID)[0];
export const vaultPda = () => PublicKey.findProgramAddressSync([Buffer.from('vault')], PROGRAM_ID)[0];
export const noncePda = (user: PublicKey, nonce: bigint) => {
  const n = Buffer.alloc(8);
  n.writeBigUInt64LE(nonce);
  return PublicKey.findProgramAddressSync([Buffer.from('nonce'), user.toBuffer(), n], PROGRAM_ID)[0];
};

export interface ChainConfig {
  cluster: string;
  programId: string;
  mint: string;
  config: string;
  vault: string;
  serverSigner: string;
  admin: string;
}

export function chainConfig(): ChainConfig {
  if (!existsSync(env.CHAIN_CONFIG)) throw new Error(`Missing ${env.CHAIN_CONFIG}. Run pnpm chain:setup first.`);
  return JSON.parse(readFileSync(env.CHAIN_CONFIG, 'utf8'));
}

const u64 = (n: bigint) => {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(n);
  return b;
};
const i64 = (n: bigint) => {
  const b = Buffer.alloc(8);
  b.writeBigInt64LE(n);
  return b;
};

/** Must match `ticket_message` in programs/evens_vault/src/lib.rs exactly. */
export function ticketMessage(user: PublicKey, mint: PublicKey, amount: bigint, nonce: bigint, expiry: bigint): Buffer {
  return Buffer.concat([
    Buffer.from('EVENS_WITHDRAW_V1'),
    PROGRAM_ID.toBuffer(),
    configPda().toBuffer(),
    user.toBuffer(),
    mint.toBuffer(),
    u64(amount),
    u64(nonce),
    i64(expiry),
  ]);
}

/** Signer abstraction so a KMS can replace the local key file in production. */
export interface TicketSigner {
  publicKey: PublicKey;
  sign(message: Uint8Array): Promise<Uint8Array>;
}
let signer: TicketSigner | null = null;
export function ticketSigner(): TicketSigner {
  if (!signer) {
    const kp = loadKeypair(env.SERVER_SIGNER_KEY);
    signer = { publicKey: kp.publicKey, sign: async (m) => nacl.sign.detached(m, kp.secretKey) };
  }
  return signer;
}

export async function signTicket(user: PublicKey, amountBase: bigint, nonce: bigint, expiry: bigint) {
  const cfg = chainConfig();
  const msg = ticketMessage(user, new PublicKey(cfg.mint), amountBase, nonce, expiry);
  const sig = await ticketSigner().sign(msg);
  return { message: msg, signature: bs58.encode(sig) };
}

/** Builds the two instructions a client needs to cash out (Ed25519 verify + withdraw). */
export function withdrawInstructions(user: PublicKey, amountBase: bigint, nonce: bigint, expiry: bigint, signatureB58: string) {
  const cfg = chainConfig();
  const mint = new PublicKey(cfg.mint);
  const msg = ticketMessage(user, mint, amountBase, nonce, expiry);
  const edIx = Ed25519Program.createInstructionWithPublicKey({
    publicKey: ticketSigner().publicKey.toBytes(),
    message: msg,
    signature: bs58.decode(signatureB58),
  });
  const data = Buffer.concat([disc('withdraw'), u64(amountBase), u64(nonce), i64(expiry)]);
  const ix = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: user, isSigner: true, isWritable: true },
      { pubkey: configPda(), isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: getAssociatedTokenAddressSync(mint, user), isSigner: false, isWritable: true },
      { pubkey: vaultPda(), isSigner: false, isWritable: true },
      { pubkey: noncePda(user, nonce), isSigner: false, isWritable: true },
      { pubkey: SYSVAR_INSTRUCTIONS_PUBKEY, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
  return [edIx, ix];
}

export function depositInstruction(user: PublicKey, amountBase: bigint) {
  const cfg = chainConfig();
  const mint = new PublicKey(cfg.mint);
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: user, isSigner: true, isWritable: true },
      { pubkey: configPda(), isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: getAssociatedTokenAddressSync(mint, user), isSigner: false, isWritable: true },
      { pubkey: vaultPda(), isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([disc('deposit'), u64(amountBase)]),
  });
}

/**
 * Verifies a deposit transaction on chain. Reads the chain, never trusts the client:
 * the tx must have succeeded, call our program's `deposit` with the claimed user as signer,
 * and the vault token balance must have grown by exactly the instruction amount.
 */
export async function verifyDeposit(signature: string): Promise<{ user: string; amountBase: bigint; slot: number } | null> {
  const tx = await connection.getTransaction(signature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
  if (!tx || tx.meta?.err) return null;
  const msg = tx.transaction.message;
  const keys = msg.getAccountKeys({ accountKeysFromLookups: tx.meta?.loadedAddresses });
  const vault = vaultPda().toBase58();
  const depositDisc = disc('deposit');
  for (const ix of msg.compiledInstructions) {
    if (!keys.get(ix.programIdIndex)?.equals(PROGRAM_ID)) continue;
    const data = Buffer.from(ix.data);
    if (data.length !== 16 || !data.subarray(0, 8).equals(depositDisc)) continue;
    const amount = data.readBigUInt64LE(8);
    const user = keys.get(ix.accountKeyIndexes[0]!)!;
    if (!msg.isAccountSigner(ix.accountKeyIndexes[0]!)) continue;
    const vaultIndex = ix.accountKeyIndexes[4]!;
    if (keys.get(vaultIndex)?.toBase58() !== vault) continue;
    const pre = tx.meta?.preTokenBalances?.find((b) => b.accountIndex === vaultIndex)?.uiTokenAmount.amount ?? '0';
    const post = tx.meta?.postTokenBalances?.find((b) => b.accountIndex === vaultIndex)?.uiTokenAmount.amount ?? '0';
    if (BigInt(post) - BigInt(pre) < amount) continue;
    return { user: user.toBase58(), amountBase: amount, slot: tx.slot };
  }
  return null;
}

/** Withdraw confirmation: tx succeeded and called withdraw with this nonce for this user. */
export async function verifyWithdraw(signature: string, user: string, nonce: bigint): Promise<boolean> {
  const tx = await connection.getTransaction(signature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
  if (!tx || tx.meta?.err) return false;
  const msg = tx.transaction.message;
  const keys = msg.getAccountKeys({ accountKeysFromLookups: tx.meta?.loadedAddresses });
  for (const ix of msg.compiledInstructions) {
    if (!keys.get(ix.programIdIndex)?.equals(PROGRAM_ID)) continue;
    const data = Buffer.from(ix.data);
    if (!data.subarray(0, 8).equals(disc('withdraw'))) continue;
    if (data.readBigUInt64LE(16) !== nonce) continue;
    if (keys.get(ix.accountKeyIndexes[0]!)?.toBase58() === user) return true;
  }
  return false;
}

export async function vaultBalanceBase(): Promise<bigint> {
  const acc = await getAccount(connection, vaultPda());
  return acc.amount;
}

export async function recentVaultSignatures(limit = 50): Promise<string[]> {
  const sigs = await connection.getSignaturesForAddress(vaultPda(), { limit });
  return sigs.filter((s) => !s.err).map((s) => s.signature);
}

/** Devnet faucet: mint test USDC to the user's ATA, and top up a little SOL for fees. */
export async function faucet(userAddress: string, tokens: number) {
  const cfg = chainConfig();
  const mintAuth = loadKeypair(env.MINT_AUTHORITY_KEY);
  const payer = loadKeypair(env.DEPLOYER_KEY);
  const user = new PublicKey(userAddress);
  const mint = new PublicKey(cfg.mint);
  const sol = await connection.getBalance(user);
  if (sol < 0.01 * LAMPORTS_PER_SOL) {
    if (env.SOLANA_CLUSTER === 'localnet') {
      const sig = await connection.requestAirdrop(user, LAMPORTS_PER_SOL);
      await connection.confirmTransaction(sig, 'confirmed');
    } else {
      await sendAndConfirmTransaction(
        connection,
        new Transaction().add(SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: user, lamports: 0.02 * LAMPORTS_PER_SOL })),
        [payer],
      );
    }
  }
  const ata = await getOrCreateAssociatedTokenAccount(connection, payer, mint, user);
  const sig = await mintTo(connection, payer, mint, ata.address, mintAuth, BigInt(tokens) * 1_000_000n);
  return { signature: sig, ata: ata.address.toBase58() };
}

export async function tokenBalanceBase(owner: string): Promise<bigint> {
  const cfg = chainConfig();
  try {
    const acc = await getAccount(connection, getAssociatedTokenAddressSync(new PublicKey(cfg.mint), new PublicKey(owner)));
    return acc.amount;
  } catch {
    return 0n;
  }
}
