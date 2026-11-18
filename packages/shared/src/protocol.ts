import { z } from 'zod';
import { CURRENCIES } from './money';

export const GameKindZ = z.enum(['chess', 'backgammon', 'tichu', 'seabattle']);
export const ModeZ = z.enum(['practice', 'bot', 'pvp']);
export const CurrencyZ = z.enum(CURRENCIES);
/** Range checked per currency by validStake. */
export const StakeZ = z.number().int().min(1).max(100_000_000);
export const ChessTimeZ = z.enum(['3+2', '5+3', '10+5']);

export const CreateTableZ = z.object({
  game: GameKindZ,
  mode: ModeZ,
  currency: CurrencyZ,
  stake: z.number().int().min(0).max(100_000_000),
  visibility: z.enum(['public', 'private']).default('public'),
  time: ChessTimeZ.optional(),
  clientSeed: z.string().min(1).max(64),
});
export type CreateTable = z.infer<typeof CreateTableZ>;

export const QuickMatchZ = z.object({
  game: GameKindZ,
  currency: CurrencyZ,
  stake: StakeZ,
  time: ChessTimeZ.optional(),
  clientSeed: z.string().min(1).max(64),
});

export const JoinTableZ = z.object({ clientSeed: z.string().min(1).max(64) });

export const WithdrawRequestZ = z.object({ currency: CurrencyZ, amount: z.number().int().positive().max(100_000_000) });
export const DepositBuildZ = z.object({ currency: CurrencyZ, amount: z.number().int().positive().max(100_000_000) });
/** A Sui transaction digest (base58, 32 bytes). */
export const DigestZ = z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
/** Browser hands back the transaction bytes the server built plus the user's signature. */
export const SignedTxZ = z.object({ bytes: z.string().min(10).max(200_000), signature: z.string().min(10).max(20_000) });

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
  currency: 'LOFI' | 'SUI';
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
  | { t: 'balance'; currency: 'LOFI' | 'SUI'; available: number; locked: number }
  | { t: 'pong' };
