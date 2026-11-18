'use client';
import { Suspense, useEffect, useState, type CSSProperties } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'motion/react';
import { GAMES, formatCredits, type GameKind, type Mode, type TableSummary } from '@coldcall/shared';
import { useSession } from '@/components/app/Providers';
import { GameSetupSheet } from '@/components/app/GameSetupSheet';
import { Button, Skeleton, Credits, InfoTip, Glass, Eyebrow, useTilt } from '@/components/ui';
import { api, randomClientSeed } from '@/lib/api';
import { haptic } from '@/lib/haptics';
import { WORLD, WorldArt } from '@/components/app/WorldArt';
import { ProgressStrip } from '@/components/progress';

interface HistoryRow {
  id: string;
  game: GameKind;
  mode: Mode;
  stake: number;
  status: string;
}

const ORDER: GameKind[] = ['chess', 'backgammon', 'tichu', 'seabattle'];

function WorldTile({ game, i, openTables, onOpen }: { game: GameKind; i: number; openTables: number; onOpen: (g: GameKind, m: Mode) => void }) {
  const ref = useTilt<HTMLDivElement>(6);
  const m = GAMES[game];
  const w = WORLD[game];
  return (
    <motion.div className="h-full" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 + i * 0.05, duration: 0.32, ease: [0.2, 0.8, 0.2, 1] }}>
      <div ref={ref} className="tilt glass group relative flex h-full flex-col overflow-hidden rounded-[24px] hover:shadow-[0_30px_80px_-30px_var(--tint)]" style={{ '--tint': w.c } as CSSProperties}>
        <span className="tilt-glare" aria-hidden />
        <button type="button" onClick={() => (haptic(), onOpen(game, 'bot'))} className="relative block w-full text-left" aria-label={`Play ${m.name}`}>
          <WorldArt game={game} className="h-[210px] w-full [mask-image:linear-gradient(to_bottom,#000_62%,transparent_98%)] sm:h-[230px] xl:h-[250px]" />
          <span className="absolute left-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white">{m.teams ? '2 vs 2' : '1 vs 1'}</span>
          <span className="absolute right-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#ffd23f]">Win 2x</span>
        </button>
        {/* the world's light spilling onto the panel */}
        <span className="pointer-events-none absolute inset-x-0 top-[110px] h-56 sm:top-[130px] xl:top-[150px]" style={{ background: `radial-gradient(65% 42% at 50% 50%, color-mix(in srgb, ${w.c} 20%, transparent), transparent)` }} aria-hidden />
        <div className="relative -mt-6 flex flex-1 flex-col px-4 pb-4">
          <div className="flex items-center justify-between gap-2">
            <p className="t-eyebrow game-ink truncate">{w.world}</p>
            <Link href={`/rules/${game}`} className="press -my-2 -mr-1.5 shrink-0 rounded-chip px-2.5 py-2 text-sm font-semibold game-ink hover:bg-well-hover">
              Rules
            </Link>
          </div>
          <h2 className="t-title mt-0.5 whitespace-nowrap text-[24px] xl:text-[22px]">{m.name}</h2>
          <p className="mt-1.5 text-[15px] leading-snug text-text-2">{w.hook}</p>
          <div className="mt-2 flex min-h-5 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-2">
            <span>
              {m.players} players{m.teams ? ', teams of two' : ''}. {m.length}.
            </span>
            {openTables > 0 ? (
              <span className="inline-flex items-center gap-1.5 font-semibold text-text">
                <span className="live-dot size-1.5 rounded-full" style={{ background: w.c }} aria-hidden />
                {openTables} open {openTables === 1 ? 'table' : 'tables'}
              </span>
            ) : null}
          </div>
          <div className="mt-auto grid grid-cols-3 gap-2 pt-4">
            <Button variant="secondary" size="sm" className="h-11" aria-label={`${m.name}, free practice`} onClick={() => onOpen(game, 'practice')}>
              Free
            </Button>
            <Button variant="secondary" size="sm" className="h-11" aria-label={`${m.name} against the bot`} onClick={() => onOpen(game, 'bot')}>
              Bot
            </Button>
            <button
              type="button"
              aria-label={`${m.name} against people`}
              onClick={() => (haptic(), onOpen(game, 'pvp'))}
              className="press h-11 rounded-chip text-sm font-bold text-[#0a0a0f] hover:brightness-110"
              style={{ background: `linear-gradient(180deg, color-mix(in srgb, ${w.c} 70%, #fff), ${w.c} 55%)`, boxShadow: `0 8px 24px -8px ${w.c}, inset 0 1px 0 rgba(255,255,255,.5)` }}
            >
              People
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function Lobby() {
  const { me, toast, openAuth } = useSession();
  const params = useSearchParams();
  const router = useRouter();
  const [setup, setSetup] = useState<{ game: GameKind; mode: Mode } | null>(null);
  const [tables, setTables] = useState<TableSummary[] | null>(null);
  const [stats, setStats] = useState<{ online: number; playing: number } | null>(null);
  const [active, setActive] = useState<HistoryRow | null>(null);
  const [firstBusy, setFirstBusy] = useState(false);

  useEffect(() => {
    const load = () => {
      api<TableSummary[]>('/api/tables').then(setTables).catch(() => setTables([]));
      api('/api/stats').then(setStats).catch(() => {});
    };
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!me) return setActive(null);
    api<HistoryRow[]>('/api/me/history')
      .then((rows) => setActive(rows.find((r) => r.status === 'playing' || r.status === 'waiting') ?? null))
      .catch(() => setActive(null));
  }, [me]);

  const first = params.get('first') === '1';
  const startFirst = async () => {
    setFirstBusy(true);
    try {
      const r = await api('/api/tables', { game: 'backgammon', mode: 'practice', stake: 0, visibility: 'public', clientSeed: randomClientSeed() });
      router.push(`/table/${r.id}?tutorial=1`);
    } catch (e: any) {
      toast(e.message, 'error');
      setFirstBusy(false);
    }
  };

  const open = (game: GameKind, mode: Mode) => (me ? setSetup({ game, mode }) : openAuth());
  const live = stats ? [stats.online > 0 ? `${stats.online} ${stats.online === 1 ? 'player' : 'players'} online` : null, stats.playing > 0 ? `${stats.playing} ${stats.playing === 1 ? 'game' : 'games'} in play` : null].filter(Boolean) : [];

  return (
    <div>
      <ProgressStrip className="mb-6" />

      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <Eyebrow className="mb-2">Four worlds, one vault</Eyebrow>
          <h1 className="t-display">
            Pick your <span className="t-grad-primary">world</span>
          </h1>
        </div>
        {live.length ? (
          <p className="glass inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-sm text-text-2">
            <span className="live-dot size-2 rounded-full bg-primary shadow-[0_0_10px_var(--primary)]" aria-hidden />
            {live.join(', ')}.
          </p>
        ) : null}
      </div>

      {first && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
          <Glass spill tint="var(--primary)" className="mt-5 flex flex-col gap-3 overflow-hidden rounded-[20px] p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative">
              <p className="t-title">Your first game is on us</p>
              <p className="mt-1 text-text-2">A free practice backgammon game. Hints are on, no credits involved.</p>
            </div>
            <Button size="lg" className="relative" loading={firstBusy} onClick={startFirst}>
              Play my first game
            </Button>
          </Glass>
        </motion.div>
      )}

      {active && !first ? (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <Link
            href={`/table/${active.id}`}
            className="glass press group mt-5 flex items-center gap-4 overflow-hidden rounded-[20px] p-3 pr-4 hover:brightness-110"
            style={{ '--tint': WORLD[active.game].c } as CSSProperties}
            aria-label={`Continue your ${GAMES[active.game].name} game`}
          >
            <WorldArt game={active.game} className="h-16 w-24 shrink-0 rounded-[14px]" />
            <span className="min-w-0 flex-1">
              <span className="t-eyebrow game-ink block">{active.status === 'waiting' ? 'Waiting for players' : 'Game in progress'}</span>
              <span className="mt-1 block truncate font-semibold">
                {GAMES[active.game].name} {active.mode === 'practice' ? 'practice' : active.mode === 'bot' ? 'vs bot' : 'vs people'}
                {active.mode !== 'practice' ? (
                  <span className="ml-2 text-sm font-normal text-text-2">
                    stake <Credits minor={active.stake} />
                  </span>
                ) : null}
              </span>
            </span>
            <span className="btn-primary inline-flex h-10 shrink-0 items-center rounded-chip px-4 text-sm font-bold">Continue</span>
          </Link>
        </motion.div>
      ) : null}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {ORDER.filter((g) => g in GAMES).map((g, i) => (
          <WorldTile key={g} game={g} i={i} openTables={tables?.filter((t) => t.game === g).length ?? 0} onOpen={open} />
        ))}
      </div>

      <section className="mt-10">
        <div className="flex items-center gap-1">
          <h2 className="t-title">Open tables</h2>
          <InfoTip text="Tables where someone is waiting for an opponent. Join one to start right away." />
        </div>
        <div className="mt-4 space-y-2">
          {tables === null ? (
            <>
              <Skeleton className="h-[72px]" />
              <Skeleton className="h-[72px]" />
            </>
          ) : tables.length === 0 ? (
            <Glass className="flex flex-col items-center gap-1 rounded-card p-6 text-center">
              <p className="font-semibold">No one is waiting right now.</p>
              <p className="text-text-2">Tap People on any game to open a table, or play the bot.</p>
            </Glass>
          ) : (
            tables.map((t) => (
              <div key={t.id} className="glass flex items-center justify-between gap-3 overflow-hidden rounded-card p-4 pl-5" style={{ '--tint': WORLD[t.game].c } as CSSProperties}>
                <span className="absolute inset-y-3 left-0 w-[3px] rounded-full" style={{ background: WORLD[t.game].c, boxShadow: `0 0 12px ${WORLD[t.game].c}` }} aria-hidden />
                <div className="min-w-0">
                  <p className="font-semibold">
                    {GAMES[t.game].name}
                    {t.time ? <span className="ml-2 text-sm font-normal text-text-2">{t.time}</span> : null}
                  </p>
                  <p className="truncate text-sm text-text-2">
                    {t.seats.filter((s) => s.userId).map((s) => s.name).join(', ')} waiting, {t.seats.filter((s) => !s.userId).length} open {t.seats.filter((s) => !s.userId).length === 1 ? 'seat' : 'seats'}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-sm text-text-2">
                    Stake <Credits minor={t.stake} />
                  </span>
                  <Button
                    size="sm"
                    onClick={async () => {
                      if (!me) return openAuth();
                      try {
                        await api(`/api/tables/${t.id}/join`, { clientSeed: randomClientSeed() });
                        router.push(`/table/${t.id}`);
                      } catch (e: any) {
                        toast(e.message, 'error');
                      }
                    }}
                  >
                    Join for {formatCredits(t.stake + t.fee)}
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <GameSetupSheet game={setup?.game ?? null} initialMode={setup?.mode} open={!!setup} onClose={() => setSetup(null)} />
    </div>
  );
}

export default function PlayPage() {
  return (
    <Suspense>
      <Lobby />
    </Suspense>
  );
}
