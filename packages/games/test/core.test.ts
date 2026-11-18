import { describe, it, expect } from 'vitest';
import { Rng, commitFor, chessEngine } from '../src/index';

describe('rng', () => {
  it('is deterministic and resumable', () => {
    const seed = 'ab'.repeat(32);
    const a = Rng.fromSeeds(seed, ['c1', 'c2']);
    const rolls = Array.from({ length: 100 }, () => a.die());
    const b = Rng.fromSeeds(seed, ['c1', 'c2']);
    expect(Array.from({ length: 100 }, () => b.die())).toEqual(rolls);
    const c = Rng.fromSeeds(seed, ['c1', 'c2']);
    for (let i = 0; i < 37; i++) c.die();
    const resumed = new Rng(c.state);
    expect(Array.from({ length: 63 }, () => resumed.die())).toEqual(rolls.slice(37));
    expect(rolls.every((r) => r >= 1 && r <= 6)).toBe(true);
    expect(commitFor(seed)).toHaveLength(64);
  });
  it('shuffle is a permutation', () => {
    const r = Rng.fromSeeds('01'.repeat(32), ['x']);
    const deck = Array.from({ length: 56 }, (_, i) => i);
    expect(r.shuffle(deck).sort((x, y) => x - y)).toEqual(deck);
  });
});

describe('chess', () => {
  it('plays fools mate', () => {
    const rng = Rng.fromSeeds('00'.repeat(32), []);
    let s = chessEngine.create({}, rng);
    for (const [seat, from, to] of [[0, 'f2', 'f3'], [1, 'e7', 'e5'], [0, 'g2', 'g4'], [1, 'd8', 'h4']] as const)
      s = chessEngine.applyMove(s, seat, { from, to }, rng);
    expect(chessEngine.result(s)).toEqual({ winners: [1], draw: false, reason: 'checkmate' });
  });
  it('rejects wrong turn and illegal moves', () => {
    const rng = Rng.fromSeeds('00'.repeat(32), []);
    const s = chessEngine.create({}, rng);
    expect(() => chessEngine.applyMove(s, 1, { from: 'e7', to: 'e5' }, rng)).toThrow();
    expect(() => chessEngine.applyMove(s, 0, { from: 'e2', to: 'e5' }, rng)).toThrow();
    expect(chessEngine.legalMoves(s, 0)).toHaveLength(20);
  });
});
