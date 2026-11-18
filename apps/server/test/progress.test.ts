import { describe, expect, it } from 'vitest';
import { chessEngine, Rng } from '@coldcall/games';
import {
  scoreGame,
  levelFromXp,
  xpForLevel,
  challengesFor,
  ACHIEVEMENTS,
  CHALLENGE_SLOTS,
  COSMETICS,
  applyStats,
  emptyStats,
  MIN_MOVES,
  type ScoreInput,
} from '../src/progress-rules';

function scholarsMate() {
  const rng = Rng.fromSeeds('a'.repeat(64), ['b']);
  let s = chessEngine.create({}, rng);
  const moves = [['a2', 'a3'], ['a7', 'a6'], ['e2', 'e4'], ['e7', 'e5'], ['f1', 'c4'], ['b8', 'c6'], ['d1', 'h5'], ['g8', 'f6'], ['h5', 'f7']];
  moves.forEach(([from, to], k) => (s = chessEngine.applyMove(s, k % 2, { from: from!, to: to! }, rng)));
  return { state: s, result: chessEngine.result(s)! };
}

describe('progress rules', () => {
  it('scoring has no mode, stake or money input, so practice and credits games score the same', () => {
    const { state, result } = scholarsMate();
    expect(result.reason).toBe('checkmate');
    const input: ScoreInput = { game: 'chess', seat: 0, teams: chessEngine.teams, result, state, ownMoves: 5, firstToday: false };
    // Extra keys a caller might be tempted to pass are ignored by construction.
    const practice = scoreGame({ ...input, ...({ mode: 'practice', stake: 0 } as object) } as ScoreInput);
    const staked = scoreGame({ ...input, ...({ mode: 'pvp', stake: 3000, balance: 1e9 } as object) } as ScoreInput);
    expect(staked).toEqual(practice);
    expect(practice.xp).toBe(20 + 30 + 25); // finish + win + checkmate
  });

  it('gives nothing for a game that was too short (start and resign farming)', () => {
    const { state, result } = scholarsMate();
    const r = scoreGame({ game: 'chess', seat: 0, teams: [0, 1], result, state, ownMoves: MIN_MOVES - 1, firstToday: true });
    expect(r.xp).toBe(0);
    expect(r.facts.counted).toBe(false);
  });

  it('loser still gets the finish XP', () => {
    const { state, result } = scholarsMate();
    const r = scoreGame({ game: 'chess', seat: 1, teams: [0, 1], result, state, ownMoves: 5, firstToday: false });
    expect(r.lines.map((l) => l.label)).toEqual(['Game finished']);
  });

  it('sea battle bonuses come from the shots of that seat only', () => {
    const shots = [
      ...Array.from({ length: 6 }, () => ({ seat: 0, result: 'hit' })),
      ...Array.from({ length: 11 }, (_, k) => ({ seat: 0, result: k % 4 === 3 ? 'miss' : 'hit' })),
      ...Array.from({ length: 30 }, () => ({ seat: 1, result: 'miss' })),
    ];
    const r = scoreGame({ game: 'seabattle', seat: 0, teams: [0, 1], result: { winners: [0], draw: false, reason: 'fleet_sunk' }, state: { shots, sunk: [[], []] }, ownMoves: 17, firstToday: false });
    expect(r.facts.seabattle).toMatchObject({ shots: 17, bestRun: 9, fleetSunk: true });
    expect(r.lines.map((l) => l.label)).toContain('Fleet sunk in under 40 shots');
    expect(r.lines.map((l) => l.label)).toContain('5 hits in a row');
  });

  it('level curve is gentle and consistent', () => {
    expect(xpForLevel(1)).toBe(140);
    expect(levelFromXp(0)).toEqual({ level: 1, xpInLevel: 0, xpToNext: 140 });
    expect(levelFromXp(139).level).toBe(1);
    expect(levelFromXp(140)).toEqual({ level: 2, xpInLevel: 0, xpToNext: 180 });
    expect(levelFromXp(140 + 180 + 5)).toEqual({ level: 3, xpInLevel: 5, xpToNext: 220 });
  });

  it('daily challenges are deterministic per UTC day and always three from different slots', () => {
    const a = challengesFor('2026-11-16').map((c) => c.code);
    expect(challengesFor('2026-11-16').map((c) => c.code)).toEqual(a);
    expect(a).toHaveLength(3);
    a.forEach((code, k) => expect(CHALLENGE_SLOTS[k]!.some((c) => c.code === code)).toBe(true));
    const seen = new Set<string>();
    for (let d = 1; d <= 28; d++) challengesFor(`2026-02-${String(d).padStart(2, '0')}`).forEach((c) => seen.add(c.code));
    expect(seen.size).toBeGreaterThan(6);
  });

  it('catalogue is sane: unique codes, rewards point at real achievements', () => {
    const codes = new Set(ACHIEVEMENTS.map((a) => a.code));
    expect(codes.size).toBe(ACHIEVEMENTS.length);
    expect(ACHIEVEMENTS.length).toBeGreaterThanOrEqual(20);
    for (const c of COSMETICS) if (c.achievement) expect(codes.has(c.achievement)).toBe(true);
    const ids = COSMETICS.map((c) => `${c.slot}:${c.id}`);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('stats track streaks', () => {
    const win = { game: 'chess', counted: true, won: true, draw: false, lost: false, reason: 'checkmate', ownMoves: 9 } as const;
    let s = emptyStats();
    s = applyStats(s, win, 50);
    s = applyStats(s, win, 50);
    s = applyStats(s, { ...win, won: false, lost: true }, 20);
    s = applyStats(s, win, 50);
    expect(s).toMatchObject({ games: 4, wins: 3, losses: 1, win_streak: 1, best_streak: 2, xp: 170 });
  });
});

describe('progress never breaks settlement', () => {
  it('awardProgressSafe swallows database errors and push errors', async () => {
    process.env.DATABASE_URL ??= 'postgres://localhost:1/none';
    const { awardProgressSafe } = await import('../src/progress');
    const { state, result } = scholarsMate();
    const game = { tableId: '00000000-0000-0000-0000-000000000000', game: 'chess' as const, teams: [0, 1], result, state, players: [{ seat: 0, userId: 'u' }] };
    const failing = async () => {
      throw new Error('db down');
    };
    await expect(awardProgressSafe(game, () => {}, failing as any)).resolves.toEqual([]);
    const throwingPush = () => {
      throw new Error('socket gone');
    };
    const fakeMsg = { t: 'progress' } as any;
    await expect(awardProgressSafe(game, throwingPush, (async () => fakeMsg) as any)).resolves.toEqual([fakeMsg]);
  });
});
