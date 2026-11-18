import type { BotContext, Seat } from './types';
import {
  DOG,
  DRAGON,
  MAHJONG,
  PHOENIX,
  cardRank,
  enumerateCombos,
  interpret,
  isBomb,
  isNormal,
  sumPoints,
  type CardId,
  type Combo,
} from './tichu-combos';
import { tichuEngine, type TichuMove, type TichuState, type TichuView } from './tichu';

/**
 * Tichu bot. Uses only what the seat may know: its own hand (via publicView),
 * public plays, calls and hand counts. The full state is only handed to
 * tichuEngine.publicView and tichuEngine.legalMoves, which reveal nothing else.
 */

const TICHU_AT = 3.5;
const GRAND_AT = 5.5;
const CONTROLS_AT = 4;

type PlayMove = Extract<TichuMove, { type: 'play' }>;

const teamOf = (s: Seat) => s % 2;
const clampLevel = (l: number) => Math.max(0, Math.min(10, Number.isFinite(l) ? l : 5));

function rankCounts(hand: readonly CardId[]): number[] {
  const c = new Array<number>(16).fill(0);
  for (const x of hand) if (isNormal(x) || x === MAHJONG) c[cardRank(x)]! += 1;
  return c;
}

function bombCards(hand: readonly CardId[]): Set<CardId> {
  const out = new Set<CardId>();
  for (const cand of enumerateCombos(hand)) if (isBomb(cand.combo)) cand.cards.forEach((c) => out.add(c));
  return out;
}

/** Rough hand strength, higher is better. */
export function tichuHandStrength(hand: readonly CardId[]): number {
  const counts = rankCounts(hand);
  let s = 0;
  if (hand.includes(DRAGON)) s += 2;
  if (hand.includes(PHOENIX)) s += 1.5;
  if (hand.includes(DOG)) s -= 0.5;
  s += counts[14]! * 1 + counts[13]! * 0.4;
  const combos = enumerateCombos(hand);
  const bombs = combos.filter((c) => isBomb(c.combo));
  const fours = bombs.filter((b) => b.combo.type === 'four_of_a_kind').length;
  s += fours * 2.5 + (bombs.some((b) => b.combo.type === 'straight_flush') ? 2.5 : 0);
  if (hand.length >= 14) {
    // Greedy split into combinations; every low group is a likely loser that must be got rid of.
    let rest = hand.filter((c) => c !== DRAGON && c !== DOG && !bombs.some((b) => b.cards.includes(c)));
    let lowGroups = 0;
    for (;;) {
      const options = enumerateCombos(rest).filter((c) => !isBomb(c.combo) && c.combo.type !== 'dog');
      if (!options.length) break;
      options.sort((x, y) => y.cards.length - x.cards.length || x.combo.rank - y.combo.rank);
      const g = options[0]!;
      if (g.cards.length >= 5) lowGroups += g.combo.rank < 11 ? 0.5 : 0;
      else if (g.combo.rank < 10) lowGroups += 1;
      rest = rest.filter((c) => !g.cards.includes(c));
    }
    s -= lowGroups * 0.8;
  }
  return s;
}

interface Scored {
  move: PlayMove;
  combo: Combo;
  penalty: number;
  score: number;
}

function penaltyOf(cards: readonly CardId[], combo: Combo, hand: readonly CardId[], bombs: Set<CardId>): number {
  let p = 0;
  const counts = rankCounts(hand);
  const used = rankCounts(cards);
  if (cards.includes(DRAGON)) p += 12;
  if (cards.includes(PHOENIX)) p += cards.length === 1 ? 9 : 5;
  if (isBomb(combo)) p += 25;
  else {
    for (let r = 2; r <= 14; r++) {
      if (!used[r]) continue;
      if (counts[r]! > used[r]! && counts[r]! >= 2) p += 3;
    }
    if (cards.some((c) => bombs.has(c))) p += 10;
    if (combo.type === 'single' && combo.rank === 14) p += 2;
  }
  return p;
}

function pickWish(hand: readonly CardId[]): number | undefined {
  const counts = rankCounts(hand);
  for (let r = 14; r >= 8; r--) if (!counts[r]) return r;
  return undefined;
}

function finishPlay(m: PlayMove, hand: readonly CardId[]): TichuMove {
  if (!m.cards.includes(MAHJONG)) return m;
  const w = pickWish(hand.filter((c) => !m.cards.includes(c)));
  const { wish: _w, ...rest } = m;
  return w === undefined ? rest : { ...rest, wish: w };
}

function choosePassCards(view: TichuView, hand: CardId[]): TichuMove {
  const me = view.viewer;
  const bombs = bombCards(hand);
  const counts = rankCounts(hand);
  const value = (c: CardId) => (c === PHOENIX ? 14.6 : c === DRAGON ? 15 : c === DOG ? 0 : cardRank(c));
  const iCalled = !!view.grandCalls[me] || view.tichuCalls[me] === true;
  const partner = (me + 2) % 4;
  const partnerCalled = !!view.grandCalls[partner] || view.tichuCalls[partner] === true;
  // Junk for opponents: Dog first, then low singletons, then other low cards. Never bombs or top cards.
  const junkScore = (c: CardId) => {
    if (c === DOG) return -1;
    if (c === MAHJONG || c === DRAGON || c === PHOENIX || bombs.has(c)) return 100;
    const r = cardRank(c);
    return r + (counts[r]! >= 2 ? 6 : 0);
  };
  const junk = [...hand].sort((a, b) => junkScore(a) - junkScore(b));
  const toLeft = junk[0]!;
  const toRight = junk[1]!;
  const rest = hand.filter((c) => c !== toLeft && c !== toRight);
  let toPartner: CardId;
  if (iCalled && !partnerCalled) {
    toPartner = [...rest].sort((a, b) => junkScore(a) - junkScore(b))[0]!;
  } else {
    const good = rest.filter((c) => !bombs.has(c) && c !== DOG && c !== MAHJONG && (partnerCalled || c !== DRAGON));
    const pool = good.length ? good : rest;
    toPartner = [...pool].sort((a, b) => value(b) - value(a))[0]!;
  }
  return { type: 'pass_cards', cards: [toLeft, toPartner, toRight] };
}

function scorePlays(moves: PlayMove[], view: TichuView, lead: boolean): Scored[] {
  const hand = view.hand;
  const bombs = bombCards(hand);
  const top = view.top?.combo ?? null;
  const out: Scored[] = [];
  for (const m of moves) {
    const combo = interpret(m.cards, top).find((c) => c.phoenixAs === m.phoenixAs) ?? interpret(m.cards, top)[0];
    if (!combo) continue;
    const penalty = penaltyOf(m.cards, combo, hand, bombs);
    const goesOut = m.cards.length === hand.length;
    let score = lead ? m.cards.length * 2.2 - combo.rank - penalty : -combo.rank - penalty;
    if (goesOut) score += 100;
    if (lead && combo.type === 'dog') score = -50;
    out.push({ move: m, combo, penalty, score });
  }
  return out.sort((a, b) => b.score - a.score);
}

function chooseDragonRecipient(view: TichuView): Seat {
  const me = view.viewer;
  const a = (me + 1) % 4;
  const b = (me + 3) % 4;
  const ca = view.handCounts[a] ?? 0;
  const cb = view.handCounts[b] ?? 0;
  return ca >= cb ? a : b;
}

function playTurn(ctx: BotContext<TichuState>, view: TichuView, legal: TichuMove[], noise: number): TichuMove {
  const me = view.viewer;
  const hand = view.hand;
  const partner = (me + 2) % 4;
  const plays = legal.filter((m): m is PlayMove => m.type === 'play' && m.wish === undefined);
  const canPass = legal.some((m) => m.type === 'pass');
  const top = view.top;

  if (noise > 0 && ctx.rng.float() < noise * 0.5) {
    const pool: TichuMove[] = [...plays.filter((m) => !isBomb(interpret(m.cards, top?.combo ?? null)[0]!)), ...(canPass ? [{ type: 'pass' } as TichuMove] : [])];
    const pick = pool[ctx.rng.int(Math.max(1, pool.length))] ?? plays[0];
    if (pick) return pick.type === 'play' ? finishPlay(pick, hand) : pick;
  }

  if (!top) {
    // Leading.
    const scored = scorePlays(plays, view, true);
    const nonBomb = scored.filter((s) => !isBomb(s.combo) || s.move.cards.length === hand.length);
    const dogMove = scored.find((s) => s.combo.type === 'dog');
    const partnerIn = !view.out.includes(partner);
    if (dogMove && partnerIn) {
      const partnerStrong = !!view.grandCalls[partner] || view.tichuCalls[partner] === true;
      if (partnerStrong || (view.handCounts[partner] ?? 14) < hand.length || hand.length <= 3) return dogMove.move;
    }
    const best = (nonBomb.filter((s) => s.combo.type !== 'dog')[0] ?? nonBomb[0] ?? scored[0])!;
    return finishPlay(best.move, hand);
  }

  // Following.
  const scored = scorePlays(plays, view, false);
  if (!canPass) return finishPlay((scored[0] ?? { move: plays[0]! }).move, hand);
  const goOut = scored.find((s) => s.move.cards.length === hand.length);
  if (goOut) return finishPlay(goOut.move, hand);
  const topSeat = top.seat;
  if (teamOf(topSeat) === teamOf(me)) return { type: 'pass' };

  const oppCards = view.handCounts[topSeat] ?? 0;
  const trickPoints = sumPoints(view.trick.flatMap((p) => p.cards));
  const oppCalled = !!view.grandCalls[topSeat] || view.tichuCalls[topSeat] === true;
  const weCalled = !!view.grandCalls[me] || view.tichuCalls[me] === true || !!view.grandCalls[partner] || view.tichuCalls[partner] === true;
  const oppOut = view.out.some((x) => teamOf(x) !== teamOf(me));
  const partnerOut = view.out.includes(partner);
  const urgent =
    oppCards <= 3 || trickPoints >= 15 || weCalled || oppOut || (oppCalled && oppCards <= 8) || (partnerOut && hand.length <= 4);
  const normal = scored.filter((s) => !isBomb(s.combo));
  const best = normal[0];
  if (best && (best.penalty < 6 || (urgent && best.penalty < 20))) return finishPlay(best.move, hand);
  const bombsNow = scored.filter((s) => isBomb(s.combo)).sort((a, b) => a.combo.length - b.combo.length || a.combo.rank - b.combo.rank);
  if (bombsNow[0] && ((oppCards > 0 && oppCards <= 2) || (oppOut && oppCards <= 5) || (oppCalled && trickPoints >= 10)))
    return bombsNow[0].move;
  return { type: 'pass' };
}

export function tichuBot(ctx: BotContext<TichuState>): TichuMove {
  const { state, seat } = ctx;
  const level = clampLevel(ctx.level);
  const noise = (10 - level) / 10;
  const view = tichuEngine.publicView(state, seat);
  const legal = tichuEngine.legalMoves(state, seat);
  if (legal.length === 0) throw new Error('The bot has no legal move for this seat right now.');
  const jitter = () => (noise > 0 ? (ctx.rng.float() - 0.5) * noise * 3 : 0);
  const partner = (seat + 2) % 4;
  const partnerCalled = !!view.grandCalls[partner] || view.tichuCalls[partner] === true;

  switch (view.phase) {
    case 'grand': {
      const call = !partnerCalled && tichuHandStrength(view.hand) + jitter() >= GRAND_AT;
      return { type: 'grand', call };
    }
    case 'passing':
      if (view.passed[seat]) break;
      return choosePassCards(view, view.hand);
    case 'dragon':
      return { type: 'give_dragon', to: chooseDragonRecipient(view) };
    case 'play': {
      if (legal.some((m) => m.type === 'tichu') && view.turn === seat && !partnerCalled) {
        const opGrand = view.grandCalls.some((g, i) => g && teamOf(i) !== teamOf(seat));
        const h = view.hand;
        const controls =
          (h.includes(DRAGON) ? 1 : 0) +
          (h.includes(PHOENIX) ? 1 : 0) +
          h.filter((c) => isNormal(c) && cardRank(c) === 14).length +
          (enumerateCombos(h).some((c) => isBomb(c.combo)) ? 1 : 0);
        if (controls >= CONTROLS_AT && tichuHandStrength(h) + jitter() >= (opGrand ? TICHU_AT + 1 : TICHU_AT))
          return { type: 'tichu' };
      }
      if (view.turn === seat) return playTurn(ctx, view, legal, noise);
      break;
    }
    default:
      break;
  }
  const fallback = legal.find((m) => m.type !== 'tichu');
  if (!fallback) throw new Error('The bot has nothing to do for this seat right now.');
  return fallback;
}

/**
 * Out of turn decision: returns a bomb to play right now, or null to stay quiet.
 * Hosts may call this for seats that are not on turn after each move.
 */
export function tichuBotInterrupt(ctx: BotContext<TichuState>): TichuMove | null {
  const { state, seat } = ctx;
  const view = tichuEngine.publicView(state, seat);
  if (view.phase !== 'play' || view.turn === seat || !view.top) return null;
  const topSeat = view.top.seat;
  if (teamOf(topSeat) === teamOf(seat)) return null;
  const oppCards = view.handCounts[topSeat] ?? 0;
  const oppCalled = !!view.grandCalls[topSeat] || view.tichuCalls[topSeat] === true;
  if (!(oppCards > 0 && oppCards <= 2) && !(oppCalled && oppCards <= 4)) return null;
  // Only interrupt when the next seat to act is not our partner (who might still beat it).
  if (view.turn !== null && teamOf(view.turn) === teamOf(seat)) return null;
  const level = clampLevel(ctx.level);
  if (ctx.rng.float() > 0.4 + level * 0.06) return null;
  const bombs = tichuEngine
    .legalMoves(state, seat)
    .filter((m): m is PlayMove => m.type === 'play')
    .map((m) => ({ m, c: interpret(m.cards, view.top!.combo)[0]! }))
    .filter((x) => x.c && isBomb(x.c))
    .sort((a, b) => a.c.length - b.c.length || a.c.rank - b.c.rank);
  return bombs[0]?.m ?? null;
}
