'use client';
import { useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import type { ProgressGame, ProgressResponse } from '@evens/shared';
import { Skeleton } from '@/components/ui';
import { useProgress } from './store';
import { GAME_COLOR, GAME_NAME, Icon, XpBar, ink, tint } from './parts';

type Ach = ProgressResponse['achievements'][number];
const FILTERS: { id: 'all' | 'general' | ProgressGame; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'general', label: 'General' },
  { id: 'chess', label: 'Chess' },
  { id: 'backgammon', label: 'Backgammon' },
  { id: 'tichu', label: 'Tichu' },
  { id: 'seabattle', label: 'Sea Battle' },
];

function Tile({ a, i }: { a: Ach; i: number }) {
  const reduce = useReducedMotion();
  const color = a.game ? GAME_COLOR[a.game] : '#ffd23f';
  return (
    <motion.li
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, delay: Math.min(i, 12) * 0.03 }}
      className="relative flex gap-3 rounded-card p-3.5"
      style={{
        background: a.unlocked ? `linear-gradient(135deg, ${tint(color, 16)}, ${tint(color, 4)})` : tint('#ffffff', 3),
        boxShadow: `inset 0 0 0 1px ${a.unlocked ? tint(color, 45) : 'color-mix(in srgb, var(--text) 8%, transparent)'}`,
      }}
    >
      <span
        className="relative inline-flex size-12 shrink-0 items-center justify-center rounded-full"
        style={a.unlocked ? { background: color, color: '#0a0a0f', boxShadow: `0 0 18px ${tint(color, 55)}` } : { background: 'color-mix(in srgb, var(--text) 7%, transparent)', color: 'color-mix(in srgb, var(--text) 28%, transparent)' }}
      >
        <Icon name={a.icon} className="size-6" />
        {!a.unlocked ? (
          <span className="absolute -bottom-0.5 -right-0.5 inline-flex size-5 items-center justify-center rounded-full bg-surface-2 text-text-2 ring-2 ring-[var(--surface)]">
            <Icon name="lock" className="size-3" />
          </span>
        ) : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className={`font-semibold ${a.unlocked ? '' : 'text-text-2'}`}>{a.name}</span>
          {a.xp ? <span className="shrink-0 text-[11px] font-bold tabular" style={{ color: a.unlocked ? 'var(--text-2)' : 'var(--primary)' }}>+{a.xp} XP</span> : null}
        </span>
        <span className="mt-0.5 block text-sm leading-snug text-text-2">{a.how}</span>
        {a.reward ? <span className="mt-1 block text-xs font-semibold" style={{ color: a.unlocked ? ink(color) : 'var(--text-2)' }}>Reward: {a.reward}</span> : null}
        {!a.unlocked && a.target > 1 ? (
          <span className="mt-2 flex items-center gap-2">
            <XpBar pct={a.progress / a.target} height={4} color={color} />
            <span className="shrink-0 text-[11px] font-semibold tabular text-text-2">
              {a.progress}/{a.target}
            </span>
          </span>
        ) : null}
        {a.unlocked && a.unlockedAt ? <span className="mt-1 block text-xs text-text-2">Unlocked {new Date(a.unlockedAt).toLocaleDateString()}</span> : null}
      </span>
    </motion.li>
  );
}

/** Every achievement: unlocked ones glow, locked ones show as silhouettes with how to unlock them. */
export function AchievementsGrid({ achievements, filterable = true }: { achievements?: Ach[]; filterable?: boolean }) {
  const { data } = useProgress();
  const list = achievements ?? data?.achievements;
  const [f, setF] = useState<(typeof FILTERS)[number]['id']>('all');
  const [all, setAll] = useState(false);
  if (!list) return <Skeleton className="h-64" />;
  const shown = list
    .filter((a) => f === 'all' || (f === 'general' ? a.game === null : a.game === f))
    .sort((x, y) => Number(y.unlocked) - Number(x.unlocked));
  return (
    <div>
      {filterable ? (
        <div className="no-scrollbar -mx-1 mb-3 flex gap-2 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Filter achievements">
          {FILTERS.map((x) => {
            const n = list.filter((a) => x.id === 'all' || (x.id === 'general' ? a.game === null : a.game === x.id));
            return (
              <button
                key={x.id}
                role="tab"
                aria-selected={f === x.id}
                onClick={() => setF(x.id)}
                className={`h-11 shrink-0 rounded-full px-4 text-sm font-semibold transition active:scale-[0.97] ${f === x.id ? 'bg-text text-bg' : 'bg-[color-mix(in_srgb,var(--text)_7%,transparent)] text-text-2 hover:text-text'}`}
              >
                {x.label} <span className="tabular opacity-70">{n.filter((a) => a.unlocked).length}/{n.length}</span>
              </button>
            );
          })}
        </div>
      ) : null}
      <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {(all || f !== 'all' ? shown : shown.slice(0, Math.max(9, shown.filter((a) => a.unlocked).length + 3))).map((a, i) => (
          <Tile key={a.code} a={a} i={i} />
        ))}
      </ul>
      {!all && f === 'all' && shown.length > Math.max(9, shown.filter((a) => a.unlocked).length + 3) ? (
        <button onClick={() => setAll(true)} className="mt-3 h-11 w-full rounded-chip bg-[color-mix(in_srgb,var(--text)_6%,transparent)] font-semibold text-text hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)]">
          Show all {shown.length} achievements
        </button>
      ) : null}
      {f !== 'all' && f !== 'general' ? <p className="sr-only">{GAME_NAME[f]} achievements</p> : null}
    </div>
  );
}
