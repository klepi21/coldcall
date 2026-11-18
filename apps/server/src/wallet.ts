/**
 * Money in and out of the vault, per currency. LOFI and SUI each have their own Vault<T> on chain and
 * their own ledger accounts; nothing here ever converts one into the other.
 */
import { randomBytes } from 'node:crypto';
import { CURRENCIES, CURRENCY, baseToMinor, minorToBase, formatAmount, formatBase, type Currency } from '@coldcall/shared';
import { pool, tx, q, one, maybe } from './db/pool';
import { post, balances, liabilities } from './ledger';
import {
  chainConfig,
  buildDeposit,
  buildFaucetClaim,
  buildWithdraw,
  executeSponsored,
  signTicket,
  listVaultEvents,
  transactionVaultEvents,
  vaultBalanceBase,
  isNonceUsed,
  walletBalanceBase,
  nextFaucetClaimMs,
  sendTestSui,
  ChainUserError,
  type VaultEvent,
} from './chain/vault';
import { env } from './env';
import { log } from './lib/log';
import { pushBalance, UserError } from './games/rooms';

const asUserError = (e: unknown) => (e instanceof ChainUserError ? new UserError(e.message, e.code, 409) : e);

// ---------- crediting chain events (idempotent on digest:eventSeq) ----------

/**
 * Applies one vault event to the ledger exactly once.
 *  Deposited       user deposit: vault mirror out, user available in
 *  Funded          house bankroll top up
 *  Withdrawn       completes the matching cash out (by currency and nonce)
 *  AdminWithdrawn  house money taken out of the vault
 */
export async function applyVaultEvent(ev: VaultEvent): Promise<{ credited: boolean; userId?: string }> {
  if (!ev.currency) return { credited: false };
  const currency = ev.currency;
  const amount = baseToMinor(ev.amountBase, currency);
  const ref = `${ev.digest}:${ev.eventSeq}`;

  if (ev.type === 'Deposited' || ev.type === 'Funded') {
    if (!ev.user) return { credited: false };
    const house = ev.type === 'Funded';
    const user = house ? null : await maybe<{ id: string }>(pool, `select id from users where wallet_address=$1`, [ev.user]);
    if (!house && !user) return { credited: false }; // not one of our players: left in the vault, never credited
    const done = await tx(async (c) => {
      const ins = await maybe(
        c,
        `insert into deposits(digest, event_seq, currency, kind, sender, user_id, amount_base, amount_minor, checkpoint)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9) on conflict do nothing returning digest`,
        [ev.digest, ev.eventSeq, currency, house ? 'house' : 'user', ev.user, user?.id ?? null, ev.amountBase.toString(), amount, ev.checkpoint],
      );
      if (!ins || amount === 0) return false;
      const txId = await post(
        c,
        {
          kind: house ? 'bankroll_fund' : 'deposit',
          key: `${house ? 'fund' : 'deposit'}:${ref}`,
          currency,
          userId: user?.id ?? null,
          memo: house ? 'House bankroll added' : 'Added money',
          meta: { digest: ev.digest, eventSeq: ev.eventSeq },
        },
        [
          { ref: { kind: 'vault_onchain', currency }, amount: -amount },
          { ref: house ? { kind: 'house_bankroll', currency } : { kind: 'user_available', currency, userId: user!.id }, amount },
        ],
      );
      await q(c, `update deposits set transaction_id=$3 where digest=$1 and event_seq=$2`, [ev.digest, ev.eventSeq, txId]);
      return true;
    });
    if (done && user) void pushBalance(user.id);
    return { credited: done, userId: user?.id };
  }

  if (ev.type === 'Withdrawn' && ev.nonce !== null) {
    const w = await maybe<any>(
      pool,
      `select w.*, u.wallet_address from withdrawals w join users u on u.id = w.user_id where w.currency=$1 and w.nonce=$2`,
      [currency, ev.nonce.toString()],
    );
    if (!w || w.wallet_address !== ev.user || BigInt(w.amount_base) !== ev.amountBase) {
      log.warn({ digest: ev.digest, nonce: ev.nonce.toString() }, 'Withdrawn event without a matching cash out');
      return { credited: false };
    }
    await completeWithdrawal(w, ev.digest);
    return { credited: true, userId: w.user_id };
  }

  if (ev.type === 'AdminWithdrawn') {
    if (amount === 0) return { credited: false };
    const id = await tx((c) =>
      post(c, { kind: 'bankroll_withdraw', key: `adminw:${ref}`, currency, memo: 'House money taken out of the vault', meta: { digest: ev.digest } }, [
        { ref: { kind: 'house_bankroll', currency }, amount: -amount },
        { ref: { kind: 'vault_onchain', currency }, amount },
      ]),
    );
    return { credited: !!id };
  }
  return { credited: false };
}

/** Backup path: read every vault event from the chain and apply the ones we have not seen. */
export async function scanVaultEvents() {
  const name = `vault_events:${chainConfig().packageId}`;
  let cursor = (await maybe<{ value: string }>(pool, `select value from chain_cursor where name=$1`, [name]))?.value ?? null;
  for (let page = 0; page < 20; page++) {
    const r = await listVaultEvents(cursor, 50);
    for (const ev of r.events) {
      try {
        await applyVaultEvent(ev);
      } catch (e) {
        log.warn({ digest: ev.digest, e: (e as Error).message }, 'vault event apply failed');
        return; // keep the cursor before this page, retry next run (every apply is idempotent)
      }
    }
    if (r.cursor && r.cursor !== cursor) {
      cursor = r.cursor;
      await q(pool, `insert into chain_cursor(name, value) values ($1,$2) on conflict (name) do update set value=$2, updated_at=now()`, [name, cursor]);
    }
    if (!r.more) return;
  }
}

// ---------- adding money ----------

export async function userLimits(userId: string, currency: Currency) {
  return (
    (await maybe<{ deposit_daily: number | null; loss_daily: number | null; loss_weekly: number | null }>(
      pool,
      `select deposit_daily, loss_daily, loss_weekly from user_limits where user_id=$1 and currency=$2`,
      [userId, currency],
    )) ?? { deposit_daily: null, loss_daily: null, loss_weekly: null }
  );
}

export async function buildDepositTx(userId: string, wallet: string, currency: Currency, amountMinor: number) {
  const r = CURRENCY[currency];
  if (amountMinor < 1) throw new UserError(`Enter an amount above 0 ${currency}.`, 'too_small');
  if (amountMinor > r.maxDeposit) throw new UserError(`You can add up to ${formatAmount(r.maxDeposit, currency)} at once.`, 'too_big');
  const lim = await userLimits(userId, currency);
  if (lim.deposit_daily) {
    const today = await one<{ s: number }>(
      pool,
      `select coalesce(sum(amount_minor),0)::bigint as s from deposits where user_id=$1 and currency=$2 and created_at > now() - interval '1 day'`,
      [userId, currency],
    );
    if (today.s + amountMinor > lim.deposit_daily)
      throw new UserError(`This would go past your daily limit for adding ${currency}. You can change it in your profile.`, 'deposit_limit', 403);
  }
  const base = minorToBase(amountMinor, currency);
  const have = await walletBalanceBase(wallet, currency);
  if (have < base)
    throw new UserError(
      `Your wallet holds ${formatBase(have)} ${currency}, which is less than ${formatAmount(amountMinor, currency)}. Tap Get test ${currency} first.`,
      'wallet_insufficient',
    );
  try {
    return { bytes: await buildDeposit(userId, wallet, currency, base) };
  } catch (e) {
    throw asUserError(e);
  }
}

/** Browser signed a transaction the server built: sponsor it, run it, and apply what happened. */
export async function submitSigned(userId: string, bytes: string, signature: string) {
  let r;
  try {
    r = await executeSponsored(userId, bytes, signature);
  } catch (e) {
    throw asUserError(e);
  }
  let credited = 0;
  for (const ev of r.events) {
    // Only events of this very transaction, as reported by the node.
    const out = await applyVaultEvent(ev);
    if (out.credited && ev.type === 'Deposited') credited += baseToMinor(ev.amountBase, ev.currency!);
  }
  if (r.kind === 'faucet') {
    await q(pool, `insert into faucet_claims(user_id, currency, amount_base, digest) values ($1,'LOFI',$2,$3)`, [userId, '1000000000000', r.digest]);
  }
  if (r.kind === 'withdraw') {
    await q(pool, `update withdrawals set status='submitted', updated_at=now() where id=$1 and status='pending'`, [r.meta.withdrawalId]);
  }
  void pushBalance(userId);
  return { digest: r.digest, kind: r.kind, credited, currency: (r.meta.currency as Currency) ?? null };
}

/** Confirmation by digest, for a transaction the browser says it ran. Reads the chain, never the client. */
export async function confirmDigest(userId: string, digest: string) {
  const evs = await transactionVaultEvents(digest);
  if (evs === null) throw new UserError('We could not find that transaction yet. Give it a few seconds and try again.', 'not_found_onchain', 409);
  let credited = 0;
  for (const ev of evs) {
    const out = await applyVaultEvent(ev);
    if (out.credited && out.userId === userId && ev.type === 'Deposited') credited += baseToMinor(ev.amountBase, ev.currency!);
  }
  return { credited };
}

// ---------- test coins ----------

export async function buildLofiFaucet(userId: string, wallet: string) {
  const next = await nextFaucetClaimMs(wallet).catch(() => 0);
  if (next > Date.now()) {
    const mins = Math.ceil((next - Date.now()) / 60_000);
    throw new UserError(`You got test LOFI recently. You can claim again in about ${mins >= 60 ? `${Math.ceil(mins / 60)} hours` : `${mins} minutes`}.`, 'faucet_cooldown', 429);
  }
  try {
    return { bytes: await buildFaucetClaim(userId, wallet) };
  } catch (e) {
    throw asUserError(e);
  }
}

/** The game wallet sends a little SUI so a new player has SUI coins to add. Rate limited per player. */
export async function dripTestSui(userId: string, wallet: string) {
  // Reserve the claim inside one statement so two fast taps cannot both send.
  const claim = await maybe<{ id: number }>(
    pool,
    `insert into faucet_claims(user_id, currency, amount_base)
     select $1, 'SUI', $2
      where not exists (select 1 from faucet_claims where user_id=$1 and currency='SUI' and created_at > now() - ($3 || ' hours')::interval)
     returning id`,
    [userId, env.SUI_DRIP_BASE.toString(), String(env.SUI_DRIP_HOURS)],
  );
  if (!claim) throw new UserError(`You got test SUI recently. You can ask again ${env.SUI_DRIP_HOURS} hours after your last claim.`, 'drip_limit', 429);
  try {
    const digest = await sendTestSui(wallet, env.SUI_DRIP_BASE);
    await q(pool, `update faucet_claims set digest=$2 where id=$1`, [claim.id, digest]);
    return { digest, amount: formatBase(env.SUI_DRIP_BASE) };
  } catch (e) {
    await q(pool, `delete from faucet_claims where id=$1`, [claim.id]);
    throw asUserError(e);
  }
}

// ---------- cashing out ----------

/**
 * Ticket nonces are random 62 bit numbers, never a counter: the vaults remember used nonces forever, and a
 * new database (a redeploy, a test run) on the same vaults must never hand out a nonce that was used before.
 */
const randomNonce = () => (BigInt(`0x${randomBytes(8).toString('hex')}`) >> 2n).toString();

export async function requestWithdrawal(userId: string, wallet: string, currency: Currency, amountMinor: number) {
  const r = CURRENCY[currency];
  if (amountMinor < r.minWithdraw) throw new UserError(`The smallest cash out is ${formatAmount(r.minWithdraw, currency)}.`, 'too_small');
  const today = await one<{ s: number }>(
    pool,
    `select coalesce(sum(amount_minor),0)::bigint as s from withdrawals
      where user_id=$1 and currency=$2 and created_at > now() - interval '1 day' and status not in ('expired','rejected')`,
    [userId, currency],
  );
  if (today.s + amountMinor > r.withdrawDaily)
    throw new UserError(`You can cash out up to ${formatAmount(r.withdrawDaily, currency)} per day. Try a smaller amount or come back tomorrow.`, 'withdraw_limit', 403);

  const review = amountMinor > r.withdrawReviewAbove;
  const amountBase = minorToBase(amountMinor, currency);
  const w = await tx(async (c) => {
    const nonce = randomNonce(); // 62 random bits: a clash is practically impossible, and the unique index would reject it
    const row = await one<any>(
      c,
      `insert into withdrawals(user_id, currency, amount_minor, amount_base, nonce, expiry, status)
       values ($1,$2,$3,$4,$5, now() + interval '10 minutes', $6) returning *`,
      [userId, currency, amountMinor, amountBase.toString(), nonce, review ? 'review' : 'pending'],
    );
    await post(c, { kind: 'withdraw_lock', key: `wlock:${row.id}`, currency, userId, memo: 'Cash out requested' }, [
      { ref: { kind: 'user_available', currency, userId }, amount: -amountMinor },
      { ref: { kind: 'user_locked', currency, userId }, amount: amountMinor },
    ]);
    return row;
  });
  void pushBalance(userId);
  if (review) return { id: w.id, status: 'review' as const };
  return { id: w.id, status: 'pending' as const, ...(await issueTicket(userId, wallet, w.id)) };
}

/**
 * Issue (or reissue) the ticket and the sponsored transaction for a pending cash out.
 * Runs under a row lock and only for status 'pending', so it cannot race the expiry sweep:
 * the sweep takes the same lock and re-checks the expiry written here.
 */
async function issueTicket(userId: string, wallet: string, id: string) {
  const t = await tx(async (c) => {
    const w = await maybe<any>(c, `select * from withdrawals where id=$1 and user_id=$2 for update`, [id, userId]);
    if (!w || w.status !== 'pending') throw new UserError('This cash out cannot be continued.', 'bad_state', 409);
    // Never signed before: make sure the chain has never seen this nonce, otherwise pick a fresh one.
    if (!w.ticket_sig) {
      for (let i = 0; i < 5 && (await isNonceUsed(w.currency, BigInt(w.nonce))); i++) {
        w.nonce = randomNonce();
        await q(c, `update withdrawals set nonce=$2 where id=$1`, [w.id, w.nonce]);
      }
    }
    const expiryMs = BigInt(Date.now() + 10 * 60_000);
    const sigHex = await signTicket({ currency: w.currency, recipient: wallet, amountBase: BigInt(w.amount_base), nonce: BigInt(w.nonce), expiryMs });
    await q(c, `update withdrawals set ticket_sig=$2, expiry=to_timestamp($3::double precision / 1000), updated_at=now() where id=$1`, [w.id, sigHex, expiryMs.toString()]);
    return { w, expiryMs, sigHex };
  });
  try {
    const bytes = await buildWithdraw(userId, wallet, {
      currency: t.w.currency,
      amountBase: BigInt(t.w.amount_base),
      nonce: BigInt(t.w.nonce),
      expiryMs: t.expiryMs,
      sigHex: t.sigHex,
      withdrawalId: t.w.id,
    });
    return { bytes, expiry: Number(t.expiryMs / 1000n) };
  } catch (e) {
    throw asUserError(e);
  }
}

/** Admin approved, or the player tries again: a fresh ticket with the same nonce (it still works only once). */
export async function reissueTicket(userId: string, wallet: string, id: string) {
  const w = await maybe<any>(pool, `select * from withdrawals where id=$1 and user_id=$2`, [id, userId]);
  if (!w || !['pending', 'submitted'].includes(w.status)) throw new UserError('This cash out cannot be continued.', 'bad_state', 409);
  if (w.ticket_sig && (await isNonceUsed(w.currency, BigInt(w.nonce)))) {
    void scanVaultEvents();
    throw new UserError('This cash out already went through. Refresh your wallet.', 'already_used', 409);
  }
  if (w.status === 'submitted') await q(pool, `update withdrawals set status='pending' where id=$1 and status='submitted'`, [id]);
  return issueTicket(userId, wallet, id);
}

async function completeWithdrawal(w: any, digest: string | null) {
  await tx(async (c) => {
    await post(c, { kind: 'withdraw_complete', key: `wdone:${w.id}`, currency: w.currency, userId: w.user_id, memo: 'Cashed out', meta: { digest } }, [
      { ref: { kind: 'user_locked', currency: w.currency, userId: w.user_id }, amount: -w.amount_minor },
      { ref: { kind: 'vault_onchain', currency: w.currency }, amount: w.amount_minor },
    ]);
    await q(c, `update withdrawals set status='confirmed', tx_digest=coalesce($2, tx_digest), updated_at=now() where id=$1`, [w.id, digest]);
  });
  void pushBalance(w.user_id);
}

/**
 * Expired tickets. Waits 2 minutes past the expiry so the chain clock is surely past it too, then asks
 * the chain whether the nonce was used. Used: the cash out happened (the event scanner records it).
 * Not used: the ticket can never work any more, so the money goes back to the player.
 */
export async function sweepWithdrawals() {
  const open = await q<any>(pool, `select id, currency, nonce from withdrawals where status in ('pending','submitted') and expiry < now() - interval '2 minutes'`);
  for (const o of open) {
    const used = await isNonceUsed(o.currency, BigInt(o.nonce));
    if (used) {
      // The cash out happened: the scanner books it from the Withdrawn event. If no event of ours matches,
      // something is off, so a person looks at it instead of the money staying locked silently.
      await scanVaultEvents().catch(() => {});
      const moved = await q(
        pool,
        `update withdrawals set status='review', updated_at=now() where id=$1 and status in ('pending','submitted') and expiry < now() - interval '10 minutes' returning id`,
        [o.id],
      );
      if (moved.length) log.error({ id: o.id, nonce: String(o.nonce) }, 'nonce used on chain without a matching Withdrawn event, sent to review');
      continue;
    }
    const released = await tx(async (c) => {
      const w = await maybe<any>(c, `select * from withdrawals where id=$1 for update`, [o.id]);
      // Re-check under the lock: a reissue may have moved the expiry forward in the meantime.
      if (!w || !['pending', 'submitted'].includes(w.status) || new Date(w.expiry).getTime() > Date.now() - 120_000) return null;
      await post(c, { kind: 'withdraw_release', key: `wrel:${w.id}`, currency: w.currency, userId: w.user_id, memo: 'Cash out not completed, money returned' }, [
        { ref: { kind: 'user_locked', currency: w.currency, userId: w.user_id }, amount: -w.amount_minor },
        { ref: { kind: 'user_available', currency: w.currency, userId: w.user_id }, amount: w.amount_minor },
      ]);
      await q(c, `update withdrawals set status='expired', updated_at=now() where id=$1`, [w.id]);
      return w.user_id as string;
    });
    if (released) void pushBalance(released);
  }
}

// ---------- reserve ----------

/** Vault coins on chain must cover everything held for others in the same currency. */
export async function reserveCheckFor(currency: Currency, vaultMinor: number) {
  const owed = await liabilities(pool, currency);
  const ok = vaultMinor >= owed;
  await q(pool, `insert into reserve_checks(currency, vault_minor, liabilities_minor, ok) values ($1,$2,$3,$4)`, [currency, vaultMinor, owed, ok]);
  if (!ok) log.error({ currency, vault: vaultMinor, liabilities: owed }, 'RESERVE CHECK FAILED');
  return { currency, vault: vaultMinor, liabilities: owed, ok };
}

export async function reserveCheck() {
  const out = [];
  for (const c of CURRENCIES) out.push(await reserveCheckFor(c, baseToMinor(await vaultBalanceBase(c), c)));
  return out;
}

// ---------- overview ----------

export async function walletOverview(userId: string, wallet: string, currency: Currency) {
  const all = await balances(pool, userId);
  const history = await q<any>(
    pool,
    `select t.id, t.kind, t.currency, t.memo, t.created_at, t.table_id, t.meta,
            coalesce(sum(e.amount) filter (where a.kind = 'user_available'), 0)::bigint as delta,
            coalesce(sum(e.amount) filter (where a.kind = 'user_locked'), 0)::bigint as locked_delta
       from ledger_transactions t
       join ledger_entries e on e.transaction_id = t.id
       join ledger_accounts a on a.id = e.account_id
      where t.currency = $2 and a.user_id = $1
      group by t.id order by t.created_at desc limit 50`,
    [userId, currency],
  );
  const pending = await q<any>(
    pool,
    `select id, currency, amount_minor, status, created_at, expiry from withdrawals
      where user_id=$1 and currency=$2 and status in ('review','pending','submitted') order by created_at desc`,
    [userId, currency],
  );
  const [lofiBase, suiBase] = await Promise.all([walletBalanceBase(wallet, 'LOFI').catch(() => null), walletBalanceBase(wallet, 'SUI').catch(() => null)]);
  const lastDrip = await maybe<{ created_at: string }>(pool, `select created_at from faucet_claims where user_id=$1 and currency='SUI' order by id desc limit 1`, [userId]);
  return {
    currency,
    ...all[currency],
    balances: all,
    history,
    pendingWithdrawals: pending,
    wallet,
    walletCoins: { LOFI: lofiBase?.toString() ?? null, SUI: suiBase?.toString() ?? null },
    nextSuiDripAt: lastDrip ? new Date(new Date(lastDrip.created_at).getTime() + env.SUI_DRIP_HOURS * 3600_000).toISOString() : null,
  };
}
