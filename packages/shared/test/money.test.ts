import { describe, it, expect } from 'vitest';
import {
  CURRENCY,
  validStake,
  pvpFee,
  entryCost,
  outcomeSummary,
  botDrawRefund,
  parseAmount,
  formatAmount,
  formatNumber,
  formatBase,
  minorToBase,
  baseToMinor,
} from '../src/money';

describe('money rules', () => {
  it('pvp fee is 5% rounded down, with a per currency minimum', () => {
    expect(pvpFee(100, 'LOFI')).toBe(5);
    expect(pvpFee(500, 'LOFI')).toBe(25);
    expect(pvpFee(3000, 'LOFI')).toBe(150);
    expect(pvpFee(20, 'LOFI')).toBe(5);
    // SUI: 0.05 and 0.1 SUI round down to no fee, 1 SUI pays 0.05 SUI
    expect(pvpFee(5, 'SUI')).toBe(0);
    expect(pvpFee(10, 'SUI')).toBe(0);
    expect(pvpFee(50, 'SUI')).toBe(2);
    expect(pvpFee(100, 'SUI')).toBe(5);
  });
  it('entry costs per mode', () => {
    expect(entryCost('practice', 500, 'LOFI').total).toBe(0);
    expect(entryCost('bot', 500, 'LOFI')).toEqual({ stake: 500, fee: 0, total: 500 });
    expect(entryCost('pvp', 500, 'LOFI')).toEqual({ stake: 500, fee: 25, total: 525 });
    expect(entryCost('pvp', 100, 'SUI')).toEqual({ stake: 100, fee: 5, total: 105 });
  });
  it('summary cards', () => {
    expect(outcomeSummary('bot', 'chess', 1000, 2, 'LOFI')).toMatchObject({ ifWin: 2000, ifLose: 1000, ifDraw: 900 });
    expect(outcomeSummary('pvp', 'tichu', 1000, 4, 'LOFI')).toMatchObject({ ifWin: 2000, ifLose: 1050, ifDraw: null });
    expect(botDrawRefund(155)).toBe(139);
    // 90% of 0.05 SUI is 0.045, rounded down to 0.04 (disclosed)
    expect(outcomeSummary('bot', 'chess', 5, 2, 'SUI')).toMatchObject({ ifWin: 10, ifLose: 5, ifDraw: 4 });
  });
  it('parses and formats amounts with their coin', () => {
    expect(parseAmount('12.5')).toBe(1250);
    expect(parseAmount('7')).toBe(700);
    expect(parseAmount('0,05')).toBe(5);
    expect(parseAmount('1.234')).toBeNull();
    expect(parseAmount('abc')).toBeNull();
    expect(parseAmount('-1')).toBeNull();
    expect(formatNumber(123456)).toBe('1,234.56');
    expect(formatAmount(1250, 'LOFI')).toBe('12.50 LOFI');
    expect(formatAmount(5, 'SUI')).toBe('0.05 SUI');
    expect(formatAmount(-500, 'SUI')).toBe('-5.00 SUI');
    expect(formatAmount(500, 'LOFI', { sign: true })).toBe('+5.00 LOFI');
  });
  it('base unit conversion: 9 decimals, 1 minor = 10^7 base, via BigInt', () => {
    expect(minorToBase(100, 'LOFI')).toBe(1_000_000_000n);
    expect(minorToBase(5, 'SUI')).toBe(50_000_000n);
    expect(baseToMinor(1_000_000_000n, 'SUI')).toBe(100);
    // dust below 0.01 rounds down
    expect(baseToMinor(19_999_999n, 'LOFI')).toBe(1);
    expect(() => minorToBase(1.5, 'LOFI')).toThrow();
    expect(() => baseToMinor(-1n, 'LOFI')).toThrow();
    expect(formatBase(1_234_567_891n)).toBe('1.2345');
    expect(formatBase(2_000_000_000n)).toBe('2');
  });
  it('stake levels and caps are per currency', () => {
    expect(CURRENCY.LOFI.stakeLevels).toEqual([100, 1_000, 10_000, 50_000]);
    expect(CURRENCY.SUI.stakeLevels).toEqual([5, 10, 50, 100]);
    expect(validStake('practice', 0, 'LOFI')).toBeNull();
    expect(validStake('pvp', 100, 'LOFI')).toBeNull();
    expect(validStake('pvp', 100_000, 'LOFI')).toBeNull();
    expect(validStake('pvp', 100_001, 'LOFI')).toMatch(/biggest stake against people is 1,000.00 LOFI/);
    expect(validStake('bot', 50_001, 'LOFI')).toMatch(/against the bot/);
    expect(validStake('bot', 99, 'LOFI')).toMatch(/smallest stake is 1.00 LOFI/);
    expect(validStake('pvp', 12.5 as number, 'LOFI')).toMatch(/smallest/);
    expect(validStake('bot', 5, 'SUI')).toBeNull();
    expect(validStake('bot', 4, 'SUI')).toMatch(/0.05 SUI/);
    expect(validStake('bot', 101, 'SUI')).toMatch(/1.00 SUI/);
    // a LOFI sized stake is not a valid SUI stake
    expect(validStake('bot', 10_000, 'SUI')).not.toBeNull();
  });
});
