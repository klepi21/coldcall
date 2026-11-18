import type { ChessView } from '@evens/games';
import { PIECE_NAMES, type PieceColor, type PieceType } from './pieces';

export const FILES = 'abcdefgh';
export interface Pc {
  c: PieceColor;
  t: PieceType;
}
export interface Tracked extends Pc {
  id: string;
  sq: number;
}

/** Board index: rank * 8 + file, a1 = 0, h8 = 63. */
export function parsePlacement(fen: string): (Pc | null)[] {
  const out: (Pc | null)[] = Array(64).fill(null);
  const rows = fen.split(' ')[0]!.split('/');
  rows.forEach((row, i) => {
    const rank = 7 - i;
    let f = 0;
    for (const ch of row) {
      if (ch >= '1' && ch <= '8') f += Number(ch);
      else {
        out[rank * 8 + f] = { c: ch === ch.toUpperCase() ? 'w' : 'b', t: ch.toLowerCase() as PieceType };
        f++;
      }
    }
  });
  return out;
}

export const sqName = (i: number) => `${FILES[i % 8]}${Math.floor(i / 8) + 1}`;
export const sqIndex = (s: string) => (s.charCodeAt(1) - 49) * 8 + (s.charCodeAt(0) - 97);
export const isLightSquare = (i: number) => (Math.floor(i / 8) + (i % 8)) % 2 === 1;

export const VALUES: Record<PieceType, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

/** Colour that moved at history index i, taken from the starting FEN (games can start with black). */
export function moverColor(startFen: string, i: number): PieceColor {
  const first: PieceColor = startFen.split(' ')[1] === 'b' ? 'b' : 'w';
  return i % 2 === 0 ? first : first === 'w' ? 'b' : 'w';
}

/**
 * Keep stable ids for pieces between two positions so a moved piece slides instead of
 * disappearing and reappearing. The last move (when known) is matched first, so promotions
 * keep the pawn's id and castling, en passant and captures resolve naturally.
 */
export function trackPieces(
  prev: Tracked[] | null,
  board: (Pc | null)[],
  last: { from: string; to: string } | null,
  nextId: () => string,
): Tracked[] {
  if (!prev) return board.flatMap((p, i) => (p ? [{ ...p, id: nextId(), sq: i }] : []));
  const res: (Tracked | null)[] = Array(64).fill(null);
  const used = new Set<string>();
  const prevBySq = new Map(prev.map((p) => [p.sq, p]));
  if (last) {
    const f = sqIndex(last.from);
    const t = sqIndex(last.to);
    const pp = prevBySq.get(f);
    const np = board[t];
    if (pp && np && !board[f] && pp.c === np.c) {
      res[t] = { ...np, id: pp.id, sq: t };
      used.add(pp.id);
    }
  }
  for (let i = 0; i < 64; i++) {
    const np = board[i];
    if (!np || res[i]) continue;
    const pp = prevBySq.get(i);
    if (pp && !used.has(pp.id) && pp.c === np.c && pp.t === np.t) {
      res[i] = { ...np, id: pp.id, sq: i };
      used.add(pp.id);
    }
  }
  for (let i = 0; i < 64; i++) {
    const np = board[i];
    if (!np || res[i]) continue;
    let best: Tracked | null = null;
    let bestD = Infinity;
    for (const pp of prev) {
      if (used.has(pp.id) || pp.c !== np.c || pp.t !== np.t) continue;
      const d = Math.abs((pp.sq % 8) - (i % 8)) + Math.abs(Math.floor(pp.sq / 8) - Math.floor(i / 8));
      if (d < bestD) {
        bestD = d;
        best = pp;
      }
    }
    if (best) used.add(best.id);
    res[i] = { ...np, id: best ? best.id : nextId(), sq: i };
  }
  return res.filter((p): p is Tracked => p !== null);
}

export function pieceFromSan(san: string): PieceType {
  const ch = san[0];
  if (ch === 'K' || ch === 'O') return 'k';
  if (ch === 'Q') return 'q';
  if (ch === 'R') return 'r';
  if (ch === 'B') return 'b';
  if (ch === 'N') return 'n';
  return 'p';
}

/** Plain English line for the live region, for example "Bot moved knight to f3. Your turn." */
export function describeLastMove(view: ChessView, mySeat: number | null, toAct: number[], seatNames: string[]): string {
  const h = view.history[view.history.length - 1];
  if (!h) return '';
  const mover = 1 - view.turn;
  const you = mover === mySeat;
  const who = you ? 'You' : seatNames[mover] || (mover === 0 ? 'White' : 'Black');
  let line: string;
  if (h.san.startsWith('O-O')) {
    line = `${who} castled ${h.san.startsWith('O-O-O') ? 'queenside' : 'kingside'}`;
  } else {
    line = `${who} moved ${PIECE_NAMES[pieceFromSan(h.san)]} to ${h.to}`;
    if (h.captured) {
      const name = PIECE_NAMES[h.captured as PieceType] ?? 'piece';
      line += you || mySeat === null ? `, taking a ${name}` : `, taking your ${name}`;
    }
    if (h.promotion) line += ` and promoted to a ${PIECE_NAMES[h.promotion as PieceType] ?? 'queen'}`;
  }
  line += '.';
  const r = view.result;
  if (r) {
    if (r.reason === 'checkmate') line += ' Checkmate.';
    if (r.draw) line += ' The game is a draw.';
    else if (r.winners.length) {
      const w = r.winners[0]!;
      line += w === mySeat ? ' You win.' : ` ${seatNames[w] || (w === 0 ? 'White' : 'Black')} wins.`;
    }
    return line;
  }
  if (view.inCheck) line += you ? ' Check.' : mySeat !== null ? ' You are in check.' : ' Check.';
  if (mySeat !== null && toAct.includes(mySeat)) line += ' Your turn.';
  return line;
}
