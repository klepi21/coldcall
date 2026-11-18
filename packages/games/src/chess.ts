import { Chess } from 'chess.js';
import { IllegalMoveError, type GameEngine, type GameResult, type Seat } from './types';

/** Seat 0 = white, seat 1 = black. */
export interface ChessConfig {
  /** Optional starting FEN (tests, tutorials). */
  fen?: string;
}
export interface ChessMove {
  from: string;
  to: string;
  promotion?: 'q' | 'r' | 'b' | 'n';
}
export interface ChessState {
  fen: string;
  startFen: string;
  history: { san: string; from: string; to: string; captured?: string; promotion?: string }[];
  forfeit?: { seat: Seat; reason: 'resign' | 'timeout' | 'abandon' };
  drawAgreed?: boolean;
}
export interface ChessView extends ChessState {
  turn: Seat;
  inCheck: boolean;
  result: GameResult | null;
}

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

function load(state: ChessState): Chess {
  // Replay from the start so threefold repetition detection works.
  const c = new Chess(state.startFen);
  for (const h of state.history) c.move({ from: h.from, to: h.to, promotion: h.promotion });
  return c;
}

const seatOfTurn = (c: Chess): Seat => (c.turn() === 'w' ? 0 : 1);

export const chessEngine: GameEngine<ChessState, ChessMove, ChessView, ChessConfig> = {
  id: 'chess',
  seats: 2,
  teams: [0, 1],
  create(config) {
    const fen = config.fen ?? START;
    new Chess(fen); // validates
    return { fen, startFen: fen, history: [] };
  },
  toAct(state) {
    if (chessEngine.result(state)) return [];
    return [seatOfTurn(new Chess(state.fen))];
  },
  legalMoves(state, seat) {
    if (chessEngine.result(state)) return [];
    const c = new Chess(state.fen);
    if (seatOfTurn(c) !== seat) return [];
    return c.moves({ verbose: true }).map((m) => ({
      from: m.from,
      to: m.to,
      ...(m.promotion ? { promotion: m.promotion as ChessMove['promotion'] } : {}),
    }));
  },
  applyMove(state, seat, move) {
    if (chessEngine.result(state)) throw new IllegalMoveError('game over', 'This game has already finished.');
    const c = load(state);
    if (seatOfTurn(c) !== seat) throw new IllegalMoveError('not your turn', 'Wait for your turn.');
    let m;
    try {
      m = c.move({ from: move.from, to: move.to, promotion: move.promotion ?? 'q' });
    } catch {
      const probe = new Chess(state.fen);
      const piece = probe.get(move.from as never);
      const explain = !piece
        ? 'There is no piece on that square.'
        : probe.inCheck()
          ? 'You are in check. Your move must get your king out of check.'
          : 'That piece cannot move there. Legal squares are shown as dots.';
      throw new IllegalMoveError('illegal move', explain);
    }
    return {
      ...state,
      fen: c.fen(),
      history: [
        ...state.history,
        {
          san: m.san,
          from: m.from,
          to: m.to,
          ...(m.captured ? { captured: m.captured } : {}),
          ...(m.promotion ? { promotion: m.promotion } : {}),
        },
      ],
    };
  },
  forfeit(state, seat, reason) {
    if (chessEngine.result(state)) return state;
    return { ...state, forfeit: { seat, reason } };
  },
  result(state) {
    if (state.forfeit) return { winners: [1 - state.forfeit.seat], draw: false, reason: state.forfeit.reason };
    if (state.drawAgreed) return { winners: [], draw: true, reason: 'agreement' };
    const c = load(state);
    if (c.isCheckmate()) return { winners: [1 - seatOfTurn(c)], draw: false, reason: 'checkmate' };
    if (c.isStalemate()) return { winners: [], draw: true, reason: 'stalemate' };
    if (c.isInsufficientMaterial()) return { winners: [], draw: true, reason: 'insufficient_material' };
    if (c.isThreefoldRepetition()) return { winners: [], draw: true, reason: 'repetition' };
    if (c.isDraw()) return { winners: [], draw: true, reason: 'fifty_moves' };
    return null;
  },
  publicView(state) {
    const c = new Chess(state.fen);
    return { ...state, turn: seatOfTurn(c), inCheck: c.inCheck(), result: chessEngine.result(state) };
  },
};
