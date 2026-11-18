'use client';
import Link from 'next/link';
import { formatCredits } from '@coldcall/shared';
import { Button, Card, Credits, Skeleton } from '@/components/ui';
import { TimeChart, Meter } from '@/components/admin/Charts';
import { DataTable, ErrorBox, Kpi, Panel, Pill, Net, type Col } from '@/components/admin/parts';
import { GAME_IDS, GAME_NAME, GAME_VAR, MODE_NAME, fmtAgo, fmtDuration, fmtInt, fmtPct, useAdmin, type GameId } from '@/components/admin/data';

const credits = (n: number) => `${formatCredits(n)} cr`;
const count = (n: number) => fmtInt(n);

export default function AdminOverview() {
  const dash = useAdmin<any>('/api/admin/dashboard');
  const series = useAdmin<any>('/api/admin/series');
  const breakdown = useAdmin<any[]>('/api/admin/breakdown');
  const reload = () => {
    dash.reload();
    series.reload();
    breakdown.reload();
  };
  const d = dash.data;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-text-2">Live numbers from the ledger and the database. Days are UTC days. Counts leave out house and admin accounts.</p>
        <Button variant="secondary" size="sm" onClick={reload} loading={dash.loading && !!d}>
          Refresh
        </Button>
      </div>

      {dash.error ? <ErrorBox message={dash.error} onRetry={dash.reload} /> : null}
      {!d ? (
        dash.error ? null : (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 12 }, (_, i) => (
              <Skeleton key={i} className="h-[118px]" />
            ))}
          </div>
        )
      ) : (
        <>
          <Attention d={d} />
          <section aria-label="Key numbers" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi
              label="Players"
              value={fmtInt(d.users.total)}
              sub={`${d.users.today} today, ${d.users.d7} in 7 days, ${d.users.d30} in 30 days`}
              info="Accounts with the player role. New today means created since midnight UTC. 7 and 30 days are rolling windows."
              href="/admin/accounts"
            />
            <Kpi
              label="Active today"
              value={fmtInt(d.active.today)}
              sub={`${d.active.d7} in 7 days, ${d.active.d30} in 30 days`}
              info="Players who did something since midnight UTC: sat at a table, had any money movement, or signed in."
            />
            <Kpi
              label="Games today"
              value={fmtInt(d.games.today)}
              sub={`${d.games.d7} in 7 days, ${d.games.d7_credits} of them for credits`}
              info="Games that finished with a result since midnight UTC, all modes. Cancelled tables are not counted."
              href="/admin/games"
            />
            <Kpi
              label="Playing now"
              value={fmtInt(d.games.playing)}
              sub={`${d.games.waiting} ${d.games.waiting === 1 ? 'table is' : 'tables are'} waiting for players`}
              info="Tables in play right now, and tables people created that are still waiting for an opponent."
            />
            <Kpi
              label="Staked, 30 days"
              value={<Credits minor={d.staked.d30} />}
              sub={<>All time <Credits minor={d.staked.all_time} coin={false} /></>}
              info="Total stakes players put in finished credit games (vs bot and vs people), per player seat. Fees and the house matching stake are not included."
            />
            <Kpi
              label="Fee revenue, 30 days"
              value={<Credits minor={d.fees.d30} />}
              sub={<>All time <Credits minor={d.fees.all_time} coin={false} /></>}
              info="Fees taken from games between people (5% of the stake, minimum 0.05), read from the fee account in the ledger. Bot games have no fee."
            />
            <Kpi
              label="House result vs bot"
              value={<Net minor={d.bot.house} />}
              sub={<>Expected about <Credits minor={d.bot.expectedHouse} coin={false} /> at the disclosed 5% edge, {d.bot.games} games</>}
              tone={d.bot.house < 0 ? 'warn' : undefined}
              info="What the house won (plus) or lost (minus) in finished bot games with credits. The disclosed expectation is 5% of the stakes. Over a few games luck dominates."
            />
            <Kpi
              label="Player return vs bot"
              value={fmtPct(d.bot.playerReturn)}
              sub={
                d.bot.withinRange === null
                  ? `Disclosed minus 5%. Needs ${d.bot.minGames} games to judge, has ${d.bot.games}.`
                  : d.bot.withinRange
                    ? `Disclosed minus 5%. Within the normal range (plus or minus ${fmtPct(d.bot.band)}).`
                    : `Disclosed minus 5%. Outside the normal range of plus or minus ${fmtPct(d.bot.band)}. Check calibration.`
              }
              tone={d.bot.withinRange === false ? 'bad' : d.bot.withinRange ? 'good' : undefined}
              info="Average result per credit staked against the bot, from the player's side. Disclosed target is minus 5%. The normal range is a 95% band for the number of games played."
            />
            <Kpi
              label="Player deposits"
              value={<Credits minor={d.money.deposits} />}
              sub={<>{d.money.deposit_count} deposits, <Credits minor={d.money.deposits_30} coin={false} /> in 30 days</>}
              info="Deposits verified on chain and credited, from player accounts. House bankroll funding is left out and shown on the Money tab."
              href="/admin/money?tab=deposits"
            />
            <Kpi
              label="Cash outs paid"
              value={<Credits minor={d.money.withdrawals} />}
              sub={<>{d.money.withdrawal_count} paid, <Credits minor={d.money.withdrawals_30} coin={false} /> in 30 days</>}
              info="Cash outs confirmed on chain. Requests still in progress or expired are not counted."
              href="/admin/money?tab=withdrawals"
            />
            <Kpi
              label="Vault backing"
              value={d.vault.backed === null ? 'Unknown' : d.vault.backed ? 'Backed' : 'Short'}
              sub={d.vault.live === null ? 'Could not read the vault just now, showing the last check' : <>Vault <Credits minor={d.vault.live} coin={false} />, ledger holds <Credits minor={d.vault.held} coin={false} /></>}
              tone={d.vault.backed === false ? 'bad' : d.vault.backed ? 'good' : 'warn'}
              info="Backed means the USDC in the on chain vault (times 100) covers everything the ledger holds: player balances, money in games, the house bankroll and fee revenue."
            />
            <Kpi
              label="Waiting for review"
              value={fmtInt(d.money.review)}
              sub={d.money.review ? <><Credits minor={d.money.review_sum} coin={false} /> in total. {d.money.in_flight} more in progress.</> : `${d.money.in_flight} cash outs in progress`}
              tone={d.money.review ? 'warn' : undefined}
              info="Cash outs above the review threshold wait for an admin to approve them. In progress means a ticket was issued and the player is completing it on chain."
              href="/admin/money?tab=withdrawals"
            />
          </section>
          <VaultPanel v={d.vault} houseFunding={d.money.house_funding} />
        </>
      )}

      {series.error ? <ErrorBox message={series.error} onRetry={series.reload} /> : null}
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartPanel title="New players per day" info="Accounts created per UTC day, last 30 days. Player role only." loading={!series.data}>
          {series.data ? <TimeChart title="New players per day" data={series.data.signups} series={[{ key: 'n', label: 'New players', color: 'var(--s-accent)' }]} format={count} /> : null}
        </ChartPanel>
        <ChartPanel title="Active players per day" info="Distinct players per UTC day who sat at a table, had a money movement, or signed in." loading={!series.data}>
          {series.data ? <TimeChart title="Active players per day" kind="line" data={series.data.active} series={[{ key: 'n', label: 'Active players', color: 'var(--s-lime)' }]} format={count} /> : null}
        </ChartPanel>
        <ChartPanel className="lg:col-span-2" title="Games finished per day" info="Games that ended with a result per UTC day, all modes, split by game." loading={!series.data}>
          {series.data ? (
            <TimeChart title="Games finished per day by game" data={series.data.games} series={GAME_IDS.map((g) => ({ key: g, label: GAME_NAME[g], color: GAME_VAR[g] }))} format={count} height={220} />
          ) : null}
        </ChartPanel>
        <ChartPanel title="Staked per day" info="Stakes players put into finished credit games per UTC day, in credits. Same definition as the Staked tile." loading={!series.data}>
          {series.data ? <TimeChart title="Staked per day" data={series.data.money} series={[{ key: 'staked', label: 'Staked', color: 'var(--s-gold)' }]} format={credits} integer={false} scale={100} /> : null}
        </ChartPanel>
        <ChartPanel title="Fees per day" info="Fees booked to the fee account per UTC day, in credits. Its own chart because fees are far smaller than stakes." loading={!series.data}>
          {series.data ? <TimeChart title="Fees per day" data={series.data.money} series={[{ key: 'fees', label: 'Fees', color: 'var(--s-lime)' }]} format={credits} integer={false} scale={100} /> : null}
        </ChartPanel>
        <ChartPanel className="lg:col-span-2" title="Deposits and cash outs per day" info="Player deposits credited and cash outs paid per UTC day, in credits. House funding is left out." loading={!series.data}>
          {series.data ? (
            <TimeChart
              title="Deposits and cash outs per day"
              kind="group"
              data={series.data.deposits}
              series={[
                { key: 'deposits', label: 'Deposits', color: 'var(--s-lime)' },
                { key: 'withdrawals', label: 'Cash outs', color: 'var(--s-accent)' },
              ]}
              format={credits}
              integer={false}
              scale={100}
              height={220}
            />
          ) : null}
        </ChartPanel>
      </div>

      <Breakdown state={breakdown} />
    </div>
  );
}

function Attention({ d }: { d: any }) {
  const items: { text: string; href: string; tone: 'bad' | 'warn' }[] = [];
  if (d.money.review) items.push({ text: `${d.money.review} ${d.money.review === 1 ? 'cash out needs' : 'cash outs need'} your review`, href: '/admin/money?tab=withdrawals', tone: 'warn' });
  if (d.vault.backed === false) items.push({ text: 'The vault does not cover what the ledger holds. Check the reserve history now.', href: '/admin/money?tab=reserve', tone: 'bad' });
  if (d.bot.withinRange === false) items.push({ text: 'Player return against the bot is outside the normal range of the disclosed 5% edge.', href: '/admin/games?mode=bot', tone: 'bad' });
  if (!items.length)
    return (
      <Card className="flex items-center gap-3 px-4 py-3 text-sm">
        <span className="grid size-7 place-items-center rounded-full bg-[color-mix(in_srgb,var(--win)_18%,transparent)] text-win" aria-hidden>
          ✓
        </span>
        <span>Nothing needs your attention. The vault is backed and no cash outs are waiting.</span>
      </Card>
    );
  return (
    <div className="space-y-2" role="status">
      {items.map((i) => (
        <Card key={i.text} tint={i.tone === 'bad' ? 'var(--loss)' : 'var(--warn)'} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <span className="inline-flex items-center gap-2 font-semibold">
            <span className={i.tone === 'bad' ? 'text-loss' : 'text-warn'} aria-hidden>
              ⚠
            </span>
            {i.text}
          </span>
          <Link href={i.href} className="text-sm font-semibold text-primary hover:underline">
            Review
          </Link>
        </Card>
      ))}
    </div>
  );
}

function VaultPanel({ v, houseFunding }: { v: any; houseFunding: number }) {
  const parts = [
    { label: 'Player balances', minor: v.available, color: 'var(--s-lime)' },
    { label: 'Locked for cash outs', minor: v.locked, color: 'var(--s-seabattle)' },
    { label: 'In live games', minor: v.escrow, color: 'var(--s-backgammon)' },
    { label: 'House bankroll', minor: v.houseBankroll, color: 'var(--s-accent)' },
    { label: 'Fee revenue', minor: v.feeRevenue, color: 'var(--s-gold)' },
  ];
  const vault = v.live ?? v.lastCheck?.vault_minor ?? null;
  const scale = Math.max(vault ?? 0, v.held, 1);
  const surplus = vault === null ? null : vault - v.held;
  return (
    <Panel
      title="Vault and what the ledger holds"
      info="The top bar is the USDC in the on chain vault. The bottom bar is everything the ledger says is held, split by account. Backed when the top bar is at least as long as the bottom one."
      action={v.lastCheck ? <span className="text-[13px] text-text-2">Last reserve check {fmtAgo(v.lastCheck.checked_at)}</span> : null}
    >
      <div className="space-y-3">
        <div>
          <div className="mb-1 flex justify-between text-[13px]">
            <span className="text-text-2">Vault on chain{v.live === null ? ' (last check)' : ''}</span>
            {vault === null ? <span>Unknown</span> : <Credits minor={vault} />}
          </div>
          <div className="h-3 rounded-full bg-well">
            <div className="h-3 rounded-full bg-[var(--s-gold)]" style={{ width: `${((vault ?? 0) / scale) * 100}%` }} />
          </div>
        </div>
        <div>
          <div className="mb-1 flex justify-between text-[13px]">
            <span className="text-text-2">Ledger holds</span>
            <Credits minor={v.held} />
          </div>
          <div className="flex h-3 gap-[2px] overflow-hidden rounded-full bg-well" role="img" aria-label={parts.map((p) => `${p.label} ${formatCredits(p.minor)} credits`).join(', ')}>
            {parts.map((p) => (p.minor > 0 ? <div key={p.label} style={{ width: `${(p.minor / scale) * 100}%`, background: p.color }} /> : null))}
          </div>
          <ul className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-[13px] sm:grid-cols-2 lg:grid-cols-3">
            {parts.map((p) => (
              <li key={p.label} className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-1.5 text-text-2">
                  <span className="inline-block size-2.5 rounded-[3px]" style={{ background: p.color }} aria-hidden />
                  {p.label}
                </span>
                <Credits minor={p.minor} coin={false} />
              </li>
            ))}
            <li className="flex items-center justify-between gap-3 font-semibold">
              <span>Owed to players</span>
              <Credits minor={v.owedToPlayers} coin={false} />
            </li>
          </ul>
        </div>
        <p className="text-[13px] text-text-2">
          {surplus === null ? 'The vault could not be read.' : surplus >= 0 ? <>Surplus of <Credits minor={surplus} coin={false} /> above what the ledger holds.</> : <span className="font-semibold text-loss">Short by <Credits minor={-surplus} coin={false} />.</span>}{' '}
          House funding deposited so far: <Credits minor={houseFunding} coin={false} />.
        </p>
      </div>
    </Panel>
  );
}

function ChartPanel({ title, info, loading, children, className = '' }: { title: string; info: string; loading: boolean; children: React.ReactNode; className?: string }) {
  return (
    <Panel title={title} info={info} className={className}>
      {loading ? <Skeleton className="h-[200px]" /> : children}
    </Panel>
  );
}

function Breakdown({ state }: { state: { data: any[] | null; error: string | null; reload: () => void } }) {
  if (state.error) return <ErrorBox message={state.error} onRetry={state.reload} />;
  const cols: Col<any>[] = [
    {
      key: 'game',
      label: 'Game',
      render: (r) => (
        <span className="inline-flex items-center gap-2 font-semibold">
          <span className="inline-block size-2.5 rounded-full" style={{ background: GAME_VAR[r.game as GameId] }} aria-hidden />
          {GAME_NAME[r.game as GameId]}
        </span>
      ),
    },
    { key: 'mode', label: 'Mode', render: (r) => <Pill tone={r.mode === 'practice' ? 'neutral' : 'accent'}>{MODE_NAME[r.mode]}</Pill> },
    { key: 'games', label: 'Games', align: 'right', render: (r) => fmtInt(r.games) },
    { key: 'dur', label: 'Avg length', align: 'right', info: 'From the first move to the result. Resigned games pull this down.', render: (r) => fmtDuration(r.avg_secs) },
    { key: 'staked', label: 'Staked', align: 'right', render: (r) => (r.mode === 'practice' ? <span className="text-text-2">Free</span> : <Credits minor={r.staked} coin={false} />) },
    {
      key: 'win',
      label: 'Player wins',
      info: 'Share of games the player (or the player team in Tichu) won against the bot. The marker is the disclosed target, averaged over the targets shown before each game. Against people this does not apply.',
      render: (r) =>
        r.player_win_rate === null ? (
          <span className="text-text-2">Not a bot game</span>
        ) : (
          <span className="flex items-center gap-3">
            <span className="tabular w-[52px] text-right">{fmtPct(r.player_win_rate, 0)}</span>
            <span className="w-[90px]">
              <Meter value={r.player_win_rate} target={r.target_win} label={`Player wins ${fmtPct(r.player_win_rate, 0)}, target ${fmtPct(r.target_win, 0)}`} />
            </span>
            <span className="text-[12px] text-text-2">target {fmtPct(r.target_win, 0)}</span>
          </span>
        ),
    },
    { key: 'draws', label: 'Draws', align: 'right', render: (r) => fmtInt(r.draws) },
    { key: 'net', label: 'Players net', align: 'right', info: 'What players won or lost in total in these games, after fees.', render: (r) => (r.mode === 'practice' ? <span className="text-text-2">None</span> : <Net minor={r.player_net} />) },
    { key: 'fees', label: 'Fees', align: 'right', render: (r) => <Credits minor={r.fees} coin={false} /> },
  ];
  return (
    <Panel title="Games by game and mode" info="All finished games since launch, grouped by game and mode. Practice games are free and never move money.">
      {!state.data ? <Skeleton className="h-60" /> : <DataTable caption="Finished games by game and mode" cols={cols} rows={state.data} rowKey={(r) => r.game + r.mode} empty="No finished games yet." />}
    </Panel>
  );
}
