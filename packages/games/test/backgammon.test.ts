import { describe, it, expect } from 'vitest';
import { Rng } from '../src/rng';
import { IllegalMoveError } from '../src/types';
import { backgammonEngine as E, type BgState, type BgStep, type BgConfig } from '../src/backgammon';
import { backgammonBot } from '../src/backgammon-bot';

const seed = (n: number) => n.toString(16).padStart(2, '0').repeat(32);

/** Rng stand in that returns scripted dice, then falls back to a real stream. */
function scripted(dice: number[]): Rng {
  const real = Rng.fromSeeds(seed(99), ['scripted']);
  const q = dice.slice();
  return {
    die: () => (q.length ? q.shift()! : real.die()),
    int: (n: number) => real.int(n),
    float: () => real.float(),
  } as unknown as Rng;
}

/** Build a board from point maps. Positive counts for seat 0, seat 1 given separately. */
function board(s0: Record<number, number>, s1: Record<number, number>): number[] {
  const b = new Array<number>(24).fill(0);
  for (const [i, n] of Object.entries(s0)) b[Number(i)] = n;
  for (const [i, n] of Object.entries(s1)) b[Number(i)] = -n;
  return b;
}

function setup(cfg: NonNullable<BgConfig['setup']>, rng: Rng = scripted([])): BgState {
  return E.create({ setup: cfg }, rng);
}

function count(s: BgState, seat: 0 | 1): number {
  let c = s.bar[seat] + s.off[seat];
  for (const v of s.board) if (seat === 0 ? v > 0 : v < 0) c += Math.abs(v);
  return c;
}

function explainOf(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(IllegalMoveError);
    return (e as IllegalMoveError).explain;
  }
  throw new Error('expected an IllegalMoveError');
}

describe('backgammon setup', () => {
  it('starts with 15 checkers each and an opening roll', () => {
    for (let k = 0; k < 20; k++) {
      const s = E.create({}, Rng.fromSeeds(seed(k), ['open']));
      expect(count(s, 0)).toBe(15);
      expect(count(s, 1)).toBe(15);
      const last = s.opening[s.opening.length - 1]!;
      expect(last[0]).not.toBe(last[1]);
      for (const t of s.opening.slice(0, -1)) expect(t[0]).toBe(t[1]);
      expect(s.turn).toBe(last[0] > last[1] ? 0 : 1);
      expect([...s.dice].sort()).toEqual([...last].sort());
      const v = E.publicView(s, -1);
      expect(v.pipCount).toEqual([167, 167]);
      expect(v.points[23]).toEqual({ seat: 0, count: 2 });
      expect(v.points[0]).toEqual({ seat: 1, count: 2 });
      expect(v.points[5]).toEqual({ seat: 0, count: 5 });
      expect(v.points[18]).toEqual({ seat: 1, count: 5 });
      expect(E.toAct(s)).toEqual([s.turn]);
      expect(JSON.parse(JSON.stringify(s))).toEqual(s);
    }
  });

  it('re-rolls opening ties', () => {
    const s = E.create({}, scripted([4, 4, 2, 5]));
    expect(s.opening).toEqual([[4, 4], [2, 5]]);
    expect(s.turn).toBe(1);
    expect(s.dice).toEqual([2, 5]);
  });
});

describe('backgammon rules', () => {
  it('forces bar entry first', () => {
    const s = setup({
      board: board({ 12: 14 }, { 0: 15 }),
      bar: [1, 0],
      turn: 0,
      dice: [3, 5],
    });
    const legal = E.legalMoves(s, 0) as BgStep[];
    expect(legal.length).toBeGreaterThan(0);
    expect(legal.every((m) => m.from === 'bar')).toBe(true);
    expect(legal).toContainEqual({ from: 'bar', to: 21, die: 3 });
    expect(legal).toContainEqual({ from: 'bar', to: 19, die: 5 });
    expect(explainOf(() => E.applyMove(s, 0, { from: 12, to: 9, die: 3 }, scripted([])))).toBe(
      'You have a checker on the bar. Bring it back in first.',
    );
  });

  it('seat 1 enters on die minus one', () => {
    const s = setup({ board: board({ 23: 15 }, { 12: 14 }), bar: [0, 1], turn: 1, dice: [2, 6] });
    const legal = E.legalMoves(s, 1) as BgStep[];
    expect(legal).toContainEqual({ from: 'bar', to: 1, die: 2 });
    expect(legal).toContainEqual({ from: 'bar', to: 5, die: 6 });
  });

  it('respects blocked points', () => {
    const s = setup({
      board: board({ 12: 14 }, { 21: 2, 0: 13 }),
      bar: [1, 0],
      turn: 0,
      dice: [3, 5],
    });
    const legal = E.legalMoves(s, 0) as BgStep[];
    expect(legal.some((m) => m.die === 3 && m.from === 'bar')).toBe(false);
    expect(legal).toContainEqual({ from: 'bar', to: 19, die: 5 });
    expect(explainOf(() => E.applyMove(s, 0, { from: 'bar', to: 21, die: 3 }, scripted([])))).toBe(
      "That point is blocked by two or more of your opponent's checkers.",
    );
  });

  it('hits a blot and sends it to the bar', () => {
    const s = setup({ board: board({ 12: 15 }, { 9: 1, 0: 14 }), turn: 0, dice: [3, 1] });
    const n = E.applyMove(s, 0, { from: 12, to: 9, die: 3 }, scripted([]));
    expect(n.bar[1]).toBe(1);
    expect(n.board[9]).toBe(1);
    expect(count(n, 1)).toBe(15);
  });

  it('only bears off when all checkers are home', () => {
    const s = setup({ board: board({ 3: 13, 8: 1 }, { 20: 15 }), off: [1, 0], turn: 0, dice: [4, 2] });
    expect(explainOf(() => E.applyMove(s, 0, { from: 3, to: 'off', die: 4 }, scripted([])))).toBe(
      'You can only bear off when all your checkers are in your home board.',
    );
  });

  it('bears off with a higher die only from the highest point', () => {
    const s = setup({ board: board({ 2: 1, 1: 1 }, { 20: 15 }), off: [13, 0], turn: 0, dice: [6, 5] });
    const legal = E.legalMoves(s, 0) as BgStep[];
    expect(legal).toContainEqual({ from: 2, to: 'off', die: 6 });
    expect(legal).toContainEqual({ from: 2, to: 'off', die: 5 });
    expect(legal.some((m) => m.from === 1)).toBe(false);
    const msg = explainOf(() => E.applyMove(s, 0, { from: 1, to: 'off', die: 6 }, scripted([])));
    expect(msg).toMatch(/highest point/);
    const a = E.applyMove(s, 0, { from: 2, to: 'off', die: 6 }, scripted([]));
    expect(E.legalMoves(a, 0)).toEqual([{ from: 1, to: 'off', die: 5 }]);
    const b = E.applyMove(a, 0, { from: 1, to: 'off', die: 5 }, scripted([]));
    expect(E.result(b)).toEqual({ winners: [0], draw: false, reason: 'gammon', score: { '0': 15, '1': 0 } });
    expect(E.toAct(b)).toEqual([]);
  });

  it('bears off seat 1 above 23', () => {
    const s = setup({ board: board({ 5: 15 }, { 22: 1 }), off: [0, 14], turn: 1, dice: [6, 5] });
    expect(E.legalMoves(s, 1)).toEqual([{ from: 22, to: 'off', die: 6 }]);
  });

  it('forces the larger die when only one can be played', () => {
    const s = setup({ board: board({ 10: 1 }, { 1: 2, 20: 13 }), off: [14, 0], turn: 0, dice: [3, 6] });
    expect(E.legalMoves(s, 0)).toEqual([{ from: 10, to: 4, die: 6 }]);
    expect(explainOf(() => E.applyMove(s, 0, { from: 10, to: 7, die: 3 }, scripted([])))).toBe(
      'When only one of your dice can be played, you must play the higher one.',
    );
    const n = E.applyMove(s, 0, { from: 10, to: 4, die: 6 }, scripted([2, 3]));
    expect(n.turn).toBe(1);
    expect(n.rolled).toEqual([2, 3]);
    expect(n.history[n.history.length - 1]!.steps).toHaveLength(1);
  });

  it('must use both dice when possible', () => {
    const s = setup({
      board: board({ 12: 1, 2: 13 }, { 9: 2, 23: 13 }),
      off: [1, 0],
      turn: 0,
      dice: [3, 1],
    });
    // 12 to 9 is blocked. 12 to 11 (die 1) then 11 to 8 (die 3) uses both.
    // Bearing off from 2 is not allowed (12 outside home). 2 to 1 (die 1) leaves 3 playable only via 12 to 9 blocked,
    // so 2 to 1 first uses only one die, and must be rejected.
    const legal = E.legalMoves(s, 0) as BgStep[];
    expect(legal).toEqual([{ from: 12, to: 11, die: 1 }]);
    expect(explainOf(() => E.applyMove(s, 0, { from: 2, to: 1, die: 1 }, scripted([])))).toMatch(/as many of your dice/);
  });

  it('plays doubles as four moves', () => {
    const s = setup({ board: [...E.create({}, scripted([6, 1])).board], turn: 0, dice: [6, 6] });
    expect(s.dice).toEqual([6, 6, 6, 6]);
    expect(s.rolled).toEqual([6, 6]);
    let n = s;
    const r = scripted([1, 2]);
    for (let k = 0; k < 4; k++) {
      expect(n.turn).toBe(0);
      const m = E.legalMoves(n, 0)[0]!;
      n = E.applyMove(n, 0, m, r);
    }
    expect(n.turn).toBe(1);
    expect(n.history[n.history.length - 1]!.steps).toHaveLength(4);
    expect(count(n, 0)).toBe(15);
  });

  it('passes automatically when the next player is blocked', () => {
    const s = setup({
      board: board({ 0: 2, 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 12: 3 }, { 22: 14 }),
      bar: [0, 1],
      turn: 0,
      dice: [1, 2],
    });
    const r = scripted([3, 4, 2, 1]);
    let n = E.applyMove(s, 0, { from: 12, to: 11, die: 1 }, r);
    n = E.applyMove(n, 0, { from: 11, to: 9, die: 2 }, r);
    expect(n.turn).toBe(0);
    expect(n.rolled).toEqual([2, 1]);
    const last = n.history[n.history.length - 1]!;
    expect(last).toEqual({ seat: 1, rolled: [3, 4], steps: [], passed: true });
  });

  it('passes in create when the side to move is blocked', () => {
    const s = setup(
      {
        board: board({ 0: 2, 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 12: 3 }, { 22: 14 }),
        bar: [0, 1],
        turn: 1,
        dice: [3, 4],
      },
      scripted([5, 2]),
    );
    expect(s.turn).toBe(0);
    expect(s.rolled).toEqual([5, 2]);
    expect(s.history).toEqual([{ seat: 1, rolled: [3, 4], steps: [], passed: true }]);
  });

  it('undo resets to the start of the turn, including hits', () => {
    const s = setup({ board: board({ 12: 15 }, { 9: 1, 0: 14 }), turn: 0, dice: [3, 1] });
    expect(explainOf(() => E.applyMove(s, 0, { type: 'undo' }, scripted([])))).toBe('There is nothing to undo yet.');
    const a = E.applyMove(s, 0, { from: 12, to: 9, die: 3 }, scripted([]));
    expect(a.bar[1]).toBe(1);
    expect(E.publicView(a, 0).canUndo).toBe(true);
    const u = E.applyMove(a, 0, { type: 'undo' }, scripted([]));
    expect(u.board).toEqual(s.board);
    expect(u.bar).toEqual([0, 0]);
    expect(u.dice).toEqual([3, 1]);
    expect(u.steps).toEqual([]);
    expect(u.turn).toBe(0);
    expect(explainOf(() => E.applyMove(a, 1, { type: 'undo' }, scripted([])))).toBe('Wait for your turn.');
  });

  it('does not mutate the input state', () => {
    const s = E.create({}, Rng.fromSeeds(seed(3), ['m']));
    const before = JSON.stringify(s);
    const m = E.legalMoves(s, s.turn)[0]!;
    E.applyMove(s, s.turn, m, Rng.fromSeeds(seed(4), ['m']));
    expect(JSON.stringify(s)).toBe(before);
  });

  it('rejects wrong turn and unknown dice', () => {
    const s = setup({ board: board({ 12: 15 }, { 0: 15 }), turn: 0, dice: [3, 1] });
    expect(explainOf(() => E.applyMove(s, 1, { from: 0, to: 3, die: 3 }, scripted([])))).toBe('Wait for your turn.');
    expect(explainOf(() => E.applyMove(s, 0, { from: 12, to: 8, die: 4 }, scripted([])))).toBe(
      'You do not have that number left to play this turn.',
    );
    expect(explainOf(() => E.applyMove(s, 0, { from: 13, to: 10, die: 3 }, scripted([])))).toBe(
      'You do not have a checker on that point.',
    );
  });
});

describe('backgammon results', () => {
  const finish = (s1: Record<number, number>, bar1 = 0, off1 = 0) => {
    const s = setup({ board: board({ 0: 1 }, s1), bar: [0, bar1], off: [14, off1], turn: 0, dice: [1, 2] });
    // Both dice could bear off the last checker, the higher die rule picks the 2.
    expect(E.legalMoves(s, 0)).toEqual([{ from: 0, to: 'off', die: 2 }]);
    return E.result(E.applyMove(s, 0, { from: 0, to: 'off', die: 2 }, scripted([])));
  };
  it('detects single, gammon and backgammon', () => {
    expect(finish({ 20: 14 }, 0, 1)?.reason).toBe('single');
    expect(finish({ 10: 15 })?.reason).toBe('gammon');
    expect(finish({ 10: 14, 3: 1 })?.reason).toBe('backgammon');
    expect(finish({ 10: 14 }, 1)?.reason).toBe('backgammon');
    expect(finish({ 10: 15 })?.winners).toEqual([0]);
  });
  it('detects backgammon for seat 1', () => {
    const s = setup({ board: board({ 20: 15 }, { 23: 1 }), off: [0, 14], turn: 1, dice: [1, 4] });
    const r = E.result(E.applyMove(s, 1, { from: 23, to: 'off', die: 4 }, scripted([])));
    expect(r).toMatchObject({ winners: [1], reason: 'backgammon' });
  });
  it('forfeit makes the other seat win', () => {
    const s = E.create({}, Rng.fromSeeds(seed(5), ['f']));
    const f = E.forfeit(s, 1, 'timeout');
    expect(E.result(f)).toEqual({ winners: [0], draw: false, reason: 'timeout' });
    expect(E.toAct(f)).toEqual([]);
    expect(E.legalMoves(f, f.turn)).toEqual([]);
    expect(E.forfeit(f, 0, 'resign')).toBe(f);
  });
});

function playGame(seedHex: string, levels: [number, number], tag = 'g', maxSteps = 5000) {
  const rng = Rng.fromSeeds(seedHex, ['game', tag]);
  const botRng = Rng.fromSeeds(seedHex, ['bot', tag]);
  let s = E.create({}, rng);
  let steps = 0;
  while (!E.result(s)) {
    const seat = s.turn;
    const plan = backgammonBot({ state: s, seat, level: levels[seat]!, rng: botRng });
    expect(plan.length).toBeGreaterThan(0);
    for (const m of plan) {
      expect(s.turn).toBe(seat);
      s = E.applyMove(s, seat, m, rng);
      steps++;
      if (E.result(s)) break;
    }
    if (count(s, 0) !== 15 || count(s, 1) !== 15) throw new Error('checker count broken');
    if (steps > maxSteps) throw new Error('game did not terminate');
  }
  return s;
}

describe('backgammon determinism and fuzz', () => {
  it('same seed and moves give the same state', () => {
    const a = playGame(seed(7), [10, 4]);
    const b = playGame(seed(7), [10, 4]);
    expect(a).toEqual(b);
  });

  it('bot plan uses all dice that can be used', () => {
    const rng = Rng.fromSeeds(seed(8), ['plan']);
    const s = E.create({}, rng);
    const plan = backgammonBot({ state: s, seat: s.turn, level: 10, rng });
    expect(plan).toHaveLength(2);
  });

  it('300 bot games terminate with valid results', () => {
    const reasons: Record<string, number> = {};
    for (let g = 0; g < 300; g++) {
      const levels: [number, number] = [g % 11, (g * 7 + 3) % 11];
      const s = playGame(seed(g % 256), levels, String(g));
      const r = E.result(s)!;
      expect(r.winners).toHaveLength(1);
      expect(['single', 'gammon', 'backgammon']).toContain(r.reason);
      expect(s.off[r.winners[0] as 0 | 1]).toBe(15);
      reasons[r.reason] = (reasons[r.reason] ?? 0) + 1;
    }
    expect(reasons.single).toBeGreaterThan(0);
  }, 60_000);
});
