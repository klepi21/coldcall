'use client';
/**
 * The player's own Solana wallet, like a portfolio: every token they hold (USDC, SOL, anything else),
 * each with a Send button. This is separate from Evens credits, which live in the vault.
 */
import { useCallback, useEffect, useState } from 'react';
import { Card, InfoTip, Skeleton, UsdcIcon } from '@/components/ui';
import { api } from '@/lib/api';
import { explorerUrl } from '@/lib/chain';
import type { Asset } from './SendUsdc';

export function SolIcon({ className = 'size-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <defs>
        <linearGradient id="sol-g" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#9945FF" />
          <stop offset="1" stopColor="#14F195" />
        </linearGradient>
      </defs>
      <circle cx="16" cy="16" r="16" fill="#0b0b14" />
      <path d="M9.5 20.6h12.2l-2.2 2.4H7.3zM9.5 9h12.2L19.5 11.4H7.3zM22.5 14.8H10.3l2.2 2.4h12.2z" fill="url(#sol-g)" />
    </svg>
  );
}

function TokenIcon({ a }: { a: Asset }) {
  if (a.id === 'SOL') return <SolIcon className="size-10" />;
  if (a.symbol === 'USDC') return <UsdcIcon className="size-10" />;
  return <span className="grid size-10 place-items-center rounded-full bg-white/10 font-display text-xs font-extrabold">{a.id.slice(0, 2)}</span>;
}

export function Portfolio({ address, onSend, refreshKey = 0 }: { address: string; onSend: (a: Asset) => void; refreshKey?: number }) {
  const [items, setItems] = useState<Asset[] | null>(null);
  const [err, setErr] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const load = useCallback(() => {
    setErr(false);
    api<{ items: Asset[] }>('/api/wallet/portfolio')
      .then((r) => setItems(r.items))
      .catch(() => setErr(true));
  }, []);
  useEffect(() => load(), [load, refreshKey]);
  useEffect(() => {
    explorerUrl('address', address).then(setLink).catch(() => {});
  }, [address]);

  const fmt = (a: Asset) => a.ui.toLocaleString('en-US', { minimumFractionDigits: a.id === 'SOL' ? 2 : 2, maximumFractionDigits: a.id === 'SOL' ? 4 : Math.min(a.decimals, 4) });

  return (
    <Card className="mt-4 p-5" tint="#14F195">
      <div className="flex items-center justify-between gap-3">
        <p className="t-eyebrow inline-flex items-center gap-1">
          Your portfolio <InfoTip text="Everything in your own Solana wallet. It is yours: send it anywhere, or add USDC to Evens to play. Credits in Evens are shown above, not here." />
        </p>
        {link ? (
          <a href={link} target="_blank" rel="noreferrer" className="text-sm font-semibold text-primary">
            View wallet
          </a>
        ) : null}
      </div>
      <p className="mt-1 break-all font-mono text-xs text-text-2">{address}</p>

      {err ? (
        <p className="mt-4 text-sm text-text-2">
          We could not load your wallet just now.{' '}
          <button className="font-semibold text-primary" onClick={load}>
            Try again
          </button>
        </p>
      ) : !items ? (
        <div className="mt-4 space-y-2">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      ) : (
        <ul className="mt-3 divide-well">
          {items.map((a) => (
            <li key={a.id} className="flex items-center gap-3 py-3">
              <TokenIcon a={a} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{a.symbol}</p>
                <p className="truncate text-sm text-text-2">{a.name}</p>
              </div>
              <p className="text-right font-display text-lg font-extrabold tabular">{fmt(a)}</p>
              <button
                type="button"
                onClick={() => onSend(a)}
                disabled={BigInt(a.base) === 0n}
                className="btn-secondary press ml-1 h-10 rounded-chip px-4 text-sm font-semibold disabled:opacity-40"
                aria-label={`Send ${a.symbol}`}
              >
                Send
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-xs text-text-2">SOL pays the tiny network fees for every move. Keep a little in your wallet.</p>
    </Card>
  );
}
