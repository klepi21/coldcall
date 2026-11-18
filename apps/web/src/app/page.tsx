'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { type GameKind } from '@coldcall/shared';
import { MotionConfig } from 'motion/react';
import { useSession } from '@/components/app/Providers';
import { AuthSheet } from '@/components/app/AuthSheet';
import { OnboardingSheet } from '@/components/app/OnboardingSheet';
import { VaultLinks } from '@/components/app/VaultLinks';
import { Button, Wordmark } from '@/components/ui';
import { api } from '@/lib/api';
import { haptic } from '@/lib/sound';
import { WinsTicker, PayoutCalculator } from '@/components/app/LandingFx';
import { HeroJourney } from '@/components/landing/HeroJourney';
import { MatchPreview } from '@/components/landing/MatchPreview';
import { LivingTiles, MoneyFlow, TwoWays, SaferPlay, Faq, FinalCta, StatsBar } from '@/components/landing/Sections';
import '@/components/landing/landing.css';

const FAQ = [
  ['What is Cold Call?', 'An arena for classic skill games. You play chess, backgammon, Tichu or Sea Battle against real people or a bot, for free or for a stake in LOFI or SUI. Win, and you take the pot.'],
  [
    'Is this gambling?',
    'Playing for a stake means you can win or lose it, so treat it like a paid game, not income. In this beta LOFI and SUI are devnet test coins with no real value. Practice games are always free.',
  ],
  ['Can I lose money?', 'Yes, you can lose the coins you put into a game. Before every game we show exactly what you put in, the fee, and what you get if you win, lose or draw.'],
  [
    'How do the bots work?',
    'The bot adjusts to your skill so games stay close. The house keeps a published 5% edge: in chess you win about 36 of 100 games and draw about 25. We never use your balance or losses to set the bot.',
  ],
  ['Who holds my money?', 'Coins you add go into a public vault contract on Sui, one vault per coin. Your LOFI and SUI balances are each backed one to one, and anyone can check each vault against what we hold for players.'],
  ['How do I cash out?', 'Open your wallet, tap Cash out, choose an amount, and approve. The money goes straight back to your wallet.'],
  ['How do I set limits?', 'In your profile you can set daily and weekly limits, take a break, or pause your account for months.'],
];

interface Stats {
  online: number;
  playing: number;
  gamesPlayed: number;
  won: { LOFI: number; SUI: number };
  recentWins: {
    name: string;
    game: string;
    amount: number;
    currency: 'LOFI' | 'SUI';
    mode: string;
    at?: string;
  }[];
}

/** Honest numbers only: hide a stat rather than show a tiny or padded one. */
const SHOW_STATS_AT_GAMES = 50;
const SHOW_ONLINE_AT = 10;

export default function Landing() {
  const { me, authOpen, openAuth } = useSession();
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  useEffect(() => {
    api<Stats>('/api/stats')
      .then(setStats)
      .catch(() => {});
  }, []);
  const start = () => (me ? router.push('/play') : openAuth());
  const primaryLabel = me ? 'Enter the arena' : 'Play free now';

  const heroText = (
    <div className="max-w-[430px]">
      <span className="lp-rise inline-flex h-8 items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3 text-[12px] font-bold uppercase tracking-wider text-primary backdrop-blur">
        <span className="live-dot size-2 rounded-full bg-primary" aria-hidden />
        {stats && stats.online >= SHOW_ONLINE_AT ? `${stats.online} in the arena now` : 'Devnet beta is live'}
      </span>
      <h1 className="lp-rise lp-d1 mt-5 font-display text-[40px] font-extrabold uppercase leading-[0.95] tracking-tight sm:text-[56px] xl:text-[54px]">
        Four games.
        <br />
        <span className="text-primary text-glow">One arena.</span>
      </h1>
      <p className="lp-rise lp-d2 mt-5 text-[18px] leading-relaxed text-text">
        Play <strong>chess, backgammon, Tichu</strong> and <strong>Sea Battle</strong> against real people or a fair bot. Practice free, or stake LOFI or SUI and win the pot.
      </p>
      <div className="lp-rise lp-d3 mt-7 flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={() => {
            haptic('light');
            start();
          }}
          className="lp-cta inline-flex h-14 items-center justify-center gap-2 rounded-chip bg-primary px-7 font-display text-[16px] font-bold uppercase tracking-wide text-primary-ink transition hover:brightness-110 active:scale-[0.97]"
        >
          {primaryLabel}
          <svg viewBox="0 0 20 20" className="size-5" fill="currentColor" aria-hidden>
            <path d="M11.3 4.3a1 1 0 0 1 1.4 0l5 5a1 1 0 0 1 0 1.4l-5 5a1 1 0 1 1-1.4-1.4l3.3-3.3H3a1 1 0 1 1 0-2h11.6l-3.3-3.3a1 1 0 0 1 0-1.4Z" />
          </svg>
        </button>
        <Link
          href="/how-it-works"
          className="hidden h-14 items-center justify-center rounded-chip border sm:inline-flex border-white/15 bg-white/[0.03] px-6 font-semibold text-text backdrop-blur transition hover:border-accent hover:shadow-glow-accent"
        >
          How it works
        </Link>
      </div>
      <ul className="lp-rise lp-d4 mt-5 flex flex-wrap gap-x-5 gap-y-2 text-[14px] text-text-2">
        {['Sign up in one tap', 'No crypto knowledge needed', 'Test money in this beta', '18+'].map((t, i) => (
          <li key={t} className={`items-center gap-1.5 ${i < 2 ? 'hidden sm:inline-flex' : 'inline-flex'}`}>
            <svg viewBox="0 0 20 20" className="size-4 text-primary" fill="currentColor" aria-hidden>
              <path d="M8 13.2 4.8 10l-1.4 1.4L8 16l9-9-1.4-1.4L8 13.2Z" />
            </svg>
            {t}
          </li>
        ))}
        <li className="sm:hidden">
          <Link href="/how-it-works" className="font-semibold text-primary underline-offset-4 hover:underline">
            How it works
          </Link>
        </li>
      </ul>
    </div>
  );

  const showStats = !!stats && stats.gamesPlayed >= SHOW_STATS_AT_GAMES;

  return (
    <>
      {/* The landing is the Evens universe: always night, in either theme. Sheets keep the user theme. */}
      <MotionConfig reducedMotion="user">
        <div className="lp-night min-h-dvh overflow-x-clip bg-[#07070c]">
          <header className="lp-night sticky top-0 z-30 border-b border-white/[0.06] bg-[#07070c]/55 backdrop-blur-md">
            <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between px-4 sm:px-6">
              <Link href="/" aria-label="Evens home">
                <Wordmark />
              </Link>
              <div className="flex items-center gap-2">
                <Link href="/how-it-works" className="hidden h-10 items-center rounded-chip px-3 text-[15px] font-semibold text-text-2 hover:text-text sm:inline-flex">
                  How it works
                </Link>
                <Button size="sm" onClick={start}>
                  {me ? 'Enter arena' : 'Sign up free'}
                </Button>
              </div>
            </div>
          </header>

          <HeroJourney heroText={heroText} heroGame={<MatchPreview onPlay={start} signedIn={!!me} />} onPlay={start} playLabel={(g) => (me ? `Play ${g}` : `Play ${g} free`)} />

          {showStats ? <StatsBar stats={stats} /> : null}
          <WinsTicker wins={stats?.recentWins ?? []} />

          <LivingTiles onPlay={start} />
          <MoneyFlow vault={<VaultLinks compact />} />
          <TwoWays calculator={<PayoutCalculator />} />
          <SaferPlay />
          <Faq items={FAQ} />
          <FinalCta onPlay={start} label={me ? 'Enter the arena' : 'Start your first game'} />

          <footer className="border-t border-line">
            <div className="mx-auto flex max-w-[1200px] flex-col gap-3 px-4 py-8 text-sm text-text-2 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <span>Cold Call beta on Sui devnet. Test coins only. 18+.</span>
              <span className="flex gap-4">
                <Link href="/how-it-works" className="inline-flex h-11 items-center">
                  How it works
                </Link>
                <Link href="/how-it-works#limits" className="inline-flex h-11 items-center">
                  Safer play
                </Link>
                <Link href="/rules/chess" className="inline-flex h-11 items-center">
                  Rules
                </Link>
              </span>
            </div>
          </footer>
        </div>
      </MotionConfig>
      <AuthSheet open={authOpen} onClose={() => openAuth(false)} />
      <OnboardingSheet />
    </>
  );
}

export type { GameKind };
