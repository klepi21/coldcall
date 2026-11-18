'use client';
import Link from 'next/link';
import { useSession } from '@/components/app/Providers';
import { useProgress } from './store';
import { LevelBadge, XpBar } from './parts';

/**
 * Compact level chip for the top bar: level in a glowing badge with an XP ring, and a thin bar on wider screens.
 * Links to /progress. Renders nothing when signed out.
 */
export function LevelChip({ showBar = true, className = '' }: { showBar?: boolean; className?: string }) {
  const { me } = useSession();
  const { data } = useProgress();
  if (!me) return null;
  const level = data?.level ?? 1;
  const pct = data ? data.xpInLevel / data.xpToNext : 0;
  const label = data ? `Level ${level}, ${data.xpInLevel} of ${data.xpToNext} XP to level ${level + 1}. Open your progress.` : 'Your level. Open your progress.';
  return (
    <Link
      href="/progress"
      aria-label={label}
      className={`group inline-flex h-11 items-center gap-2 rounded-full pl-1 pr-1 transition hover:bg-[color-mix(in_srgb,var(--text)_7%,transparent)] active:scale-[0.97] ${showBar ? 'sm:pr-3' : ''} ${className}`}
    >
      <LevelBadge level={level} pct={pct} size={36} />
      {showBar ? (
        <span className="hidden w-[72px] flex-col gap-1 sm:flex">
          <span className="flex items-baseline justify-between text-[11px] font-semibold leading-none text-text-2">
            <span className="font-display uppercase tracking-wide text-text">Lv {level}</span>
            <span className="tabular">{data ? `${Math.round(pct * 100)}%` : ''}</span>
          </span>
          <XpBar pct={pct} height={4} />
        </span>
      ) : null}
    </Link>
  );
}
