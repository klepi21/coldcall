'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { GAMES, type Currency } from '@coldcall/shared';
import { useSession } from '@/components/app/Providers';
import { Card, Amount, Empty, Skeleton, Button, Chip, PageHeader } from '@/components/ui';
import { WORLD } from '@/components/app/WorldArt';
import { api } from '@/lib/api';

interface Row {
  id: string;
  game: 'chess' | 'backgammon' | 'tichu' | 'seabattle';
  mode: 'practice' | 'bot' | 'pvp';
  currency: Currency;
  stake: number;
  status: string;
  result: any;
  created_at: string;
  seat: number;
  payout: number | null;
}

export default function HistoryPage() {
  const { me, openAuth, ready, currency } = useSession();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [filter, setFilter] = useState<'all' | 'chess' | 'backgammon' | 'tichu' | 'seabattle'>('all');
  useEffect(() => {
    if (me) api<Row[]>('/api/me/history').then(setRows).catch(() => setRows([]));
  }, [me]);
  if (ready && !me) return <Empty title="Your games" text="Sign in to see your games and results." action={<Button onClick={() => openAuth()}>Start playing</Button>} />;
  // Money games of the active coin only (practice games carry no coin and always show).
  const list = rows?.filter((r) => (filter === 'all' || r.game === filter) && (r.mode === 'practice' || r.currency === currency)) ?? null;
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader eyebrow={`Your ${currency} games and free practice games`} title="History" sub={`Games in the other coin are under the other coin. Switch at the top.`} />
      <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 py-2 no-scrollbar sm:mx-0 sm:px-0">
        {(['all', 'chess', 'backgammon', 'tichu', 'seabattle'] as const).map((f) => (
          <span key={f} className="shrink-0">
            <Chip active={filter === f} onClick={() => setFilter(f)}>
              {f === 'all' ? 'All' : GAMES[f].name}
            </Chip>
          </span>
        ))}
      </div>
      <div className="mt-4">
        {!list ? (
          <div className="space-y-2">
            <Skeleton className="h-[68px]" />
            <Skeleton className="h-[68px]" />
            <Skeleton className="h-[68px]" />
          </div>
        ) : list.length === 0 ? (
          <Empty title="No games yet" text="Your finished games show up here, with results and a link to verify each one." action={<Link href="/play" className="font-semibold text-primary">Play a game</Link>} />
        ) : (
          <Card className="divide-well overflow-hidden">
            {list.map((r) => {
              const won = r.result?.result?.winners?.includes(r.seat);
              const draw = r.result?.result?.draw;
              const label = r.status === 'playing' ? 'In progress' : r.status === 'waiting' ? 'Waiting for players' : r.status === 'cancelled' ? 'Cancelled, refunded' : won ? 'Won' : draw ? 'Draw' : 'Lost';
              return (
                <Link key={r.id} href={r.status === 'playing' || r.status === 'waiting' ? `/table/${r.id}` : `/verify/${r.id}`} className="relative flex items-center justify-between gap-3 py-3 pl-5 pr-4 transition-colors hover:bg-well">
                  <span className="absolute inset-y-3 left-0 w-[3px] rounded-full" style={{ background: WORLD[r.game]?.c ?? 'var(--accent)', boxShadow: `0 0 10px ${WORLD[r.game]?.c ?? 'transparent'}` }} aria-hidden />
                  <div className="min-w-0">
                    <p className="font-medium">
                      {GAMES[r.game].name}{' '}
                      <span className="text-sm font-normal text-text-2">{r.mode === 'practice' ? 'practice' : r.mode === 'bot' ? 'vs bot' : 'vs people'}</span>
                    </p>
                    <p className="text-sm text-text-2">
                      <span className={won ? 'font-semibold text-win' : r.status === 'settled' && !draw ? 'text-text-2' : ''}>{label}</span>, {new Date(r.created_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
                    </p>
                  </div>
                  {r.mode !== 'practice' && r.payout !== null ? <Amount minor={r.payout} currency={r.currency} sign className={r.payout > 0 ? 'text-win' : ''} /> : <span className="text-sm text-text-2">{r.mode === 'practice' ? 'Free' : ''}</span>}
                </Link>
              );
            })}
          </Card>
        )}
      </div>
    </div>
  );
}
