'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Card, Skeleton } from '@/components/ui';
import { Credits } from '@/components/admin/parts';
import { DataTable, ErrorBox, Legs, Net, Panel, Pill, txLabel, Addr, type Leg } from '@/components/admin/parts';
import { GameName, Outcome, StatusPill } from '@/components/admin/lists';
import { MODE_NAME, fmtDate, fmtDuration, fmtPct, useAdmin, type GameId } from '@/components/admin/data';

interface Detail {
  table: {
    id: string;
    game: GameId;
    mode: string;
    stake: number;
    fee: number;
    status: string;
    visibility: string;
    capacity: number;
    time_control: string | null;
    bot_level: number | null;
    disclosed: any;
    seed_commit: string;
    client_seed_count: number;
    result: { result: any; payouts: { seat: number; delta: number }[] } | null;
    created_at: string;
    started_at: string | null;
    ended_at: string | null;
    created_by: string | null;
    created_by_name: string | null;
    secs: number | null;
    fee_taken: number;
  };
  seats: { seat: number; user_id: string | null; is_bot: boolean; bot_name: string | null; joined_at: string; payout: number | null; display_name: string | null; wallet_address: string | null }[];
  moves: { n: number; last_at: string | null; avg_think_ms: number | null; by_seat: { seat: number; n: number }[] };
  transactions: { id: string; kind: string; memo: string | null; created_at: string; legs: Leg[] }[];
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[13px] text-text-2">{label}</dt>
      <dd className="mt-0.5 break-words font-semibold">{children}</dd>
    </div>
  );
}

export default function GameDetail() {
  const { id } = useParams<{ id: string }>();
  const { data, error, reload } = useAdmin<Detail>(`/api/admin/games/${id}`);
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return <Skeleton className="h-[520px]" />;
  const t = data.table;
  const res = t.result?.result ?? null;
  const target = t.disclosed?.expected?.win ?? t.disclosed?.expectedWin ?? null;
  const movesBySeat = new Map(data.moves.by_seat.map((m) => [m.seat, m.n]));

  return (
    <div className="space-y-4">
      <Link href="/admin/games" className="inline-flex text-sm font-semibold text-text-2 hover:text-text">
        ← All games
      </Link>
      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-[22px] font-bold uppercase">
              <GameName game={t.game} />
            </h2>
            <Pill tone={t.mode === 'practice' ? 'neutral' : 'accent'}>{MODE_NAME[t.mode]}</Pill>
            <StatusPill status={t.status} />
            {t.visibility === 'private' ? <Pill>Private invite</Pill> : null}
          </div>
          <Link href={`/verify/${t.id}`} className="btn-secondary press inline-flex h-11 items-center rounded-chip px-4 text-[15px] font-semibold">
            Open public verify page
          </Link>
        </div>
        <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <Fact label="Stake per player">{t.mode === 'practice' ? 'Free' : <Credits minor={t.stake} />}</Fact>
          <Fact label="Fee taken">
            <Credits minor={t.fee_taken} />
          </Fact>
          <Fact label="Result">{res ? <Outcome g={{ result: res, status: t.status, seats: data.seats.map((s) => ({ seat: s.seat, userId: s.user_id, name: s.display_name ?? s.bot_name ?? `Seat ${s.seat}`, bot: s.is_bot, payout: s.payout })) }} /> : 'Not finished'}</Fact>
          <Fact label="Length">{fmtDuration(t.secs)}</Fact>
          <Fact label="Moves">
            {data.moves.n}
            {data.moves.avg_think_ms ? <span className="font-normal text-text-2">, {(data.moves.avg_think_ms / 1000).toFixed(1)}s avg</span> : null}
          </Fact>
          <Fact label="Time control">{t.time_control ?? 'None'}</Fact>
          <Fact label="Created">{fmtDate(t.created_at)}</Fact>
          <Fact label="Started">{fmtDate(t.started_at)}</Fact>
          <Fact label="Ended">{t.ended_at ? fmtDate(t.ended_at) : 'Not yet'}</Fact>
          <Fact label="Created by">{t.created_by ? <Link className="hover:text-primary hover:underline" href={`/admin/accounts/${t.created_by}`}>{t.created_by_name}</Link> : 'Unknown'}</Fact>
          <Fact label="Bot level">{t.bot_level ?? (t.disclosed?.engineElo ? `Engine ${t.disclosed.engineElo}` : 'No bot')}</Fact>
          <Fact label="Disclosed win chance">{target === null ? 'Not a bot game' : fmtPct(target)}</Fact>
        </dl>
        <p className="mt-4 break-words text-[13px] text-text-2">
          Seed commitment <span className="break-all font-mono">{t.seed_commit}</span>, {t.client_seed_count} player {t.client_seed_count === 1 ? 'seed' : 'seeds'}. The server seed is only shown on the public verify page after the game ends.
        </p>
      </Card>

      <Panel title="Seats" info="Who sat where. Their result is the change in the table coin after fees; practice games always show zero.">
        <DataTable
          caption="Seats"
          rowKey={(s) => String(s.seat)}
          rows={data.seats}
          empty="No one sat down."
          cols={[
            { key: 'seat', label: 'Seat', render: (s) => s.seat + 1 },
            {
              key: 'who',
              label: 'Player',
              render: (s) =>
                s.user_id ? (
                  <Link href={`/admin/accounts/${s.user_id}`} className="font-semibold hover:text-primary hover:underline">
                    {s.display_name}
                  </Link>
                ) : (
                  <span className="text-text-2">{s.bot_name} (bot)</span>
                ),
            },
            { key: 'wallet', label: 'Wallet', render: (s) => (s.wallet_address ? <Addr value={s.wallet_address} /> : <span className="text-text-2">Bot</span>) },
            { key: 'won', label: 'Outcome', render: (s) => (!res ? <span className="text-text-2">Not finished</span> : res.draw ? 'Draw' : res.winners.includes(s.seat) ? <Pill tone="good">Won</Pill> : <Pill>Lost</Pill>) },
            { key: 'moves', label: 'Moves', align: 'right', render: (s) => movesBySeat.get(s.seat) ?? 0 },
            { key: 'pay', label: 'Their result', align: 'right', render: (s) => (s.payout === null ? <span className="text-text-2">None</span> : <Net minor={s.payout} />) },
            { key: 'joined', label: 'Joined', render: (s) => fmtDate(s.joined_at) },
          ]}
        />
      </Panel>

      <Panel title="Money for this game" info="Every ledger transaction booked for this table: entries, the house match against the bot, and the settlement.">
        <DataTable
          caption="Ledger transactions for this game"
          rowKey={(x) => x.id}
          rows={data.transactions}
          empty={t.mode === 'practice' ? 'Practice games never move money.' : 'No money moved for this game.'}
          cols={[
            { key: 'at', label: 'When', render: (x) => fmtDate(x.created_at) },
            { key: 'kind', label: 'Type', render: (x) => <span className="font-semibold">{txLabel(x.kind)}</span> },
            { key: 'memo', label: 'Note', render: (x) => <span className="text-text-2">{x.memo}</span> },
            { key: 'legs', label: 'Legs', render: (x) => <Legs legs={x.legs} /> },
          ]}
        />
      </Panel>
    </div>
  );
}
