import type pg from 'pg';
import { one, q, maybe } from './db/pool';

export type AccountKind =
  | 'user_available'
  | 'user_locked'
  | 'game_escrow'
  | 'house_bankroll'
  | 'fee_revenue'
  | 'vault_onchain'
  | 'faucet_source';

export type TxKind =
  | 'deposit'
  | 'withdraw_lock'
  | 'withdraw_release'
  | 'withdraw_complete'
  | 'game_start'
  | 'game_settle'
  | 'game_refund'
  | 'bankroll_fund'
  | 'adjustment';

export interface AccountRef {
  kind: AccountKind;
  userId?: string | null;
  tableId?: string | null;
}

export class InsufficientFunds extends Error {
  constructor(public readonly needed: number, public readonly available: number) {
    super('insufficient funds');
  }
}

/** Get or create a ledger account and lock its row for this transaction. */
export async function account(c: pg.PoolClient, ref: AccountRef): Promise<{ id: number; balance: number }> {
  const userId = ref.userId ?? null;
  const tableId = ref.tableId ?? null;
  await q(
    c,
    `insert into ledger_accounts(kind, user_id, table_id) values ($1,$2,$3) on conflict do nothing`,
    [ref.kind, userId, tableId],
  );
  return one(
    c,
    `select id, balance from ledger_accounts
      where kind=$1 and user_id is not distinct from $2 and table_id is not distinct from $3 for update`,
    [ref.kind, userId, tableId],
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
  t: { kind: TxKind; key: string; userId?: string | null; tableId?: string | null; memo?: string; meta?: unknown },
  legs: Leg[],
): Promise<string | null> {
  const live = legs.filter((l) => l.amount !== 0);
  for (const l of live) if (!Number.isSafeInteger(l.amount)) throw new Error('non integer amount');
  const sum = live.reduce((s, l) => s + l.amount, 0);
  if (sum !== 0) throw new Error(`unbalanced ledger post (${sum})`);

  const ins = await maybe<{ id: string }>(
    c,
    `insert into ledger_transactions(kind, idempotency_key, user_id, table_id, memo, meta)
     values ($1,$2,$3,$4,$5,$6) on conflict (idempotency_key) do nothing returning id`,
    [t.kind, t.key, t.userId ?? null, t.tableId ?? null, t.memo ?? null, JSON.stringify(t.meta ?? {})],
  );
  if (!ins) return null;

  // Lock accounts in a stable order to avoid deadlocks.
  const accs = [] as { leg: Leg; id: number; balance: number }[];
  for (const leg of live) accs.push({ leg, ...(await account(c, leg.ref)) });
  accs.sort((a, b) => a.id - b.id);

  for (const a of accs) {
    const next = a.balance + a.leg.amount;
    if (next < 0 && ['user_available', 'user_locked', 'game_escrow'].includes(a.leg.ref.kind)) {
      throw new InsufficientFunds(-a.leg.amount, a.balance);
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

export async function balances(c: pg.PoolClient | pg.Pool, userId: string) {
  const rows = await q<{ kind: string; balance: number }>(
    c,
    `select kind, balance from ledger_accounts where user_id = $1 and table_id is null`,
    [userId],
  );
  const get = (k: string) => rows.find((r) => r.kind === k)?.balance ?? 0;
  const inGames = await one<{ s: number }>(
    c,
    `select coalesce(sum(e.amount),0)::bigint as s
       from ledger_entries e join ledger_accounts a on a.id = e.account_id
       join ledger_transactions t on t.id = e.transaction_id
      where a.kind = 'game_escrow' and t.user_id = $1
        and a.table_id in (select id from game_tables where status = 'playing')`,
    [userId],
  );
  return { available: get('user_available'), locked: get('user_locked'), inGames: inGames.s };
}

/** Sum of everything the platform owes users: available + locked + open escrow. */
export async function liabilities(c: pg.PoolClient | pg.Pool): Promise<number> {
  const r = await one<{ s: number }>(
    c,
    `select coalesce(sum(balance),0)::bigint as s from ledger_accounts
      where kind in ('user_available','user_locked','game_escrow','house_bankroll','fee_revenue')`,
  );
  return r.s;
}
