/**
 * Client side checks for the Tichu table. The server is the authority; this only decides
 * what the Play button says. `legal` from the server is a representative sample (one card
 * choice per rank pattern), so a selection is matched by its rank signature, not card ids.
 */
import type { TichuMove, TichuView } from '@evens/games';
import { analyze, beats, cardRank, cardSuit, comboLabel, comboNoun, interpret, isBomb, isNormal, rankWord, DOG, DRAGON, MAHJONG, PHOENIX, type CardId } from '@evens/games/tichu-combos';

export type PlayMove = Extract<TichuMove, { type: 'play' }>;

export const isPlay = (m: TichuMove): m is PlayMove => m.type === 'play';

/** Sorted ranks with specials as their own markers: suit does not matter for a normal combo. */
export function rankKey(cards: readonly CardId[]): string {
  return cards
    .map((c) => (isNormal(c) || c === MAHJONG ? String(cardRank(c)).padStart(2, '0') : c))
    .sort()
    .join(',');
}

const sameSet = (a: readonly CardId[], b: readonly CardId[]) => a.length === b.length && a.every((c) => b.includes(c));

export type Selection =
  | { kind: 'empty' }
  | { kind: 'ok'; label: string; move: PlayMove; bomb: boolean; mahjong: boolean }
  | { kind: 'bad'; reason: string };

export function evaluateSelection(view: TichuView, legal: TichuMove[], mySeat: number | null, sel: CardId[]): Selection {
  if (sel.length === 0) return { kind: 'empty' };
  if (mySeat === null) return { kind: 'bad', reason: 'You are watching this game' };
  const readings = analyze(sel);
  if (readings.length === 0) return { kind: 'bad', reason: 'Pick cards that make a pair, straight, full house or bomb' };
  const selType = readings[0]!.type;
  const selBomb = isBomb(readings[0]!);
  const key = rankKey(sel);
  const plays = legal.filter(isPlay).filter((m) => m.wish === undefined);
  const matches = plays.filter((m) => {
    if (sameSet(m.cards, sel)) return true;
    if (rankKey(m.cards) !== key) return false;
    const r = analyze(m.cards)[0];
    // Same ranks but a different kind of combo (a straight flush bomb vs a plain straight) is not a match.
    return !!r && r.type === selType;
  });
  if (matches.length) {
    const best = [...matches].sort((a, b) => (b.phoenixAs ?? 0) - (a.phoenixAs ?? 0))[0]!;
    const top = view.top?.combo ?? null;
    const ints = interpret(sel, top);
    const chosen = (best.phoenixAs !== undefined ? ints.find((c) => c.phoenixAs === best.phoenixAs) : undefined) ?? ints[0]!;
    const move: PlayMove = { type: 'play', cards: [...sel], ...(best.phoenixAs !== undefined ? { phoenixAs: best.phoenixAs } : {}) };
    return { kind: 'ok', label: comboLabel(chosen, sel), move, bomb: isBomb(chosen), mahjong: sel.includes(MAHJONG) };
  }
  // The server sample can miss a card choice (for example a Phoenix full house). Without a wish in force,
  // a local check is safe; the server still decides.
  if (view.phase === 'play' && view.wish === null && !view.out.includes(mySeat)) {
    const top = view.top?.combo ?? null;
    const onTurn = view.turn === mySeat;
    const win = interpret(sel, top)
      .filter((c) => beats(c, top) && (onTurn || (isBomb(c) && !!top)))
      .sort((x, y) => y.rank - x.rank)[0];
    if (win && !(win.type === 'dog' && top)) {
      const move: PlayMove = { type: 'play', cards: [...sel], ...(win.phoenixAs !== undefined ? { phoenixAs: win.phoenixAs } : {}) };
      return { kind: 'ok', label: comboLabel(win, sel), move, bomb: isBomb(win), mahjong: sel.includes(MAHJONG) };
    }
  }
  // Why not.
  if (view.phase !== 'play') return { kind: 'bad', reason: 'You cannot play cards right now' };
  if (view.out.includes(mySeat)) return { kind: 'bad', reason: 'You are out this round' };
  const myTurn = view.turn === mySeat;
  if (!myTurn) {
    if (selBomb && !view.top) return { kind: 'bad', reason: 'You can bomb out of turn only while cards are on the table' };
    if (selBomb) return { kind: 'bad', reason: 'That bomb does not beat the one on the table' };
    return { kind: 'bad', reason: 'Wait for your turn. Only a bomb can be played now' };
  }
  if (sel.length === 1 && sel[0] === DOG && view.top) return { kind: 'bad', reason: 'The Dog can only be played as a lead' };
  const w = view.wish;
  if (w !== null && view.hand.some((c) => isNormal(c) && cardRank(c) === w) && !sel.some((c) => isNormal(c) && cardRank(c) === w))
    return { kind: 'bad', reason: `You must play ${w === 8 || w === 14 ? 'an' : 'a'} ${rankWord(w)} because of the wish` };
  if (view.top) {
    if (view.top.combo.type === 'single' && view.top.combo.rank === 15) return { kind: 'bad', reason: 'Only a bomb beats the Dragon' };
    return { kind: 'bad', reason: `That does not beat the ${comboNoun(view.top.combo)} on the table` };
  }
  return { kind: 'bad', reason: 'Those cards cannot be played right now' };
}

/** Smallest bomb in `legal`, for the out of turn Bomb button. */
export function bombMoves(legal: TichuMove[]): PlayMove[] {
  return legal
    .filter(isPlay)
    .filter((m) => m.wish === undefined)
    .map((m) => ({ m, c: analyze(m.cards)[0] }))
    .filter((x) => x.c && isBomb(x.c))
    .sort((a, b) => a.c!.length - b.c!.length || a.c!.rank - b.c!.rank)
    .map((x) => x.m);
}

/* Sorting. Suit order for "by suit": Jade, Swords, Pagodas, Stars, then specials. */
const SUIT_ORDER: Record<string, number> = { D: 0, S: 1, C: 2, H: 3 };
export function sortValue(c: CardId): number {
  if (c === DOG) return 0;
  if (c === MAHJONG) return 1;
  if (c === PHOENIX) return 14.6;
  if (c === DRAGON) return 15;
  return cardRank(c);
}
export function sortHand(hand: readonly CardId[], by: 'rank' | 'suit'): CardId[] {
  const suitIdx = (c: CardId) => {
    const s = cardSuit(c);
    return s ? SUIT_ORDER[s]! : c === DOG || c === MAHJONG ? -1 : 4;
  };
  return [...hand].sort((a, b) => {
    if (by === 'suit') return suitIdx(a) - suitIdx(b) || sortValue(a) - sortValue(b);
    return sortValue(a) - sortValue(b) || suitIdx(a) - suitIdx(b);
  });
}

export const RANK_SHORT: Record<number, string> = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
export const rankShort = (r: number) => RANK_SHORT[r] ?? String(r);
export { rankWord };
