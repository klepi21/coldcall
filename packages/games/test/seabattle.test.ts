import { describe, it, expect } from 'vitest';
import { Rng } from '../src/rng';
import { IllegalMoveError } from '../src/types';
import {
  seaBattleEngine as E,
  SB_FLEET,
  randomFleet,
  shipCells,
  validateFleet,
  type SbMove,
  type SbShip,
  type SbState,
} from '../src/seabattle';
import { seaBattleBot } from '../src/seabattle-bot';

const seed = (n: number) => (n % 256).toString(16).padStart(2, '0').repeat(32);
const rngOf = (n: number, tag = 't') => Rng.fromSeeds(seed(n), [tag, String(n)]);

/** A valid fleet laid out on alternate rows (row 0, 2, 4, 6, 8), all horizontal from column A. */
const FLEET_A: SbShip[] = [
  { id: 'carrier', row: 0, col: 0, dir: 'h' },
  { id: 'warship', row: 2, col: 0, dir: 'h' },
  { id: 'destroyer', row: 4, col: 0, dir: 'h' },
  { id: 'submarine', row: 6, col: 0, dir: 'h' },
  { id: 'patrol', row: 8, col: 0, dir: 'h' },
];
/** A valid fleet standing vertically in columns J, H, F, D, B. */
const FLEET_B: SbShip[] = [
  { id: 'carrier', row: 0, col: 9, dir: 'v' },
  { id: 'warship', row: 0, col: 7, dir: 'v' },
  { id: 'destroyer', row: 0, col: 5, dir: 'v' },
  { id: 'submarine', row: 0, col: 3, dir: 'v' },
  { id: 'patrol', row: 0, col: 1, dir: 'v' },
];

const fresh = (): SbState => E.create({ setup: { fleets: [FLEET_A, FLEET_B] } }, rngOf(1));
const fire = (s: SbState, seat: number, row: number, col: number) => E.applyMove(s, seat, { type: 'fire', row, col }, rngOf(2));

function explainOf(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    if (e instanceof IllegalMoveError) return e.explain;
    throw e;
  }
  throw new Error('expected IllegalMoveError');
}

const replace = (fleet: SbShip[], ship: SbShip) => fleet.map((s) => (s.id === ship.id ? ship : s));

describe('fleet validation', () => {
  it('accepts valid fleets', () => {
    expect(validateFleet(FLEET_A)).toBeNull();
    expect(validateFleet(FLEET_B)).toBeNull();
  });
  it('rejects overlap', () => {
    expect(validateFleet(replace(FLEET_A, { id: 'patrol', row: 0, col: 3, dir: 'v' }))).toBe('Ships cannot overlap.');
  });
  it('rejects touching side by side and at the corners', () => {
    expect(validateFleet(replace(FLEET_A, { id: 'warship', row: 1, col: 0, dir: 'h' }))).toMatch(/touch/);
    // Patrol diagonal to the carrier's last square (row 0, col 4).
    expect(validateFleet(replace(FLEET_A, { id: 'patrol', row: 1, col: 5, dir: 'h' }))).toBe(
      'Ships cannot touch, not even at the corners.',
    );
    // End to end in the same row.
    expect(validateFleet(replace(FLEET_A, { id: 'patrol', row: 0, col: 5, dir: 'h' }))).toMatch(/touch/);
  });
  it('rejects out of bounds', () => {
    expect(validateFleet(replace(FLEET_A, { id: 'carrier', row: 0, col: 6, dir: 'h' }))).toMatch(/off the grid/);
    expect(validateFleet(replace(FLEET_A, { id: 'carrier', row: 6, col: 9, dir: 'v' }))).toMatch(/off the grid/);
    expect(validateFleet(replace(FLEET_A, { id: 'patrol', row: -1, col: 0, dir: 'h' }))).toMatch(/inside the grid/);
    expect(validateFleet(replace(FLEET_A, { id: 'patrol', row: 1.5, col: 0, dir: 'h' }))).toMatch(/inside the grid/);
  });
  it('rejects a wrong set of ships', () => {
    expect(validateFleet(FLEET_A.slice(0, 4))).toMatch(/exactly once/);
    expect(validateFleet([...FLEET_A.slice(0, 4), { id: 'carrier', row: 9, col: 5, dir: 'h' }])).toMatch(/exactly once/);
    expect(validateFleet([...FLEET_A, { id: 'patrol', row: 9, col: 8, dir: 'h' }])).toMatch(/exactly once/);
    expect(validateFleet([...FLEET_A.slice(0, 4), { id: 'cruiser', row: 8, col: 0, dir: 'h' }])).toMatch(/exactly once/);
    expect(validateFleet(replace(FLEET_A, { id: 'patrol', row: 8, col: 0, dir: 'x' as 'h' }))).toMatch(/across or down/);
    expect(validateFleet('nope')).toMatch(/exactly once/);
    expect(validateFleet(null)).toMatch(/exactly once/);
  });
  it('place move rejects a bad fleet with a friendly reason', () => {
    const s = E.create({}, rngOf(3));
    const bad = replace(FLEET_A, { id: 'patrol', row: 1, col: 5, dir: 'h' });
    expect(explainOf(() => E.applyMove(s, 0, { type: 'place', ships: bad }, rngOf(3)))).toBe(
      'Ships cannot touch, not even at the corners.',
    );
  });
  it('fleet sizes and names', () => {
    expect(SB_FLEET.map((f) => [f.name, f.size])).toEqual([
      ['Carrier', 5],
      ['Warship', 4],
      ['Destroyer', 3],
      ['Submarine', 3],
      ['Patrol boat', 2],
    ]);
  });
});

describe('auto placement', () => {
  it('is always valid over 500 seeds', () => {
    for (let n = 0; n < 500; n++) {
      const f = randomFleet(Rng.fromSeeds(seed(n), ['auto', String(n)]));
      expect(validateFleet(f)).toBeNull();
    }
  });
  it('is deterministic for a seed and varies across seeds', () => {
    expect(randomFleet(rngOf(7))).toEqual(randomFleet(rngOf(7)));
    expect(randomFleet(rngOf(7))).not.toEqual(randomFleet(rngOf(8)));
  });
});

describe('placing phase', () => {
  it('both seats act at once and the battle starts when both are ready, seat 0 first', () => {
    let s = E.create({}, rngOf(4));
    expect(s.phase).toBe('placing');
    expect(E.toAct(s)).toEqual([0, 1]);
    expect(E.legalMoves(s, 1)).toEqual([{ type: 'auto_place' }]);
    expect(explainOf(() => E.applyMove(s, 0, { type: 'fire', row: 0, col: 0 }, rngOf(4)))).toMatch(/both fleets/);
    s = E.applyMove(s, 1, { type: 'auto_place' }, rngOf(4));
    expect(E.toAct(s)).toEqual([0]);
    expect(E.legalMoves(s, 1)).toEqual([]);
    expect(explainOf(() => E.applyMove(s, 1, { type: 'place', ships: FLEET_A }, rngOf(4)))).toMatch(/already/);
    s = E.applyMove(s, 0, { type: 'place', ships: FLEET_A }, rngOf(4));
    expect(s.phase).toBe('firing');
    expect(E.toAct(s)).toEqual([0]);
    expect(explainOf(() => E.applyMove(s, 0, { type: 'auto_place' }, rngOf(4)))).toMatch(/started/);
  });
  it('spectators and the opponent see no ships while placing', () => {
    let s = E.create({}, rngOf(5));
    s = E.applyMove(s, 0, { type: 'place', ships: FLEET_A }, rngOf(5));
    expect(E.publicView(s, 0).boards[0].ships).toHaveLength(5);
    expect(E.publicView(s, 1).boards[0].ships).toHaveLength(0);
    expect(E.publicView(s, -1).boards[0].ships).toHaveLength(0);
    expect(E.publicView(s, 1).ready).toEqual([true, false]);
  });
});

describe('firing', () => {
  it('miss, hit and sunk with turn alternation and no extra shot on a hit', () => {
    let s = fresh();
    expect(explainOf(() => fire(s, 1, 0, 0))).toBe('Wait for your turn.');
    s = fire(s, 0, 9, 0); // seat 1 board: column A is empty
    expect(s.marks[1][90]).toBe('miss');
    expect(s.turn).toBe(1);
    expect(E.publicView(s, 0).lastShot).toMatchObject({ seat: 0, row: 9, col: 0, result: 'miss' });
    s = fire(s, 1, 0, 0); // seat 0 carrier at A1
    expect(s.marks[0][0]).toBe('hit');
    expect(s.turn).toBe(0); // a hit does not keep the turn
    // Patrol boat of seat 1 is at B1, B2.
    s = fire(s, 0, 0, 1);
    expect(E.publicView(s, 0).lastShot).toMatchObject({ result: 'hit' });
    expect(E.publicView(s, 0).lastShot?.shipName).toBeUndefined(); // hits stay anonymous to the shooter
    expect(E.publicView(s, 1).lastShot?.shipName).toBe('Patrol boat'); // the owner knows
    s = fire(s, 1, 9, 9);
    s = fire(s, 0, 1, 1);
    const v = E.publicView(s, 0);
    expect(v.lastShot).toMatchObject({ result: 'sunk', ship: 'patrol', shipName: 'Patrol boat' });
    expect(v.boards[1].sunk).toEqual(['patrol']);
    expect(v.boards[1].afloat).not.toContain('patrol');
    expect(v.boards[1].ships).toEqual([{ id: 'patrol', row: 0, col: 1, dir: 'v' }]);
    expect(s.marks[1][1]).toBe('sunk');
    expect(s.marks[1][11]).toBe('sunk');
  });

  it('auto marks the ring around a sunk ship without overwriting earlier shots', () => {
    let s = fresh();
    s = fire(s, 0, 2, 0); // A3 under the patrol boat: miss (already in the ring)
    s = fire(s, 1, 9, 9);
    s = fire(s, 0, 0, 1);
    s = fire(s, 1, 9, 8);
    s = fire(s, 0, 1, 1);
    const m = s.marks[1];
    // Ring of B1..B2: A1, A2, A3, B3, C1, C2, C3 (row 0..2, col 0..2 minus ship).
    expect(m[20]).toBe('miss');
    for (const i of [0, 10, 21, 22, 2, 12]) expect(m[i]).toBe('auto');
    expect(m[3]).toBe('empty'); // D1 is the submarine, untouched
    // Auto marked squares are not legal and have their own reason.
    s = fire(s, 1, 9, 7);
    expect(E.legalMoves(s, 0).some((mv) => mv.type === 'fire' && mv.row === 0 && mv.col === 0)).toBe(false);
    expect(explainOf(() => fire(s, 0, 0, 0))).toMatch(/touches a sunk ship/);
  });

  it('no repeat shots', () => {
    let s = fresh();
    s = fire(s, 0, 5, 5);
    s = fire(s, 1, 5, 5);
    expect(explainOf(() => fire(s, 0, 5, 5))).toBe('You already fired at that square.');
    expect(E.legalMoves(s, 0)).toHaveLength(99);
    expect(explainOf(() => fire(s, 0, 10, 0))).toMatch(/inside/);
  });

  it('win detection and game over behaviour', () => {
    let s = fresh();
    const targets = FLEET_B.flatMap(shipCells);
    const misses = Array.from({ length: 100 }, (_, i) => ({ row: Math.floor(i / 10), col: i % 10 })).filter(
      (p) => !FLEET_A.flatMap(shipCells).some((q) => q.row === p.row && q.col === p.col),
    );
    let mi = 0;
    for (let k = 0; k < targets.length; k++) {
      const t = targets[k]!;
      if (s.marks[1][t.row * 10 + t.col] !== 'empty') continue;
      s = fire(s, 0, t.row, t.col);
      if (E.result(s)) break;
      const m = misses[mi++]!;
      s = fire(s, 1, m.row, m.col);
    }
    const r = E.result(s);
    expect(r).toMatchObject({ winners: [0], draw: false, reason: 'fleet_sunk' });
    expect(r?.score).toEqual({ '0': 5, '1': 0 });
    expect(E.toAct(s)).toEqual([]);
    expect(E.legalMoves(s, 1)).toEqual([]);
    expect(explainOf(() => fire(s, 1, 0, 0))).toMatch(/finished/);
    // At game over both fleets are revealed.
    expect(E.publicView(s, 0).boards[1].ships).toHaveLength(5);
    expect(E.publicView(s, 1).boards[0].ships).toHaveLength(5);
    expect(E.publicView(s, 0).turn).toBeNull();
  });

  it('forfeit gives the win to the other seat, in any phase', () => {
    const s = E.forfeit(fresh(), 0, 'resign');
    expect(E.result(s)).toMatchObject({ winners: [1], reason: 'resign' });
    expect(E.forfeit(s, 1, 'timeout')).toBe(s);
    const p = E.forfeit(E.create({}, rngOf(1)), 1, 'abandon');
    expect(E.result(p)).toMatchObject({ winners: [0], reason: 'abandon' });
  });
});

describe('views', () => {
  it('hide unsunk enemy ships during firing', () => {
    let s = fresh();
    s = fire(s, 0, 0, 9); // hit carrier of seat 1
    s = fire(s, 1, 0, 0);
    const v0 = E.publicView(s, 0);
    expect(v0.viewer).toBe(0);
    expect(v0.boards[0].ships).toHaveLength(5);
    expect(v0.boards[1].ships).toHaveLength(0);
    expect(v0.boards[1].marks[9]).toBe('hit');
    expect(v0.boards[1].afloat).toHaveLength(5);
    const spec = E.publicView(s, -1);
    expect(spec.viewer).toBe(-1);
    expect(spec.boards[0].ships).toHaveLength(0);
    expect(spec.boards[1].ships).toHaveLength(0);
    expect(spec.boards[0].marks[0]).toBe('hit');
    expect(spec.boards[1].marks[9]).toBe('hit');
    expect(spec.lastShot?.shipName).toBeUndefined();
    expect(JSON.stringify(v0.boards[1])).not.toMatch(/"row"/);
    expect(v0.turn).toBe(0);
    expect(v0.shotNo).toBe(2);
  });
  it('is JSON serialisable and the engine does not mutate input', () => {
    const s = fresh();
    const before = JSON.stringify(s);
    fire(s, 0, 3, 3);
    expect(JSON.stringify(s)).toBe(before);
    expect(JSON.parse(JSON.stringify(E.publicView(s, 0)))).toEqual(E.publicView(s, 0));
  });
});

function playBots(levels: [number, number], n: number): { state: SbState; moves: [number, SbMove][] } {
  const rng = Rng.fromSeeds(seed(n), ['fuzz', String(n)]);
  let s = E.create({}, rng);
  const moves: [number, SbMove][] = [];
  for (let guard = 0; guard < 400 && !E.result(s); guard++) {
    for (const seat of E.toAct(s)) {
      const m = seaBattleBot({ state: s, seat, level: levels[seat]!, rng });
      const legal = E.legalMoves(s, seat);
      expect(legal.some((l) => JSON.stringify(l) === JSON.stringify(m))).toBe(true);
      s = E.applyMove(s, seat, m, rng);
      moves.push([seat, m]);
      if (E.result(s)) break;
    }
  }
  return { state: s, moves };
}

describe('determinism', () => {
  it('the same seed gives the same game, and replaying the shot log rebuilds the same state', () => {
    const { state, moves } = playBots([7, 3], 42);
    expect(playBots([7, 3], 42).state).toEqual(state);
    expect(playBots([7, 3], 43).state).not.toEqual(state);
    let s = E.create({ setup: { fleets: [state.fleets[0]!, state.fleets[1]!] } }, rngOf(0));
    for (const [seat, m] of moves) if (m.type === 'fire') s = E.applyMove(s, seat, m, rngOf(0));
    expect(s.marks).toEqual(state.marks);
    expect(s.shots).toEqual(state.shots);
    expect(E.result(s)).toEqual(E.result(state));
  });
});

describe('bots', () => {
  it('300 bot games at mixed levels end with valid results', () => {
    for (let n = 0; n < 300; n++) {
      const levels: [number, number] = [n % 11, (n * 7 + 3) % 11];
      const { state } = playBots(levels, n + 1000);
      const r = E.result(state);
      expect(r).not.toBeNull();
      expect(r!.reason).toBe('fleet_sunk');
      const w = r!.winners[0]!;
      expect(state.sunk[1 - w]).toHaveLength(5);
      expect(state.sunk[w]!.length).toBeLessThan(5);
      expect(state.shots.length).toBeLessThanOrEqual(200);
    }
  }, 120_000);

  it('level 10 sinks a fleet in fewer shots than level 0 (printed)', () => {
    const avg = (level: number) => {
      let total = 0;
      const games = 60;
      for (let n = 0; n < games; n++) {
        const rng = Rng.fromSeeds(seed(n + 7), ['avg', String(level), String(n)]);
        let s = E.create({ setup: { fleets: [randomFleet(rng), randomFleet(rng)] } }, rng);
        let shots = 0;
        // Seat 0 fires every turn; seat 1 fires at its own empty corner logic, we just pass with misses.
        while (!E.result(s)) {
          s = E.applyMove(s, 0, seaBattleBot({ state: s, seat: 0, level, rng }), rng);
          shots++;
          if (E.result(s)) break;
          const any = E.legalMoves(s, 1);
          s = E.applyMove(s, 1, any[rng.int(any.length)]!, rng);
          if (E.result(s)) break;
        }
        if (E.result(s)!.winners[0] === 0) total += shots;
        else total += 100; // lost before finishing; count as the worst case
      }
      return total / games;
    };
    const a10 = avg(10);
    const a0 = avg(0);
    console.log(`Ice Floe Battle average shots to sink a fleet: level 10 = ${a10.toFixed(1)}, level 0 = ${a0.toFixed(1)}`);
    expect(a10).toBeGreaterThan(17);
  }, 120_000);
});
