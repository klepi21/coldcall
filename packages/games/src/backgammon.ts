import type { Rng } from './rng';
import { IllegalMoveError, type GameEngine, type GameResult, type Seat } from './types';

/**
 * Backgammon rules engine.
 *
 * Board model: one absolute array of 24 points seen from seat 0. `board[i] > 0` means seat 0 has
 * that many checkers on point i, `board[i] < 0` means seat 1 has |board[i]| checkers there.
 * Seat 0 moves from index 23 toward 0, its home board is 0..5 and it bears off below 0.
 * Seat 1 moves from index 0 toward 23, its home board is 18..23 and it bears off above 23.
 * Seat 0 enters from the bar on index 24 - die, seat 1 on index die - 1.
 *
 * Move model: a turn is a sequence of single checker steps. `legalMoves` returns the legal single
 * steps for the dice still unused, already filtered by the "use as many dice as possible" and
 * "play the higher die when only one can be played" rules. `applyMove` applies one step.
 * The turn ends automatically (and the opponent's dice are rolled from the Rng) as soon as no dice
 * remain or no legal step remains, so there is no confirm move. A player who cannot move at all
 * after rolling passes automatically and the turn goes back to the other side.
 * While a turn is in progress `{ type: 'undo' }` resets the position to the start of the turn.
 * Undo is not listed by `legalMoves` (it is always available while `steps` is not empty).
 */

export type BgSide = 0 | 1;
export interface BgStep {
  /** Absolute point index 0..23, or 'bar'. */
  from: number | 'bar';
  /** Absolute point index 0..23, or 'off'. */
  to: number | 'off';
  /** The die value used, 1..6. */
  die: number;
}
export interface BgUndo {
  type: 'undo';
}
export type BgMove = BgStep | BgUndo;

export interface BgPosition {
  /** 24 entries, positive = seat 0 checkers, negative = seat 1 checkers. */
  board: number[];
  bar: [number, number];
  off: [number, number];
}

export interface BgConfig {
  /** Optional custom start (tests, tutorials). Skips the opening roll and uses these dice. */
  setup?: {
    board: number[];
    bar?: [number, number];
    off?: [number, number];
    turn: Seat;
    dice: [number, number];
  };
}

export interface BgTurnRecord {
  seat: Seat;
  rolled: number[];
  steps: BgStep[];
  /** True when the seat rolled but had no legal step. */
  passed: boolean;
}

export type BgWinReason = 'single' | 'gammon' | 'backgammon';

export interface BgState extends BgPosition {
  turn: Seat;
  /** The full roll this turn, e.g. [6, 6] for double sixes. */
  rolled: number[];
  /** Dice still to play. Doubles give four entries. */
  dice: number[];
  /** Position and dice at the start of the current turn (for undo). */
  turnStart: BgPosition & { dice: number[] };
  /** Steps already taken this turn. */
  steps: BgStep[];
  /** Finished turns, including automatic passes. */
  history: BgTurnRecord[];
  /** Opening rolls as [seat 0 die, seat 1 die], including re-rolled ties. Empty with a custom setup. */
  opening: [number, number][];
  winner?: { seat: Seat; reason: BgWinReason };
  forfeit?: { seat: Seat; reason: 'resign' | 'timeout' | 'abandon' };
}

export interface BgPoint {
  seat: BgSide | null;
  count: number;
}

export interface BgView extends BgState {
  points: BgPoint[];
  pipCount: [number, number];
  result: GameResult | null;
  /** Legal single steps for the seat on turn (empty when the game is over). */
  legalSteps: BgStep[];
  canUndo: boolean;
}

/* ------------------------------------------------------------------------------------------ */
/* Perspective helpers. Internally every computation is done from the mover's point of view:   */
/* "me" moves from 23 toward 0 and bears off below 0, bar is from = 24, off is to = -1.        */
/* ------------------------------------------------------------------------------------------ */

export interface Persp {
  me: number[];
  opp: number[];
  meBar: number;
  oppBar: number;
  meOff: number;
  oppOff: number;
}
export interface PStep {
  /** 0..23, or 24 for the bar. */
  from: number;
  /** 0..23, or -1 for off. */
  to: number;
  die: number;
}

const BAR = 24;
const OFF = -1;

const sideVal = (pair: [number, number], seat: Seat): number => (seat === 0 ? pair[0] : pair[1]);

export function toPersp(pos: BgPosition, seat: Seat): Persp {
  const me = new Array<number>(24).fill(0);
  const opp = new Array<number>(24).fill(0);
  for (let i = 0; i < 24; i++) {
    const v = pos.board[i] ?? 0;
    const c = seat === 0 ? i : 23 - i;
    if (v > 0) (seat === 0 ? me : opp)[c] = v;
    else if (v < 0) (seat === 0 ? opp : me)[c] = -v;
  }
  return {
    me,
    opp,
    meBar: sideVal(pos.bar, seat),
    oppBar: sideVal(pos.bar, 1 - seat),
    meOff: sideVal(pos.off, seat),
    oppOff: sideVal(pos.off, 1 - seat),
  };
}

export function fromPersp(p: Persp, seat: Seat): BgPosition {
  const board = new Array<number>(24).fill(0);
  for (let c = 0; c < 24; c++) {
    const i = seat === 0 ? c : 23 - c;
    const m = p.me[c]!;
    const o = p.opp[c]!;
    if (m > 0) board[i] = seat === 0 ? m : -m;
    else if (o > 0) board[i] = seat === 0 ? -o : o;
  }
  return seat === 0
    ? { board, bar: [p.meBar, p.oppBar], off: [p.meOff, p.oppOff] }
    : { board, bar: [p.oppBar, p.meBar], off: [p.oppOff, p.meOff] };
}

export function toPublicStep(s: PStep, seat: Seat): BgStep {
  return {
    from: s.from === BAR ? 'bar' : seat === 0 ? s.from : 23 - s.from,
    to: s.to === OFF ? 'off' : seat === 0 ? s.to : 23 - s.to,
    die: s.die,
  };
}

function toPStep(s: BgStep, seat: Seat): PStep {
  return {
    from: s.from === 'bar' ? BAR : seat === 0 ? s.from : 23 - s.from,
    to: s.to === 'off' ? OFF : seat === 0 ? s.to : 23 - s.to,
    die: s.die,
  };
}

/** Single steps for one die value, ignoring the maximise dice rules. */
export function singleSteps(p: Persp, d: number): PStep[] {
  if (p.meBar > 0) {
    const t = 24 - d;
    return p.opp[t]! >= 2 ? [] : [{ from: BAR, to: t, die: d }];
  }
  let highest = -1;
  for (let i = 23; i >= 0; i--) {
    if (p.me[i]! > 0) {
      highest = i;
      break;
    }
  }
  const allHome = highest < 6;
  const out: PStep[] = [];
  for (let i = 0; i <= highest; i++) {
    if (p.me[i]! === 0) continue;
    const t = i - d;
    if (t >= 0) {
      if (p.opp[t]! < 2) out.push({ from: i, to: t, die: d });
    } else if (allHome && (t === -1 || i === highest)) {
      out.push({ from: i, to: OFF, die: d });
    }
  }
  return out;
}

export function applyP(p: Persp, s: PStep): Persp {
  const me = p.me.slice();
  const n: Persp = { ...p, me };
  if (s.from === BAR) n.meBar -= 1;
  else me[s.from] = me[s.from]! - 1;
  if (s.to === OFF) n.meOff += 1;
  else {
    if (p.opp[s.to] === 1) {
      const opp = p.opp.slice();
      opp[s.to] = 0;
      n.opp = opp;
      n.oppBar += 1;
    }
    me[s.to] = me[s.to]! + 1;
  }
  return n;
}

export function removeDie(dice: number[], d: number): number[] {
  const i = dice.indexOf(d);
  if (i < 0) return dice.slice();
  return [...dice.slice(0, i), ...dice.slice(i + 1)];
}

const uniq = (dice: number[]): number[] => [...new Set(dice)];

/** Maximum number of dice that can still be played from this position. */
export function maxDiceUsable(p: Persp, dice: number[]): number {
  if (dice.length === 0 || p.meOff >= 15) return 0;
  let best = 0;
  for (const d of uniq(dice)) {
    const rest = removeDie(dice, d);
    for (const s of singleSteps(p, d)) {
      const r = 1 + maxDiceUsable(applyP(p, s), rest);
      if (r > best) {
        best = r;
        if (best === dice.length) return best;
      }
    }
  }
  return best;
}

/** Legal single steps respecting the maximise dice usage and higher die rules. */
export function legalStepsP(p: Persp, dice: number[]): PStep[] {
  if (dice.length === 0 || p.meOff >= 15) return [];
  const cands: { s: PStep; depth: number }[] = [];
  let max = 0;
  for (const d of uniq(dice)) {
    const rest = removeDie(dice, d);
    for (const s of singleSteps(p, d)) {
      const depth = 1 + maxDiceUsable(applyP(p, s), rest);
      cands.push({ s, depth });
      if (depth > max) max = depth;
    }
  }
  let res = cands.filter((c) => c.depth === max);
  if (max === 1 && dice.length === 2 && dice[0] !== dice[1]) {
    const hi = Math.max(dice[0]!, dice[1]!);
    if (res.some((c) => c.s.die === hi)) res = res.filter((c) => c.s.die === hi);
  }
  return res.map((c) => c.s);
}

export function pipCounts(pos: BgPosition): [number, number] {
  let p0 = 25 * pos.bar[0];
  let p1 = 25 * pos.bar[1];
  for (let i = 0; i < 24; i++) {
    const v = pos.board[i] ?? 0;
    if (v > 0) p0 += (i + 1) * v;
    else if (v < 0) p1 += (24 - i) * -v;
  }
  return [p0, p1];
}

export const BG_START: number[] = (() => {
  const b = new Array<number>(24).fill(0);
  b[23] = 2;
  b[12] = 5;
  b[7] = 3;
  b[5] = 5;
  b[0] = -2;
  b[11] = -5;
  b[16] = -3;
  b[18] = -5;
  return b;
})();

const diceFor = (a: number, b: number): number[] => (a === b ? [a, a, a, a] : [a, b]);

function position(s: BgPosition): BgPosition {
  return { board: s.board.slice(), bar: [s.bar[0], s.bar[1]], off: [s.off[0], s.off[1]] };
}

const hasMove = (pos: BgPosition, seat: Seat, dice: number[]): boolean =>
  legalStepsP(toPersp(pos, seat), dice).length > 0;

/**
 * Give `seat` the turn with the given roll. If that seat has no legal step it passes and the other
 * side rolls, repeating until somebody can move.
 */
function beginTurn(
  pos: BgPosition,
  seat: Seat,
  first: [number, number],
  history: BgTurnRecord[],
  rng: Rng,
): Pick<BgState, 'turn' | 'rolled' | 'dice' | 'history' | 'turnStart' | 'steps'> {
  let s = seat;
  let roll: [number, number] = first;
  let h = history;
  // A permanent mutual block cannot arise in legal play; the guard only protects against odd setups.
  for (let guard = 0; guard < 500; guard++) {
    const dice = diceFor(roll[0], roll[1]);
    if (hasMove(pos, s, dice) || guard === 499) {
      return {
        turn: s,
        rolled: [roll[0], roll[1]],
        dice,
        history: h,
        turnStart: { ...position(pos), dice: dice.slice() },
        steps: [],
      };
    }
    h = [...h, { seat: s, rolled: [roll[0], roll[1]], steps: [], passed: true }];
    s = 1 - s;
    roll = [rng.die(), rng.die()];
  }
  throw new Error('unreachable');
}

function winReason(pos: BgPosition, winner: Seat): BgWinReason {
  const loser = 1 - winner;
  if (sideVal(pos.off, loser) > 0) return 'single';
  if (sideVal(pos.bar, loser) > 0) return 'backgammon';
  for (let i = 0; i < 24; i++) {
    const v = pos.board[i] ?? 0;
    // Loser checkers inside the winner's home board.
    if (winner === 0 && i <= 5 && v < 0) return 'backgammon';
    if (winner === 1 && i >= 18 && v > 0) return 'backgammon';
  }
  return 'gammon';
}

function validatePosition(pos: BgPosition) {
  if (pos.board.length !== 24) throw new Error('board must have 24 points');
  let c0 = pos.bar[0] + pos.off[0];
  let c1 = pos.bar[1] + pos.off[1];
  for (const v of pos.board) {
    if (!Number.isInteger(v)) throw new Error('bad board value');
    if (v > 0) c0 += v;
    else c1 -= v;
  }
  if (c0 !== 15 || c1 !== 15) throw new Error('each side needs exactly 15 checkers');
}

function explainIllegal(state: BgState, seat: Seat, move: BgStep): string {
  const p = toPersp(state, seat);
  const d = move.die;
  if (!Number.isInteger(d) || d < 1 || d > 6 || !state.dice.includes(d))
    return 'You do not have that number left to play this turn.';
  const from = move.from;
  if (from !== 'bar' && (!Number.isInteger(from) || from < 0 || from > 23))
    return 'Pick one of your checkers to move.';
  if (move.to !== 'off' && (!Number.isInteger(move.to) || move.to < 0 || move.to > 23))
    return 'That is not a point on the board.';
  const s = toPStep(move, seat);
  if (p.meBar > 0 && s.from !== BAR) return 'You have a checker on the bar. Bring it back in first.';
  if (s.from === BAR && p.meBar === 0) return 'You have no checker on the bar.';
  if (s.from !== BAR && p.me[s.from]! === 0) return 'You do not have a checker on that point.';
  const expected = s.from - d;
  if (expected >= 0 ? s.to !== expected : s.to !== OFF) return 'That move does not match the number on the die.';
  if (s.to !== OFF && p.opp[s.to]! >= 2) return "That point is blocked by two or more of your opponent's checkers.";
  if (s.to === OFF) {
    for (let i = 6; i < 24; i++)
      if (p.me[i]! > 0) return 'You can only bear off when all your checkers are in your home board.';
    if (expected < -1)
      return 'You can only bear off with a higher number from your highest point. Move a checker from a higher point first.';
  }
  const raw = singleSteps(p, d).some((x) => x.from === s.from && x.to === s.to);
  if (raw) {
    const max = maxDiceUsable(p, state.dice);
    if (max === 1 && state.dice.length === 2 && state.dice[0] !== state.dice[1])
      return 'When only one of your dice can be played, you must play the higher one.';
    return 'You must use as many of your dice as you can. That move would leave a die you could have played unused.';
  }
  return 'That move is not allowed.';
}

function isUndo(m: BgMove): m is BgUndo {
  return (m as BgUndo).type === 'undo';
}

export const backgammonEngine: GameEngine<BgState, BgMove, BgView, BgConfig> = {
  id: 'backgammon',
  seats: 2,
  teams: [0, 1],

  create(config, rng) {
    if (config.setup) {
      const su = config.setup;
      const pos: BgPosition = {
        board: su.board.slice(),
        bar: su.bar ? [su.bar[0], su.bar[1]] : [0, 0],
        off: su.off ? [su.off[0], su.off[1]] : [0, 0],
      };
      validatePosition(pos);
      for (const d of su.dice) if (!Number.isInteger(d) || d < 1 || d > 6) throw new Error('bad die');
      return { ...pos, opening: [], ...beginTurn(pos, su.turn, [su.dice[0], su.dice[1]], [], rng) };
    }
    const pos: BgPosition = { board: BG_START.slice(), bar: [0, 0], off: [0, 0] };
    const opening: [number, number][] = [];
    for (;;) {
      const a = rng.die();
      const b = rng.die();
      opening.push([a, b]);
      if (a !== b) {
        const first: Seat = a > b ? 0 : 1;
        return { ...pos, opening, ...beginTurn(pos, first, [a, b], [], rng) };
      }
    }
  },

  toAct(state) {
    if (backgammonEngine.result(state)) return [];
    return [state.turn];
  },

  legalMoves(state, seat) {
    if (backgammonEngine.result(state) || seat !== state.turn) return [];
    return legalStepsP(toPersp(state, seat), state.dice).map((s) => toPublicStep(s, seat));
  },

  applyMove(state, seat, move, rng) {
    if (backgammonEngine.result(state)) throw new IllegalMoveError('game over', 'This game has already finished.');
    if (seat !== state.turn) throw new IllegalMoveError('not your turn', 'Wait for your turn.');

    if (isUndo(move)) {
      if (state.steps.length === 0) throw new IllegalMoveError('nothing to undo', 'There is nothing to undo yet.');
      const ts = state.turnStart;
      return { ...state, ...position(ts), dice: ts.dice.slice(), steps: [] };
    }

    const p = toPersp(state, seat);
    const want = toPStep(move, seat);
    const legal = legalStepsP(p, state.dice);
    const step = legal.find((s) => s.from === want.from && s.to === want.to && s.die === move.die);
    if (!step) throw new IllegalMoveError('illegal step', explainIllegal(state, seat, move));

    const np = applyP(p, step);
    const pos = fromPersp(np, seat);
    const dice = removeDie(state.dice, step.die);
    const steps = [...state.steps, toPublicStep(step, seat)];

    if (np.meOff >= 15) {
      const record: BgTurnRecord = { seat, rolled: state.rolled.slice(), steps, passed: false };
      return {
        ...state,
        ...pos,
        dice: [],
        steps,
        history: [...state.history, record],
        winner: { seat, reason: winReason(pos, seat) },
      };
    }

    if (dice.length > 0 && legalStepsP(np, dice).length > 0) {
      return { ...state, ...pos, dice, steps };
    }

    // Turn over: record it and roll for the opponent.
    const record: BgTurnRecord = { seat, rolled: state.rolled.slice(), steps, passed: false };
    const next = beginTurn(pos, 1 - seat, [rng.die(), rng.die()], [...state.history, record], rng);
    return { ...state, ...pos, ...next };
  },

  forfeit(state, seat, reason) {
    if (backgammonEngine.result(state)) return state;
    return { ...state, forfeit: { seat, reason } };
  },

  result(state) {
    if (state.forfeit) return { winners: [1 - state.forfeit.seat], draw: false, reason: state.forfeit.reason };
    if (state.winner) {
      return {
        winners: [state.winner.seat],
        draw: false,
        reason: state.winner.reason,
        score: { '0': state.off[0], '1': state.off[1] },
      };
    }
    return null;
  },

  publicView(state) {
    const result = backgammonEngine.result(state);
    const points: BgPoint[] = state.board.map((v) =>
      v > 0 ? { seat: 0, count: v } : v < 0 ? { seat: 1, count: -v } : { seat: null, count: 0 },
    );
    return {
      ...state,
      points,
      pipCount: pipCounts(state),
      result,
      legalSteps: result ? [] : backgammonEngine.legalMoves(state, state.turn) as BgStep[],
      canUndo: !result && state.steps.length > 0,
    };
  },
};
