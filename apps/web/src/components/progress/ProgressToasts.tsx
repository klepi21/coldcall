'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type { ProgressMsg } from '@coldcall/shared';
import { play, haptic } from '@/lib/sound';
import { onProgressMsg, useProgressFeed } from './store';
import { Burst, Icon, LevelBadge } from './parts';

type Toast = { id: number; kind: 'xp' | 'level' | 'achievement' | 'challenge'; title: string; text?: string; icon?: string; level?: number };

/**
 * Global listener for progress pushes: "+50 XP", "Level up!" and achievement popups.
 * Place once in the app shell. It stays quiet on game tables, where the result screen shows the same news.
 */
export function ProgressToasts() {
  useProgressFeed();
  const path = usePathname();
  const pathRef = useRef(path);
  pathRef.current = path;
  const reduce = useReducedMotion();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nid = useRef(0);

  useEffect(
    () =>
      onProgressMsg((m: ProgressMsg) => {
        if (pathRef.current?.startsWith('/table/')) return;
        if (!m.xpGained && !m.newAchievements.length) return;
        const list: Toast[] = [];
        if (m.xpGained) list.push({ id: ++nid.current, kind: 'xp', title: `+${m.xpGained} XP`, text: m.breakdown.slice(0, 2).map((l) => l.label).join(', ') });
        if (m.levelUp) list.push({ id: ++nid.current, kind: 'level', title: 'Level up!', text: `You reached level ${m.level}.`, level: m.level });
        for (const c of m.challengesDone) list.push({ id: ++nid.current, kind: 'challenge', title: 'Daily challenge done', text: c.name, icon: 'check' });
        for (const a of m.newAchievements) list.push({ id: ++nid.current, kind: 'achievement', title: a.name, text: 'Achievement unlocked', icon: a.icon });
        list.forEach((t, i) =>
          setTimeout(() => {
            setToasts((x) => [...x.slice(-3), t]);
            if (t.kind === 'xp') play('coin');
            else (play('win'), haptic('strong'));
            setTimeout(() => setToasts((x) => x.filter((y) => y.id !== t.id)), 4200);
          }, i * 650),
        );
      }),
    [],
  );

  return (
    <div className="pointer-events-none fixed inset-x-0 top-[calc(64px+env(safe-area-inset-top))] z-[70] flex flex-col items-center gap-2 px-4" aria-live="polite">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout={!reduce}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: -16, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -10, scale: 0.96 }}
            transition={reduce ? { duration: 0.2 } : { type: 'spring', stiffness: 380, damping: 26 }}
            className="pointer-events-auto relative"
          >
            <Link
              href="/progress"
              className={`relative flex min-h-11 items-center gap-3 overflow-visible rounded-full py-1.5 pl-1.5 pr-5 shadow-modal backdrop-blur-xl ${
                t.kind === 'xp' ? 'bg-[#0d0b1c]/90 ring-1 ring-[#c6ff3d]/40' : 'bg-[#1a1408]/92 ring-1 ring-[#ffd23f]/55'
              }`}
            >
              {t.kind !== 'xp' ? <Burst count={14} /> : null}
              {t.kind === 'level' ? (
                <LevelBadge level={t.level ?? 1} pct={1} size={36} />
              ) : (
                <span className={`inline-flex size-9 items-center justify-center rounded-full ${t.kind === 'xp' ? 'bg-[#c6ff3d] text-[#0a0a0f]' : 'bg-[#ffd23f] text-[#1a1408]'}`}>
                  <Icon name={t.kind === 'xp' ? 'spark' : (t.icon ?? 'star')} className="size-5" />
                </span>
              )}
              <span className="min-w-0">
                <span className={`block font-display text-[15px] font-bold leading-tight ${t.kind === 'xp' ? 'text-[#c6ff3d]' : 'text-[#ffd23f]'}`}>{t.title}</span>
                {t.text ? <span className="block max-w-[240px] truncate text-xs text-white/70">{t.text}</span> : null}
              </span>
            </Link>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
