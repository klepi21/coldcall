'use client';
import { motion, useReducedMotion } from 'motion/react';
import type { ChallengeInfo } from '@coldcall/shared';
import { GAME_COLOR, Icon, XpBar, ink, tint } from './parts';

/** Today's three free daily challenges with progress. */
export function ChallengeList({ items, compact = false }: { items: ChallengeInfo[]; compact?: boolean }) {
  const reduce = useReducedMotion();
  return (
    <ul className={`grid gap-2 ${compact ? 'sm:grid-cols-3' : ''}`}>
      {items.map((c, i) => {
        const color = c.game ? GAME_COLOR[c.game] : '#7c5cff';
        const pct = c.progress / c.target;
        return (
          <motion.li
            key={c.code}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12, filter: 'blur(4px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            transition={{ duration: 0.28, delay: i * 0.04 }}
            className="flex items-center gap-3 rounded-chip p-3"
            style={{ background: c.done ? tint('#c6ff3d', 10) : tint('#ffffff', 4), boxShadow: `inset 0 0 0 1px ${c.done ? tint('#c6ff3d', 35) : tint(color, 22)}` }}
          >
            <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full" style={{ background: c.done ? '#c6ff3d' : tint(color, 18), color: c.done ? '#0a0a0f' : ink(color) }}>
              <Icon name={c.done ? 'check' : c.game === 'seabattle' ? 'target' : c.game === 'chess' ? 'king' : c.game === 'backgammon' ? 'dice' : c.game === 'tichu' ? 'card' : 'spark'} className="size-[18px]" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-2">
                <span className="truncate text-[15px] font-semibold">{c.name}</span>
                <span className="shrink-0 text-xs font-semibold tabular text-text-2">{c.done ? 'Done' : `${c.progress}/${c.target}`}</span>
              </span>
              {!compact ? <span className="mt-0.5 block text-sm text-text-2">{c.how}</span> : null}
              <span className="mt-1.5 flex items-center gap-2">
                <XpBar pct={pct} height={5} color={c.done ? '#c6ff3d' : color} />
                <span className="shrink-0 text-[11px] font-bold tabular" style={{ color: c.done ? 'var(--text-2)' : 'var(--primary)' }}>
                  +{c.xp} XP
                </span>
              </span>
            </span>
          </motion.li>
        );
      })}
    </ul>
  );
}
