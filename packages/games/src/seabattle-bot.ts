import type { BotContext } from './types';
import { SB_SIZE, sbShipSize, seaBattleEngine, type SbMark, type SbMove, type SbState } from './seabattle';

/**
 * Ice Floe Battle bot. It only reads `publicView(state, seat)`, so it knows exactly what a human in
 * that seat knows: its own shots (miss, hit, sunk, auto marked) and which enemy ship types are
 * still afloat. It never looks at the hidden enemy fleet.
 *
 * Placing: asks the engine for a fair random fleet (`auto_place`).
 * Firing: probability density. For every ship still afloat it counts every placement that fits
 * the known marks and the no touch rule. With unresolved hits on the board it is in target mode:
 * only placements that cover at least one of those hits count, and each covered hit multiplies the
 * weight strongly. Otherwise it is in hunt mode and every placement counts equally.
 *
 * Levels: 10 always fires at the highest score (ties broken by the rng). Lower levels fire at a
 * random legal square with probability (10 - level) * 0.07. Parity hunting (only squares on a
 * checkerboard spaced by the smallest ship afloat) is used in hunt mode at level 5 and above.
 */

const N = SB_SIZE;
const TARGET_WEIGHT = 50;

/** Score per cell (100 entries). Exported for tests and practice hints. */
export function seaBattleDensity(marks: SbMark[], afloat: number[]): number[] {
  const score = new Array<number>(N * N).fill(0);
  const hits: number[] = [];
  for (let i = 0; i < N * N; i++) if (marks[i] === 'hit') hits.push(i);
  const target = hits.length > 0;
  const isHit = (i: number) => marks[i] === 'hit';
  const open = (i: number) => marks[i] === 'empty' || marks[i] === 'hit';

  for (const size of afloat) {
    for (let d = 0; d < 2; d++) {
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          const cells: number[] = [];
          let fits = true;
          for (let k = 0; k < size; k++) {
            const rr = d === 0 ? r : r + k;
            const cc = d === 0 ? c + k : c;
            if (rr >= N || cc >= N || !open(rr * N + cc)) {
              fits = false;
              break;
            }
            cells.push(rr * N + cc);
          }
          if (!fits) continue;
          // No touch rule: an unresolved hit right next to this placement but not inside it would
          // be a second ship touching this one, which is impossible.
          const inside = new Set(cells);
          let touches = false;
          for (const i of cells) {
            const pr = Math.floor(i / N);
            const pc = i % N;
            for (let dr = -1; dr <= 1 && !touches; dr++) {
              for (let dc = -1; dc <= 1; dc++) {
                const nr = pr + dr;
                const nc = pc + dc;
                if (nr < 0 || nr >= N || nc < 0 || nc >= N) continue;
                const j = nr * N + nc;
                if (!inside.has(j) && isHit(j)) {
                  touches = true;
                  break;
                }
              }
            }
            if (touches) break;
          }
          if (touches) continue;
          const covered = cells.filter(isHit).length;
          if (target && covered === 0) continue;
          const w = target ? Math.pow(TARGET_WEIGHT, covered) : 1;
          for (const i of cells) if (!isHit(i)) score[i]! += w;
        }
      }
    }
  }
  return score;
}

export function seaBattleBot(ctx: BotContext<SbState>): SbMove {
  const { state, seat, rng } = ctx;
  const level = Math.max(0, Math.min(10, Math.round(ctx.level)));
  const legal = seaBattleEngine.legalMoves(state, seat);
  if (legal.length === 0) throw new Error('seaBattleBot: no legal move');
  if (state.phase === 'placing') return { type: 'auto_place' };

  const fires = legal.filter((m): m is Extract<SbMove, { type: 'fire' }> => m.type === 'fire');
  const random = () => fires[rng.int(fires.length)]!;
  if (level < 10 && rng.float() < (10 - level) * 0.07) return random();

  const view = seaBattleEngine.publicView(state, seat);
  const enemy = view.boards[1 - seat]!;
  const sizes = enemy.afloat.map(sbShipSize);
  const score = seaBattleDensity(enemy.marks, sizes);
  const hunting = !enemy.marks.includes('hit');

  let pool = fires;
  if (hunting && level >= 5 && sizes.length > 0) {
    const step = Math.min(...sizes);
    // Pick the parity class with the most total score so the checkerboard follows the open water.
    let bestK = 0;
    let bestSum = -1;
    for (let k = 0; k < step; k++) {
      let sum = 0;
      for (const m of fires) if ((m.row + m.col) % step === k) sum += score[m.row * N + m.col]!;
      if (sum > bestSum) {
        bestSum = sum;
        bestK = k;
      }
    }
    const filtered = fires.filter((m) => (m.row + m.col) % step === bestK && score[m.row * N + m.col]! > 0);
    if (filtered.length > 0) pool = filtered;
  }

  let best = -1;
  let ties: typeof fires = [];
  for (const m of pool) {
    const s = score[m.row * N + m.col]!;
    if (s > best) {
      best = s;
      ties = [m];
    } else if (s === best) ties.push(m);
  }
  if (best <= 0 || ties.length === 0) return random();
  return ties[rng.int(ties.length)]!;
}
