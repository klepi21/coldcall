import { z } from 'zod';
import { MIN_STAKE, MAX_STAKE_PVP } from './money';

export const GameKindZ = z.enum(['chess', 'backgammon', 'tichu', 'seabattle']);
export const ModeZ = z.enum(['practice', 'bot', 'pvp']);
export const StakeZ = z.number().int().min(MIN_STAKE).max(MAX_STAKE_PVP);
export const ChessTimeZ = z.enum(['3+2', '5+3', '10+5']);

export const CreateTableZ = z.object({
  game: GameKindZ,
  mode: ModeZ,
  stake: z.number().int().min(0),
  visibility: z.enum(['public', 'private']).default('public'),
  time: ChessTimeZ.optional(),
  clientSeed: z.string().min(1).max(64),
});
export type CreateTable = z.infer<typeof CreateTableZ>;

export const QuickMatchZ = z.object({
  game: GameKindZ,
  stake: StakeZ,
  time: ChessTimeZ.optional(),
  clientSeed: z.string().min(1).max(64),
});

export const JoinTableZ = z.object({ clientSeed: z.string().min(1).max(64) });

export const WithdrawRequestZ = z.object({ amount: z.number().int().positive() });
export const DepositConfirmZ = z.object({ signature: z.string().min(40).max(100) });

/** Client to server over WebSocket. */
export const ClientMsgZ = z.discriminatedUnion('t', [
  z.object({ t: z.literal('watch'), tableId: z.string().uuid() }),
  z.object({ t: z.literal('unwatch'), tableId: z.string().uuid() }),
  z.object({ t: z.literal('move'), tableId: z.string().uuid(), move: z.unknown(), seq: z.number().int().min(0) }),
  z.object({ t: z.literal('resign'), tableId: z.string().uuid() }),
  z.object({ t: z.literal('react'), tableId: z.string().uuid(), emoji: z.enum(['👍', '👏', '😮', '😅', '🔥', '🤝']) }),
  z.object({ t: z.literal('ping') }),
]);
export type ClientMsg = z.infer<typeof ClientMsgZ>;

export interface SeatInfo {
  seat: number;
  userId: string | null;
  name: string;
  isBot: boolean;
  avatar: string;
  connected: boolean;
}

export interface TableSummary {
  id: string;
  game: 'chess' | 'backgammon' | 'tichu' | 'seabattle';
  mode: 'practice' | 'bot' | 'pvp';
  stake: number;
  fee: number;
  capacity: number;
  status: 'waiting' | 'playing' | 'settled' | 'cancelled';
  visibility: 'public' | 'private';
  inviteCode: string | null;
  seats: SeatInfo[];
  time: string | null;
  seedCommit: string;
  createdAt: string;
}

/** Server to client. */
export type ServerMsg =
  | { t: 'table'; table: TableSummary; you: number | null }
  | {
      t: 'state';
      tableId: string;
      seq: number;
      view: unknown;
      toAct: number[];
      clocks: number[] | null;
      deadline: number | null;
      lastMove?: { seat: number; move: unknown } | null;
      legal?: unknown[];
    }
  | { t: 'error'; tableId?: string; message: string; code?: string }
  | {
      t: 'result';
      tableId: string;
      result: { winners: number[]; draw: boolean; reason: string; score?: Record<string, number> };
      payouts: { seat: number; delta: number }[];
      serverSeed: string;
    }
  | { t: 'react'; tableId: string; seat: number; emoji: string }
  | { t: 'balance'; available: number; locked: number }
  | { t: 'pong' };
