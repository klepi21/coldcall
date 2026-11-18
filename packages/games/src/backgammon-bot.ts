import {
  applyP,
  backgammonEngine,
  removeDie,
  singleSteps,
  toPersp,
  toPublicStep,
  type BgMove,
  type BgState,
  type Persp,
  type PStep,
} from './backgammon';
import type { BotContext } from './types';

interface Node {
  p: Persp;
  dice: number[];
  steps: PStep[];
}

const keyOf = (p: Persp): string => `${p.me.join(',')}|${p.opp.join(',')}|${p.meBar}|${p.oppBar}|${p.meOff}`;

/**
 * Every distinct legal full play for the roll, from the mover's perspective.
 * Uses the maximum number of dice and the higher die rule, deduplicated by resulting position.
 */
export function enumeratePlays(p: Persp, dice: number[]): Node[] {
  const leaves: Node[] = [];
  let frontier: Node[] = [{ p, dice, steps: [] }];
  while (frontier.length > 0) {
    const next = new Map<string, Node>();
    for (const node of frontier) {
      let any = false;
      if (node.p.meOff < 15) {
        for (const d of new Set(node.dice)) {
          const rest = removeDie(node.dice, d);
          for (const st of singleSteps(node.p, d)) {
            any = true;
            const np = applyP(node.p, st);
            const k = `${keyOf(np)}#${rest.join('')}`;
            if (!next.has(k)) next.set(k, { p: np, dice: rest, steps: [...node.steps, st] });
          }
        }
      }
      if (!any) leaves.push(node);
    }
    frontier = [...next.values()];
  }
  let max = 0;
  for (const l of leaves) if (l.steps.length > max) max = l.steps.length;
  let best = leaves.filter((l) => l.steps.length === max);
  if (max === 1 && dice.length === 2 && dice[0] !== dice[1]) {
    const hi = Math.max(dice[0]!, dice[1]!);
    if (best.some((l) => l.steps[0]!.die === hi)) best = best.filter((l) => l.steps[0]!.die === hi);
  }
  const seen = new Set<string>();
  return best.filter((l) => {
    const k = keyOf(l.p);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// Value of owning a point, indexed by the mover's own point index (0 = their 1 point).
const POINT_VALUE = [1.0, 1.5, 2.5, 3.5, 5.0, 4.5, 4.0, 2.5, 1.2, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 2.0, 3.5, 3.0, 2.0, 1.5, 1.2];
const PRIME_VALUE = [0, 0, 1, 2.5, 5, 9, 14];

/** Heuristic score of a position for the side that just moved ("me"). Higher is better. */
export function evaluate(p: Persp): number {
  if (p.meOff >= 15) return 1e6;
  let myPip = 25 * p.meBar;
  let oppPip = 25 * p.oppBar;
  let myBack = p.meBar > 0 ? 24 : -1;
  let oppBack = p.oppBar > 0 ? -1 : 24;
  for (let i = 0; i < 24; i++) {
    const m = p.me[i]!;
    const o = p.opp[i]!;
    if (m > 0) {
      myPip += (i + 1) * m;
      if (i > myBack) myBack = i;
    }
    if (o > 0) {
      oppPip += (24 - i) * o;
      if (i < oppBack) oppBack = i;
    }
  }

  // Race: nobody can hit anybody any more.
  if (myBack < oppBack) {
    let s = (oppPip - myPip) * 1.0 + p.meOff * 1.5;
    for (let i = 0; i < 6; i++) s -= 0.15 * Math.max(0, p.me[i]! - 3);
    for (let i = 6; i < 24; i++) s -= 0.3 * p.me[i]!; // still outside home
    return s;
  }

  let s = (oppPip - myPip) * 0.15;
  s += p.oppBar * 5 - p.meBar * 5;
  s += p.meOff * 1.0;

  let oppHome = 0;
  for (let i = 18; i < 24; i++) if (p.opp[i]! >= 2) oppHome++;

  let run = 0;
  let bestRun = 0;
  let bestRunStart = 0;
  for (let i = 0; i < 24; i++) {
    const m = p.me[i]!;
    if (m >= 2) {
      s += POINT_VALUE[i]!;
      run++;
      if (run > bestRun) {
        bestRun = run;
        bestRunStart = i - run + 1;
      }
      if (m > 3) s -= 0.25 * (m - 3);
    } else {
      run = 0;
    }
    if (m === 1) {
      // Direct shots: opponent checkers 1..6 pips behind (they move upward), plus entering checkers.
      let mask = 0;
      for (let j = Math.max(0, i - 6); j < i; j++) if (p.opp[j]! > 0) mask |= 1 << (i - j);
      if (p.oppBar > 0 && i < 6) mask |= 1 << (i + 1);
      if (mask) {
        let n = 0;
        for (let k = 1; k <= 6; k++) if (mask & (1 << k)) n++;
        const hits = 36 - (6 - n) * (6 - n);
        const cost = 2 + (24 - i) * 0.12 + oppHome * 0.6;
        s -= (hits / 36) * cost * 3;
      }
    }
  }
  if (bestRun >= 2 && oppBack < bestRunStart) s += PRIME_VALUE[Math.min(6, bestRun)]!;

  // Opponent's blots in my home board while they are stuck count a little in my favour.
  for (let i = 0; i < 6; i++) if (p.opp[i] === 1) s += 0.4;
  return s;
}

/** Full ordered list of steps for the current turn. Empty when it is not this seat's turn. */
export function backgammonBot(ctx: BotContext<BgState>): BgMove[] {
  const st = ctx.state;
  if (backgammonEngine.result(st) || st.turn !== ctx.seat || st.dice.length === 0) return [];
  const plays = enumeratePlays(toPersp(st, ctx.seat), st.dice);
  if (plays.length === 0) return [];
  const level = Math.max(0, Math.min(10, ctx.level));
  const amp = (10 - level) * 0.6;
  let best = plays[0]!;
  let bestScore = -Infinity;
  for (const play of plays) {
    let score = evaluate(play.p);
    if (amp > 0) score += (ctx.rng.float() * 2 - 1) * amp;
    if (score > bestScore) {
      bestScore = score;
      best = play;
    }
  }
  return best.steps.map((s) => toPublicStep(s, ctx.seat));
}
