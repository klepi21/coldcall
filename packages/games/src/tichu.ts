import { IllegalMoveError, type GameEngine, type GameResult, type Seat } from './types';
import type { Rng } from './rng';
import {
  DOG,
  DRAGON,
  MAHJONG,
  PHOENIX,
  beats,
  cardRank,
  comboLabel,
  comboNoun,
  enumerateCombos,
  fullDeck,
  interpret,
  isBomb,
  isCard,
  isNormal,
  rankWithArticle,
  sumPoints,
  type CardId,
  type Combo,
} from './tichu-combos';

// Curated re-exports (prefixed where generic) so `export * from './tichu'` cannot collide in index.ts.
// Lower level helpers live in './tichu-combos'.
export {
  describeCombo,
  comboLabel,
  fullDeck as tichuDeck,
  cardPoints as tichuCardPoints,
  SPECIAL_CARDS as TICHU_SPECIAL_CARDS,
  type CardId as TichuCardId,
  type Combo as TichuCombo,
  type ComboType as TichuComboType,
} from './tichu-combos';

/**
 * Tichu for 4 seats. Partners sit opposite: seats 0 and 2 (team 0) vs 1 and 3 (team 1).
 * Play order is seat s, then s+1, s+2, s+3 (mod 4). For passing, "left" is s+1,
 * "partner" is s+2 and "right" is s+3.
 */
export interface TichuConfig {
  /** Match ends when a team reaches this score with a strict lead. Default 500. */
  targetScore?: number;
}

export type TichuPhase = 'grand' | 'passing' | 'play' | 'dragon' | 'over';

export type TichuMove =
  | { type: 'grand'; call: boolean }
  /** Cards in order [toLeft (seat+1), toPartner (seat+2), toRight (seat+3)]. */
  | { type: 'pass_cards'; cards: [CardId, CardId, CardId] }
  | { type: 'tichu' }
  /**
   * Play a combination. Also used for bombs, which any seat may play out of turn
   * while cards are on the table. `phoenixAs` picks the rank the Phoenix stands for
   * in a multi card combination (default: the highest valid reading).
   * `wish` (2..14) only when the cards include the Mahjong.
   */
  | { type: 'play'; cards: CardId[]; phoenixAs?: number; wish?: number }
  | { type: 'pass' }
  | { type: 'give_dragon'; to: Seat };

export interface TrickPlay {
  seat: Seat;
  cards: CardId[];
  combo: Combo;
  label: string;
  wish?: number;
}

export interface RoundSummary {
  round: number;
  /** Card points per team (200 to the winners on a double victory). */
  cardPoints: [number, number];
  /** Tichu and Grand Tichu bonuses per team. */
  bonus: [number, number];
  total: [number, number];
  /** Finishing order, all four seats (on a double victory the last two are in seat order). */
  order: Seat[];
  doubleVictory: number | null;
  calls: { seat: Seat; kind: 'tichu' | 'grand'; made: boolean }[];
}

export interface TichuState {
  config: { targetScore: number };
  phase: TichuPhase;
  round: number;
  scores: [number, number];
  hands: CardId[][];
  /** The last 6 cards of each seat while the Grand Tichu window is open. Hidden. */
  undealt: CardId[][];
  grand: (boolean | null)[];
  tichu: boolean[];
  passes: (CardId[] | null)[];
  received: { from: Seat; card: CardId }[][];
  /** Has the seat played a card this round (closes its Tichu window). */
  played: boolean[];
  turn: Seat;
  trick: TrickPlay[];
  topSeat: Seat | null;
  passCount: number;
  wish: number | null;
  out: Seat[];
  won: CardId[][];
  tricksTaken: number[];
  lastTrick: { winner: Seat; plays: TrickPlay[] } | null;
  dragon: { winner: Seat; cards: CardId[]; endRound: boolean } | null;
  rounds: RoundSummary[];
  forfeit?: { seat: Seat; reason: 'resign' | 'timeout' | 'abandon' };
}

export interface TichuView {
  viewer: Seat;
  phase: TichuPhase;
  round: number;
  scores: { team0: number; team1: number };
  targetScore: number;
  /** The viewer's own hand (8 cards during the Grand Tichu window). Empty for spectators. */
  hand: CardId[];
  handCounts: number[];
  grandCalls: (boolean | null)[];
  tichuCalls: boolean[];
  /** Seats that have handed in their three passing cards. */
  passed: boolean[];
  /** Cards the viewer handed over, once chosen. */
  myPass: CardId[] | null;
  /** Cards the viewer received, shown after passing completes. */
  received: { from: Seat; card: CardId }[] | null;
  turn: Seat | null;
  toAct: Seat[];
  trick: TrickPlay[];
  top: TrickPlay | null;
  passCount: number;
  wish: number | null;
  out: Seat[];
  tricksTaken: number[];
  lastTrick: { winner: Seat; plays: TrickPlay[] } | null;
  dragonPending: { winner: Seat } | null;
  rounds: RoundSummary[];
  result: GameResult | null;
}

const SEATS = [0, 1, 2, 3] as const;
const teamOf = (s: Seat) => s % 2;
const partnerOf = (s: Seat) => (s + 2) % 4;
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const illegal = (explain: string): never => {
  throw new IllegalMoveError(explain, explain);
};

function nextActive(s: TichuState, from: Seat): Seat {
  for (let i = 1; i <= 4; i++) {
    const x = (from + i) % 4;
    if (!s.out.includes(x)) return x;
  }
  return from;
}
/** `start` itself if still in, else the next active seat after it. */
function activeFrom(s: TichuState, start: Seat): Seat {
  return s.out.includes(start) ? nextActive(s, start) : start;
}

function newRound(s: TichuState, rng: Rng) {
  const deck = rng.shuffle(fullDeck());
  s.hands = SEATS.map((i) => deck.slice(i * 14, i * 14 + 8));
  s.undealt = SEATS.map((i) => deck.slice(i * 14 + 8, i * 14 + 14));
  s.phase = 'grand';
  s.grand = [null, null, null, null];
  s.tichu = [false, false, false, false];
  s.passes = [null, null, null, null];
  s.received = [[], [], [], []];
  s.played = [false, false, false, false];
  s.turn = 0;
  s.trick = [];
  s.topSeat = null;
  s.passCount = 0;
  s.wish = null;
  s.out = [];
  s.won = [[], [], [], []];
  s.tricksTaken = [0, 0, 0, 0];
  s.lastTrick = null;
  s.dragon = null;
}

export function canCallTichu(s: TichuState, seat: Seat): boolean {
  return (
    (s.phase === 'passing' || s.phase === 'play' || s.phase === 'dragon') &&
    !s.played[seat] &&
    !s.tichu[seat] &&
    !s.grand[seat] &&
    !s.out.includes(seat)
  );
}

const topCombo = (s: TichuState): Combo | null => s.trick[s.trick.length - 1]?.combo ?? null;

/** Must the seat on turn play the wished rank (not counting bombs)? */
function wishForced(s: TichuState, seat: Seat): boolean {
  const w = s.wish;
  const hand = s.hands[seat] ?? [];
  if (w === null || !hand.some((c) => isNormal(c) && cardRank(c) === w)) return false;
  const top = topCombo(s);
  if (!top) return true;
  return enumerateCombos(hand).some((cand) => {
    if (!cand.cards.some((c) => isNormal(c) && cardRank(c) === w)) return false;
    const c = interpret(cand.cards, top).find((x) => x.phoenixAs === cand.combo.phoenixAs);
    return !!c && !isBomb(c) && beats(c, top);
  });
}

type PlayCheck = { ok: true; combo: Combo } | { ok: false; reason: string };

function checkPlay(
  s: TichuState,
  seat: Seat,
  cards: readonly CardId[],
  phoenixAs?: number,
  wish?: number,
  forcedHint?: boolean,
): PlayCheck {
  const no = (reason: string): PlayCheck => ({ ok: false, reason });
  if (s.phase !== 'play') return no('You cannot play cards right now.');
  if (s.out.includes(seat)) return no('You have already gone out this round.');
  if (!Array.isArray(cards) || cards.length === 0) return no('Choose at least one card to play.');
  const hand = s.hands[seat] ?? [];
  if (!cards.every((c) => isCard(c) && hand.includes(c)) || new Set(cards).size !== cards.length)
    return no('You do not hold those cards.');
  if (wish !== undefined) {
    if (!cards.includes(MAHJONG)) return no('You can only make a wish when you play the Mahjong.');
    if (!Number.isInteger(wish) || wish < 2 || wish > 14) return no('The wish must be a rank from 2 to Ace.');
  }
  const top = topCombo(s);
  let ints = interpret(cards, top);
  if (ints.length === 0) return no('Those cards do not form a valid combination.');
  if (phoenixAs !== undefined && cards.length > 1 && cards.includes(PHOENIX)) {
    ints = ints.filter((c) => c.phoenixAs === phoenixAs);
    if (ints.length === 0) return no('The Phoenix cannot stand in for that rank here.');
  }
  const onTurn = seat === s.turn;
  if (!onTurn) {
    if (!isBomb(ints[0]!)) return no('It is not your turn. Only a bomb can be played out of turn.');
    if (!top) return no('You can only bomb out of turn while cards are on the table.');
  }
  if (top && ints[0]!.type === 'dog') return no('The Dog can only be played as a lead.');
  const winning = ints.filter((c) => beats(c, top));
  if (winning.length === 0) {
    if (top && top.type === 'single' && top.rank === 15 && cards[0] === PHOENIX)
      return no('The Phoenix cannot beat the Dragon.');
    if (top && isBomb(top)) return no('That does not beat the bomb on the table. Only a higher bomb can.');
    return no(top ? `That does not beat the ${comboNoun(top)} on the table.` : 'Those cards cannot be played.');
  }
  const w = s.wish;
  if (onTurn && w !== null && !cards.some((c) => isNormal(c) && cardRank(c) === w) && (forcedHint ?? wishForced(s, seat)))
    return no(`You must play ${rankWithArticle(w)} because of the Mahjong wish.`);
  return { ok: true, combo: winning.sort((a, b) => b.rank - a.rank)[0]! };
}

/** Plain English reason why `cards` cannot be played by `seat` now, or null if they can. */
export function whyInvalid(state: TichuState, seat: Seat, cards: readonly CardId[], phoenixAs?: number): string | null {
  const r = checkPlay(state, seat, cards, phoenixAs);
  return r.ok ? null : r.reason;
}

function addTo(arr: [number, number], team: number, v: number) {
  if (team === 0) arr[0] += v;
  else arr[1] += v;
}

function finishRound(s: TichuState, rng: Rng) {
  const cardPoints: [number, number] = [0, 0];
  const bonus: [number, number] = [0, 0];
  let doubleVictory: number | null = null;
  const first = s.out[0]!;
  let order: Seat[];
  if (s.out.length >= 2 && teamOf(s.out[0]!) === teamOf(s.out[1]!)) {
    doubleVictory = teamOf(first);
    cardPoints[doubleVictory] = 200;
    order = [...s.out, ...SEATS.filter((x) => !s.out.includes(x))];
  } else {
    const last = SEATS.find((x) => !s.out.includes(x))!;
    order = [...s.out, last];
    for (const x of SEATS) {
      if (x === last) continue;
      addTo(cardPoints, teamOf(x), sumPoints(s.won[x]!));
    }
    addTo(cardPoints, teamOf(first), sumPoints(s.won[last]!));
    addTo(cardPoints, 1 - teamOf(last), sumPoints(s.hands[last]!));
  }
  const calls: RoundSummary['calls'] = [];
  for (const x of SEATS) {
    const made = x === first;
    if (s.grand[x]) {
      addTo(bonus, teamOf(x), made ? 200 : -200);
      calls.push({ seat: x, kind: 'grand', made });
    }
    if (s.tichu[x]) {
      addTo(bonus, teamOf(x), made ? 100 : -100);
      calls.push({ seat: x, kind: 'tichu', made });
    }
  }
  const total: [number, number] = [cardPoints[0] + bonus[0], cardPoints[1] + bonus[1]];
  s.scores = [s.scores[0] + total[0], s.scores[1] + total[1]];
  s.rounds.push({ round: s.round, cardPoints, bonus, total, order, doubleVictory, calls });
  const [a, b] = s.scores;
  if ((a >= s.config.targetScore || b >= s.config.targetScore) && a !== b) {
    s.phase = 'over';
    s.trick = [];
    s.topSeat = null;
    s.dragon = null;
    return;
  }
  s.round += 1;
  newRound(s, rng);
}

function collectTrick(s: TichuState): { winner: Seat; cards: CardId[]; dragon: boolean } {
  const winner = s.topSeat!;
  const top = topCombo(s)!;
  const cards = s.trick.flatMap((p) => p.cards);
  const dragon = top.type === 'single' && top.rank === 15;
  s.lastTrick = { winner, plays: s.trick };
  s.trick = [];
  s.topSeat = null;
  s.passCount = 0;
  return { winner, cards, dragon };
}

function award(s: TichuState, to: Seat, cards: CardId[]) {
  s.won[to]!.push(...cards);
  s.tricksTaken[to]! += 1;
}

function winTrick(s: TichuState) {
  const { winner, cards, dragon } = collectTrick(s);
  if (dragon) {
    s.phase = 'dragon';
    s.dragon = { winner, cards, endRound: false };
    return;
  }
  award(s, winner, cards);
  s.turn = activeFrom(s, winner);
}

function doPlay(s: TichuState, seat: Seat, cards: CardId[], combo: Combo, wish: number | undefined, rng: Rng) {
  s.hands[seat] = s.hands[seat]!.filter((c) => !cards.includes(c));
  s.played[seat] = true;
  if (s.wish !== null && cards.some((c) => isNormal(c) && cardRank(c) === s.wish)) s.wish = null;
  if (wish !== undefined) s.wish = wish;
  const play: TrickPlay = { seat, cards: [...cards], combo, label: comboLabel(combo, cards), ...(wish !== undefined ? { wish } : {}) };
  const wentOut = s.hands[seat]!.length === 0;
  if (wentOut) s.out.push(seat);
  const double = s.out.length >= 2 && teamOf(s.out[0]!) === teamOf(s.out[1]!);

  if (combo.type === 'dog') {
    s.lastTrick = { winner: partnerOf(seat), plays: [play] };
    s.won[seat]!.push(DOG);
    if (double || s.out.length >= 3) return finishRound(s, rng);
    s.turn = activeFrom(s, partnerOf(seat));
    return;
  }
  s.trick.push(play);
  s.topSeat = seat;
  s.passCount = 0;
  if (double) return finishRound(s, rng);
  if (s.out.length >= 3) {
    const t = collectTrick(s);
    if (t.dragon) {
      s.phase = 'dragon';
      s.dragon = { winner: t.winner, cards: t.cards, endRound: true };
      return;
    }
    award(s, t.winner, t.cards);
    return finishRound(s, rng);
  }
  s.turn = nextActive(s, seat);
}

function passSuggestions(hand: CardId[]): TichuMove[] {
  const order = [...hand].sort((a, b) => rankValue(a) - rankValue(b));
  const n = order.length;
  const pick = (l: number, p: number, r: number): TichuMove => ({
    type: 'pass_cards',
    cards: [order[l]!, order[p]!, order[r]!],
  });
  return [pick(0, n - 1, 1), pick(1, n - 1, 0), pick(0, n - 2, 1), pick(0, 2, 1)];
}
const rankValue = (c: CardId) => (c === PHOENIX ? 14.5 : c === DOG ? 0.5 : cardRank(c));

export const tichuEngine: GameEngine<TichuState, TichuMove, TichuView, TichuConfig> = {
  id: 'tichu',
  seats: 4,
  teams: [0, 1, 0, 1],

  create(config, rng) {
    const targetScore = config?.targetScore ?? 500;
    if (!Number.isInteger(targetScore) || targetScore <= 0) throw new Error('targetScore must be a positive integer');
    const s = { config: { targetScore }, round: 1, scores: [0, 0], rounds: [] } as unknown as TichuState;
    newRound(s, rng);
    return s;
  },

  toAct(s) {
    if (tichuEngine.result(s)) return [];
    switch (s.phase) {
      case 'grand':
        return SEATS.filter((x) => s.grand[x] === null);
      case 'passing':
        return SEATS.filter((x) => s.passes[x] === null);
      case 'play':
        return [s.turn];
      case 'dragon':
        return s.dragon ? [s.dragon.winner] : [];
      default:
        return [];
    }
  },

  legalMoves(s, seat) {
    if (tichuEngine.result(s) || !Number.isInteger(seat) || seat < 0 || seat > 3) return [];
    const moves: TichuMove[] = [];
    if (canCallTichu(s, seat)) moves.push({ type: 'tichu' });
    if (s.phase === 'grand') {
      if (s.grand[seat] === null) moves.push({ type: 'grand', call: true }, { type: 'grand', call: false });
    } else if (s.phase === 'passing') {
      if (s.passes[seat] === null) moves.push(...passSuggestions(s.hands[seat]!));
    } else if (s.phase === 'dragon') {
      if (s.dragon?.winner === seat) moves.push({ type: 'give_dragon', to: (seat + 1) % 4 }, { type: 'give_dragon', to: (seat + 3) % 4 });
    } else if (s.phase === 'play' && !s.out.includes(seat)) {
      const top = topCombo(s);
      const onTurn = seat === s.turn;
      if (!onTurn && !top) return moves;
      const forced = onTurn && wishForced(s, seat);
      for (const cand of enumerateCombos(s.hands[seat]!)) {
        if (!onTurn && !isBomb(cand.combo)) continue;
        const pAs = cand.combo.phoenixAs;
        const r = checkPlay(s, seat, cand.cards, pAs, undefined, forced);
        if (!r.ok) continue;
        const base: TichuMove = { type: 'play', cards: cand.cards, ...(pAs !== undefined ? { phoenixAs: pAs } : {}) };
        moves.push(base);
        if (cand.cards.includes(MAHJONG)) for (let w = 2; w <= 14; w++) moves.push({ ...base, wish: w });
      }
      if (onTurn && top && !forced) moves.push({ type: 'pass' });
    }
    return moves;
  },

  applyMove(state, seat, move, rng) {
    if (tichuEngine.result(state)) illegal('This game has already finished.');
    if (!Number.isInteger(seat) || seat < 0 || seat > 3) illegal('That seat is not at this table.');
    if (!move || typeof move !== 'object') illegal('That move was not understood.');
    const s = clone(state);
    switch (move.type) {
      case 'grand': {
        if (s.phase !== 'grand') illegal('The Grand Tichu call is only possible before the last six cards are dealt.');
        if (s.grand[seat] !== null) illegal('You have already decided on Grand Tichu.');
        s.grand[seat] = move.call === true;
        if (s.grand.every((g) => g !== null)) {
          for (const x of SEATS) s.hands[x]!.push(...s.undealt[x]!);
          s.undealt = [[], [], [], []];
          s.phase = 'passing';
        }
        return s;
      }
      case 'tichu': {
        if (!canCallTichu(s, seat)) {
          if (s.grand[seat]) illegal('You already called Grand Tichu.');
          if (s.tichu[seat]) illegal('You already called Tichu.');
          if (s.phase === 'grand') illegal('You can call Tichu once you have all 14 cards.');
          illegal('Tichu can only be called before you play your first card.');
        }
        s.tichu[seat] = true;
        return s;
      }
      case 'pass_cards': {
        if (s.phase !== 'passing') illegal('Cards are not being passed right now.');
        if (s.passes[seat] !== null) illegal('You have already passed your cards.');
        const cards = move.cards;
        const hand = s.hands[seat]!;
        if (!Array.isArray(cards) || cards.length !== 3 || new Set(cards).size !== 3 || !cards.every((c) => hand.includes(c)))
          illegal('Pick three different cards from your hand: one for each player.');
        s.passes[seat] = [...cards];
        if (s.passes.every((p) => p !== null)) {
          for (const g of SEATS) {
            const given = s.passes[g]!;
            s.hands[g] = s.hands[g]!.filter((c) => !given.includes(c));
          }
          for (const g of SEATS) {
            s.passes[g]!.forEach((card, i) => {
              const to = (g + 1 + i) % 4;
              s.hands[to]!.push(card);
              s.received[to]!.push({ from: g, card });
            });
          }
          s.phase = 'play';
          s.turn = SEATS.find((x) => s.hands[x]!.includes(MAHJONG)) ?? 0;
        }
        return s;
      }
      case 'play': {
        const r = checkPlay(s, seat, move.cards, move.phoenixAs, move.wish);
        if (!r.ok) return illegal(r.reason);
        doPlay(s, seat, [...move.cards], r.combo, move.wish, rng);
        return s;
      }
      case 'pass': {
        if (s.phase !== 'play') illegal('You cannot pass right now.');
        if (seat !== s.turn) illegal('It is not your turn yet.');
        if (s.trick.length === 0) illegal('You are leading, so you need to play something.');
        if (wishForced(s, seat)) illegal(`You must play ${rankWithArticle(s.wish!)} because of the Mahjong wish.`);
        s.passCount += 1;
        const others = SEATS.filter((x) => !s.out.includes(x) && x !== s.topSeat).length;
        if (s.passCount >= others) winTrick(s);
        else s.turn = nextActive(s, seat);
        return s;
      }
      case 'give_dragon': {
        if (s.phase !== 'dragon' || !s.dragon) illegal('There is no Dragon trick to give away.');
        const d = s.dragon!;
        if (seat !== d.winner) illegal('Only the player who won the Dragon trick chooses who gets it.');
        if (!Number.isInteger(move.to) || move.to < 0 || move.to > 3 || teamOf(move.to) === teamOf(seat))
          illegal('The Dragon trick must go to one of your opponents.');
        award(s, move.to, d.cards);
        s.dragon = null;
        s.phase = 'play';
        if (d.endRound) finishRound(s, rng);
        else s.turn = activeFrom(s, d.winner);
        return s;
      }
      default:
        return illegal('That move was not understood.');
    }
  },

  forfeit(state, seat, reason) {
    if (tichuEngine.result(state)) return state;
    return { ...clone(state), forfeit: { seat, reason } };
  },

  result(s) {
    const score = { team0: s.scores[0], team1: s.scores[1] };
    if (s.forfeit) {
      const t = 1 - teamOf(s.forfeit.seat);
      return { winners: SEATS.filter((x) => teamOf(x) === t), draw: false, reason: s.forfeit.reason, score };
    }
    if (s.phase === 'over') {
      const t = s.scores[0] > s.scores[1] ? 0 : 1;
      return { winners: SEATS.filter((x) => teamOf(x) === t), draw: false, reason: 'score_limit', score };
    }
    return null;
  },

  publicView(s, seat) {
    const me = Number.isInteger(seat) && seat >= 0 && seat <= 3 ? seat : -1;
    const passingDone = s.phase !== 'grand' && s.phase !== 'passing';
    return {
      viewer: me,
      phase: s.phase,
      round: s.round,
      scores: { team0: s.scores[0], team1: s.scores[1] },
      targetScore: s.config.targetScore,
      hand: me >= 0 ? [...s.hands[me]!] : [],
      handCounts: s.hands.map((h) => h.length),
      grandCalls: [...s.grand],
      tichuCalls: [...s.tichu],
      passed: s.passes.map((p) => p !== null),
      myPass: me >= 0 && s.passes[me] ? [...s.passes[me]!] : null,
      received: me >= 0 && passingDone && s.phase !== 'over' ? clone(s.received[me]!) : null,
      turn: s.phase === 'play' ? s.turn : null,
      toAct: tichuEngine.toAct(s),
      trick: clone(s.trick),
      top: s.trick.length ? clone(s.trick[s.trick.length - 1]!) : null,
      passCount: s.passCount,
      wish: s.wish,
      out: [...s.out],
      tricksTaken: [...s.tricksTaken],
      lastTrick: clone(s.lastTrick),
      dragonPending: s.dragon ? { winner: s.dragon.winner } : null,
      rounds: clone(s.rounds),
      result: tichuEngine.result(s),
    };
  },
};

/** Card points currently held in a seat's won pile (for tests and displays). */
export const wonPoints = (s: TichuState, seat: Seat) => sumPoints(s.won[seat] ?? []);
