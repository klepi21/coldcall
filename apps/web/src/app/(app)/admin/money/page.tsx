'use client';
import { useCallback, useState } from 'react';
import { formatAmount } from '@coldcall/shared';
import { useSession } from '@/components/app/Providers';
import { Card, Chip } from '@/components/ui';
import { Credits } from '@/components/admin/parts';
import { DataTable, ErrorBox, Field, Kpi, Pager, Pill, RowsSkeleton, SearchInput, Select } from '@/components/admin/parts';
import { DepositsList, TxList, WithdrawalsList } from '@/components/admin/lists';
import { TX_KIND, WD_STATUS, fmtAgo, fmtDate, useAdmin, useAdminConfig, useUrlState, type Paged } from '@/components/admin/data';

const DEFAULTS = { tab: 'withdrawals', status: 'review', kind: '', q: '' };
const TABS = [
  ['withdrawals', 'Cash outs'],
  ['deposits', 'Deposits'],
  ['ledger', 'Ledger'],
  ['reserve', 'Reserve checks'],
] as const;

export default function MoneyPage() {
  const [f, setF, ready] = useUrlState(DEFAULTS);
  const cfg = useAdminConfig();
  const { currency } = useSession();
  const [bump, setBump] = useState(0);
  const counts = useAdmin<{ counts: { status: string; n: number; amount: number }[] }>(`/api/admin/money/withdrawals?limit=1&b=${bump}`);
  const onQ = useCallback((q: string) => setF({ q }), [setF]);
  const c = (s: string) => counts.data?.counts.find((x) => x.status === s);

  return (
    <div className="space-y-4">
      <section aria-label="Cash out totals" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Needs review" value={c('review')?.n ?? 0} sub={<>Total <Credits minor={c('review')?.amount ?? 0} coin={false} /></>} tone={c('review')?.n ? 'warn' : undefined} info={`${currency} cash outs above ${cfg ? formatAmount(cfg.limits[currency].reviewAbove, currency) : 'the threshold'} wait for an admin before a ticket is issued.`} />
        <Kpi label="In progress" value={(c('pending')?.n ?? 0) + (c('submitted')?.n ?? 0)} sub="Ticket issued, player finishing on chain" info="A signed ticket was issued. It is valid for 10 minutes. If it is not used, the locked amount goes back to the player." />
        <Kpi label="Paid out" value={c('confirmed')?.n ?? 0} sub={<>Total <Credits minor={c('confirmed')?.amount ?? 0} coin={false} /></>} info="Cash outs confirmed on chain." />
        <Kpi label="Expired" value={c('expired')?.n ?? 0} sub="Released back to the player" info="Tickets that were not used in time. The lock was released back to the player's balance." />
      </section>

      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 py-1 no-scrollbar" role="tablist" aria-label="Money sections">
        {TABS.map(([k, l]) => (
          <span key={k} className="shrink-0" role="tab" aria-selected={f.tab === k}>
            <Chip active={f.tab === k} onClick={() => setF({ tab: k, q: '' })}>
              {l}
            </Chip>
          </span>
        ))}
      </div>

      {ready ? (
        <Card className="p-4 sm:p-5">
          {f.tab === 'withdrawals' ? (
            <>
              <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_2fr]">
                <Field label="Status">
                  <Select
                    label="Cash out status"
                    value={f.status}
                    onChange={(status) => setF({ status })}
                    options={[['review', 'Needs review'], ['open', 'All open'], ['all', 'All'], ...Object.entries(WD_STATUS).filter(([k]) => k !== 'review') as [string, string][]]}
                  />
                </Field>
                <Field label="Search">
                  <SearchInput label="Search cash outs" value={f.q} onChange={onQ} placeholder="Player, wallet or transaction" />
                </Field>
              </div>
              <WithdrawalsList key={`${f.status}|${f.q}`} status={f.status && f.status !== 'all' ? f.status : undefined} q={f.q || undefined} limit={25} onChange={() => setBump((b) => b + 1)} />
            </>
          ) : null}
          {f.tab === 'deposits' ? (
            <>
              <div className="mb-4 max-w-md">
                <Field label="Search">
                  <SearchInput label="Search deposits" value={f.q} onChange={onQ} placeholder="Player, wallet or transaction" />
                </Field>
              </div>
              <DepositsList key={f.q} q={f.q || undefined} limit={25} />
            </>
          ) : null}
          {f.tab === 'ledger' ? (
            <>
              <div className="mb-4 max-w-xs">
                <Field label="Type">
                  <Select label="Transaction type" value={f.kind} onChange={(kind) => setF({ kind })} options={[['', 'All types'], ...(Object.entries(TX_KIND) as [string, string][])]} />
                </Field>
              </div>
              <p className="mb-3 text-[13px] text-text-2">Every money movement is a balanced transaction: its legs always add up to zero. Entries can never be edited or deleted.</p>
              <TxList key={f.kind} kind={f.kind || undefined} limit={25} />
            </>
          ) : null}
          {f.tab === 'reserve' ? <Reserve /> : null}
        </Card>
      ) : (
        <RowsSkeleton />
      )}
    </div>
  );
}

function Reserve() {
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useAdmin<Paged<{ id: number; vault_minor: number; liabilities_minor: number; ok: boolean; checked_at: string }> & { summary: { failed: number; total: number; first: string | null } }>(`/api/admin/money/reserve?page=${page}&limit=25`);
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return <RowsSkeleton />;
  return (
    <>
      <p className="mb-3 text-[13px] text-text-2">
        Every 5 minutes the server compares the USDC in the vault with everything the ledger holds. {data.summary.total} checks since {fmtDate(data.summary.first)},{' '}
        {data.summary.failed ? <span className="font-semibold text-loss">{data.summary.failed} failed.</span> : 'none failed.'}
      </p>
      <DataTable
        caption="Reserve checks"
        rowKey={(r) => String(r.id)}
        rows={data.rows}
        empty="No reserve check has run yet."
        cols={[
          { key: 'at', label: 'Checked', render: (r) => <span title={fmtDate(r.checked_at)}>{fmtDate(r.checked_at)} <span className="text-text-2">({fmtAgo(r.checked_at)})</span></span> },
          { key: 'ok', label: 'Result', render: (r) => (r.ok ? <Pill tone="good">✓ Backed</Pill> : <Pill tone="bad">⚠ Short</Pill>) },
          { key: 'vault', label: 'Vault', align: 'right', render: (r) => <Credits minor={r.vault_minor} coin={false} /> },
          { key: 'held', label: 'Ledger holds', align: 'right', render: (r) => <Credits minor={r.liabilities_minor} coin={false} /> },
          {
            key: 'diff',
            label: 'Surplus',
            align: 'right',
            render: (r) => {
              const d = r.vault_minor - r.liabilities_minor;
              return <Credits minor={d} sign coin={false} className={d < 0 ? 'text-loss' : ''} />;
            },
          },
        ]}
      />
      <Pager page={page} limit={data.limit} total={data.total} loading={loading} onPage={setPage} />
    </>
  );
}
