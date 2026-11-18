'use client';
import Link from 'next/link';
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { motion, MotionConfig } from 'motion/react';
import { GAMES, CURRENCY, formatAmount, type GameKind } from '@coldcall/shared';
import { useSession } from '@/components/app/Providers';
import { AuthSheet } from '@/components/app/AuthSheet';
import { OnboardingSheet } from '@/components/app/OnboardingSheet';
import { VaultLinks } from '@/components/app/VaultLinks';
import { PayoutCalculator } from '@/components/app/LandingFx';
import { WORLD, WorldArt } from '@/components/app/WorldArt';
import { Button, CoinChip, Cosmos, Mascot, Wordmark } from '@/components/ui';
import { chainConfig, suiscan } from '@/lib/chain';
import { haptic } from '@/lib/sound';

const GITHUB_URL = 'https://github.com/klepi21/coldcall';

const FAQ: [string, string][] = [
  ['What is Cold Call?', 'A lounge for classic skill games on Sui. Play chess, backgammon, Tichu or Ice Floe Battle against real people or a fair bot. Practice is free, or stake test LOFI or test SUI and the winner takes the pot.'],
  ['Is this real money?', 'No. Cold Call runs on Sui devnet. LOFI and SUI here are test coins with no money value, and you get them free on the wallet page. Treat it as a demo of how a fair skill games table works on chain.'],
  ['Do I need a crypto wallet?', 'No. Sign in with Google and your Google account becomes your Sui wallet (zkLogin). Or keep a quick wallet in this browser. Cold Call pays every network fee, so you never need SUI for gas.'],
  ['How do the bots work?', 'The bot matches your skill so games stay close, and the house keeps one published 5% edge at every stake. In chess you win about 36 of 100 games and draw about 25. We never use your balance or your losses to set the bot.'],
  ['Who holds the coins?', 'Coins you add go into a public vault contract on Sui, one vault per coin. Your LOFI and SUI balances are each backed one to one, and anyone can check each vault on Suiscan.'],
  ['How do I cash out?', 'Open your wallet, tap Cash out and pick an amount. Our server signs a ticket, the Move contract checks it, and the coins go straight back to your wallet.'],
  ['Are LOFI and SUI ever mixed?', 'Never. They are two separate balances. A table is played in one coin only, quick match only pairs the same coin and stake, and there is no exchange rate.'],
];

const ORDER: GameKind[] = ['chess', 'backgammon', 'tichu', 'seabattle'];

function Section({ id, eyebrow, title, sub, children }: { id?: string; eyebrow: string; title: ReactNode; sub?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="mx-auto max-w-[1200px] scroll-mt-20 px-4 py-14 sm:px-6 sm:py-20">
      <div>
        <p className="t-eyebrow text-accent">{eyebrow}</p>
        <h2 className="t-display mt-2">{title}</h2>
        {sub ? <p className="mt-3 max-w-2xl text-[17px] leading-relaxed text-text-2">{sub}</p> : null}
      </div>
      <div className="mt-8">{children}</div>
    </section>
  );
}

function Icon({ d, className = 'size-6' }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d={d} />
    </svg>
  );
}

const I = {
  coin: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 3a7 7 0 1 1 0 14 7 7 0 0 1 0-14Zm-1 3v1.2c-1.4.3-2.4 1.3-2.4 2.6 0 1.6 1.2 2.3 3 2.7 1.3.3 1.6.6 1.6 1.1 0 .5-.5.9-1.3.9-.9 0-1.5-.4-1.6-1.1H8.5c.1 1.5 1.1 2.5 2.5 2.8V18h2v-1.1c1.5-.3 2.5-1.3 2.5-2.7 0-1.7-1.3-2.4-3.1-2.8-1.2-.3-1.5-.6-1.5-1s.4-.8 1.1-.8c.7 0 1.2.3 1.3.9h1.8c-.1-1.3-1-2.3-2.3-2.6V8h-2Z',
  play: 'M8 5.6v12.8c0 .8.9 1.3 1.6.9l10-6.4a1 1 0 0 0 0-1.8l-10-6.4c-.7-.4-1.6.1-1.6.9Z',
  ticket: 'M4 6h16a1 1 0 0 1 1 1v3a2 2 0 0 0 0 4v3a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-3a2 2 0 0 0 0-4V7a1 1 0 0 1 1-1Zm5 3v6h2V9H9Zm4 0v6h2V9h-2Z',
  google: 'M12 11v3h5.2c-.4 2-2.3 3.6-5.2 3.6a5.6 5.6 0 1 1 3.7-9.8l2.2-2.2A8.6 8.6 0 1 0 12 20.6c5 0 8.3-3.5 8.3-8.4 0-.4 0-.8-.1-1.2H12Z',
  gas: 'M5 3h8a1 1 0 0 1 1 1v7h1a2 2 0 0 1 2 2v4a1 1 0 0 0 2 0V9l-2-2 1.4-1.4L21 8.2V17a3 3 0 0 1-6 0v-4h-1v8H4V4a1 1 0 0 1 1-1Zm1 2v5h6V5H6Z',
  vault: 'M4 4h16v16H4V4Zm8 3a5 5 0 1 0 0 10 5 5 0 0 0 0-10Zm0 3a2 2 0 1 1 0 4 2 2 0 0 1 0-4Z',
  faucet: 'M12 3s6 6.6 6 11a6 6 0 0 1-12 0c0-4.4 6-11 6-11Zm-3 11a3 3 0 0 0 3 3v-2a1 1 0 0 1-1-1H9Z',
  flask: 'M9 2h6v2h-1v5.2l5.6 9.7A2 2 0 0 1 17.9 22H6.1a2 2 0 0 1-1.7-3.1L10 9.2V4H9V2Zm3 9-2.9 5h5.8L12 11Z',
  shield: 'M12 2 4 5v6c0 5 3.5 9 8 11 4.5-2 8-6 8-11V5l-8-3Zm-1 13-4-4 1.4-1.4L11 12.2l4.6-4.6L17 9l-6 6Z',
  dice: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm3 3.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm8 8a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm-4-4a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z',
  eye: 'M12 5c5 0 9 4.5 10 7-1 2.5-5 7-10 7S3 14.5 2 12c1-2.5 5-7 10-7Zm0 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0 2a2 2 0 1 1 0 4 2 2 0 0 1 0-4Z',
  limit: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm1 5v5.4l4 2.4-1 1.7-5-3V7h2Z',
};

function FeatureCard({ icon, title, text, tint = 'var(--accent)' }: { icon: string; title: string; text: ReactNode; tint?: string }) {
  return (
    <div className="glass rounded-card p-5" style={{ '--tint': tint } as CSSProperties}>
      <span className="grid size-11 place-items-center rounded-full" style={{ background: `color-mix(in srgb, ${tint} 18%, transparent)`, color: tint }}>
        <Icon d={icon} />
      </span>
      <p className="mt-3 font-display text-[20px]">{title}</p>
      <p className="mt-1 text-[15px] leading-relaxed text-text-2">{text}</p>
    </div>
  );
}

export default function Landing() {
  const { me, authOpen, openAuth } = useSession();
  const router = useRouter();
  const [pkg, setPkg] = useState<{ id: string; network: string } | null>(null);
  useEffect(() => {
    chainConfig()
      .then((c) => setPkg({ id: c.packageId, network: c.network }))
      .catch(() => {});
  }, []);
  const start = () => {
    haptic('light');
    if (me) router.push('/play');
    else openAuth();
  };
  const cta = me ? 'Take your seat' : 'Play free now';
  const L = CURRENCY.LOFI;
  const S = CURRENCY.SUI;

  return (
    <MotionConfig reducedMotion="user">
      <div className="page-root relative isolate min-h-dvh overflow-x-clip">
        <Cosmos />
        <header className="glass-blur sticky top-0 z-30 border-b border-well-line bg-[color-mix(in_srgb,var(--bg)_60%,transparent)]">
          <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between gap-3 px-4 sm:px-6">
            <Link href="/" aria-label="Cold Call home" className="shrink-0">
              <Wordmark height={28} />
            </Link>
            <nav className="flex items-center gap-1 sm:gap-2" aria-label="Main">
              <a href="#games" className="hidden h-10 items-center rounded-chip px-3 text-[15px] font-semibold text-text-2 hover:text-text md:inline-flex">
                Games
              </a>
              <a href="#money" className="hidden h-10 items-center rounded-chip px-3 text-[15px] font-semibold text-text-2 hover:text-text md:inline-flex">
                How money works
              </a>
              <a href="#sui" className="hidden h-10 items-center rounded-chip px-3 text-[15px] font-semibold text-text-2 hover:text-text md:inline-flex">
                On Sui
              </a>
              <Button size="sm" onClick={start}>
                {me ? 'Enter' : 'Sign in'}
              </Button>
            </nav>
          </div>
        </header>

        {/* Hero */}
        <section className="mx-auto grid max-w-[1200px] items-center gap-6 px-4 pb-10 pt-8 sm:px-6 md:grid-cols-[1.1fr_1fr] md:pt-14">
          <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }} className="order-2 md:order-1">
            <span className="inline-flex h-8 items-center gap-2 rounded-full px-3 text-[12px] font-bold uppercase tracking-wider text-accent [box-shadow:inset_0_0_0_1px_color-mix(in_srgb,var(--accent)_45%,transparent)]">
              <span className="live-dot size-2 rounded-full bg-accent" aria-hidden />
              Sui devnet beta, test coins only
            </span>
            <h1 className="t-hero mt-4">
              <span className="t-ice">Play it cool.</span>
              <br />
              Call their bluff.
            </h1>
            <p className="mt-4 max-w-xl text-[18px] leading-relaxed text-text">
              Chess, Backgammon, Tichu and Ice Floe Battle in a snowy card lounge on Sui. Practice free, or stake test LOFI or test SUI against real people or a fair bot. Winner takes the pot.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Button size="lg" onClick={start}>
                {cta}
              </Button>
              <a href="#money" className="btn-secondary press inline-flex h-14 items-center justify-center rounded-[14px] px-6 font-display text-[19px]">
                How it works
              </a>
            </div>
            <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-[14px] text-text-2">
              {['Sign in with Google', 'No gas fees, ever', 'Every fee shown up front', '18+'].map((t) => (
                <li key={t} className="inline-flex items-center gap-1.5">
                  <svg viewBox="0 0 20 20" className="size-4 text-win" fill="currentColor" aria-hidden>
                    <path d="M8 13.2 4.8 10l-1.4 1.4L8 16l9-9-1.4-1.4L8 13.2Z" />
                  </svg>
                  {t}
                </li>
              ))}
            </ul>
          </motion.div>
          <motion.div initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5, delay: 0.05 }} className="relative order-1 mx-auto w-full max-w-[520px] md:order-2">
            <span className="absolute inset-[12%] rounded-full bg-accent/25 blur-3xl" aria-hidden />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/logo-mascot.png" alt="Cold Call, with Lucky Lo the dealer" width={1400} height={1052} className="relative h-auto w-full select-none" fetchPriority="high" />
          </motion.div>
        </section>

        {/* Games */}
        <Section id="games" eyebrow="Four tables" title="Pick your game" sub="Every game has a free practice mode, a bot that matches your level, and real people at your stake.">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {ORDER.map((g) => (
              <motion.button
                key={g}
                type="button"
                onClick={start}
                className="glass press group overflow-hidden rounded-card text-left"
                style={{ '--tint': WORLD[g].c } as CSSProperties}
                aria-label={`Play ${GAMES[g].name}`}
              >
                <WorldArt game={g} className="h-36 w-full" />
                <div className="p-4">
                  <p className="t-eyebrow game-ink">{WORLD[g].world}</p>
                  <p className="mt-1 font-display text-[24px]">{GAMES[g].name}</p>
                  <p className="mt-1 text-[15px] text-text-2">{WORLD[g].hook}</p>
                  <p className="mt-3 text-[13px] text-text-2">
                    {GAMES[g].players} players, {GAMES[g].length.toLowerCase()}
                  </p>
                </div>
              </motion.button>
            ))}
          </div>
        </Section>

        {/* Money */}
        <Section
          id="money"
          eyebrow="How money works"
          title="Add. Play. Cash out."
          sub="Three steps, no crypto knowledge needed. Everything here uses test coins on Sui devnet with no money value. LOFI and SUI are two separate balances and are never swapped."
        >
          <ol className="grid gap-4 md:grid-cols-3">
            {[
              { icon: I.coin, t: '1. Add test LOFI or SUI', d: 'Grab free test LOFI or test SUI on the wallet page, then add it. Each coin goes into its own public vault on Sui and your balance in that coin goes up by exactly the same amount.' },
              { icon: I.play, t: '2. Play', d: 'Pick a coin and a stake. The whole game is played in that coin, and the full summary (stake, fee, what you win or lose) is shown before you start. Winnings land the moment the game ends.' },
              { icon: I.ticket, t: '3. Cash out', d: 'Our server signs a cash out ticket for exactly your amount, valid for 10 minutes and good for one use. The Move contract checks the signature and sends the coins to your wallet.' },
            ].map((s) => (
              <li key={s.t}>
                <FeatureCard icon={s.icon} title={s.t} text={s.d} />
              </li>
            ))}
          </ol>
          <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_1fr]">
            <PayoutCalculator />
            <div className="glass rounded-sheet p-5 sm:p-6">
              <p className="t-eyebrow text-accent">Check it yourself</p>
              <p className="mt-1 font-display text-[22px]">Two public vaults</p>
              <p className="mb-4 mt-1 text-[15px] text-text-2">Live balances from Sui, next to what we hold for players in the same coin. Checked every 5 minutes.</p>
              <VaultLinks compact />
            </div>
          </div>
        </Section>

        {/* On Sui */}
        <Section id="sui" eyebrow="Built on Sui" title="On chain where it counts" sub="The games run fast on our server. The money runs on Sui, where anyone can check it.">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <FeatureCard icon={I.google} title="Google sign in, real wallet" text="zkLogin turns your Google account into a Sui wallet. A short lived key signs in your browser. No seed phrase, no extension." />
            <FeatureCard icon={I.gas} title="Sponsored gas" text="Cold Call pays the Sui network fee on every deposit, cash out and faucet claim. You never need SUI just to move SUI." />
            <FeatureCard icon={I.vault} title="Two vaults" text="One shared Move vault per coin: Vault for LOFI and Vault for SUI. Deposits are credited only from on chain events." tint="var(--gold)" />
            <FeatureCard icon={I.faucet} title="Test LOFI faucet" text="A Move faucet mints 1,000 test LOFI per claim, once every 6 hours per wallet. Test SUI comes from our game wallet." tint="var(--sui)" />
            <FeatureCard icon={I.ticket} title="Signed cash out tickets" text="Each cash out is an 88 byte ticket signed by our server: vault, wallet, amount, a single use nonce and an expiry. The contract checks all of it." />
            <FeatureCard icon={I.flask} title="Devnet, test coins only" text="Everything runs on Sui devnet. LOFI and SUI here have no money value. This is a demo for the CLAY hackathon." tint="var(--warn)" />
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            {pkg ? (
              <a href={suiscan('object', pkg.id, pkg.network)} target="_blank" rel="noreferrer" className="btn-secondary press inline-flex h-11 items-center gap-2 rounded-chip px-4 font-semibold">
                View the Move package on Suiscan
              </a>
            ) : null}
            <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="btn-secondary press inline-flex h-11 items-center gap-2 rounded-chip px-4 font-semibold">
              Source on GitHub
            </a>
          </div>
        </Section>

        {/* Fair play */}
        <Section id="fair" eyebrow="Fair play" title="No small print" sub="We would rather show a small honest number than a big fake one.">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <FeatureCard icon={I.shield} title="Published 5% bot edge" text="One flat house edge against the bot at every stake, in both coins. The bot matches your skill, never your balance." />
            <FeatureCard icon={I.dice} title="Fair dice and shuffles" text="Every roll and deal comes from seeds locked before the game. After it ends, verify every move yourself." />
            <FeatureCard icon={I.eye} title="No fake numbers" text="No invented players online, no fake wins feed, no pressure timers. Fees are shown before you sit down." />
            <FeatureCard icon={I.limit} title="Your limits" text={`Set daily and weekly limits per coin, take a break, or pause your account. Stakes from ${formatAmount(L.minStake, 'LOFI')} or ${formatAmount(S.minStake, 'SUI')}.`} />
          </div>
        </Section>

        {/* FAQ */}
        <Section id="faq" eyebrow="Questions" title="Ask the dealer">
          <div className="grid items-start gap-6 lg:grid-cols-[1fr_280px]">
            <div className="space-y-2">
              {FAQ.map(([q, a]) => (
                <details key={q} className="glass group rounded-card px-5 py-4">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-semibold">
                    {q}
                    <span className="text-accent transition-transform group-open:rotate-45" aria-hidden>
                      +
                    </span>
                  </summary>
                  <p className="mt-2 leading-relaxed text-text-2">{a}</p>
                </details>
              ))}
            </div>
            <Mascot pose="shrug" className="mx-auto hidden size-64 lg:block" />
          </div>
        </Section>

        {/* Final call to action */}
        <section className="mx-auto max-w-[1200px] px-4 pb-16 sm:px-6">
          <div className="glass relative flex flex-col items-center gap-4 overflow-hidden rounded-sheet px-6 py-10 text-center sm:flex-row sm:text-left">
            <span className="spill pointer-events-none absolute inset-0" aria-hidden />
            <Mascot pose="win" className="relative size-36 shrink-0" />
            <div className="relative flex-1">
              <p className="t-display">Your move, high roller.</p>
              <p className="mt-2 text-text-2">Your first game is free. Test coins are free too.</p>
            </div>
            <Button size="lg" className="relative" onClick={start}>
              {cta}
            </Button>
          </div>
        </section>

        <footer className="border-t border-well-line">
          <div className="mx-auto grid max-w-[1200px] gap-6 px-4 py-10 text-sm text-text-2 sm:px-6 md:grid-cols-[1.2fr_1fr_1fr]">
            <div>
              <Wordmark height={26} />
              <p className="mt-3 max-w-sm">A skill games lounge on Sui devnet. Test coins only, no money value. 18+.</p>
              <p className="mt-2 flex items-center gap-2">
                <CoinChip currency="LOFI" className="size-5" />
                <CoinChip currency="SUI" className="size-5" />
                Two coins, never mixed.
              </p>
            </div>
            <nav aria-label="Product" className="flex flex-col">
              <span className="t-eyebrow mb-1">Cold Call</span>
              <Link href="/how-it-works" className="inline-flex h-10 items-center hover:text-text">How it works</Link>
              <Link href="/rules/chess" className="inline-flex h-10 items-center hover:text-text">Game rules</Link>
              <Link href="/how-it-works#limits" className="inline-flex h-10 items-center hover:text-text">Safer play</Link>
            </nav>
            <nav aria-label="Legal and code" className="flex flex-col">
              <span className="t-eyebrow mb-1">Open and legal</span>
              <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center hover:text-text">GitHub</a>
              {pkg ? (
                <a href={suiscan('object', pkg.id, pkg.network)} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center hover:text-text">
                  Sui package on Suiscan
                </a>
              ) : null}
              <Link href="/privacy" className="inline-flex h-10 items-center hover:text-text">Privacy</Link>
              <Link href="/terms" className="inline-flex h-10 items-center hover:text-text">Terms</Link>
            </nav>
          </div>
        </footer>
      </div>
      <AuthSheet open={authOpen} onClose={() => openAuth(false)} />
      <OnboardingSheet />
    </MotionConfig>
  );
}
