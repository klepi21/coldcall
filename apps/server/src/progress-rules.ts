/**
 * Progression rules, pure and deterministic. No database, no money.
 *
 * Ethics (binding): XP is earned by playing and playing well. The scoring function below does not
 * receive the mode, the stake, the balance or anything about money, so a practice game and a staked
 * game with the same play always earn exactly the same XP. Rewards are cosmetic or status only.
 */
import type { GameResult } from '@coldcall/games';
import type { AchievementInfo, CosmeticSlot, ProgressGame, XpLine } from '@coldcall/shared';

export const XP = {
  finish: 20,
  win: 30,
  draw: 10,
  firstToday: 15,
  challenge: 50,
  chessCheckmate: 25,
  chessPromotion: 10,
  bgGammon: 25,
  bgBackgammon: 40,
  tichuMade: 25,
  grandMade: 50,
  doubleVictory: 20,
  sbUnder40: 25,
  sbRun5: 10,
  sbSharp: 15,
} as const;

/** A game only counts once the player has made this many real moves. Stops "start and resign" farming. */
export const MIN_MOVES = 5;

export const GAME_IDS: ProgressGame[] = ['chess', 'backgammon', 'tichu', 'seabattle'];

// ---------- levels ----------

/** XP needed to go from level n to level n + 1. Gentle early: 140, 180, 220 ... */
export const xpForLevel = (n: number) => 100 + 40 * n;

export function levelFromXp(total: number) {
  let level = 1;
  let rest = Math.max(0, Math.floor(total));
  while (rest >= xpForLevel(level)) {
    rest -= xpForLevel(level);
    level++;
  }
  return { level, xpInLevel: rest, xpToNext: xpForLevel(level) };
}

// ---------- per game ranks (from XP earned in that game, never from stakes or ratings) ----------

export const RANKS = [
  { name: 'Bronze', xp: 0 },
  { name: 'Silver', xp: 300 },
  { name: 'Gold', xp: 900 },
  { name: 'Platinum', xp: 2000 },
  { name: 'Diamond', xp: 4000 },
  { name: 'Master', xp: 7000 },
];

export function rankFor(gameXp: number) {
  let i = 0;
  while (i + 1 < RANKS.length && gameXp >= RANKS[i + 1]!.xp) i++;
  const next = RANKS[i + 1] ?? null;
  return {
    name: RANKS[i]!.name,
    index: i,
    next: next?.name ?? null,
    xpInRank: gameXp - RANKS[i]!.xp,
    xpForNext: next ? next.xp - RANKS[i]!.xp : null,
  };
}

// ---------- facts from a finished game ----------

export interface GameFacts {
  game: ProgressGame;
  counted: boolean;
  won: boolean;
  draw: boolean;
  lost: boolean;
  reason: string;
  ownMoves: number;
  chess?: { checkmate: boolean; promotions: number; captures: number; plies: number };
  backgammon?: { gammon: boolean; backgammon: boolean };
  tichu?: { tichusMade: number; grandsMade: number; doubleVictories: number };
  seabattle?: { shots: number; hits: number; bestRun: number; shipsLost: number; fleetSunk: boolean };
}

export interface ScoreInput {
  game: ProgressGame;
  seat: number;
  /** Seat to team index, from the engine. */
  teams: number[];
  result: GameResult;
  /** Final engine state. */
  state: any;
  /** Real moves this seat made (resigns excluded). */
  ownMoves: number;
  /** First counted game of the UTC day for this player. */
  firstToday: boolean;
}

export function gameFacts(i: ScoreInput): GameFacts {
  const myTeam = i.teams[i.seat];
  const won = !i.result.draw && i.result.winners.some((w) => i.teams[w] === myTeam);
  const draw = i.result.draw;
  const f: GameFacts = { game: i.game, counted: i.ownMoves >= MIN_MOVES, won, draw, lost: !won && !draw, reason: i.result.reason, ownMoves: i.ownMoves };
  const s = i.state ?? {};
  if (i.game === 'chess') {
    const whiteFirst = !String(s.startFen ?? 'w').split(' ')[1] || String(s.startFen).split(' ')[1] === 'w';
    const mine = ((s.history ?? []) as { captured?: string; promotion?: string }[]).filter((_, k) => ((k + (whiteFirst ? 0 : 1)) % 2) === i.seat);
    f.chess = {
      checkmate: won && i.result.reason === 'checkmate',
      promotions: mine.filter((m) => m.promotion).length,
      captures: mine.filter((m) => m.captured).length,
      plies: mine.length,
    };
  } else if (i.game === 'backgammon') {
    const r = s.winner?.seat === i.seat ? s.winner.reason : null;
    f.backgammon = { gammon: won && r === 'gammon', backgammon: won && r === 'backgammon' };
  } else if (i.game === 'tichu') {
    const rounds = (s.rounds ?? []) as { calls: { seat: number; kind: 'tichu' | 'grand'; made: boolean }[]; doubleVictory: number | null }[];
    let tichusMade = 0;
    let grandsMade = 0;
    let doubleVictories = 0;
    for (const r of rounds) {
      for (const c of r.calls ?? []) if (c.seat === i.seat && c.made) c.kind === 'grand' ? grandsMade++ : tichusMade++;
      if (r.doubleVictory !== null && r.doubleVictory !== undefined && r.doubleVictory === myTeam) doubleVictories++;
    }
    f.tichu = { tichusMade, grandsMade, doubleVictories };
  } else if (i.game === 'seabattle') {
    const shots = ((s.shots ?? []) as { seat: number; result: 'miss' | 'hit' | 'sunk' }[]).filter((x) => x.seat === i.seat);
    let run = 0;
    let bestRun = 0;
    let hits = 0;
    for (const x of shots) {
      if (x.result === 'miss') run = 0;
      else {
        hits++;
        run++;
        bestRun = Math.max(bestRun, run);
      }
    }
    f.seabattle = {
      shots: shots.length,
      hits,
      bestRun,
      shipsLost: ((s.sunk?.[i.seat] ?? []) as unknown[]).length,
      fleetSunk: won && i.result.reason === 'fleet_sunk',
    };
  }
  return f;
}

/** XP lines for one finished game. Same rules for every mode. */
export function scoreGame(i: ScoreInput): { facts: GameFacts; lines: XpLine[]; xp: number } {
  const f = gameFacts(i);
  const lines: XpLine[] = [];
  if (!f.counted) return { facts: f, lines, xp: 0 };
  lines.push({ label: 'Game finished', xp: XP.finish });
  if (f.won) lines.push({ label: 'Win', xp: XP.win });
  if (f.draw) lines.push({ label: 'Draw', xp: XP.draw });
  if (i.firstToday) lines.push({ label: 'First game today', xp: XP.firstToday });
  if (f.chess?.checkmate) lines.push({ label: 'Checkmate', xp: XP.chessCheckmate });
  if (f.chess?.promotions) lines.push({ label: 'Pawn promoted', xp: XP.chessPromotion * Math.min(2, f.chess.promotions) });
  if (f.backgammon?.backgammon) lines.push({ label: 'Backgammon win', xp: XP.bgBackgammon });
  else if (f.backgammon?.gammon) lines.push({ label: 'Gammon win', xp: XP.bgGammon });
  if (f.tichu?.grandsMade) lines.push({ label: 'Grand Tichu made', xp: XP.grandMade * f.tichu.grandsMade });
  if (f.tichu?.tichusMade) lines.push({ label: 'Tichu call made', xp: XP.tichuMade * f.tichu.tichusMade });
  if (f.tichu?.doubleVictories) lines.push({ label: 'Double victory', xp: XP.doubleVictory * f.tichu.doubleVictories });
  if (f.seabattle?.fleetSunk && f.seabattle.shots < 40) lines.push({ label: 'Fleet sunk in under 40 shots', xp: XP.sbUnder40 });
  if (f.seabattle && f.seabattle.bestRun >= 5) lines.push({ label: '5 hits in a row', xp: XP.sbRun5 });
  if (f.seabattle && f.seabattle.shots >= 20 && f.seabattle.hits / f.seabattle.shots >= 0.6) lines.push({ label: 'Sharp shooting', xp: XP.sbSharp });
  return { facts: f, lines, xp: lines.reduce((a, l) => a + l.xp, 0) };
}

// ---------- per game stats ----------

export interface StatRow {
  games: number;
  wins: number;
  draws: number;
  losses: number;
  win_streak: number;
  best_streak: number;
  xp: number;
  extra: Record<string, number>;
}
export const emptyStats = (): StatRow => ({ games: 0, wins: 0, draws: 0, losses: 0, win_streak: 0, best_streak: 0, xp: 0, extra: {} });

export function applyStats(prev: StatRow, f: GameFacts, xp: number): StatRow {
  const s: StatRow = { ...prev, extra: { ...prev.extra } };
  const add = (k: string, n: number) => n && (s.extra[k] = (s.extra[k] ?? 0) + n);
  s.games++;
  s.xp += xp;
  if (f.won) {
    s.wins++;
    s.win_streak++;
    s.best_streak = Math.max(s.best_streak, s.win_streak);
  } else {
    if (f.draw) s.draws++;
    else s.losses++;
    s.win_streak = 0;
  }
  if (f.chess) {
    add('checkmates', f.chess.checkmate ? 1 : 0);
    add('promotions', f.chess.promotions);
    add('captures', f.chess.captures);
    if (f.chess.checkmate && f.chess.plies <= 25) add('quickMates', 1);
  }
  if (f.backgammon) {
    add('gammons', f.backgammon.gammon ? 1 : 0);
    add('backgammons', f.backgammon.backgammon ? 1 : 0);
  }
  if (f.tichu) {
    add('tichusMade', f.tichu.tichusMade);
    add('grandsMade', f.tichu.grandsMade);
    add('doubleVictories', f.tichu.doubleVictories);
  }
  if (f.seabattle) {
    add('shots', f.seabattle.shots);
    add('hits', f.seabattle.hits);
    s.extra.bestHitRun = Math.max(s.extra.bestHitRun ?? 0, f.seabattle.bestRun);
    if (f.seabattle.fleetSunk) {
      add('fleetsSunk', 1);
      s.extra.bestShots = s.extra.bestShots ? Math.min(s.extra.bestShots, f.seabattle.shots) : f.seabattle.shots;
      if (f.seabattle.shipsLost === 0) add('flawless', 1);
    }
  }
  return s;
}

// ---------- achievements ----------

export interface Snapshot {
  stats: Record<ProgressGame, StatRow>;
  level: number;
  dailyDone: number;
  dailyFullDays: number;
}

interface AchDef extends AchievementInfo {
  target: number;
  metric: (s: Snapshot) => number;
}

const sum = (s: Snapshot, k: keyof Omit<StatRow, 'extra'>) => GAME_IDS.reduce((a, g) => a + (s.stats[g][k] as number), 0);
const ex = (s: Snapshot, g: ProgressGame, k: string) => s.stats[g].extra[k] ?? 0;

export const ACHIEVEMENTS: AchDef[] = [
  { code: 'first_game', name: 'First steps', how: 'Finish your first game. Practice counts.', game: null, icon: 'spark', xp: 25, target: 1, metric: (s) => sum(s, 'games') },
  { code: 'first_win', name: 'First win', how: 'Win any game. Practice against the bot counts.', game: null, icon: 'trophy', xp: 25, target: 1, metric: (s) => sum(s, 'wins') },
  { code: 'games_10', name: 'Warming up', how: 'Finish 10 games of anything.', game: null, icon: 'flame', xp: 50, target: 10, metric: (s) => sum(s, 'games') },
  { code: 'games_50', name: 'Regular', how: 'Finish 50 games of anything.', game: null, icon: 'flame', xp: 100, target: 50, metric: (s) => sum(s, 'games') },
  { code: 'games_100', name: 'Club stalwart', how: 'Finish 100 games of anything.', game: null, icon: 'crown', xp: 150, target: 100, metric: (s) => sum(s, 'games') },
  { code: 'explorer', name: 'Explorer', how: 'Finish a game of all four: chess, backgammon, Tichu and Ice Floe Battle.', game: null, icon: 'compass', xp: 50, target: 4, metric: (s) => GAME_IDS.filter((g) => s.stats[g].games > 0).length },
  { code: 'all_rounder', name: 'All rounder', how: 'Win at least one game of each of the four games.', game: null, icon: 'star', xp: 100, target: 4, metric: (s) => GAME_IDS.filter((g) => s.stats[g].wins > 0).length, reward: 'Title: All rounder' },
  { code: 'streak_3', name: 'Hat trick', how: 'Win 3 games in a row of the same game.', game: null, icon: 'bolt', xp: 50, target: 3, metric: (s) => Math.max(...GAME_IDS.map((g) => s.stats[g].best_streak)) },
  { code: 'streak_5', name: 'Unstoppable', how: 'Win 5 games in a row of the same game.', game: null, icon: 'bolt', xp: 100, target: 5, metric: (s) => Math.max(...GAME_IDS.map((g) => s.stats[g].best_streak)), reward: 'Frame: Prism and title: On fire' },
  { code: 'level_5', name: 'Level 5', how: 'Reach level 5.', game: null, icon: 'arrow', xp: 0, target: 5, metric: (s) => s.level },
  { code: 'level_10', name: 'Level 10', how: 'Reach level 10.', game: null, icon: 'arrow', xp: 0, target: 10, metric: (s) => s.level },
  { code: 'level_20', name: 'Level 20', how: 'Reach level 20.', game: null, icon: 'crown', xp: 0, target: 20, metric: (s) => s.level },
  { code: 'daily_1', name: 'Daily player', how: 'Complete any daily challenge.', game: null, icon: 'sun', xp: 25, target: 1, metric: (s) => s.dailyDone },
  { code: 'daily_full', name: 'Full house', how: 'Complete all three daily challenges on the same day.', game: null, icon: 'sun', xp: 75, target: 1, metric: (s) => s.dailyFullDays, reward: 'Frame: Aurora' },
  // Chess
  { code: 'mate', name: 'Mate maker', how: 'Win a chess game by checkmate.', game: 'chess', icon: 'king', xp: 50, target: 1, metric: (s) => ex(s, 'chess', 'checkmates'), reward: 'Title: Mate maker and the Aurora board' },
  { code: 'quick_mate', name: 'Swift mate', how: 'Checkmate in 25 of your own moves or fewer.', game: 'chess', icon: 'bolt', xp: 75, target: 1, metric: (s) => ex(s, 'chess', 'quickMates') },
  { code: 'promote', name: 'New queen', how: 'Promote a pawn in a chess game you finish.', game: 'chess', icon: 'crown', xp: 25, target: 1, metric: (s) => ex(s, 'chess', 'promotions') },
  { code: 'chess_10', name: 'Chess club', how: 'Win 10 chess games.', game: 'chess', icon: 'king', xp: 100, target: 10, metric: (s) => s.stats.chess.wins },
  // Backgammon
  { code: 'gammon', name: 'Gammon', how: 'Win a backgammon game before your opponent bears off a single checker.', game: 'backgammon', icon: 'dice', xp: 50, target: 1, metric: (s) => ex(s, 'backgammon', 'gammons') + ex(s, 'backgammon', 'backgammons'), reward: 'Title: Gammon hunter' },
  { code: 'backgammon', name: 'Backgammon!', how: 'Win with a backgammon: they still have a checker on the bar or in your home board.', game: 'backgammon', icon: 'dice', xp: 100, target: 1, metric: (s) => ex(s, 'backgammon', 'backgammons'), reward: 'Jade dice' },
  { code: 'bg_10', name: 'Tavli regular', how: 'Win 10 backgammon games.', game: 'backgammon', icon: 'dice', xp: 100, target: 10, metric: (s) => s.stats.backgammon.wins },
  // Tichu
  { code: 'tichu_made', name: 'Called it', how: 'Call Tichu and go out first in that round.', game: 'tichu', icon: 'card', xp: 50, target: 1, metric: (s) => ex(s, 'tichu', 'tichusMade') + ex(s, 'tichu', 'grandsMade'), reward: 'Title: The caller' },
  { code: 'grand_made', name: 'Grand gesture', how: 'Call Grand Tichu before seeing all your cards, then go out first.', game: 'tichu', icon: 'dragon', xp: 100, target: 1, metric: (s) => ex(s, 'tichu', 'grandsMade'), reward: 'Dragon card back' },
  { code: 'double_victory', name: 'One two', how: 'You and your partner go out first and second in the same round.', game: 'tichu', icon: 'card', xp: 50, target: 1, metric: (s) => ex(s, 'tichu', 'doubleVictories') },
  // Ice Floe Battle
  { code: 'sb_win', name: 'Fleet sunk', how: 'Sink a whole fleet in Ice Floe Battle.', game: 'seabattle', icon: 'anchor', xp: 25, target: 1, metric: (s) => ex(s, 'seabattle', 'fleetsSunk') },
  { code: 'sb_sharp', name: 'Admiral', how: 'Sink a whole fleet in under 40 shots.', game: 'seabattle', icon: 'target', xp: 75, target: 1, metric: (s) => (ex(s, 'seabattle', 'bestShots') && ex(s, 'seabattle', 'bestShots') < 40 ? 1 : 0), reward: 'Title: Admiral' },
  { code: 'sb_run5', name: 'Broadside', how: 'Hit 5 times in a row in one Ice Floe Battle game.', game: 'seabattle', icon: 'target', xp: 50, target: 5, metric: (s) => ex(s, 'seabattle', 'bestHitRun'), reward: 'Stealth ship skin' },
  { code: 'sb_flawless', name: 'Untouched', how: 'Win a Ice Floe Battle game without losing a single ship.', game: 'seabattle', icon: 'shield', xp: 100, target: 1, metric: (s) => ex(s, 'seabattle', 'flawless') },
];

export const achievementInfo = (a: AchDef): AchievementInfo => ({ code: a.code, name: a.name, how: a.how, game: a.game, icon: a.icon, xp: a.xp, reward: a.reward ?? null });

// ---------- daily challenges ----------

interface ChallengeDef {
  code: string;
  name: string;
  how: string;
  game: ProgressGame | null;
  target: number;
  /** New progress after a counted game. `games` is the distinct games played today, including this one. */
  step: (prev: number, f: GameFacts, games: ProgressGame[]) => number;
}

const winIn = (g: ProgressGame | null) => (p: number, f: GameFacts) => p + (f.won && (g === null || f.game === g) ? 1 : 0);

/** Three slots: one easy, one win, one skill. Every challenge can be done in a free practice game. */
export const CHALLENGE_SLOTS: ChallengeDef[][] = [
  [
    { code: 'play_3', name: 'Play 3 games', how: 'Finish 3 games of anything. Practice counts.', game: null, target: 3, step: (p) => p + 1 },
    { code: 'play_2_kinds', name: 'Mix it up', how: 'Finish games of 2 different kinds today.', game: null, target: 2, step: (_p, _f, games) => games.length },
    { code: 'play_5', name: 'Play 5 games', how: 'Finish 5 games of anything. Practice counts.', game: null, target: 5, step: (p) => p + 1 },
  ],
  [
    { code: 'win_any', name: 'Get a win', how: 'Win any game. A practice game against the bot counts.', game: null, target: 1, step: winIn(null) },
    { code: 'win_chess', name: 'Win at chess', how: 'Win a chess game. Practice counts.', game: 'chess', target: 1, step: winIn('chess') },
    { code: 'win_backgammon', name: 'Win at backgammon', how: 'Win a backgammon game. Practice counts.', game: 'backgammon', target: 1, step: winIn('backgammon') },
    { code: 'win_seabattle', name: 'Win at Ice Floe Battle', how: 'Sink the whole enemy fleet. Practice counts.', game: 'seabattle', target: 1, step: winIn('seabattle') },
    { code: 'win_2', name: 'Two wins', how: 'Win 2 games of anything today.', game: null, target: 2, step: winIn(null) },
  ],
  [
    { code: 'sb_under_40', name: 'Sharp sinking', how: 'Sink a fleet in under 40 shots.', game: 'seabattle', target: 1, step: (p, f) => p + (f.seabattle?.fleetSunk && f.seabattle.shots < 40 ? 1 : 0) },
    { code: 'sb_run5', name: 'Five in a row', how: 'Hit 5 in a row in Ice Floe Battle.', game: 'seabattle', target: 5, step: (p, f) => Math.max(p, f.seabattle?.bestRun ?? 0) },
    { code: 'chess_mate', name: 'Checkmate', how: 'Win a chess game by checkmate.', game: 'chess', target: 1, step: (p, f) => p + (f.chess?.checkmate ? 1 : 0) },
    { code: 'chess_promote', name: 'Promotion', how: 'Promote a pawn in a chess game you finish.', game: 'chess', target: 1, step: (p, f) => p + (f.chess?.promotions ? 1 : 0) },
    { code: 'tichu_call', name: 'Call and make it', how: 'Call Tichu and go out first in that round.', game: 'tichu', target: 1, step: (p, f) => p + (f.tichu ? f.tichu.tichusMade + f.tichu.grandsMade : 0) },
  ],
];

export const ALL_CHALLENGES = CHALLENGE_SLOTS.flat();

export const utcDay = (d = new Date()) => d.toISOString().slice(0, 10);
export const msToReset = (d = new Date()) => {
  const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
  return next - d.getTime();
};

function hash(s: string) {
  let h = 2166136261;
  for (let k = 0; k < s.length; k++) h = Math.imul(h ^ s.charCodeAt(k), 16777619);
  return h >>> 0;
}

/** Today's three challenges. Same for everyone on the same UTC day. */
export function challengesFor(day: string): ChallengeDef[] {
  return CHALLENGE_SLOTS.map((slot, k) => slot[hash(`${day}:${k}`) % slot.length]!);
}

// ---------- cosmetics ----------

export interface CosmeticDef {
  slot: CosmeticSlot;
  id: string;
  name: string;
  how: string;
  level?: number;
  achievement?: string;
}

export const COSMETICS: CosmeticDef[] = [
  { slot: 'title', id: 'rookie', name: 'Rookie', how: 'Yours from the start.', level: 1 },
  { slot: 'title', id: 'regular', name: 'Regular', how: 'Reach level 3.', level: 3 },
  { slot: 'title', id: 'contender', name: 'Contender', how: 'Reach level 5.', level: 5 },
  { slot: 'title', id: 'tactician', name: 'Tactician', how: 'Reach level 8.', level: 8 },
  { slot: 'title', id: 'veteran', name: 'Veteran', how: 'Reach level 12.', level: 12 },
  { slot: 'title', id: 'legend', name: 'Club legend', how: 'Reach level 20.', level: 20 },
  { slot: 'title', id: 'mate_maker', name: 'Mate maker', how: 'Unlock the Mate maker achievement.', achievement: 'mate' },
  { slot: 'title', id: 'gammon_hunter', name: 'Gammon hunter', how: 'Unlock the Gammon achievement.', achievement: 'gammon' },
  { slot: 'title', id: 'the_caller', name: 'The caller', how: 'Unlock the Called it achievement.', achievement: 'tichu_made' },
  { slot: 'title', id: 'admiral', name: 'Admiral', how: 'Unlock the Admiral achievement.', achievement: 'sb_sharp' },
  { slot: 'title', id: 'all_rounder', name: 'All rounder', how: 'Unlock the All rounder achievement.', achievement: 'all_rounder' },
  { slot: 'title', id: 'on_fire', name: 'On fire', how: 'Unlock the Unstoppable achievement.', achievement: 'streak_5' },
  { slot: 'frame', id: 'lime', name: 'Lime ring', how: 'Reach level 2.', level: 2 },
  { slot: 'frame', id: 'violet', name: 'Violet orbit', how: 'Reach level 6.', level: 6 },
  { slot: 'frame', id: 'gold', name: 'Gold laurel', how: 'Reach level 10.', level: 10 },
  { slot: 'frame', id: 'aurora', name: 'Aurora', how: 'Unlock the Full house achievement.', achievement: 'daily_full' },
  { slot: 'frame', id: 'prism', name: 'Prism', how: 'Unlock the Unstoppable achievement.', achievement: 'streak_5' },
  { slot: 'chessTheme', id: 'obsidian', name: 'Obsidian board', how: 'Reach level 4.', level: 4 },
  { slot: 'chessTheme', id: 'aurora', name: 'Aurora board', how: 'Unlock the Mate maker achievement.', achievement: 'mate' },
  { slot: 'dice', id: 'brass', name: 'Brass dice', how: 'Reach level 5.', level: 5 },
  { slot: 'dice', id: 'jade', name: 'Jade dice', how: 'Unlock the Backgammon! achievement.', achievement: 'backgammon' },
  { slot: 'cardBack', id: 'meander_gold', name: 'Gold meander backs', how: 'Reach level 7.', level: 7 },
  { slot: 'cardBack', id: 'dragon', name: 'Dragon backs', how: 'Unlock the Grand gesture achievement.', achievement: 'grand_made' },
  { slot: 'shipSkin', id: 'brass', name: 'Brass fleet', how: 'Reach level 9.', level: 9 },
  { slot: 'shipSkin', id: 'stealth', name: 'Stealth fleet', how: 'Unlock the Broadside achievement.', achievement: 'sb_run5' },
];

export const isUnlocked = (c: CosmeticDef, level: number, achievements: Set<string>) =>
  (c.level !== undefined && level >= c.level) || (c.achievement !== undefined && achievements.has(c.achievement));
