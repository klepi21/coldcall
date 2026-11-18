'use client';
import { useCallback, useEffect, useState } from 'react';
import { formatCredits, parseCredits } from '@coldcall/shared';
import { useSession } from '@/components/app/Providers';
import { Button, Card, Credits, Sheet, Skeleton, InfoTip, Chip, Empty, Row, Glass, PageHeader } from '@/components/ui';
import { api } from '@/lib/api';
import { signAndSend, explorerUrl } from '@/lib/chain';
import { guestWallet } from '@/lib/wallet';
import { play } from '@/lib/sound';
import { VaultLinks } from '@/components/app/VaultLinks';
import { ReceiveUsdc, UsdcWaitingBanner } from '@/components/app/ReceiveUsdc';
import { SendUsdc, type Asset } from '@/components/app/SendUsdc';
import { Portfolio } from '@/components/app/Portfolio';
import { Usdc, UsdcIcon } from '@/components/ui';

interface Overview {
  available: number;
  locked: number;
  inGames: number;
  walletTokens: number;
  walletSol: number;
  history: { id: string; kind: string; memo: string; created_at: string; delta: number; locked_delta: number; table_id: string | null; meta: any }[];
  pendingWithdrawals: { id: string; amount_minor: number; status: string; created_at: string; expiry: string }[];
}

const KIND_LABEL: Record<string, string> = {
  deposit: 'Added money',
  withdraw_lock: 'Cash out started',
  withdraw_release: 'Cash out cancelled, credits back',
  withdraw_complete: 'Cashed out',
  game_start: 'Game entry',
  game_settle: 'Game result',
  game_refund: 'Refund',
};

function AmountSheet({ open, onClose, title, max, cta, help, onSubmit }: { open: boolean; onClose: () => void; title: string; max: number; cta: string; help: string; onSubmit: (minor: number) => Promise<void> }) {
  const [raw, setRaw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const minor = parseCredits(raw);
  useEffect(() => {
    if (open) (setRaw(''), setErr(null));
  }, [open]);
  const submit = async () => {
    if (minor === null || minor < 100) return setErr('Enter at least 1.00 credit.');
    if (minor > max) return setErr(`You can use up to ${formatCredits(max)} credits here.`);
    setBusy(true);
    setErr(null);
    try {
      await onSubmit(minor);
      onClose();
    } catch (e: any) {
      setErr(e?.message?.includes('rejected') ? 'You cancelled in your wallet. Nothing was moved.' : e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <label htmlFor="amount" className="mb-1.5 block text-sm font-semibold">
        Amount in credits
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
        {[1000, 2500, 5000].filter((v) => v <= max).map((v) => (
          <Chip key={v} onClick={() => setRaw(formatCredits(v))} active={minor === v}>
            {formatCredits(v).replace('.00', '')}
          </Chip>
        ))}
        {max > 0 ? (
          <Chip onClick={() => setRaw(formatCredits(max).replace(/,/g, ''))} active={minor === max}>
            All
          </Chip>
        ) : null}
      </div>
      <p className="mt-3 text-sm text-text-2">{help}</p>
      {minor !== null && minor > 0 ? (
        <p className="mt-2 flex items-center gap-1.5 text-sm">
          That is <UsdcIcon className="size-4" /> <strong>{(minor / 10000).toFixed(2)} USDC</strong>
        </p>
      ) : null}
      {err ? <p className="mt-3 text-sm font-medium text-loss">{err}</p> : null}
      <Button size="lg" full className="mt-5" loading={busy} onClick={submit}>
        {cta}
      </Button>
    </Sheet>
  );
}

export default function WalletPage() {
  const { me, wallet, toast, openAuth, ready, refresh } = useSession();
  const [o, setO] = useState<Overview | null>(null);
  const [sheet, setSheet] = useState<'add' | 'out' | null>(null);
  const [sendOpen, setSendOpen] = useState(false);
  const [sendAsset, setSendAsset] = useState<Asset | null>(null);
  const [pfKey, setPfKey] = useState(0);
  const [faucetBusy, setFaucetBusy] = useState(false);
  const [explorer, setExplorer] = useState<string | null>(null);

  const load = useCallback(() => {
    setPfKey((k) => k + 1);
    return api<Overview>('/api/wallet').then(setO).catch(() => {});
  }, []);
  // Opening a money sheet re-reads balances, so the limit never comes from a stale number.
  useEffect(() => {
    if (sheet) void load();
  }, [sheet, load]);
  useEffect(() => {
    if (me) {
      load();
      explorerUrl('address', me.walletAddress).then(setExplorer);
    }
  }, [me, load]);

  const activeWallet = wallet ?? (me?.walletKind === 'embedded' ? guestWallet(false) : null);

  if (ready && !me)
    return <Empty title="Your wallet" text="Sign in to add money, see your balance and cash out." action={<Button onClick={() => openAuth()}>Start playing</Button>} />;

  const needWallet = () => {
    if (!activeWallet) {
      toast('Please reconnect your wallet: sign out and sign in again with the same wallet.', 'error');
      return false;
    }
    return true;
  };

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader eyebrow="Backed one to one by the vault" title="Wallet" />
      <Glass spill tint="var(--gold)" className="mt-5 overflow-hidden rounded-[24px] p-5 sm:p-6">
        <span className="pointer-events-none absolute -right-16 -top-20 size-64 rounded-full bg-gold/15 blur-3xl" aria-hidden />
        <svg viewBox="0 0 200 200" className="w-spin pointer-events-none absolute -right-10 -top-10 size-48 opacity-[0.12]" style={{ ['--dur' as string]: '60s' }} aria-hidden>
          <circle cx="100" cy="100" r="96" fill="none" stroke="var(--gold)" strokeWidth="2" strokeDasharray="2 10" />
          <circle cx="100" cy="100" r="70" fill="none" stroke="var(--gold)" strokeWidth="1.5" />
          <rect x="62" y="74" width="76" height="16" rx="8" fill="var(--gold)" />
          <rect x="62" y="110" width="76" height="16" rx="8" fill="var(--gold)" />
        </svg>
        <p className="relative inline-flex items-center gap-1 text-sm font-medium text-text-2">
          Available to play <InfoTip text="Credits you can use in games right now. 100 credits equal 1 test USDC in the vault." href="/how-it-works" />
        </p>
        <div className="relative">{o ? <Credits minor={o.available} animate from={0} className="t-num mt-1 text-[44px] leading-tight [text-shadow:0_0_32px_color-mix(in_srgb,var(--gold)_30%,transparent)] sm:text-[52px]" /> : <Skeleton className="mt-2 h-14 w-48" />}</div>
        {o ? (
          <p className="relative mt-1 flex items-center gap-1.5 text-sm text-text-2">
            worth <Usdc amount={o.available / 10000} className="text-text" />
          </p>
        ) : null}
        <div className="relative mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-text-2">
          {o && o.inGames > 0 ? (
            <span className="inline-flex items-center gap-1">
              Held in games <Credits minor={o.inGames} coin={false} /> <InfoTip text="Stakes in games that are still being played. They are paid out when each game ends." />
            </span>
          ) : null}
          {o && o.locked > 0 ? (
            <span className="inline-flex items-center gap-1">
              Cashing out <Credits minor={o.locked} coin={false} /> <InfoTip text="Credits set aside for a cash out in progress. If it does not complete within 10 minutes they come back automatically." />
            </span>
          ) : null}
        </div>
        <div className="relative mt-6 grid grid-cols-2 gap-2">
          <Button size="lg" onClick={() => needWallet() && setSheet('add')}>
            Add money
          </Button>
          <Button size="lg" variant="secondary" disabled={!o || o.available < 100} onClick={() => needWallet() && setSheet('out')}>
            Cash out
          </Button>
        </div>
      </Glass>

      {o ? <UsdcWaitingBanner usdc={o.walletTokens / 10000} onAdd={() => needWallet() && setSheet('add')} /> : null}

      {me ? <Portfolio address={me.walletAddress} refreshKey={pfKey} onSend={(a) => needWallet() && (setSendAsset(a), setSendOpen(true))} /> : null}

      {me ? <ReceiveUsdc address={me.walletAddress} /> : null}

      <Card className="mt-4 p-5" tint="#2775CA">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="t-eyebrow mb-1.5 text-[#5aa2f0]">Devnet</p>
            <p className="font-semibold">Free test money</p>
            <p className="mt-1 text-sm text-text-2">This beta runs on Solana devnet. Get 100 test USDC in your wallet, then add it to Evens. It has no real value.</p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button
            variant="secondary"
            loading={faucetBusy}
            onClick={async () => {
              setFaucetBusy(true);
              try {
                await api('/api/wallet/faucet', {});
                await load(); // show the new USDC before telling the player to add it
                toast('100 test USDC are in your wallet. Tap Add money to use them.', 'win');
                play('coin');
              } catch (e: any) {
                toast(e.message, 'error');
              } finally {
                setFaucetBusy(false);
              }
            }}
          >
            <UsdcIcon className="size-5" /> Get 100 test USDC
          </Button>
          {o ? (
            <span className="text-sm text-text-2">
              In your wallet: <Usdc amount={o.walletTokens / 10000} />
            </span>
          ) : null}

        </div>
      </Card>

      {o && o.pendingWithdrawals.length > 0 && (
        <Card className="mt-4 p-5">
          <p className="font-semibold">In progress</p>
          <ul className="mt-2 divide-well">
            {o.pendingWithdrawals.map((w) => (
              <li key={w.id} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-medium">Cash out of {formatCredits(w.amount_minor)} credits</p>
                  <p className="text-sm text-text-2">{w.status === 'review' ? 'A quick check by our team because of the amount. Usually within a few hours.' : 'Waiting for your approval in the wallet.'}</p>
                </div>
                {w.status === 'pending' && (
                  <Button
                    size="sm"
                    onClick={async () => {
                      try {
                        const t = await api(`/api/wallet/withdraw/${w.id}/ticket`, {});
                        const sig = await signAndSend(activeWallet!, t.transaction);
                        await api(`/api/wallet/withdraw/${w.id}/confirm`, { signature: sig });
                        toast('Cashed out. The money is in your wallet.', 'win');
                        load();
                      } catch (e: any) {
                        toast(e.message, 'error');
                      }
                    }}
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
        <h2 className="t-title">Activity</h2>
        <div className="mt-3">
          {!o ? (
            <Skeleton className="h-40" />
          ) : o.history.length === 0 ? (
            <Empty title="Nothing here yet" text="Your deposits, games and cash outs will show up here." />
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
                        <Credits minor={Math.abs(Number(h.locked_delta))} className="text-text" />
                        <span className="block text-xs">sent to your wallet</span>
                      </span>
                    ) : (
                      <Credits minor={Number(h.delta)} sign className={Number(h.delta) > 0 ? 'text-win' : Number(h.delta) < 0 ? 'text-text' : 'text-text-2'} />
                    )}
                  </summary>
                  <div className="well mt-2 rounded-chip p-3 text-sm text-text-2">
                    <Row label="Type" value={KIND_LABEL[h.kind] ?? h.kind} />
                    {h.table_id ? (
                      <Row label="Game" value={<a className="font-semibold text-primary" href={`/verify/${h.table_id}`}>View and verify</a>} />
                    ) : null}
                    {h.meta?.signature ? <Row label="Network record" value={<span className="font-mono text-xs">{String(h.meta.signature).slice(0, 10)}</span>} /> : null}
                  </div>
                </details>
              ))}
            </Card>
          )}
        </div>
      </section>

      <Card className="mt-4 p-5" tint="var(--gold)">
        <p className="t-eyebrow mb-1.5 text-gold">The vault</p>
        <p className="font-semibold">Where your money is</p>
        <p className="mt-1 mb-3 text-sm text-text-2">Every credit is backed one to one by money in a public vault on Solana. Open it in the explorer and check for yourself.</p>
        <VaultLinks compact />
        <a href="/how-it-works#vault" className="mt-2 inline-block text-sm font-semibold text-primary">How the vault works</a>
      </Card>

      <details className="glass mt-6 rounded-card p-4 text-sm">
        <summary className="cursor-pointer font-semibold">Details for experts</summary>
        <div className="mt-3 space-y-1 text-text-2">
          <Row label="Your wallet" value={<button className="font-mono text-xs underline decoration-dotted" onClick={() => (navigator.clipboard.writeText(me!.walletAddress), toast('Wallet address copied.'))}>{me?.walletAddress.slice(0, 6)} (copy)</button>} />
          <Row label="Wallet type" value={me?.walletKind === 'embedded' ? 'Wallet on this device' : 'Your own wallet'} />
          <Row label="SOL for network fees" value={o ? o.walletSol.toFixed(3) : 'Loading'} info="A tiny amount of SOL pays network fees when you add money or cash out. The test money button tops it up for you." />
          {explorer ? (
            <a href={explorer} target="_blank" rel="noreferrer" className="inline-block pt-2 font-semibold text-primary">
              Open in Solana Explorer
            </a>
          ) : null}
        </div>
      </details>

      <SendUsdc open={sendOpen} onClose={() => setSendOpen(false)} wallet={activeWallet} asset={sendAsset} myAddress={me?.walletAddress ?? ''} onSent={() => (void load(), setPfKey((k) => k + 1))} />
      <AmountSheet
        open={sheet === 'add'}
        onClose={() => setSheet(null)}
        title="Add money"
        max={Math.max(0, o?.walletTokens ?? 0)}
        cta="Add money"
        help="Money moves from your wallet into the Evens vault, and you get the same amount in credits. Your wallet asks you to approve."
        onSubmit={async (minor) => {
          const b = await api('/api/wallet/deposit/build', { amount: minor });
          const sig = await signAndSend(activeWallet!, b.transaction);
          await api('/api/wallet/deposit/confirm', { signature: sig });
          toast(`${formatCredits(minor)} credits added.`, 'win');
          play('coin');
          await Promise.all([load(), refresh()]);
        }}
      />
      <AmountSheet
        open={sheet === 'out'}
        onClose={() => setSheet(null)}
        title="Cash out"
        max={o?.available ?? 0}
        cta="Cash out"
        help="Credits turn back into test USDC in your wallet. Your wallet asks you to approve. Up to 1,000 credits a day, larger amounts get a quick check."
        onSubmit={async (minor) => {
          const w = await api('/api/wallet/withdraw', { amount: minor });
          if (w.status === 'review') {
            toast('Your cash out is waiting for a quick check. We will let you know.', 'info');
          } else {
            const sig = await signAndSend(activeWallet!, w.transaction);
            await api(`/api/wallet/withdraw/${w.id}/confirm`, { signature: sig });
            toast('Cashed out. The money is in your wallet.', 'win');
          }
          await Promise.all([load(), refresh()]);
        }}
      />
    </div>
  );
}
