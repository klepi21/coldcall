'use client';
import { useCallback, useEffect, useState } from 'react';
import { CURRENCY, formatAmount, formatNumber, formatBase, parseAmount, baseToMinor, type Currency } from '@coldcall/shared';
import { useSession } from '@/components/app/Providers';
import { Button, Card, Amount, CoinChip, Sheet, Skeleton, InfoTip, Chip, Empty, Row, Glass, PageHeader } from '@/components/ui';
import { api } from '@/lib/api';
import { signAndSubmit, suiscan, chainConfig, startGoogleLogin, NeedsGoogleAgain } from '@/lib/chain';
import { play } from '@/lib/sound';
import { VaultLinks } from '@/components/app/VaultLinks';
import { ReceiveCoins } from '@/components/app/ReceiveCoins';

type Bal = { available: number; locked: number; inGames: number };
interface Overview {
  currency: Currency;
  available: number;
  locked: number;
  inGames: number;
  balances: Record<Currency, Bal>;
  walletCoins: Record<Currency, string | null>;
  nextSuiDripAt: string | null;
  history: { id: string; kind: string; currency: Currency; memo: string; created_at: string; delta: number; locked_delta: number; table_id: string | null; meta: any }[];
  pendingWithdrawals: { id: string; currency: Currency; amount_minor: number; status: string; created_at: string; expiry: string }[];
}

const KIND_LABEL: Record<string, string> = {
  deposit: 'Added money',
  withdraw_lock: 'Cash out started',
  withdraw_release: 'Cash out not completed, money back',
  withdraw_complete: 'Cashed out',
  game_start: 'Game entry',
  game_settle: 'Game result',
  game_refund: 'Refund',
};

const other = (c: Currency): Currency => (c === 'LOFI' ? 'SUI' : 'LOFI');

function AmountSheet({
  open,
  onClose,
  title,
  currency,
  max,
  min,
  cta,
  help,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  currency: Currency;
  max: number;
  min: number;
  cta: string;
  help: string;
  onSubmit: (minor: number) => Promise<void>;
}) {
  const [raw, setRaw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [needGoogle, setNeedGoogle] = useState(false);
  const minor = parseAmount(raw);
  useEffect(() => {
    if (open) (setRaw(''), setErr(null), setNeedGoogle(false));
  }, [open]);
  const quick = currency === 'SUI' ? [10, 25, 50] : [1_000, 10_000, 50_000];
  const submit = async () => {
    if (minor === null) return setErr(`Enter an amount in ${currency}, like ${currency === 'SUI' ? '0.25' : '50'}.`);
    if (minor < min) return setErr(`Enter at least ${formatAmount(min, currency)}.`);
    if (minor > max) return setErr(`You can use up to ${formatAmount(max, currency)} here.`);
    setBusy(true);
    setErr(null);
    try {
      await onSubmit(minor);
      onClose();
    } catch (e: any) {
      setNeedGoogle(e instanceof NeedsGoogleAgain);
      setErr(e?.message ?? 'That did not work. Nothing moved. Please try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <label htmlFor="amount" className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold">
        Amount in <CoinChip currency={currency} className="size-4" /> {currency}
      </label>
      <input
        id="amount"
        inputMode="decimal"
        value={raw}
        onChange={(e) => (setRaw(e.target.value), setErr(null))}
        placeholder="0.00"
        className="well h-16 w-full rounded-[14px] px-4 font-display text-[28px] font-bold tabular outline-none placeholder:text-text-2/50 focus:shadow-[inset_0_0_0_2px_var(--primary)]"
      />
      <div className="mt-3 flex flex-wrap gap-2">
        {quick.filter((v) => v <= max).map((v) => (
          <Chip key={v} onClick={() => setRaw(formatNumber(v).replace(/,/g, ''))} active={minor === v}>
            {formatNumber(v).replace('.00', '')} {currency}
          </Chip>
        ))}
        {max > 0 ? (
          <Chip onClick={() => setRaw(formatNumber(max).replace(/,/g, ''))} active={minor === max}>
            All
          </Chip>
        ) : null}
      </div>
      <p className="mt-3 text-sm text-text-2">{help}</p>
      {err ? <p className="mt-3 text-sm font-medium text-loss">{err}</p> : null}
      {needGoogle ? (
        <Button variant="secondary" full className="mt-3" onClick={() => startGoogleLogin('/wallet')}>
          Sign in with Google again
        </Button>
      ) : null}
      <Button size="lg" full className="mt-5" loading={busy} onClick={submit}>
        {cta}
      </Button>
    </Sheet>
  );
}

export default function WalletPage() {
  const { me, wallet, toast, openAuth, ready, refresh, currency, setCurrency } = useSession();
  const [o, setO] = useState<Overview | null>(null);
  const [sheet, setSheet] = useState<'add' | 'out' | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [network, setNetwork] = useState('devnet');

  const load = useCallback(() => api<Overview>(`/api/wallet?currency=${currency}`).then(setO).catch(() => {}), [currency]);
  useEffect(() => {
    setO(null);
    if (me) void load();
  }, [me?.id, load]); // eslint-disable-line react-hooks/exhaustive-deps
  // Opening a money sheet re-reads balances, so the limit never comes from a stale number.
  useEffect(() => {
    if (sheet) void load();
  }, [sheet, load]);
  useEffect(() => {
    chainConfig().then((c) => setNetwork(c.network)).catch(() => {});
  }, []);

  if (ready && !me) return <Empty title="Your wallet" text="Sign in to get test coins, add money, see your balance and cash out." action={<Button onClick={() => openAuth()}>Start playing</Button>} />;

  const needWallet = () => {
    if (!wallet) {
      toast(me?.walletKind === 'zklogin' ? 'Sign in with Google again on this device to approve money moves.' : 'This account lives in another browser. Sign out and sign in again on this device.', 'error');
      return false;
    }
    return true;
  };

  const walletBase = (c: Currency) => (o?.walletCoins[c] ? BigInt(o.walletCoins[c]!) : 0n);
  const walletMinor = baseToMinor(walletBase(currency), currency);
  const rules = CURRENCY[currency];

  const run = async (id: string, fn: () => Promise<void>) => {
    setBusy(id);
    try {
      await fn();
    } catch (e: any) {
      if (e instanceof NeedsGoogleAgain) {
        toast(e.message, 'error');
      } else toast(e?.message ?? 'That did not work. Nothing moved. Please try again.', 'error');
    } finally {
      setBusy(null);
    }
  };

  const getLofi = () =>
    run('lofi', async () => {
      if (!needWallet()) return;
      const b = await api<{ bytes: string }>('/api/wallet/faucet/lofi', {});
      await signAndSubmit(wallet!, b.bytes);
      await load();
      toast('1,000 test LOFI are in your wallet. Tap Add LOFI to play with them.', 'win');
      play('coin');
    });
  const getSui = () =>
    run('sui', async () => {
      const r = await api<{ amount: string }>('/api/wallet/faucet/sui', {});
      await load();
      toast(`${r.amount} test SUI are in your wallet. Tap Add SUI to play with them.`, 'win');
      play('coin');
    });

  const dripWait = o?.nextSuiDripAt && new Date(o.nextSuiDripAt).getTime() > Date.now() ? new Date(o.nextSuiDripAt) : null;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader eyebrow={`${currency} balance, backed by its own vault`} title="Wallet" />
      <Glass spill tint="var(--gold)" className="mt-5 overflow-hidden rounded-[24px] p-5 sm:p-6">
        <span className="pointer-events-none absolute -right-16 -top-20 size-64 rounded-full bg-gold/15 blur-3xl" aria-hidden />
        <p className="relative inline-flex items-center gap-1 text-sm font-medium text-text-2">
          Available to play in {currency}{' '}
          <InfoTip text={`${currency} you can use in games right now. LOFI and SUI are two separate balances. They are never swapped or added together.`} href="/how-it-works" />
        </p>
        <div className="relative">
          {o ? (
            <Amount key={currency} minor={o.available} currency={currency} animate from={0} className="t-num mt-1 text-[40px] leading-tight [text-shadow:0_0_32px_color-mix(in_srgb,var(--gold)_30%,transparent)] sm:text-[52px]" />
          ) : (
            <Skeleton className="mt-2 h-14 w-48" />
          )}
        </div>
        <div className="relative mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-text-2">
          {o && o.inGames > 0 ? (
            <span className="inline-flex items-center gap-1">
              Held in games <Amount minor={o.inGames} currency={currency} coin={false} /> <InfoTip text="Stakes in games that are still being played. They are paid out when each game ends." />
            </span>
          ) : null}
          {o && o.locked > 0 ? (
            <span className="inline-flex items-center gap-1">
              Cashing out <Amount minor={o.locked} currency={currency} coin={false} /> <InfoTip text="Set aside for a cash out in progress. If it does not complete within about 10 minutes it comes back on its own." />
            </span>
          ) : null}
        </div>
        <div className="relative mt-6 grid grid-cols-2 gap-2">
          <Button size="lg" onClick={() => needWallet() && setSheet('add')}>
            Add {currency}
          </Button>
          <Button size="lg" variant="secondary" disabled={!o || o.available < rules.minWithdraw} onClick={() => needWallet() && setSheet('out')}>
            Cash out
          </Button>
        </div>
        {o ? (
          <button type="button" onClick={() => setCurrency(other(currency))} className="press relative mt-4 flex w-full items-center justify-between gap-3 rounded-chip px-3 py-2 text-left text-sm text-text-2 [box-shadow:inset_0_0_0_1px_var(--well-line)] hover:text-text">
            <span>
              Your {other(currency)} balance: <Amount minor={o.balances[other(currency)].available} currency={other(currency)} className="text-text" />
            </span>
            <span className="font-semibold text-primary">Switch to {other(currency)}</span>
          </button>
        ) : null}
      </Glass>

      {o && walletMinor >= rules.minStake ? (
        <div className="glass mt-4 flex flex-col gap-3 overflow-hidden rounded-card p-4 sm:flex-row sm:items-center sm:justify-between" style={{ '--tint': 'var(--primary)' } as React.CSSProperties}>
          <span className="spill pointer-events-none absolute inset-0" aria-hidden />
          <p className="relative text-sm">
            You have <Amount minor={walletMinor} currency={currency} /> in your wallet, ready to add.
          </p>
          <Button size="sm" className="relative" onClick={() => needWallet() && setSheet('add')}>
            Add {currency}
          </Button>
        </div>
      ) : null}

      <Card className="mt-4 p-5" tint="#4DA2FF">
        <p className="t-eyebrow mb-1.5 text-[#7cbcff]">Devnet</p>
        <p className="font-semibold">Free test coins</p>
        <p className="mt-1 text-sm text-text-2">This beta runs on Sui devnet. Get test coins in your wallet, then add them to Cold Call. They have no real value. Cold Call pays the network fee.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <Button variant="secondary" loading={busy === 'lofi'} disabled={!!busy} onClick={getLofi}>
            <CoinChip currency="LOFI" className="size-5" /> Get 1,000 test LOFI
          </Button>
          <Button variant="secondary" loading={busy === 'sui'} disabled={!!busy || !!dripWait} onClick={getSui}>
            <CoinChip currency="SUI" className="size-5" /> Get test SUI
          </Button>
        </div>
        <p className="mt-2 text-xs text-text-2">
          Test LOFI once every 6 hours. Test SUI once every 12 hours{dripWait ? `, next from ${dripWait.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : ''}.
        </p>
        {o ? (
          <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-text-2">
            In your wallet:
            <span className="inline-flex items-center gap-1 font-semibold text-text">
              <CoinChip currency="LOFI" className="size-4" /> {formatBase(walletBase('LOFI'), 2)} LOFI
            </span>
            <span className="inline-flex items-center gap-1 font-semibold text-text">
              <CoinChip currency="SUI" className="size-4" /> {formatBase(walletBase('SUI'), 4)} SUI
            </span>
          </p>
        ) : null}
      </Card>

      {o && o.pendingWithdrawals.length > 0 && (
        <Card className="mt-4 p-5">
          <p className="font-semibold">In progress</p>
          <ul className="mt-2 divide-well">
            {o.pendingWithdrawals.map((w) => (
              <li key={w.id} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-medium">Cash out of {formatAmount(w.amount_minor, w.currency)}</p>
                  <p className="text-sm text-text-2">{w.status === 'review' ? 'A quick check by our team because of the amount. Usually within a few hours.' : 'Not finished yet. Tap Continue to finish it. If you leave it, the money comes back within about 10 minutes.'}</p>
                </div>
                {w.status !== 'review' && (
                  <Button
                    size="sm"
                    loading={busy === w.id}
                    onClick={() =>
                      run(w.id, async () => {
                        if (!needWallet()) return;
                        const t = await api<{ bytes: string }>(`/api/wallet/withdraw/${w.id}/ticket`, {});
                        await signAndSubmit(wallet!, t.bytes);
                        toast(`Cashed out. ${formatAmount(w.amount_minor, w.currency)} is in your wallet.`, 'win');
                        await Promise.all([load(), refresh()]);
                      })
                    }
                  >
                    Continue
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <section className="mt-6">
        <h2 className="t-title">{currency} activity</h2>
        <div className="mt-3">
          {!o ? (
            <Skeleton className="h-40" />
          ) : o.history.length === 0 ? (
            <Empty title="Nothing here yet" text={`Your ${currency} deposits, games and cash outs will show up here.`} />
          ) : (
            <Card className="divide-well overflow-hidden">
              {o.history.map((h) => (
                <details key={h.id} className="group px-4 py-3 transition-colors open:bg-well hover:bg-well">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{h.memo || KIND_LABEL[h.kind] || h.kind}</p>
                      <p className="text-sm text-text-2">{new Date(h.created_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</p>
                    </div>
                    {h.kind === 'withdraw_complete' ? (
                      <span className="text-right text-sm text-text-2">
                        <Amount minor={Math.abs(Number(h.locked_delta))} currency={h.currency} className="text-text" />
                        <span className="block text-xs">sent to your wallet</span>
                      </span>
                    ) : (
                      <Amount minor={Number(h.delta)} currency={h.currency} sign className={Number(h.delta) > 0 ? 'text-win' : Number(h.delta) < 0 ? 'text-text' : 'text-text-2'} />
                    )}
                  </summary>
                  <div className="well mt-2 rounded-chip p-3 text-sm text-text-2">
                    <Row label="Type" value={KIND_LABEL[h.kind] ?? h.kind} />
                    {h.table_id ? <Row label="Game" value={<a className="font-semibold text-primary" href={`/verify/${h.table_id}`}>View and verify</a>} /> : null}
                    {h.meta?.digest ? (
                      <Row
                        label="Network record"
                        value={
                          <a className="font-mono text-xs font-semibold text-primary" href={suiscan('tx', String(h.meta.digest), network)} target="_blank" rel="noreferrer">
                            {String(h.meta.digest).slice(0, 10)} on Suiscan
                          </a>
                        }
                      />
                    ) : null}
                  </div>
                </details>
              ))}
            </Card>
          )}
        </div>
      </section>

      <Card className="mt-4 p-5" tint="var(--gold)">
        <p className="t-eyebrow mb-1.5 text-gold">The vault</p>
        <p className="font-semibold">Where your {currency} is</p>
        <p className="mb-3 mt-1 text-sm text-text-2">Every {currency} you have in Cold Call is backed one to one by {currency} in a public vault on Sui. Open it on Suiscan and check for yourself.</p>
        <VaultLinks compact only={currency} />
        <a href="/how-it-works#vault" className="mt-2 inline-block text-sm font-semibold text-primary">
          How the vaults work
        </a>
      </Card>

      {me ? <ReceiveCoins address={me.walletAddress} /> : null}

      <details className="glass mt-6 rounded-card p-4 text-sm">
        <summary className="cursor-pointer font-semibold">Details for experts</summary>
        <div className="mt-3 space-y-1 text-text-2">
          <Row
            label="Your wallet"
            value={
              <button className="font-mono text-xs underline decoration-dotted" onClick={() => (navigator.clipboard.writeText(me!.walletAddress), toast('Wallet address copied.'))}>
                {me?.walletAddress.slice(0, 10)} (copy)
              </button>
            }
          />
          <Row label="Wallet type" value={me?.walletKind === 'zklogin' ? 'Google account (zkLogin)' : 'Wallet on this device'} />
          <Row label="Network fees" value="Paid by Cold Call" info="Every transaction you approve here is sponsored: Cold Call pays the Sui network fee, so you never need SUI for fees." />
          {me ? (
            <a href={suiscan('account', me.walletAddress, network)} target="_blank" rel="noreferrer" className="inline-block pt-2 font-semibold text-primary">
              Open your wallet on Suiscan
            </a>
          ) : null}
        </div>
      </details>

      <AmountSheet
        open={sheet === 'add'}
        onClose={() => setSheet(null)}
        title={`Add ${currency}`}
        currency={currency}
        min={1}
        max={Math.min(walletMinor, rules.maxDeposit)}
        cta={`Add ${currency}`}
        help={`${currency} moves from your wallet into the public ${currency} vault, and the same amount is added to your ${currency} balance here. Cold Call pays the network fee.`}
        onSubmit={async (minor) => {
          const b = await api<{ bytes: string }>('/api/wallet/deposit/build', { currency, amount: minor });
          const r = await signAndSubmit(wallet!, b.bytes);
          toast(`${formatAmount(r.credited || minor, currency)} added.`, 'win');
          play('coin');
          await Promise.all([load(), refresh()]);
        }}
      />
      <AmountSheet
        open={sheet === 'out'}
        onClose={() => setSheet(null)}
        title={`Cash out ${currency}`}
        currency={currency}
        min={rules.minWithdraw}
        max={o?.available ?? 0}
        cta="Cash out"
        help={`${currency} goes from the vault back to your wallet. Up to ${formatAmount(rules.withdrawDaily, currency)} a day. Above ${formatAmount(rules.withdrawReviewAbove, currency)} our team takes a quick look first.`}
        onSubmit={async (minor) => {
          const w = await api<{ id: string; status: string; bytes?: string }>('/api/wallet/withdraw', { currency, amount: minor });
          if (w.status === 'review') {
            toast('Your cash out is waiting for a quick check. We will let you know.', 'info');
          } else {
            await signAndSubmit(wallet!, w.bytes!);
            toast(`Cashed out. ${formatAmount(minor, currency)} is in your wallet.`, 'win');
          }
          await Promise.all([load(), refresh()]);
        }}
      />
    </div>
  );
}
