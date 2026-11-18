import type pg from 'pg';
import { CURRENCIES, type Currency } from '@coldcall/shared';
import { one, q, maybe } from './db/pool';

export type AccountKind =
  | 'user_available'
  | 'user_locked'
  | 'game_escrow'
  | 'house_bankroll'
  | 'fee_revenue'
  | 'vault_onchain';

export type TxKind =
  | 'deposit'
  | 'withdraw_lock'
  | 'withdraw_release'
  | 'withdraw_complete'
  | 'game_start'
  | 'game_settle'
  | 'game_refund'
  | 'bankroll_fund'
  | 'bankroll_withdraw'
  | 'adjustment';

/** Every account belongs to exactly one currency. LOFI and SUI never share an account. */
export interface AccountRef {
  kind: AccountKind;
  currency: Currency;
  userId?: string | null;
  tableId?: string | null;
}

export class InsufficientFunds extends Error {
  constructor(public readonly needed: number, public readonly available: number, public readonly currency: Currency) {
    super('insufficient funds');
  }
}

/** Get or create a ledger account and lock its row for this transaction. */
export async function account(c: pg.PoolClient, ref: AccountRef): Promise<{ id: number; balance: number }> {
  const userId = ref.userId ?? null;
  const tableId = ref.tableId ?? null;
  if (!CURRENCIES.includes(ref.currency)) throw new Error(`unknown currency ${ref.currency}`);
  await q(
    c,
    `insert into ledger_accounts(kind, currency, user_id, table_id) values ($1,$2,$3,$4) on conflict do nothing`,
    [ref.kind, ref.currency, userId, tableId],
  );
  return one(
    c,
    `select id, balance from ledger_accounts
      where kind=$1 and currency=$2 and user_id is not distinct from $3 and table_id is not distinct from $4 for update`,
    [ref.kind, ref.currency, userId, tableId],
  );
}

export interface Leg {
  ref: AccountRef;
  amount: number; // signed minor units
}

/**
 * Post a balanced transaction. Must be called inside a db transaction (tx()).
 * Returns null if the idempotency key was already used (operation already applied).
 */
export async function post(
  c: pg.PoolClient,
  t: { kind: TxKind; key: string; currency: Currency; userId?: string | null; tableId?: string | null; memo?: string; meta?: unknown },
  legs: Leg[],
): Promise<string | null> {
  const live = legs.filter((l) => l.amount !== 0);
  for (const l of live) if (!Number.isSafeInteger(l.amount)) throw new Error('non integer amount');
  const sum = live.reduce((s, l) => s + l.amount, 0);
  if (sum !== 0) throw new Error(`unbalanced ledger post (${sum})`);
  // One currency per transaction. The database trigger checks this again at commit.
  if (!CURRENCIES.includes(t.currency)) throw new Error(`unknown currency ${t.currency}`);
  for (const l of legs) if (l.ref.currency !== t.currency) throw new Error(`currency mismatch: ${l.ref.currency} leg in a ${t.currency} transaction`);

  const ins = await maybe<{ id: string }>(
    c,
    `insert into ledger_transactions(kind, idempotency_key, currency, user_id, table_id, memo, meta)
     values ($1,$2,$3,$4,$5,$6,$7) on conflict (idempotency_key) do nothing returning id`,
    [t.kind, t.key, t.currency, t.userId ?? null, t.tableId ?? null, t.memo ?? null, JSON.stringify(t.meta ?? {})],
  );
  if (!ins) return null;

  // Lock accounts in a stable order to avoid deadlocks.
  const accs = [] as { leg: Leg; id: number; balance: number }[];
  for (const leg of live) accs.push({ leg, ...(await account(c, leg.ref)) });
  accs.sort((a, b) => a.id - b.id);

  for (const a of accs) {
    const next = a.balance + a.leg.amount;
    if (next < 0 && ['user_available', 'user_locked', 'game_escrow'].includes(a.leg.ref.kind)) {
      throw new InsufficientFunds(-a.leg.amount, a.balance, t.currency);
    }
    await q(c, `insert into ledger_entries(transaction_id, account_id, amount) values ($1,$2,$3)`, [
      ins.id,
      a.id,
      a.leg.amount,
    ]);
    await q(c, `update ledger_accounts set balance = balance + $2 where id = $1`, [a.id, a.leg.amount]);
    a.balance = next;
  }
  return ins.id;
}

export interface Balance {
  available: number;
  locked: number;
  inGames: number;
}
export type Balances = Record<Currency, Balance>;

/** One user's balances, per currency. */
export async function balances(c: pg.PoolClient | pg.Pool, userId: string): Promise<Balances> {
  const rows = await q<{ kind: string; currency: Currency; balance: number }>(
    c,
    `select kind, currency, balance from ledger_accounts where user_id = $1 and table_id is null`,
    [userId],
  );
  const inGames = await q<{ currency: Currency; s: number }>(
    c,
    `select a.currency, coalesce(sum(e.amount),0)::bigint as s
       from ledger_entries e join ledger_accounts a on a.id = e.account_id
       join ledger_transactions t on t.id = e.transaction_id
      where a.kind = 'game_escrow' and t.user_id = $1
        and a.table_id in (select id from game_tables where status = 'playing')
      group by a.currency`,
    [userId],
  );
  const out = {} as Balances;
  for (const cur of CURRENCIES) {
    const get = (k: string) => rows.find((r) => r.kind === k && r.currency === cur)?.balance ?? 0;
    out[cur] = { available: get('user_available'), locked: get('user_locked'), inGames: inGames.find((r) => r.currency === cur)?.s ?? 0 };
  }
  return out;
}

/** Everything held for others in one currency: users (available, locked, in games) plus house and fees. */
export async function liabilities(c: pg.PoolClient | pg.Pool, currency: Currency): Promise<number> {
  const r = await one<{ s: number }>(
    c,
    `select coalesce(sum(balance),0)::bigint as s from ledger_accounts
      where currency = $1 and kind in ('user_available','user_locked','game_escrow','house_bankroll','fee_revenue')`,
    [currency],
  );
  return r.s;
}

/** House bankroll of one currency. Bot games in LOFI only ever use the LOFI bankroll, and the same for SUI. */
export async function houseBankroll(c: pg.PoolClient | pg.Pool, currency: Currency): Promise<number> {
  const r = await maybe<{ balance: number }>(
    c,
    `select balance from ledger_accounts where kind='house_bankroll' and currency=$1 and user_id is null and table_id is null`,
    [currency],
  );
  return r?.balance ?? 0;
}
