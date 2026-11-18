/**
 * Bot difficulty calibration. Inputs are ONLY the player's skill rating for that game and
 * the disclosed house edge. Never balance, deposits, losses or spending.
 *
 * Chess uses the Davidson model (wins, draws, losses):
 *   x = 10^((player - engine) / 800),  D = x + 1/x + nu
 *   win = x / D, loss = (1/x) / D, draw = nu / D
 * Expected return per unit staked vs the bot: win - loss - 0.1 * draw (draw refunds 90%).
 * We pick the engine Elo whose expected return is -BOT_HOUSE_EDGE (-5%).
 *
 * Backgammon and Tichu have no draws: target win chance 47.5%, logistic model.
 */
import { BOT_HOUSE_EDGE } from '@coldcall/shared';

export const DRAW_FACTOR = 2 / 3;
export const ENGINE_MIN = 1320;
export const ENGINE_MAX = 3190;

export function davidson(player: number, engine: number, nu = DRAW_FACTOR) {
  const x = Math.pow(10, (player - engine) / 800);
  const D = x + 1 / x + nu;
  return { win: x / D, loss: 1 / x / D, draw: nu / D };
}

export const chessEv = (player: number, engine: number) => {
  const p = davidson(player, engine);
  return p.win - p.loss - 0.1 * p.draw;
};

export interface ChessBotSetting {
  /** Target engine strength on the Elo scale. */
  elo: number;
  /** UCI options to reach it. Below 1320 we use Skill Level, which is approximate. */
  uci: { limitStrength: boolean; elo?: number; skill?: number; movetimeMs: number };
  expected: { win: number; draw: number; loss: number; ev: number };
}

export function chessBotFor(playerRating: number): ChessBotSetting {
  const target = -BOT_HOUSE_EDGE;
  let lo = 600,
    hi = ENGINE_MAX;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (chessEv(playerRating, mid) > target) lo = mid;
    else hi = mid;
  }
  const elo = Math.round(hi);
  const p = davidson(playerRating, elo);
  const expected = { ...p, ev: chessEv(playerRating, elo) };
  if (elo >= ENGINE_MIN) return { elo, uci: { limitStrength: true, elo, movetimeMs: 400 }, expected };
  // Approximate mapping of Stockfish Skill Level to Elo for weak play (monitored in admin).
  const skill = Math.max(0, Math.min(20, Math.round((elo - 600) / 36)));
  return { elo, uci: { limitStrength: false, skill, movetimeMs: 120 }, expected };
}

/** Level ladder for backgammon and Tichu bots, approximate Elo per level. */
export const levelElo = (level: number) => 1100 + 60 * level;
export const logistic = (a: number, b: number) => 1 / (1 + Math.pow(10, (b - a) / 400));

export function levelFor(playerRating: number, targetWin = 0.475): { level: number; expectedWin: number } {
  let best = 0,
    bestDiff = Infinity;
  for (let l = 0; l <= 10; l++) {
    const d = Math.abs(logistic(playerRating, levelElo(l)) - targetWin);
    if (d < bestDiff) {
      bestDiff = d;
      best = l;
    }
  }
  return { level: best, expectedWin: logistic(playerRating, levelElo(best)) };
}

/** Elo update. score: 1 win, 0.5 draw, 0 loss. */
export function updateRating(r: { r: number; n: number }, opponent: number, score: number) {
  const k = r.n < 20 ? 40 : 20;
  const exp = logistic(r.r, opponent);
  return { r: Math.round(r.r + k * (score - exp)), n: r.n + 1 };
}
