import type { Rng } from './rng';
import { IllegalMoveError, type GameEngine, type GameResult, type Seat } from './types';

/**
 * Sea Battle rules engine (the classic hidden fleet naval guessing game).
 *
 * Rules used on Evens:
 * - Each player has a 10 by 10 grid. Columns are A to J, rows are 1 to 10. Internally `row` and
 *   `col` are 0 based: row 0 is "1", col 0 is "A". Cell index = row * 10 + col.
 * - Fleet: Carrier 5, Warship 4, Destroyer 3, Submarine 3, Patrol boat 2 (17 squares).
 * - Ships lie horizontally ('h', growing to the right) or vertically ('v', growing down) from
 *   their (row, col) anchor. Ships may not overlap and may not touch each other, not even
 *   diagonally at the corners. This house rule is common and makes play fairer: a sunk ship
 *   tells you its whole surrounding ring is empty.
 * - Phase `placing`: both players place their fleet secretly at the same time. `toAct` returns
 *   every seat that has not confirmed yet. `place` sends the full fleet at once; `auto_place`
 *   asks the engine to place a fair random fleet with the Rng and confirms it straight away.
 * - Phase `firing`: seat 0 always fires first. Players alternate one shot per turn. A hit does
 *   NOT give an extra shot, so turns are predictable and the game length is fair for both.
 * - A shot result is announced as miss, hit or sunk. A plain hit does not say which ship was
 *   struck. When every square of a ship is hit it is sunk, its name and position are revealed
 *   to the shooter, and every still empty square around it is automatically marked as a miss
 *   for the shooter (ships cannot touch, so nothing can be there).
 * - The first player to sink the whole enemy fleet wins. At game over both fleets are revealed.
 *
 * Note: `id` is cast because the shared GameId union in types.ts does not list 'seabattle' yet.
 */

export type SbShipId = 'carrier' | 'warship' | 'destroyer' | 'submarine' | 'patrol';
export type SbDir = 'h' | 'v';

export interface SbShip {
  id: SbShipId;
  /** 0..9, top row is 0 ("1"). */
  row: number;
  /** 0..9, left column is 0 ("A"). */
  col: number;
  dir: SbDir;
}

export const SB_SIZE = 10;

export const SB_FLEET: readonly { id: SbShipId; name: string; size: number }[] = [
  { id: 'carrier', name: 'Carrier', size: 5 },
  { id: 'warship', name: 'Warship', size: 4 },
  { id: 'destroyer', name: 'Destroyer', size: 3 },
  { id: 'submarine', name: 'Submarine', size: 3 },
  { id: 'patrol', name: 'Patrol boat', size: 2 },
];

const SHIP_BY_ID: Record<SbShipId, { id: SbShipId; name: string; size: number }> = Object.fromEntries(
  SB_FLEET.map((s) => [s.id, s]),
) as Record<SbShipId, { id: SbShipId; name: string; size: number }>;

export const sbShipName = (id: SbShipId): string => SHIP_BY_ID[id].name;
export const sbShipSize = (id: SbShipId): number => SHIP_BY_ID[id].size;

/**
 * Mark on a cell of a board, from the point of view of whoever is shooting at it.
 * 'auto' = empty square marked automatically because it touches a sunk ship.
 * 'sunk' = a hit square that belongs to a sunk ship.
 */
export type SbMark = 'empty' | 'miss' | 'hit' | 'sunk' | 'auto';
export type SbShotResult = 'miss' | 'hit' | 'sunk';

export type SbMove =
  | { type: 'place'; ships: SbShip[] }
  | { type: 'auto_place' }
  | { type: 'fire'; row: number; col: number };

export interface SbConfig {
  /** Optional fleets that skip the placing phase (tests, tutorials). Both must be valid. */
  setup?: { fleets: [SbShip[], SbShip[]] };
}

export interface SbShotRecord {
  /** The seat that fired. */
  seat: Seat;
  row: number;
  col: number;
  result: SbShotResult;
  /** The ship struck. Kept in state; views only show it to the target's owner or on a sink. */
  ship?: SbShipId;
}

export interface SbState {
  phase: 'placing' | 'firing';
  /** fleets[s] = seat s's own ships, null until placed. */
  fleets: [SbShip[] | null, SbShip[] | null];
  /** ready[s] = seat s confirmed its fleet. */
  ready: [boolean, boolean];
  /** marks[s] = 100 marks on seat s's board (shots received from the other seat). */
  marks: [SbMark[], SbMark[]];
  /** sunk[s] = ids of seat s's ships that have been sunk, in order. */
  sunk: [SbShipId[], SbShipId[]];
  /** Seat whose turn it is to fire (meaningful in the firing phase). */
  turn: Seat;
  /** Every shot in order. */
  shots: SbShotRecord[];
  winner?: Seat;
  forfeit?: { seat: Seat; reason: 'resign' | 'timeout' | 'abandon' };
}

export interface SbLastShot {
  seat: Seat;
  row: number;
  col: number;
  result: SbShotResult;
  /** Ship id and name: always on 'sunk', on 'hit' only when the viewer owns the target board. */
  ship?: SbShipId;
  shipName?: string;
}

export interface SbBoardView {
  /** Owner of this board. */
  seat: Seat;
  /** 100 marks of the shots this board has received. */
  marks: SbMark[];
  /** Ships the viewer may see on this board: all of them for the owner, sunk ones otherwise (all at game over). */
  ships: SbShip[];
  /** Ship ids still afloat (types only, not where). */
  afloat: SbShipId[];
  /** Ship ids sunk, in order. */
  sunk: SbShipId[];
  /** Shots fired AT this board. */
  shotsTaken: number;
  /** Hits taken by this board. */
  hitsTaken: number;
}

export interface SbView {
  phase: 'placing' | 'firing';
  /** The viewer, -1 for spectators. */
  viewer: Seat;
  /** boards[s] = seat s's board as the viewer may see it. */
  boards: [SbBoardView, SbBoardView];
  /** ready[s] = seat s confirmed its fleet (placed flags). */
  ready: [boolean, boolean];
  /** Seat to fire, or null while placing or after the result. */
  turn: Seat | null;
  /** Total shots fired so far (increases by exactly one per fire move). */
  shotNo: number;
  lastShot: SbLastShot | null;
  result: GameResult | null;
}

/* ------------------------------------------------------------------------------------------ */
/* Geometry and validation                                                                     */
/* ------------------------------------------------------------------------------------------ */

const N = SB_SIZE;
const idx = (r: number, c: number) => r * N + c;
const inBounds = (r: number, c: number) => r >= 0 && r < N && c >= 0 && c < N;

/** Cells covered by a ship, as indices. May include out of bounds coordinates for unchecked ships. */
export function shipCells(ship: SbShip): { row: number; col: number }[] {
  const size = sbShipSize(ship.id);
  const out: { row: number; col: number }[] = [];
  for (let k = 0; k < size; k++) {
    out.push(ship.dir === 'h' ? { row: ship.row, col: ship.col + k } : { row: ship.row + k, col: ship.col });
  }
  return out;
}

/** In bounds cells touching a ship (8 neighbours), excluding the ship itself. */
export function shipRing(ship: SbShip): { row: number; col: number }[] {
  const cells = shipCells(ship);
  const own = new Set(cells.map((p) => idx(p.row, p.col)));
  const seen = new Set<number>();
  const out: { row: number; col: number }[] = [];
  for (const p of cells) {
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const r = p.row + dr;
        const c = p.col + dc;
        if (!inBounds(r, c)) continue;
        const i = idx(r, c);
        if (own.has(i) || seen.has(i)) continue;
        seen.add(i);
        out.push({ row: r, col: c });
      }
    }
  }
  return out;
}

const isInt09 = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n < N;

/** Checks a single ship's shape and bounds. Returns a reason or null. */
function checkShip(s: unknown): string | null {
  if (!s || typeof s !== 'object') return 'Place every ship of the fleet exactly once.';
  const ship = s as Partial<SbShip>;
  if (typeof ship.id !== 'string' || !(ship.id in SHIP_BY_ID)) return 'Place every ship of the fleet exactly once.';
  if (ship.dir !== 'h' && ship.dir !== 'v') return 'Each ship must lie across or down.';
  if (!isInt09(ship.row) || !isInt09(ship.col)) return 'Every ship must sit fully inside the grid.';
  for (const p of shipCells(ship as SbShip)) {
    if (!inBounds(p.row, p.col)) return `Your ${sbShipName(ship.id as SbShipId)} goes off the grid.`;
  }
  return null;
}

/**
 * Validates a full fleet: exactly one of each ship, inside the grid, no overlaps and no
 * touching (not even at the corners). Returns a plain English reason, or null when valid.
 */
export function validateFleet(ships: unknown): string | null {
  if (!Array.isArray(ships)) return 'Place every ship of the fleet exactly once.';
  for (const s of ships) {
    const r = checkShip(s);
    if (r) return r;
  }
  const list = ships as SbShip[];
  const ids = list.map((s) => s.id);
  if (list.length !== SB_FLEET.length || SB_FLEET.some((f) => ids.filter((i) => i === f.id).length !== 1)) {
    return 'Place every ship of the fleet exactly once.';
  }
  const owner = new Array<number>(N * N).fill(-1);
  for (let k = 0; k < list.length; k++) {
    for (const p of shipCells(list[k]!)) {
      if (owner[idx(p.row, p.col)] !== -1) return 'Ships cannot overlap.';
      owner[idx(p.row, p.col)] = k;
    }
  }
  for (let k = 0; k < list.length; k++) {
    for (const p of shipRing(list[k]!)) {
      const o = owner[idx(p.row, p.col)]!;
      if (o !== -1 && o !== k) return 'Ships cannot touch, not even at the corners.';
    }
  }
  return null;
}

/**
 * Places a fair random valid fleet using only the Rng. Ships go largest first; each ship picks
 * uniformly among every position that is still legal. If a ship has no room (very rare), the
 * whole fleet is drawn again from the same stream, so the result stays deterministic.
 */
export function randomFleet(rng: Rng): SbShip[] {
  for (;;) {
    const blocked = new Array<boolean>(N * N).fill(false);
    const out: SbShip[] = [];
    let ok = true;
    for (const f of SB_FLEET) {
      const options: SbShip[] = [];
      for (const dir of ['h', 'v'] as const) {
        for (let r = 0; r < N; r++) {
          for (let c = 0; c < N; c++) {
            const ship: SbShip = { id: f.id, row: r, col: c, dir };
            const cells = shipCells(ship);
            if (cells.every((p) => inBounds(p.row, p.col) && !blocked[idx(p.row, p.col)])) options.push(ship);
          }
        }
      }
      if (options.length === 0) {
        ok = false;
        break;
      }
      const pick = options[rng.int(options.length)]!;
      out.push(pick);
      // Block the ship and its ring so later ships neither overlap nor touch it.
      for (const p of [...shipCells(pick), ...shipRing(pick)]) blocked[idx(p.row, p.col)] = true;
    }
    if (ok) return out;
  }
}

/* ------------------------------------------------------------------------------------------ */
/* Engine                                                                                      */
/* ------------------------------------------------------------------------------------------ */

const emptyMarks = (): SbMark[] => new Array<SbMark>(N * N).fill('empty');
const cloneFleet = (f: SbShip[]): SbShip[] => f.map((s) => ({ id: s.id, row: s.row, col: s.col, dir: s.dir }));

function shipAt(fleet: SbShip[], r: number, c: number): SbShip | undefined {
  return fleet.find((s) => shipCells(s).some((p) => p.row === r && p.col === c));
}

function withFleet(state: SbState, seat: Seat, fleet: SbShip[]): SbState {
  const fleets: SbState['fleets'] = [state.fleets[0], state.fleets[1]];
  const ready: SbState['ready'] = [state.ready[0], state.ready[1]];
  fleets[seat] = cloneFleet(fleet);
  ready[seat] = true;
  const both = ready[0] && ready[1];
  return { ...state, fleets, ready, phase: both ? 'firing' : 'placing', turn: 0 };
}

const isMove = (m: unknown): m is SbMove => !!m && typeof m === 'object' && typeof (m as { type?: unknown }).type === 'string';

export const seaBattleEngine: GameEngine<SbState, SbMove, SbView, SbConfig> = {
  // Cast until the shared GameId union in types.ts is widened to include 'seabattle'.
  id: 'seabattle',
  seats: 2,
  teams: [0, 1],

  create(config) {
    const base: SbState = {
      phase: 'placing',
      fleets: [null, null],
      ready: [false, false],
      marks: [emptyMarks(), emptyMarks()],
      sunk: [[], []],
      turn: 0,
      shots: [],
    };
    if (config?.setup) {
      const [a, b] = config.setup.fleets;
      const ra = validateFleet(a);
      const rb = validateFleet(b);
      if (ra || rb) throw new Error(`bad setup fleet: ${ra ?? rb}`);
      return { ...base, phase: 'firing', fleets: [cloneFleet(a), cloneFleet(b)], ready: [true, true] };
    }
    return base;
  },

  toAct(state) {
    if (seaBattleEngine.result(state)) return [];
    if (state.phase === 'placing') return [0, 1].filter((s) => !state.ready[s as 0 | 1]);
    return [state.turn];
  },

  legalMoves(state, seat) {
    if (seaBattleEngine.result(state) || (seat !== 0 && seat !== 1)) return [];
    if (state.phase === 'placing') return state.ready[seat] ? [] : [{ type: 'auto_place' }];
    if (seat !== state.turn) return [];
    const marks = state.marks[1 - seat]!;
    const out: SbMove[] = [];
    for (let i = 0; i < N * N; i++) if (marks[i] === 'empty') out.push({ type: 'fire', row: Math.floor(i / N), col: i % N });
    return out;
  },

  applyMove(state, seat, move, rng) {
    if (seaBattleEngine.result(state)) throw new IllegalMoveError('game over', 'This game has already finished.');
    if (seat !== 0 && seat !== 1) throw new IllegalMoveError('bad seat', 'Only the two captains can play.');
    if (!isMove(move)) throw new IllegalMoveError('bad move', 'That move was not understood. Try again.');

    if (move.type === 'place' || move.type === 'auto_place') {
      if (state.phase !== 'placing') throw new IllegalMoveError('not placing', 'The battle has started, ships cannot move now.');
      if (state.ready[seat]) throw new IllegalMoveError('already ready', 'Your fleet is already in position.');
      if (move.type === 'auto_place') return withFleet(state, seat, randomFleet(rng));
      const reason = validateFleet(move.ships);
      if (reason) throw new IllegalMoveError('bad fleet', reason);
      return withFleet(state, seat, move.ships);
    }

    if (move.type !== 'fire') throw new IllegalMoveError('bad move', 'That move was not understood. Try again.');
    if (state.phase !== 'firing') throw new IllegalMoveError('placing', 'Wait until both fleets are in position.');
    if (seat !== state.turn) throw new IllegalMoveError('not your turn', 'Wait for your turn.');
    const { row, col } = move;
    if (!isInt09(row) || !isInt09(col)) throw new IllegalMoveError('off grid', 'Pick a square inside enemy waters.');

    const target = 1 - seat;
    const cur = state.marks[target]![idx(row, col)]!;
    if (cur === 'auto') throw new IllegalMoveError('auto', 'That square touches a sunk ship, so it must be empty. Pick another.');
    if (cur !== 'empty') throw new IllegalMoveError('repeat', 'You already fired at that square.');

    const fleet = state.fleets[target]!;
    const marks = state.marks[target]!.slice();
    const sunkT = state.sunk[target]!.slice();
    const ship = shipAt(fleet, row, col);
    let result: SbShotResult = 'miss';
    if (!ship) {
      marks[idx(row, col)] = 'miss';
    } else {
      marks[idx(row, col)] = 'hit';
      const cells = shipCells(ship);
      if (cells.every((p) => marks[idx(p.row, p.col)] === 'hit')) {
        result = 'sunk';
        for (const p of cells) marks[idx(p.row, p.col)] = 'sunk';
        for (const p of shipRing(ship)) if (marks[idx(p.row, p.col)] === 'empty') marks[idx(p.row, p.col)] = 'auto';
        sunkT.push(ship.id);
      } else {
        result = 'hit';
      }
    }

    const allMarks: SbState['marks'] = target === 0 ? [marks, state.marks[1]] : [state.marks[0], marks];
    const sunk: SbState['sunk'] = target === 0 ? [sunkT, state.sunk[1]] : [state.sunk[0], sunkT];
    const rec: SbShotRecord = { seat, row, col, result, ...(ship ? { ship: ship.id } : {}) };
    const next: SbState = { ...state, marks: allMarks, sunk, shots: [...state.shots, rec], turn: target };
    if (sunkT.length === SB_FLEET.length) next.winner = seat;
    return next;
  },

  forfeit(state, seat, reason) {
    if (seaBattleEngine.result(state)) return state;
    return { ...state, forfeit: { seat, reason } };
  },

  result(state) {
    const score = { '0': state.sunk[1].length, '1': state.sunk[0].length };
    if (state.forfeit) return { winners: [1 - state.forfeit.seat], draw: false, reason: state.forfeit.reason, score };
    if (state.winner !== undefined) return { winners: [state.winner], draw: false, reason: 'fleet_sunk', score };
    return null;
  },

  publicView(state, seat) {
    const result = seaBattleEngine.result(state);
    const board = (owner: 0 | 1): SbBoardView => {
      const fleet = state.fleets[owner] ?? [];
      const sunkIds = state.sunk[owner];
      const showAll = owner === seat || (result !== null && state.phase === 'firing');
      const marks = state.marks[owner];
      return {
        seat: owner,
        marks: marks.slice(),
        ships: cloneFleet(showAll ? fleet : fleet.filter((s) => sunkIds.includes(s.id))),
        afloat: SB_FLEET.map((f) => f.id).filter((id) => !sunkIds.includes(id)),
        sunk: sunkIds.slice(),
        shotsTaken: state.shots.filter((s) => s.seat !== owner).length,
        hitsTaken: marks.filter((m) => m === 'hit' || m === 'sunk').length,
      };
    };
    const last = state.shots[state.shots.length - 1];
    let lastShot: SbLastShot | null = null;
    if (last) {
      const targetOwner = 1 - last.seat;
      const reveal = last.result === 'sunk' || (last.result === 'hit' && (seat === targetOwner || result !== null));
      lastShot = { seat: last.seat, row: last.row, col: last.col, result: last.result };
      if (reveal && last.ship) {
        lastShot.ship = last.ship;
        lastShot.shipName = sbShipName(last.ship);
      }
    }
    return {
      phase: state.phase,
      viewer: seat === 0 || seat === 1 ? seat : -1,
      boards: [board(0), board(1)],
      ready: [state.ready[0], state.ready[1]],
      turn: result || state.phase !== 'firing' ? null : state.turn,
      shotNo: state.shots.length,
      lastShot,
      result,
    };
  },
};
