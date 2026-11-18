'use client';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useMotionValueEvent, useScroll, useTransform, motion } from 'motion/react';
import { GAMES, type GameKind } from '@coldcall/shared';
import { canUse3d } from '@/lib/webgl';
import { play, haptic } from '@/lib/sound';
import { GAME_COLOR } from '@/components/app/GameArt';
import { StaticUniverse, WorldOrb } from './StaticUniverse';

const Universe = dynamic(() => import('./Universe'), { ssr: false });

const STOPS: { game: GameKind; line: string; fact: string }[] = [
  { game: 'chess', line: 'Pure skill, no luck at all. Outthink your rival and the pot is yours.', fact: 'About 10 minutes. 1 vs 1.' },
  { game: 'backgammon', line: 'Read the dice, plan your race and bring every checker home first.', fact: 'About 8 minutes. 1 vs 1. Fair dice you can check.' },
  { game: 'tichu', line: 'Team up with a partner, read the table and play the Dragon at the right time.', fact: 'About 25 minutes. 2 vs 2. Fair shuffle you can check.' },
  { game: 'seabattle', line: 'Hide your fleet, then hunt theirs. Every shot is a decision.', fact: 'About 8 minutes. 1 vs 1.' },
];

type Mode = 'pending' | '3d' | 'static';

/** How a game reads mid sentence: "Play chess free", "Play Sea Battle free". */
const gameWord = (g: GameKind) => (g === 'chess' || g === 'backgammon' ? g : GAMES[g].name);

function useWide() {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const m = window.matchMedia('(min-width: 1280px)');
    const on = () => setWide(m.matches);
    on();
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return wide;
}

/**
 * Hero plus scroll journey. One WebGL canvas, mounted after first paint and only when the device
 * can take it. At 1280px and up the canvas is sticky and the camera flies to each world as you
 * scroll. Below that it is a band at the top of the hero and the worlds become stacked cards.
 */
export function HeroJourney({ heroText, heroGame, onPlay, playLabel }: { heroText: ReactNode; heroGame: ReactNode; onPlay: () => void; playLabel: (g: string) => string }) {
  const wrap = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const wide = useWide();
  const [mode, setMode] = useState<Mode>('pending');
  const [ready, setReady] = useState(false);
  const [active, setActive] = useState(true);
  const [stop, setStop] = useState(-1);
  const { scrollYProgress } = useScroll({ target: wrap, offset: ['start start', 'end end'] });
  const railOpacity = useTransform(scrollYProgress, [0.06, 0.16, 0.92, 1], [0, 1, 1, 0.6]);

  useMotionValueEvent(scrollYProgress, 'change', (v) => {
    const p = v * STOPS.length;
    setStop(p < 0.5 ? -1 : Math.min(STOPS.length - 1, Math.round(p) - 1));
  });

  // Decide on 3D after the first paint, when the browser is idle.
  useEffect(() => {
    const go = () => setMode(canUse3d() ? '3d' : 'static');
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(go, { timeout: 1200 });
      return () => w.cancelIdleCallback?.(id);
    }
    const t = setTimeout(go, 250);
    return () => clearTimeout(t);
  }, []);

  // Pause rendering when the stage is offscreen or the tab is hidden.
  useEffect(() => {
    if (mode !== '3d' || !stage.current) return;
    let visible = true;
    let shown = document.visibilityState === 'visible';
    const apply = () => setActive(visible && shown);
    const io = new IntersectionObserver(([e]) => {
      visible = !!e?.isIntersecting;
      apply();
    });
    io.observe(stage.current);
    const vis = () => {
      shown = document.visibilityState === 'visible';
      apply();
    };
    document.addEventListener('visibilitychange', vis);
    return () => {
      io.disconnect();
      document.removeEventListener('visibilitychange', vis);
    };
  }, [mode]);

  const goTo = (k: number) => {
    const el = wrap.current;
    if (!el) return;
    play('tap');
    const top = el.getBoundingClientRect().top + window.scrollY;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: top + (k + 1) * window.innerHeight, behavior: reduce ? 'auto' : 'smooth' });
  };

  // In fallback mode the journey stops draw their own worlds, so the hero cluster steps aside.
  const showStatic = (mode === 'static' || !ready) && !(wide && stop >= 0);

  return (
    <>
      <div ref={wrap} className="lp-night relative -mt-16">
        {/* Stage: band on phones and tablets, sticky full screen at 1280px and up */}
        <div ref={stage} className="lp-nebula absolute inset-x-0 top-0 h-[300px] overflow-hidden sm:h-[420px] xl:sticky xl:-mb-[100svh] xl:h-svh">
          <div className={`absolute inset-0 transition-opacity duration-700 ${showStatic ? 'opacity-100' : 'opacity-0'}`}>
            <div className="absolute inset-y-0 left-1/2 w-full -translate-x-1/2 xl:left-[calc(50vw+39px)] xl:w-[420px]">
              <StaticUniverse compact={!wide} />
            </div>
          </div>
          {mode === '3d' ? (
            <div className={`absolute inset-0 transition-opacity duration-1000 ${ready ? 'opacity-100' : 'opacity-0'}`}>
              <Universe progress={scrollYProgress} layout={wide ? 'wide' : 'band'} active={active} onReady={() => setReady(true)} />
            </div>
          ) : null}
          <div className="lp-scrim-bottom pointer-events-none absolute inset-x-0 bottom-0 h-32 xl:hidden" aria-hidden />

          {/* journey rail */}
          <motion.nav style={{ opacity: railOpacity }} className="absolute bottom-6 left-1/2 z-10 hidden -translate-x-1/2 xl:block" aria-label="Game worlds">
            <ol className="lp-glass flex items-center gap-1 rounded-full p-1">
              {STOPS.map((s, k) => (
                <li key={s.game}>
                  <button
                    type="button"
                    onClick={() => goTo(k)}
                    aria-current={stop === k ? 'step' : undefined}
                    className={`flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold transition ${stop === k ? 'bg-white/10 text-text' : 'text-text-2 hover:text-text'}`}
                  >
                    <span className="size-2 rounded-full transition" style={{ background: GAME_COLOR[s.game], boxShadow: stop === k ? `0 0 12px ${GAME_COLOR[s.game]}` : 'none' }} aria-hidden />
                    {GAMES[s.game].name}
                  </button>
                </li>
              ))}
            </ol>
          </motion.nav>
        </div>

        {/* HERO */}
        <section className="relative pt-[252px] sm:pt-[360px] xl:h-svh xl:min-h-[760px] xl:pt-16">
          <div className="lp-scrim-left pointer-events-none absolute inset-y-0 left-0 hidden w-[60vw] xl:block" aria-hidden />
          <div className="relative mx-auto grid h-full max-w-[1200px] gap-8 px-4 pb-12 sm:px-6 md:grid-cols-2 md:items-start xl:grid-cols-[430px_1fr_352px] xl:items-center xl:pb-0">
            <div>{heroText}</div>
            <div className="hidden xl:block" aria-hidden />
            <div className="lp-rise lp-d4 mx-auto w-full max-w-[400px] md:mt-2 xl:mt-0">{heroGame}</div>
          </div>
        </section>

        {/* JOURNEY STOPS (desktop) */}
        <div className="hidden xl:block">
          {STOPS.map((s, k) => {
            const meta = GAMES[s.game];
            const c = GAME_COLOR[s.game];
            const right = k % 2 === 1;
            return (
              <section key={s.game} id={`world-${s.game}`} className="relative flex h-svh items-center" aria-label={`${meta.name} world`}>
                <div className={`mx-auto flex w-full max-w-[1200px] items-center px-6 ${right ? 'justify-end' : 'justify-start'}`}>
                  {mode === 'static' ? (
                    <div className={`absolute top-1/2 -translate-y-1/2 ${right ? 'left-[18%]' : 'right-[18%]'}`}>
                      <WorldOrb game={s.game} size={320} />
                    </div>
                  ) : null}
                  <JourneyCard index={k} game={s.game} line={s.line} fact={s.fact} color={c} onPlay={onPlay} playLabel={playLabel(gameWord(s.game))} />
                </div>
              </section>
            );
          })}
        </div>
      </div>

      {/* WORLD CARDS (phones and tablets) */}
      <section className="lp-night relative xl:hidden" aria-label="The four game worlds">
        <div className="mx-auto max-w-[1200px] px-4 pb-6 pt-4 sm:px-6">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-text-2">Four worlds</p>
          <h2 className="mt-1 font-display text-[26px] font-extrabold uppercase leading-tight">Pick your world</h2>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {STOPS.map((s) => {
              const meta = GAMES[s.game];
              const c = GAME_COLOR[s.game];
              return (
                <motion.article
                  key={s.game}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-40px' }}
                  transition={{ duration: 0.35 }}
                  className="lp-glass flex items-center gap-4 overflow-hidden rounded-card p-4"
                  style={{ ['--tint' as string]: c }}
                >
                  <WorldOrb game={s.game} size={92} className="shrink-0" />
                  <div className="min-w-0 flex-1">
                    <h3 className="font-display text-lg font-extrabold uppercase" style={{ color: c }}>
                      {meta.name}
                    </h3>
                    <p className="mt-0.5 text-[15px] leading-snug text-text">{s.line}</p>
                    <p className="mt-1 text-[13px] leading-snug text-text-2">
                      {meta.length}. {meta.teams ? '2 vs 2' : '1 vs 1'}.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        haptic('light');
                        onPlay();
                      }}
                      className="mt-2 inline-flex h-11 items-center gap-1.5 rounded-chip px-0 text-[15px] font-bold transition active:scale-[0.97]"
                      style={{ color: c }}
                    >
                      {playLabel(gameWord(s.game))}
                      <Arrow />
                    </button>
                  </div>
                </motion.article>
              );
            })}
          </div>
        </div>
      </section>
    </>
  );
}

function JourneyCard({ index, game, line, fact, color, onPlay, playLabel }: { index: number; game: GameKind; line: string; fact: string; color: string; onPlay: () => void; playLabel: string }) {
  const meta = GAMES[game];
  return (
    <motion.div
      initial={{ opacity: 0, y: 24, filter: 'blur(6px)' }}
      whileInView={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      viewport={{ amount: 0.6 }}
      transition={{ duration: 0.45, ease: [0.2, 0.8, 0.2, 1] }}
      className="lp-glass relative w-full max-w-[420px] rounded-sheet p-7"
      style={{ ['--tint' as string]: color }}
    >
      <div className="pointer-events-none absolute -left-10 -top-10 size-40 rounded-full blur-3xl" style={{ background: `${color}33` }} aria-hidden />
      <p className="relative text-[11px] font-bold uppercase tracking-[0.16em] text-text-2">
        World {index + 1} of 4
      </p>
      <h2 className="relative mt-2 font-display text-[36px] font-extrabold uppercase leading-[0.95]" style={{ color, textShadow: `0 0 32px ${color}55` }}>
        {meta.name}
      </h2>
      <p className="relative mt-4 text-[18px] leading-relaxed text-text">{line}</p>
      <p className="relative mt-2 text-[15px] text-text-2">{fact}</p>
      <div className="relative mt-6 flex items-center gap-3">
        <button
          type="button"
          onClick={() => {
            play('tap');
            onPlay();
          }}
          className="inline-flex h-12 items-center gap-2 whitespace-nowrap rounded-chip px-5 font-display text-[13px] font-bold uppercase tracking-wide text-primary-ink transition hover:brightness-110 active:scale-[0.97]"
          style={{ background: color, boxShadow: `0 8px 30px ${color}55` }}
        >
          {playLabel}
          <Arrow />
        </button>
        <Link href={`/rules/${game}`} className="inline-flex h-12 items-center rounded-chip px-3 text-[15px] font-semibold text-text-2 hover:text-text">
          Rules
        </Link>
      </div>
    </motion.div>
  );
}

function Arrow() {
  return (
    <svg viewBox="0 0 20 20" className="size-4" fill="currentColor" aria-hidden>
      <path d="M11.3 4.3a1 1 0 0 1 1.4 0l5 5a1 1 0 0 1 0 1.4l-5 5a1 1 0 1 1-1.4-1.4l3.3-3.3H3a1 1 0 1 1 0-2h11.6l-3.3-3.3a1 1 0 0 1 0-1.4Z" />
    </svg>
  );
}
