'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Button, Credits, Sheet } from '@/components/ui';
import { useSession } from '@/components/app/Providers';
import { api } from '@/lib/api';
import { Addr, DataTable, ErrorBox, Legs, Net, Pager, Pill, RowsSkeleton, txLabel, type Col, type Leg } from './parts';
import { GAME_NAME, GAME_VAR, MODE_NAME, WD_STATUS, fmtAgo, fmtDate, fmtDuration, qs, short, useAdmin, type GameId, type Paged } from './data';

/* ---------- games ---------- */

export interface Seat {
  seat: number;
  userId: string | null;
  name: string;
  bot: boolean;
  payout: number | null;
}
export interface GameRow {
  id: string;
  game: GameId;
  mode: string;
  stake: number;
  fee: number;
  status: string;
  capacity: number;
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
  result: { draw: boolean; winners: number[]; reason?: string } | null;
  secs: number | null;
  seats: Seat[];
  fee_taken: number;
  moves: number;
}

export const STATUS_NAME: Record<string, string> = { waiting: 'Waiting', playing: 'Playing', settled: 'Finished', cancelled: 'Cancelled' };
const REASON: Record<string, string> = { checkmate: 'checkmate', resign: 'resigned', timeout: 'out of time', gammon: 'gammon', backgammon: 'backgammon', score_limit: 'score reached', stalemate: 'stalemate', agreement: 'agreed' };

export function GameName({ game }: { game: GameId }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="inline-block size-2.5 rounded-full" style={{ background: GAME_VAR[game] }} aria-hidden />
      {GAME_NAME[game]}
    </span>
  );
}

export function StatusPill({ status }: { status: string }) {
  return <Pill tone={status === 'playing' ? 'accent' : status === 'cancelled' ? 'neutral' : status === 'waiting' ? 'warn' : 'good'}>{STATUS_NAME[status] ?? status}</Pill>;
}

export function Outcome({ g }: { g: Pick<GameRow, 'result' | 'seats' | 'status'> }) {
  if (g.status !== 'settled' || !g.result) return <span className="text-text-2">{g.status === 'cancelled' ? 'Refunded' : 'Not finished'}</span>;
  const reason = g.result.reason ? REASON[g.result.reason] ?? g.result.reason.replace(/_/g, ' ') : '';
  if (g.result.draw) return <span>Draw{reason ? <span className="text-text-2">, {reason}</span> : null}</span>;
  const names = g.seats.filter((s) => g.result!.winners.includes(s.seat)).map((s) => s.name + (s.bot ? ' (bot)' : ''));
  return (
    <span>
      {names.join(' and ') || 'Unknown'} won{reason ? <span className="text-text-2">, {reason}</span> : null}
    </span>
  );
}

function Players({ seats, focus }: { seats: Seat[]; focus?: string }) {
  return (
    <span className="inline-flex flex-wrap gap-x-2 gap-y-0.5">
      {seats.map((s) =>
        s.userId ? (
          <Link key={s.seat} href={`/admin/accounts/${s.userId}`} className={`hover:text-primary hover:underline ${s.userId === focus ? 'font-semibold' : ''}`}>
            {s.name}
          </Link>
        ) : (
          <span key={s.seat} className="text-text-2">
            {s.name} (bot)
          </span>
        ),
      )}
    </span>
  );
}

export function gameCols(focus?: string): Col<GameRow>[] {
  return [
    { key: 'game', label: 'Game', render: (r) => <GameName game={r.game} /> },
    { key: 'mode', label: 'Mode', render: (r) => <Pill tone={r.mode === 'practice' ? 'neutral' : 'accent'}>{MODE_NAME[r.mode]}</Pill> },
    { key: 'status', label: 'Status', render: (r) => <StatusPill status={r.status} /> },
    { key: 'players', label: 'Players', render: (r) => <Players seats={r.seats} focus={focus} /> },
    { key: 'stake', label: 'Stake', align: 'right', render: (r) => (r.mode === 'practice' ? <span className="text-text-2">Free</span> : <Credits minor={r.stake} coin={false} />) },
    { key: 'result', label: 'Result', render: (r) => <Outcome g={r} /> },
    focus
      ? { key: 'mine', label: 'Their result', align: 'right', info: 'This player’s credit change in this game, after fees.', render: (r) => { const s = r.seats.find((x) => x.userId === focus); return s?.payout === null || s?.payout === undefined ? <span className="text-text-2">None</span> : <Net minor={s.payout} />; } }
      : { key: 'fee', label: 'Fee', align: 'right', info: 'Fee booked to the fee account for this game.', render: (r) => <Credits minor={r.fee_taken} coin={false} /> },
    { key: 'len', label: 'Length', align: 'right', render: (r) => fmtDuration(r.secs) },
    { key: 'moves', label: 'Moves', align: 'right', render: (r) => r.moves },
    { key: 'created', label: 'Started', render: (r) => <span title={fmtDate(r.created_at)}>{fmtAgo(r.created_at)}</span> },
    { key: 'ended', label: 'Ended', render: (r) => (r.ended_at ? <span title={fmtDate(r.ended_at)}>{fmtAgo(r.ended_at)}</span> : <span className="text-text-2">Not yet</span>) },
  ];
}

/** Self contained, paged games list for one player. */
export function PlayerGames({ userId }: { userId: string }) {
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useAdmin<Paged<GameRow>>(`/api/admin/games${qs({ userId, page, limit: 10 })}`);
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return <RowsSkeleton rows={4} />;
  return (
    <>
      <DataTable caption="Games for this player" cols={gameCols(userId)} rows={data.rows} rowKey={(r) => r.id} href={(r) => `/admin/games/${r.id}`} empty="This player has not played yet." />
      <Pager page={page} limit={data.limit} total={data.total} loading={loading} onPage={setPage} />
    </>
  );
}

/* ---------- ledger transactions ---------- */

export interface TxRow {
  id: string;
  kind: string;
  memo: string | null;
  created_at: string;
  table_id: string | null;
  user_id: string | null;
  display_name: string | null;
  idempotency_key: string;
  legs: Leg[];
  available_delta: number;
}

export function TxList({ userId, kind, limit = 15 }: { userId?: string; kind?: string; limit?: number }) {
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useAdmin<Paged<TxRow>>(`/api/admin/money/transactions${qs({ userId, kind, page, limit })}`);
  const cols: Col<TxRow>[] = [
    { key: 'at', label: 'When', render: (r) => <span title={fmtDate(r.created_at)}>{fmtDate(r.created_at)}</span> },
    { key: 'kind', label: 'Type', render: (r) => <span className="font-semibold">{txLabel(r.kind)}</span> },
    ...(userId
      ? []
      : [{ key: 'who', label: 'Player', render: (r: TxRow) => (r.user_id ? <Link href={`/admin/accounts/${r.user_id}`} className="hover:text-primary hover:underline">{r.display_name}</Link> : <span className="text-text-2">System</span>) }]),
    { key: 'memo', label: 'Note', render: (r) => <span className="text-text-2">{r.memo ?? ''}{r.table_id ? <Link href={`/admin/games/${r.table_id}`} className="ml-1 underline decoration-dotted hover:text-primary">game</Link> : null}</span> },
    ...(userId ? [{ key: 'delta', label: 'Available change', align: 'right' as const, info: 'How this transaction changed the player’s available balance.', render: (r: TxRow) => <Net minor={r.available_delta} /> }] : []),
    { key: 'legs', label: 'Legs', info: 'Every account this transaction touched. The legs always add up to zero.', render: (r) => <Legs legs={r.legs} focusUser={userId} /> },
    { key: 'key', label: 'Key', info: 'Idempotency key. The same key can never be booked twice.', render: (r) => <span className="font-mono text-[12px] text-text-2" title={r.idempotency_key}>{short(r.idempotency_key, 14, 6)}</span> },
  ];
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return <RowsSkeleton rows={5} />;
  return (
    <>
      <DataTable caption="Ledger transactions" cols={cols} rows={data.rows} rowKey={(r) => r.id} empty={kind ? 'No transactions of this type.' : 'No money has moved yet.'} />
      <Pager page={page} limit={data.limit} total={data.total} loading={loading} onPage={setPage} />
    </>
  );
}

/* ---------- deposits ---------- */

interface DepositRow {
  signature: string;
  user_id: string;
  display_name: string;
  wallet_address: string;
  amount_minor: number;
  slot: number | null;
  status: string;
  created_at: string;
}

export function DepositsList({ userId, q, limit = 15 }: { userId?: string; q?: string; limit?: number }) {
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useAdmin<Paged<DepositRow>>(`/api/admin/money/deposits${qs({ userId, q, page, limit })}`);
  const cols: Col<DepositRow>[] = [
    { key: 'at', label: 'When', render: (r) => fmtDate(r.created_at) },
    ...(userId ? [] : [{ key: 'who', label: 'Player', render: (r: DepositRow) => <Link href={`/admin/accounts/${r.user_id}`} className="hover:text-primary hover:underline">{r.display_name}</Link> }]),
    { key: 'amt', label: 'Amount', align: 'right', render: (r) => <Credits minor={r.amount_minor} /> },
    { key: 'status', label: 'Status', render: (r) => (r.status === 'credited' ? <Pill tone="good">Credited</Pill> : <Pill tone="bad">Rejected</Pill>) },
    { key: 'sig', label: 'Transaction', render: (r) => <Addr value={r.signature} kind="tx" chars={6} /> },
    { key: 'slot', label: 'Slot', align: 'right', render: (r) => r.slot ?? '' },
  ];
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return <RowsSkeleton rows={4} />;
  return (
    <>
      <DataTable caption="Deposits" cols={cols} rows={data.rows} rowKey={(r) => r.signature} empty={q ? 'No deposits match.' : 'No deposits yet.'} />
      <Pager page={page} limit={data.limit} total={data.total} loading={loading} onPage={setPage} />
    </>
  );
}

/* ---------- withdrawals ---------- */

interface WithdrawalRow {
  id: string;
  user_id: string;
  display_name: string;
  wallet_address: string;
  amount_minor: number;
  nonce: string;
  expiry: string;
  status: string;
  tx_signature: string | null;
  created_at: string;
  updated_at: string;
}

export function WithdrawalsList({ userId, status, q, limit = 15, onChange }: { userId?: string; status?: string; q?: string; limit?: number; onChange?: () => void }) {
  const { toast } = useSession();
  const [page, setPage] = useState(1);
  const [confirm, setConfirm] = useState<WithdrawalRow | null>(null);
  const [busy, setBusy] = useState(false);
  const { data, error, loading, reload } = useAdmin<Paged<WithdrawalRow> & { counts: { status: string; n: number; amount: number }[] }>(`/api/admin/money/withdrawals${qs({ userId, status, q, page, limit })}`);
  const cols: Col<WithdrawalRow>[] = [
    { key: 'at', label: 'Requested', render: (r) => fmtDate(r.created_at) },
    ...(userId ? [] : [{ key: 'who', label: 'Player', render: (r: WithdrawalRow) => <Link href={`/admin/accounts/${r.user_id}`} className="hover:text-primary hover:underline">{r.display_name}</Link> }]),
    { key: 'amt', label: 'Amount', align: 'right', render: (r) => <Credits minor={r.amount_minor} /> },
    { key: 'status', label: 'Status', render: (r) => <Pill tone={r.status === 'review' ? 'warn' : r.status === 'confirmed' ? 'good' : r.status === 'expired' || r.status === 'rejected' ? 'neutral' : 'accent'}>{WD_STATUS[r.status] ?? r.status}</Pill> },
    { key: 'to', label: 'To wallet', render: (r) => <Addr value={r.wallet_address} /> },
    { key: 'tx', label: 'Transaction', render: (r) => (r.tx_signature ? <Addr value={r.tx_signature} kind="tx" chars={6} /> : <span className="text-text-2">Not sent</span>) },
    { key: 'upd', label: 'Updated', render: (r) => fmtAgo(r.updated_at) },
    {
      key: 'act',
      label: 'Action',
      render: (r) =>
        r.status === 'review' ? (
          <Button size="sm" onClick={() => setConfirm(r)}>
            Review
          </Button>
        ) : (
          <span className="text-text-2">None needed</span>
        ),
    },
  ];
  const approve = async () => {
    if (!confirm) return;
    setBusy(true);
    try {
      await api(`/api/admin/withdrawals/${confirm.id}/approve`, {});
      toast('Approved. The player can now finish the cash out from their wallet page.');
      setConfirm(null);
      reload();
      onChange?.();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return <RowsSkeleton rows={4} />;
  return (
    <>
      <DataTable caption="Cash outs" cols={cols} rows={data.rows} rowKey={(r) => r.id} empty={status === 'review' ? 'Nothing waiting for review.' : 'No cash outs yet.'} />
      <Pager page={page} limit={data.limit} total={data.total} loading={loading} onPage={setPage} />
      <Sheet open={!!confirm} onClose={() => setConfirm(null)} title="Approve this cash out?">
        {confirm ? (
          <div className="space-y-4">
            <div className="rounded-chip bg-well p-4 text-[15px]">
              <div className="flex justify-between py-1">
                <span className="text-text-2">Player</span>
                <span className="font-semibold">{confirm.display_name}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-text-2">Amount</span>
                <Credits minor={confirm.amount_minor} />
              </div>
              <div className="flex justify-between py-1">
                <span className="text-text-2">Goes to</span>
                <Addr value={confirm.wallet_address} />
              </div>
              <div className="flex justify-between py-1">
                <span className="text-text-2">Requested</span>
                <span>{fmtDate(confirm.created_at)}</span>
              </div>
            </div>
            <p className="text-sm text-text-2">
              Approving issues a ticket that is valid for 10 minutes. The player then finishes the cash out from their wallet page. The credits are already locked, so nothing else moves until they do. If they do not finish in time, the lock is released back to their balance.
            </p>
            <div className="flex gap-2">
              <Button variant="secondary" full onClick={() => setConfirm(null)}>
                Not now
              </Button>
              <Button full loading={busy} onClick={approve}>
                Approve cash out
              </Button>
            </div>
            <Link href={`/admin/accounts/${confirm.user_id}`} className="block text-center text-sm font-semibold text-primary hover:underline">
              Check this player first
            </Link>
          </div>
        ) : null}
      </Sheet>
    </>
  );
}
