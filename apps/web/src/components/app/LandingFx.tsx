'use client';
import { useEffect, useRef, useState } from 'react';
import { animate, motion, useInView, useReducedMotion } from 'motion/react';
import { GAMES, STAKE_LEVELS, formatCredits, pvpFee, usd, type GameKind } from '@coldcall/shared';
import { GAME_COLOR } from './GameArt';
import { Coin, Chip } from '@/components/ui';

/** Small looping animation per game, layered over the tile art. */
export function TileLoop({ game }: { game: GameKind }) {
  // Hidden with CSS under reduced motion (not by returning null) so server and client HTML match.
  return (
    <div className="contents motion-reduce:hidden">
      <TileLoopInner game={game} />
    </div>
  );
}

function TileLoopInner({ game }: { game: GameKind }) {
  const c = GAME_COLOR[game];
  if (game === 'chess')
    return (
      <motion.div className="pointer-events-none absolute inset-0" aria-hidden>
        <motion.span
          className="absolute left-[18%] top-[30%] size-3 rounded-full"
          style={{ background: c, boxShadow: `0 0 16px ${c}` }}
          animate={{ x: [0, 40, 40, 0], y: [0, -30, -30, 0], opacity: [0, 1, 1, 0] }}
          transition={{ duration: 3.2, repeat: Infinity, times: [0, 0.3, 0.8, 1] }}
        />
        <motion.span
          className="absolute right-[14%] top-[18%] rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase"
          style={{ background: c, color: '#0a0a0f' }}
          animate={{ scale: [0.6, 1.1, 1, 0.6], opacity: [0, 1, 1, 0] }}
          transition={{ duration: 3.2, repeat: Infinity, delay: 1.2 }}
        >
          Check!
        </motion.span>
      </motion.div>
    );
  if (game === 'backgammon')
    return (
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center gap-3" aria-hidden>
        {[0, 1].map((i) => (
          <motion.div
            key={i}
            className="flex size-9 items-center justify-center rounded-lg bg-white shadow-lg"
            style={{ boxShadow: `0 0 18px ${c}` }}
            animate={{ rotate: [0, 200, 360], y: [0, -26, 0], scale: [1, 1.1, 1] }}
            transition={{ duration: 1.1, repeat: Infinity, repeatDelay: 1.6, delay: i * 0.12 }}
          >
            <Pips n={i ? 6 : 5} />
          </motion.div>
        ))}
      </div>
    );
  if (game === 'tichu')
    return (
      <motion.span
        className="pointer-events-none absolute right-[10%] top-[14%] rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase"
        style={{ background: c, color: '#0a0a0f', boxShadow: `0 0 18px ${c}` }}
        animate={{ scale: [0.5, 1.25, 1, 1, 0.5], opacity: [0, 1, 1, 1, 0], rotate: [-8, 6, 0, 0, 0] }}
        transition={{ duration: 2.6, repeat: Infinity, repeatDelay: 1 }}
        aria-hidden
      >
        Bomb!
      </motion.span>
    );
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="absolute size-16 rounded-full border-2"
          style={{ borderColor: c }}
          animate={{ scale: [0.2, 2.2], opacity: [0.9, 0] }}
          transition={{ duration: 2.4, repeat: Infinity, delay: i * 0.8, ease: 'easeOut' }}
        />
      ))}
    </div>
  );
}

function Pips({ n }: { n: number }) {
  const pos: Record<number, [number, number][]> = {
    5: [[25, 25], [75, 25], [50, 50], [25, 75], [75, 75]],
    6: [[25, 22], [75, 22], [25, 50], [75, 50], [25, 78], [75, 78]],
  };
  return (
    <svg viewBox="0 0 100 100" className="size-7">
      {pos[n]!.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="9" fill="#0b0816" />
      ))}
    </svg>
  );
}

/** Counts up to a real number when it scrolls into view. */
export function CountUp({ value, format = (n: number) => Math.round(n).toLocaleString('en-US') }: { value: number; format?: (n: number) => string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (!inView) return;
    if (reduce) return setShown(value);
    const ctl = animate(0, value, { duration: 1.4, ease: 'easeOut', onUpdate: setShown });
    return () => ctl.stop();
  }, [inView, value, reduce]);
  return (
    <span ref={ref} className="tabular">
      {format(shown)}
    </span>
  );
}

/** Real recent wins, scrolling. Hidden until real wins exist. */
export function WinsTicker({ wins }: { wins: { name: string; game: string; amount: number; mode: string; at?: string }[] }) {
  const reduce = useReducedMotion();
  // Only real wins, and only once there are at least 10 distinct ones so the strip never looks padded.
  const seen = new Set<string>();
  const unique = wins.filter((w) => {
    const k = `${w.name}|${w.game}|${w.amount}|${w.at ?? ''}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  if (unique.length < 10) return null;
  const items = [...unique, ...unique];
  return (
    <div className="relative overflow-hidden border-y border-line bg-surface/60 py-3" aria-label="Recent real wins">
      <motion.div className="flex w-max gap-8 whitespace-nowrap px-4" animate={reduce ? undefined : { x: ['0%', '-50%'] }} transition={{ duration: Math.max(20, items.length * 3), repeat: Infinity, ease: 'linear' }}>
        {items.map((w, i) => (
          <span key={i} className="inline-flex items-center gap-2 text-sm">
            <span className="size-2 rounded-full" style={{ background: GAME_COLOR[w.game as GameKind] ?? 'var(--primary)' }} aria-hidden />
            <strong>{w.name}</strong>
            <span className="text-text-2">won</span>
            <span className="inline-flex items-center gap-1 font-bold text-gold">
              <Coin className="size-4" /> {formatCredits(w.amount)}
            </span>
            <span className="text-text-2">
              at {GAMES[w.game as GameKind]?.name ?? w.game}
              {w.mode === 'bot' ? ' vs the bot' : ''}
            </span>
          </span>
        ))}
      </motion.div>
      <div className="pointer-events-none absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-bg to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-bg to-transparent" />
    </div>
  );
}

/** Honest interactive payout calculator. */
export function PayoutCalculator() {
  const [stake, setStake] = useState<number>(STAKE_LEVELS[3]);
  const fee = pvpFee(stake);
  return (
    <div className="rounded-sheet border border-line bg-surface p-6 sm:p-8">
      <p className="text-xs font-bold uppercase tracking-wider text-primary">Try it</p>
      <h3 className="mt-1 font-display text-2xl font-extrabold uppercase">What could you win?</h3>
      <p className="mt-2 text-text-2">Pick a stake and see exactly what happens. Any amount from 1 credit up to $100 against people, or $50 against the bot.</p>
      <div className="mt-5 flex flex-wrap gap-2" role="radiogroup" aria-label="Stake">
        {STAKE_LEVELS.map((l) => (
          <Chip key={l} active={stake === l} onClick={() => setStake(l)}>
            {usd(l)}
          </Chip>
        ))}
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <motion.div key={`p${stake}`} initial={{ scale: 0.97, opacity: 0.6 }} animate={{ scale: 1, opacity: 1 }} className="rounded-card border border-primary/40 bg-surface-2 p-5">
          <p className="text-sm font-semibold text-text-2">Beat a real player</p>
          <p className="mt-2 flex items-center gap-2 font-display text-4xl font-extrabold text-primary">
            <Coin className="size-8" /> {formatCredits(stake * 2)}
          </p>
          <p className="text-sm font-semibold text-text">credits, about {usd(stake * 2)}</p>
          <p className="mt-2 text-sm text-text-2">
            You put in {formatCredits(stake)} plus a {formatCredits(fee)} fee. Lose and you lose {formatCredits(stake + fee)}.
          </p>
        </motion.div>
        <motion.div key={`b${stake}`} initial={{ scale: 0.97, opacity: 0.6 }} animate={{ scale: 1, opacity: 1 }} className="rounded-card border border-accent/50 bg-surface-2 p-5">
          <p className="text-sm font-semibold text-text-2">Beat the bot</p>
          <p className="mt-2 flex items-center gap-2 font-display text-4xl font-extrabold text-accent">
            <Coin className="size-8" /> {formatCredits(stake * 2)}
          </p>
          <p className="text-sm font-semibold text-text">credits, about {usd(stake * 2)}</p>
          <p className="mt-2 text-sm text-text-2">No fee. Lose and you lose {formatCredits(stake)}. The bot keeps games close and the house edge is a published 5%.</p>
        </motion.div>
      </div>
      <p className="mt-4 text-xs text-text-2">Test money in this beta. 18+. Only play with what you are happy to lose.</p>
    </div>
  );
}

const FEATURES = [
  { title: 'Instant payouts', text: 'Win and the pot lands in your balance the second the game ends.', d: 'M13 2 4 14h7l-1 8 9-12h-7l1-8Z' },
  { title: 'Fair dice and cards', text: 'Every roll and shuffle is locked before the game and provable after.', d: 'M12 2 4 5v6c0 5 3.5 9 8 11 4.5-2 8-6 8-11V5l-8-3Zm-1 13-4-4 1.4-1.4L11 12.2l4.6-4.6L17 9l-6 6Z' },
  { title: 'Public vault', text: 'Every credit is backed one to one on Solana. Anyone can check.', d: 'M4 4h16v16H4V4Zm8 3a5 5 0 1 0 0 10 5 5 0 0 0 0-10Zm0 3a2 2 0 1 1 0 4 2 2 0 0 1 0-4Z' },
  { title: 'Built for your phone', text: 'Play from the browser in seconds. Nothing to install.', d: 'M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm5 17a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z' },
  { title: 'Real opponents or a bot', text: 'Quick match at your stake, or play the bot any time of day.', d: 'M8 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM2 20c0-3.3 2.7-6 6-6s6 2.7 6 6H2Zm13 0c0-2-.7-3.8-1.9-5.2A5 5 0 0 1 22 19v1h-7Z' },
  { title: 'Your limits', text: 'Set limits, take breaks, and cash out whenever you want.', d: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm1 5v5.4l4 2.4-1 1.7-5-3V7h2Z' },
];

export function FeatureGrid() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {FEATURES.map((f, i) => (
        <motion.div
          key={f.title}
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-40px' }}
          transition={{ duration: 0.35, delay: (i % 3) * 0.06 }}
          className="group rounded-card border border-line bg-surface p-5 transition hover:border-primary/50 hover:shadow-glow"
        >
          <span className="inline-flex size-11 items-center justify-center rounded-chip bg-primary/12 text-primary transition group-hover:scale-110" style={{ background: 'color-mix(in srgb, var(--primary) 14%, transparent)' }}>
            <svg viewBox="0 0 24 24" className="size-6" fill="currentColor" aria-hidden>
              <path d={f.d} />
            </svg>
          </span>
          <h3 className="mt-3 font-display text-base font-bold uppercase">{f.title}</h3>
          <p className="mt-1 text-sm text-text-2">{f.text}</p>
        </motion.div>
      ))}
    </div>
  );
}

export function Reveal({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-60px' }} transition={{ duration: 0.45, delay }}>
      {children}
    </motion.div>
  );
}
