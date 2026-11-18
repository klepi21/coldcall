'use client';
/**
 * Send USDC from the player's own wallet to another Solana address. This is their own money in
 * their own wallet (not credits): the server builds a plain token transfer and the player signs it.
 * A transfer on Solana cannot be undone, so the sheet shows a clear review step first.
 */
import { useEffect, useState } from 'react';
import { Button, Sheet, UsdcIcon } from '@/components/ui';
import { SolIcon } from './Portfolio';
import { api } from '@/lib/api';
import { signAndSend, explorerUrl } from '@/lib/chain';
import type { EvensWallet } from '@/lib/wallet';
import { useSession } from './Providers';

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export interface Asset {
  id: string; // 'SOL' or a mint
  symbol: string;
  name: string;
  decimals: number;
  base: string;
  ui: number;
}

/** "12.5" -> base units for `decimals`, or null if not a valid amount. */
function toBase(input: string, decimals: number): bigint | null {
  const m = new RegExp(`^\\s*(\\d{1,12})(?:[.,](\\d{1,${Math.max(decimals, 1)}}))?\\s*$`).exec(input);
  if (!m) return null;
  return BigInt(m[1]!) * 10n ** BigInt(decimals) + BigInt((m[2] ?? '').padEnd(decimals, '0') || '0');
}

export function SendUsdc({ open, onClose, wallet, asset, myAddress, onSent }: { open: boolean; onClose: () => void; wallet: EvensWallet | null; asset: Asset | null; myAddress: string; onSent: () => void }) {
  const sym = asset?.symbol ?? 'USDC';
  const decimals = asset?.decimals ?? 6;
  const balanceUsdc = asset?.ui ?? 0;
  const { toast } = useSession();
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [step, setStep] = useState<'form' | 'review' | 'done'>('form');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setStep('form');
      setErr(null);
      setLink(null);
    }
  }, [open]);

  const base = toBase(amount, decimals);
  const haveBase = BigInt(asset?.base ?? '0');
  const reserve = asset?.id === 'SOL' ? 10_000n : 0n; // keep a little SOL for the fee
  const addrOk = BASE58.test(to.trim());

  const review = () => {
    if (!addrOk) return setErr('That does not look like a Solana address. Paste the full address.');
    if (to.trim() === myAddress) return setErr('That is your own address.');
    if (!base || base <= 0n) return setErr(`Enter an amount of ${sym}.`);
    if (base + reserve > haveBase) return setErr(asset?.id === 'SOL' ? 'Leave a little SOL for the network fee.' : `You have ${fmt(balanceUsdc)} ${sym} in your wallet.`);
    setErr(null);
    setStep('review');
  };

  const send = async () => {
    if (!wallet || !base) return;
    setBusy(true);
    setErr(null);
    try {
      const b = await api<{ transaction: string }>('/api/wallet/send/build', { to: to.trim(), amount: base.toString(), asset: asset?.id === 'SOL' ? 'SOL' : asset?.symbol === 'USDC' ? 'USDC' : asset?.id });
      const sig = await signAndSend(wallet, b.transaction);
      setLink(await explorerUrl('tx', sig));
      setStep('done');
      toast(`Sent ${amount} ${sym}.`, 'win');
      onSent();
    } catch (e: any) {
      setErr(e?.message?.includes('rejected') ? 'You cancelled in your wallet. Nothing was sent.' : e?.message ?? 'Sending did not work. Nothing was sent.');
      setStep('form');
    } finally {
      setBusy(false);
    }
  };

  const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-6)}`;
  function fmt(n: number) {
    return n.toLocaleString('en-US', { maximumFractionDigits: Math.min(decimals, 6) });
  }
  const maxUi = () => {
    const b = haveBase - reserve > 0n ? haveBase - reserve : 0n;
    const whole = b / 10n ** BigInt(decimals);
    const frac = (b % 10n ** BigInt(decimals)).toString().padStart(decimals, '0').replace(/0+$/, '');
    return frac ? `${whole}.${frac}` : `${whole}`;
  };
  const Icon = () => (asset?.id === 'SOL' ? <SolIcon className="size-4" /> : sym === 'USDC' ? <UsdcIcon className="size-4" /> : null);

  return (
    <Sheet open={open} onClose={busy ? () => {} : onClose} title={`Send ${sym}`}>
      {step === 'form' && haveBase <= reserve && (
        <div>
          <p className="text-text-2">You have no {sym} in your wallet right now.{sym === 'USDC' ? ' Your money is in Evens as credits.' : ''}</p>
          {sym === 'USDC' ? <p className="mt-2 text-text-2">To send it somewhere, first tap <strong className="text-text">Cash out</strong> to move credits back to your wallet as USDC, then come back here.</p> : null}
          <Button full size="lg" className="mt-4" onClick={onClose}>
            Got it
          </Button>
        </div>
      )}
      {step === 'form' && haveBase > reserve && (
        <div>
          <p className="text-sm text-text-2">Send {sym} from your wallet to any Solana address, for example an exchange or a friend. This uses what is in your wallet, not your credits.</p>
          <label htmlFor="send-to" className="mt-4 mb-1.5 block text-sm font-semibold">
            Recipient address
          </label>
          <input
            id="send-to"
            value={to}
            onChange={(e) => (setTo(e.target.value), setErr(null))}
            placeholder="Paste a Solana address"
            autoComplete="off"
            spellCheck={false}
            className="well h-12 w-full rounded-chip px-3 font-mono text-sm outline-none focus:ring-2 focus:ring-primary"
          />
          <label htmlFor="send-amount" className="mt-4 mb-1.5 block text-sm font-semibold">
            Amount in {sym}
          </label>
          <div className="flex gap-2">
            <input
              id="send-amount"
              inputMode="decimal"
              value={amount}
              onChange={(e) => (setAmount(e.target.value), setErr(null))}
              placeholder="0.00"
              className="well h-12 w-full rounded-chip px-3 font-display text-lg tabular outline-none focus:ring-2 focus:ring-primary"
            />
            <Button variant="secondary" onClick={() => setAmount(maxUi())}>
              Max
            </Button>
          </div>
          <p className="mt-1.5 flex items-center gap-1.5 text-sm text-text-2">
            <Icon /> In your wallet: {fmt(balanceUsdc)} {sym}
          </p>
          <p className="mt-3 rounded-chip border border-warn/40 bg-warn/10 p-3 text-sm">Only send to a Solana address. Sending to another network (Ethereum, Tron, BNB) loses the money.</p>
          {err ? <p className="mt-3 text-sm font-medium text-loss">{err}</p> : null}
          <Button size="lg" full className="mt-4" disabled={!to || !amount} onClick={review}>
            Review
          </Button>
        </div>
      )}

      {step === 'review' && (
        <div>
          <div className="well rounded-card p-4">
            <p className="text-sm text-text-2">You send</p>
            <p className="mt-1 flex items-center gap-2 font-display text-3xl font-extrabold tabular">
              {amount} <span className="text-base text-text-2">{sym}</span>
            </p>
            <p className="mt-4 text-sm text-text-2">To</p>
            <p className="mt-1 break-all font-mono text-sm">{to.trim()}</p>
            <p className="mt-4 text-sm text-text-2">Network fee</p>
            <p className="mt-1 text-sm">{asset?.id === 'SOL' ? 'About 0.000005 SOL.' : `About 0.000005 SOL from your wallet, plus about 0.002 SOL once if this address has never held ${sym}.`}</p>
          </div>
          <p className="mt-3 text-sm font-medium">Solana transfers are final. Check the address: money sent to a wrong address cannot be brought back.</p>
          {err ? <p className="mt-3 text-sm font-medium text-loss">{err}</p> : null}
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button variant="secondary" size="lg" disabled={busy} onClick={() => setStep('form')}>
              Back
            </Button>
            <Button size="lg" loading={busy} onClick={send}>
              Send {amount} {sym}
            </Button>
          </div>
        </div>
      )}

      {step === 'done' && (
        <div className="text-center">
          <p className="font-display text-2xl font-extrabold uppercase">Sent</p>
          <p className="mt-2 text-text-2">
            {amount} {sym} went to {short(to.trim())}.
          </p>
          {link ? (
            <a href={link} target="_blank" rel="noreferrer" className="mt-3 inline-block font-semibold text-primary">
              View on Solana Explorer
            </a>
          ) : null}
          <Button full size="lg" className="mt-5" onClick={onClose}>
            Done
          </Button>
        </div>
      )}
    </Sheet>
  );
}
