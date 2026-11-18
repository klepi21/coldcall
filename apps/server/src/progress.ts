/**
 * Progression storage and API. Runs after a game is paid out and never touches money:
 * no ledger, no balances, no stakes. Scoring lives in progress-rules.ts and never sees mode or stake.
 */
import type pg from 'pg';
import type { GameResult } from '@coldcall/games';
import type { AchievementInfo, CosmeticSlot, ProgressGame, ProgressMsg, ProgressResponse, XpLine } from '@coldcall/shared';
import { pool, tx, q, maybe } from './db/pool';
import { log } from './lib/log';
import {
  ACHIEVEMENTS,
  COSMETICS,
  GAME_IDS,
  MIN_MOVES,
  XP,
  achievementInfo,
  applyStats,
  challengesFor,
  emptyStats,
  isUnlocked,
  levelFromXp,
  msToReset,
  rankFor,
  scoreGame,
  utcDay,
  type Snapshot,
  type StatRow,
} from './progress-rules';

export interface FinishedGame {
  tableId: string;
  game: ProgressGame;
  teams: number[];
  result: GameResult;
  state: unknown;
  /** Human seats only. Bots and spectators never get progress. */
  players: { seat: number; userId: string }[];
}

export type PushFn = (userId: string, msg: ProgressMsg) => void;
type Runner = <T>(fn: (c: pg.PoolClient) => Promise<T>) => Promise<T>;

const utcMidnight = (d = new Date()) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

async function loadStats(c: pg.PoolClient | pg.Pool, userId: string): Promise<Record<ProgressGame, StatRow>> {
  const rows = await q<any>(c, `select * from user_game_stats where user_id=$1`, [userId]);
  const out = Object.fromEntries(GAME_IDS.map((g) => [g, emptyStats()])) as Record<ProgressGame, StatRow>;
  for (const r of rows)
    out[r.game as ProgressGame] = { games: r.games, wins: r.wins, draws: r.draws, losses: r.losses, win_streak: r.win_streak, best_streak: r.best_streak, xp: r.xp, extra: r.extra ?? {} };
  return out;
}

async function dailyCounts(c: pg.PoolClient | pg.Pool, userId: string) {
  return (await q<{ done: number; full: number }>(
    c,
    `select (select count(*)::int from daily_challenge_progress where user_id=$1 and done_at is not null) as done,
            (select count(*)::int from (select day from daily_challenge_progress where user_id=$1 and done_at is not null group by day having count(*) >= 3) d) as full`,
    [userId],
  ))[0]!;
}

/** Records one finished game for one player inside a transaction. Returns null if it was already recorded. */
async function recordSeat(c: pg.PoolClient, g: FinishedGame, seat: number, userId: string): Promise<ProgressMsg | null> {
  const inserted = await q(c, `insert into xp_awards(user_id, table_id, game, xp) values ($1,$2,$3,0) on conflict do nothing returning user_id`, [userId, g.tableId, g.game]);
  if (!inserted.length) return null;

  const ownMoves = (await q<{ n: number }>(
    c,
    `select count(*)::int as n from game_moves where table_id=$1 and seat=$2 and coalesce(move->>'type','') not in ('resign', 'undo')`,
    [g.tableId, seat],
  ))[0]!.n;
  const midnight = utcMidnight();
  const earlier = await q<{ game: string }>(c, `select distinct game from xp_awards where user_id=$1 and table_id<>$2 and xp>0 and created_at >= $3`, [userId, g.tableId, midnight]);
  const score = scoreGame({ game: g.game, seat, teams: g.teams, result: g.result, state: g.state, ownMoves, firstToday: earlier.length === 0 });

  await q(c, `insert into user_progress(user_id) values ($1) on conflict do nothing`, [userId]);
  const prog = (await q<{ xp: number; level: number }>(c, `select xp, level from user_progress where user_id=$1 for update`, [userId]))[0]!;
  const before = levelFromXp(prog.xp);
  const base: Omit<ProgressMsg, 'xpGained' | 'breakdown' | 'totalXp' | 'level' | 'levelUp' | 'xpInLevel' | 'xpToNext'> = {
    t: 'progress',
    tableId: g.tableId,
    game: g.game,
    levelBefore: before.level,
    xpInLevelBefore: before.xpInLevel,
    newAchievements: [],
    challengesDone: [],
    unlocks: [],
  };

  if (!score.facts.counted) {
    const msg: ProgressMsg = { ...base, xpGained: 0, breakdown: [], totalXp: prog.xp, level: before.level, levelUp: false, xpInLevel: before.xpInLevel, xpToNext: before.xpToNext, tooShort: true };
    await q(c, `update xp_awards set detail=$3 where user_id=$1 and table_id=$2`, [userId, g.tableId, JSON.stringify({ ...msg, ownMoves })]);
    return msg;
  }

  const lines: XpLine[] = [...score.lines];
  // Per game stats
  const stats = await loadStats(c, userId);
  const next = applyStats(stats[g.game], score.facts, score.xp);
  stats[g.game] = next;
  await q(
    c,
    `insert into user_game_stats(user_id, game, games, wins, draws, losses, win_streak, best_streak, xp, extra, updated_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, now())
     on conflict (user_id, game) do update set games=excluded.games, wins=excluded.wins, draws=excluded.draws, losses=excluded.losses,
       win_streak=excluded.win_streak, best_streak=excluded.best_streak, xp=excluded.xp, extra=excluded.extra, updated_at=now()`,
    [userId, g.game, next.games, next.wins, next.draws, next.losses, next.win_streak, next.best_streak, next.xp, JSON.stringify(next.extra)],
  );

  // Daily challenges
  const day = utcDay();
  const gamesToday = [...new Set([...earlier.map((e) => e.game as ProgressGame), g.game])];
  const challengesDone: ProgressMsg['challengesDone'] = [];
  for (const def of challengesFor(day)) {
    const row = await maybe<{ progress: number; done_at: string | null }>(c, `select progress, done_at from daily_challenge_progress where user_id=$1 and day=$2 and code=$3`, [userId, day, def.code]);
    if (row?.done_at) continue;
    const prev = row?.progress ?? 0;
    const value = Math.min(def.target, def.step(prev, score.facts, gamesToday));
    if (value === prev && row) continue;
    const done = value >= def.target;
    await q(
      c,
      `insert into daily_challenge_progress(user_id, day, code, progress, target, done_at) values ($1,$2,$3,$4,$5, case when $6 then now() end)
       on conflict (user_id, day, code) do update set progress=excluded.progress, done_at=excluded.done_at`,
      [userId, day, def.code, value, def.target, done],
    );
    if (done) {
      challengesDone.push({ code: def.code, name: def.name, xp: XP.challenge });
      lines.push({ label: `Daily challenge: ${def.name}`, xp: XP.challenge });
    }
  }

  // Achievements (repeat because achievement XP can raise the level, which can unlock a level achievement)
  const have = new Set((await q<{ code: string }>(c, `select code from user_achievements where user_id=$1`, [userId])).map((r) => r.code));
  const haveBefore = new Set(have);
  const daily = await dailyCounts(c, userId);
  let total = prog.xp + lines.reduce((a, l) => a + l.xp, 0);
  const newAch: AchievementInfo[] = [];
  for (let round = 0; round < 4; round++) {
    const snap: Snapshot = { stats, level: levelFromXp(total).level, dailyDone: daily.done, dailyFullDays: daily.full };
    const fresh = ACHIEVEMENTS.filter((a) => !have.has(a.code) && a.metric(snap) >= a.target);
    if (!fresh.length) break;
    for (const a of fresh) {
      have.add(a.code);
      await q(c, `insert into user_achievements(user_id, code, table_id) values ($1,$2,$3) on conflict do nothing`, [userId, a.code, g.tableId]);
      newAch.push(achievementInfo(a));
      if (a.xp) {
        lines.push({ label: `Achievement: ${a.name}`, xp: a.xp });
        total += a.xp;
      }
    }
  }

  const after = levelFromXp(total);
  const unlocks = COSMETICS.filter((cz) => isUnlocked(cz, after.level, have) && !isUnlocked(cz, before.level, haveBefore)).map((cz) => ({ slot: cz.slot, id: cz.id, name: cz.name }));
  const gained = total - prog.xp;
  await q(c, `update user_progress set xp=$2, level=$3, updated_at=now() where user_id=$1`, [userId, total, after.level]);
  const msg: ProgressMsg = {
    ...base,
    xpGained: gained,
    breakdown: lines,
    totalXp: total,
    level: after.level,
    levelUp: after.level > before.level,
    xpInLevel: after.xpInLevel,
    xpToNext: after.xpToNext,
    newAchievements: newAch,
    challengesDone,
    unlocks,
  };
  await q(c, `update xp_awards set xp=$3, detail=$4 where user_id=$1 and table_id=$2`, [userId, g.tableId, gained, JSON.stringify({ ...msg, ownMoves })]);
  return msg;
}

/** The progress message for one finished table, so a result screen can show it after a reload or a missed push. */
export async function getAward(userId: string, tableId: string): Promise<ProgressMsg | null> {
  const r = await maybe<{ detail: any }>(pool, `select detail from xp_awards where user_id=$1 and table_id=$2`, [userId, tableId]);
  if (!r?.detail?.t) return null;
  const { ownMoves: _o, ...msg } = r.detail;
  return msg as ProgressMsg;
}

/** Award progress to every human player of a finished game. Throws on database errors. */
export async function awardProgress(g: FinishedGame, push: PushFn, run: Runner = tx): Promise<ProgressMsg[]> {
  const out: ProgressMsg[] = [];
  for (const p of g.players) {
    const msg = await run((c) => recordSeat(c, g, p.seat, p.userId));
    if (msg) {
      out.push(msg);
      try {
        push(p.userId, msg);
      } catch (e) {
        log.warn({ err: (e as Error).message }, 'progress push failed');
      }
    }
  }
  return out;
}

/** Never throws. Used from settlement, after the money transaction has committed. */
export async function awardProgressSafe(g: FinishedGame, push: PushFn, run?: Runner): Promise<ProgressMsg[]> {
  try {
    return await awardProgress(g, push, run);
  } catch (e) {
    log.error({ err: (e as Error).message, tableId: g.tableId }, 'progress award failed (money not affected)');
    return [];
  }
}

// ---------- reads ----------

export async function getProgress(userId: string): Promise<ProgressResponse> {
  const prog = (await maybe<{ xp: number; equipped: Record<string, string> }>(pool, `select xp, equipped from user_progress where user_id=$1`, [userId])) ?? { xp: 0, equipped: {} };
  const lv = levelFromXp(prog.xp);
  const stats = await loadStats(pool, userId);
  const achRows = await q<{ code: string; unlocked_at: string }>(pool, `select code, unlocked_at from user_achievements where user_id=$1`, [userId]);
  const have = new Map(achRows.map((r) => [r.code, new Date(r.unlocked_at).toISOString()]));
  const daily = await dailyCounts(pool, userId);
  const snap: Snapshot = { stats, level: lv.level, dailyDone: daily.done, dailyFullDays: daily.full };
  const day = utcDay();
  const rows = await q<{ code: string; progress: number; done_at: string | null }>(pool, `select code, progress, done_at from daily_challenge_progress where user_id=$1 and day=$2`, [userId, day]);
  const byCode = new Map(rows.map((r) => [r.code, r]));
  const haveSet = new Set(have.keys());
  const equipped = prog.equipped ?? {};
  const titleId = equipped.title;
  const title = COSMETICS.find((c) => c.slot === 'title' && c.id === titleId)?.name ?? null;

  return {
    level: lv.level,
    totalXp: prog.xp,
    xpInLevel: lv.xpInLevel,
    xpToNext: lv.xpToNext,
    title,
    frame: equipped.frame ?? null,
    stats: GAME_IDS.map((g) => ({
      game: g,
      games: stats[g].games,
      wins: stats[g].wins,
      draws: stats[g].draws,
      losses: stats[g].losses,
      winStreak: stats[g].win_streak,
      bestStreak: stats[g].best_streak,
      xp: stats[g].xp,
      rank: rankFor(stats[g].xp),
      extra: stats[g].extra,
    })),
    totals: { games: GAME_IDS.reduce((a, g) => a + stats[g].games, 0), wins: GAME_IDS.reduce((a, g) => a + stats[g].wins, 0) },
    achievements: ACHIEVEMENTS.map((a) => ({
      ...achievementInfo(a),
      unlocked: have.has(a.code),
      unlockedAt: have.get(a.code) ?? null,
      progress: have.has(a.code) ? a.target : Math.min(a.target, Math.max(0, a.metric(snap))),
      target: a.target,
    })),
    challenges: {
      day,
      resetsInMs: msToReset(),
      items: challengesFor(day).map((d) => {
        const r = byCode.get(d.code);
        return { code: d.code, name: d.name, how: d.how, game: d.game, progress: r?.progress ?? 0, target: d.target, done: !!r?.done_at, xp: XP.challenge };
      }),
    },
    cosmetics: COSMETICS.map((c) => ({ slot: c.slot, id: c.id, name: c.name, how: c.how, unlocked: isUnlocked(c, lv.level, haveSet), equipped: equipped[c.slot] === c.id })),
    rules: { finish: XP.finish, win: XP.win, draw: XP.draw, minMoves: MIN_MOVES, xp: { ...XP } },
  };
}

export class EquipError extends Error {}

export async function equip(userId: string, slot: CosmeticSlot, id: string | null) {
  if (id !== null) {
    const def = COSMETICS.find((c) => c.slot === slot && c.id === id);
    if (!def) throw new EquipError('That item does not exist.');
    const prog = await maybe<{ xp: number }>(pool, `select xp from user_progress where user_id=$1`, [userId]);
    const level = levelFromXp(prog?.xp ?? 0).level;
    const have = new Set((await q<{ code: string }>(pool, `select code from user_achievements where user_id=$1`, [userId])).map((r) => r.code));
    if (!isUnlocked(def, level, have)) throw new EquipError(`You have not unlocked ${def.name} yet. ${def.how}`);
  }
  await q(pool, `insert into user_progress(user_id) values ($1) on conflict do nothing`, [userId]);
  if (id === null) await q(pool, `update user_progress set equipped = equipped - $2::text, updated_at=now() where user_id=$1`, [userId, slot]);
  else await q(pool, `update user_progress set equipped = equipped || jsonb_build_object($2::text, $3::text), updated_at=now() where user_id=$1`, [userId, slot, id]);
  return getProgress(userId);
}

