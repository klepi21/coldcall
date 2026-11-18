'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { backgammonBot, backgammonEngine, IllegalMoveError, Rng, type BgConfig, type BgMove, type BgState } from '@evens/games';
import { BackgammonBoard } from '@/components/games/backgammon';
import type { BoardSettings } from '@/components/games/types';

/** Local preview of the backgammon board: the engine runs in the browser, a bot plays the other seat. */

const SCENARIOS: Record<string, NonNullable<BgConfig['setup']>> = {
  // A tall stack, a checker on the bar for you, and a blot to hit when you come in.
  hit: {
    board: (() => {
      const b = new Array<number>(24).fill(0);
      b[5] = 6; b[7] = 3; b[12] = 3; b[23] = 2;
      b[21] = -1; b[18] = -4; b[16] = -3; b[11] = -5; b[0] = -2;
      return b;
    })(),
    bar: [1, 0],
    turn: 0,
    dice: [3, 5],
  },
  // Bearing off, both sides have checkers in the tray.
  bearoff: {
    board: (() => {
      const b = new Array<number>(24).fill(0);
      b[0] = 2; b[1] = 3; b[2] = 3; b[3] = 2; b[4] = 2;
      b[23] = -3; b[22] = -3; b[20] = -4; b[18] = -2;
      return b;
    })(),
    off: [3, 3],
    turn: 0,
    dice: [6, 4],
  },
  // Only one checker can move.
  one: {
    board: (() => {
      const b = new Array<number>(24).fill(0);
      b[0] = 14; b[8] = 1;
      b[23] = -15;
      return b;
    })(),
    turn: 0,
    dice: [2, 1],
  },
};

const sameMove = (a: BgMove, b: BgMove) =>
  !('type' in a) && !('type' in b) && a.from === b.from && a.to === b.to && a.die === b.die;

export default function BackgammonDevPage() {
  const [state, setState] = useState<BgState | null>(null);
  const stateRef = useRef<BgState | null>(null);
  const rngRef = useRef<Rng | null>(null);
  const planRef = useRef<{ key: string; queue: BgMove[] } | null>(null);
  const [flip, setFlip] = useState(false);
  const [confirmMoves, setConfirmMoves] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [error, setError] = useState<string | null>(null);
  const [showHint, setShowHint] = useState(false);
  const games = useRef(0);

  const me = flip ? 1 : 0;
  const bot = 1 - me;

  const newGame = useCallback(() => {
    const params = new URLSearchParams(window.location.search);
    const scen = SCENARIOS[params.get('scenario') ?? ''];
    const rng = Rng.fromSeeds('ab'.repeat(32), games.current === 0 ? ['dev'] : ['dev', String(games.current)]);
    games.current += 1;
    rngRef.current = rng;
    planRef.current = null;
    const s = backgammonEngine.create(scen ? { setup: scen } : {}, rng);
    stateRef.current = s;
    setState(s);
    setError(null);
  }, []);

  const inited = useRef(false);
  useEffect(() => {
    if (inited.current) return; // StrictMode runs mount effects twice in dev
    inited.current = true;
    const params = new URLSearchParams(window.location.search);
    if (params.get('flip') === '1') setFlip(true);
    if (params.get('confirm') === '1') setConfirmMoves(true);
    if (params.get('hint') === '1') setShowHint(true);
    const t = params.get('theme') ?? document.documentElement.dataset.theme;
    if (t === 'light' || t === 'dark') setTheme(t);
    newGame();
  }, [newGame]);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    // The app shell may apply the saved account theme after mount; keep the preview's choice.
    const obs = new MutationObserver(() => {
      if (root.dataset.theme !== theme) root.dataset.theme = theme;
    });
    obs.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, [theme]);

  const apply = useCallback((seat: number, move: BgMove) => {
    const cur = stateRef.current;
    const rng = rngRef.current;
    if (!cur || !rng) return;
    try {
      const next = backgammonEngine.applyMove(cur, seat, move, rng);
      stateRef.current = next;
      setState(next);
      setError(null);
    } catch (e) {
      setError(e instanceof IllegalMoveError ? e.explain : 'That move did not work. Try again.');
    }
  }, []);

  // Bot: one step every 500ms, with a slightly longer first think.
  useEffect(() => {
    if (!state || backgammonEngine.result(state) || state.turn !== bot) return;
    const key = `${state.history.length}-${state.turn}`;
    const t = setTimeout(
      () => {
        const st = stateRef.current;
        const rng = rngRef.current;
        if (!st || !rng || st.turn !== bot || backgammonEngine.result(st)) return;
        const legal = backgammonEngine.legalMoves(st, bot);
        let next = planRef.current?.key === key ? planRef.current.queue[0] : undefined;
        if (!next || !legal.some((m) => sameMove(m, next!))) {
          const queue = backgammonBot({ state: st, seat: bot, level: 6, rng });
          planRef.current = { key, queue };
          next = queue[0];
        }
        if (!next) return;
        planRef.current!.queue = planRef.current!.queue.slice(1);
        apply(bot, next);
      },
      state.steps.length === 0 ? 1100 : 500,
    );
    return () => clearTimeout(t);
  }, [state, bot, apply]);

  const view = useMemo(() => (state ? backgammonEngine.publicView(state, me) : null), [state, me]);
  const legal = useMemo(() => (state ? backgammonEngine.legalMoves(state, me) : []), [state, me]);
  const toAct = useMemo(() => (state ? backgammonEngine.toAct(state) : []), [state]);

  if (!state || !view) {
    return <div className="min-h-dvh bg-bg" />;
  }

  const seatNames = flip ? ['Bot Eleni', 'You'] : ['You', 'Bot Eleni'];
  const settings: BoardSettings = { sound: true, confirmMoves, boardTheme: 'marble', hints: showHint };

  return (
    <main className="felt min-h-dvh text-text">
      <div className="mx-auto flex w-full flex-col gap-3 px-1 py-3 sm:py-5" style={{ maxWidth: 'max(390px, min(880px, calc((100dvh - 330px) * 1.25)))' }}>
        <div className="flex flex-wrap items-center justify-between gap-2 px-3">
          <h1 className="font-display text-lg font-semibold">Backgammon preview</h1>
          <div className="flex flex-wrap items-center gap-1.5">
            <Toggle on={flip} onClick={() => setFlip((f) => !f)}>Play as seat 2</Toggle>
            <Toggle on={confirmMoves} onClick={() => setConfirmMoves((c) => !c)}>Confirm moves</Toggle>
            <Toggle on={theme === 'light'} onClick={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}>Light theme</Toggle>
            <button type="button" onClick={newGame} className="h-9 rounded-chip bg-surface-2 px-3 text-sm font-semibold hover:bg-line">
              New game
            </button>
          </div>
        </div>

        <PlayerBar name={seatNames[bot]!} seat={bot} pips={view.pipCount[bot as 0 | 1]} active={toAct.includes(bot)} bot />
        <BackgammonBoard
          view={view}
          legal={legal}
          mySeat={me}
          toAct={toAct}
          seatNames={seatNames}
          lastMove={null}
          onMove={(m) => apply(me, m)}
          settings={settings}
          hint={showHint ? (legal[0] ?? null) : null}
          error={error}
        />
        <PlayerBar name="You" seat={me} pips={view.pipCount[me as 0 | 1]} active={toAct.includes(me)} />
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

function PlayerBar({ name, seat, pips, active, bot }: { name: string; seat: number; pips: number; active: boolean; bot?: boolean }) {
  return (
    <div className={`mx-1 flex items-center gap-3 rounded-card px-3 py-2.5 transition ${active ? 'bg-surface shadow-card' : 'bg-surface/50'}`}>
      <span
        className="relative inline-flex size-10 shrink-0 items-center justify-center rounded-full font-display text-lg font-semibold"
        style={{
          background: seat === 0 ? 'radial-gradient(circle at 35% 30%, #fffbf2, #cdbe9f)' : 'radial-gradient(circle at 35% 30%, #47527a, #0d1222)',
          color: seat === 0 ? '#3a2a14' : '#f4efe6',
        }}
        aria-hidden
      >
        {name.replace('Bot ', '').charAt(0)}
        {active ? <span className="absolute -right-0.5 -top-0.5 size-3 rounded-full border-2 border-surface bg-win" /> : null}
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 truncate font-semibold">
          {name}
          {bot ? <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-semibold text-text-2">Bot</span> : null}
        </p>
        <p className="text-sm text-text-2">{active ? (bot ? 'Thinking' : 'Your turn') : 'Waiting'}</p>
      </div>
      <div className="text-right">
        <p className="text-xs text-text-2">Pips</p>
        <p className="tabular font-semibold">{pips}</p>
      </div>
    </div>
  );
}
