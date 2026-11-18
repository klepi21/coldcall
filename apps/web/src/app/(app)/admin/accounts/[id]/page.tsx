'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { Card, Chip, Skeleton } from '@/components/ui';
import { Credits } from '@/components/admin/parts';
import { Addr, DataTable, ErrorBox, Net, Panel, Pill, WALLET_KIND } from '@/components/admin/parts';
import { DepositsList, PlayerGames, TxList, WithdrawalsList } from '@/components/admin/lists';
import { GAME_IDS, GAME_NAME, GAME_VAR, explorer, fmtAgo, fmtDate, fmtInt, useAdmin, useAdminConfig, type GameId } from '@/components/admin/data';

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-well-line py-2 last:border-0">
      <dt className="shrink-0 text-text-2">{label}</dt>
      <dd className="min-w-0 truncate text-right font-medium">{children}</dd>
    </div>
  );
}

const limit = (n: number | null) => (n === null ? <span className="text-text-2">None</span> : <Credits minor={n} />);

export default function AccountDetail() {
  const { id } = useParams<{ id: string }>();
  const cfg = useAdminConfig();
  const { data, error, reload } = useAdmin<any>(`/api/admin/accounts/${id}`);
  const [tab, setTab] = useState<'ledger' | 'games' | 'deposits' | 'withdrawals'>('ledger');
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return <Skeleton className="h-[620px]" />;
  const u = data.user;
  const s = data.summary;
  const now = Date.now();
  const cooling = u.cooloff_until && new Date(u.cooloff_until).getTime() > now;
  const excluded = u.excluded_until && new Date(u.excluded_until).getTime() > now;

  return (
    <div className="space-y-4">
      <Link href="/admin/accounts" className="inline-flex text-sm font-semibold text-text-2 hover:text-text">
        ← All accounts
      </Link>

      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate font-display text-[24px] font-bold uppercase">{u.display_name}</h2>
              {u.role !== 'user' ? <Pill tone="accent">{u.role === 'admin' ? 'Admin' : 'House'}</Pill> : null}
              {u.onboarded ? <Pill tone="good">Set up</Pill> : <Pill tone="warn">Not set up</Pill>}
              {excluded ? <Pill tone="bad">Self excluded</Pill> : null}
              {cooling ? <Pill tone="warn">Cool off</Pill> : null}
            </div>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 text-sm text-text-2">
              <Addr value={u.wallet_address} chars={6} />
              <span>{WALLET_KIND[u.wallet_kind] ?? u.wallet_kind}</span>
              <span>Joined {fmtDate(u.created_at)}</span>
              <span>Last active {fmtAgo(u.last_active)}</span>
            </p>
          </div>
          <a href={explorer(cfg, 'address', u.wallet_address)} target="_blank" rel="noreferrer" className="btn-secondary press inline-flex h-11 items-center rounded-chip px-4 text-[15px] font-semibold">
            Wallet on Suiscan
          </a>
        </div>
        <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {[
            ['Available', <Credits key="a" minor={data.balance.available} />],
            ['Locked for cash out', <Credits key="l" minor={data.balance.locked} />],
            ['In live games', <Credits key="g" minor={data.balance.inGames} />],
            ['Deposits', <span key="d"><Credits minor={s.deposits} /> <span className="text-[13px] font-normal text-text-2">({s.deposit_count})</span></span>],
            ['Cash outs', <span key="w"><Credits minor={s.withdrawals} /> <span className="text-[13px] font-normal text-text-2">({s.withdrawal_count})</span></span>],
            ['Game result', <Net key="n" minor={s.net} />],
          ].map(([k, v]) => (
            <div key={k as string} className="min-w-0">
              <dt className="text-[13px] text-text-2">{k}</dt>
              <dd className="mt-0.5 font-display text-[18px] font-bold">{v}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Profile" info="Account details. Sign in sessions are counted, their tokens are never shown.">
          <dl className="text-[14px]">
            <Fact label="Account id">
              <span className="font-mono text-[12px]">{u.id}</span>
            </Fact>
            <Fact label="Role">{u.role}</Fact>
            <Fact label="Google linked">{u.google_linked ? 'Yes' : 'No'}</Fact>
            <Fact label="18 or older confirmed">{u.age_confirmed_at ? fmtDate(u.age_confirmed_at) : 'Not yet'}</Fact>
            <Fact label="Terms accepted">
              {u.terms_version ? (
                <>
                  {u.terms_version}
                  {cfg && u.terms_version !== cfg.termsVersion ? <span className="text-warn"> (old)</span> : null}
                </>
              ) : (
                'Not yet'
              )}
            </Fact>
            <Fact label="Signed in sessions">{data.sessions.active}</Fact>
            <Fact label="Last sign in">{fmtAgo(data.sessions.last_sign_in)}</Fact>
            <Fact label="Last test money">{fmtAgo(u.last_faucet_at)}</Fact>
            <Fact label="Games played">
              {fmtInt(s.games)} <span className="text-text-2">({s.credit_games} with a {data.currency} stake)</span>
            </Fact>
            <Fact label="Total staked">
              <Credits minor={s.staked} />
            </Fact>
          </dl>
        </Panel>

        <Panel title="Safer play" info="Limits, cool off and self exclusion the player set. Lowering a limit applies at once, raising one waits 24 hours. Admins cannot change these here.">
          <dl className="text-[14px]">
            <Fact label="Daily deposit limit">{limit(u.limit_deposit_daily)}</Fact>
            <Fact label="Deposited in 24 hours">
              <Credits minor={s.deposits_24h} />
            </Fact>
            <Fact label="Daily loss limit">{limit(u.limit_loss_daily)}</Fact>
            <Fact label="Result in 24 hours">
              <Net minor={s.net_24h} />
            </Fact>
            <Fact label="Weekly loss limit">{limit(u.limit_loss_weekly)}</Fact>
            <Fact label="Result in 7 days">
              <Net minor={s.net_7d} />
            </Fact>
            <Fact label="Limit changes waiting">{u.pending_limits ? `Until ${fmtDate(u.pending_limits_at)}` : 'None'}</Fact>
            <Fact label="Cool off">{cooling ? `Until ${fmtDate(u.cooloff_until)}` : 'Not active'}</Fact>
            <Fact label="Self exclusion">{excluded ? `Until ${fmtDate(u.excluded_until)}` : 'Not active'}</Fact>
            <Fact label="Open cash outs">{s.open_withdrawals}</Fact>
          </dl>
        </Panel>

        <Panel title="Ratings" info="Skill estimates per game, used to pick the bot level. Never based on money. Games counts rated games only.">
          <dl className="text-[14px]">
            {GAME_IDS.map((g) => {
              const r = u.ratings?.[g];
              return (
                <Fact key={g} label={GAME_NAME[g]}>
                  {r ? (
                    <>
                      {Math.round(r.r)} <span className="text-text-2">({r.n} {r.n === 1 ? 'game' : 'games'}{r.peak ? `, peak ${Math.round(r.peak)}` : ''})</span>
                    </>
                  ) : (
                    'Not rated'
                  )}
                </Fact>
              );
            })}
          </dl>
        </Panel>
      </div>

      <Panel
        title="Progress"
        info="Level, XP and achievements. XP is the same for practice and staked games and never depends on stakes."
        action={
          data.progress ? (
            <span className="text-sm text-text-2">
              Level <span className="font-semibold text-text">{data.progress.level}</span>, {fmtInt(data.progress.xp)} XP
            </span>
          ) : null
        }
      >
        <div className="grid gap-5 lg:grid-cols-[3fr_2fr]">
          <DataTable
            caption="Per game stats"
            rowKey={(r: any) => r.game}
            rows={data.stats}
            empty="No finished games yet, so no stats."
            cols={[
              {
                key: 'g',
                label: 'Game',
                render: (r: any) => (
                  <span className="inline-flex items-center gap-2">
                    <span className="inline-block size-2.5 rounded-full" style={{ background: GAME_VAR[r.game as GameId] }} aria-hidden />
                    {GAME_NAME[r.game as GameId]}
                  </span>
                ),
              },
              { key: 'n', label: 'Games', align: 'right', render: (r: any) => r.games },
              { key: 'w', label: 'Wins', align: 'right', render: (r: any) => r.wins },
              { key: 'd', label: 'Draws', align: 'right', render: (r: any) => r.draws },
              { key: 'l', label: 'Losses', align: 'right', render: (r: any) => r.losses },
              { key: 's', label: 'Best streak', align: 'right', render: (r: any) => r.best_streak },
              { key: 'x', label: 'XP', align: 'right', render: (r: any) => fmtInt(r.xp) },
            ]}
          />
          <div>
            <p className="mb-2 text-[13px] text-text-2">
              Achievements: {data.achievements.length} of {data.achievementTotal}
            </p>
            {data.achievements.length ? (
              <ul className="flex flex-wrap gap-1.5">
                {data.achievements.map((a: any) => (
                  <li key={a.code} title={`${a.how ?? ''} Unlocked ${fmtDate(a.unlocked_at)}`}>
                    <Pill tone="accent">{a.name}</Pill>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-chip bg-well px-3 py-4 text-sm text-text-2">None unlocked yet.</p>
            )}
          </div>
        </div>
      </Panel>

      <Card className="p-4 sm:p-5">
        <div className="-mx-1 mb-3 flex gap-2 overflow-x-auto px-1 py-1 no-scrollbar" role="tablist" aria-label="Account history">
          {(
            [
              ['ledger', 'Ledger'],
              ['games', 'Games'],
              ['deposits', 'Deposits'],
              ['withdrawals', 'Cash outs'],
            ] as const
          ).map(([k, l]) => (
            <span key={k} className="shrink-0" role="tab" aria-selected={tab === k}>
              <Chip active={tab === k} onClick={() => setTab(k)}>
                {l}
              </Chip>
            </span>
          ))}
        </div>
        {tab === 'ledger' ? <TxList userId={id} /> : null}
        {tab === 'games' ? <PlayerGames userId={id} /> : null}
        {tab === 'deposits' ? <DepositsList userId={id} /> : null}
        {tab === 'withdrawals' ? <WithdrawalsList userId={id} onChange={reload} /> : null}
      </Card>
    </div>
  );
}
