'use client';
/**
 * Dev preview for the chess board. Runs the engine in the browser: you play one side,
 * the other side replies with a random legal move after 600ms.
 *
 * Query params (for screenshots without clicking):
 *   ?moves=e2e4,e7e5   replay moves first      ?seat=1        play black
 *   ?theme=night        board theme             ?page=light    page theme
 *   ?select=g1          show a selection        ?promo=e7e8    open the promotion picker
 *   ?pending=g1f3       show the confirm bar    ?hint=1        show a hint arrow
 *   ?fen=...            custom start position   ?bot=0         turn the bot off
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { chessEngine, Rng, type ChessMove, type ChessState } from '@evens/games';
import { ChessBoard, CapturedTray, MoveList, type ChessDevPreview } from '@/components/games/chess/ChessBoard';
import type { BoardSettings } from '@/components/games/types';

const rng = () => Rng.fromSeeds('00'.repeat(32), ['dev']);
const parseMove = (s: string): ChessMove => ({ from: s.slice(0, 2), to: s.slice(2, 4), ...(s[4] ? { promotion: s[4] as ChessMove['promotion'] } : {}) });

function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="flex h-11 items-center justify-between gap-3 rounded-chip bg-surface-2 px-3 text-left text-[14px] leading-tight font-semibold text-text"
    >
      {label}
      <span className={`relative h-6 w-10 rounded-full transition ${on ? 'bg-primary' : 'bg-line'}`}>
        <span className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} />
      </span>
    </button>
  );
}

function PlayerBar({ name, tag, initial, active, clock, children }: { name: string; tag?: string; initial: string; active: boolean; clock: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-2 font-display text-[17px] font-semibold text-text ring-1 ring-line">{initial}</div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[15px] font-semibold text-text">{name}</span>
          {tag ? <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[12px] font-semibold text-text-2">{tag}</span> : null}
        </div>
        {children}
      </div>
      <div
        className={`tabular rounded-chip px-3 py-1.5 text-[18px] font-semibold transition ${active ? 'bg-text text-bg' : 'bg-surface-2 text-text-2'}`}
        aria-label={`${name} clock ${clock}${active ? ', running' : ''}`}
      >
        {clock}
      </div>
    </div>
  );
}

export default function ChessDevPage() {
  const [params, setParams] = useState<URLSearchParams | null>(null);
  useEffect(() => setParams(new URLSearchParams(window.location.search)), []);

  const [mySeat, setMySeat] = useState(0);
  const [boardTheme, setBoardTheme] = useState<BoardSettings['boardTheme']>('marble');
  const [confirmMoves, setConfirmMoves] = useState(false);
  const [pageLight, setPageLight] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [botOn, setBotOn] = useState(true);
  const [state, setState] = useState<ChessState>(() => chessEngine.create({}, rng()));
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ChessDevPreview | undefined>(undefined);
  const [boardKey, setBoardKey] = useState(0);

  // Apply query params once on the client.
  useEffect(() => {
    if (!params) return;
    const seat = params.get('seat') === '1' ? 1 : 0;
    setMySeat(seat);
    if (params.get('theme') === 'night') setBoardTheme('night');
    if (params.get('confirm') === '1') setConfirmMoves(true);
    if (params.get('hint') === '1') setShowHint(true);
    if (params.get('bot') === '0') setBotOn(false);
    const page = params.get('page');
    if (page === 'light' || page === 'dark') setPageLight(page === 'light');
    else setPageLight(document.documentElement.dataset.theme === 'light');
    let s = chessEngine.create(params.get('fen') ? { fen: params.get('fen')! } : {}, rng());
    for (const m of (params.get('moves') ?? '').split(',').filter(Boolean)) {
      try {
        s = chessEngine.applyMove(s, chessEngine.toAct(s)[0]!, parseMove(m), rng());
      } catch {
        break;
      }
    }
    setState(s);
    const pv: ChessDevPreview = {};
    if (params.get('select')) pv.select = params.get('select')!;
    if (params.get('promo')) pv.promo = { from: params.get('promo')!.slice(0, 2), to: params.get('promo')!.slice(2, 4) };
    if (params.get('pending')) pv.pending = parseMove(params.get('pending')!);
    setPreview(Object.keys(pv).length ? pv : undefined);
    setBoardKey((k) => k + 1);
  }, [params]);

  useEffect(() => {
    if (!params) return;
    document.documentElement.dataset.theme = pageLight ? 'light' : 'dark';
  }, [pageLight, params]);

  const botSeat = 1 - mySeat;
  const view = useMemo(() => chessEngine.publicView(state, mySeat), [state, mySeat]);
  const toAct = useMemo(() => chessEngine.toAct(state), [state]);
  const legal = useMemo(() => chessEngine.legalMoves(state, mySeat), [state, mySeat]);
  const hint = useMemo(() => (showHint && legal.length ? legal[Math.floor(legal.length / 2)]! : null), [showHint, legal]);

  // Bot reply
  useEffect(() => {
    if (!botOn || !toAct.includes(botSeat)) return;
    const t = setTimeout(() => {
      setState((s) => {
        const moves = chessEngine.legalMoves(s, botSeat);
        if (!moves.length) return s;
        const caps = moves.filter((m) => {
          try {
            return !!chessEngine.applyMove(s, botSeat, m, rng()).history.at(-1)?.captured;
          } catch {
            return false;
          }
        });
        const pool = caps.length && Math.random() < 0.6 ? caps : moves;
        return chessEngine.applyMove(s, botSeat, pool[Math.floor(Math.random() * pool.length)]!, rng());
      });
    }, 600);
    return () => clearTimeout(t);
  }, [toAct, botSeat, botOn]);

  const [busy, setBusy] = useState(false);
  const latency = Number(params?.get('latency') ?? 0);
  const onMove = useCallback(
    (m: ChessMove) => {
      setError(null);
      const apply = () => {
        setBusy(false);
        try {
          setState(chessEngine.applyMove(state, mySeat, m, rng()));
        } catch (e) {
          setError((e as { explain?: string }).explain ?? 'That move did not work.');
        }
      };
      // ?latency=400 imitates a server round trip so optimistic moves and busy are exercised.
      if (latency > 0) {
        setBusy(true);
        setTimeout(apply, latency);
      } else apply();
    },
    [mySeat, state, latency],
  );

  const reset = () => {
    setState(chessEngine.create({}, rng()));
    setError(null);
    setPreview(undefined);
  };

  const settings: BoardSettings = { sound: true, confirmMoves, boardTheme, hints: showHint };
  const seatNames = mySeat === 0 ? ['You', 'Bot'] : ['Bot', 'You'];
  const status = view.result
    ? view.result.draw
      ? 'Draw'
      : view.result.winners.includes(mySeat)
        ? 'You won'
        : 'Bot won'
    : toAct.includes(mySeat)
      ? view.inCheck
        ? 'You are in check'
        : 'Your move'
      : 'Bot is thinking';

  return (
    <main className="felt min-h-dvh">
      <div className="mx-auto max-w-[1200px] px-2 pb-10 pt-3 sm:px-6 lg:pt-6">
        <header className="mb-2 flex items-center justify-between px-2 lg:mb-6 lg:px-0">
          <div>
            <h1 className="font-display text-lg font-bold uppercase leading-tight text-text">Chess board</h1>
            <p className="text-[14px] text-text-2">Dev preview. The bot plays random moves.</p>
          </div>
          <span className="shrink-0 whitespace-nowrap rounded-full bg-surface px-3 py-1.5 text-[13px] font-semibold text-text-2 shadow-card" aria-live="polite">
            {status}
          </span>
        </header>

        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-8">
          <section className="mx-auto w-full lg:max-w-[min(100%,calc(100dvh-290px))]">
            <div className="px-2 lg:px-0">
              <PlayerBar name="Bot" tag="Bot" initial="B" active={!view.result && toAct.includes(botSeat)} clock="5:00">
                <CapturedTray view={view} seat={botSeat} />
              </PlayerBar>
            </div>
            <ChessBoard
              key={boardKey}
              view={view}
              legal={legal}
              mySeat={mySeat}
              toAct={toAct}
              seatNames={seatNames}
              lastMove={null}
              onMove={onMove}
              busy={busy}
              settings={settings}
              hint={hint}
              error={error}
              devPreview={preview}
            />
            <div className="px-2 lg:px-0">
              <PlayerBar name="You" initial="Y" active={!view.result && toAct.includes(mySeat)} clock="5:00">
                <CapturedTray view={view} seat={mySeat} />
              </PlayerBar>
            </div>
          </section>

          <aside className="mt-4 space-y-4 px-2 lg:mt-[60px] lg:px-0">
            <div className="rounded-card bg-surface p-3 shadow-card">
              <h2 className="mb-1 px-2 text-[13px] font-semibold uppercase tracking-wide text-text-2">Moves</h2>
              <MoveList view={view} className="h-[148px] lg:h-[260px]" />
            </div>
            <div className="rounded-card bg-surface p-3 shadow-card">
              <h2 className="mb-2 px-1 text-[13px] font-semibold uppercase tracking-wide text-text-2">Settings</h2>
              <div className="grid grid-cols-2 gap-2">
                <Toggle label="Night board" on={boardTheme === 'night'} onChange={(v) => setBoardTheme(v ? 'night' : 'marble')} />
                <Toggle label="Play black" on={mySeat === 1} onChange={(v) => { setMySeat(v ? 1 : 0); reset(); }} />
                <Toggle label="Confirm moves" on={confirmMoves} onChange={setConfirmMoves} />
                <Toggle label="Light page" on={pageLight} onChange={setPageLight} />
                <Toggle label="Show hint" on={showHint} onChange={setShowHint} />
                <Toggle label="Bot moves" on={botOn} onChange={setBotOn} />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button type="button" onClick={reset} className="h-11 rounded-chip bg-primary text-[15px] font-semibold text-primary-ink shadow-card hover:brightness-110">
                  New game
                </button>
                <button
                  type="button"
                  onClick={() => setError((e) => (e ? null : 'That piece cannot move there.'))}
                  className="h-11 rounded-chip bg-surface-2 text-[15px] font-semibold text-text hover:bg-line"
                >
                  Test error shake
                </button>
              </div>
              {error ? <p className="mt-3 px-1 text-[14px] text-loss">{error}</p> : null}
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
