import {
  chessEngine,
  backgammonEngine,
  backgammonBot,
  tichuEngine,
  tichuBot,
  tichuBotInterrupt,
  seaBattleEngine,
  seaBattleBot,
  type SbState,
  type GameEngine,
  type Rng,
  type ChessState,
  type BgState,
  type TichuState,
} from '@evens/games';
import { Chess } from 'chess.js';
import { stockfishMove } from './stockfish';
import type { ChessBotSetting } from './calibration';

export type AnyEngine = GameEngine<any, any, any, any>;

export interface BotMeta {
  level?: number;
  chess?: ChessBotSetting['uci'];
}

export interface GameDef {
  engine: AnyEngine;
  /** Returns the bot's move(s) for this decision. Several for multi step turns (backgammon). */
  botMoves(state: any, seat: number, meta: BotMeta, rng: Rng): Promise<unknown[]>;
  /** Optional out of turn actions (Tichu bombs). */
  interrupt?(state: any, seat: number, meta: BotMeta, rng: Rng): unknown | null;
  /** Human time per decision when there is no chess clock (ms). */
  turnMs: number;
}

async function chessBot(state: ChessState, _seat: number, meta: BotMeta): Promise<unknown[]> {
  const uci = meta.chess ?? { limitStrength: true, elo: 1500, movetimeMs: 300 };
  const best = await stockfishMove(state.fen, uci);
  const c = new Chess(state.fen);
  const legal = c.moves({ verbose: true });
  const m = legal.find((x) => x.from === best.slice(0, 2) && x.to === best.slice(2, 4)) ?? legal[0]!;
  return [{ from: m.from, to: m.to, ...(best.length > 4 ? { promotion: best[4] } : m.promotion ? { promotion: m.promotion } : {}) }];
}

export const GAMES: Record<'chess' | 'backgammon' | 'tichu' | 'seabattle', GameDef> = {
  chess: { engine: chessEngine, botMoves: (s, seat, meta) => chessBot(s, seat, meta), turnMs: 0 },
  backgammon: {
    engine: backgammonEngine,
    botMoves: async (s: BgState, seat, meta, rng) => backgammonBot({ state: s, seat, level: meta.level ?? 5, rng }),
    turnMs: 45_000,
  },
  seabattle: {
    engine: seaBattleEngine,
    botMoves: async (s: SbState, seat, meta, rng) => [seaBattleBot({ state: s, seat, level: meta.level ?? 6, rng })],
    turnMs: 45_000,
  },
  tichu: {
    engine: tichuEngine,
    botMoves: async (s: TichuState, seat, meta, rng) => [tichuBot({ state: s, seat, level: meta.level ?? 6, rng })],
    interrupt: (s: TichuState, seat, meta, rng) => tichuBotInterrupt({ state: s, seat, level: meta.level ?? 6, rng }),
    turnMs: 45_000,
  },
};

export const TIME_CONTROLS: Record<string, { baseMs: number; incMs: number }> = {
  '3+2': { baseMs: 180_000, incMs: 2_000 },
  '5+3': { baseMs: 300_000, incMs: 3_000 },
  '10+5': { baseMs: 600_000, incMs: 5_000 },
};

export const BOT_NAMES = ['Ariadne', 'Theo', 'Leda', 'Nikos', 'Irene', 'Stavros', 'Calla', 'Dimitri', 'Zoe', 'Petros'];
