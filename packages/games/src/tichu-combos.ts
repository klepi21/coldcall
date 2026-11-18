/**
 * Tichu cards and combinations.
 *
 * Card id scheme (stable strings, JSON friendly):
 *   normal cards: suit letter + rank, suits S H D C, ranks 2..10 J Q K A
 *                 e.g. 'S2', 'H10', 'DJ', 'CQ', 'SK', 'HA'
 *   specials:     'MAHJONG' (rank 1), 'DOG', 'PHOENIX', 'DRAGON'
 *
 * Internal ranks: 2..14 (J=11, Q=12, K=13, A=14), Mahjong 1, Dragon 15.
 * A Phoenix single is worth half a rank above the single it is played on (1.5 when led).
 */

export type CardId = string;
export const SUITS = ['S', 'H', 'D', 'C'] as const;
export type Suit = (typeof SUITS)[number];
export const MAHJONG = 'MAHJONG';
export const DOG = 'DOG';
export const PHOENIX = 'PHOENIX';
export const DRAGON = 'DRAGON';
export const SPECIAL_CARDS: readonly CardId[] = [MAHJONG, DOG, PHOENIX, DRAGON];

const FACE: Record<number, string> = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
const FACE_REV: Record<string, number> = { J: 11, Q: 12, K: 13, A: 14 };

export function cardId(suit: Suit, rank: number): CardId {
  return suit + (FACE[rank] ?? String(rank));
}

/** All 56 cards in a fixed order. */
export function fullDeck(): CardId[] {
  const out: CardId[] = [];
  for (const s of SUITS) for (let r = 2; r <= 14; r++) out.push(cardId(s, r));
  out.push(MAHJONG, DOG, PHOENIX, DRAGON);
  return out;
}

const DECK_SET = new Set(fullDeck());
export const isCard = (id: unknown): id is CardId => typeof id === 'string' && DECK_SET.has(id);
export const isSpecial = (id: CardId) => SPECIAL_CARDS.includes(id);
/** Suited card 2..A (not a special). */
export const isNormal = (id: CardId) => isCard(id) && !isSpecial(id);

export function cardSuit(id: CardId): Suit | null {
  return isNormal(id) ? (id[0] as Suit) : null;
}

/** Mahjong 1, normal 2..14, Dragon 15, Dog 0, Phoenix 0 (contextual). */
export function cardRank(id: CardId): number {
  if (id === MAHJONG) return 1;
  if (id === DRAGON) return 15;
  if (id === DOG || id === PHOENIX) return 0;
  const r = id.slice(1);
  return FACE_REV[r] ?? Number(r);
}

export function cardPoints(id: CardId): number {
  if (id === DRAGON) return 25;
  if (id === PHOENIX) return -25;
  if (!isNormal(id)) return 0;
  const r = cardRank(id);
  return r === 5 ? 5 : r === 10 || r === 13 ? 10 : 0;
}

export const sumPoints = (cards: readonly CardId[]) => cards.reduce((a, c) => a + cardPoints(c), 0);

export function rankWord(r: number): string {
  return ({ 1: 'Mahjong', 11: 'Jack', 12: 'Queen', 13: 'King', 14: 'Ace', 15: 'Dragon' } as Record<number, string>)[r] ?? String(r);
}
const plural = (r: number) => (r === 6 ? '6s' : `${rankWord(r)}s`);
export const rankWithArticle = (r: number) => `${r === 8 || r === 14 ? 'an' : 'a'} ${rankWord(r)}`;

export type ComboType =
  | 'single'
  | 'pair'
  | 'triple'
  | 'full_house'
  | 'straight'
  | 'pair_run'
  | 'four_of_a_kind'
  | 'straight_flush'
  | 'dog';

export interface Combo {
  type: ComboType;
  /** Comparison rank: single value, pair rank, triple rank of a full house, top card of a straight or run. */
  rank: number;
  /** Number of cards. */
  length: number;
  /** Rank the Phoenix stands for inside a multi card combination. */
  phoenixAs?: number;
}

export const isBomb = (c: Combo) => c.type === 'four_of_a_kind' || c.type === 'straight_flush';

function plainDetect(r: number[]): Combo | null {
  const n = r.length;
  const first = r[0]!;
  if (n === 1) return { type: 'single', rank: first, length: 1 };
  if (r.every((x) => x === first)) {
    if (n === 2) return { type: 'pair', rank: first, length: 2 };
    if (n === 3) return { type: 'triple', rank: first, length: 3 };
    return null;
  }
  if (n === 5 && r[0] === r[1] && r[3] === r[4] && (r[2] === r[0] || r[2] === r[4])) {
    return { type: 'full_house', rank: r[2]!, length: 5 };
  }
  if (n >= 5 && r.every((x, i) => x === first + i)) return { type: 'straight', rank: r[n - 1]!, length: n };
  if (n >= 4 && n % 2 === 0 && first >= 2) {
    let ok = true;
    for (let i = 0; i < n / 2; i++) if (r[2 * i] !== first + i || r[2 * i + 1] !== first + i) ok = false;
    if (ok) return { type: 'pair_run', rank: r[n - 1]!, length: n };
  }
  return null;
}

function detectBomb(cards: readonly CardId[]): Combo | null {
  if (!cards.every(isNormal)) return null;
  const ranks = cards.map(cardRank).sort((a, b) => a - b);
  const n = cards.length;
  if (n === 4 && ranks.every((x) => x === ranks[0])) return { type: 'four_of_a_kind', rank: ranks[0]!, length: 4 };
  if (n >= 5) {
    const suit = cardSuit(cards[0]!);
    if (cards.every((c) => cardSuit(c) === suit) && ranks.every((x, i) => x === ranks[0]! + i)) {
      return { type: 'straight_flush', rank: ranks[n - 1]!, length: n };
    }
  }
  return null;
}

/**
 * Every way the cards can be read as a combination, highest first. Context free:
 * a lone Phoenix is reported with rank 1.5 (its value as a lead). Empty when invalid.
 */
export function analyze(cards: readonly CardId[]): Combo[] {
  if (cards.length === 0 || !cards.every(isCard) || new Set(cards).size !== cards.length) return [];
  if (cards.length === 1) {
    const c = cards[0]!;
    if (c === DOG) return [{ type: 'dog', rank: 0, length: 1 }];
    if (c === PHOENIX) return [{ type: 'single', rank: 1.5, length: 1 }];
    return [{ type: 'single', rank: cardRank(c), length: 1 }];
  }
  if (cards.includes(DOG) || cards.includes(DRAGON)) return [];
  const hasP = cards.includes(PHOENIX);
  const others = cards.filter((c) => c !== PHOENIX);
  const ranks = others.map(cardRank).sort((a, b) => a - b);
  if (!hasP) {
    const bomb = detectBomb(others);
    if (bomb) return [bomb];
    const p = plainDetect(ranks);
    return p ? [p] : [];
  }
  const out: Combo[] = [];
  for (let v = 2; v <= 14; v++) {
    const p = plainDetect([...ranks, v].sort((a, b) => a - b));
    if (p && !out.some((o) => o.type === p.type && o.rank === p.rank && o.length === p.length)) {
      out.push({ ...p, phoenixAs: v });
    }
  }
  return out.sort((a, b) => b.rank - a.rank);
}

/** analyze() with the Phoenix single valued against the combination on the table. */
export function interpret(cards: readonly CardId[], top: Combo | null): Combo[] {
  const list = analyze(cards);
  if (cards.length === 1 && cards[0] === PHOENIX) {
    const rank = top && top.type === 'single' ? top.rank + 0.5 : 1.5;
    return [{ type: 'single', rank, length: 1 }];
  }
  return list;
}

/** Does `a` legally beat `top`? `top` null means the player is leading. */
export function beats(a: Combo, top: Combo | null): boolean {
  if (!top) return true;
  if (a.type === 'dog') return false;
  const ab = isBomb(a);
  const tb = isBomb(top);
  if (ab && !tb) return true;
  if (!ab && tb) return false;
  if (ab && tb) {
    if (a.type !== top.type) return a.type === 'straight_flush';
    if (a.type === 'straight_flush' && a.length !== top.length) return a.length > top.length;
    return a.rank > top.rank;
  }
  if (top.type === 'dog') return false;
  if (a.type !== top.type || a.length !== top.length) return false;
  if (a.type === 'single' && top.rank >= 15) return false; // nothing but a bomb beats the Dragon
  return a.rank > top.rank;
}

/** Friendly label for a combination already interpreted. */
export function comboLabel(c: Combo, cards?: readonly CardId[]): string {
  switch (c.type) {
    case 'dog':
      return 'Dog';
    case 'single':
      if (cards && cards[0] === PHOENIX) return 'Phoenix';
      if (c.rank === 15) return 'Dragon';
      if (c.rank === 1) return 'Mahjong';
      return `Single ${rankWord(c.rank)}`;
    case 'pair':
      return `Pair of ${plural(c.rank)}`;
    case 'triple':
      return `Three ${plural(c.rank)}`;
    case 'full_house':
      return `Full house, ${plural(c.rank)} high`;
    case 'straight':
      return `Straight of ${c.length}`;
    case 'pair_run':
      return `${c.length / 2} consecutive pairs`;
    case 'four_of_a_kind':
      return `Bomb, four ${plural(c.rank)}`;
    case 'straight_flush':
      return `Bomb, straight flush of ${c.length}`;
  }
}

/** Short noun used in messages: "the pair on the table". */
export function comboNoun(c: Combo): string {
  switch (c.type) {
    case 'dog':
      return 'Dog';
    case 'single':
      return c.rank === 15 ? 'Dragon' : 'single';
    case 'pair':
      return 'pair';
    case 'triple':
      return 'triple';
    case 'full_house':
      return 'full house';
    case 'straight':
      return `straight of ${c.length}`;
    case 'pair_run':
      return `run of ${c.length / 2} pairs`;
    default:
      return 'bomb';
  }
}

/** Friendly label like "Straight of 6", or null when the cards are not a valid combination. */
export function describeCombo(cards: readonly CardId[]): string | null {
  const c = analyze(cards)[0];
  return c ? comboLabel(c, cards) : null;
}

export interface Candidate {
  cards: CardId[];
  combo: Combo;
}

/**
 * Representative enumeration of every combination shape the hand can make
 * (one card choice per rank pattern, plus every straight flush and four of a kind).
 * Context free; a Phoenix single has rank 1.5.
 */
export function enumerateCombos(hand: readonly CardId[]): Candidate[] {
  const by: CardId[][] = Array.from({ length: 15 }, () => []);
  for (const c of hand) if (isNormal(c) || c === MAHJONG) by[cardRank(c)]!.push(c);
  const cnt = (r: number) => by[r]?.length ?? 0;
  const take = (r: number, k: number) => (by[r] ?? []).slice(0, k);
  const hasP = hand.includes(PHOENIX);
  const res: Candidate[] = [];
  const seen = new Set<string>();
  const add = (cards: CardId[], phoenixAs?: number) => {
    const ints = analyze(cards);
    const combo = phoenixAs === undefined ? ints[0] : ints.find((i) => i.phoenixAs === phoenixAs);
    if (!combo) return;
    const key = [...cards].sort().join(',') + '|' + (combo.phoenixAs ?? '');
    if (seen.has(key)) return;
    seen.add(key);
    res.push({ cards, combo });
  };

  for (let r = 1; r <= 14; r++) if (cnt(r)) add(take(r, 1));
  if (hand.includes(DRAGON)) add([DRAGON]);
  if (hand.includes(PHOENIX)) add([PHOENIX]);
  if (hand.includes(DOG)) add([DOG]);

  for (let r = 2; r <= 14; r++) {
    const c = cnt(r);
    if (c >= 2) add(take(r, 2));
    else if (c === 1 && hasP) add([...take(r, 1), PHOENIX], r);
    if (c >= 3) add(take(r, 3));
    else if (c === 2 && hasP) add([...take(r, 2), PHOENIX], r);
    if (c === 4) add(take(r, 4));
  }

  for (let t = 2; t <= 14; t++) {
    for (let p = 2; p <= 14; p++) {
      if (p === t) continue;
      const ct = cnt(t);
      const cp = cnt(p);
      if (ct >= 3 && cp >= 2) add([...take(t, 3), ...take(p, 2)]);
      else if (hasP && ct === 2 && cp >= 2) add([...take(t, 2), PHOENIX, ...take(p, 2)], t);
      else if (hasP && ct >= 3 && cp === 1) add([...take(t, 3), ...take(p, 1), PHOENIX], p);
    }
  }

  for (let len = 5; len <= 14; len++) {
    for (let top = len; top <= 14; top++) {
      const low = top - len + 1;
      const missing: number[] = [];
      for (let r = low; r <= top; r++) if (!cnt(r)) missing.push(r);
      if (missing.length > 1 || (missing.length === 1 && (!hasP || missing[0] === 1))) continue;
      const cards: CardId[] = [];
      for (let r = low; r <= top; r++) if (cnt(r)) cards.push(take(r, 1)[0]!);
      if (missing.length === 0) {
        // Prefer a plain straight; swap one card for another suit if it happens to be a straight flush.
        if (detectBomb(cards)) {
          for (let r = low; r <= top; r++) {
            if (cnt(r) > 1) {
              cards[r - low] = by[r]![1]!;
              break;
            }
          }
        }
        add(cards);
      } else add([...cards, PHOENIX], missing[0]);
    }
  }

  for (let k = 2; k <= 7; k++) {
    for (let top = k + 1; top <= 14; top++) {
      const low = top - k + 1;
      let deficit = 0;
      let pAs = 0;
      const cards: CardId[] = [];
      for (let r = low; r <= top; r++) {
        const d = Math.max(0, 2 - cnt(r));
        deficit += d;
        if (d) pAs = r;
        cards.push(...take(r, 2));
      }
      if (deficit === 0) add(cards);
      else if (deficit === 1 && hasP) add([...cards, PHOENIX], pAs);
    }
  }

  for (const s of SUITS) {
    const has = (r: number) => hand.includes(cardId(s, r));
    for (let low = 2; low <= 10; low++) {
      if (!has(low)) continue;
      let high = low;
      while (high + 1 <= 14 && has(high + 1)) high++;
      for (let h = low + 4; h <= high; h++) {
        const cards: CardId[] = [];
        for (let r = low; r <= h; r++) cards.push(cardId(s, r));
        add(cards);
      }
    }
  }
  return res;
}
