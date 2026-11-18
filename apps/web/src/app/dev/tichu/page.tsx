'use client';
/**
 * Dev preview for the Tichu table. Runs the engine in the browser: you are seat 0, bots play 1 to 3.
 * Query params for screenshots:
 *   ?auto=passing | play | lead | mahjong | dragon | bomb | summary
 *   ?pause=1                          bots stay still (for screenshots of a moment)
 *    fast forward with bots (seat 0 too) to that moment
 *   ?theme=light | dark               set the page theme
 *   ?gallery=1 | big                  show every card face (big: specials and courts, large)
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { IllegalMoveError, Rng, tichuBot, tichuBotInterrupt, tichuDeck, tichuEngine, type TichuMove, type TichuState } from '@evens/games';
import { TichuTable } from '@/components/games/tichu/TichuTable';
import { CardBack, CardFace } from '@/components/games/tichu/cards';

const NAMES = ['You', 'Iris (Bot)', 'Theo (Bot)', 'Mara (Bot)'];
const LEVELS = [6, 5, 7, 6];
const ME = 0;

interface Game {
  rng: Rng;
  botRng: Rng;
  s: TichuState;
}

function newGame(tag: string): Game {
  const rng = Rng.fromSeeds('cd'.repeat(32), [tag]);
  const botRng = Rng.fromSeeds('cd'.repeat(32), [`${tag}:bots`]);
  return { rng, botRng, s: tichuEngine.create({}, rng) };
}

/** Bombs out of turn, once per state, for bot seats (and seat 0 when it is autoplayed). */
function runInterrupts(g: Game, s: TichuState, includeMe: boolean, log: (seat: number, m: TichuMove) => void): TichuState {
  if (s.phase !== 'play') return s;
  for (const o of [0, 1, 2, 3]) {
    if (o === s.turn || (o === ME && !includeMe)) continue;
    const b = tichuBotInterrupt({ state: s, seat: o, level: LEVELS[o]!, rng: g.botRng });
    if (b) {
      s = tichuEngine.applyMove(s, o, b, g.rng);
      log(o, b);
    }
    if (s.phase !== 'play') break;
  }
  return s;
}

function fastForward(g: Game, mode: string) {
  let s = g.s;
  let last: { seat: number; move: unknown } | null = null;
  const log = (seat: number, move: TichuMove) => (last = { seat, move });
  for (let i = 0; i < 3000 && !tichuEngine.result(s); i++) {
    if (mode === 'passing' && s.phase === 'passing') break;
    if (mode === 'play' && s.phase === 'play' && s.turn === ME && s.trick.length >= 2) break;
    if (mode === 'dragon' && s.phase === 'dragon' && s.dragon?.winner === ME) break;
    if (mode === 'bomb' && s.phase === 'play' && s.turn !== ME && s.trick.length > 0 && tichuEngine.legalMoves(s, ME).some((m) => m.type === 'play')) break;
    if (mode === 'lead' && s.phase === 'play' && s.turn === ME && s.trick.length === 0 && s.lastTrick) break;
    if (mode === 'mahjong' && s.phase === 'play' && s.turn === ME && s.hands[ME]!.includes('MAHJONG')) break;
    const act = tichuEngine.toAct(s);
    const seat = act[0]!;
    const m = tichuBot({ state: s, seat, level: LEVELS[seat]!, rng: g.botRng });
    if (mode === 'summary' && seat !== ME) {
      const probe = tichuEngine.applyMove(s, seat, m, new Rng(g.rng.state));
      if (probe.rounds.length > s.rounds.length) break;
    }
    s = tichuEngine.applyMove(s, seat, m, g.rng);
    log(seat, m);
    s = runInterrupts(g, s, true, log);
  }
  g.s = s;
  return { last, reached: !tichuEngine.result(s) };
}

export default function TichuDevPage() {
  const [params, setParams] = useState<URLSearchParams | null>(null);
  const [counter, setCounter] = useState(0);
  const gameRef = useRef<Game | null>(null);
  const [, setVersion] = useState(0);
  const [lastMove, setLastMove] = useState<{ seat: number; move: unknown } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [sound, setSound] = useState(true);

  useEffect(() => setParams(new URLSearchParams(window.location.search)), []);
  if (params && !gameRef.current) {
    let g = newGame(`dev${counter || ''}`);
    const auto = params.get('auto');
    // Some moments (a Dragon trick, a bomb) need the right deal, so try a few seeds.
    for (let tries = 1; auto && !fastForward(g, auto).reached && tries < 40; tries++) g = newGame(`dev-${auto}-${tries}`);
    gameRef.current = g;
  }
  const g = gameRef.current;
  const s = g?.s ?? null;
  const bump = () => setVersion((v) => v + 1);

  useEffect(() => {
    if (!params) return;
    const t = params.get('theme');
    const cur = (t === 'light' || t === 'dark' ? t : document.documentElement.dataset.theme) === 'light' ? 'light' : 'dark';
    document.documentElement.dataset.theme = cur;
    setTheme(cur);
  }, [params]);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem('evens:theme', next);
    } catch {}
    setTheme(next);
  };

  // Bot loop: one action per state, after a human like pause.
  useEffect(() => {
    if (!g || !s || tichuEngine.result(s) || params?.get('pause')) return;
    const bots = tichuEngine.toAct(s).filter((x) => x !== ME);
    const delay = s.phase === 'grand' || s.phase === 'passing' ? 450 : 600 + Math.round(g.botRng.float() * 500);
    const t = setTimeout(() => {
      const cur = g.s;
      if (cur !== s) return;
      // 1) out of turn bombs, checked once per state
      let moved: { seat: number; move: TichuMove } | null = null;
      let next = runInterrupts(g, cur, false, (seat, move) => (moved = { seat, move }));
      if (next === cur && bots.length) {
        const seat = bots[0]!;
        const m = tichuBot({ state: cur, seat, level: LEVELS[seat]!, rng: g.botRng });
        next = tichuEngine.applyMove(cur, seat, m, g.rng);
        moved = { seat, move: m };
      }
      if (next !== cur) {
        g.s = next;
        setLastMove(moved);
        bump();
      }
    }, delay);
    return () => clearTimeout(t);
  }, [s, g, params]);

  const onMove = useCallback(
    (m: TichuMove) => {
      if (!g) return;
      const cur = g.s;
      try {
        const next = tichuEngine.applyMove(cur, ME, m, g.rng);
        setError(null);
        g.s = next;
        setLastMove({ seat: ME, move: m });
        bump();
      } catch (e) {
        setError(e instanceof IllegalMoveError ? e.explain : 'That move did not go through. Try again.');
      }
    },
    [g],
  );

  const restart = () => {
    gameRef.current = newGame(`dev${counter + 1}`);
    setCounter((c) => c + 1);
    setLastMove(null);
    setError(null);
    bump();
  };

  if (!params || !g || !s) return <main className="min-h-dvh bg-bg" />;

  if (params.get('gallery')) {
    return (
      <main className="min-h-dvh bg-bg p-4">
        <div className="flex flex-wrap gap-3">
          {(params.get('gallery') === 'big'
            ? ['MAHJONG', 'DOG', 'PHOENIX', 'DRAGON', 'SJ', 'HQ', 'DK', 'CA', 'S7', 'D8']
            : [...tichuDeck().slice(-4), ...tichuDeck().filter((c) => /^(D|S|H|C)(A|K|Q|J|10|9|8|7|6|5|4|3|2)$/.test(c))]
          ).map((c) => (
            <div key={c} style={params.get('gallery') === 'big' ? { width: 260, height: 364 } : { width: 110, height: 154 }}>
              <CardFace id={c} />
            </div>
          ))}
          <div style={{ width: 110, height: 154 }}>
            <CardBack />
          </div>
        </div>
      </main>
    );
  }

  const view = tichuEngine.publicView(s, ME);
  const legal = tichuEngine.legalMoves(s, ME);

  return (
    <main className="flex h-dvh flex-col bg-bg">
      <div className="flex h-12 shrink-0 items-center justify-between gap-2 px-3">
        <span className="whitespace-nowrap font-display text-lg font-semibold">Tichu</span>
        <div className="flex items-center gap-1">
          <button onClick={() => setSound((x) => !x)} className="h-9 whitespace-nowrap rounded-chip px-2.5 text-sm font-semibold text-text-2 hover:bg-surface-2">
            {sound ? 'Sound on' : 'Muted'}
          </button>
          <button onClick={toggleTheme} className="h-9 whitespace-nowrap rounded-chip px-2.5 text-sm font-semibold text-text-2 hover:bg-surface-2">
            {theme === 'dark' ? 'Light' : 'Dark'}
          </button>
          <button onClick={restart} className="h-9 whitespace-nowrap rounded-chip bg-surface-2 px-3 text-sm font-semibold hover:bg-line">
            New game
          </button>
        </div>
      </div>
      <div className="mx-auto min-h-0 w-full max-w-[1180px] flex-1 px-1 pb-1 sm:px-4 sm:pb-4">
        <TichuTable
          view={view}
          legal={legal}
          mySeat={ME}
          toAct={view.toAct}
          seatNames={NAMES}
          lastMove={lastMove}
          onMove={onMove}
          error={error}
          settings={{ sound, confirmMoves: false, boardTheme: 'night', hints: false }}
        />
      </div>
    </main>
  );
}
