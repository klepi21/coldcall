import { describe, it, expect } from 'vitest';
import { validStake, usd, pvpFee, entryCost, outcomeSummary, botDrawRefund, parseCredits, formatCredits, minorToTokenBase, tokenBaseToMinor } from '../src/money';

describe('money rules', () => {
  it('pvp fee is 5% with a 0.05 minimum', () => {
    expect(pvpFee(100)).toBe(5);
    expect(pvpFee(500)).toBe(25);
    expect(pvpFee(3000)).toBe(150);
    expect(pvpFee(20)).toBe(5);
  });
  it('entry costs per mode', () => {
    expect(entryCost('practice', 500).total).toBe(0);
    expect(entryCost('bot', 500)).toEqual({ stake: 500, fee: 0, total: 500 });
    expect(entryCost('pvp', 500)).toEqual({ stake: 500, fee: 25, total: 525 });
  });
  it('summary cards', () => {
    expect(outcomeSummary('bot', 'chess', 1000, 2)).toMatchObject({ ifWin: 2000, ifLose: 1000, ifDraw: 900 });
    expect(outcomeSummary('pvp', 'tichu', 1000, 4)).toMatchObject({ ifWin: 2000, ifLose: 1050, ifDraw: null });
    expect(botDrawRefund(155)).toBe(139);
  });
  it('parses and formats credits', () => {
    expect(parseCredits('12.5')).toBe(1250);
    expect(parseCredits('7')).toBe(700);
    expect(parseCredits('1.234')).toBeNull();
    expect(parseCredits('abc')).toBeNull();
    expect(formatCredits(123456)).toBe('1,234.56');
    expect(formatCredits(-500)).toBe('-5.00');
  });
  it('token conversion: 1 USDC = 100 credits = 10,000 minor', () => {
    expect(minorToTokenBase(10_000)).toBe(1_000_000n);
    expect(tokenBaseToMinor(1_000_000n)).toBe(10_000);
  });
  it('custom stakes and caps', () => {
    expect(validStake('practice', 0)).toBeNull();
    expect(validStake('pvp', 100)).toBeNull();
    expect(validStake('pvp', 1_000_000)).toBeNull();
    expect(validStake('pvp', 1_000_001)).toMatch(/biggest stake/);
    expect(validStake('bot', 500_001)).toMatch(/against the bot/);
    expect(validStake('bot', 99)).toMatch(/smallest/);
    expect(validStake('pvp', 12.5 as number)).toMatch(/smallest/);
    expect(usd(100_000)).toBe('$10');
    expect(usd(100)).toBe('$0.01');
  });
});
