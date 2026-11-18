'use client';
import { useCallback } from 'react';
import { Card } from '@/components/ui';
import { Credits } from '@/components/admin/parts';
import { Addr, DataTable, ErrorBox, Field, Net, Pager, Pill, RowsSkeleton, SaferPlay, SearchInput, Select, WALLET_KIND, type AccountRow, type Col } from '@/components/admin/parts';
import { fmtAgo, fmtDate, fmtInt, qs, useAdmin, useUrlState, type Paged } from '@/components/admin/data';

const DEFAULTS = { q: '', role: '', status: '', sort: 'created', page: '1' };

export default function AccountsPage() {
  const [f, setF, ready] = useUrlState(DEFAULTS);
  const page = Math.max(1, Number(f.page) || 1);
  const { data, error, loading, reload } = useAdmin<Paged<AccountRow>>(ready ? `/api/admin/accounts${qs({ q: f.q, role: f.role, status: f.status, sort: f.sort, page, limit: 25 })}` : null);
  const onSearch = useCallback((q: string) => setF({ q, page: '1' }), [setF]);

  const cols: Col<AccountRow>[] = [
    {
      key: 'name',
      label: 'Player',
      render: (r) => (
        <span className="inline-flex items-center gap-2">
          {r.display_name}
          {r.role !== 'user' ? <Pill tone="accent">{r.role === 'admin' ? 'Admin' : 'House'}</Pill> : null}
        </span>
      ),
    },
    { key: 'wallet', label: 'Wallet', render: (r) => <Addr value={r.wallet_address} /> },
    { key: 'kind', label: 'Sign in', render: (r) => <span className="text-text-2">{WALLET_KIND[r.wallet_kind] ?? r.wallet_kind}</span> },
    { key: 'created', label: 'Joined', render: (r) => <span title={fmtDate(r.created_at)}>{fmtAgo(r.created_at)}</span> },
    { key: 'active', label: 'Last active', info: 'Latest of: sat at a table, any money movement, signed in.', render: (r) => <span title={fmtDate(r.last_active)}>{fmtAgo(r.last_active)}</span> },
    { key: 'onb', label: 'Set up', info: 'Confirmed 18 or older and accepted the current terms version.', render: (r) => (r.onboarded ? <Pill tone="good">Done</Pill> : <Pill tone="warn">Not yet</Pill>) },
    { key: 'avail', label: 'Available', align: 'right', render: (r) => <Credits minor={r.available} coin={false} /> },
    { key: 'locked', label: 'Locked', align: 'right', info: 'Held for a cash out in progress.', render: (r) => <Credits minor={r.locked} coin={false} /> },
    { key: 'games', label: 'Games', align: 'right', render: (r) => fmtInt(r.games) },
    { key: 'dep', label: 'Deposits', align: 'right', render: (r) => <Credits minor={r.deposits} coin={false} /> },
    { key: 'wd', label: 'Cash outs', align: 'right', render: (r) => <Credits minor={r.withdrawals} coin={false} /> },
    { key: 'net', label: 'Game result', align: 'right', info: 'Credits won minus credits lost in finished games, after fees.', render: (r) => <Net minor={r.net} /> },
    { key: 'rg', label: 'Safer play', render: (r) => <SaferPlay r={r} /> },
  ];

  return (
    <div className="space-y-4">
      <Card className="grid grid-cols-2 gap-3 p-4 lg:grid-cols-[minmax(220px,2fr)_1fr_1fr_1fr]">
        <Field label="Search" className="col-span-2 lg:col-span-1">
          <SearchInput label="Search accounts" value={f.q} onChange={onSearch} placeholder="Name, wallet or account id" />
        </Field>
        <Field label="Role">
          <Select label="Role" value={f.role} onChange={(role) => setF({ role, page: '1' })} options={[['', 'Everyone'], ['user', 'Players'], ['admin', 'Admins'], ['house', 'House']]} />
        </Field>
        <Field label="Status">
          <Select
            label="Status"
            value={f.status}
            onChange={(status) => setF({ status, page: '1' })}
            options={[['', 'Any'], ['review', 'Cash out to review'], ['cooloff', 'In cool off'], ['excluded', 'Self excluded'], ['limits', 'Has limits'], ['not_onboarded', 'Not set up']]}
          />
        </Field>
        <Field label="Sort by" className="col-span-2 sm:col-span-1">
          <Select
            label="Sort by"
            value={f.sort}
            onChange={(sort) => setF({ sort, page: '1' })}
            options={[['created', 'Newest'], ['active', 'Last active'], ['balance', 'Balance'], ['games', 'Games played'], ['deposits', 'Deposits'], ['net', 'Game result']]}
          />
        </Field>
      </Card>

      {error ? <ErrorBox message={error} onRetry={reload} /> : null}
      <Card className="p-4 sm:p-5">
        {!data ? (
          error ? null : <RowsSkeleton rows={8} />
        ) : (
          <>
            <DataTable caption="Accounts" cols={cols} rows={data.rows} rowKey={(r) => r.id} href={(r) => `/admin/accounts/${r.id}`} empty={f.q || f.role || f.status ? 'No accounts match these filters.' : 'No accounts yet.'} />
            <Pager page={page} limit={data.limit} total={data.total} loading={loading} onPage={(p) => setF({ page: String(p) })} />
          </>
        )}
      </Card>
    </div>
  );
}
