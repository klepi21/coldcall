'use client';
import Link from 'next/link';
import { useRef, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { GAMES, formatCredits, type GameKind } from '@coldcall/shared';
import { GameArt, GAME_COLOR } from '@/components/app/GameArt';
import { TileLoop, CountUp } from '@/components/app/LandingFx';
import { Coin } from '@/components/ui';
import { play, haptic } from '@/lib/sound';
import { VaultCoin, WorldGlyph } from './StaticUniverse';

export function Kicker({ children, color = 'var(--primary)' }: { children: ReactNode; color?: string }) {
  return (
    <p className="text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color }}>
      {children}
    </p>
  );
}

export function H2({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <h2 className={`mt-1 font-display text-[28px] font-extrabold uppercase leading-[1.05] sm:text-[40px] ${className}`}>{children}</h2>;
}

export function Rise({ children, delay = 0, className = '' }: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 12, filter: 'blur(4px)' }}
      whileInView={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.32, delay, ease: [0.2, 0.8, 0.2, 1] }}
    >
      {children}
    </motion.div>
  );
}

/** Card that tilts toward the pointer with a moving glare. Touch devices just get the press squash. */
export function Tilt({ children, color, className = '', onClick, label }: { children: ReactNode; color: string; className?: string; onClick?: () => void; label?: string }) {
  const ref = useRef<HTMLButtonElement>(null);
  const move = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse' || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    ref.current.style.setProperty('--ry', `${(x - 0.5) * 14}deg`);
    ref.current.style.setProperty('--rx', `${(0.5 - y) * 12}deg`);
    ref.current.style.setProperty('--gx', `${x * 100}%`);
    ref.current.style.setProperty('--gy', `${y * 100}%`);
  };
  const leave = () => {
    ref.current?.style.setProperty('--rx', '0deg');
    ref.current?.style.setProperty('--ry', '0deg');
  };
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      onPointerMove={move}
      onPointerLeave={leave}
      onPointerEnter={(e) => e.pointerType === 'mouse' && play('tick')}
      onClick={() => {
        haptic('light');
        play('tap');
        onClick?.();
      }}
      className={`lp-tilt group relative overflow-hidden rounded-card text-left ${className}`}
      style={{ boxShadow: `0 0 0 1px ${color}40, 0 18px 50px -20px ${color}66` }}
    >
      {children}
      <span className="lp-glare" aria-hidden />
    </button>
  );
}

const TILE_ORDER: GameKind[] = ['chess', 'backgammon', 'tichu', 'seabattle'];

export function LivingTiles({ onPlay }: { onPlay: () => void }) {
  return (
    <section className="mx-auto hidden max-w-[1200px] px-4 py-16 sm:px-6 sm:py-24 xl:block">
      <Rise>
        <Kicker>Four games, one account</Kicker>
        <H2>Choose a table</H2>
        <p className="mt-3 max-w-xl text-[17px] text-text-2">Practice any game free, play a fair bot any time of day, or find a real opponent at your stake.</p>
      </Rise>
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {TILE_ORDER.map((g, i) => {
          const m = GAMES[g];
          const c = GAME_COLOR[g];
          return (
            <Rise key={g} delay={i * 0.04}>
              <Tilt color={c} onClick={onPlay} label={`Play ${m.name}`} className="w-full bg-surface">
                <div className="relative">
                  <GameArt game={g} className="h-40 w-full transition duration-300 group-hover:scale-[1.04]" />
                  <TileLoop game={g} />
                  <span className="absolute left-3 top-3 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase" style={{ background: `${c}26`, color: c, boxShadow: `inset 0 0 0 1px ${c}55` }}>
                    {m.teams ? '2 vs 2' : '1 vs 1'}
                  </span>
                </div>
                <div className="p-4">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-display text-[17px] font-extrabold uppercase">{m.name}</h3>
                    <span className="inline-flex size-9 items-center justify-center rounded-full transition group-hover:translate-x-0.5" style={{ background: `${c}22`, color: c }} aria-hidden>
                      <svg viewBox="0 0 20 20" className="size-4" fill="currentColor">
                        <path d="M7 4l7 6-7 6V4Z" />
                      </svg>
                    </span>
                  </div>
                  <p className="mt-1 text-[15px] text-text-2">{m.tagline}</p>
                  <p className="mt-3 text-[13px] text-text-2">
                    {m.length}. Against the bot: {m.botTarget.replace('You win about', 'you win about').replace('Your team wins about', 'your team wins about')}
                  </p>
                </div>
              </Tilt>
            </Rise>
          );
        })}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ money flow */

const STEPS = [
  {
    t: 'Add money',
    d: 'Money you add goes into a public vault on Solana. You get credits one to one: 1 credit is 1 cent.',
    icon: 'M3 7a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v1h-6a4 4 0 0 0 0 8h6v1a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V7Zm12 3h7v4h-7a2 2 0 1 1 0-4Z',
  },
  {
    t: 'Play',
    d: 'Pick a stake. Your credits are held for that game and the full summary is shown before you start.',
    icon: 'M7 6h10a5 5 0 0 1 4.9 6l-1 5a3 3 0 0 1-5.2 1.4L14 16h-4l-1.7 2.4A3 3 0 0 1 3.1 17l-1-5A5 5 0 0 1 7 6Zm1 3v1.5H6.5v2H8V14h2v-1.5h1.5v-2H10V9H8Zm8.5 1a1 1 0 1 0 0 2 1 1 0 0 0 0-2Zm-2 2a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z',
  },
  {
    t: 'Cash out',
    d: 'Winnings land in your balance the second the game ends. Cash out any time, straight to your wallet.',
    icon: 'M12 3l5 5h-3v6h-4V8H7l5-5ZM4 15h2v3h12v-3h2v5H4v-5Z',
  },
];

export function MoneyFlow({ vault }: { vault: ReactNode }) {
  return (
    <section className="relative overflow-hidden border-y border-line/60 bg-[radial-gradient(70%_60%_at_50%_0%,rgba(255,210,63,.08),transparent_70%)]">
      <div className="mx-auto max-w-[1200px] px-4 py-16 sm:px-6 sm:py-24">
        <Rise>
          <Kicker color="var(--gold)">How money works</Kicker>
          <H2>Every credit sits in a vault you can check</H2>
          <p className="mt-3 max-w-2xl text-[17px] text-text-2">Three steps, no crypto knowledge needed. In this beta every credit is test money with no real value.</p>
        </Rise>

        <div className="relative mt-10">
          {/* travelling coin along the line (desktop) */}
          <div className="pointer-events-none absolute left-[16%] right-[16%] top-[44px] hidden h-px bg-gradient-to-r from-[#ffd23f]/0 via-[#ffd23f]/50 to-[#ffd23f]/0 md:block" aria-hidden>
            <span className="lp-travel absolute -top-[9px] -ml-[9px] size-[18px] drop-shadow-[0_0_10px_rgba(255,210,63,.9)]">
              <Coin className="size-full" />
            </span>
          </div>
          <ol className="relative grid gap-4 md:grid-cols-3 md:gap-6">
            {STEPS.map((s, i) => (
              <Rise key={s.t} delay={i * 0.06}>
                <li className="flex gap-4 md:flex-col md:items-center md:text-center">
                  <div className="relative shrink-0">
                    <span className="lp-glass flex size-[88px] items-center justify-center rounded-full" style={{ ['--tint' as string]: '#ffd23f' }}>
                      <svg viewBox="0 0 24 24" className="size-9 text-gold" fill="currentColor" aria-hidden>
                        <path d={s.icon} />
                      </svg>
                    </span>
                    <span className="absolute -right-1 -top-1 flex size-7 items-center justify-center rounded-full bg-gold font-display text-[13px] font-extrabold text-[#1a1200]">{i + 1}</span>
                  </div>
                  <div>
                    <h3 className="font-display text-[19px] font-extrabold uppercase md:mt-3">{s.t}</h3>
                    <p className="mt-1 max-w-xs text-[16px] leading-relaxed text-text-2">{s.d}</p>
                  </div>
                </li>
              </Rise>
            ))}
          </ol>
        </div>

        <div className="mt-14 grid items-center gap-8 lg:grid-cols-[1fr_440px]">
          <Rise>
            <div className="flex items-center gap-5">
              <div className="hidden shrink-0 sm:block">
                <VaultCoin size={112} />
              </div>
              <div>
                <h3 className="font-display text-[22px] font-extrabold uppercase">Check the vault yourself</h3>
                <p className="mt-2 max-w-lg text-[16px] leading-relaxed text-text-2">
                  The vault is a public contract on Solana and its balance is live for anyone to see. Next to it we show what we owe players, from our own records, checked every 5 minutes.
                </p>
                <Link href="/how-it-works#vault" className="mt-3 inline-flex h-11 items-center font-semibold text-primary">
                  How the vault works
                </Link>
              </div>
            </div>
          </Rise>
          <Rise delay={0.06}>{vault}</Rise>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ two ways to win */

export function TwoWays({ calculator }: { calculator: ReactNode }) {
  return (
    <section className="mx-auto max-w-[1200px] px-4 py-16 sm:px-6 sm:py-24">
      <Rise>
        <Kicker>What you can win</Kicker>
        <H2>Two ways to win</H2>
      </Rise>
      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <Rise>
          <div className="lp-glass h-full rounded-sheet p-6 sm:p-7" style={{ ['--tint' as string]: '#c6ff3d' }}>
            <div className="flex items-center gap-3">
              <span className="flex size-11 items-center justify-center rounded-full bg-primary/15 text-primary" aria-hidden>
                <svg viewBox="0 0 24 24" className="size-6" fill="currentColor">
                  <path d="M8 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM2 20c0-3.3 2.7-6 6-6s6 2.7 6 6H2Zm13 0c0-2-.7-3.8-1.9-5.2A5 5 0 0 1 22 19v1h-7Z" />
                </svg>
              </span>
              <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-primary">Against people</p>
            </div>
            <p className="mt-4 font-display text-[24px] font-extrabold uppercase leading-tight">Winner takes the pot</p>
            <p className="mt-2 text-[16px] leading-relaxed text-text-2">Everyone puts in the same stake. Beat them and the whole pot is yours. Evens charges a 5% fee on your stake, shown before you join.</p>
            <div className="mt-5 flex flex-wrap items-center gap-2 rounded-card bg-white/[0.04] px-4 py-3 text-[15px]">
              <Coin className="size-5" /> You put in 5, they put in 5, <strong className="text-primary">you win 10</strong>
            </div>
          </div>
        </Rise>
        <Rise delay={0.05}>
          <div className="lp-glass h-full rounded-sheet p-6 sm:p-7" style={{ ['--tint' as string]: '#7c5cff' }}>
            <div className="flex items-center gap-3">
              <span className="flex size-11 items-center justify-center rounded-full bg-accent/20 text-[#a993ff]" aria-hidden>
                <svg viewBox="0 0 24 24" className="size-6" fill="currentColor">
                  <path d="M11 2h2v3h4a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3h4V2ZM9 10a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm6 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm-6 5v1.5h6V15H9Z" />
                </svg>
              </span>
              <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-[#a993ff]">Against the bot</p>
            </div>
            <p className="mt-4 font-display text-[24px] font-extrabold uppercase leading-tight">Win 2x your stake</p>
            <p className="mt-2 text-[16px] leading-relaxed text-text-2">
              No fee. The bot matches your level so games stay close, and the house keeps a flat, published 5% edge. A chess draw returns 90% of your stake.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-2 rounded-card bg-white/[0.04] px-4 py-3 text-[15px]">
              <Coin className="size-5" /> Put in 5 against the bot, <strong className="text-[#a993ff]">win 10 back</strong>
            </div>
          </div>
        </Rise>
      </div>
      <div className="mt-6">
        <Rise>{calculator}</Rise>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ safer play */

const SAFE = [
  ['Fair dice and shuffles', 'Every roll and deal is locked before the game and revealed after, so you can check it yourself.', '/how-it-works#fairness', 'M12 2 4 5v6c0 5 3.5 9 8 11 4.5-2 8-6 8-11V5l-8-3Zm-1 13-4-4 1.4-1.4L11 12.2l4.6-4.6L17 9l-6 6Z'],
  ['Limits and breaks', 'Set daily and weekly limits, take a break, or pause your account for months. An hourly reminder keeps time in view.', '/how-it-works#limits', 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm1 5v5.4l4 2.4-1 1.7-5-3V7h2Z'],
  ['Bots that never read your wallet', 'The bot adjusts to how you play, never to your balance or your losses.', '/how-it-works', 'M11 2h2v3h4a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3h4V2ZM9 10a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm6 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z'],
] as const;

export function SaferPlay() {
  return (
    <section className="mx-auto max-w-[1200px] px-4 py-16 sm:px-6">
      <Rise>
        <Kicker color="#3ddcff">Safer play</Kicker>
        <H2>Play on your terms</H2>
        <p className="mt-3 max-w-xl text-[17px] text-text-2">Treat credit games like a paid game, not income. 18+ only. Practice games are always free.</p>
      </Rise>
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {SAFE.map(([t, d, href, icon], i) => (
          <Rise key={t} delay={i * 0.05}>
            <Link href={href} className="lp-glass group flex h-full flex-col rounded-card p-6 transition hover:-translate-y-1" style={{ ['--tint' as string]: '#3ddcff' }}>
              <span className="flex size-11 items-center justify-center rounded-full bg-[#3ddcff]/12 text-[#3ddcff] transition group-hover:scale-110" aria-hidden>
                <svg viewBox="0 0 24 24" className="size-6" fill="currentColor">
                  <path d={icon} />
                </svg>
              </span>
              <h3 className="mt-4 font-display text-[17px] font-extrabold uppercase">{t}</h3>
              <p className="mt-2 flex-1 text-[16px] leading-relaxed text-text-2">{d}</p>
              <span className="mt-3 font-semibold text-primary">Learn more</span>
            </Link>
          </Rise>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ FAQ */

export function Faq({ items }: { items: string[][] }) {
  return (
    <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <Rise>
        <Kicker>Questions</Kicker>
        <H2>Good to know</H2>
      </Rise>
      <div className="lp-glass mt-8 divide-y divide-white/10 rounded-sheet">
        {items.map(([q, a]) => (
          <details key={q} className="group px-5 py-1" onToggle={(e) => (e.currentTarget as HTMLDetailsElement).open && play('tick')}>
            <summary className="flex min-h-[56px] cursor-pointer list-none items-center justify-between gap-4 text-[17px] font-semibold [&::-webkit-details-marker]:hidden">
              {q}
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-primary transition duration-200 group-open:rotate-45" aria-hidden>
                <svg viewBox="0 0 20 20" className="size-4" fill="currentColor">
                  <path d="M9 4h2v5h5v2h-5v5H9v-5H4V9h5V4Z" />
                </svg>
              </span>
            </summary>
            <p className="pb-5 pr-10 text-[16px] leading-relaxed text-text-2">{a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ final CTA */

export function FinalCta({ onPlay, label }: { onPlay: () => void; label: string }) {
  return (
    <section className="px-4 pb-16 sm:px-6">
      <div className="lp-night lp-nebula relative mx-auto max-w-[1200px] overflow-hidden rounded-sheet px-6 py-14 text-center sm:py-20">
        <div className="lp-stars pointer-events-none absolute inset-0" aria-hidden />
        <div className="pointer-events-none absolute inset-x-0 -bottom-28 flex justify-center gap-10 opacity-50 sm:gap-24" aria-hidden>
          {TILE_ORDER.map((g, i) => (
            <span key={g} className="lp-float block size-24 sm:size-32" style={{ animationDelay: `${i * -1.1}s` }}>
              <WorldGlyph game={g} className="size-full opacity-60" />
            </span>
          ))}
        </div>
        <div className="relative">
          <p className="font-display text-[34px] font-extrabold uppercase leading-none sm:text-[60px]">
            Your move<span className="text-primary">.</span>
          </p>
          <p className="mx-auto mt-4 max-w-md text-[17px] text-text-2">Your first game is free. No card, no crypto knowledge, no catch.</p>
          <button
            type="button"
            onClick={() => {
              haptic('light');
              onPlay();
            }}
            className="lp-cta mt-7 inline-flex h-14 items-center justify-center rounded-chip bg-primary px-8 font-display text-[16px] font-bold uppercase tracking-wide text-primary-ink transition hover:brightness-110 active:scale-[0.97]"
          >
            {label}
          </button>
          <p className="mt-4 text-[13px] text-text-2">Devnet beta, test money only. 18+.</p>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ live stats */

export function StatsBar({ stats }: { stats: { online: number; gamesPlayed: number; creditsWon: number } }) {
  return (
    <section className="border-y border-line/60 bg-surface/40">
      <div className="mx-auto grid max-w-[1200px] grid-cols-3 divide-x divide-line px-2 py-6 text-center sm:px-6">
        {(
          [
            ['Online now', stats.online, (n: number) => Math.round(n).toLocaleString('en-US')],
            ['Games played', stats.gamesPlayed, (n: number) => Math.round(n).toLocaleString('en-US')],
            ['Credits won', stats.creditsWon, (n: number) => formatCredits(Math.round(n)).replace('.00', '')],
          ] as const
        ).map(([label, value, fmt]) => (
          <div key={label} className="px-2">
            <p className="font-display text-xl font-extrabold text-primary sm:text-3xl">
              <CountUp value={value} format={fmt} />
            </p>
            <p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-text-2 sm:text-xs">{label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
