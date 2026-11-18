'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type { ProgressMsg } from '@coldcall/shared';
import { api } from '@/lib/api';
import { play } from '@/lib/sound';
import { cachedAward, onProgressMsg, rememberAward, useProgressFeed } from './store';
import { Burst, CountUp, Icon, LevelBadge, XpBar, tint } from './parts';

const need = (level: number) => 100 + 40 * level;

/** Waits for this table's progress (push, cache, or a fetch fallback). */
function useAward(tableId: string) {
  useProgressFeed();
  const [m, setM] = useState<ProgressMsg | null>(() => cachedAward(tableId));
  const [gaveUp, setGaveUp] = useState(false);
  useEffect(() => {
    if (m) return;
    let alive = true;
    const off = onProgressMsg((x) => x.tableId === tableId && alive && setM(x));
    const delays = [500, 1200, 2500, 4500];
    const timers = delays.map((d, i) =>
      setTimeout(async () => {
        if (!alive || cachedAward(tableId)) return;
        try {
          const r = await api<ProgressMsg>(`/api/progress/award/${tableId}`);
          if (alive) (rememberAward(r), setM(r));
        } catch {
          if (i === delays.length - 1 && alive) setGaveUp(true);
        }
      }, d),
    );
    return () => {
      alive = false;
      off();
      timers.forEach(clearTimeout);
    };
  }, [tableId, m]);
  return { m, gaveUp };
}

/**
 * Result screen block: XP gained with a count up, the XP bar filling, a level up moment and new achievements.
 * `celebrate` should be false after a loss: then everything is shown calmly, with no burst or chime.
 */
export function ResultXp({ tableId, celebrate }: { tableId: string; celebrate: boolean }) {
  const { m, gaveUp } = useAward(tableId);
  const reduce = useReducedMotion();
  const [phase, setPhase] = useState<'fill' | 'levelup'>('fill');

  useEffect(() => {
    if (!m || !m.xpGained) return;
    // Sound only after a win. After a loss the XP is shown calmly, with no chime and no burst.
    const t1 = setTimeout(() => celebrate && play('coin'), 350);
    if (!m.levelUp) return () => clearTimeout(t1);
    const t2 = setTimeout(() => {
      setPhase('levelup');
      if (celebrate) play('win');
    }, 1300);
    return () => [t1, t2].forEach(clearTimeout);
  }, [m, celebrate]);

  if (!m) {
    if (gaveUp) return null;
    return (
      <div className="mt-5 rounded-card p-4" style={{ background: tint('#7c5cff', 8) }} aria-busy>
        <div className="mx-auto h-4 w-32 animate-pulse rounded-full bg-surface-2" />
        <div className="mt-3 h-2 animate-pulse rounded-full bg-surface-2" />
      </div>
    );
  }

  if (m.tooShort)
    return (
      <div className="mt-5 rounded-card p-4 text-sm text-text-2" style={{ background: 'color-mix(in srgb, var(--text) 5%, transparent)' }}>
        This game was too short to earn XP. A game counts once you have made 5 moves.
      </div>
    );

  const leveled = m.levelUp && phase !== 'fill';
  const shownLevel = leveled ? m.level : m.levelBefore;
  const beforePct = m.xpInLevelBefore / need(m.levelBefore);
  const barFrom = leveled ? 0 : beforePct;
  const barTo = m.levelUp ? (leveled ? m.xpInLevel / m.xpToNext : 1) : m.xpInLevel / m.xpToNext;
  const loud = celebrate && !reduce;

  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, delay: 0.2 }}
      className="relative mt-5 overflow-hidden rounded-card p-4 text-left"
      style={{ background: `linear-gradient(140deg, ${tint('#7c5cff', 16)}, ${tint('#c6ff3d', 6)})`, boxShadow: `inset 0 0 0 1px ${tint('#7c5cff', 30)}` }}
    >
      <div className="flex items-center gap-3">
        <span className="relative">
          <LevelBadge level={shownLevel} pct={barTo} size={52} />
          {leveled && loud ? <Burst count={20} /> : null}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className="font-display text-[26px] font-extrabold leading-none text-primary" aria-label={`${m.xpGained} XP gained`}>
              <CountUp to={m.xpGained} prefix="+" delay={0.3} /> <span className="text-[15px]">XP</span>
            </p>
            <p className="text-xs font-semibold tabular text-text-2">
              Level {shownLevel}
              {leveled ? '' : `, ${m.levelUp ? need(m.levelBefore) - m.xpInLevelBefore : m.xpToNext - m.xpInLevel} XP to go`}
            </p>
          </div>
          <XpBar key={leveled ? 'after' : 'before'} pct={barTo} from={barFrom} delay={leveled ? 0 : 0.35} className="mt-2" />
        </div>
      </div>

      <AnimatePresence>
        {leveled ? (
          <motion.div
            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={reduce ? { duration: 0.2 } : { type: 'spring', stiffness: 320, damping: 18 }}
            className="mt-3 rounded-chip px-3 py-2 text-center"
            style={{ background: tint('#ffd23f', 16), boxShadow: `inset 0 0 0 1px ${tint('#ffd23f', 45)}` }}
          >
            <p className="font-display text-[17px] font-extrabold uppercase text-gold">Level up! Level {m.level}</p>
            {m.unlocks.length ? <p className="mt-0.5 text-sm text-text-2">New: {m.unlocks.map((u) => u.name).join(', ')}</p> : null}
          </motion.div>
        ) : null}
      </AnimatePresence>

      <ul className="mt-3 space-y-1 text-sm">
        {m.breakdown
          .filter((l) => !l.label.startsWith('Achievement'))
          .map((l, i) => (
            <motion.li key={l.label} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 + i * 0.08 }} className="flex justify-between gap-2">
              <span className="text-text-2">{l.label}</span>
              <span className="font-semibold tabular">+{l.xp}</span>
            </motion.li>
          ))}
      </ul>

      {m.newAchievements.length ? (
        <ul className="mt-3 space-y-2">
          {m.newAchievements.slice(0, 2).map((a, i) => (
            <motion.li
              key={a.code}
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: 0.9 + i * 0.15, duration: 0.28 }}
              className="relative flex items-center gap-3 rounded-chip p-2.5"
              style={{ background: tint('#ffd23f', 12), boxShadow: `inset 0 0 0 1px ${tint('#ffd23f', 40)}` }}
            >
              <span className="relative inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-[#ffd23f] text-[#1a1408]" style={{ boxShadow: '0 0 16px rgba(255,210,63,.45)' }}>
                <Icon name={a.icon} className="size-5" />
                {loud && i === 0 ? <Burst count={12} /> : null}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[11px] font-bold uppercase tracking-wide text-gold">Achievement unlocked</span>
                <span className="block truncate font-semibold">{a.name}</span>
              </span>
              {a.xp ? <span className="shrink-0 text-sm font-bold tabular text-gold">+{a.xp}</span> : null}
            </motion.li>
          ))}
        </ul>
      ) : null}
      {m.newAchievements.length > 2 ? (
        <motion.ul initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.3 }} className="mt-2 flex flex-wrap gap-1.5" aria-label="More achievements unlocked">
          {m.newAchievements.slice(2).map((a) => (
            <li key={a.code} className="inline-flex h-8 items-center gap-1.5 rounded-full pl-1 pr-3 text-[13px] font-semibold" style={{ background: tint('#ffd23f', 12), boxShadow: `inset 0 0 0 1px ${tint('#ffd23f', 35)}` }}>
              <span className="inline-flex size-6 items-center justify-center rounded-full bg-[#ffd23f] text-[#1a1408]">
                <Icon name={a.icon} className="size-3.5" />
              </span>
              {a.name}
              {a.xp ? <span className="tabular text-gold">+{a.xp}</span> : null}
            </li>
          ))}
        </motion.ul>
      ) : null}

      {!m.levelUp && m.unlocks.length ? <p className="mt-2 text-sm text-text-2">New look unlocked: {m.unlocks.map((u) => u.name).join(', ')}</p> : null}

      <Link href="/progress" className="mt-3 inline-flex h-11 items-center gap-1 text-sm font-semibold text-primary">
        See your progress
        <svg viewBox="0 0 20 20" className="size-4" fill="currentColor" aria-hidden>
          <path d="M7.3 4.3a1 1 0 0 1 1.4 0l5 5a1 1 0 0 1 0 1.4l-5 5a1 1 0 1 1-1.4-1.4L11.6 10 7.3 5.7a1 1 0 0 1 0-1.4Z" />
        </svg>
      </Link>
    </motion.div>
  );
}
