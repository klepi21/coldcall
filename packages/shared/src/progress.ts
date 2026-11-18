import { z } from 'zod';

/**
 * Progression types shared by server and web.
 * XP and rewards never depend on stake, mode or money. Rewards are cosmetic or status only.
 */
export type ProgressGame = 'chess' | 'backgammon' | 'tichu' | 'seabattle';

export const COSMETIC_SLOTS = ['title', 'frame', 'chessTheme', 'cardBack', 'shipSkin', 'dice'] as const;
export type CosmeticSlot = (typeof COSMETIC_SLOTS)[number];

export const EquipZ = z.object({
  slot: z.enum(COSMETIC_SLOTS),
  /** null takes the item off and goes back to the default look. */
  id: z.string().min(1).max(40).nullable(),
});
export type Equip = z.infer<typeof EquipZ>;

export interface XpLine {
  label: string;
  xp: number;
}

export interface AchievementInfo {
  code: string;
  name: string;
  /** How to unlock it, in plain words. */
  how: string;
  game: ProgressGame | null;
  icon: string;
  xp: number;
  /** Cosmetic unlocked by this achievement, if any. */
  reward?: string | null;
}

/** WebSocket push to one user after a game they played is paid out. */
export interface ProgressMsg {
  t: 'progress';
  tableId: string;
  game: ProgressGame;
  xpGained: number;
  breakdown: XpLine[];
  /** Total lifetime XP after this game. */
  totalXp: number;
  level: number;
  levelBefore: number;
  levelUp: boolean;
  /** XP into the current level and XP needed for the next, after this game. */
  xpInLevel: number;
  xpToNext: number;
  /** XP into the level before this game (for the bar fill animation). Equal to 0 after a level up. */
  xpInLevelBefore: number;
  newAchievements: AchievementInfo[];
  challengesDone: { code: string; name: string; xp: number }[];
  unlocks: { slot: CosmeticSlot; id: string; name: string }[];
  /** Set when the game was too short to count (for example an early resign). */
  tooShort?: boolean;
}

export interface GameStats {
  game: ProgressGame;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  winStreak: number;
  bestStreak: number;
  xp: number;
  rank: { name: string; index: number; next: string | null; xpInRank: number; xpForNext: number | null };
  extra: Record<string, number>;
}

export interface ChallengeInfo {
  code: string;
  name: string;
  how: string;
  game: ProgressGame | null;
  progress: number;
  target: number;
  done: boolean;
  xp: number;
}

export interface CosmeticInfo {
  slot: CosmeticSlot;
  id: string;
  name: string;
  /** How you get it, in plain words. */
  how: string;
  unlocked: boolean;
  equipped: boolean;
}

export interface ProgressResponse {
  level: number;
  totalXp: number;
  xpInLevel: number;
  xpToNext: number;
  title: string | null;
  frame: string | null;
  stats: GameStats[];
  totals: { games: number; wins: number };
  achievements: (AchievementInfo & { unlocked: boolean; unlockedAt: string | null; progress: number; target: number })[];
  challenges: { day: string; resetsInMs: number; items: ChallengeInfo[] };
  cosmetics: CosmeticInfo[];
  rules: { finish: number; win: number; draw: number; minMoves: number; xp: Record<string, number> };
}
