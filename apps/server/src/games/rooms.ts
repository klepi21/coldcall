/**
 * Table lifecycle: create, join, start, moves, clocks, bots, persistence, settlement.
 * The server is the only authority. All operations on one room run through room.lock
 * so moves, timers and bot actions never interleave.
 */
import { randomBytes } from 'node:crypto';
import type { WebSocket } from 'ws';
import { Rng, commitFor, randomSeedHex, IllegalMoveError, type GameResult } from '@evens/games';
import { entryCost, botDrawRefund, validStake, BOT_MAX_BANKROLL_SHARE, formatCredits, GAMES as META, type Mode, type GameKind, type TableSummary, type ServerMsg } from '@evens/shared';
import { pool, tx, q, one, maybe } from '../db/pool';
import { post, balances, InsufficientFunds } from '../ledger';
import { GAMES, TIME_CONTROLS, BOT_NAMES, type BotMeta } from './registry';
import { chessBotFor, levelFor, levelElo, updateRating } from './calibration';
import { log } from '../lib/log';
import { awardProgressSafe } from '../progress';

export class UserError extends Error {
  constructor(message: string, public code = 'bad_request', public status = 400) {
    super(message);
  }
}

interface SeatRt {
  seat: number;
  userId: string | null;
  isBot: boolean;
  name: string;
  avatar: string;
}

interface Room {
  id: string;
  game: GameKind;
  mode: Mode;
  stake: number;
  fee: number;
  capacity: number;
  status: 'waiting' | 'playing' | 'settled' | 'cancelled';
  visibility: 'public' | 'private';
  inviteCode: string | null;
  timeControl: string | null;
  seedCommit: string;
  serverSeed: string;
  createdAt: string;
  seats: SeatRt[];
  botMeta: Record<number, BotMeta>;
  state: any;
  rng: Rng | null;
  seq: number;
  clocks: number[] | null;
  turnStartedAt: number;
  deadline: number | null;
  strikes: number[];
  lastMove: { seat: number; move: unknown } | null;
  watchers: Map<WebSocket, string | null>;
  timer: NodeJS.Timeout | null;
  botTimer: NodeJS.Timeout | null;
  botPlan: { seat: number; seq: number; moves: unknown[] } | null;
  lock: Promise<unknown>;
  result: GameResult | null;
  payouts: { seat: number; delta: number }[];
}

const rooms = new Map<string, Room>();
/** userId -> sockets, for balance pushes. */
export const userSockets = new Map<string, Set<WebSocket>>();

const send = (ws: WebSocket, msg: ServerMsg) => {
  if (ws.readyState === 1) ws.send(JSON.stringify(msg));
};

function withLock<T>(room: Room, fn: () => Promise<T>): Promise<T> {
  const p = room.lock.then(fn, fn);
  room.lock = p.catch(() => {});
  return p;
}

// ---------- helpers ----------

async function userRow(userId: string) {
  return one(pool, `select * from users where id = $1`, [userId]);
}

async function checkPlayAllowed(userId: string, mode: Mode, totalCost: number) {
  const u = await userRow(userId);
  const now = Date.now();
  if (!u.age_confirmed_at || !u.terms_accepted_at) throw new UserError('Please finish setting up your account first.', 'onboarding', 403);
  if (u.excluded_until && new Date(u.excluded_until).getTime() > now)
    throw new UserError(`You chose a break from playing until ${new Date(u.excluded_until).toDateString()}. You can still cash out.`, 'excluded', 403);
  if (u.cooloff_until && new Date(u.cooloff_until).getTime() > now)
    throw new UserError(`You are on a cool off until ${new Date(u.cooloff_until).toLocaleString('en-GB')}. You can still cash out.`, 'cooloff', 403);
  if (mode === 'practice' || totalCost === 0) return;
  for (const [col, days, label] of [
    ['limit_loss_daily', 1, 'daily'],
    ['limit_loss_weekly', 7, 'weekly'],
  ] as const) {
    const limit = u[col] as number | null;
    if (!limit) continue;
    const r = await one<{ net: number }>(
      pool,
      `select coalesce(sum(s.payout),0)::bigint as net from table_seats s join game_tables t on t.id = s.table_id
        where s.user_id = $1 and t.ended_at > now() - ($2 || ' days')::interval`,
      [userId, String(days)],
    );
    const lostSoFar = Math.max(0, -r.net);
    if (lostSoFar + totalCost > limit)
      throw new UserError(`This game could take you past your ${label} loss limit. You can change your limits in your profile.`, 'loss_limit', 403);
  }
}

function summary(r: Room): TableSummary {
  return {
    id: r.id,
    game: r.game,
    mode: r.mode,
    stake: r.stake,
    fee: r.fee,
    capacity: r.capacity,
    status: r.status,
    visibility: r.visibility,
    inviteCode: r.inviteCode,
    seats: Array.from({ length: r.capacity }, (_, i) => {
      const s = r.seats.find((x) => x.seat === i);
      const connected = !!s?.userId && [...r.watchers.values()].includes(s.userId);
      return s
        ? { seat: i, userId: s.userId, name: s.name, isBot: s.isBot, avatar: s.avatar, connected: s.isBot || connected }
        : { seat: i, userId: null, name: 'Open seat', isBot: false, avatar: '', connected: false };
    }),
    time: r.timeControl,
    seedCommit: r.seedCommit,
    createdAt: r.createdAt,
  };
}

function seatOf(r: Room, userId: string | null): number | null {
  if (!userId) return null;
  return r.seats.find((s) => s.userId === userId)?.seat ?? null;
}

function broadcastTable(r: Room) {
  for (const [ws, uid] of r.watchers) send(ws, { t: 'table', table: summary(r), you: seatOf(r, uid) });
}

function viewFor(r: Room, seat: number | null) {
  const def = GAMES[r.game];
  return def.engine.publicView(r.state, seat ?? -1);
}

function currentClocks(r: Room): number[] | null {
  if (!r.clocks) return null;
  const c = r.clocks.slice();
  if (r.status === 'playing') {
    const toAct = GAMES[r.game].engine.toAct(r.state);
    const s = toAct[0];
    if (s !== undefined) c[s] = Math.max(0, c[s]! - (Date.now() - r.turnStartedAt));
  }
  return c;
}

function broadcastState(r: Room) {
  if (!r.state) return;
  const toAct = GAMES[r.game].engine.toAct(r.state);
  const clocks = currentClocks(r);
  for (const [ws, uid] of r.watchers) {
    const seat = seatOf(r, uid);
    send(ws, { t: 'state', tableId: r.id, seq: r.seq, view: viewFor(r, seat), toAct, clocks, deadline: r.deadline, lastMove: r.lastMove, legal: legalFor(r, seat) });
  }
}

function legalFor(r: Room, seat: number | null): unknown[] {
  if (seat === null || r.status !== 'playing') return [];
  try { return GAMES[r.game].engine.legalMoves(r.state, seat); } catch { return []; }
}

/** Raw push to every socket of one user (progress updates). */
export function pushToUser(userId: string, msg: object) {
  const set = userSockets.get(userId);
  if (!set?.size) return;
  const s = JSON.stringify(msg);
  for (const ws of set) if (ws.readyState === 1) ws.send(s);
}

export async function pushBalance(userId: string) {
  const set = userSockets.get(userId);
  if (!set?.size) return;
  const b = await balances(pool, userId);
  for (const ws of set) send(ws, { t: 'balance', available: b.available, locked: b.locked });
}

function botSeatMeta(game: GameKind, rating: number, partner = false): BotMeta {
  if (game === 'chess') return { chess: chessBotFor(rating).uci };
  if (partner) return { level: 7 };
  return { level: levelFor(rating).level };
}

// ---------- create / join / leave ----------

export interface CreateArgs {
  userId: string;
  game: GameKind;
  mode: Mode;
  stake: number;
  visibility: 'public' | 'private';
  time?: string;
  clientSeed: string;
}

export async function createTable(a: CreateArgs): Promise<string> {
  const capacity = META[a.game].players;
  const stake = a.mode === 'practice' ? 0 : a.stake;
  const stakeErr = validStake(a.mode, stake);
  if (stakeErr) throw new UserError(stakeErr);
  const { fee, total } = entryCost(a.mode, stake);
  await checkPlayAllowed(a.userId, a.mode, total);
  const timeControl = a.game === 'chess' ? (a.time && TIME_CONTROLS[a.time] ? a.time : '5+3') : null;

  const u = await userRow(a.userId);
  const rating = (u.ratings?.[a.game]?.r as number) ?? 1500;
  const serverSeed = randomSeedHex();
  const inviteCode = a.mode === 'pvp' && a.visibility === 'private' ? randomBytes(4).toString('hex') : null;
  const botMeta: Record<number, BotMeta> = {};
  let disclosed: Record<string, unknown> = {};

  if (a.mode !== 'pvp') {
    for (let s = 1; s < capacity; s++) {
      const partner = a.game === 'tichu' && s === 2;
      botMeta[s] = botSeatMeta(a.game, rating, partner);
    }
    disclosed =
      a.game === 'chess'
        ? { playerRating: rating, engineElo: chessBotFor(rating).elo, expected: chessBotFor(rating).expected }
        : { playerRating: rating, level: botMeta[1]!.level, expectedWin: levelFor(rating).expectedWin };
  }

  const id = await tx(async (c) => {
    if (a.mode === 'bot') {
      const house = await maybe<{ balance: number }>(c, `select balance from ledger_accounts where kind='house_bankroll' and user_id is null and table_id is null`);
      const bank = house?.balance ?? 0;
      const cap = Math.floor(bank * BOT_MAX_BANKROLL_SHARE);
      if (bank < stake) throw new UserError('Bot tables with credits are paused for a moment. Try practice, or play other people.', 'house_empty', 503);
      if (stake > cap) throw new UserError(`Right now the biggest stake against the bot is ${formatCredits(cap)} credits. Pick a smaller stake or play people.`, 'bot_cap', 400);
    }
    const t = await one<{ id: string; created_at: string }>(
      c,
      `insert into game_tables(game, mode, stake, fee, capacity, status, visibility, invite_code, time_control, bot_level, bot_meta, server_seed, seed_commit, client_seeds, created_by)
       values ($1,$2,$3,$4,$5,'waiting',$6,$7,$8,$9,$10,$11,$12,$13,$14) returning id, created_at`,
      [
        a.game, a.mode, stake, fee, capacity, a.visibility, inviteCode, timeControl,
        botMeta[1]?.level ?? null, JSON.stringify({ seats: botMeta, disclosed }), serverSeed, commitFor(serverSeed),
        JSON.stringify([a.clientSeed]), a.userId,
      ],
    );
    await q(c, `insert into table_seats(table_id, seat, user_id) values ($1, 0, $2)`, [t.id, a.userId]);
    if (total > 0) {
      await post(c, { kind: 'game_start', key: `join:${t.id}:0:${a.userId}`, userId: a.userId, tableId: t.id, memo: `${META[a.game].name} entry` }, [
        { ref: { kind: 'user_available', userId: a.userId }, amount: -total },
        { ref: { kind: 'game_escrow', tableId: t.id }, amount: total },
      ]);
    }
    if (a.mode === 'bot') {
      await post(c, { kind: 'game_start', key: `house:${t.id}`, tableId: t.id, memo: 'House matches stake' }, [
        { ref: { kind: 'house_bankroll' }, amount: -stake },
        { ref: { kind: 'game_escrow', tableId: t.id }, amount: stake },
      ]);
    }
    if (a.mode !== 'pvp') {
      for (let s = 1; s < capacity; s++)
        await q(c, `insert into table_seats(table_id, seat, is_bot, bot_name) values ($1,$2,true,$3)`, [t.id, s, BOT_NAMES[(s * 3 + t.id.charCodeAt(0)) % BOT_NAMES.length]]);
    }
    return t.id;
  });

  const room = await loadRoom(id);
  if (room.mode !== 'pvp') await withLock(room, () => startRoom(room));
  else broadcastTable(room);
  void pushBalance(a.userId);
  return id;
}

export async function joinTable(userId: string, tableId: string, clientSeed: string): Promise<void> {
  const room = await getRoom(tableId);
  await withLock(room, async () => {
    if (room.status !== 'waiting' || room.mode !== 'pvp') throw new UserError('This table is no longer open.', 'closed', 409);
    if (seatOf(room, userId) !== null) return;
    const free = Array.from({ length: room.capacity }, (_, i) => i).find((i) => !room.seats.some((s) => s.seat === i));
    if (free === undefined) throw new UserError('This table is full.', 'full', 409);
    const { total } = entryCost(room.mode, room.stake);
    await checkPlayAllowed(userId, room.mode, total);
    const u = await userRow(userId);
    await tx(async (c) => {
      await q(c, `insert into table_seats(table_id, seat, user_id) values ($1,$2,$3)`, [room.id, free, userId]);
      await q(c, `update game_tables set client_seeds = client_seeds || $2::jsonb where id = $1`, [room.id, JSON.stringify([clientSeed])]);
      await post(c, { kind: 'game_start', key: `join:${room.id}:${free}:${userId}:${Date.now()}`, userId, tableId: room.id, memo: `${META[room.game].name} entry` }, [
        { ref: { kind: 'user_available', userId }, amount: -total },
        { ref: { kind: 'game_escrow', tableId: room.id }, amount: total },
      ]);
    });
    room.seats.push({ seat: free, userId, isBot: false, name: u.display_name, avatar: u.avatar });
    void pushBalance(userId);
    if (room.seats.length === room.capacity) await startRoom(room);
    else broadcastTable(room);
  });
}

/** Leave before the game starts: full refund including the fee. */
export async function leaveTable(userId: string, tableId: string): Promise<void> {
  const room = await getRoom(tableId);
  await withLock(room, async () => {
    if (room.status !== 'waiting') throw new UserError('The game has started. Use resign if you want to stop.', 'started', 409);
    const seat = seatOf(room, userId);
    if (seat === null) return;
    const { total } = entryCost(room.mode, room.stake);
    await tx(async (c) => {
      await q(c, `delete from table_seats where table_id=$1 and seat=$2`, [room.id, seat]);
      if (total > 0)
        await post(c, { kind: 'game_refund', key: `leave:${room.id}:${seat}:${userId}:${Date.now()}`, userId, tableId: room.id, memo: 'Left before start, full refund' }, [
          { ref: { kind: 'game_escrow', tableId: room.id }, amount: -total },
          { ref: { kind: 'user_available', userId }, amount: total },
        ]);
      if (room.seats.length === 1) await q(c, `update game_tables set status='cancelled', ended_at=now() where id=$1`, [room.id]);
    });
    room.seats = room.seats.filter((s) => s.seat !== seat);
    if (!room.seats.length) room.status = 'cancelled';
    broadcastTable(room);
    void pushBalance(userId);
  });
}

/** Stake matched quick play: join an open public table or open a new one. */
export async function quickMatch(userId: string, game: GameKind, stake: number, time: string | undefined, clientSeed: string) {
  const open = await q<{ id: string }>(
    pool,
    `select t.id from game_tables t where t.game=$1 and t.mode='pvp' and t.status='waiting' and t.visibility='public' and t.stake=$2
       and ($3::text is null or t.time_control=$3)
       and not exists (select 1 from table_seats s where s.table_id=t.id and s.user_id=$4)
       and (select count(*) from table_seats s where s.table_id=t.id) < t.capacity
     order by t.created_at asc limit 5`,
    [game, stake, game === 'chess' ? (time ?? '5+3') : null, userId],
  );
  for (const t of open) {
    try {
      await joinTable(userId, t.id, clientSeed);
      return t.id;
    } catch (e) {
      if (e instanceof UserError && (e.code === 'full' || e.code === 'closed')) continue;
      throw e;
    }
  }
  return createTable({ userId, game, mode: 'pvp', stake, visibility: 'public', time, clientSeed });
}

/** Waiting pvp table that nobody joined: replace the empty seats with bots at the same stake. */
export async function fillWithBots(userId: string, tableId: string) {
  const room = await getRoom(tableId);
  if (room.game === 'tichu' || room.seats.length !== 1) throw new UserError('This table already has other players.');
  await leaveTable(userId, tableId);
  return createTable({ userId, game: room.game, mode: 'bot', stake: room.stake, visibility: 'public', time: room.timeControl ?? undefined, clientSeed: randomSeedHex(8) });
}

// ---------- loading ----------

async function loadRoom(id: string): Promise<Room> {
  const t = await maybe<any>(pool, `select * from game_tables where id=$1`, [id]);
  if (!t) throw new UserError('Table not found.', 'not_found', 404);
  const seats = await q<any>(
    pool,
    `select s.seat, s.user_id, s.is_bot, s.bot_name, u.display_name, u.avatar from table_seats s left join users u on u.id = s.user_id where s.table_id=$1 order by s.seat`,
    [id],
  );
  const st = await maybe<any>(pool, `select * from game_states where table_id=$1`, [id]);
  const room: Room = {
    id,
    game: t.game,
    mode: t.mode,
    stake: t.stake,
    fee: t.fee,
    capacity: t.capacity,
    status: t.status,
    visibility: t.visibility,
    inviteCode: t.invite_code,
    timeControl: t.time_control,
    seedCommit: t.seed_commit,
    serverSeed: t.server_seed,
    createdAt: new Date(t.created_at).toISOString(),
    seats: seats.map((s) => ({
      seat: s.seat,
      userId: s.user_id,
      isBot: s.is_bot,
      name: s.is_bot ? `${s.bot_name}` : s.display_name,
      avatar: s.is_bot ? 'bot' : s.avatar,
    })),
    botMeta: t.bot_meta?.seats ?? {},
    state: st?.state ?? null,
    rng: st ? new Rng(st.rng_state) : null,
    seq: st?.seq ?? 0,
    clocks: st?.clocks?.clocks ?? null,
    turnStartedAt: Date.now(),
    deadline: null,
    strikes: st?.clocks?.strikes ?? Array(t.capacity).fill(0),
    lastMove: null,
    watchers: new Map(),
    timer: null,
    botTimer: null,
    botPlan: null,
    lock: Promise.resolve(),
    result: t.result?.result ?? null,
    payouts: t.result?.payouts ?? [],
  };
  rooms.set(id, room);
  return room;
}

export async function getRoom(id: string): Promise<Room> {
  return rooms.get(id) ?? loadRoom(id);
}

/** On boot, resume every game that was in progress. */
export async function recoverRooms() {
  const live = await q<{ id: string }>(pool, `select id from game_tables where status='playing'`);
  for (const { id } of live) {
    const r = await loadRoom(id);
    if (!r.state) continue;
    schedule(r);
  }
  log.info({ count: live.length }, 'recovered live tables');
}

// ---------- game flow ----------

async function persist(r: Room, seat: number | null, move: unknown) {
  const clocks = JSON.stringify({ clocks: r.clocks, strikes: r.strikes });
  await tx(async (c) => {
    if (seat !== null)
      await q(c, `insert into game_moves(table_id, seq, seat, move) values ($1,$2,$3,$4)`, [r.id, r.seq, seat, JSON.stringify(move)]);
    await q(
      c,
      `insert into game_states(table_id, seq, state, rng_state, clocks) values ($1,$2,$3,$4,$5)
       on conflict (table_id) do update set seq=excluded.seq, state=excluded.state, rng_state=excluded.rng_state, clocks=excluded.clocks, updated_at=now()`,
      [r.id, r.seq, JSON.stringify(r.state), JSON.stringify(r.rng!.state), clocks],
    );
  });
}

async function startRoom(r: Room) {
  const t = await one<any>(pool, `select client_seeds from game_tables where id=$1`, [r.id]);
  r.rng = Rng.fromSeeds(r.serverSeed, t.client_seeds as string[]);
  r.state = GAMES[r.game].engine.create({}, r.rng);
  r.seq = 0;
  const tc = r.timeControl ? TIME_CONTROLS[r.timeControl] : null;
  r.clocks = tc ? Array(r.capacity).fill(tc.baseMs) : null;
  r.status = 'playing';
  r.turnStartedAt = Date.now();
  await q(pool, `update game_tables set status='playing', started_at=now() where id=$1`, [r.id]);
  await persist(r, null, null);
  broadcastTable(r);
  schedule(r);
}

/** After any change: settle if over, otherwise arm timers and bots, then broadcast. */
function schedule(r: Room) {
  if (r.timer) clearTimeout(r.timer);
  if (r.botTimer) clearTimeout(r.botTimer);
  r.timer = r.botTimer = null;
  const def = GAMES[r.game];
  const result = def.engine.result(r.state);
  if (result) {
    void withLock(r, () => settle(r, result));
    return;
  }
  const toAct = def.engine.toAct(r.state);
  const humans = toAct.filter((s) => !r.seats.find((x) => x.seat === s)?.isBot);
  const bots = toAct.filter((s) => r.seats.find((x) => x.seat === s)?.isBot);

  // Clocks
  if (r.clocks) {
    const s = toAct[0];
    if (s !== undefined) {
      const remaining = r.clocks[s]!;
      r.deadline = r.turnStartedAt + remaining;
      r.timer = setTimeout(() => void withLock(r, () => onTimeout(r, [s])), Math.max(0, r.deadline - Date.now()) + 50);
    }
  } else if (humans.length && r.mode !== 'practice') {
    r.deadline = Date.now() + def.turnMs;
    r.timer = setTimeout(() => void withLock(r, () => onTimeout(r, humans)), def.turnMs + 50);
  } else if (humans.length) {
    // practice: generous timer, auto play instead of forfeits
    r.deadline = Date.now() + def.turnMs * 4;
    r.timer = setTimeout(() => void withLock(r, () => onTimeout(r, humans)), def.turnMs * 4 + 50);
  } else r.deadline = null;

  // Out of turn bot actions (Tichu bombs), checked after every change.
  if (def.interrupt) {
    for (const s of r.seats.filter((x) => x.isBot && !toAct.includes(x.seat))) {
      const botRng = Rng.fromSeeds(r.serverSeed, ['int', String(s.seat), String(r.seq)]);
      const m = def.interrupt(r.state, s.seat, r.botMeta[s.seat] ?? {}, botRng);
      if (m) {
        r.botTimer = setTimeout(() => void withLock(r, async () => {
          if (r.status !== 'playing') return;
          try { await applyMove(r, s.seat, m); } catch { schedule(r); }
        }), 500 + Math.random() * 700);
        broadcastState(r);
        return;
      }
    }
  }

  if (bots.length) {
    const seat = bots[0]!;
    const think = r.botPlan?.seq === r.seq - 1 && r.botPlan.seat === seat ? 350 + Math.random() * 300 : 700 + Math.random() * 1600;
    r.botTimer = setTimeout(() => void withLock(r, () => botAct(r, seat)), think);
  }
  broadcastState(r);
}

async function botAct(r: Room, seat: number) {
  if (r.status !== 'playing') return;
  const def = GAMES[r.game];
  if (!def.engine.toAct(r.state).includes(seat)) return schedule(r);
  let move: unknown;
  if (r.botPlan && r.botPlan.seat === seat && r.botPlan.moves.length && r.botPlan.seq === r.seq - 1) {
    move = r.botPlan.moves.shift();
  } else {
    const botRng = Rng.fromSeeds(r.serverSeed, ['bot', String(seat), String(r.seq)]);
    const moves = await def.botMoves(r.state, seat, r.botMeta[seat] ?? {}, botRng);
    move = moves.shift();
    r.botPlan = moves.length ? { seat, seq: r.seq, moves } : null;
  }
  try {
    await applyMove(r, seat, move);
  } catch (e) {
    // A stale plan can become illegal if the state moved on. Recompute next time.
    r.botPlan = null;
    log.warn({ err: (e as Error).message, table: r.id, seat }, 'bot move rejected, retrying');
    const legal = def.engine.legalMoves(r.state, seat);
    if (legal.length) await applyMove(r, seat, legal[0]);
  }
  if (r.botPlan) r.botPlan.seq = r.seq - 1;
}

async function applyMove(r: Room, seat: number, move: unknown) {
  const def = GAMES[r.game];
  const now = Date.now();
  if (r.clocks) {
    const used = now - r.turnStartedAt;
    r.clocks[seat] = r.clocks[seat]! - used;
    if (r.clocks[seat]! <= 0) {
      r.clocks[seat] = 0;
      return onTimeout(r, [seat]);
    }
  }
  const before = def.engine.toAct(r.state);
  r.state = def.engine.applyMove(r.state, seat, move, r.rng!);
  r.seq += 1;
  r.lastMove = { seat, move };
  const after = def.engine.toAct(r.state);
  if (r.clocks && before[0] !== after[0]) {
    const tc = TIME_CONTROLS[r.timeControl!]!;
    r.clocks[seat] = r.clocks[seat]! + tc.incMs;
    r.turnStartedAt = now;
  }
  await persist(r, seat, move);
  schedule(r);
}

async function onTimeout(r: Room, seats: number[]) {
  if (r.status !== 'playing') return;
  const def = GAMES[r.game];
  const pending = def.engine.toAct(r.state).filter((s) => seats.includes(s));
  if (!pending.length) return schedule(r);
  if (r.clocks) {
    r.state = def.engine.forfeit(r.state, pending[0]!, 'timeout');
    r.seq += 1;
    await persist(r, pending[0]!, { type: 'timeout' });
    return schedule(r);
  }
  // Turn based games: auto play a simple move; three strikes in a money game counts as leaving.
  for (const s of pending) {
    r.strikes[s] = (r.strikes[s] ?? 0) + 1;
    if (r.mode !== 'practice' && r.strikes[s]! >= 3) {
      r.state = def.engine.forfeit(r.state, s, 'abandon');
      r.seq += 1;
      await persist(r, s, { type: 'abandon' });
      return schedule(r);
    }
    const botRng = Rng.fromSeeds(r.serverSeed, ['auto', String(s), String(r.seq)]);
    const moves = await def.botMoves(r.state, s, { level: 2 }, botRng);
    if (moves[0] !== undefined) await applyMove(r, s, moves[0]);
  }
}

// ---------- player actions ----------

export async function playerMove(userId: string, tableId: string, move: unknown, seq: number) {
  const r = await getRoom(tableId);
  return withLock(r, async () => {
    if (r.status !== 'playing') throw new UserError('This game is not in progress.', 'not_playing', 409);
    const seat = seatOf(r, userId);
    if (seat === null) throw new UserError('You are not seated at this table.', 'not_seated', 403);
    if (seq !== r.seq) throw new UserError('The board changed. Try that again.', 'stale', 409);
    const def = GAMES[r.game];
    try {
      // Tichu bombs may come from seats not in toAct; the engine validates everything.
      r.strikes[seat] = 0;
      await applyMove(r, seat, move);
    } catch (e) {
      if (e instanceof IllegalMoveError) throw new UserError(e.explain, 'illegal', 422);
      throw e;
    }
    void def;
  });
}

export async function resign(userId: string, tableId: string) {
  const r = await getRoom(tableId);
  return withLock(r, async () => {
    if (r.status !== 'playing') return;
    const seat = seatOf(r, userId);
    if (seat === null) throw new UserError('You are not seated at this table.', 'not_seated', 403);
    r.state = GAMES[r.game].engine.forfeit(r.state, seat, 'resign');
    r.seq += 1;
    await persist(r, seat, { type: 'resign' });
    schedule(r);
  });
}

// ---------- settlement ----------

async function settle(r: Room, result: GameResult) {
  if (r.status !== 'playing') return;
  if (r.timer) clearTimeout(r.timer);
  if (r.botTimer) clearTimeout(r.botTimer);
  const humans = r.seats.filter((s) => !s.isBot);
  const legs: { ref: any; amount: number }[] = [];
  const payout = new Map<number, number>(); // gross credits returned per seat
  const { total } = entryCost(r.mode, r.stake);

  if (r.mode === 'bot') {
    const player = humans[0]!;
    const playerTeam = GAMES[r.game].engine.teams[player.seat];
    const won = !result.draw && result.winners.some((w) => GAMES[r.game].engine.teams[w] === playerTeam);
    const pot = r.stake * 2;
    const toPlayer = result.draw ? (r.game === 'chess' ? botDrawRefund(r.stake) : r.stake) : won ? pot : 0;
    payout.set(player.seat, toPlayer);
    legs.push({ ref: { kind: 'game_escrow', tableId: r.id }, amount: -pot });
    if (toPlayer) legs.push({ ref: { kind: 'user_available', userId: player.userId }, amount: toPlayer });
    if (pot - toPlayer) legs.push({ ref: { kind: 'house_bankroll' }, amount: pot - toPlayer });
  } else if (r.mode === 'pvp') {
    const escrow = total * r.capacity;
    legs.push({ ref: { kind: 'game_escrow', tableId: r.id }, amount: -escrow });
    let fees = r.fee * r.capacity;
    if (result.draw) {
      for (const s of humans) payout.set(s.seat, r.stake);
    } else {
      const pot = r.stake * r.capacity;
      const share = Math.floor(pot / result.winners.length);
      fees += pot - share * result.winners.length;
      for (const w of result.winners) payout.set(w, share);
    }
    for (const s of humans) {
      const p = payout.get(s.seat) ?? 0;
      if (p) legs.push({ ref: { kind: 'user_available', userId: s.userId }, amount: p });
    }
    legs.push({ ref: { kind: 'fee_revenue' }, amount: fees });
  }

  r.payouts = humans.map((s) => ({ seat: s.seat, delta: (payout.get(s.seat) ?? 0) - total }));
  await tx(async (c) => {
    if (legs.length) await post(c, { kind: 'game_settle', key: `settle:${r.id}`, tableId: r.id, memo: `${META[r.game].name} result`, meta: result }, legs);
    for (const p of r.payouts) await q(c, `update table_seats set payout=$3 where table_id=$1 and seat=$2`, [r.id, p.seat, r.mode === 'practice' ? 0 : p.delta]);
    await q(c, `update game_tables set status='settled', ended_at=now(), result=$2 where id=$1`, [
      r.id,
      JSON.stringify({ result, payouts: r.payouts }),
    ]);
  });
  r.status = 'settled';
  r.result = result;
  r.deadline = null;
  await updateRatings(r, result).catch((e) => log.error(e, 'rating update failed'));
  broadcastTable(r);
  broadcastState(r);
  for (const [ws] of r.watchers) send(ws, { t: 'result', tableId: r.id, result, payouts: r.payouts, serverSeed: r.serverSeed });
  for (const s of humans) if (s.userId) void pushBalance(s.userId);
  // Progression runs after the money transaction committed and the result went out. It never throws,
  // never blocks the room, and is identical for practice, bot and pvp games. Bots and spectators get nothing.
  void awardProgressSafe(
    {
      tableId: r.id,
      game: r.game,
      teams: GAMES[r.game].engine.teams,
      result,
      state: r.state,
      players: humans.filter((s) => s.userId).map((s) => ({ seat: s.seat, userId: s.userId! })),
    },
    pushToUser,
  );
}

/** Skill ratings only. Practice games never count, and a rating cannot drop more than 150 below its peak. */
async function updateRatings(r: Room, result: GameResult) {
  if (r.mode === 'practice') return;
  const teams = GAMES[r.game].engine.teams;
  const humans = r.seats.filter((s) => !s.isBot && s.userId);
  const ratingOf = async (uid: string) => ((await userRow(uid)).ratings ?? {}) as Record<string, { r: number; n: number; peak?: number }>;
  for (const h of humans) {
    const all = await ratingOf(h.userId!);
    const mine = all[r.game] ?? { r: 1500, n: 0 };
    let opp: number;
    if (r.mode === 'bot') {
      const meta = (await one<any>(pool, `select bot_meta from game_tables where id=$1`, [r.id])).bot_meta?.disclosed ?? {};
      opp = r.game === 'chess' ? (meta.engineElo ?? 1500) : levelElo(meta.level ?? 5);
    } else {
      const others = humans.filter((o) => teams[o.seat] !== teams[h.seat]);
      const rs = await Promise.all(others.map(async (o) => (await ratingOf(o.userId!))[r.game]?.r ?? 1500));
      opp = rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : 1500;
    }
    const score = result.draw ? 0.5 : result.winners.some((w) => teams[w] === teams[h.seat]) ? 1 : 0;
    const next = updateRating(mine, opp, score);
    const peak = Math.max(mine.peak ?? mine.r, next.r);
    const floored = Math.max(next.r, peak - 150);
    all[r.game] = { r: floored, n: next.n, peak };
    await q(pool, `update users set ratings=$2 where id=$1`, [h.userId, JSON.stringify(all)]);
  }
}

// ---------- watching ----------

export async function watch(ws: WebSocket, userId: string | null, tableId: string) {
  const r = await getRoom(tableId);
  r.watchers.set(ws, userId);
  send(ws, { t: 'table', table: summary(r), you: seatOf(r, userId) });
  if (r.state) {
    const toAct = GAMES[r.game].engine.toAct(r.state);
    const seat = seatOf(r, userId);
    send(ws, { t: 'state', tableId: r.id, seq: r.seq, view: viewFor(r, seat), toAct, clocks: currentClocks(r), deadline: r.deadline, lastMove: r.lastMove, legal: legalFor(r, seat) });
  }
  if (r.status === 'settled' && r.result)
    send(ws, { t: 'result', tableId: r.id, result: r.result, payouts: r.payouts, serverSeed: r.serverSeed });
  broadcastTable(r);
}

export function unwatch(ws: WebSocket, tableId?: string) {
  for (const r of tableId ? [rooms.get(tableId)].filter(Boolean) : rooms.values()) {
    if (r!.watchers.delete(ws)) broadcastTable(r!);
  }
}

export function react(userId: string, tableId: string, emoji: string) {
  const r = rooms.get(tableId);
  if (!r) return;
  const seat = seatOf(r, userId);
  if (seat === null) return;
  for (const [ws] of r.watchers) send(ws, { t: 'react', tableId, seat, emoji });
}

export async function tableSummary(tableId: string, userId: string | null) {
  const r = await getRoom(tableId);
  return { table: summary(r), you: seatOf(r, userId) };
}

export async function lobbyTables(game?: GameKind) {
  const rows = await q<{ id: string }>(
    pool,
    `select id from game_tables where status='waiting' and mode='pvp' and visibility='public' and ($1::text is null or game=$1) order by created_at desc limit 30`,
    [game ?? null],
  );
  const out: TableSummary[] = [];
  for (const { id } of rows) out.push(summary(await getRoom(id)));
  return out;
}

export const _rooms = rooms;
export { InsufficientFunds };
