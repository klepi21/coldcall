/**
 * Money rules shared by server and web.
 *
 * Cold Call has two currencies, LOFI (a devnet test coin) and SUI. They are never converted into each
 * other: every balance, table, fee, limit and reserve check belongs to exactly one currency.
 *
 * All amounts are integers in minor units: 1 minor unit = 0.01 coin. Both coins have 9 decimals on chain,
 * so 1 minor unit = 10^7 base units. Conversions to and from base units always go through BigInt.
 */

export const CURRENCIES = ['LOFI', 'SUI'] as const;
export type Currency = (typeof CURRENCIES)[number];
export const DEFAULT_CURRENCY: Currency = 'LOFI';
export const isCurrency = (v: unknown): v is Currency => v === 'LOFI' || v === 'SUI';

export const MINOR_PER_COIN = 100;
export const COIN_DECIMALS = 9;
export const BASE_PER_MINOR = 10_000_000n;

export type Mode = 'practice' | 'bot' | 'pvp';
export type GameKind = 'chess' | 'backgammon' | 'tichu' | 'seabattle';

export interface CurrencyRules {
  code: Currency;
  /** Name shown to players. */
  name: string;
  /** Chip icon in /brand, with a text fallback in the UI. */
  chip: string;
  /** Quick pick stakes in minor units. */
  stakeLevels: readonly number[];
  minStake: number;
  maxStakePvp: number;
  maxStakeBot: number;
  /** Smallest people game fee in minor units. 0 means the 5% rounds down to nothing at tiny stakes. */
  feeMin: number;
  /** Smallest cash out and the most added in one go (minor units). */
  minWithdraw: number;
  maxDeposit: number;
  /** Per player daily cash out limit, and the amount above which a cash out waits for a review. */
  withdrawDaily: number;
  withdrawReviewAbove: number;
}

export const CURRENCY: Record<Currency, CurrencyRules> = {
  LOFI: {
    code: 'LOFI',
    name: 'LOFI (devnet test)',
    chip: '/brand/lofi-chip.png',
    stakeLevels: [100, 1_000, 10_000, 50_000], // 1, 10, 100, 500 LOFI
    minStake: 100, // 1 LOFI
    maxStakePvp: 100_000, // 1,000 LOFI
    maxStakeBot: 50_000, // 500 LOFI
    feeMin: 5, // 0.05 LOFI, which is exactly 5% of the smallest stake
    minWithdraw: 100, // 1 LOFI
    maxDeposit: 10_000_000, // 100,000 LOFI
    withdrawDaily: 2_000_000, // 20,000 LOFI
    withdrawReviewAbove: 1_000_000, // 10,000 LOFI
  },
  SUI: {
    code: 'SUI',
    name: 'SUI (devnet)',
    chip: '/brand/sui-chip.png',
    stakeLevels: [5, 10, 50, 100], // 0.05, 0.1, 0.5, 1 SUI
    minStake: 5, // 0.05 SUI
    maxStakePvp: 200, // 2 SUI
    maxStakeBot: 100, // 1 SUI
    feeMin: 0, // 5% rounded down to 0.01 SUI, so 0.05 and 0.1 SUI tables have no fee
    minWithdraw: 5, // 0.05 SUI
    maxDeposit: 100_000, // 1,000 SUI
    withdrawDaily: 5_000, // 50 SUI
    withdrawReviewAbove: 2_000, // 20 SUI
  },
};

export const rules = (c: Currency) => CURRENCY[c];

/** A single bot game may never risk more than this share of the house bankroll of that currency. */
export const BOT_MAX_BANKROLL_SHARE_BPS = 100; // 1%
export const BOT_MAX_BANKROLL_SHARE = BOT_MAX_BANKROLL_SHARE_BPS / 10_000;

export const maxStake = (mode: Mode, c: Currency) =>
  mode === 'bot' ? CURRENCY[c].maxStakeBot : mode === 'pvp' ? CURRENCY[c].maxStakePvp : 0;

export function validStake(mode: Mode, stake: number, c: Currency): string | null {
  if (mode === 'practice') return null;
  const r = CURRENCY[c];
  if (!Number.isSafeInteger(stake) || stake < r.minStake) return `The smallest stake is ${formatAmount(r.minStake, c)}.`;
  if (stake > maxStake(mode, c))
    return `The biggest stake ${mode === 'bot' ? 'against the bot' : 'against people'} is ${formatAmount(maxStake(mode, c), c)}.`;
  return null;
}

/** Disclosed house edge against the bot: expected return -5% of the stake. */
export const BOT_HOUSE_EDGE = 0.05;
/** Chess draw against the bot returns 90% of the stake, rounded down to 0.01. */
export const BOT_CHESS_DRAW_RETURN_BPS = 9000;
/** Player vs player fee: 5% of the stake, rounded down to 0.01, never below the currency minimum. */
export const PVP_FEE_BPS = 500;

export function pvpFee(stake: number, c: Currency): number {
  assertMinor(stake);
  return Math.max(CURRENCY[c].feeMin, Math.floor((stake * PVP_FEE_BPS) / 10_000));
}

export function assertMinor(n: number): void {
  if (!Number.isSafeInteger(n) || n < 0) throw new Error('amount must be a non-negative safe integer');
}

/** What a player pays to sit down. */
export function entryCost(mode: Mode, stake: number, c: Currency): { stake: number; fee: number; total: number } {
  if (mode === 'practice') return { stake: 0, fee: 0, total: 0 };
  const fee = mode === 'pvp' ? pvpFee(stake, c) : 0;
  return { stake, fee, total: stake + fee };
}

/** Chess draw vs bot refund, rounded down to the minor unit (disclosed). */
export function botDrawRefund(stake: number): number {
  return Math.floor((stake * BOT_CHESS_DRAW_RETURN_BPS) / 10_000);
}

/** Possible outcomes shown on the summary card before a game. Per human player. */
export function outcomeSummary(mode: Mode, game: GameKind, stake: number, players: number, c: Currency) {
  const { fee, total } = entryCost(mode, stake, c);
  if (mode === 'practice') return { youPut: 0, fee: 0, ifWin: 0, ifLose: 0, ifDraw: null as number | null };
  if (mode === 'bot') {
    return { youPut: stake, fee, ifWin: stake * 2, ifLose: total, ifDraw: game === 'chess' ? botDrawRefund(stake) : null };
  }
  // pvp: pot = stake * players, split across the winning side
  const winnersPerSide = game === 'tichu' ? 2 : 1;
  const pot = stake * players;
  return { youPut: stake, fee, ifWin: Math.floor(pot / winnersPerSide), ifLose: total, ifDraw: game === 'chess' ? stake : null };
}

/** "1,234.56" without the coin code. Use next to a chip icon. */
export function formatNumber(minor: number | bigint, opts: { sign?: boolean } = {}): string {
  const n = typeof minor === 'bigint' ? Number(minor) : minor;
  const s = (Math.abs(n) / MINOR_PER_COIN).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (n < 0) return `-${s}`;
  return opts.sign && n > 0 ? `+${s}` : s;
}

/** "12.50 LOFI". Every amount on screen carries its coin. */
export function formatAmount(minor: number | bigint, c: Currency, opts: { sign?: boolean } = {}): string {
  return `${formatNumber(minor, opts)} ${c}`;
}

/** Parse "12.34" style user input into minor units. Returns null if invalid. */
export function parseAmount(input: string, _c?: Currency): number | null {
  const m = /^\s*(\d{1,9})(?:[.,](\d{1,2}))?\s*$/.exec(input);
  if (!m) return null;
  const whole = Number(m[1]);
  const frac = m[2] ? Number(m[2].padEnd(2, '0')) : 0;
  return whole * MINOR_PER_COIN + frac;
}

/** Minor units to on-chain base units (9 decimals). Both coins share the scale, the currency is explicit anyway. */
export const minorToBase = (minor: number, _c: Currency): bigint => {
  assertMinor(minor);
  return BigInt(minor) * BASE_PER_MINOR;
};
/** Base units to minor units, rounded down. Dust below 0.01 coin stays in the vault. */
export const baseToMinor = (base: bigint, _c: Currency): number => {
  if (base < 0n) throw new Error('negative base amount');
  const m = base / BASE_PER_MINOR;
  if (m > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('amount too large');
  return Number(m);
};
/** Exact decimal string of base units, for display of wallet coins ("1.234567891"). */
export function formatBase(base: bigint, maxDecimals = 4): string {
  const neg = base < 0n;
  const b = neg ? -base : base;
  const whole = b / 10n ** BigInt(COIN_DECIMALS);
  const frac = (b % 10n ** BigInt(COIN_DECIMALS)).toString().padStart(COIN_DECIMALS, '0').slice(0, maxDecimals).replace(/0+$/, '');
  const w = whole.toLocaleString('en-US');
  return `${neg ? '-' : ''}${w}${frac ? `.${frac}` : ''}`;
}
