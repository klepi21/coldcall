import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import rateLimit from '@fastify/rate-limit';
import { z, ZodError } from 'zod';
import {
  CreateTableZ,
  QuickMatchZ,
  JoinTableZ,
  WithdrawRequestZ,
  DepositConfirmZ,
  ClientMsgZ,
  GameKindZ,
  EquipZ,
} from '@coldcall/shared';
import { commitFor, chessEngine, backgammonEngine, tichuEngine, Rng } from '@coldcall/games';
import { env } from './env';
import { log } from './lib/log';
import { pool, q, one, maybe } from './db/pool';
import { migrate } from './db/migrate';
import {
  COOKIE,
  TERMS_VERSION,
  createNonce,
  verifySignIn,
  setSessionCookie,
  sessionUser,
  requireUser,
  requireAdmin,
  publicUser,
} from './lib/auth';
import { balances, liabilities, InsufficientFunds } from './ledger';
import {
  createTable,
  joinTable,
  leaveTable,
  quickMatch,
  fillWithBots,
  playerMove,
  resign,
  watch,
  unwatch,
  react,
  tableSummary,
  lobbyTables,
  recoverRooms,
  userSockets,
  UserError,
  _rooms,
} from './games/rooms';
import {
  buildDeposit,
  creditDeposit,
  requestWithdrawal,
  reissueTicket,
  confirmWithdrawal,
  sweepWithdrawals,
  scanDeposits,
  reserveCheck,
  walletOverview,
  buildSend,
  portfolio,
} from './wallet';
import { faucet, chainConfig, connection, tokenBalanceBase, vaultBalanceBase } from './chain/vault';
import { chessBotFor, levelFor } from './games/calibration';
import { stockfishEval, stopStockfish } from './games/stockfish';
import { getProgress, getAward, equip, EquipError } from './progress';

const app = Fastify({ loggerInstance: log as any, trustProxy: true });

await app.register(cookie);
await app.register(cors, { origin: env.WEB_ORIGIN, credentials: true });
await app.register(rateLimit, { max: 300, timeWindow: '1 minute' });
await app.register(websocket);

app.decorateRequest('user', null);
app.addHook('preHandler', async (req) => {
  req.user = await sessionUser(req.cookies[COOKIE]);
});

app.setErrorHandler((err, _req, reply) => {
  if (err instanceof UserError) return reply.code(err.status).send({ error: err.code, message: err.message });
  if (err instanceof InsufficientFunds)
    return reply.code(402).send({
      error: 'insufficient_funds',
      message: `You need ${(err.needed / 100).toFixed(2)} credits for this. You have ${(err.available / 100).toFixed(2)}. Add money or pick a smaller stake.`,
    });
  if (err instanceof ZodError) return reply.code(400).send({ error: 'invalid', message: 'Some details were not valid. Please check and try again.', issues: err.issues });
  if ((err as any).statusCode === 429) return reply.code(429).send({ error: 'rate_limited', message: 'Slow down a little and try again in a moment.' });
  log.error(err);
  return reply.code(500).send({ error: 'server', message: 'Something went wrong on our side. Your money is safe. Please try again.' });
});

// ---------- public ----------
app.get('/api/health', async () => ({ ok: true }));
app.get('/api/config', async () => {
  const c = chainConfig();
  return { cluster: c.cluster, rpc: env.PUBLIC_SOLANA_RPC ?? (env.SOLANA_RPC.includes('api-key') ? 'https://api.devnet.solana.com' : env.SOLANA_RPC), programId: c.programId, mint: c.mint, vault: c.vault, termsVersion: TERMS_VERSION };
});

app.get('/api/stats', async () => {
  const online = new Set<string>();
  for (const set of userSockets.keys()) online.add(set);
  const playing = (await one<{ n: number }>(pool, `select count(*)::int as n from game_tables where status='playing'`)).n;
  const totals = await one<{ games: number; paid: number }>(
    pool,
    `select (select count(*)::int from game_tables where status='settled') as games,
            (select coalesce(sum(payout),0)::bigint from table_seats where payout > 0) as paid`,
  );
  // Real recent wins only, first letter of the display name for privacy.
  const recent = await q<{ name: string; game: string; amount: number; at: string; mode: string }>(
    pool,
    `select left(u.display_name, 1) || '.' as name, t.game, s.payout as amount, t.ended_at as at, t.mode
       from table_seats s join game_tables t on t.id = s.table_id join users u on u.id = s.user_id
      where s.payout > 0 and t.status = 'settled' and u.role = 'user'
      order by t.ended_at desc limit 12`,
  );
  return { online: online.size, playing, gamesPlayed: totals.games, creditsWon: totals.paid, recentWins: recent };
});

/** Live on-chain vault balance (cached 10s) next to what the platform owes. */
let vaultCache: { at: number; data: unknown } | null = null;
app.get('/api/vault', async () => {
  if (vaultCache && Date.now() - vaultCache.at < 10_000) return vaultCache.data;
  const base = await vaultBalanceBase();
  const owed = await liabilities(pool);
  const data = { usdc: Number(base) / 1_000_000, minor: Number(base / 100n), owedMinor: owed, backed: Number(base / 100n) >= owed, at: new Date().toISOString() };
  vaultCache = { at: Date.now(), data };
  return data;
});

app.get('/api/reserve', async () => {
  const last = await maybe<any>(pool, `select * from reserve_checks order by id desc limit 1`);
  return last ?? (await reserveCheck());
});

// ---------- auth ----------
app.get('/api/auth/nonce', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req) => {
  const { address } = z.object({ address: z.string().min(32).max(44) }).parse(req.query);
  return createNonce(address);
});

app.post('/api/auth/verify', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req, reply) => {
  const b = z
    .object({ address: z.string(), nonce: z.string(), issuedAt: z.string(), signature: z.string(), walletKind: z.string().default('external') })
    .parse(req.body);
  const r = await verifySignIn(b.address, b.nonce, b.issuedAt, b.signature, b.walletKind);
  if (!r) return reply.code(401).send({ error: 'bad_signature', message: 'We could not confirm that signature. Please try signing in again.' });
  setSessionCookie(reply, r.sid);
  return { user: publicUser(r.user) };
});

app.post('/api/auth/logout', async (req, reply) => {
  const sid = req.cookies[COOKIE];
  if (sid) await q(pool, `delete from sessions where id=$1`, [sid]);
  reply.clearCookie(COOKIE, { path: '/' });
  return { ok: true };
});

// ---------- me ----------
app.get('/api/me', { preHandler: requireUser }, async (req) => {
  const b = await balances(pool, req.user.id);
  return { user: publicUser(req.user), balance: b };
});

app.post('/api/me/onboard', { preHandler: requireUser }, async (req) => {
  const b = z
    .object({ displayName: z.string().trim().min(2).max(20).regex(/^[\p{L}\p{N} _.]+$/u), ageConfirmed: z.literal(true), termsAccepted: z.literal(true) })
    .parse(req.body);
  const u = await one(
    pool,
    `update users set display_name=$2, age_confirmed_at=coalesce(age_confirmed_at, now()), terms_accepted_at=now(), terms_version=$3, onboarded_at=coalesce(onboarded_at, now()) where id=$1 returning *`,
    [req.user.id, b.displayName, TERMS_VERSION],
  );
  return { user: publicUser(u) };
});

app.patch('/api/me', { preHandler: requireUser }, async (req) => {
  const b = z
    .object({
      displayName: z.string().trim().min(2).max(20).regex(/^[\p{L}\p{N} _.]+$/u).optional(),
      avatar: z.enum(['laurel', 'owl', 'olive', 'wave', 'sun', 'column', 'amphora', 'star']).optional(),
      settings: z.object({ sound: z.boolean().optional(), theme: z.enum(['system', 'dark', 'light']).optional(), confirmMoves: z.boolean().optional(), boardTheme: z.enum(['marble', 'night']).optional(), hints: z.boolean().optional(), render3d: z.boolean().optional() }).optional(),
    })
    .parse(req.body);
  const u = await one(
    pool,
    `update users set display_name=coalesce($2, display_name), avatar=coalesce($3, avatar), settings = settings || $4::jsonb where id=$1 returning *`,
    [req.user.id, b.displayName ?? null, b.avatar ?? null, JSON.stringify(b.settings ?? {})],
  );
  return { user: publicUser(u) };
});

app.post('/api/me/limits', { preHandler: requireUser }, async (req) => {
  const n = z.number().int().positive().nullable();
  const b = z.object({ depositDaily: n, lossDaily: n, lossWeekly: n }).parse(req.body);
  // Lowering a limit applies now. Raising or removing one waits 24 hours (standard safer play rule).
  const u = req.user;
  const lower = (cur: number | null, next: number | null) => next !== null && (cur === null || next <= cur);
  const apply = (cur: number | null, next: number | null) => (lower(cur, next) ? next : cur);
  const pending: Record<string, number | null> = {};
  for (const [k, col] of [['depositDaily', 'limit_deposit_daily'], ['lossDaily', 'limit_loss_daily'], ['lossWeekly', 'limit_loss_weekly']] as const)
    if (!lower(u[col], b[k]) && u[col] !== b[k]) pending[k] = b[k];
  const updated = await one(
    pool,
    `update users set limit_deposit_daily=$2, limit_loss_daily=$3, limit_loss_weekly=$4,
       settings = settings || jsonb_build_object('pendingLimits', $5::jsonb, 'pendingLimitsAt', now() + interval '24 hours') where id=$1 returning *`,
    [u.id, apply(u.limit_deposit_daily, b.depositDaily), apply(u.limit_loss_daily, b.lossDaily), apply(u.limit_loss_weekly, b.lossWeekly), JSON.stringify(Object.keys(pending).length ? pending : null)],
  );
  return { user: publicUser(updated), pending };
});

app.post('/api/me/cooloff', { preHandler: requireUser }, async (req) => {
  const { hours } = z.object({ hours: z.union([z.literal(24), z.literal(168), z.literal(720)]) }).parse(req.body);
  const u = await one(pool, `update users set cooloff_until = now() + ($2 || ' hours')::interval where id=$1 returning *`, [req.user.id, String(hours)]);
  return { user: publicUser(u) };
});

app.post('/api/me/exclude', { preHandler: requireUser }, async (req) => {
  const { months } = z.object({ months: z.union([z.literal(6), z.literal(12)]) }).parse(req.body);
  const u = await one(pool, `update users set excluded_until = now() + ($2 || ' months')::interval where id=$1 returning *`, [req.user.id, String(months)]);
  return { user: publicUser(u) };
});

app.get('/api/me/history', { preHandler: requireUser }, async (req) => {
  return q(
    pool,
    `select t.id, t.game, t.mode, t.stake, t.fee, t.status, t.result, t.created_at, t.ended_at, s.seat, s.payout
       from table_seats s join game_tables t on t.id = s.table_id
      where s.user_id=$1 order by t.created_at desc limit 50`,
    [req.user.id],
  );
});

// ---------- progress (XP, levels, achievements, daily challenges, cosmetics; never money) ----------
app.get('/api/progress', { preHandler: requireUser }, async (req) => getProgress(req.user.id));

app.get('/api/progress/award/:tableId', { preHandler: requireUser }, async (req, reply) => {
  const { tableId } = z.object({ tableId: z.string().uuid() }).parse(req.params);
  const a = await getAward(req.user.id, tableId);
  if (!a) return reply.code(404).send({ error: 'not_found', message: 'No XP for this game yet.' });
  return a;
});

app.post('/api/progress/equip', { preHandler: requireUser }, async (req) => {
  const b = EquipZ.parse(req.body);
  try {
    return await equip(req.user.id, b.slot, b.id);
  } catch (e) {
    if (e instanceof EquipError) throw new UserError(e.message, 'locked', 400);
    throw e;
  }
});

// ---------- wallet ----------
app.get('/api/wallet', { preHandler: requireUser }, async (req) => {
  const o = await walletOverview(req.user.id, req.user.wallet_address);
  const [tokens, sol] = await Promise.all([tokenBalanceBase(req.user.wallet_address), connection.getBalance(new (await import('@solana/web3.js')).PublicKey(req.user.wallet_address))]);
  return { ...o, walletTokens: Number(tokens / 100n), walletSol: sol / 1e9 };
});

app.post('/api/wallet/faucet', { preHandler: requireUser, config: { rateLimit: { max: 3, timeWindow: '1 minute' } } }, async (req) => {
  const last = req.user.settings?.lastFaucetAt ? new Date(req.user.settings.lastFaucetAt).getTime() : 0;
  if (Date.now() - last < 20 * 3600_000 && env.SOLANA_CLUSTER !== 'localnet')
    throw new UserError('You can get free test money once a day. Come back tomorrow.', 'faucet_limit', 429);
  const r = await faucet(req.user.wallet_address, env.FAUCET_TOKENS);
  await q(pool, `update users set settings = settings || jsonb_build_object('lastFaucetAt', now()) where id=$1`, [req.user.id]);
  return { ok: true, tokens: env.FAUCET_TOKENS, signature: r.signature };
});

app.post('/api/wallet/deposit/build', { preHandler: requireUser }, async (req) => {
  const { amount } = z.object({ amount: z.number().int().min(100).max(10_000_000) }).parse(req.body);
  return buildDeposit(req.user.id, req.user.wallet_address, amount);
});

app.post('/api/wallet/send/build', { preHandler: requireUser, config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req) => {
  // amount in USDC base units (6 decimals), as a string to stay exact
  const { to, amount, asset } = z
    .object({ to: z.string().min(32).max(44), amount: z.string().regex(/^\d{1,20}$/), asset: z.union([z.literal('SOL'), z.literal('USDC'), z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/)]).default('USDC') })
    .parse(req.body);
  const base = BigInt(amount);
  if (base <= 0n) throw new UserError('Enter an amount above zero.', 'too_small');
  return buildSend(req.user.wallet_address, to, base, asset);
});

app.get('/api/wallet/portfolio', { preHandler: requireUser }, async (req) => {
  return { items: await portfolio(req.user.wallet_address) };
});

app.post('/api/wallet/deposit/confirm', { preHandler: requireUser }, async (req) => {
  const { signature } = DepositConfirmZ.parse(req.body);
  for (let i = 0; i < 10; i++) {
    const r = await creditDeposit(signature);
    if (r.credited || (await maybe(pool, `select 1 from deposits where signature=$1`, [signature]))) return { ok: true, amount: r.amount };
    await new Promise((res) => setTimeout(res, 1000));
  }
  throw new UserError('We are still waiting for the network to confirm your deposit. It will show up automatically.', 'pending', 202);
});

app.post('/api/wallet/withdraw', { preHandler: requireUser }, async (req) => {
  const { amount } = WithdrawRequestZ.parse(req.body);
  return requestWithdrawal(req.user.id, req.user.wallet_address, amount);
});
app.post('/api/wallet/withdraw/:id/ticket', { preHandler: requireUser }, async (req) => {
  const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
  return reissueTicket(req.user.id, req.user.wallet_address, id);
});
app.post('/api/wallet/withdraw/:id/confirm', { preHandler: requireUser }, async (req) => {
  const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
  const { signature } = DepositConfirmZ.parse(req.body);
  for (let i = 0; i < 10; i++) {
    try {
      return await confirmWithdrawal(req.user.id, req.user.wallet_address, id, signature);
    } catch (e) {
      if (!(e instanceof UserError) || e.code !== 'not_found_onchain' || i === 9) throw e;
      await new Promise((res) => setTimeout(res, 1000));
    }
  }
});

// ---------- tables ----------
app.get('/api/tables', async (req) => {
  const { game } = z.object({ game: GameKindZ.optional() }).parse(req.query);
  return lobbyTables(game);
});

app.get('/api/bot-info', { preHandler: requireUser }, async (req) => {
  const { game } = z.object({ game: GameKindZ }).parse(req.query);
  const rating = req.user.ratings?.[game]?.r ?? 1500;
  const bank = (await maybe<{ balance: number }>(pool, `select balance from ledger_accounts where kind='house_bankroll' and user_id is null and table_id is null`))?.balance ?? 0;
  const botCap = Math.min(500_000, Math.floor(bank * 0.01));
  if (game === 'chess') {
    const s = chessBotFor(rating);
    return { rating, engineElo: s.elo, expected: s.expected, botCap };
  }
  const l = levelFor(rating);
  return { rating, level: l.level, expected: { win: l.expectedWin, draw: 0, loss: 1 - l.expectedWin }, botCap };
});

app.post('/api/tables', { preHandler: requireUser }, async (req) => {
  const b = CreateTableZ.parse(req.body);
  const id = await createTable({ userId: req.user.id, ...b });
  return { id };
});
app.post('/api/tables/quick', { preHandler: requireUser }, async (req) => {
  const b = QuickMatchZ.parse(req.body);
  return { id: await quickMatch(req.user.id, b.game, b.stake, b.time, b.clientSeed) };
});
app.get('/api/tables/:id', async (req) => {
  const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
  return tableSummary(id, req.user?.id ?? null);
});
app.get('/api/invite/:code', async (req, reply) => {
  const { code } = z.object({ code: z.string().regex(/^[0-9a-f]{8}$/) }).parse(req.params);
  const t = await maybe<{ id: string }>(pool, `select id from game_tables where invite_code=$1`, [code]);
  if (!t) return reply.code(404).send({ error: 'not_found', message: 'That invite link is not valid any more.' });
  return t;
});
app.post('/api/tables/:id/join', { preHandler: requireUser }, async (req) => {
  const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
  const { clientSeed } = JoinTableZ.parse(req.body);
  await joinTable(req.user.id, id, clientSeed);
  return { ok: true };
});
app.post('/api/tables/:id/leave', { preHandler: requireUser }, async (req) => {
  const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
  await leaveTable(req.user.id, id);
  return { ok: true };
});
app.post('/api/tables/:id/bots', { preHandler: requireUser }, async (req) => {
  const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
  return { id: await fillWithBots(req.user.id, id) };
});

/** Public verification data. The server seed is only revealed once the game is over. */
app.get('/api/tables/:id/verify', async (req, reply) => {
  const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
  const t = await maybe<any>(pool, `select * from game_tables where id=$1`, [id]);
  if (!t) return reply.code(404).send({ error: 'not_found', message: 'Game not found.' });
  const moves = await q(pool, `select seq, seat, move from game_moves where table_id=$1 order by seq`, [id]);
  const over = t.status === 'settled' || t.status === 'cancelled';
  return {
    id,
    game: t.game,
    mode: t.mode,
    status: t.status,
    seedCommit: t.seed_commit,
    serverSeed: over ? t.server_seed : null,
    clientSeeds: t.client_seeds,
    commitMatches: over ? commitFor(t.server_seed) === t.seed_commit : null,
    moves,
    result: t.result,
    botDisclosure: t.bot_meta?.disclosed ?? null,
  };
});

app.get('/api/tables/:id/recap', async (req, reply) => {
  const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
  const t = await maybe<any>(pool, `select game, status from game_tables where id=$1`, [id]);
  if (!t || t.status !== 'settled') return reply.code(404).send({ error: 'not_ready', message: 'The recap is ready when the game ends.' });
  if (t.game !== 'chess') return { moments: [] };
  const st = await one<any>(pool, `select state from game_states where table_id=$1`, [id]);
  const { Chess } = await import('chess.js');
  const c = new Chess(st.state.startFen);
  const evals: { ply: number; san: string; cp: number }[] = [];
  let prev = 0;
  const hist = st.state.history as { from: string; to: string; promotion?: string; san: string }[];
  for (let i = 0; i < hist.length && i < 120; i++) {
    c.move({ from: hist[i]!.from, to: hist[i]!.to, promotion: hist[i]!.promotion });
    const e = await stockfishEval(c.fen(), 10);
    const whiteCp = (e.mate !== null ? Math.sign(e.mate) * 1000 : (e.cp ?? 0)) * (c.turn() === 'w' ? 1 : -1);
    evals.push({ ply: i + 1, san: hist[i]!.san, cp: whiteCp - prev });
    prev = whiteCp;
  }
  const swings = evals
    .map((e) => ({ ...e, loss: e.ply % 2 === 1 ? -e.cp : e.cp }))
    .filter((e) => e.loss > 150)
    .sort((a, b) => b.loss - a.loss)
    .slice(0, 3)
    .sort((a, b) => a.ply - b.ply);
  return {
    moments: swings.map((s) => ({
      ply: s.ply,
      move: `${Math.ceil(s.ply / 2)}${s.ply % 2 ? '.' : '...'} ${s.san}`,
      side: s.ply % 2 ? 'white' : 'black',
      text: s.loss > 600 ? 'A big turning point. This move gave away a lot of material or a mating attack.' : s.loss > 300 ? 'This move lost material or a strong position.' : 'A small inaccuracy. There was a better move here.',
    })),
  };
});

// ---------- admin ----------
app.post('/api/admin/withdrawals/:id/approve', { preHandler: [requireUser, requireAdmin] }, async (req) => {
  const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
  await q(pool, `update withdrawals set status='pending', expiry=now() + interval '10 minutes', updated_at=now() where id=$1 and status='review'`, [id]);
  return { ok: true };
});
await (await import('./admin')).registerAdmin(app); // admin reporting routes, see admin.ts

// ---------- websocket ----------
app.get('/ws', { websocket: true }, async (socket, req) => {
  const user = await sessionUser(req.cookies[COOKIE]);
  const uid: string | null = user?.id ?? null;
  if (uid) {
    if (!userSockets.has(uid)) userSockets.set(uid, new Set());
    userSockets.get(uid)!.add(socket);
  }
  const err = (message: string, tableId?: string, code?: string) => socket.send(JSON.stringify({ t: 'error', message, tableId, code }));
  socket.on('message', async (raw: Buffer) => {
    let msg;
    try {
      msg = ClientMsgZ.parse(JSON.parse(raw.toString()));
    } catch {
      return err('That message was not understood.');
    }
    try {
      if (msg.t === 'ping') return socket.send(JSON.stringify({ t: 'pong' }));
      if (msg.t === 'watch') return await watch(socket, uid, msg.tableId);
      if (msg.t === 'unwatch') return unwatch(socket, msg.tableId);
      if (!uid) return err('Please sign in first.', undefined, 'signed_out');
      if (msg.t === 'move') return await playerMove(uid, msg.tableId, msg.move, msg.seq);
      if (msg.t === 'resign') return await resign(uid, msg.tableId);
      if (msg.t === 'react') return react(uid, msg.tableId, msg.emoji);
    } catch (e) {
      if (e instanceof UserError) return err(e.message, (msg as any).tableId, e.code);
      log.error(e);
      err('Something went wrong. Your game is safe.', (msg as any).tableId);
    }
  });
  socket.on('close', () => {
    unwatch(socket);
    if (uid) userSockets.get(uid)?.delete(socket);
  });
});

// ---------- boot ----------
// A stray rejection from an RPC call must never take down live games. Log it and keep serving.
process.on('unhandledRejection', (e) => log.error({ err: (e as Error)?.message ?? String(e) }, 'unhandled rejection'));
process.on('uncaughtException', (e) => log.error({ err: e.message, stack: e.stack }, 'uncaught exception'));

await migrate((m) => log.info(m));
await recoverRooms();

const every = (ms: number, name: string, fn: () => Promise<unknown>) => {
  let busy = false; // never overlap runs: with RPC retries one run can outlast the interval
  const run = () => {
    if (busy) return;
    busy = true;
    fn()
      .catch((e) => log.warn({ job: name, err: (e as Error).message }, 'job failed'))
      .finally(() => (busy = false));
  };
  setTimeout(run, 2000);
  return setInterval(run, ms);
};
every(15_000, 'deposits', scanDeposits);
every(30_000, 'withdrawals', sweepWithdrawals);
every(300_000, 'reserve', reserveCheck);

await app.listen({ port: env.PORT, host: '0.0.0.0' });
log.info(`Evens server on :${env.PORT} (${env.SOLANA_CLUSTER})`);

const shutdown = async () => {
  stopStockfish();
  await app.close();
  await pool.end();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

void [chessEngine, backgammonEngine, tichuEngine, Rng, _rooms];
