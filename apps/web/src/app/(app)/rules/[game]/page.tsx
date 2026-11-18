'use client';
import { use } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { GAMES, type GameKind } from '@coldcall/shared';
import { RulesBody } from '@/components/app/RulesSheet';
import { Card, Eyebrow } from '@/components/ui';
import { WORLD, WorldArt } from '@/components/app/WorldArt';

export default function RulesPage({ params }: { params: Promise<{ game: string }> }) {
  const { game } = use(params);
  if (!['chess', 'backgammon', 'tichu', 'seabattle'].includes(game)) notFound();
  const g = game as GameKind;
  return (
    <div className="mx-auto max-w-2xl">
      <div className="-mx-4 mb-2 flex gap-2 overflow-x-auto px-4 py-2 no-scrollbar sm:mx-0 sm:px-0">
        {(Object.keys(GAMES) as (keyof typeof GAMES)[]).map((k) => (
          <Link key={k} href={`/rules/${k}`} aria-current={k === g ? 'page' : undefined} className={`press shrink-0 rounded-full px-4 py-2 text-sm font-semibold ${k === g ? 'btn-primary' : 'btn-secondary text-text-2'}`}>
            {GAMES[k].name}
          </Link>
        ))}
      </div>
      <div className="glass relative overflow-hidden rounded-[24px]" style={{ '--tint': WORLD[g].c } as React.CSSProperties}>
        <WorldArt game={g} className="h-40 w-full [mask-image:linear-gradient(to_bottom,#000_55%,transparent)] sm:h-48" />
        <div className="relative -mt-10 px-5 pb-5">
          <Eyebrow className="game-ink">{WORLD[g].world}</Eyebrow>
          <h1 className="t-display mt-1">{GAMES[g].name} rules</h1>
          <p className="mt-1 text-text-2">{GAMES[g].tagline}</p>
        </div>
      </div>
      <Card className="mt-4 p-5" tint={WORLD[g].c}>
        <RulesBody game={g} />
      </Card>
    </div>
  );
}
