import { PublicKey, Transaction, SystemProgram } from '@solana/web3.js';
import { tokenBaseToMinor, minorToTokenBase } from '@evens/shared';
import { pool, tx, q, one, maybe } from './db/pool';
import { post, balances } from './ledger';
import {
  connection,
  verifyDeposit,
  verifyWithdraw,
  signTicket,
  withdrawInstructions,
  depositInstruction,
  recentVaultSignatures,
  vaultBalanceBase,
  noncePda,
  chainConfig,
  tokenBalanceBase,
} from './chain/vault';
import { getAssociatedTokenAddressSync, createAssociatedTokenAccountIdempotentInstruction, createTransferCheckedInstruction, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { env } from './env';
import { log } from './lib/log';
import { pushBalance, UserError } from './games/rooms';

/** Credits a verified deposit exactly once. The house admin wallet funds the bot bankroll. */
export async function creditDeposit(signature: string): Promise<{ credited: boolean; amount: number; userId?: string }> {
  const known = await maybe(pool, `select 1 from deposits where signature=$1`, [signature]);
  if (known) return { credited: false, amount: 0 };
  const d = await verifyDeposit(signature);
  if (!d) return { credited: false, amount: 0 };
  const user = await maybe<any>(pool, `select id, role from users where wallet_address=$1`, [d.user]);
  const isHouse = d.user === chainConfig().admin;
  if (!user && !isHouse) return { credited: false, amount: 0 };
  const amount = tokenBaseToMinor(d.amountBase);
  const done = await tx(async (c) => {
    const ins = await maybe(c, `insert into deposits(signature, user_id, amount_base, amount_minor, slot) values ($1,$2,$3,$4,$5) on conflict do nothing returning signature`, [
      signature,
      user?.id ?? (await houseUserId(c)),
      d.amountBase.toString(),
      amount,
      d.slot,
    ]);
    if (!ins) return false;
    const txId = await post(
      c,
      { kind: isHouse ? 'bankroll_fund' : 'deposit', key: `deposit:${signature}`, userId: isHouse ? null : user.id, memo: isHouse ? 'House bankroll deposit' : 'Added money', meta: { signature } },
      [
        { ref: { kind: 'vault_onchain' }, amount: -amount },
        { ref: isHouse ? { kind: 'house_bankroll' } : { kind: 'user_available', userId: user.id }, amount },
      ],
    );
    await q(c, `update deposits set transaction_id=$2 where signature=$1`, [signature, txId]);
    return true;
  });
  if (done && user) void pushBalance(user.id);
  return { credited: done, amount, userId: user?.id };
}

async function houseUserId(c: any): Promise<string> {
  const admin = chainConfig().admin;
  const u = await one<any>(
    c,
    `insert into users(wallet_address, display_name, role, age_confirmed_at, terms_accepted_at) values ($1,'Evens House','house', now(), now())
     on conflict (wallet_address) do update set role='house' returning id`,
    [admin],
  );
  return u.id;
}

/** Unsigned deposit transaction for the client to sign and send. */
export async function buildDeposit(userId: string, wallet: string, amountMinor: number) {
  const u = await one<any>(pool, `select limit_deposit_daily from users where id=$1`, [userId]);
  if (u.limit_deposit_daily) {
    const today = await one<{ s: number }>(pool, `select coalesce(sum(amount_minor),0)::bigint as s from deposits where user_id=$1 and created_at > now() - interval '1 day'`, [userId]);
    if (today.s + amountMinor > u.limit_deposit_daily)
      throw new UserError('This would go past your daily limit for adding money. You can change it in your profile.', 'deposit_limit', 403);
  }
  const user = new PublicKey(wallet);
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  const t = new Transaction({ feePayer: user, blockhash, lastValidBlockHeight }).add(depositInstruction(user, minorToTokenBase(amountMinor)));
  return { transaction: t.serialize({ requireAllSignatures: false }).toString('base64'), lastValidBlockHeight };
}

export async function requestWithdrawal(userId: string, wallet: string, amountMinor: number) {
  if (amountMinor < 100) throw new UserError('The smallest cash out is 1.00 credit.');
  const today = await one<{ s: number }>(
    pool,
    `select coalesce(sum(amount_minor),0)::bigint as s from withdrawals where user_id=$1 and created_at > now() - interval '1 day' and status not in ('expired','rejected')`,
    [userId],
  );
  if (today.s + amountMinor > env.WITHDRAW_USER_DAILY)
    throw new UserError(`You can cash out up to ${(env.WITHDRAW_USER_DAILY / 100).toLocaleString('en-US')} credits per day. Try a smaller amount or come back tomorrow.`, 'withdraw_limit', 403);

  const review = amountMinor > env.WITHDRAW_REVIEW_ABOVE;
  const amountBase = minorToTokenBase(amountMinor);
  const w = await tx(async (c) => {
    const nonce = (await one<{ n: string }>(c, `select nextval('withdrawal_nonce_seq')::text as n`)).n;
    const row = await one<any>(
      c,
      `insert into withdrawals(user_id, amount_minor, amount_base, nonce, expiry, status) values ($1,$2,$3,$4, now() + interval '10 minutes', $5) returning *`,
      [userId, amountMinor, amountBase.toString(), nonce, review ? 'review' : 'pending'],
    );
    await post(c, { kind: 'withdraw_lock', key: `wlock:${row.id}`, userId, memo: 'Cash out requested' }, [
      { ref: { kind: 'user_available', userId }, amount: -amountMinor },
      { ref: { kind: 'user_locked', userId }, amount: amountMinor },
    ]);
    return row;
  });
  void pushBalance(userId);
  if (review) return { id: w.id, status: 'review' as const };
  return { id: w.id, status: 'pending' as const, ...(await ticketTransaction(w, wallet)) };
}

async function ticketTransaction(w: any, wallet: string) {
  const user = new PublicKey(wallet);
  // Fresh 10 minute expiry each time a ticket is (re)issued.
  const expiry = BigInt(Math.floor(Date.now() / 1000) + 600);
  const nonce = BigInt(w.nonce);
  const amountBase = BigInt(w.amount_base);
  const { signature } = await signTicket(user, amountBase, nonce, expiry);
  await q(pool, `update withdrawals set ticket_sig=$2, expiry=to_timestamp($3), updated_at=now() where id=$1`, [w.id, signature, Number(expiry)]);
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  const t = new Transaction({ feePayer: user, blockhash, lastValidBlockHeight }).add(...withdrawInstructions(user, amountBase, nonce, expiry, signature));
  return { transaction: t.serialize({ requireAllSignatures: false }).toString('base64'), expiry: Number(expiry) };
}

/** Admin approved or user retry: issue a fresh ticket for a pending withdrawal. */
export async function reissueTicket(userId: string, wallet: string, id: string) {
  const w = await maybe<any>(pool, `select * from withdrawals where id=$1 and user_id=$2`, [id, userId]);
  if (!w || w.status !== 'pending') throw new UserError('This cash out cannot be continued.', 'bad_state', 409);
  if (await connection.getAccountInfo(noncePda(new PublicKey(wallet), BigInt(w.nonce)))) {
    throw new UserError('This cash out already went through. Refresh your wallet.', 'already_used', 409);
  }
  return ticketTransaction(w, wallet);
}

export async function confirmWithdrawal(userId: string, wallet: string, id: string, signature: string) {
  const w = await maybe<any>(pool, `select * from withdrawals where id=$1 and user_id=$2`, [id, userId]);
  if (!w) throw new UserError('Cash out not found.', 'not_found', 404);
  if (w.status === 'confirmed') return { status: 'confirmed' };
  const ok = await verifyWithdraw(signature, wallet, BigInt(w.nonce));
  if (!ok) throw new UserError('We could not find that transaction yet. Give it a few seconds and try again.', 'not_found_onchain', 409);
  await completeWithdrawal(w, signature);
  return { status: 'confirmed' };
}

async function completeWithdrawal(w: any, signature: string | null) {
  await tx(async (c) => {
    await post(c, { kind: 'withdraw_complete', key: `wdone:${w.id}`, userId: w.user_id, memo: 'Cashed out', meta: { signature } }, [
      { ref: { kind: 'user_locked', userId: w.user_id }, amount: -w.amount_minor },
      { ref: { kind: 'vault_onchain' }, amount: w.amount_minor },
    ]);
    await q(c, `update withdrawals set status='confirmed', tx_signature=coalesce($2, tx_signature), updated_at=now() where id=$1`, [w.id, signature]);
  });
  void pushBalance(w.user_id);
}

/** Expired tickets: if the nonce was never used on chain, give the credits back. */
export async function sweepWithdrawals() {
  const open = await q<any>(pool, `select w.*, u.wallet_address from withdrawals w join users u on u.id=w.user_id where w.status in ('pending','submitted') and w.expiry < now() - interval '30 seconds'`);
  for (const w of open) {
    const used = await connection.getAccountInfo(noncePda(new PublicKey(w.wallet_address), BigInt(w.nonce)));
    if (used) {
      await completeWithdrawal(w, null);
      continue;
    }
    await tx(async (c) => {
      await post(c, { kind: 'withdraw_release', key: `wrel:${w.id}`, userId: w.user_id, memo: 'Cash out not completed, credits returned' }, [
        { ref: { kind: 'user_locked', userId: w.user_id }, amount: -w.amount_minor },
        { ref: { kind: 'user_available', userId: w.user_id }, amount: w.amount_minor },
      ]);
      await q(c, `update withdrawals set status='expired', updated_at=now() where id=$1`, [w.id]);
    });
    void pushBalance(w.user_id);
  }
}

/** Backup path for deposits whose confirmation the client never sent. */
export async function scanDeposits() {
  const sigs = await recentVaultSignatures(40);
  for (const s of sigs) {
    try {
      await creditDeposit(s);
    } catch (e) {
      log.warn({ s, e: (e as Error).message }, 'deposit scan failed');
    }
  }
}

export async function reserveCheck() {
  const vault = tokenBaseToMinor(await vaultBalanceBase());
  const r = await one<{ s: number }>(
    pool,
    `select coalesce(sum(balance),0)::bigint as s from ledger_accounts where kind in ('user_available','user_locked','game_escrow','house_bankroll','fee_revenue')`,
  );
  const ok = vault >= r.s;
  await q(pool, `insert into reserve_checks(vault_minor, liabilities_minor, ok) values ($1,$2,$3)`, [vault, r.s, ok]);
  if (!ok) log.error({ vault, liabilities: r.s }, 'RESERVE CHECK FAILED');
  return { vault, liabilities: r.s, ok };
}

export async function walletOverview(userId: string, wallet: string) {
  const b = await balances(pool, userId);
  const history = await q<any>(
    pool,
    `select t.id, t.kind, t.memo, t.created_at, t.table_id, t.meta,
            coalesce(sum(e.amount) filter (where a.kind = 'user_available'), 0)::bigint as delta,
            coalesce(sum(e.amount) filter (where a.kind = 'user_locked'), 0)::bigint as locked_delta
       from ledger_transactions t
       join ledger_entries e on e.transaction_id = t.id
       join ledger_accounts a on a.id = e.account_id
      where (t.user_id = $1 and a.user_id = $1) or (t.kind = 'game_settle' and a.user_id = $1)
      group by t.id order by t.created_at desc limit 50`,
    [userId],
  );
  const pending = await q<any>(pool, `select id, amount_minor, status, created_at, expiry from withdrawals where user_id=$1 and status in ('review','pending','submitted') order by created_at desc`, [userId]);
  return { ...b, history, pendingWithdrawals: pending, wallet };
}

const TOKEN_2022 = TOKEN_2022_PROGRAM_ID;
const TOKEN_LEGACY = TOKEN_PROGRAM_ID;

export interface PortfolioItem {
  id: string; // 'SOL' or the mint address
  symbol: string;
  name: string;
  decimals: number;
  base: string; // integer amount in the smallest unit, as a string
  ui: number;
}

/** Every token in the player's own wallet: SOL, Evens USDC, and any other SPL token. */
export async function portfolio(wallet: string): Promise<PortfolioItem[]> {
  const owner = new PublicKey(wallet);
  const cfg = chainConfig();
  const [lamports, legacy, t22] = await Promise.all([
    connection.getBalance(owner),
    connection.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_LEGACY }),
    connection.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_2022 }).catch(() => ({ value: [] as any[] })),
  ]);
  const items: PortfolioItem[] = [{ id: 'SOL', symbol: 'SOL', name: 'Solana', decimals: 9, base: String(lamports), ui: lamports / 1e9 }];
  const byMint = new Map<string, PortfolioItem>();
  for (const a of [...legacy.value, ...t22.value]) {
    const info = a.account.data.parsed?.info;
    if (!info) continue;
    const mint: string = info.mint;
    const amt = BigInt(info.tokenAmount.amount);
    const decimals: number = info.tokenAmount.decimals;
    const prev = byMint.get(mint);
    const base = (prev ? BigInt(prev.base) : 0n) + amt;
    const isUsdc = mint === cfg.mint;
    byMint.set(mint, {
      id: mint,
      symbol: isUsdc ? 'USDC' : `${mint.slice(0, 4)}…`,
      name: isUsdc ? (cfg.cluster === 'devnet' || cfg.cluster === 'localnet' ? 'USD Coin (test)' : 'USD Coin') : 'Other token',
      decimals,
      base: base.toString(),
      ui: Number(base) / 10 ** decimals,
    });
  }
  const tokens = [...byMint.values()].sort((a, b) => (a.id === cfg.mint ? -1 : b.id === cfg.mint ? 1 : b.ui - a.ui));
  // USDC always listed, even at zero, so the player sees where it would be.
  if (!byMint.has(cfg.mint)) tokens.unshift({ id: cfg.mint, symbol: 'USDC', name: 'USD Coin (test)', decimals: 6, base: '0', ui: 0 });
  return [...tokens.slice(0, 1), items[0]!, ...tokens.slice(1)];
}

/**
 * Send SOL or any SPL token from the player's own wallet to any Solana address. This never touches
 * credits or the vault: it is a plain transfer the player signs in the browser. The server only builds
 * it (and creates the recipient's token account if needed, paid by the sender).
 */
export async function buildSend(wallet: string, to: string, amountBase: bigint, asset = 'USDC') {
  let dest: PublicKey;
  try {
    dest = new PublicKey(to.trim());
  } catch {
    throw new UserError('That is not a valid Solana address. Check it and try again.', 'bad_address');
  }
  const cfg = chainConfig();
  if (dest.toBase58() === wallet) throw new UserError('That is your own address. Enter the address you want to send to.', 'self_send');
  if (dest.toBase58() === cfg.vault || dest.toBase58() === cfg.programId)
    throw new UserError('Do not send to the Evens vault directly, it cannot be credited to you. Use Add money instead.', 'vault_send');
  const user = new PublicKey(wallet);
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  const t = new Transaction({ feePayer: user, blockhash, lastValidBlockHeight });

  if (asset === 'SOL') {
    const have = BigInt(await connection.getBalance(user));
    if (amountBase + 10_000n > have) throw new UserError(`You can send up to ${(Number(have - 10_000n > 0n ? have - 10_000n : 0n) / 1e9).toFixed(4)} SOL. A little stays for the network fee.`, 'insufficient');
    t.add(SystemProgram.transfer({ fromPubkey: user, toPubkey: dest, lamports: amountBase }));
  } else {
    const mint = new PublicKey(asset === 'USDC' ? cfg.mint : asset);
    const mintInfo = await connection.getParsedAccountInfo(mint);
    const programId = mintInfo.value?.owner;
    if (!programId || !(programId.equals(TOKEN_LEGACY) || programId.equals(TOKEN_2022))) throw new UserError('That token cannot be sent from here.', 'bad_mint');
    const decimals: number = (mintInfo.value!.data as any).parsed?.info?.decimals ?? 0;
    const fromAta = getAssociatedTokenAddressSync(mint, user, false, programId);
    const toAta = getAssociatedTokenAddressSync(mint, dest, true, programId);
    const acc = await connection.getParsedAccountInfo(fromAta);
    const have = BigInt((acc.value?.data as any)?.parsed?.info?.tokenAmount?.amount ?? '0');
    if (amountBase > have) throw new UserError(`You only have ${(Number(have) / 10 ** decimals).toLocaleString('en-US', { maximumFractionDigits: decimals })} of this token.`, 'insufficient');
    t.add(
      createAssociatedTokenAccountIdempotentInstruction(user, toAta, dest, mint, programId),
      createTransferCheckedInstruction(fromAta, mint, toAta, user, amountBase, decimals, [], programId),
    );
  }
  return { transaction: t.serialize({ requireAllSignatures: false }).toString('base64'), lastValidBlockHeight };
}
