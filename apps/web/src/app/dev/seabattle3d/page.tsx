'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { seaBattleEngine as E, type SbMove, type SbState } from '@coldcall/games/seabattle';
import { seaBattleBot } from '@coldcall/games/seabattle-bot';
import { Rng } from '@coldcall/games/rng';
import { IllegalMoveError } from '@coldcall/games/types';
import dynamic from 'next/dynamic';
import type { BoardSettings } from '@/components/games/types';

/**
 * Local preview of the 3D Sea Battle board: the engine runs in the browser and a bot plays seat 1.
 * Query parameters for screenshots: ?phase=firing (both fleets auto placed), ?shots=N (fast
 * forward N bot shots per side), ?over=1 (play to the end), ?aim=E5, ?confirm=1, ?theme=light,
 * ?level=0..10 (bot level, default 6), ?slowbot=1 (bot never finishes placing, to see the waiting state), ?flat=1 (force the 2D fallback).
 */

const SeaBattleBoard3D = dynamic(() => import('@/components/games/seabattle/3d/SeaBattleBoard3D').then((m) => m.SeaBattleBoard3D), {
  ssr: false,
  loading: () => <div className="mx-auto aspect-square w-full max-w-[1120px] rounded-[20px] bg-[#030810]" />,
});

const ME = 0;
const BOT = 1;

export default function SeaBattle3DDevPage() {
  const [state, setState] = useState<SbState | null>(null);
  const stateRef = useRef<SbState | null>(null);
  const rngRef = useRef<Rng | null>(null);
  const [confirmMoves, setConfirmMoves] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [error, setError] = useState<string | null>(null);
  const [aim, setAim] = useState<SbMove | null>(null);
  const [level, setLevel] = useState(6);
  const [flat, setFlat] = useState(false);
  const games = useRef(0);

  const newGame = useCallback(() => {
    const params = new URLSearchParams(window.location.search);
    const rng = Rng.fromSeeds('ef'.repeat(32), games.current === 0 ? ['dev'] : ['dev', String(games.current)]);
    games.current += 1;
    rngRef.current = rng;
    let s = E.create({}, rng);
    if (params.get('phase') === 'firing' || params.get('shots') || params.get('over')) {
      s = E.applyMove(s, ME, { type: 'auto_place' }, rng);
      s = E.applyMove(s, BOT, { type: 'auto_place' }, rng);
      const n = params.get('over') ? 999 : Number(params.get('shots') ?? 0);
      for (let i = 0; i < n * 2 && !E.result(s); i++) {
        const seat = s.turn;
        s = E.applyMove(s, seat, seaBattleBot({ state: s, seat, level: seat === ME ? 4 : 8, rng }), rng);
      }
    }
    stateRef.current = s;
    setState(s);
    setError(null);
  }, []);

  const inited = useRef(false);
  useEffect(() => {
    if (inited.current) return; // StrictMode runs mount effects twice in dev
    inited.current = true;
    const params = new URLSearchParams(window.location.search);
    if (params.get('confirm') === '1') setConfirmMoves(true);
    if (params.get('flat') === '1') setFlat(true);
    const lv = Number(params.get('level'));
    if (params.get('level') && lv >= 0 && lv <= 10) setLevel(lv);
    const a = params.get('aim');
    if (a && /^[A-J](10|[1-9])$/i.test(a)) setAim({ type: 'fire', row: Number(a.slice(1)) - 1, col: a.toUpperCase().charCodeAt(0) - 65 });
    const t = params.get('theme') ?? document.documentElement.dataset.theme;
    if (t === 'light' || t === 'dark') setTheme(t);
    newGame();
  }, [newGame]);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    const obs = new MutationObserver(() => {
      if (root.dataset.theme !== theme) root.dataset.theme = theme;
    });
    obs.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, [theme]);

  const apply = useCallback((seat: number, move: SbMove) => {
    const cur = stateRef.current;
    const rng = rngRef.current;
    if (!cur || !rng) return;
    try {
      const next = E.applyMove(cur, seat, move, rng);
      stateRef.current = next;
      setState(next);
      setError(null);
    } catch (e) {
      setError(e instanceof IllegalMoveError ? e.explain : 'That move did not work. Try again.');
    }
  }, []);

  // Bot: places after a short think, fires 700ms after it becomes its turn.
  useEffect(() => {
    if (!state || E.result(state) || !E.toAct(state).includes(BOT)) return;
    const t = setTimeout(
      () => {
        const st = stateRef.current;
        const rng = rngRef.current;
        if (!st || !rng || !E.toAct(st).includes(BOT) || E.result(st)) return;
        apply(BOT, seaBattleBot({ state: st, seat: BOT, level, rng }));
      },
      state.phase === 'placing' ? (new URLSearchParams(window.location.search).get('slowbot') ? 600000 : 1800) : 700,
    );
    return () => clearTimeout(t);
  }, [state, apply, level]);

  const view = useMemo(() => (state ? E.publicView(state, ME) : null), [state]);
  const legal = useMemo(() => (state ? E.legalMoves(state, ME) : []), [state]);
  const toAct = useMemo(() => (state ? E.toAct(state) : []), [state]);

  if (!state || !view) return <div className="min-h-dvh bg-bg" />;

  const settings: BoardSettings = { sound: true, confirmMoves, boardTheme: 'night', hints: false, render3d: !flat };

  return (
    <main className="felt min-h-dvh text-text">
      <div className="mx-auto flex w-full max-w-[1160px] flex-col gap-3 px-1 py-3 sm:px-4 sm:py-5">
        <div className="flex flex-wrap items-center justify-between gap-2 px-3">
          <h1 className="font-display text-lg font-semibold">Sea Battle 3D preview</h1>
          <div className="flex flex-wrap items-center gap-1.5">
            <Toggle on={confirmMoves} onClick={() => setConfirmMoves((c) => !c)}>Confirm moves</Toggle>
            <Toggle on={theme === 'light'} onClick={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}>Light theme</Toggle>
            <button type="button" onClick={newGame} className="h-9 rounded-chip bg-surface-2 px-3 text-sm font-semibold hover:bg-line">
              New game
            </button>
          </div>
        </div>
        <SeaBattleBoard3D
          view={view}
          legal={legal}
          mySeat={ME}
          toAct={toAct}
          seatNames={['You', 'Bot Nikos']}
          lastMove={null}
          onMove={(m) => apply(ME, m)}
          settings={settings}
          hint={aim}
          error={error}
        />
      </div>
    </main>
  );
}

function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`h-9 rounded-chip px-3 text-sm font-semibold transition ${on ? 'bg-primary text-primary-ink' : 'bg-surface-2 text-text hover:bg-line'}`}
    >
      {children}
    </button>
  );
}
