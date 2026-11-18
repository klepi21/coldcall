/**
 * Admin area: read only reporting over users, games and money.
 *
 * Rules:
 * - Every route is behind requireUser + requireAdmin and validates its query with Zod.
 * - Read only SQL. The only admin write (approve a withdrawal under review) stays in index.ts.
 * - Columns are always listed explicitly. Never return server seeds of live games, withdrawal ticket
 *   signatures, session ids, nonces or any key material.
 * - Money is integer minor units. Every sum is cast to bigint (parsed to a safe number by db/pool),
 *   every average or duration to float8, so nothing comes back as a numeric string.
 * - Days are UTC days.
 * - Money is per currency. Every money route takes `currency` (LOFI or SUI, default LOFI) and every sum
 *   only ever adds amounts of that one currency. Nothing converts or adds LOFI and SUI together.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { BOT_HOUSE_EDGE, CURRENCIES, CURRENCY, baseToMinor, type Currency } from '@coldcall/shared';
import { pool, q, one, maybe } from './db/pool';
import { env } from './env';
import { requireUser, requireAdmin, TERMS_VERSION } from './lib/auth';
import { balances } from './ledger';
import { vaultBalanceBase, chainConfig, suiscan } from './chain/vault';
import { ACHIEVEMENTS } from './progress-rules';

const guard = { preHandler: [requireUser, requireAdmin] };

const GameZ = z.enum(['chess', 'backgammon', 'tichu', 'seabattle']);
const ModeZ = z.enum(['practice', 'bot', 'pvp']);
const DayZ = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const Uuid = z.string().uuid();
const PageZ = {
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
};
const CurZ = z.enum(CURRENCIES).default('LOFI');
const Search = z.string().trim().max(80).optional().transform((s) => (s ? s : undefined));

/** ILIKE pattern with user wildcards escaped. */
const like = (s: string) => `%${s.replace(/[\\%_]/g, (c) => '\\' + c)}%`;

/** Builds a parameterised where clause. */
class Where {
  parts: string[] = [];
  params: unknown[] = [];
  add(sql: string, ...vals: unknown[]) {
    let s = sql;
    for (const v of vals) {
      this.params.push(v);
      s = s.replace('?', `$${this.params.length}`);
    }
    this.parts.push(s);
    return this;
  }
  next(v: unknown) {
    this.params.push(v);
    return `$${this.params.length}`;
  }
  get sql() {
    return this.parts.length ? `where ${this.parts.join(' and ')}` : '';
  }
}

const paged = <T extends { total?: number }>(rows: T[], page: number, limit: number) => ({
  rows: rows.map(({ total: _t, ...r }) => r),
  total: rows[0]?.total ?? 0,
  page,
  limit,
});

/** Union of everything we treat as "activity": sitting at a table, any ledger movement, signing in. */
const ACTIVITY = `
  select user_id, joined_at as at from table_seats where user_id is not null
  union all select user_id, created_at from ledger_transactions where user_id is not null
  union all select user_id, created_at from sessions`;

const TODAY = `((now() at time zone 'utc')::date)`;
const DAY = (col: string) => `((${col} at time zone 'utc')::date)`;
const DAYS = `select generate_series(${TODAY} - 29, ${TODAY}, interval '1 day')::date as d`;

/** Sum of fee_revenue entries for one table (in the table's own currency). */
const FEE_FOR_TABLE = (t: string) => `(select coalesce(sum(e.amount),0)::bigint from ledger_entries e
   join ledger_accounts a on a.id = e.account_id join ledger_transactions x on x.id = e.transaction_id
  where a.kind = 'fee_revenue' and x.table_id = ${t})`;

const LEGS = (t: string) => `(select coalesce(json_agg(json_build_object('account', a.kind, 'currency', a.currency, 'userId', a.user_id, 'tableId', a.table_id, 'amount', e.amount) order by e.id), '[]'::json)
   from ledger_entries e join ledger_accounts a on a.id = e.account_id where e.transaction_id = ${t})`;

const SEATS = (t: string) => `(select coalesce(json_agg(json_build_object('seat', s.seat, 'userId', s.user_id, 'name', coalesce(u.display_name, s.bot_name, 'Seat ' || s.seat), 'bot', s.is_bot, 'payout', s.payout) order by s.seat), '[]'::json)
   from table_seats s left join users u on u.id = s.user_id where s.table_id = ${t})`;

const vaultCache = new Map<Currency, { at: number; minor: number | null; error: string | null }>();
async function liveVault(c: Currency) {
  const hit = vaultCache.get(c);
  if (hit && Date.now() - hit.at < 15_000) return hit;
  let v: { at: number; minor: number | null; error: string | null };
  try {
    v = { at: Date.now(), minor: baseToMinor(await vaultBalanceBase(c), c), error: null };
  } catch (e) {
    v = { at: Date.now(), minor: null, error: (e as Error).message };
  }
  vaultCache.set(c, v);
  return v;
}

/** Vault on chain against everything held for others, for one currency. */
async function reserveRow(c: Currency) {
  const accounts = await q<{ kind: string; balance: number }>(
    pool,
    `select kind, coalesce(sum(balance),0)::bigint as balance from ledger_accounts
      where currency = $1 and kind in ('user_available','user_locked','game_escrow','house_bankroll','fee_revenue') group by kind`,
    [c],
  );
  const [lastCheck, vault] = await Promise.all([
    maybe(pool, `select id, vault_minor, liabilities_minor, ok, checked_at from reserve_checks where currency = $1 order by id desc limit 1`, [c]),
    liveVault(c),
  ]);
  const k = (kind: string) => accounts.find((a) => a.kind === kind)?.balance ?? 0;
  const owedToPlayers = k('user_available') + k('user_locked') + k('game_escrow');
  const held = owedToPlayers + k('house_bankroll') + k('fee_revenue');
  return {
    currency: c,
    vaultId: chainConfig().vaults[c].id,
    vaultUrl: suiscan('object', chainConfig().vaults[c].id),
    live: vault.minor,
    liveError: vault.error,
    liveAt: new Date(vault.at).toISOString(),
    owedToPlayers,
    houseBankroll: k('house_bankroll'),
    feeRevenue: k('fee_revenue'),
    available: k('user_available'),
    locked: k('user_locked'),
    escrow: k('game_escrow'),
    held,
    backed: vault.minor === null ? ((lastCheck as any)?.ok ?? null) : vault.minor >= held,
    lastCheck,
  };
}

export async function registerAdmin(app: FastifyInstance) {
  // ---------- config for the admin UI ----------
  app.get('/api/admin/config', guard, async () => ({
    network: env.SUI_NETWORK,
    packageId: chainConfig().packageId,
    gameAddress: chainConfig().gameAddress,
    termsVersion: TERMS_VERSION,
    limits: Object.fromEntries(CURRENCIES.map((c) => [c, { reviewAbove: CURRENCY[c].withdrawReviewAbove, userDailyWithdraw: CURRENCY[c].withdrawDaily }])),
    botHouseEdge: BOT_HOUSE_EDGE,
  }));

  /** Reserve check for both currencies side by side. Each row is its own vault and its own ledger. */
  app.get('/api/admin/vaults', guard, async () => ({ vaults: await Promise.all(CURRENCIES.map(reserveRow)) }));

  // ---------- dashboard ----------
  app.get('/api/admin/dashboard', guard, async (req) => {
    const { currency: cur } = z.object({ currency: CurZ }).parse(req.query);
    const [users, active, games, staked, fees, bot, money, vault] = await Promise.all([
      one(
        pool,
        `select count(*)::int as total,
                count(*) filter (where ${DAY('created_at')} = ${TODAY})::int as today,
                count(*) filter (where created_at > now() - interval '7 days')::int as d7,
                count(*) filter (where created_at > now() - interval '30 days')::int as d30,
                count(*) filter (where onboarded_at is not null)::int as onboarded
           from users where role = 'user'`,
      ),
      one(
        pool,
        `with a as (${ACTIVITY})
         select count(distinct a.user_id) filter (where ${DAY('a.at')} = ${TODAY})::int as today,
                count(distinct a.user_id) filter (where a.at > now() - interval '7 days')::int as d7,
                count(distinct a.user_id) filter (where a.at > now() - interval '30 days')::int as d30
           from a join users u on u.id = a.user_id and u.role = 'user'`,
      ),
      one(
        pool,
        `select count(*) filter (where status = 'settled' and ${DAY('ended_at')} = ${TODAY})::int as today,
                count(*) filter (where status = 'settled' and ended_at > now() - interval '7 days')::int as d7,
                count(*) filter (where status = 'settled' and ended_at > now() - interval '7 days' and mode <> 'practice' and currency = $1)::int as d7_credits,
                count(*) filter (where status = 'settled')::int as all_time,
                count(*) filter (where status = 'playing')::int as playing,
                count(*) filter (where status = 'waiting')::int as waiting
           from game_tables`,
        [cur],
      ),
      one(
        pool,
        `select coalesce(sum(t.stake),0)::bigint as all_time,
                coalesce(sum(t.stake) filter (where t.ended_at > now() - interval '30 days'),0)::bigint as d30
           from game_tables t join table_seats s on s.table_id = t.id and s.user_id is not null
          where t.status = 'settled' and t.mode <> 'practice' and t.currency = $1`,
        [cur],
      ),
      one(
        pool,
        `select coalesce(sum(e.amount),0)::bigint as all_time,
                coalesce(sum(e.amount) filter (where e.created_at > now() - interval '30 days'),0)::bigint as d30
           from ledger_entries e join ledger_accounts a on a.id = e.account_id where a.kind = 'fee_revenue' and a.currency = $1`,
        [cur],
      ),
      one(
        pool,
        `select count(*)::int as games,
                coalesce(sum(t.stake),0)::bigint as staked,
                coalesce(-sum(s.payout),0)::bigint as house,
                coalesce(stddev_samp(s.payout::float8 / t.stake), 0)::float8 as sd
           from game_tables t join table_seats s on s.table_id = t.id and s.user_id is not null
          where t.mode = 'bot' and t.status = 'settled' and t.stake > 0 and t.currency = $1`,
        [cur],
      ),
      one(
        pool,
        `select (select coalesce(sum(amount_minor),0)::bigint from deposits where kind = 'user' and status = 'credited' and currency = $1) as deposits,
                (select count(*)::int from deposits where kind = 'user' and status = 'credited' and currency = $1) as deposit_count,
                (select coalesce(sum(amount_minor),0)::bigint from deposits where kind = 'user' and status = 'credited' and currency = $1 and created_at > now() - interval '30 days') as deposits_30,
                (select coalesce(sum(amount_minor),0)::bigint from deposits where kind = 'house' and status = 'credited' and currency = $1) as house_funding,
                (select coalesce(sum(amount_minor),0)::bigint from withdrawals where status = 'confirmed' and currency = $1) as withdrawals,
                (select count(*)::int from withdrawals where status = 'confirmed' and currency = $1) as withdrawal_count,
                (select coalesce(sum(amount_minor),0)::bigint from withdrawals where status = 'confirmed' and currency = $1 and updated_at > now() - interval '30 days') as withdrawals_30,
                (select count(*)::int from withdrawals where status = 'review' and currency = $1) as review,
                (select coalesce(sum(amount_minor),0)::bigint from withdrawals where status = 'review' and currency = $1) as review_sum,
                (select count(*)::int from withdrawals where status in ('pending','submitted') and currency = $1) as in_flight`,
        [cur],
      ),
      reserveRow(cur),
    ]);

    const playerReturn = bot.staked ? -bot.house / bot.staked : null;
    // 95% range for the average player return over n independent games, around the disclosed -5%.
    const band = bot.games > 1 ? (1.96 * bot.sd) / Math.sqrt(bot.games) : null;

    return {
      users,
      active,
      games,
      staked,
      fees,
      bot: {
        games: bot.games,
        staked: bot.staked,
        house: bot.house,
        expectedHouse: Math.round(bot.staked * BOT_HOUSE_EDGE),
        playerReturn,
        disclosedReturn: -BOT_HOUSE_EDGE,
        band,
        minGames: 30,
        withinRange: playerReturn === null || band === null || bot.games < 30 ? null : Math.abs(playerReturn + BOT_HOUSE_EDGE) <= band,
      },
      money,
      currency: cur,
      vault,
    };
  });

  app.get('/api/admin/series', guard, async (req) => {
    const { currency: cur } = z.object({ currency: CurZ }).parse(req.query);
    const [signups, active, games, money, deposits] = await Promise.all([
      q(pool, `with days as (${DAYS}) select to_char(d, 'YYYY-MM-DD') as d, count(u.id)::int as n from days left join users u on ${DAY('u.created_at')} = d and u.role = 'user' group by d order by d`),
      q(
        pool,
        `with days as (${DAYS}), a as (${ACTIVITY})
         select to_char(d, 'YYYY-MM-DD') as d, count(distinct u.id)::int as n
           from days left join a on ${DAY('a.at')} = d left join users u on u.id = a.user_id and u.role = 'user' group by d order by d`,
      ),
      q(
        pool,
        `with days as (${DAYS})
         select to_char(d, 'YYYY-MM-DD') as d,
                count(t.id) filter (where t.game = 'chess')::int as chess,
                count(t.id) filter (where t.game = 'backgammon')::int as backgammon,
                count(t.id) filter (where t.game = 'tichu')::int as tichu,
                count(t.id) filter (where t.game = 'seabattle')::int as seabattle
           from days left join game_tables t on t.status = 'settled' and ${DAY('t.ended_at')} = d group by d order by d`,
      ),
      q(
        pool,
        `with days as (${DAYS}),
              st as (select ${DAY('t.ended_at')} as d, sum(t.stake)::bigint as staked
                       from game_tables t join table_seats s on s.table_id = t.id and s.user_id is not null
                      where t.status = 'settled' and t.mode <> 'practice' and t.currency = $1 group by 1),
              fe as (select ${DAY('e.created_at')} as d, sum(e.amount)::bigint as fees
                       from ledger_entries e join ledger_accounts a on a.id = e.account_id where a.kind = 'fee_revenue' and a.currency = $1 group by 1),
              ho as (select ${DAY('t.ended_at')} as d, (-sum(s.payout))::bigint as house
                       from game_tables t join table_seats s on s.table_id = t.id and s.user_id is not null
                      where t.status = 'settled' and t.mode = 'bot' and t.currency = $1 group by 1)
         select to_char(days.d, 'YYYY-MM-DD') as d, coalesce(st.staked,0)::bigint as staked, coalesce(fe.fees,0)::bigint as fees, coalesce(ho.house,0)::bigint as house
           from days left join st on st.d = days.d left join fe on fe.d = days.d left join ho on ho.d = days.d order by days.d`,
        [cur],
      ),
      q(
        pool,
        `with days as (${DAYS}),
              dep as (select ${DAY('x.created_at')} as d, sum(x.amount_minor)::bigint as s from deposits x where x.kind = 'user' and x.status = 'credited' and x.currency = $1 group by 1),
              wd as (select ${DAY('updated_at')} as d, sum(amount_minor)::bigint as s from withdrawals where status = 'confirmed' and currency = $1 group by 1)
         select to_char(days.d, 'YYYY-MM-DD') as d, coalesce(dep.s,0)::bigint as deposits, coalesce(wd.s,0)::bigint as withdrawals
           from days left join dep on dep.d = days.d left join wd on wd.d = days.d order by days.d`,
        [cur],
      ),
    ]);
    return { signups, active, games, money, deposits };
  });

  app.get('/api/admin/breakdown', guard, async (req) => {
    const { currency: cur } = z.object({ currency: CurZ }).parse(req.query);
    // Practice tables carry no money, so they are listed whatever the currency.
    const rows = await q(
      pool,
      `select t.game, t.mode, count(*)::int as games,
              avg(extract(epoch from (t.ended_at - t.started_at)))::float8 as avg_secs,
              coalesce(sum(t.stake * h.n),0)::bigint as staked,
              coalesce(sum(f.fee),0)::bigint as fees,
              coalesce(sum(h.net),0)::bigint as player_net,
              count(*) filter (where (t.result->'result'->>'draw') = 'true')::int as draws,
              count(*) filter (where t.result->'result'->'winners' @> '[0]'::jsonb)::int as seat0_wins,
              avg(coalesce((t.bot_meta->'disclosed'->'expected'->>'win')::float8, (t.bot_meta->'disclosed'->>'expectedWin')::float8))::float8 as target_win
         from game_tables t
         cross join lateral (select count(*)::int as n, coalesce(sum(payout),0)::bigint as net from table_seats where table_id = t.id and user_id is not null) h
         cross join lateral (select ${FEE_FOR_TABLE('t.id')} as fee) f
        where t.status = 'settled' and (t.mode = 'practice' or t.currency = $1)
        group by t.game, t.mode order by t.game, t.mode`,
      [cur],
    );
    // In practice and bot games the player always sits in seat 0. In pvp a win rate says nothing about the house.
    return rows.map((r: any) => ({
      ...r,
      player_win_rate: r.mode === 'pvp' || !r.games ? null : r.seat0_wins / r.games,
      target_win: r.mode === 'pvp' ? null : r.target_win,
    }));
  });

  // ---------- accounts ----------
  const AccountsQ = z.object({
    q: Search,
    role: z.enum(['user', 'admin', 'house']).optional(),
    status: z.enum(['cooloff', 'excluded', 'limits', 'not_onboarded', 'review']).optional(),
    sort: z.enum(['created', 'active', 'balance', 'games', 'deposits', 'net']).default('created'),
    currency: CurZ,
    ...PageZ,
  });
  app.get('/api/admin/accounts', guard, async (req) => {
    const a = AccountsQ.parse(req.query);
    const w = new Where();
    if (a.q) {
      const p = w.next(like(a.q));
      const exact = w.next(a.q);
      w.parts.push(`(u.display_name ilike ${p} or u.wallet_address ilike ${p} or u.id::text = ${exact})`);
    }
    if (a.role) w.add(`u.role = ?`, a.role);
    if (a.status === 'cooloff') w.add(`u.cooloff_until > now()`);
    if (a.status === 'excluded') w.add(`u.excluded_until > now()`);
    if (a.status === 'limits') w.add(`exists (select 1 from user_limits l where l.user_id = u.id and (l.deposit_daily is not null or l.loss_daily is not null or l.loss_weekly is not null))`);
    if (a.status === 'not_onboarded') w.add(`(u.terms_version is distinct from ? or u.age_confirmed_at is null)`, TERMS_VERSION);
    if (a.status === 'review') w.add(`exists (select 1 from withdrawals x where x.user_id = u.id and x.status = 'review')`);
    const order = {
      created: 'u.created_at desc',
      active: 'act.last desc nulls last',
      balance: 'bal.available + bal.locked desc',
      games: 'g.games desc',
      deposits: 'd.total desc',
      net: 'g.net desc',
    }[a.sort];
    const tv = w.next(TERMS_VERSION);
    const cp = w.next(a.currency);
    const lim = w.next(a.limit);
    const off = w.next((a.page - 1) * a.limit);
    const rows = await q(
      pool,
      `select u.id, u.display_name, u.avatar, u.wallet_address, u.wallet_kind, u.role, u.created_at,
              (u.age_confirmed_at is not null and u.terms_accepted_at is not null and u.terms_version = ${tv}) as onboarded,
              coalesce(u.cooloff_until > now(), false) as cooloff, u.cooloff_until,
              coalesce(u.excluded_until > now(), false) as excluded, u.excluded_until,
              exists (select 1 from user_limits l where l.user_id = u.id and (l.deposit_daily is not null or l.loss_daily is not null or l.loss_weekly is not null)) as has_limits,
              bal.available, bal.locked, g.games, g.net, d.total as deposits, d.n as deposit_count, wd.total as withdrawals, wd.n as withdrawal_count,
              act.last as last_active, count(*) over()::int as total
         from users u
         cross join lateral (select coalesce(sum(balance) filter (where kind = 'user_available'),0)::bigint as available,
                                    coalesce(sum(balance) filter (where kind = 'user_locked'),0)::bigint as locked
                               from ledger_accounts where user_id = u.id and table_id is null and currency = ${cp}) bal
         cross join lateral (select count(*)::int as games, coalesce(sum(s.payout) filter (where t.currency = ${cp}),0)::bigint as net
                               from table_seats s join game_tables t on t.id = s.table_id where s.user_id = u.id and t.status = 'settled') g
         cross join lateral (select coalesce(sum(amount_minor),0)::bigint as total, count(*)::int as n from deposits where user_id = u.id and status = 'credited' and currency = ${cp}) d
         cross join lateral (select coalesce(sum(amount_minor),0)::bigint as total, count(*)::int as n from withdrawals where user_id = u.id and status = 'confirmed' and currency = ${cp}) wd
         cross join lateral (select greatest((select max(joined_at) from table_seats where user_id = u.id),
                                             (select max(created_at) from ledger_transactions where user_id = u.id),
                                             (select max(created_at) from sessions where user_id = u.id)) as last) act
         ${w.sql}
         order by ${order}, u.created_at desc
         limit ${lim} offset ${off}`,
      w.params,
    );
    return paged(rows, a.page, a.limit);
  });

  app.get('/api/admin/accounts/:id', guard, async (req, reply) => {
    const { id } = z.object({ id: Uuid }).parse(req.params);
    const { currency: cur } = z.object({ currency: CurZ }).parse(req.query);
    const u = await maybe<any>(
      pool,
      `select u.id, u.wallet_address, u.wallet_kind, u.google_sub is not null as google_linked, u.display_name, u.avatar, u.role,
              u.age_confirmed_at, u.terms_version, u.terms_accepted_at, u.onboarded_at, u.created_at,
              u.cooloff_until, u.excluded_until, l.deposit_daily as limit_deposit_daily, l.loss_daily as limit_loss_daily, l.loss_weekly as limit_loss_weekly, u.ratings,
              l.pending as pending_limits, l.pending_at as pending_limits_at,
              (select max(created_at) from faucet_claims f where f.user_id = u.id) as last_faucet_at, u.settings->>'theme' as theme, u.settings->>'sound' as sound
         from users u left join user_limits l on l.user_id = u.id and l.currency = $2 where u.id = $1`,
      [id, cur],
    );
    if (!u) return reply.code(404).send({ error: 'not_found', message: 'No account with that id.' });
    const [bal, sessions, summary, progress, stats, achievements, last] = await Promise.all([
      balances(pool, id),
      one(pool, `select count(*) filter (where expires_at > now())::int as active, max(created_at) as last_sign_in from sessions where user_id = $1`, [id]),
      one(
        pool,
        `select (select count(*)::int from table_seats s join game_tables t on t.id = s.table_id where s.user_id = $1 and t.status = 'settled') as games,
                (select count(*)::int from table_seats s join game_tables t on t.id = s.table_id where s.user_id = $1 and t.status = 'settled' and t.mode <> 'practice' and t.currency = $2) as credit_games,
                (select coalesce(sum(s.payout),0)::bigint from table_seats s join game_tables t on t.id = s.table_id where s.user_id = $1 and t.status = 'settled' and t.currency = $2) as net,
                (select coalesce(sum(s.payout),0)::bigint from table_seats s join game_tables t on t.id = s.table_id where s.user_id = $1 and t.status = 'settled' and t.currency = $2 and t.ended_at > now() - interval '1 day') as net_24h,
                (select coalesce(sum(s.payout),0)::bigint from table_seats s join game_tables t on t.id = s.table_id where s.user_id = $1 and t.status = 'settled' and t.currency = $2 and t.ended_at > now() - interval '7 days') as net_7d,
                (select coalesce(sum(t.stake),0)::bigint from table_seats s join game_tables t on t.id = s.table_id where s.user_id = $1 and t.status = 'settled' and t.mode <> 'practice' and t.currency = $2) as staked,
                (select coalesce(sum(amount_minor),0)::bigint from deposits where user_id = $1 and status = 'credited' and currency = $2) as deposits,
                (select count(*)::int from deposits where user_id = $1 and status = 'credited' and currency = $2) as deposit_count,
                (select coalesce(sum(amount_minor),0)::bigint from deposits where user_id = $1 and status = 'credited' and currency = $2 and created_at > now() - interval '1 day') as deposits_24h,
                (select coalesce(sum(amount_minor),0)::bigint from withdrawals where user_id = $1 and status = 'confirmed' and currency = $2) as withdrawals,
                (select count(*)::int from withdrawals where user_id = $1 and status = 'confirmed' and currency = $2) as withdrawal_count,
                (select count(*)::int from withdrawals where user_id = $1 and status in ('review','pending','submitted') and currency = $2) as open_withdrawals`,
        [id, cur],
      ),
      maybe(pool, `select xp, level, equipped, updated_at from user_progress where user_id = $1`, [id]),
      q(pool, `select game, games, wins, draws, losses, win_streak, best_streak, xp from user_game_stats where user_id = $1 order by game`, [id]),
      q<{ code: string; unlocked_at: string; table_id: string | null }>(pool, `select code, unlocked_at, table_id from user_achievements where user_id = $1 order by unlocked_at desc`, [id]),
      one(
        pool,
        `select greatest((select max(joined_at) from table_seats where user_id = $1),
                         (select max(created_at) from ledger_transactions where user_id = $1),
                         (select max(created_at) from sessions where user_id = $1)) as last_active`,
        [id],
      ),
    ]);
    const names = new Map(ACHIEVEMENTS.map((x) => [x.code, x]));
    return {
      user: { ...u, onboarded: !!(u.age_confirmed_at && u.terms_accepted_at && u.terms_version === TERMS_VERSION), last_active: last.last_active },
      currency: cur,
      balance: bal[cur],
      balances: bal,
      sessions,
      summary,
      progress,
      stats,
      achievements: achievements.map((x) => ({ ...x, name: names.get(x.code)?.name ?? x.code, how: names.get(x.code)?.how ?? null, game: names.get(x.code)?.game ?? null })),
      achievementTotal: ACHIEVEMENTS.length,
    };
  });

  // ---------- games ----------
  const GamesQ = z.object({
    game: GameZ.optional(),
    mode: ModeZ.optional(),
    currency: z.enum(CURRENCIES).optional(),
    status: z.enum(['waiting', 'playing', 'settled', 'cancelled']).optional(),
    stakeMin: z.coerce.number().int().min(0).max(1e12).optional(),
    stakeMax: z.coerce.number().int().min(0).max(1e12).optional(),
    from: DayZ.optional(),
    to: DayZ.optional(),
    player: Search,
    userId: Uuid.optional(),
    ...PageZ,
  });
  app.get('/api/admin/games', guard, async (req) => {
    const a = GamesQ.parse(req.query);
    const w = new Where();
    if (a.game) w.add(`t.game = ?`, a.game);
    if (a.mode) w.add(`t.mode = ?`, a.mode);
    if (a.currency) w.add(`t.currency = ?`, a.currency);
    if (a.status) w.add(`t.status = ?`, a.status);
    if (a.stakeMin !== undefined) w.add(`t.stake >= ?`, a.stakeMin);
    if (a.stakeMax !== undefined) w.add(`t.stake <= ?`, a.stakeMax);
    if (a.from) w.add(`t.created_at >= (?::date)::timestamp at time zone 'utc'`, a.from);
    if (a.to) w.add(`t.created_at < ((?::date + 1)::timestamp at time zone 'utc')`, a.to);
    if (a.userId) w.add(`exists (select 1 from table_seats s where s.table_id = t.id and s.user_id = ?)`, a.userId);
    if (a.player) {
      const p = w.next(like(a.player));
      w.parts.push(`exists (select 1 from table_seats s join users u on u.id = s.user_id where s.table_id = t.id and (u.display_name ilike ${p} or u.wallet_address ilike ${p}))`);
    }
    const lim = w.next(a.limit);
    const off = w.next((a.page - 1) * a.limit);
    const rows = await q(
      pool,
      `select t.id, t.game, t.mode, t.currency, t.stake, t.fee, t.status, t.visibility, t.capacity, t.time_control, t.bot_level,
              t.created_at, t.started_at, t.ended_at, t.result->'result' as result,
              extract(epoch from (coalesce(t.ended_at, case when t.status = 'playing' then now() end) - t.started_at))::float8 as secs,
              ${SEATS('t.id')} as seats, ${FEE_FOR_TABLE('t.id')} as fee_taken,
              (select count(*)::int from game_moves m where m.table_id = t.id) as moves,
              count(*) over()::int as total
         from game_tables t ${w.sql}
        order by t.created_at desc limit ${lim} offset ${off}`,
      w.params,
    );
    return paged(rows, a.page, a.limit);
  });

  app.get('/api/admin/games/:id', guard, async (req, reply) => {
    const { id } = z.object({ id: Uuid }).parse(req.params);
    // server_seed is deliberately not selected: it is secret while a game is live, and the public verify page reveals it after.
    const t = await maybe<any>(
      pool,
      `select t.id, t.game, t.mode, t.currency, t.stake, t.fee, t.status, t.visibility, t.capacity, t.time_control, t.bot_level,
              t.bot_meta->'disclosed' as disclosed, t.seed_commit, jsonb_array_length(t.client_seeds)::int as client_seed_count,
              t.result, t.created_at, t.started_at, t.ended_at, t.created_by, cu.display_name as created_by_name,
              extract(epoch from (coalesce(t.ended_at, case when t.status = 'playing' then now() end) - t.started_at))::float8 as secs,
              ${FEE_FOR_TABLE('t.id')} as fee_taken
         from game_tables t left join users cu on cu.id = t.created_by where t.id = $1`,
      [id],
    );
    if (!t) return reply.code(404).send({ error: 'not_found', message: 'No game with that id.' });
    const [seats, moves, txs] = await Promise.all([
      q(
        pool,
        `select s.seat, s.user_id, s.is_bot, s.bot_name, s.joined_at, s.payout, u.display_name, u.wallet_address, u.avatar
           from table_seats s left join users u on u.id = s.user_id where s.table_id = $1 order by s.seat`,
        [id],
      ),
      one(
        pool,
        `select count(*)::int as n, max(created_at) as last_at, avg(think_ms)::float8 as avg_think_ms,
                (select coalesce(json_agg(json_build_object('seat', seat, 'n', c) order by seat), '[]'::json)
                   from (select seat, count(*)::int as c from game_moves where table_id = $1 group by seat) b) as by_seat
           from game_moves where table_id = $1`,
        [id],
      ),
      q(pool, `select x.id, x.kind, x.currency, x.memo, x.created_at, ${LEGS('x.id')} as legs from ledger_transactions x where x.table_id = $1 order by x.created_at`, [id]),
    ]);
    return { table: t, seats, moves, transactions: txs };
  });

  // ---------- money ----------
  const MoneyQ = z.object({ userId: Uuid.optional(), q: Search, currency: CurZ, ...PageZ });

  app.get('/api/admin/money/deposits', guard, async (req) => {
    const a = MoneyQ.extend({ status: z.enum(['credited', 'rejected']).optional() }).parse(req.query);
    const w = new Where();
    w.add(`d.currency = ?`, a.currency);
    if (a.userId) w.add(`d.user_id = ?`, a.userId);
    if (a.status) w.add(`d.status = ?`, a.status);
    if (a.q) {
      const p = w.next(like(a.q));
      w.parts.push(`(u.display_name ilike ${p} or d.sender ilike ${p} or d.digest ilike ${p})`);
    }
    const lim = w.next(a.limit);
    const off = w.next((a.page - 1) * a.limit);
    const rows = await q(
      pool,
      `select d.digest, d.event_seq, d.currency, d.kind, d.user_id, coalesce(u.display_name, 'House') as display_name, d.sender as wallet_address,
              d.amount_minor, d.checkpoint, d.status, d.transaction_id, d.created_at,
              count(*) over()::int as total
         from deposits d left join users u on u.id = d.user_id ${w.sql}
        order by d.created_at desc limit ${lim} offset ${off}`,
      w.params,
    );
    return paged(rows, a.page, a.limit);
  });

  app.get('/api/admin/money/withdrawals', guard, async (req) => {
    const a = MoneyQ.extend({ status: z.enum(['review', 'pending', 'submitted', 'confirmed', 'expired', 'rejected', 'open']).optional() }).parse(req.query);
    const w = new Where();
    w.add(`w.currency = ?`, a.currency);
    if (a.userId) w.add(`w.user_id = ?`, a.userId);
    if (a.status === 'open') w.add(`w.status in ('review','pending','submitted')`);
    else if (a.status) w.add(`w.status = ?`, a.status);
    if (a.q) {
      const p = w.next(like(a.q));
      w.parts.push(`(u.display_name ilike ${p} or u.wallet_address ilike ${p} or w.tx_digest ilike ${p})`);
    }
    const lim = w.next(a.limit);
    const off = w.next((a.page - 1) * a.limit);
    // ticket_sig is never selected: it authorises a payout from the vault.
    const [rows, counts] = await Promise.all([
      q(
        pool,
        `select w.id, w.user_id, u.display_name, u.wallet_address, w.currency, w.amount_minor, w.nonce::text as nonce, w.expiry, w.status,
                w.tx_digest, w.created_at, w.updated_at, (w.ticket_sig is not null) as ticket_issued,
                count(*) over()::int as total
           from withdrawals w join users u on u.id = w.user_id ${w.sql}
          order by (w.status = 'review') desc, w.created_at desc limit ${lim} offset ${off}`,
        w.params,
      ),
      q(pool, `select status, count(*)::int as n, coalesce(sum(amount_minor),0)::bigint as amount from withdrawals where currency = $1 ${a.userId ? 'and user_id = $2' : ''} group by status`, a.userId ? [a.currency, a.userId] : [a.currency]),
    ]);
    return { ...paged(rows, a.page, a.limit), counts };
  });

  app.get('/api/admin/money/transactions', guard, async (req) => {
    const a = MoneyQ.extend({
      kind: z.enum(['deposit', 'withdraw_lock', 'withdraw_release', 'withdraw_complete', 'game_start', 'game_settle', 'game_refund', 'bankroll_fund', 'bankroll_withdraw', 'adjustment']).optional(),
      tableId: Uuid.optional(),
    }).parse(req.query);
    const w = new Where();
    w.add(`x.currency = ?`, a.currency);
    if (a.kind) w.add(`x.kind = ?`, a.kind);
    if (a.tableId) w.add(`x.table_id = ?`, a.tableId);
    if (a.userId)
      w.add(`exists (select 1 from ledger_entries e join ledger_accounts ac on ac.id = e.account_id where e.transaction_id = x.id and ac.user_id = ?)`, a.userId);
    if (a.q) {
      const p = w.next(like(a.q));
      w.parts.push(`(x.memo ilike ${p} or x.idempotency_key ilike ${p} or x.id::text ilike ${p})`);
    }
    const uid = w.next(a.userId ?? null);
    const lim = w.next(a.limit);
    const off = w.next((a.page - 1) * a.limit);
    const rows = await q(
      pool,
      `select x.id, x.kind, x.currency, x.memo, x.created_at, x.table_id, x.user_id, u.display_name, x.idempotency_key, ${LEGS('x.id')} as legs,
              (select coalesce(sum(e.amount),0)::bigint from ledger_entries e join ledger_accounts ac on ac.id = e.account_id
                where e.transaction_id = x.id and ac.kind = 'user_available' and ac.user_id = coalesce(${uid}::uuid, x.user_id)) as available_delta,
              count(*) over()::int as total
         from ledger_transactions x left join users u on u.id = x.user_id ${w.sql}
        order by x.created_at desc, x.id limit ${lim} offset ${off}`,
      w.params,
    );
    return paged(rows, a.page, a.limit);
  });

  app.get('/api/admin/money/reserve', guard, async (req) => {
    const a = z.object({ currency: CurZ, ...PageZ }).parse(req.query);
    const rows = await q(
      pool,
      `select id, currency, vault_minor, liabilities_minor, ok, checked_at, count(*) over()::int as total
         from reserve_checks where currency = $3 order by id desc limit $1 offset $2`,
      [a.limit, (a.page - 1) * a.limit, a.currency],
    );
    const fails = await one(pool, `select count(*) filter (where not ok)::int as failed, count(*)::int as total, min(checked_at) as first from reserve_checks where currency = $1`, [a.currency]);
    return { ...paged(rows, a.page, a.limit), summary: fails };
  });
}
