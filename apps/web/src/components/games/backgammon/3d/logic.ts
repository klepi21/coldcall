/**
 * View logic shared by the 3D board. These helpers mirror private functions inside the 2D
 * BackgammonBoard.tsx (diffSteps, samePos, removeOne, diceText, where, the status line and the
 * used dice flags). They live here because that file does not export them yet. If it ever does,
 * import them from there and delete this copy.
 *
 * No three.js imports in this file.
 */
import type { BgStep, BgView } from '@coldcall/games';
import { clonePos, persp, type Pos, type Where } from '../geometry';

export const isStep = (m: unknown): m is BgStep => !!m && typeof m === 'object' && !('type' in m);
export const sameStep = (a: BgStep, b: BgStep) => a.from === b.from && a.to === b.to && a.die === b.die;

export const posOf = (v: { points: BgView['points']; bar: [number, number]; off: [number, number] }): Pos => ({
  points: v.points,
  bar: v.bar,
  off: v.off,
});

export const samePos = (a: Pos, b: Pos) =>
  a.bar[0] === b.bar[0] &&
  a.bar[1] === b.bar[1] &&
  a.off[0] === b.off[0] &&
  a.off[1] === b.off[1] &&
  a.points.every((p, i) => {
    const q = b.points[i]!;
    return p.count === q.count && (p.count === 0 || p.seat === q.seat);
  });

/** Steps played between two views, or null when the change is not a simple continuation (undo, reset). */
export function diffSteps(prev: BgView, next: BgView): { seat: number; step: BgStep }[] | null {
  if (next.history.length < prev.history.length) return null;
  if (next.history.length === prev.history.length) {
    if (next.turn !== prev.turn || next.steps.length < prev.steps.length) return null;
    return next.steps.slice(prev.steps.length).map((step) => ({ seat: next.turn, step }));
  }
  const out: { seat: number; step: BgStep }[] = [];
  next.history.slice(prev.history.length).forEach((rec, j) => {
    const st = j === 0 && rec.seat === prev.turn ? rec.steps.slice(prev.steps.length) : rec.steps;
    for (const step of st) out.push({ seat: rec.seat, step });
  });
  for (const step of next.steps) out.push({ seat: next.turn, step });
  return out;
}

export const whereText = (w: Where, mySeat: number) =>
  w === 'bar' ? 'the bar' : w === 'off' ? 'off the board' : `point ${persp(w, mySeat) + 1}`;
const timesWord = (n: number) => (n === 4 ? 'four times' : n === 3 ? 'three times' : n === 2 ? 'twice' : 'once');

export function diceText(dice: number[]): string {
  if (dice.length === 0) return '';
  if (dice.every((d) => d === dice[0]) && dice.length > 1) return `${dice[0]} ${timesWord(dice.length)}`;
  if (dice.length === 1) return `${dice[0]}`;
  return `${dice[0]} and ${dice[1]}`;
}

export function removeOne(pos: Pos, seat: number, w: Where): Pos {
  const p = clonePos(pos);
  const s = seat as 0 | 1;
  if (w === 'bar') p.bar[s] = Math.max(0, p.bar[s] - 1);
  else if (w === 'off') p.off[s] = Math.max(0, p.off[s] - 1);
  else {
    const q = p.points[w]!;
    q.count = Math.max(0, q.count - 1);
    if (q.count === 0) q.seat = null;
  }
  return p;
}

/** The full roll as dice to draw (doubles show four) and which of them are already used. */
export function diceDisplay(view: BgView, pendingDie: number | null): { values: number[]; used: boolean[] } {
  const rolled =
    view.rolled.length === 2 && view.rolled[0] === view.rolled[1]
      ? [view.rolled[0]!, view.rolled[0]!, view.rolled[0]!, view.rolled[0]!]
      : view.rolled.slice();
  const remaining = view.dice.slice();
  if (pendingDie !== null) {
    const i = remaining.indexOf(pendingDie);
    if (i >= 0) remaining.splice(i, 1);
  }
  if (rolled.length === 4) {
    const usedN = 4 - remaining.length;
    return { values: rolled, used: rolled.map((_, k) => k < usedN) };
  }
  const left = remaining.slice();
  const used = rolled.map(() => true);
  for (let k = 0; k < rolled.length; k++) {
    const i = left.indexOf(rolled[k]!);
    if (i >= 0) {
      used[k] = false;
      left.splice(i, 1);
    }
  }
  return { values: rolled, used };
}

/** The one line above the board. Same wording as the 2D board. */
export function statusText(args: {
  view: BgView;
  mySeat: number | null;
  seatNames: string[];
  myTurn: boolean;
  pending: boolean;
  busy: boolean;
  stepsCount: number;
  fromBar: boolean;
}): string {
  const { view, mySeat, seatNames, myTurn, pending, busy, stepsCount, fromBar } = args;
  const seatV = mySeat ?? 0;
  const oppName = seatNames[1 - seatV] ?? 'Opponent';
  const lastRec = view.history[view.history.length - 1];
  if (view.result) {
    const w = view.result.winners[0];
    const how = view.result.reason === 'gammon' ? ' with a gammon' : view.result.reason === 'backgammon' ? ' with a backgammon' : '';
    if (mySeat === null) return `${seatNames[w ?? 0] ?? 'Player'} won${how}.`;
    return w === mySeat ? `You won${how}. Well played.` : `${seatNames[w ?? 0] ?? 'Your opponent'} won${how}. Good game.`;
  }
  if (mySeat === null) return `${seatNames[view.turn] ?? 'Player'} to move.`;
  if (lastRec?.passed && lastRec.seat === mySeat && view.turn !== mySeat) return `No legal moves for ${diceText(lastRec.rolled)}, your turn passes.`;
  if (pending) return 'Happy with that? Confirm your move, or undo.';
  if (myTurn) {
    const pre = lastRec?.passed && lastRec.seat !== mySeat ? `${oppName} could not move. ` : '';
    if (stepsCount === 0) return `${pre}No legal moves, your turn passes.`;
    if (fromBar) return `${pre}Your turn. Bring your checker in from the bar with ${diceText(view.dice)}.`;
    return `${pre}Your turn. Move ${diceText(view.dice)}.`;
  }
  return busy ? 'Sending your move.' : `${oppName} is thinking.`;
}
