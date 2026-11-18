import { describe, it, expect } from 'vitest';
import { chessBotFor, chessEv, levelFor, logistic, levelElo, updateRating } from '../src/games/calibration';

describe('bot calibration', () => {
  it('chess bot hits the disclosed -5% expected return', () => {
    for (const r of [900, 1200, 1500, 1800, 2200]) {
      const s = chessBotFor(r);
      expect(s.expected.ev).toBeCloseTo(-0.05, 2);
      expect(s.expected.win).toBeGreaterThan(0.33);
      expect(s.expected.win).toBeLessThan(0.39);
    }
  });
  it('uses Elo limiting above 1320 and skill level below', () => {
    expect(chessBotFor(1600).uci.limitStrength).toBe(true);
    expect(chessBotFor(800).uci.limitStrength).toBe(false);
  });
  it('expected return falls as the engine gets stronger', () => {
    expect(chessEv(1500, 1400)).toBeGreaterThan(chessEv(1500, 1600));
  });
  it('backgammon and tichu level aims near 47.5%', () => {
    const l = levelFor(1500);
    expect(Math.abs(l.expectedWin - 0.475)).toBeLessThan(0.05);
    expect(logistic(1500, levelElo(l.level))).toBeCloseTo(l.expectedWin, 6);
  });
  it('rating updates move toward results', () => {
    expect(updateRating({ r: 1500, n: 0 }, 1500, 1).r).toBe(1520);
    expect(updateRating({ r: 1500, n: 30 }, 1500, 0).r).toBe(1490);
  });
});
