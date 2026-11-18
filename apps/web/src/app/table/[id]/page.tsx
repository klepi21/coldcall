'use client';
import { Suspense, use, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { AnimatePresence, motion } from 'motion/react';
import { GAMES, entryCost, formatAmount, type TableSummary } from '@coldcall/shared';
import { useSession } from '@/components/app/Providers';
import { AuthSheet } from '@/components/app/AuthSheet';
import { OnboardingSheet } from '@/components/app/OnboardingSheet';
import { Button, Card, Amount, Sheet, Spinner, InfoTip, Logo, Mascot } from '@/components/ui';
import { api, randomClientSeed } from '@/lib/api';
import { play, haptic } from '@/lib/sound';
import type { BoardSettings } from '@/components/games/types';
import { RulesSheet } from '@/components/app/RulesSheet';
import { canUse3d } from '@/lib/webgl';
import { CapturedTray, MoveList } from '@/components/games/chess/ChessBoard';
import { ResultXp } from '@/components/progress';

const ChessBoard = dynamic(() => import('@/components/games/chess/ChessBoard').then((m) => m.ChessBoard), { ssr: false, loading: () => <BoardSkeleton /> });
const BackgammonBoard = dynamic(() => import('@/components/games/backgammon/BackgammonBoard').then((m) => m.BackgammonBoard), { ssr: false, loading: () => <BoardSkeleton /> });
const ChessBoard3D = dynamic(() => import('@/components/games/chess/3d/ChessBoard3D').then((m) => m.ChessBoard3D), { ssr: false, loading: () => <BoardSkeleton /> });
const BackgammonBoard3D = dynamic(() => import('@/components/games/backgammon/3d/BackgammonBoard3D').then((m) => m.BackgammonBoard3D), { ssr: false, loading: () => <BoardSkeleton /> });
const SeaBattleBoard3D = dynamic(() => import('@/components/games/seabattle/3d/SeaBattleBoard3D').then((m) => m.SeaBattleBoard3D), { ssr: false, loading: () => <BoardSkeleton /> });
const SeaBattleBoard = dynamic(() => import('@/components/games/seabattle/SeaBattleBoard').then((m) => m.SeaBattleBoard), { ssr: false, loading: () => <BoardSkeleton /> });
const TichuTable = dynamic(() => import('@/components/games/tichu/TichuTable').then((m) => m.TichuTable), { ssr: false, loading: () => <BoardSkeleton /> });

function BoardSkeleton() {
  return <div className="aspect-square w-full animate-pulse rounded-card bg-surface-2" />;
}

interface StateMsg {
  seq: number;
  view: any;
  toAct: number[];
  clocks: number[] | null;
  deadline: number | null;
  lastMove: { seat: number; move: unknown } | null;
  legal: unknown[];
}
interface ResultMsg {
  result: { winners: number[]; draw: boolean; reason: string; score?: Record<string, number> };
  payouts: { seat: number; delta: number }[];
  serverSeed: string;
}

const REASONS: Record<string, string> = {
  checkmate: 'by checkmate',
  resign: 'by resignation',
  timeout: 'on time',
  abandon: 'because a player left',
  stalemate: 'by stalemate',
  insufficient_material: 'not enough pieces left to checkmate',
  repetition: 'by repetition',
  fifty_moves: 'by the fifty move rule',
  fleet_sunk: 'by sinking the whole fleet',
  agreement: 'by agreement',
  single: 'by bearing off first',
  gammon: 'with a gammon',
  backgammon: 'with a backgammon',
  score_limit: 'by reaching the target score',
};

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

const fmtClock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

function PlayerBar({ name, isBot, active, clockMs, me, connected, extra, team }: { name: string; isBot: boolean; active: boolean; clockMs: number | null; me?: boolean; connected: boolean; extra?: React.ReactNode; team?: number }) {
  const low = clockMs !== null && clockMs < 10_000;
  return (
    <div className={`flex items-center justify-between gap-3 rounded-card px-3 py-2 transition ${active ? 'bg-surface ring-1 ring-primary/50' : 'bg-transparent'}`}>
      <div className="flex min-w-0 items-center gap-2.5">
        <span className={`relative inline-flex size-9 shrink-0 items-center justify-center rounded-full font-semibold ${team === 1 ? 'bg-gold/20 text-gold' : 'bg-primary/20 text-primary'}`}>
          {isBot ? (
            <svg viewBox="0 0 20 20" className="size-5" fill="currentColor" aria-hidden>
              <path d="M9 2h2v2h3a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3h3V2Zm-2 7a1.3 1.3 0 1 0 0 2.6A1.3 1.3 0 0 0 7 9Zm6 0a1.3 1.3 0 1 0 0 2.6A1.3 1.3 0 0 0 13 9Z" />
            </svg>
          ) : (
            name.slice(0, 1).toUpperCase()
          )}
          {!isBot && <span className={`absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-bg ${connected ? 'bg-win' : 'bg-line'}`} aria-label={connected ? 'online' : 'offline'} />}
        </span>
        <div className="min-w-0">
          <p className="truncate font-semibold">
            {name}
            {me ? <span className="ml-1.5 text-sm font-normal text-text-2">(you)</span> : null}
            {isBot ? <span className="ml-1.5 rounded bg-surface-2 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-text-2">Bot</span> : null}
          </p>
          {extra ? <div className="text-sm text-text-2">{extra}</div> : null}
        </div>
      </div>
      {clockMs !== null && (
        <span className={`tabular rounded-chip px-3 py-1.5 font-display text-lg font-bold uppercase ${active ? (low ? 'bg-loss text-white' : 'bg-text text-bg') : 'bg-surface-2 text-text-2'}`} aria-label={`${fmtClock(clockMs)} left`}>
          {fmtClock(clockMs)}
        </span>
      )}
    </div>
  );
}

function TablePageInner({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { me, socket, toast, refresh, authOpen, openAuth, ready } = useSession();
  const router = useRouter();
  const search = useSearchParams();
  const [table, setTable] = useState<TableSummary | null>(null);
  const [you, setYou] = useState<number | null>(null);
  const [state, setState] = useState<StateMsg | null>(null);
  const [result, setResult] = useState<ResultMsg | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState(false);
  const [rules, setRules] = useState(search.get('tutorial') === '1');
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [resultOpen, setResultOpen] = useState(false);
  const [reactions, setReactions] = useState<{ id: number; seat: number; emoji: string }[]>([]);
  const [recap, setRecap] = useState<{ move: string; text: string }[] | null>(null);
  const [notFound, setNotFound] = useState(false);
  const rid = useRef(0);
  const sessionStart = useRef(Date.now());

  useEffect(() => {
    api(`/api/tables/${id}`).catch(() => setNotFound(true));
    socket.watch(id);
    const off = socket.on((m) => {
      if (m.tableId && m.tableId !== id && m.t !== 'table') return;
      if (m.t === 'table' && m.table.id === id) {
        setTable(m.table);
        setYou(m.you);
      }
      if (m.t === 'state') {
        setState({ ...m, _at: Date.now() });
        setBusy(false);
        setError(null);
      }
      if (m.t === 'result') {
        setResult(m);
        setResultOpen(true);
      }
      if (m.t === 'error' && (!m.tableId || m.tableId === id)) {
        setBusy(false);
        if (m.code !== 'stale') {
          setError(m.message);
          toast(m.message, 'error');
          play('error');
        }
      }
      if (m.t === 'react' && m.tableId === id) {
        const rId = ++rid.current;
        setReactions((r) => [...r, { id: rId, seat: m.seat, emoji: m.emoji }]);
        setTimeout(() => setReactions((r) => r.filter((x) => x.id !== rId)), 2500);
      }
    });
    return () => {
      off();
      socket.unwatch(id);
    };
  }, [id, socket, toast]);

  // Session reminder every 60 minutes (responsible play).
  useEffect(() => {
    const t = setInterval(() => {
      if (Date.now() - sessionStart.current > 60 * 60_000) {
        toast('You have been playing for an hour. Fancy a short break?');
        sessionStart.current = Date.now();
      }
    }, 60_000);
    return () => clearInterval(t);
  }, [toast]);

  useEffect(() => {
    if (!result || !table) return;
    const mine = result.payouts.find((p) => p.seat === you);
    const won = you !== null && result.result.winners.includes(you);
    if (won) (play('win'), haptic('strong'));
    else if (!result.result.draw && you !== null) play('lose');
    if (mine && mine.delta > 0) setTimeout(() => play('coin'), 500);
    void refresh();
    if (table.game === 'chess' && table.mode !== 'practice')
      api(`/api/tables/${id}/recap`)
        .then((r) => setRecap(r.moments))
        .catch(() => setRecap([]));
  }, [result]); // eslint-disable-line react-hooks/exhaustive-deps

  const [use3d, setUse3d] = useState(false);
  useEffect(() => setUse3d(canUse3d()), []);
  const playing = table?.status === 'playing';
  const now = useNow(!!playing && !!state?.clocks);
  const onMove = useCallback(
    (move: unknown) => {
      if (!state) return;
      setBusy(true);
      socket.send({ t: 'move', tableId: id, move, seq: state.seq });
    },
    [socket, id, state],
  );

  const settings: BoardSettings = useMemo(
    () => ({
      sound: me?.settings?.sound !== false,
      confirmMoves: me?.settings?.confirmMoves ?? (table ? table.mode !== 'practice' && table.stake >= 1500 : false),
      boardTheme: me?.settings?.boardTheme ?? 'marble',
      hints: me?.settings?.hints ?? table?.mode === 'practice',
      render3d: me?.settings?.render3d ?? true,
    }),
    [me?.settings, table],
  );

  if (notFound)
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
        <Logo className="size-12" />
        <p className="font-display text-xl font-bold uppercase">We could not find that table</p>
        <p className="text-text-2">It may have ended or the link is wrong.</p>
        <Button onClick={() => router.push('/play')}>Back to games</Button>
      </div>
    );

  if (!table)
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Spinner className="size-6 text-primary" />
      </div>
    );

  const meta = GAMES[table.game];
  const cost = entryCost(table.mode, table.stake, table.currency);
  const seatNames = table.seats.map((s) => s.name);
  const clockFor = (seat: number) => {
    if (!state?.clocks) return null;
    const base = state.clocks[seat] ?? 0;
    const running = playing && state.toAct[0] === seat;
    // server sent clocks at message time; count down locally from there
    return running ? Math.max(0, base - (now - (state as any)._at)) : base;
  };

  const mySeat = you;
  const bottomSeat = mySeat ?? 0;
  const topSeat = table.capacity === 2 ? 1 - bottomSeat : (bottomSeat + 2) % 4;
  const seatInfo = (s: number) => table.seats[s]!;
  const turnDeadline = state?.deadline && !state.clocks ? Math.max(0, state.deadline - now) : null;
  const myTurn = mySeat !== null && !!state?.toAct.includes(mySeat);

  const joinTable = async (justOnboarded = false) => {
    if (!me) return openAuth();
    if (!me.onboarded && !justOnboarded) return; // the setup sheet is open and joins when it is done
    try {
      await api(`/api/tables/${id}/join`, { clientSeed: randomClientSeed() });
    } catch (e: any) {
      toast(e.message, 'error');
    }
  };

  const leave = async () => {
    if (table.status === 'waiting' && mySeat !== null) {
      try {
        await api(`/api/tables/${id}/leave`, {});
        toast(table.mode === 'pvp' && cost.total ? `You left. ${formatAmount(cost.total, table.currency)} is back in your balance.` : 'You left the table.');
      } catch (e: any) {
        toast(e.message, 'error');
      }
    }
    router.push('/play');
  };

  const resign = () => {
    socket.send({ t: 'resign', tableId: id });
    setConfirmLeave(false);
    setMenu(false);
  };

  const board = state && (
    <>
      {table.game === 'chess' && use3d && settings.render3d && <ChessBoard3D view={state.view} legal={state.legal as any} mySeat={mySeat} toAct={state.toAct} seatNames={seatNames} lastMove={state.lastMove} onMove={onMove} busy={busy} settings={settings} error={error} />}
      {table.game === 'backgammon' && use3d && settings.render3d && <BackgammonBoard3D view={state.view} legal={state.legal as any} mySeat={mySeat} toAct={state.toAct} seatNames={seatNames} lastMove={state.lastMove} onMove={onMove} busy={busy} settings={settings} error={error} />}
      {table.game === 'chess' && !(use3d && settings.render3d) && <ChessBoard view={state.view} legal={state.legal as any} mySeat={mySeat} toAct={state.toAct} seatNames={seatNames} lastMove={state.lastMove} onMove={onMove} busy={busy} settings={settings} error={error} />}
      {table.game === 'backgammon' && !(use3d && settings.render3d) && <BackgammonBoard view={state.view} legal={state.legal as any} mySeat={mySeat} toAct={state.toAct} seatNames={seatNames} lastMove={state.lastMove} onMove={onMove} busy={busy} settings={settings} error={error} />}
      {table.game === 'seabattle' && use3d && settings.render3d && <SeaBattleBoard3D view={state.view} legal={state.legal as any} mySeat={mySeat} toAct={state.toAct} seatNames={seatNames} lastMove={state.lastMove} onMove={onMove} busy={busy} settings={settings} error={error} />}
      {table.game === 'seabattle' && !(use3d && settings.render3d) && <SeaBattleBoard view={state.view} legal={state.legal as any} mySeat={mySeat} toAct={state.toAct} seatNames={seatNames} lastMove={state.lastMove} onMove={onMove} busy={busy} settings={settings} error={error} />}
      {table.game === 'tichu' && <TichuTable view={state.view} legal={state.legal as any} mySeat={mySeat} toAct={state.toAct} seatNames={seatNames} lastMove={state.lastMove} onMove={onMove} busy={busy} settings={settings} error={error} />}
    </>
  );

  const myPayout = result?.payouts.find((p) => p.seat === mySeat);
  const iWon = mySeat !== null && !!result?.result.winners.includes(mySeat);

  return (
    <div className="page-root relative isolate min-h-dvh felt">
      {/* light snowfall behind the table; it stops under reduced motion */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden opacity-60" aria-hidden>
        <div className="snowfall snowfall-1" />
      </div>
      {/* Top bar */}
      <header className="glass-blur sticky top-0 z-30 flex h-14 items-center justify-between gap-2 bg-[color-mix(in_srgb,var(--bg)_70%,transparent)] px-3 pt-[env(safe-area-inset-top)] sm:px-5">
        <button onClick={() => (playing && mySeat !== null ? setConfirmLeave(true) : leave())} className="inline-flex h-10 items-center gap-1 rounded-chip px-2 font-semibold text-text-2 hover:bg-surface-2 hover:text-text" aria-label="Leave table">
          <svg viewBox="0 0 20 20" className="size-5" fill="currentColor" aria-hidden>
            <path d="M12.7 4.3a1 1 0 0 1 0 1.4L8.4 10l4.3 4.3a1 1 0 1 1-1.4 1.4l-5-5a1 1 0 0 1 0-1.4l5-5a1 1 0 0 1 1.4 0Z" />
          </svg>
          <span className="hidden sm:inline">Lobby</span>
        </button>
        <div className="min-w-0 text-center">
          <p className="truncate font-display text-[17px] font-semibold">{meta.name}</p>
          <p className="truncate text-xs text-text-2">
            {table.mode === 'practice' ? 'Practice, free' : table.mode === 'bot' ? `Against the bot, stake ${formatAmount(table.stake, table.currency)}` : `Against people, stake ${formatAmount(table.stake, table.currency)}`}
            {table.time ? `, ${table.time}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setRules(true)}
            className="inline-flex size-10 items-center justify-center rounded-chip text-text-2 hover:bg-surface-2 hover:text-text"
            aria-label={`${table.game === 'backgammon' ? 'Fair dice' : table.game === 'tichu' ? 'Fair shuffle' : 'Game'} info and rules`}
          >
            <svg viewBox="0 0 20 20" className="size-5" fill="currentColor" aria-hidden>
              <path d="M10 2 3 5v5c0 4 3 7 7 8 4-1 7-4 7-8V5l-7-3Zm-1 11.4-3-3 1.4-1.4L9 10.6l3.6-3.6L14 8.4l-5 5Z" />
            </svg>
          </button>
          <button onClick={() => setMenu(true)} className="inline-flex size-10 items-center justify-center rounded-chip text-text-2 hover:bg-surface-2 hover:text-text" aria-label="Menu">
            <svg viewBox="0 0 20 20" className="size-5" fill="currentColor" aria-hidden>
              <circle cx="10" cy="4" r="1.8" />
              <circle cx="10" cy="10" r="1.8" />
              <circle cx="10" cy="16" r="1.8" />
            </svg>
          </button>
        </div>
      </header>

      <div className={`mx-auto px-2 pb-6 sm:px-4 ${table.game === 'tichu' || table.game === 'seabattle' ? 'max-w-[1100px]' : 'max-w-[640px] lg:max-w-[1000px]'}`}>
        {table.status === 'waiting' ? (
          <WaitingRoom table={table} mySeat={mySeat} onLeave={leave} onBots={async () => {
            try {
              const r = await api(`/api/tables/${id}/bots`, {});
              router.replace(`/table/${r.id}`);
            } catch (e: any) {
              toast(e.message, 'error');
            }
          }} onJoin={() => joinTable()} />
        ) : table.game === 'tichu' || table.game === 'seabattle' ? (
          <div className="pt-1">
            {turnDeadline !== null && myTurn && playing ? <TurnTimer ms={turnDeadline} /> : null}
            {board ?? <BoardSkeleton />}
          </div>
        ) : (
          <div className="lg:grid lg:grid-cols-[1fr_280px] lg:gap-6">
            <div className="space-y-2 pt-1">
              <PlayerBar name={seatInfo(topSeat).name} isBot={seatInfo(topSeat).isBot} connected={seatInfo(topSeat).connected} active={!!playing && !!state?.toAct.includes(topSeat)} clockMs={clockFor(topSeat)} extra={table.game === 'chess' && state ? <CapturedTray view={state.view} seat={topSeat} /> : null} />
              <div className="relative">
                {board ?? <BoardSkeleton />}
                <AnimatePresence>
                  {reactions.map((r) => (
                    <motion.span key={r.id} initial={{ opacity: 0, y: 10, scale: 0.6 }} animate={{ opacity: 1, y: -30, scale: 1.2 }} exit={{ opacity: 0 }} className={`pointer-events-none absolute left-1/2 text-4xl ${r.seat === bottomSeat ? 'bottom-6' : 'top-6'}`}>
                      {r.emoji}
                    </motion.span>
                  ))}
                </AnimatePresence>
              </div>
              <PlayerBar name={seatInfo(bottomSeat).name} isBot={seatInfo(bottomSeat).isBot} connected={seatInfo(bottomSeat).connected} me={mySeat !== null} active={!!playing && !!state?.toAct.includes(bottomSeat)} clockMs={clockFor(bottomSeat)} extra={table.game === 'chess' && state ? <CapturedTray view={state.view} seat={bottomSeat} /> : null} />
              {turnDeadline !== null && myTurn && playing ? <TurnTimer ms={turnDeadline} /> : null}
              {mySeat !== null && playing && table.mode === 'pvp' ? (
                <div className="flex justify-center gap-1 pt-1" aria-label="Send a reaction">
                  {['👍', '👏', '😮', '😅', '🔥', '🤝'].map((e) => (
                    <button key={e} onClick={() => socket.send({ t: 'react', tableId: id, emoji: e })} className="size-10 rounded-full text-xl hover:bg-surface-2" aria-label={`React ${e}`}>
                      {e}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <aside className="mt-4 hidden space-y-3 lg:block">
              {table.game === 'chess' && state ? (
                <Card className="p-4">
                  <p className="mb-2 text-sm font-semibold text-text-2">Moves</p>
                  <MoveList view={state.view} className="max-h-72" />
                </Card>
              ) : null}
              <StakeCard table={table} />
              <Card className="p-4 text-sm text-text-2">
                <p className="font-semibold text-text">Fair {table.game === 'backgammon' ? 'dice' : 'play'}</p>
                <p className="mt-1">Seed lock for this game:</p>
                <p className="mt-1 break-all font-mono text-[11px]">{table.seedCommit}</p>
                <p className="mt-2">We reveal the seed when the game ends so you can check it.</p>
              </Card>
            </aside>
          </div>
        )}
      </div>

      {/* Menu */}
      <Sheet open={menu} onClose={() => setMenu(false)} title="Menu">
        <div className="space-y-2">
          <Button variant="secondary" full onClick={() => (setMenu(false), setRules(true))}>
            Rules and fairness
          </Button>
          <Link href={`/verify/${id}`} className="flex h-11 items-center justify-center rounded-chip bg-surface-2 font-semibold hover:bg-line">
            Verify this game
          </Link>
          {playing && mySeat !== null ? (
            <Button variant="danger" full onClick={() => (setMenu(false), setConfirmLeave(true))}>
              Resign
            </Button>
          ) : null}
          <Button variant="ghost" full onClick={() => router.push('/play')}>
            Back to lobby
          </Button>
        </div>
        <div className="mt-5 lg:hidden">
          <StakeCard table={table} />
        </div>
      </Sheet>

      {/* Leave or resign confirmation */}
      <Sheet open={confirmLeave} onClose={() => setConfirmLeave(false)} title="Leave this game?">
        <p className="text-text-2">
          {table.mode === 'practice'
            ? 'This is a free practice game. If you resign it simply ends.'
            : `If you resign, the game counts as a loss and your ${formatAmount(cost.total, table.currency)} is not returned. If you just close the page, your clock keeps running.`}
        </p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={() => setConfirmLeave(false)}>
            Keep playing
          </Button>
          <Button variant="danger" onClick={resign}>
            Resign
          </Button>
        </div>
        <Button variant="ghost" full className="mt-2" onClick={() => router.push('/play')}>
          Go to lobby, game keeps running
        </Button>
      </Sheet>

      <RulesSheet game={table.game} open={rules} onClose={() => setRules(false)} seedCommit={table.seedCommit} tutorial={search.get('tutorial') === '1'} />

      {/* Result */}
      <Sheet open={resultOpen && !!result} onClose={() => setResultOpen(false)}>
        {result && (
          <div className="text-center">
            <motion.div initial={{ scale: 0.6, opacity: 0, y: 12 }} animate={{ scale: 1, opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 18 }} className="relative mx-auto -mt-2 mb-1 grid size-36 place-items-center">
              {iWon ? (
                <>
                  <span className="frost-burst left-1/2 top-1/2 -ml-16 -mt-16 size-32" aria-hidden />
                  <span className="frost-burst left-1/2 top-1/2 -ml-16 -mt-16 size-32 [animation-delay:180ms]" aria-hidden />
                </>
              ) : null}
              <span className="absolute inset-6 rounded-full blur-2xl" style={{ background: iWon ? 'color-mix(in srgb, var(--win) 30%, transparent)' : 'color-mix(in srgb, var(--accent) 18%, transparent)' }} aria-hidden />
              <Mascot pose={iWon ? 'win' : 'shrug'} className="relative size-36" priority />
            </motion.div>
            <h2 className="font-display text-3xl">
              {mySeat === null ? `${result.result.winners.map((w) => seatNames[w]).join(' and ')} won` : iWon ? 'Nice hand. You won.' : result.result.draw ? 'A draw' : 'That one got away'}
            </h2>
            <p className="mt-1 text-text-2">
              {result.result.draw ? `The game ended ${REASONS[result.result.reason] ?? ''}.` : `${iWon ? 'You' : result.result.winners.map((w) => seatNames[w]).join(' and ')} won ${REASONS[result.result.reason] ?? ''}.`}
              {!iWon && !result.result.draw && mySeat !== null ? ' Rematch?' : ''}
            </p>
            {result.result.score ? (
              <p className="mt-2 text-sm text-text-2">
                Final score {Object.entries(result.result.score).map(([k, v]) => `${k.replace('team0', 'Your team').replace('team1', 'Opponents')} ${v}`).join(', ')}
              </p>
            ) : null}
            {table.mode !== 'practice' && myPayout ? (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="mt-5 rounded-card bg-surface-2 p-4">
                <p className="text-sm text-text-2">Your {table.currency}</p>
                <Amount minor={myPayout.delta} currency={table.currency} sign className={`mt-1 justify-center font-display text-3xl ${myPayout.delta > 0 ? 'text-gold' : myPayout.delta < 0 ? 'text-loss' : ''}`} />
                <p className="mt-2 text-xs text-text-2">
                  {myPayout.delta > 0 ? 'Added to your balance.' : myPayout.delta < 0 ? `Your stake${cost.fee ? ' and fee' : ''} for this game.` : 'Your stake came back.'}
                </p>
              </motion.div>
            ) : null}
            {mySeat !== null && me ? <ResultXp tableId={id} celebrate={iWon} /> : null}
            {recap && recap.length > 0 ? (
              <div className="mt-4 rounded-card border border-line p-4 text-left">
                <p className="mb-2 font-semibold">Key moments</p>
                <ul className="space-y-2 text-sm">
                  {recap.map((m) => (
                    <li key={m.move}>
                      <span className="font-semibold">{m.move}</span> <span className="text-text-2">{m.text}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="mt-6 grid grid-cols-2 gap-2">
              <Button
                onClick={async () => {
                  try {
                    const r = table.mode === 'pvp'
                      ? await api('/api/tables/quick', { game: table.game, currency: table.currency, stake: table.stake, time: table.time ?? undefined, clientSeed: randomClientSeed() })
                      : await api('/api/tables', { game: table.game, mode: table.mode, currency: table.currency, stake: table.stake, visibility: 'public', time: table.time ?? undefined, clientSeed: randomClientSeed() });
                    router.push(`/table/${r.id}`);
                  } catch (e: any) {
                    toast(e.message, 'error');
                  }
                }}
              >
                Play again
              </Button>
              <Button variant="secondary" onClick={() => router.push('/play')}>
                Lobby
              </Button>
            </div>
            <Link href={`/verify/${id}`} className="mt-3 inline-block text-sm font-semibold text-primary">
              Verify this game
            </Link>
          </div>
        )}
      </Sheet>

      {ready && !me && table.status === 'waiting' ? null : null}
      <AuthSheet open={authOpen} onClose={() => openAuth(false)} />
      {/* New players arriving from an invite finish sign up here and take their seat, without leaving the table. */}
      <OnboardingSheet onDone={table.status === 'waiting' && mySeat === null ? () => void joinTable(true) : () => {}} doneLabel={table.status === 'waiting' && mySeat === null ? 'Take my seat' : 'Continue'} />
    </div>
  );
}

function TurnTimer({ ms }: { ms: number }) {
  const s = Math.ceil(ms / 1000);
  useEffect(() => {
    if (s <= 10 && s > 0) play('tick');
  }, [s]);
  return (
    <p className={`py-1 text-center text-sm font-semibold ${s <= 10 ? 'text-loss' : 'text-text-2'}`} role="timer">
      {s > 0 ? `Your turn. ${s} seconds left.` : 'Time is up.'}
    </p>
  );
}

function StakeCard({ table }: { table: TableSummary }) {
  if (table.mode === 'practice') return <Card className="p-4 text-sm text-text-2">Free practice game. No coins involved.</Card>;
  const cost = entryCost(table.mode, table.stake, table.currency);
  return (
    <Card className="p-4 text-sm">
      <p className="mb-2 inline-flex items-center gap-1 font-semibold">
        Held for this game <InfoTip text="Your stake is held safely until the game ends, then paid out automatically." href="/how-it-works#stakes" />
      </p>
      <div className="flex justify-between py-1 text-text-2">
        <span>Your stake</span>
        <Amount minor={table.stake} currency={table.currency} />
      </div>
      {cost.fee ? (
        <div className="flex justify-between py-1 text-text-2">
          <span>Cold Call fee</span>
          <Amount minor={cost.fee} currency={table.currency} />
        </div>
      ) : null}
      <div className="flex justify-between py-1 text-text-2">
        <span>If you win</span>
        <Amount currency={table.currency} minor={table.mode === 'bot' ? table.stake * 2 : Math.floor((table.stake * table.capacity) / (table.game === 'tichu' ? 2 : 1))} className="text-win" />
      </div>
    </Card>
  );
}

function WaitingRoom({ table, mySeat, onLeave, onBots, onJoin }: { table: TableSummary; mySeat: number | null; onLeave: () => void; onBots: () => void; onJoin: () => void }) {
  const [copied, setCopied] = useState(false);
  const [waited, setWaited] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setWaited((w) => w + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const link = typeof window !== 'undefined' ? (table.inviteCode ? `${location.origin}/invite/${table.inviteCode}` : `${location.origin}/table/${table.id}`) : '';
  const cost = entryCost(table.mode, table.stake, table.currency);
  return (
    <div className="mx-auto max-w-md pt-6">
      <Card className="p-6 pt-2 text-center">
        <Mascot pose="deal" className="mx-auto size-28" />
        <div className="mx-auto mb-4 flex justify-center gap-3">
          {table.seats.map((s) => (
            <motion.div key={s.seat} animate={s.userId ? { scale: 1 } : { scale: [1, 1.06, 1] }} transition={s.userId ? {} : { repeat: Infinity, duration: 1.6 }} className={`flex size-14 items-center justify-center rounded-full text-lg font-semibold ${s.userId ? 'bg-primary/20 text-primary' : 'border-2 border-dashed border-line text-text-2'}`}>
              {s.userId ? s.name.slice(0, 1).toUpperCase() : '?'}
            </motion.div>
          ))}
        </div>
        <h2 className="font-display text-2xl">{mySeat === null ? 'A seat is open' : 'Lucky Lo is dealing you in'}</h2>
        <p className="mt-2 text-text-2">
          {table.seats.filter((s) => s.userId).length} of {table.capacity} seated. The game starts as soon as the table is full.
        </p>
        {mySeat === null ? (
          <Button size="lg" full className="mt-5" onClick={onJoin}>
            Join for {formatAmount(cost.total, table.currency)}
          </Button>
        ) : (
          <>
            <div className="mt-5 flex gap-2">
              <input readOnly value={link} className="h-11 min-w-0 flex-1 rounded-chip border border-line bg-surface-2 px-3 text-sm" aria-label="Invite link" />
              <Button
                variant="secondary"
                onClick={async () => {
                  await navigator.clipboard.writeText(link);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
              >
                {copied ? 'Copied' : 'Copy link'}
              </Button>
            </div>
            <p className="mt-2 text-sm text-text-2">Send this link to a friend. It opens straight to this table.</p>
            {waited > 45 && table.game !== 'tichu' ? (
              <div className="mt-5 rounded-chip bg-surface-2 p-4 text-left text-sm">
                <p className="font-semibold">Nobody yet. What would you like to do?</p>
                <p className="mt-1 text-text-2">You can keep waiting, play the bot at the same stake, or leave with a full refund including the fee.</p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Button size="sm" onClick={onBots}>
                    Play the bot
                  </Button>
                  <Button size="sm" variant="secondary" onClick={onLeave}>
                    Leave, full refund
                  </Button>
                </div>
              </div>
            ) : (
              <Button variant="ghost" full className="mt-4" onClick={onLeave}>
                Leave table{cost.total ? `, full refund of ${formatAmount(cost.total, table.currency)}` : ''}
              </Button>
            )}
          </>
        )}
      </Card>
    </div>
  );
}

export default function TablePage(props: { params: Promise<{ id: string }> }) {
  return (
    <Suspense>
      <TablePageInner {...props} />
    </Suspense>
  );
}
