/**
 * Money rules shared by server and web. All amounts are integers in minor units:
 * 1 credit = 100 minor units, 1 test USDC = 100 credits = 10_000 minor units.
 * The token has 6 decimals, so 1 minor unit = 100 token base units.
 */
export const MINOR_PER_CREDIT = 100;
export const TOKEN_DECIMALS = 6;
export const TOKEN_BASE_PER_MINOR = BigInt(100);

export type Mode = 'practice' | 'bot' | 'pvp';
export type GameKind = 'chess' | 'backgammon' | 'tichu' | 'seabattle';

/** Quick pick stakes in minor units: 1, 10, 100, 1,000 and 5,000 credits ($0.01, $0.10, $1, $10, $50). */
export const STAKE_LEVELS = [100, 1_000, 10_000, 100_000, 500_000] as const;
/** Any stake between these is allowed (minor units). */
export const MIN_STAKE = 100; // 1 credit
export const MAX_STAKE_PVP = 1_000_000; // 10,000 credits = $100
export const MAX_STAKE_BOT = 500_000; // 5,000 credits = $50
/** A single bot game may never risk more than this share of the house bankroll. */
export const BOT_MAX_BANKROLL_SHARE = 0.01;

export const maxStake = (mode: 'practice' | 'bot' | 'pvp') => (mode === 'bot' ? MAX_STAKE_BOT : mode === 'pvp' ? MAX_STAKE_PVP : 0);
export function validStake(mode: 'practice' | 'bot' | 'pvp', stake: number): string | null {
  if (mode === 'practice') return null;
  if (!Number.isSafeInteger(stake) || stake < MIN_STAKE) return 'The smallest stake is 1 credit.';
  if (stake > maxStake(mode)) return `The biggest stake ${mode === 'bot' ? 'against the bot' : 'against people'} is ${formatCredits(maxStake(mode)).replace('.00', '')} credits (${usd(maxStake(mode))}).`;
  return null;
}
/** Dollar value of credits: 1 USDC = 100 credits. */
export function usd(minor: number): string {
  const d = minor / 10_000;
  return `$${d >= 1 ? d.toLocaleString('en-US', { maximumFractionDigits: 2 }) : d.toFixed(2)}`;
}

/** Disclosed house edge against the bot: expected return -5% of the stake. */
export const BOT_HOUSE_EDGE = 0.05;
/** Chess draw against the bot returns 90% of the stake. */
export const BOT_CHESS_DRAW_RETURN_BPS = 9000;
/** Player vs player fee: 5% of the stake, minimum 0.05 credits (5 minor). */
export const PVP_FEE_BPS = 500;
export const PVP_FEE_MIN = 5;

export function pvpFee(stake: number): number {
  assertMinor(stake);
  return Math.max(PVP_FEE_MIN, Math.floor((stake * PVP_FEE_BPS) / 10_000));
}

export function assertMinor(n: number): void {
  if (!Number.isSafeInteger(n) || n < 0) throw new Error('amount must be a non-negative safe integer');
}

/** What a player pays to sit down. */
export function entryCost(mode: Mode, stake: number): { stake: number; fee: number; total: number } {
  if (mode === 'practice') return { stake: 0, fee: 0, total: 0 };
  const fee = mode === 'pvp' ? pvpFee(stake) : 0;
  return { stake, fee, total: stake + fee };
}

/** Chess draw vs bot refund, rounded down to the minor unit (disclosed). */
export function botDrawRefund(stake: number): number {
  return Math.floor((stake * BOT_CHESS_DRAW_RETURN_BPS) / 10_000);
}

/** Possible outcomes shown on the summary card before a game. Per human player. */
export function outcomeSummary(mode: Mode, game: GameKind, stake: number, players: number) {
  const { fee, total } = entryCost(mode, stake);
  if (mode === 'practice') return { youPut: 0, fee: 0, ifWin: 0, ifLose: 0, ifDraw: null as number | null };
  if (mode === 'bot') {
    return { youPut: stake, fee, ifWin: stake * 2, ifLose: total, ifDraw: game === 'chess' ? botDrawRefund(stake) : null };
  }
  // pvp: pot = stake * players, split across the winning side
  const winnersPerSide = game === 'tichu' ? 2 : 1;
  const pot = stake * players;
  return { youPut: stake, fee, ifWin: Math.floor(pot / winnersPerSide), ifLose: total, ifDraw: game === 'chess' ? stake : null };
}

export function formatCredits(minor: number | bigint, opts: { sign?: boolean } = {}): string {
  const n = typeof minor === 'bigint' ? Number(minor) : minor;
  const s = (Math.abs(n) / MINOR_PER_CREDIT).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (n < 0) return `-${s}`;
  return opts.sign && n > 0 ? `+${s}` : s;
}

/** Parse "12.34" style user input into minor units. Returns null if invalid. */
export function parseCredits(input: string): number | null {
  const m = /^\s*(\d{1,9})(?:[.,](\d{1,2}))?\s*$/.exec(input);
  if (!m) return null;
  const whole = Number(m[1]);
  const frac = m[2] ? Number(m[2].padEnd(2, '0')) : 0;
  return whole * MINOR_PER_CREDIT + frac;
}

export const minorToTokenBase = (minor: number): bigint => BigInt(minor) * TOKEN_BASE_PER_MINOR;
export const tokenBaseToMinor = (base: bigint): number => Number(base / TOKEN_BASE_PER_MINOR);
