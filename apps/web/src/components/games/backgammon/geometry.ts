/**
 * Board geometry in SVG user units. The board is always drawn from the viewer's perspective:
 * perspective point c = 0 is the viewer's point 1 (bottom right, next to the tray) and the viewer
 * moves counter clockwise from c = 23 (top right) to c = 0. Absolute engine index i maps to c with
 * c = i for seat 0 and c = 23 - i for seat 1.
 */
import type { BgPoint } from '@coldcall/games';

export const W = 1000;
export const H = 800;
export const FX = 14; // left frame
export const FY = 30; // top and bottom frame (holds point numbers)
export const BAR = 68;
export const DIV = 10; // frame strip between field and tray
export const TRAY = 52;
export const FR = 12; // right frame
export const PW = (W - FX - BAR - DIV - TRAY - FR) / 12; // point width, 70.5
export const R = 33; // checker radius
export const TOP = FY;
export const BOT = H - FY;
export const MID = H / 2;
export const PL = 300; // point length
export const LEFT_X = FX;
export const BAR_X = FX + 6 * PW;
export const RIGHT_X = BAR_X + BAR;
export const FIELD_END = RIGHT_X + 6 * PW;
export const TRAY_X = FIELD_END + DIV;
export const TRAY_END = TRAY_X + TRAY;
/** Furthest a stack may reach from its base (keeps the middle band free for dice). */
export const STACK_MAX = 5 * 2 * R;

export interface Pos {
  points: BgPoint[];
  bar: [number, number];
  off: [number, number];
}

export const persp = (i: number, mySeat: number) => (mySeat === 1 ? 23 - i : i);
export const absIdx = (c: number, mySeat: number) => (mySeat === 1 ? 23 - c : c);

/** Column 0..11 left to right and row for a perspective point. */
export function colRow(c: number): { col: number; top: boolean } {
  return c < 12 ? { col: 11 - c, top: false } : { col: c - 12, top: true };
}

export function colX(col: number): number {
  return LEFT_X + col * PW + (col >= 6 ? BAR : 0) + PW / 2;
}

export function stackStep(n: number): number {
  if (n <= 5) return 2 * R;
  return Math.min(2 * R, (STACK_MAX - 2 * R) / (n - 1));
}

/** Centre of the k-th checker (0 = at the base) in a stack of n on perspective point c. */
export function pointXY(c: number, k: number, n: number): { x: number; y: number } {
  const { col, top } = colRow(c);
  const step = stackStep(Math.max(n, k + 1));
  const x = colX(col);
  const y = top ? TOP + R + 2 + k * step : BOT - R - 2 - k * step;
  return { x, y };
}

export const BAR_CX = BAR_X + BAR / 2;

/** The viewer's own checkers sit in the lower half of the bar, the opponent's in the upper half. */
export function barXY(mine: boolean, k: number, n: number): { x: number; y: number } {
  const step = n <= 4 ? 2 * R : Math.max(18, (MID - TOP - 60 - 2 * R) / (n - 1));
  const y = mine ? MID + 50 + k * step : MID - 50 - k * step;
  return { x: BAR_CX, y };
}

export const SLAB_H = 19;
export const SLAB_GAP = 2.5;
/** Borne off slabs: the viewer's at the bottom of the tray, the opponent's at the top. */
export function trayXY(mine: boolean, k: number): { x: number; y: number } {
  const y = mine ? BOT - 6 - SLAB_H / 2 - k * (SLAB_H + SLAB_GAP) : TOP + 6 + SLAB_H / 2 + k * (SLAB_H + SLAB_GAP);
  return { x: TRAY_X + TRAY / 2, y };
}

export type Where = number | 'bar' | 'off';

/** Hit test in SVG units. Returns an absolute point index, 'bar', 'off' or null. */
export function hitTest(x: number, y: number, mySeat: number): Where | null {
  if (x >= TRAY_X - DIV / 2 && x <= TRAY_END + FR) return 'off';
  if (x >= BAR_X && x < RIGHT_X) return 'bar';
  let col: number;
  if (x >= LEFT_X && x < BAR_X) col = Math.floor((x - LEFT_X) / PW);
  else if (x >= RIGHT_X && x < FIELD_END) col = 6 + Math.floor((x - RIGHT_X) / PW);
  else return null;
  if (y < 0 || y > H) return null;
  const top = y < MID;
  const c = top ? col + 12 : 11 - col;
  return absIdx(c, mySeat);
}

export function clonePos(p: Pos): Pos {
  return { points: p.points.map((q) => ({ ...q })), bar: [p.bar[0], p.bar[1]], off: [p.off[0], p.off[1]] };
}

/** Apply one step for display purposes. The engine is the authority; this only mirrors its result. */
export function applyLocal(pos: Pos, seat: number, from: number | 'bar', to: number | 'off'): { after: Pos; hit: boolean } {
  const p = clonePos(pos);
  const s = seat as 0 | 1;
  if (from === 'bar') p.bar[s] = Math.max(0, p.bar[s] - 1);
  else {
    const q = p.points[from]!;
    q.count = Math.max(0, q.count - 1);
    if (q.count === 0) q.seat = null;
  }
  let hit = false;
  if (to === 'off') p.off[s] += 1;
  else {
    const q = p.points[to]!;
    if (q.seat !== null && q.seat !== s && q.count === 1) {
      hit = true;
      p.bar[(1 - s) as 0 | 1] += 1;
      q.count = 0;
    }
    q.seat = s;
    q.count += 1;
  }
  return { after: p, hit };
}

/** Where a checker at the top of `where` currently sits (for the mover's seat). */
export function topXY(pos: Pos, seat: number, where: Where, mySeat: number): { x: number; y: number } {
  if (where === 'bar') {
    const n = pos.bar[seat as 0 | 1];
    return barXY(seat === mySeat, Math.max(0, n - 1), n);
  }
  if (where === 'off') return trayXY(seat === mySeat, Math.max(0, pos.off[seat as 0 | 1] - 1));
  const n = pos.points[where]!.count;
  return pointXY(persp(where, mySeat), Math.max(0, n - 1), n);
}

/** Where the next checker would land on `where` (slot after the current top). */
export function nextXY(pos: Pos, seat: number, where: Where, mySeat: number): { x: number; y: number } {
  if (where === 'off') return trayXY(seat === mySeat, pos.off[seat as 0 | 1]);
  if (where === 'bar') {
    const n = pos.bar[seat as 0 | 1];
    return barXY(seat === mySeat, n, n + 1);
  }
  const q = pos.points[where]!;
  const n = q.seat === seat ? q.count : 0;
  return pointXY(persp(where, mySeat), Math.min(n, 4), Math.min(n + 1, 5));
}
