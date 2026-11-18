'use client';
import type { GameStats, ProgressGame } from '@coldcall/shared';
import { Skeleton } from '@/components/ui';
import { useProgress } from './store';
import { GAME_COLOR, GAME_NAME, Icon, XpBar, glass, ink, tint } from './parts';

const GAME_ICON: Record<ProgressGame, string> = { chess: 'king', backgammon: 'dice', tichu: 'card', seabattle: 'anchor' };

function extras(s: GameStats): [string, string][] {
  const e = s.extra;
  if (s.game === 'chess') return [['Checkmates', String(e.checkmates ?? 0)], ['Promotions', String(e.promotions ?? 0)]];
  if (s.game === 'backgammon') return [['Gammons', String((e.gammons ?? 0) + (e.backgammons ?? 0))], ['Backgammons', String(e.backgammons ?? 0)]];
  if (s.game === 'tichu') return [['Calls made', String((e.tichusMade ?? 0) + (e.grandsMade ?? 0))], ['Double wins', String(e.doubleVictories ?? 0)]];
  return [
    ['Best fleet', e.bestShots ? `${e.bestShots} shots` : 'None yet'],
    ['Accuracy', e.shots ? `${Math.round(((e.hits ?? 0) / e.shots) * 100)}%` : 'None yet'],
  ];
}

/** Per game stats and ranks. Ranks come from XP earned in that game, so practice moves them too. */
export function StatsPanel({ stats }: { stats?: GameStats[] }) {
  const { data } = useProgress();
  const list = stats ?? data?.stats;
  if (!list) return <Skeleton className="h-64" />;
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {list.map((s) => {
        const color = GAME_COLOR[s.game];
        const rate = s.games ? Math.round((s.wins / s.games) * 100) : null;
        const rows: [string, string][] = [
          ['Games', String(s.games)],
          ['Wins', String(s.wins)],
          ['Win rate', rate === null ? 'None yet' : `${rate}%`],
          ['Best streak', String(s.bestStreak)],
          ...extras(s),
        ];
        return (
          <li key={s.game} className={`${glass} overflow-hidden p-4`} style={{ boxShadow: `inset 0 1px 0 ${tint('#ffffff', 7)}, inset 0 0 0 1px ${tint(color, 22)}` }}>
            <div className="pointer-events-none absolute -right-10 -top-12 size-40 rounded-full blur-3xl" style={{ background: tint(color, 22) }} aria-hidden />
            <div className="relative flex items-center gap-3">
              <span className="inline-flex size-11 items-center justify-center rounded-chip" style={{ background: tint(color, 18), color: ink(color) }}>
                <Icon name={GAME_ICON[s.game]} className="size-6" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-display text-[15px] font-bold uppercase tracking-wide">{GAME_NAME[s.game]}</p>
                <p className="text-sm text-text-2">
                  <span className="font-semibold" style={{ color: ink(color) }}>
                    {s.rank.name}
                  </span>
                  {s.rank.next ? `, ${(s.rank.xpForNext ?? 0) - s.rank.xpInRank} XP to ${s.rank.next}` : ', top rank'}
                </p>
              </div>
            </div>
            <XpBar className="relative mt-3" pct={s.rank.xpForNext ? s.rank.xpInRank / s.rank.xpForNext : 1} height={6} color={color} />
            <dl className="relative mt-3 grid grid-cols-3 gap-x-3 gap-y-2">
              {rows.map(([k, v]) => (
                <div key={k} className="min-w-0">
                  <dt className="truncate text-[11px] font-semibold uppercase tracking-wide text-text-2">{k}</dt>
                  <dd className="truncate font-semibold tabular">{v}</dd>
                </div>
              ))}
            </dl>
          </li>
        );
      })}
    </ul>
  );
}
