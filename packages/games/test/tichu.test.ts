import { describe, it, expect } from 'vitest';
import { Rng } from '../src/rng';
import { IllegalMoveError } from '../src/types';
import { tichuEngine, describeCombo, whyInvalid, type TichuState, type TichuMove } from '../src/tichu';
import { analyze, beats, interpret, fullDeck, sumPoints, cardPoints, type CardId } from '../src/tichu-combos';
import { tichuBot, tichuBotInterrupt } from '../src/tichu-bot';

const rngOf = (seed = '00', tag = 'x') => Rng.fromSeeds(seed.padEnd(64, '0'), [tag]);

/** A play-phase state with the given hands (other fields reset). */
function playState(hands: CardId[][], turn = 0): TichuState {
  const s = tichuEngine.create({}, rngOf());
  return {
    ...s,
    phase: 'play',
    hands: hands.map((h) => [...h]),
    undealt: [[], [], [], []],
    grand: [false, false, false, false],
    passes: [[], [], [], []],
    turn,
  };
}

const apply = (s: TichuState, seat: number, m: TichuMove) => tichuEngine.applyMove(s, seat, m, rngOf('11', 'deal'));
const play = (s: TichuState, seat: number, cards: CardId[], extra: Partial<{ phoenixAs: number; wish: number }> = {}) =>
  apply(s, seat, { type: 'play', cards, ...extra });
const pass = (s: TichuState, seat: number) => apply(s, seat, { type: 'pass' });

function countCards(s: TichuState): number {
  return (
    s.hands.flat().length +
    s.undealt.flat().length +
    s.won.flat().length +
    s.trick.flatMap((p) => p.cards).length +
    (s.dragon?.cards.length ?? 0)
  );
}

describe('tichu deck', () => {
  it('has 56 unique cards worth 100 points', () => {
    const d = fullDeck();
    expect(d).toHaveLength(56);
    expect(new Set(d).size).toBe(56);
    expect(sumPoints(d)).toBe(100);
    expect(['MAHJONG', 'DOG', 'PHOENIX', 'DRAGON'].every((c) => d.includes(c))).toBe(true);
    expect(cardPoints('S5') + cardPoints('H10') + cardPoints('DK') + cardPoints('DRAGON') + cardPoints('PHOENIX')).toBe(25);
  });

  it('deals 8, opens the Grand Tichu window, then deals 6 and passes', () => {
    let s = tichuEngine.create({ targetScore: 300 }, rngOf('aa'));
    expect(s.phase).toBe('grand');
    expect(s.hands.every((h) => h.length === 8)).toBe(true);
    expect(tichuEngine.toAct(s)).toEqual([0, 1, 2, 3]);
    const v = tichuEngine.publicView(s, 1);
    expect(v.hand).toHaveLength(8);
    expect(JSON.stringify(v)).not.toContain(s.undealt[1]![0]!);
    for (const seat of [0, 1, 2, 3]) s = apply(s, seat, { type: 'grand', call: seat === 2 });
    expect(s.phase).toBe('passing');
    expect(s.hands.every((h) => h.length === 14)).toBe(true);
    expect(s.grand).toEqual([false, false, true, false]);
    expect(() => apply(s, 2, { type: 'tichu' })).toThrow(IllegalMoveError);
    s = apply(s, 0, { type: 'tichu' });
    expect(s.tichu[0]).toBe(true);
    const sent: CardId[][] = [];
    for (const seat of [0, 1, 2, 3]) {
      const h = s.hands[seat]!;
      const cards = [h[0]!, h[1]!, h[2]!] as [CardId, CardId, CardId];
      sent.push(cards);
      s = apply(s, seat, { type: 'pass_cards', cards });
      if (seat < 3) expect(tichuEngine.toAct(s)).toEqual([0, 1, 2, 3].filter((x) => x > seat));
    }
    expect(s.phase).toBe('play');
    expect(s.hands.every((h) => h.length === 14)).toBe(true);
    expect(s.hands[1]).toContain(sent[0]![0]); // left of 0 is 1
    expect(s.hands[2]).toContain(sent[0]![1]); // partner
    expect(s.hands[3]).toContain(sent[0]![2]); // right
    expect(s.hands[s.turn]).toContain('MAHJONG');
    const view = tichuEngine.publicView(s, 2);
    expect(view.received).toHaveLength(3);
    expect(view.hand).toHaveLength(14);
    const spec = tichuEngine.publicView(s, -1);
    expect(spec.hand).toEqual([]);
    expect(spec.received).toBeNull();
    expect(spec.handCounts).toEqual([14, 14, 14, 14]);
  });
});

describe('tichu combinations', () => {
  it('detects basic combinations', () => {
    expect(describeCombo(['S7'])).toBe('Single 7');
    expect(describeCombo(['S7', 'H7'])).toBe('Pair of 7s');
    expect(describeCombo(['S7', 'H7', 'D7'])).toBe('Three 7s');
    expect(describeCombo(['S7', 'H7', 'D7', 'S9', 'H9'])).toBe('Full house, 7s high');
    expect(describeCombo(['MAHJONG', 'S2', 'H3', 'D4', 'C5', 'S6'])).toBe('Straight of 6');
    expect(describeCombo(['S4', 'H4', 'S5', 'H5', 'D6', 'C6'])).toBe('3 consecutive pairs');
    expect(describeCombo(['S9', 'H9', 'D9', 'C9'])).toBe('Bomb, four 9s');
    expect(describeCombo(['S3', 'S4', 'S5', 'S6', 'S7'])).toBe('Bomb, straight flush of 5');
    expect(describeCombo(['S3', 'H5'])).toBeNull();
    expect(describeCombo(['S4', 'H4', 'S6', 'H6'])).toBeNull();
    expect(describeCombo(['DOG', 'S3'])).toBeNull();
    expect(describeCombo(['DRAGON', 'S3'])).toBeNull();
    expect(describeCombo(['S9', 'H9', 'D9', 'PHOENIX'])).toBeNull(); // no Phoenix in bombs
  });

  it('uses the Phoenix as a wildcard in straights, full houses and pairs', () => {
    const st = analyze(['S3', 'H4', 'D5', 'C6', 'PHOENIX']);
    expect(st.map((c) => [c.type, c.rank])).toEqual([
      ['straight', 7],
      ['straight', 6],
    ]);
    const gap = analyze(['S3', 'H4', 'C6', 'D7', 'PHOENIX']);
    expect(gap).toEqual([{ type: 'straight', rank: 7, length: 5, phoenixAs: 5 }]);
    const fh = analyze(['S5', 'H5', 'S6', 'H6', 'PHOENIX']);
    expect(fh.map((c) => c.rank)).toEqual([6, 5]);
    expect(fh.every((c) => c.type === 'full_house')).toBe(true);
    expect(analyze(['SQ', 'PHOENIX'])).toEqual([{ type: 'pair', rank: 12, length: 2, phoenixAs: 12 }]);
    expect(analyze(['S8', 'H8', 'D9', 'PHOENIX'])[0]).toMatchObject({ type: 'pair_run', rank: 9, length: 4 });
    expect(analyze(['MAHJONG', 'PHOENIX'])).toEqual([]);
  });

  it('compares combinations and bombs', () => {
    const c = (cards: CardId[]) => analyze(cards)[0]!;
    expect(beats(c(['S8', 'H8']), c(['S7', 'D7']))).toBe(true);
    expect(beats(c(['S8', 'H8']), c(['S9', 'D9']))).toBe(false);
    expect(beats(c(['S8', 'H8']), c(['S9']))).toBe(false);
    const st5 = c(['S2', 'H3', 'D4', 'C5', 'S6']);
    expect(beats(c(['H3', 'D4', 'C5', 'S6', 'H7']), st5)).toBe(true);
    expect(beats(c(['H3', 'D4', 'C5', 'S6', 'H7', 'D8']), st5)).toBe(false);
    const four9 = c(['S9', 'H9', 'D9', 'C9']);
    const four4 = c(['S4', 'H4', 'D4', 'C4']);
    const sf5 = c(['S3', 'S4', 'S5', 'S6', 'S7']);
    const sf5h = c(['H4', 'H5', 'H6', 'H7', 'H8']);
    const sf6 = c(['D2', 'D3', 'D4', 'D5', 'D6', 'D7']);
    expect(beats(four4, c(['DRAGON']))).toBe(true);
    expect(beats(four9, four4)).toBe(true);
    expect(beats(four4, four9)).toBe(false);
    expect(beats(sf5, four9)).toBe(true);
    expect(beats(four9, sf5)).toBe(false);
    expect(beats(sf5h, sf5)).toBe(true);
    expect(beats(sf6, sf5h)).toBe(true);
    expect(beats(st5, four4)).toBe(false);
  });

  it('values the Phoenix single half a rank above the table', () => {
    expect(interpret(['PHOENIX'], null)[0]!.rank).toBe(1.5);
    const king = analyze(['SK'])[0]!;
    const p = interpret(['PHOENIX'], king)[0]!;
    expect(p.rank).toBe(13.5);
    expect(beats(p, king)).toBe(true);
    expect(beats(analyze(['SA'])[0]!, p)).toBe(true);
    const dragon = analyze(['DRAGON'])[0]!;
    expect(beats(interpret(['PHOENIX'], dragon)[0]!, dragon)).toBe(false);
    expect(beats(dragon, p)).toBe(true);

    let s = playState([['SK', 'S2'], ['PHOENIX', 'S3'], ['DRAGON', 'H2'], ['SA', 'H3']]);
    s = play(s, 0, ['SK']);
    s = play(s, 1, ['PHOENIX']);
    expect(s.trick[1]!.combo.rank).toBe(13.5);
    s = play(s, 2, ['DRAGON']);
    expect(whyInvalid(s, 3, ['SA'])).toBe('That does not beat the Dragon on the table.');

    const s2 = playState([['DRAGON', 'S2'], ['PHOENIX', 'S3'], ['H2'], ['H3']]);
    const s3 = play(s2, 0, ['DRAGON']);
    expect(whyInvalid(s3, 1, ['PHOENIX'])).toBe('The Phoenix cannot beat the Dragon.');
  });
});

describe('tichu play rules', () => {
  it('gives the Dragon trick to an opponent of the winner choice', () => {
    let s = playState([['DRAGON', 'S2'], ['S3', 'S4'], ['S5', 'S6'], ['S7', 'S8']]);
    s = play(s, 0, ['DRAGON']);
    s = pass(s, 1);
    s = pass(s, 2);
    s = pass(s, 3);
    expect(s.phase).toBe('dragon');
    expect(tichuEngine.toAct(s)).toEqual([0]);
    expect(tichuEngine.legalMoves(s, 0)).toEqual([
      { type: 'give_dragon', to: 1 },
      { type: 'give_dragon', to: 3 },
    ]);
    expect(() => apply(s, 0, { type: 'give_dragon', to: 2 })).toThrow(/opponents/);
    expect(() => apply(s, 1, { type: 'give_dragon', to: 3 })).toThrow();
    s = apply(s, 0, { type: 'give_dragon', to: 3 });
    expect(s.won[3]).toEqual(['DRAGON']);
    expect(s.phase).toBe('play');
    expect(s.turn).toBe(0);
  });

  it('Dog passes the lead to the partner, or the next active seat if the partner is out', () => {
    let s = playState([['DOG', 'S2'], ['S3', 'S4'], ['S5', 'S6'], ['S7', 'S8']]);
    expect(whyInvalid(play(s, 0, ['S2']), 1, ['S3'])).toBeNull();
    s = play(s, 0, ['DOG']);
    expect(s.turn).toBe(2);
    expect(s.trick).toEqual([]);
    const t = playState([['DOG', 'S2'], ['S3', 'S4'], [], ['S7', 'S8']]);
    t.out = [2];
    expect(play(t, 0, ['DOG']).turn).toBe(3);
    const u = playState([['S2', 'S9'], ['S3', 'DOG'], ['S5'], ['S7', 'S8']]);
    expect(whyInvalid(play(u, 0, ['S2']), 1, ['DOG'])).toBe('The Dog can only be played as a lead.');
  });

  it('lets bombs be played out of turn and ranks bomb over bomb', () => {
    let s = playState([
      ['S7', 'S2'],
      ['S3', 'SA'],
      ['S9', 'H9', 'D9', 'C9', 'H2'],
      ['H4', 'H5', 'H6', 'H7', 'H8', 'D2'],
    ]);
    s.hands[1]!.push('S4', 'H3', 'D4', 'C4');
    s = play(s, 0, ['S7']);
    expect(s.turn).toBe(1);
    expect(whyInvalid(s, 2, ['H2'])).toBe('It is not your turn. Only a bomb can be played out of turn.');
    const outOfTurn = tichuEngine.legalMoves(s, 2).filter((m) => m.type !== 'tichu');
    expect(outOfTurn).toEqual([{ type: 'play', cards: ['S9', 'H9', 'D9', 'C9'] }]);
    s = play(s, 2, ['S9', 'H9', 'D9', 'C9']);
    expect(s.topSeat).toBe(2);
    expect(s.turn).toBe(3);
    expect(whyInvalid(s, 1, ['SA'])).toMatch(/It is not your turn/);
    s = play(s, 3, ['H4', 'H5', 'H6', 'H7', 'H8']);
    expect(s.topSeat).toBe(3);
    expect(s.turn).toBe(0);
    s = pass(s, 0);
    s = pass(s, 1);
    s = pass(s, 2);
    expect(s.tricksTaken[3]).toBe(1);
    expect(s.turn).toBe(3);
    const empty = playState([['S2'], ['S9', 'H9', 'D9', 'C9'], ['S3'], ['S4']]);
    expect(whyInvalid(empty, 1, ['S9', 'H9', 'D9', 'C9'])).toBe('You can only bomb out of turn while cards are on the table.');
  });

  it('enforces the Mahjong wish', () => {
    let s = playState([
      ['MAHJONG', 'S2'],
      ['S7', 'S9', 'H3'],
      ['H5', 'H6'],
      ['D5', 'D6'],
    ]);
    s = play(s, 0, ['MAHJONG'], { wish: 7 });
    expect(s.wish).toBe(7);
    expect(() => pass(s, 1)).toThrow(/You must play a 7 because of the Mahjong wish\./);
    expect(whyInvalid(s, 1, ['S9'])).toBe('You must play a 7 because of the Mahjong wish.');
    expect(tichuEngine.legalMoves(s, 1).filter((m) => m.type !== 'tichu')).toEqual([{ type: 'play', cards: ['S7'] }]);
    s = play(s, 1, ['S7']);
    expect(s.wish).toBeNull();
    // When the wished rank cannot beat the table, passing is fine and the wish stays.
    let t = playState([['MAHJONG', 'S2'], ['H9', 'H3'], ['S7', 'H5'], ['D5', 'D6']]);
    t = play(t, 0, ['MAHJONG'], { wish: 7 });
    t = play(t, 1, ['H9']);
    t = pass(t, 2);
    expect(t.wish).toBe(7);
    let p = playState([['H8', 'S8', 'S2'], ['H3', 'D3'], ['H5'], ['D5']]);
    p = play(p, 0, ['H8', 'S8']);
    expect(whyInvalid(p, 1, ['H3', 'D3'])).toBe('That does not beat the pair on the table.');
    // A leader holding the wished rank must lead it.
    const u = { ...playState([['S2'], ['S7', 'S9'], ['H5'], ['D5']], 1), wish: 7 };
    expect(whyInvalid(u, 1, ['S9'])).toBe('You must play a 7 because of the Mahjong wish.');
    expect(whyInvalid(u, 1, ['S7'])).toBeNull();
    // Bombs are not forced: the only 7s are in a bomb, so passing is allowed.
    let w = playState([['MAHJONG', 'S2'], ['S7', 'H7', 'D7', 'C7', 'S3'], ['H5'], ['D5']]);
    w = play(w, 0, ['MAHJONG'], { wish: 7 });
    expect(whyInvalid(w, 1, ['S3'])).toBe('You must play a 7 because of the Mahjong wish.');
    expect(() => pass(w, 1)).toThrow();
    // Over a Queen only the bomb could carry a 7, and bombs are not forced.
    let x = playState([['S2', 'MAHJONG'], ['SQ', 'S4'], ['S7', 'H7', 'D7', 'C7', 'S3'], ['D5']]);
    x = play(x, 0, ['MAHJONG'], { wish: 7 });
    x = play(x, 1, ['SQ']);
    expect(whyInvalid(x, 2, ['S3'])).toBe('That does not beat the single on the table.');
    expect(tichuEngine.legalMoves(x, 2)).toContainEqual({ type: 'pass' });
    x = pass(x, 2);
    expect(x.wish).toBe(7);
  });

  it('scores a double victory at 200 with no card counting, plus Tichu', () => {
    let s = playState([['S2'], ['S4', 'SK', 'S5'], ['S3'], ['S8', 'H10']]);
    s = apply(s, 0, { type: 'tichu' });
    s = play(s, 0, ['S2']);
    expect(s.out).toEqual([0]);
    expect(() => apply(s, 0, { type: 'tichu' })).toThrow();
    s = pass(s, 1);
    s = play(s, 2, ['S3']);
    expect(s.rounds).toHaveLength(1);
    const r = s.rounds[0]!;
    expect(r.doubleVictory).toBe(0);
    expect(r.cardPoints).toEqual([200, 0]);
    expect(r.bonus).toEqual([100, 0]);
    expect(s.scores).toEqual([300, 0]);
    expect(s.round).toBe(2);
    expect(s.phase).toBe('grand');
  });

  it('counts card points to 100: last player hand to opponents, tricks to the first out', () => {
    const inPlay = ['S10', 'HA', 'SK', 'DRAGON', 'DK', 'D5', 'S3'];
    let s = playState([['S10'], ['HA'], ['SK', 'DRAGON'], ['DK', 'D5', 'S3']]);
    s.won[1] = fullDeck().filter((c) => !inPlay.includes(c)); // earlier tricks, worth 40
    s.grand = [false, true, false, false];
    s = play(s, 0, ['S10']); // out first
    s = play(s, 1, ['HA']); // out second
    s = play(s, 2, ['DRAGON']);
    s = pass(s, 3);
    expect(s.phase).toBe('dragon');
    s = apply(s, 2, { type: 'give_dragon', to: 3 }); // S10 HA DRAGON = 35 to seat 3
    expect(s.turn).toBe(2);
    s = play(s, 2, ['SK']); // out third, round over, seat 3 is last
    const r = s.rounds[0]!;
    expect(r.doubleVictory).toBeNull();
    expect(r.order).toEqual([0, 1, 2, 3]);
    // Seat 3 tricks (35) go to seat 0, seat 3 hand (DK D5 = 15) to team 0, SK trick (10) to seat 2.
    expect(r.cardPoints).toEqual([60, 40]);
    expect(r.cardPoints[0] + r.cardPoints[1]).toBe(100);
    expect(r.bonus).toEqual([0, -200]);
    expect(s.scores).toEqual([60, -160]);
  });
});

function runMatch(seed: string, target: number, interrupts = true) {
  const rng = Rng.fromSeeds(seed, ['deal']);
  const botRng = Rng.fromSeeds(seed, ['bots']);
  let s = tichuEngine.create({ targetScore: target }, rng);
  const levels = [10, 3, 7, 0];
  let steps = 0;
  while (!tichuEngine.result(s)) {
    const act = tichuEngine.toAct(s);
    expect(act.length).toBeGreaterThan(0);
    const seat = act[0]!;
    const m = tichuBot({ state: s, seat, level: levels[seat]!, rng: botRng });
    const before = s.round;
    s = tichuEngine.applyMove(s, seat, m, rng);
    if (s.round === before && !tichuEngine.result(s)) expect(countCards(s)).toBe(56);
    if (interrupts && s.phase === 'play') {
      for (const o of [0, 1, 2, 3]) {
        if (o === s.turn) continue;
        const b = tichuBotInterrupt({ state: s, seat: o, level: levels[o]!, rng: botRng });
        if (b) s = tichuEngine.applyMove(s, o, b, rng);
        if (s.phase !== 'play') break;
      }
    }
    if (++steps > 20000) throw new Error('match did not finish');
  }
  return s;
}

describe('tichu full matches', () => {
  it('is deterministic for the same seeds', () => {
    const a = runMatch('ab'.repeat(32), 300);
    const b = runMatch('ab'.repeat(32), 300);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const c = runMatch('cd'.repeat(32), 300);
    expect(JSON.stringify(c)).not.toBe(JSON.stringify(a));
  });

  it('plays 100 bot matches to a valid result', () => {
    let rounds = 0;
    for (let i = 0; i < 100; i++) {
      const seed = (i.toString(16).padStart(2, '0') + 'f1').repeat(16);
      const s = runMatch(seed, 300);
      const res = tichuEngine.result(s)!;
      const sc = res.score as { team0: number; team1: number };
      expect(res.reason).toBe('score_limit');
      expect(sc.team0).not.toBe(sc.team1);
      expect(Math.max(sc.team0, sc.team1)).toBeGreaterThanOrEqual(300);
      const winTeam = sc.team0 > sc.team1 ? 0 : 1;
      expect(res.winners).toEqual(winTeam === 0 ? [0, 2] : [1, 3]);
      let t0 = 0;
      let t1 = 0;
      for (const r of s.rounds) {
        if (r.doubleVictory === null) expect(r.cardPoints[0] + r.cardPoints[1]).toBe(100);
        else expect(r.cardPoints[r.doubleVictory]).toBe(200);
        t0 += r.total[0];
        t1 += r.total[1];
      }
      expect([t0, t1]).toEqual([sc.team0, sc.team1]);
      rounds += s.rounds.length;
    }
    expect(rounds).toBeGreaterThan(100);
  }, 60000);

  it('forfeit makes the forfeiting team lose', () => {
    const s = tichuEngine.create({}, rngOf('ee'));
    const f = tichuEngine.forfeit(s, 3, 'resign');
    expect(tichuEngine.result(f)).toMatchObject({ winners: [0, 2], reason: 'resign', draw: false });
    expect(tichuEngine.toAct(f)).toEqual([]);
  });
});
