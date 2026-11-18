'use client';
import { useCallback } from 'react';
import { parseCredits } from '@evens/shared';
import { Button, Card } from '@/components/ui';
import { DataTable, ErrorBox, Field, Pager, RowsSkeleton, SearchInput, Select, TextInput } from '@/components/admin/parts';
import { gameCols, type GameRow } from '@/components/admin/lists';
import { GAME_IDS, GAME_NAME, qs, useAdmin, useUrlState, type Paged } from '@/components/admin/data';

const DEFAULTS = { game: '', mode: '', status: '', min: '', max: '', from: '', to: '', player: '', page: '1' };

export default function GamesPage() {
  const [f, setF, ready] = useUrlState(DEFAULTS);
  const page = Math.max(1, Number(f.page) || 1);
  // Stake filters are typed in credits and sent in minor units. Invalid input is ignored and flagged.
  const min = f.min ? parseCredits(f.min) : null;
  const max = f.max ? parseCredits(f.max) : null;
  const badMin = !!f.min && min === null;
  const badMax = !!f.max && max === null;
  const path = ready
    ? `/api/admin/games${qs({ game: f.game, mode: f.mode, status: f.status, stakeMin: min ?? undefined, stakeMax: max ?? undefined, from: f.from, to: f.to, player: f.player, page, limit: 25 })}`
    : null;
  const { data, error, loading, reload } = useAdmin<Paged<GameRow>>(path);
  const onPlayer = useCallback((player: string) => setF({ player, page: '1' }), [setF]);
  const filtered = Object.entries(f).some(([k, v]) => k !== 'page' && v);

  return (
    <div className="space-y-4">
      <Card className="grid grid-cols-2 gap-3 p-4 md:grid-cols-4 xl:grid-cols-[minmax(200px,2fr)_repeat(5,minmax(120px,1fr))]">
        <Field label="Player" className="col-span-2 xl:col-span-1">
          <SearchInput label="Search by player" value={f.player} onChange={onPlayer} placeholder="Name or wallet" />
        </Field>
        <Field label="Game">
          <Select label="Game" value={f.game} onChange={(game) => setF({ game, page: '1' })} options={[['', 'All games'], ...GAME_IDS.map((g) => [g, GAME_NAME[g]] as [string, string])]} />
        </Field>
        <Field label="Mode">
          <Select label="Mode" value={f.mode} onChange={(mode) => setF({ mode, page: '1' })} options={[['', 'All modes'], ['practice', 'Practice'], ['bot', 'Vs bot'], ['pvp', 'Vs people']]} />
        </Field>
        <Field label="Status">
          <Select label="Status" value={f.status} onChange={(status) => setF({ status, page: '1' })} options={[['', 'Any'], ['settled', 'Finished'], ['playing', 'Playing'], ['waiting', 'Waiting'], ['cancelled', 'Cancelled']]} />
        </Field>
        <Field label={badMin ? 'Stake from (check this)' : 'Stake from'}>
          <TextInput inputMode="decimal" aria-invalid={badMin} placeholder="Credits" value={f.min} onChange={(e) => setF({ min: e.target.value, page: '1' })} />
        </Field>
        <Field label={badMax ? 'Stake to (check this)' : 'Stake to'}>
          <TextInput inputMode="decimal" aria-invalid={badMax} placeholder="Credits" value={f.max} onChange={(e) => setF({ max: e.target.value, page: '1' })} />
        </Field>
        <div className="col-span-2 grid grid-cols-2 gap-3 md:col-span-4 xl:col-span-6 xl:grid-cols-[1fr_1fr_auto]">
          <Field label="Created from (UTC)">
            <TextInput type="date" value={f.from} onChange={(e) => setF({ from: e.target.value, page: '1' })} />
          </Field>
          <Field label="Created to (UTC)">
            <TextInput type="date" value={f.to} onChange={(e) => setF({ to: e.target.value, page: '1' })} />
          </Field>
          <div className="col-span-2 flex items-end xl:col-span-1">
            <Button variant="secondary" disabled={!filtered} onClick={() => setF({ ...DEFAULTS })} full>
              Clear filters
            </Button>
          </div>
        </div>
      </Card>

      {error ? <ErrorBox message={error} onRetry={reload} /> : null}
      <Card className="p-4 sm:p-5">
        {!data ? (
          error ? null : <RowsSkeleton rows={8} />
        ) : (
          <>
            <DataTable caption="Games" cols={gameCols()} rows={data.rows} rowKey={(r) => r.id} href={(r) => `/admin/games/${r.id}`} empty={filtered ? 'No games match these filters.' : 'No games yet.'} />
            <Pager page={page} limit={data.limit} total={data.total} loading={loading} onPage={(p) => setF({ page: String(p) })} />
          </>
        )}
      </Card>
    </div>
  );
}
