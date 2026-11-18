/**
 * 3D layout built on the 2D board geometry. One SVG unit of the 2D board is 0.01 world units:
 * world x = (svgX - W/2) / 100, world z = (svgY - H/2) / 100, the playing field sits at y = 0.
 * The viewer always looks from +z, so their home board is bottom right exactly like the 2D board.
 * No three.js imports in this file.
 */
import { BAR_X, BOT, H, MID, R, RIGHT_X, TOP, TRAY, TRAY_X, W, colRow, colX, persp, type Pos, type Where } from '../geometry';

export type V3 = [number, number, number];

export const S = 0.01;
export const wx = (x: number) => (x - W / 2) * S;
export const wz = (y: number) => (y - H / 2) * S;

/** Checker radius and thickness in world units. */
export const CR = (R - 2) * S;
export const CH = 0.1;
/** Raised wall and hinge bar height. */
export const WALL_H = 0.3;
/** Checkers on the bar rest on top of the hinge bar. */
export const BAR_TOP = WALL_H;

/** Case extents in SVG units (a little wider than the 2D frame so the walls read as real wood). */
export const CASE = { x0: -34, x1: W + 34, y0: -24, y1: H + 24 };

const STEP = 2 * R;

/** Checkers lie flat in a row of five, extra checkers pile on top in a pyramid (5, 4, 3, 2, 1). */
function pyramid(k: number): { slot: number; layer: number } {
  let layer = 0;
  let left = k;
  let width = 5;
  while (left >= width && width > 1) {
    left -= width;
    layer += 1;
    width -= 1;
  }
  return { slot: left + layer * 0.5, layer: Math.min(layer, 4) };
}

/** k-th checker (0 at the base) on perspective point c. */
export function pointPos3(c: number, k: number): V3 {
  const { col, top } = colRow(c);
  const { slot, layer } = pyramid(k);
  const x = colX(col);
  const y = top ? TOP + R + 2 + slot * STEP : BOT - R - 2 - slot * STEP;
  return [wx(x), layer * CH, wz(y)];
}

/** k-th checker on the hinge bar. The viewer's sit in the lower half. */
export function barPos3(mine: boolean, k: number): V3 {
  const layer = Math.floor(k / 4);
  const slot = (k % 4) + layer * 0.5;
  const y = mine ? MID + 52 + slot * STEP : MID - 52 - slot * STEP;
  return [wx(BAR_X + (RIGHT_X - BAR_X) / 2), BAR_TOP + layer * CH, wz(y)];
}

/** Borne off checkers stand on edge in the tray. */
export const SLAB_STEP = 21.5;
export function trayPos3(mine: boolean, k: number): V3 {
  const y = mine ? BOT - 8 - 10 - k * SLAB_STEP : TOP + 8 + 10 + k * SLAB_STEP;
  return [wx(TRAY_X + TRAY / 2), 0, wz(y)];
}

/** Where the top checker of `where` sits, for the given seat. */
export function topPos3(pos: Pos, seat: number, where: Where, mySeat: number): V3 {
  if (where === 'bar') return barPos3(seat === mySeat, Math.max(0, pos.bar[seat as 0 | 1] - 1));
  if (where === 'off') return trayPos3(seat === mySeat, Math.max(0, pos.off[seat as 0 | 1] - 1));
  const n = pos.points[where]!.count;
  return pointPos3(persp(where, mySeat), Math.max(0, n - 1));
}

/** Where the next checker of `seat` would land on `where`. A blot counts as empty (it gets hit). */
export function nextPos3(pos: Pos, seat: number, where: Where, mySeat: number): V3 {
  if (where === 'off') return trayPos3(seat === mySeat, pos.off[seat as 0 | 1]);
  if (where === 'bar') return barPos3(seat === mySeat, pos.bar[seat as 0 | 1]);
  const q = pos.points[where]!;
  const n = q.seat === seat ? q.count : 0;
  return pointPos3(persp(where, mySeat), n);
}

/** World point back to SVG units for the 2D hit test. */
export const toSvg = (x: number, z: number) => ({ x: x / S + W / 2, y: z / S + H / 2 });
