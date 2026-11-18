import type { Rng } from './rng';

export type GameId = 'chess' | 'backgammon' | 'tichu' | 'seabattle';
export type Seat = number; // 0-based seat index

export interface GameResult {
  /** Seats that won. Team games list every seat of the winning team. Empty on a draw. */
  winners: Seat[];
  draw: boolean;
  /** Machine readable reason, e.g. 'checkmate', 'resign', 'timeout', 'bear_off', 'score_limit'. */
  reason: string;
  /** Optional per-seat or per-team score summary for display. */
  score?: Record<string, number>;
}

export class IllegalMoveError extends Error {
  constructor(
    message: string,
    /** Short plain-English explanation safe to show to the player. */
    public readonly explain: string = message,
  ) {
    super(message);
    this.name = 'IllegalMoveError';
  }
}

/**
 * Pure, deterministic rule engine. State, moves and views must be JSON serialisable.
 * All randomness comes from the Rng passed in, so a game can be replayed from
 * (config, seed, ordered move log).
 */
export interface GameEngine<S, M, V, C = Record<string, unknown>> {
  id: GameId;
  seats: number;
  /** Seat -> team index. For 1v1 games this is [0, 1]. */
  teams: number[];
  create(config: C, rng: Rng): S;
  /** Seats that may act now (can be several, e.g. simultaneous card passing). */
  toAct(state: S): Seat[];
  legalMoves(state: S, seat: Seat): M[];
  /** Returns the new state. Throws IllegalMoveError. Must not mutate the input. */
  applyMove(state: S, seat: Seat, move: M, rng: Rng): S;
  /** Seat resigns or times out. */
  forfeit(state: S, seat: Seat, reason: 'resign' | 'timeout' | 'abandon'): S;
  result(state: S): GameResult | null;
  /** What `seat` is allowed to see. Hide other players' hands and the deck. seat = -1 for spectators. */
  publicView(state: S, seat: Seat): V;
}

export interface BotContext<S> {
  state: S;
  seat: Seat;
  /** 0 (easiest) .. 10 (strongest). */
  level: number;
  rng: Rng;
}
