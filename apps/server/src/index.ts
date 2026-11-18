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
  DepositBuildZ,
  DigestZ,
  SignedTxZ,
  CurrencyZ,
  ClientMsgZ,
  GameKindZ,
  EquipZ,
  CURRENCIES,
  CURRENCY,
  BOT_MAX_BANKROLL_SHARE_BPS,
  baseToMinor,
  formatAmount,
  type Currency,
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
  verifyGuestSignIn,
  verifyGoogleSignIn,
  AuthError,
  setSessionCookie,
  sessionUser,
  requireUser,
  requireAdmin,
  publicUser,
} from './lib/auth';
import { balances, liabilities, houseBankroll, InsufficientFunds } from './ledger';
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
  buildDepositTx,
  submitSigned,
  confirmDigest,
  buildLofiFaucet,
  dripTestSui,
  requestWithdrawal,
  reissueTicket,
  sweepWithdrawals,
  scanVaultEvents,
  reserveCheck,
  walletOverview,
} from './wallet';
import { chainConfig, vaultBalanceBase } from './chain/vault';
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
      message: `You need ${formatAmount(err.needed, err.currency)} for this. You have ${formatAmount(err.available, err.currency)}. Add ${err.currency} or pick a smaller stake.`,
    });
  if (err instanceof ZodError) return reply.code(400).send({ error: 'invalid', message: 'Some details were not valid. Please check and try again.', issues: err.issues });
  if (err instanceof AuthError) return reply.code(401).send({ error: 'auth', message: err.message });
  if ((err as any).statusCode === 429) return reply.code(429).send({ error: 'rate_limited', message: 'Slow down a little and try again in a moment.' });
  log.error(err);
  return reply.code(500).send({ error: 'server', message: 'Something went wrong on our side. Your money is safe. Please try again.' });
});

// ---------- public ----------
app.get('/api/health', async () => ({ ok: true }));
app.get('/api/config', async () => {
  const c = chainConfig();
  return {
    network: env.SUI_NETWORK,
    rpc: env.SUI_RPC,
    packageId: c.packageId,
    faucetId: c.faucetId,
    vaults: { LOFI: c.vaults.LOFI.id, SUI: c.vaults.SUI.id },
    coinTypes: { LOFI: c.lofiType, SUI: c.suiType },
    gameAddress: c.gameAddress,
    googleClientId: env.GOOGLE_CLIENT_ID ?? null,
    zkProver: 'https://prover-dev.mystenlabs.com/v1',
    termsVersion: TERMS_VERSION,
  };
});

app.get('/api/stats', async () => {
  const online = new Set<string>();
  for (const set of userSockets.keys()) online.add(set);
  const playing = (await one<{ n: number }>(pool, `select count(*)::int as n from game_tables where status='playing'`)).n;
  const games = (await one<{ n: number }>(pool, `select count(*)::int as n from game_tables where status='settled'`)).n;
  const paidRows = await q<{ currency: Currency; s: number }>(
    pool,
    `select t.currency, coalesce(sum(s.payout),0)::bigint as s from table_seats s join game_tables t on t.id = s.table_id where s.payout > 0 group by t.currency`,
  );
  const won = Object.fromEntries(CURRENCIES.map((c) => [c, paidRows.find((r) => r.currency === c)?.s ?? 0]));
  // Real recent wins only, first letter of the display name for privacy. Each amount keeps its coin.
  const recent = await q<{ name: string; game: string; amount: number; currency: Currency; at: string; mode: string }>(
    pool,
    `select left(u.display_name, 1) || '.' as name, t.game, s.payout as amount, t.currency, t.ended_at as at, t.mode
       from table_seats s join game_tables t on t.id = s.table_id join users u on u.id = s.user_id
      where s.payout > 0 and t.status = 'settled' and u.role = 'user'
      order by t.ended_at desc limit 12`,
  );
  return { online: online.size, playing, gamesPlayed: games, won, recentWins: recent };
});

/** Live on-chain vault balances (cached 10s) next to what is held for others, one row per currency. */
let vaultCache: { at: number; data: unknown } | null = null;
app.get('/api/vault', async () => {
  if (vaultCache && Date.now() - vaultCache.at < 10_000) return vaultCache.data;
  const c = chainConfig();
  const rows = [];
  for (const cur of CURRENCIES) {
    const minor = baseToMinor(await vaultBalanceBase(cur), cur);
    const owed = await liabilities(pool, cur);
    rows.push({ currency: cur, vaultId: c.vaults[cur].id, minor, owedMinor: owed, backed: minor >= owed });
  }
  const data = { vaults: rows, at: new Date().toISOString() };
  vaultCache = { at: Date.now(), data };
  return data;
});

app.get('/api/reserve', async () => {
  const last = await q<any>(pool, `select distinct on (currency) * from reserve_checks order by currency, id desc`);
  return last.length === CURRENCIES.length ? last : await reserveCheck();
});

// ---------- auth ----------
const SuiAddressZ = z.string().regex(/^0x[0-9a-f]{64}$/);

/** Guest wallet: one time message to sign. */
app.get('/api/auth/nonce', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req) => {
  const { address } = z.object({ address: SuiAddressZ }).parse(req.query);
  return createNonce(address);
});

app.post('/api/auth/verify', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req, reply) => {
  const b = z
    .object({ address: SuiAddressZ, nonce: z.string().regex(/^[0-9a-f]{32}$/), issuedAt: z.string().max(40), signature: z.string().min(10).max(500) })
    .parse(req.body);
  const r = await verifyGuestSignIn(b.address, b.nonce, b.issuedAt, b.signature);
  if (!r) return reply.code(401).send({ error: 'bad_signature', message: 'We could not confirm that signature. Please try signing in again.' });
  setSessionCookie(reply, r.sid);
  return { user: publicUser(r.user) };
});

/** Google zkLogin: verify the id_token, hand back the stable salt, open a session for the derived address. */
app.post('/api/auth/google', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req, reply) => {
  const b = z
    .object({
      idToken: z.string().min(20).max(4096),
      ephemeralPublicKey: z.string().min(20).max(100),
      maxEpoch: z.number().int().positive(),
      randomness: z.string().regex(/^\d{1,80}$/),
    })
    .parse(req.body);
  const r = await verifyGoogleSignIn(b.idToken, { ephemeralPublicKey: b.ephemeralPublicKey, maxEpoch: b.maxEpoch, randomness: b.randomness });
  setSessionCookie(reply, r.sid);
  return { user: publicUser(r.user), salt: r.salt, address: r.address };
});

app.post('/api/auth/logout', async (req, reply) => {
  const sid = req.cookies[COOKIE];
  if (sid) await q(pool, `delete from sessions where id=$1`, [sid]);
  reply.clearCookie(COOKIE, { path: '/' });
  return { ok: true };
});

// ---------- me ----------
async function limitsOf(userId: string) {
  const rows = await q<any>(pool, `select * from user_limits where user_id=$1`, [userId]);
  return Object.fromEntries(
    CURRENCIES.map((c) => {
      const r = rows.find((x) => x.currency === c);
      return [c, { depositDaily: r?.deposit_daily ?? null, lossDaily: r?.loss_daily ?? null, lossWeekly: r?.loss_weekly ?? null, pending: r?.pending ?? null, pendingAt: r?.pending_at ?? null }];
    }),
  );
}

app.get('/api/me', { preHandler: requireUser }, async (req) => {
  const b = await balances(pool, req.user.id);
  return { user: publicUser(req.user, await limitsOf(req.user.id)), balances: b };
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
  return { user: publicUser(u, await limitsOf(req.user.id)) };
});

app.patch('/api/me', { preHandler: requireUser }, async (req) => {
  const b = z
    .object({
      displayName: z.string().trim().min(2).max(20).regex(/^[\p{L}\p{N} _.]+$/u).optional(),
      avatar: z.enum(['laurel', 'owl', 'olive', 'wave', 'sun', 'column', 'amphora', 'star']).optional(),
      settings: z.object({ currency: CurrencyZ.optional(), sound: z.boolean().optional(), theme: z.enum(['system', 'dark', 'light']).optional(), confirmMoves: z.boolean().optional(), boardTheme: z.enum(['marble', 'night']).optional(), hints: z.boolean().optional(), render3d: z.boolean().optional() }).optional(),
    })
    .parse(req.body);
  const u = await one(
    pool,
    `update users set display_name=coalesce($2, display_name), avatar=coalesce($3, avatar), settings = settings || $4::jsonb where id=$1 returning *`,
    [req.user.id, b.displayName ?? null, b.avatar ?? null, JSON.stringify(b.settings ?? {})],
  );
  return { user: publicUser(u, await limitsOf(req.user.id)) };
});

/** Limits are per currency. Lowering a limit applies now. Raising or removing one waits 24 hours. */
app.post('/api/me/limits', { preHandler: requireUser }, async (req) => {
  const n = z.number().int().positive().max(1_000_000_000).nullable();
  const b = z.object({ currency: CurrencyZ, depositDaily: n, lossDaily: n, lossWeekly: n }).parse(req.body);
  const cur =
    (await maybe<any>(pool, `select * from user_limits where user_id=$1 and currency=$2`, [req.user.id, b.currency])) ??
    { deposit_daily: null, loss_daily: null, loss_weekly: null };
  const lower = (now: number | null, next: number | null) => next !== null && (now === null || next <= now);
  const apply = (now: number | null, next: number | null) => (lower(now, next) ? next : now);
  const pending: Record<string, number | null> = {};
  for (const [k, col] of [['depositDaily', 'deposit_daily'], ['lossDaily', 'loss_daily'], ['lossWeekly', 'loss_weekly']] as const)
    if (!lower(cur[col], b[k]) && cur[col] !== b[k]) pending[k] = b[k];
  const has = Object.keys(pending).length > 0;
  await q(
    pool,
    `insert into user_limits(user_id, currency, deposit_daily, loss_daily, loss_weekly, pending, pending_at)
     values ($1,$2,$3,$4,$5,$6, case when $6::jsonb is null then null else now() + interval '24 hours' end)
     on conflict (user_id, currency) do update set deposit_daily=$3, loss_daily=$4, loss_weekly=$5, pending=$6,
       pending_at = case when $6::jsonb is null then null else now() + interval '24 hours' end`,
    [req.user.id, b.currency, apply(cur.deposit_daily, b.depositDaily), apply(cur.loss_daily, b.lossDaily), apply(cur.loss_weekly, b.lossWeekly), has ? JSON.stringify(pending) : null],
  );
  return { user: publicUser(req.user, await limitsOf(req.user.id)), pending };
});

app.post('/api/me/cooloff', { preHandler: requireUser }, async (req) => {
  const { hours } = z.object({ hours: z.union([z.literal(24), z.literal(168), z.literal(720)]) }).parse(req.body);
  const u = await one(pool, `update users set cooloff_until = now() + ($2 || ' hours')::interval where id=$1 returning *`, [req.user.id, String(hours)]);
  return { user: publicUser(u, await limitsOf(req.user.id)) };
});

app.post('/api/me/exclude', { preHandler: requireUser }, async (req) => {
  const { months } = z.object({ months: z.union([z.literal(6), z.literal(12)]) }).parse(req.body);
  const u = await one(pool, `update users set excluded_until = now() + ($2 || ' months')::interval where id=$1 returning *`, [req.user.id, String(months)]);
  return { user: publicUser(u, await limitsOf(req.user.id)) };
});

app.get('/api/me/history', { preHandler: requireUser }, async (req) => {
  return q(
    pool,
    `select t.id, t.game, t.mode, t.currency, t.stake, t.fee, t.status, t.result, t.created_at, t.ended_at, s.seat, s.payout
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

// ---------- wallet (every call names its currency) ----------
app.get('/api/wallet', { preHandler: requireUser }, async (req) => {
  const { currency } = z.object({ currency: CurrencyZ.default('LOFI') }).parse(req.query);
  return walletOverview(req.user.id, req.user.wallet_address, currency);
});

/** Sponsored LOFI faucet claim: returns bytes for the browser to sign. */
app.post('/api/wallet/faucet/lofi', { preHandler: requireUser, config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (req) =>
  buildLofiFaucet(req.user.id, req.user.wallet_address),
);

/** "Get test SUI": the game wallet sends a little SUI. Rate limited per player and per IP. */
app.post('/api/wallet/faucet/sui', { preHandler: requireUser, config: { rateLimit: { max: 3, timeWindow: '10 minutes' } } }, async (req) =>
  dripTestSui(req.user.id, req.user.wallet_address),
);

app.post('/api/wallet/deposit/build', { preHandler: requireUser, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req) => {
  const { currency, amount } = DepositBuildZ.parse(req.body);
  return buildDepositTx(req.user.id, req.user.wallet_address, currency, amount);
});

/** The browser signed bytes the server built. The server sponsors and executes them. */
app.post('/api/wallet/submit', { preHandler: requireUser, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req) => {
  const { bytes, signature } = SignedTxZ.parse(req.body);
  return submitSigned(req.user.id, bytes, signature);
});

/** Backup: credit a deposit by digest, read from the chain. */
app.post('/api/wallet/deposit/confirm', { preHandler: requireUser }, async (req) => {
  const { digest } = z.object({ digest: DigestZ }).parse(req.body);
  return confirmDigest(req.user.id, digest);
});

app.post('/api/wallet/withdraw', { preHandler: requireUser }, async (req) => {
  const { currency, amount } = WithdrawRequestZ.parse(req.body);
  return requestWithdrawal(req.user.id, req.user.wallet_address, currency, amount);
});
app.post('/api/wallet/withdraw/:id/ticket', { preHandler: requireUser }, async (req) => {
  const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
  return reissueTicket(req.user.id, req.user.wallet_address, id);
});

// ---------- tables ----------
app.get('/api/tables', async (req) => {
  const { game, currency } = z.object({ game: GameKindZ.optional(), currency: CurrencyZ.optional() }).parse(req.query);
  return lobbyTables(game, currency);
});

app.get('/api/bot-info', { preHandler: requireUser }, async (req) => {
  const { game, currency } = z.object({ game: GameKindZ, currency: CurrencyZ.default('LOFI') }).parse(req.query);
  const rating = req.user.ratings?.[game]?.r ?? 1500;
  const bank = await houseBankroll(pool, currency);
  const botCap = Math.min(CURRENCY[currency].maxStakeBot, Math.floor((bank * BOT_MAX_BANKROLL_SHARE_BPS) / 10_000));
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
  return { id: await quickMatch(req.user.id, b.game, b.currency, b.stake, b.time, b.clientSeed) };
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
every(15_000, 'vault events', scanVaultEvents);
every(30_000, 'withdrawals', sweepWithdrawals);
every(300_000, 'reserve', reserveCheck);

await app.listen({ port: env.PORT, host: '0.0.0.0' });
log.info(`Cold Call server on :${env.PORT} (Sui ${env.SUI_NETWORK})`);

const shutdown = async () => {
  stopStockfish();
  await app.close();
  await pool.end();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

void [chessEngine, backgammonEngine, tichuEngine, Rng, _rooms];
