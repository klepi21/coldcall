'use client';
import Link from 'next/link';
import { useSession } from '@/components/app/Providers';
import { Skeleton } from '@/components/ui';
import { useProgress } from './store';
import { ChallengeList } from './Challenges';
import { LevelBadge, XpBar, fmtDuration, glass, useResetIn } from './parts';

/**
 * Lobby strip: level, XP bar, today's three free challenges and time until they reset.
 * Self contained: drop it in with one line. Renders nothing when signed out.
 */
export function ProgressStrip({ className = '' }: { className?: string }) {
  const { me } = useSession();
  const { data, error, reload } = useProgress();
  const resetIn = useResetIn(data?.challenges.resetsInMs);
  if (!me) return null;
  if (!data)
    return error ? (
      <div className={`${glass} flex items-center justify-between gap-3 p-4 text-sm ${className}`}>
        <span className="text-text-2">We could not load your progress. Your games are not affected.</span>
        <button onClick={() => reload()} className="h-11 shrink-0 rounded-chip px-4 font-semibold text-primary hover:bg-surface-2">
          Try again
        </button>
      </div>
    ) : (
      <Skeleton className={`h-[164px] ${className}`} />
    );
  const pct = data.xpInLevel / data.xpToNext;
  const done = data.challenges.items.filter((c) => c.done).length;
  return (
    <section aria-label="Your level and daily challenges" className={`${glass} overflow-hidden p-4 sm:p-5 ${className}`}>
      <div className="pointer-events-none absolute -left-16 -top-20 size-56 rounded-full bg-[#7c5cff]/20 blur-3xl" aria-hidden />
      <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:gap-6">
        <Link href="/progress" className="flex min-w-0 items-center gap-3 rounded-chip lg:w-[300px] lg:shrink-0" aria-label={`Level ${data.level}. Open your progress.`}>
          <LevelBadge level={data.level} pct={pct} size={56} />
          <span className="min-w-0 flex-1">
            <span className="flex items-baseline justify-between gap-2">
              <span className="font-display text-[15px] font-bold uppercase tracking-wide">Level {data.level}</span>
              <span className="text-xs font-semibold tabular text-text-2">
                {data.xpInLevel} / {data.xpToNext} XP
              </span>
            </span>
            <XpBar pct={pct} className="mt-2" />
            <span className="mt-1.5 block truncate text-xs text-text-2">{data.title ? `${data.title}. ` : ''}Same XP whether you play free or with a stake.</span>
          </span>
        </Link>
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <p className="text-sm font-semibold">
              Daily challenges <span className="text-text-2">{done}/3</span>
            </p>
            <p className="text-xs text-text-2">{resetIn !== null ? `New ones in ${fmtDuration(resetIn)}` : ''}</p>
          </div>
          <ChallengeList items={data.challenges.items} compact />
        </div>
      </div>
    </section>
  );
}
