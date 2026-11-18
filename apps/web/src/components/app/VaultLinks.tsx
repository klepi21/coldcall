'use client';
import { useEffect, useState } from 'react';
import { CURRENCIES, type Currency } from '@coldcall/shared';
import { chainConfig, suiscan, type ChainCfg } from '@/lib/chain';
import { api } from '@/lib/api';
import { Amount } from '@/components/ui';
import { useSession } from './Providers';

interface VaultRow {
  currency: Currency;
  vaultId: string;
  minor: number;
  owedMinor: number;
  backed: boolean;
}

const External = () => (
  <svg viewBox="0 0 20 20" className="size-4" fill="currentColor" aria-hidden>
    <path d="M11 3h6v6h-2V6.4l-6.3 6.3-1.4-1.4L13.6 5H11V3ZM4 5h5v2H5v8h8v-4h2v6H3V5h1Z" />
  </svg>
);

/**
 * The two public vaults (one per coin), live from Sui devnet, next to what Cold Call holds for others in
 * the same coin. Each coin is checked on its own: LOFI never backs SUI and SUI never backs LOFI.
 */
export function VaultLinks({ compact = false, only }: { compact?: boolean; only?: Currency }) {
  const { toast } = useSession();
  const [cfg, setCfg] = useState<ChainCfg | null>(null);
  const [vaults, setVaults] = useState<VaultRow[] | null>(null);

  useEffect(() => {
    chainConfig().then(setCfg).catch(() => {});
    const load = () => api<{ vaults: VaultRow[] }>('/api/vault').then((r) => setVaults(r.vaults)).catch(() => {});
    load();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, []);

  if (!cfg || !vaults) return <div className="shimmer h-24 rounded-chip" />;
  const list = CURRENCIES.filter((c) => !only || c === only);

  return (
    <div className="space-y-2">
      {list.map((c) => {
        const v = vaults.find((x) => x.currency === c);
        return (
          <div key={c} className="well relative overflow-hidden rounded-[16px] p-4 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--gold)_25%,transparent)]">
            <p className="text-xs font-bold uppercase tracking-wider text-text-2">{c} vault, live from Sui</p>
            <p className="t-num mt-1 break-words text-2xl text-text sm:text-3xl">{v ? <Amount minor={v.minor} currency={c} className="flex-wrap" /> : '0.00'}</p>
            {v ? (
              <p className="mt-1 text-sm text-text-2">
                Held for players and the house: <Amount minor={v.owedMinor} currency={c} coin={false} className="text-text" />.{' '}
                <span className={v.backed ? 'font-semibold text-win' : 'font-semibold text-loss'}>{v.backed ? 'Fully backed.' : 'Not fully backed, our team is alerted.'}</span>
              </p>
            ) : null}
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => (navigator.clipboard.writeText(cfg.vaults[c]), toast(`${c} vault address copied.`))}
                className="min-w-0 break-all text-left font-mono text-[11px] text-text-2 hover:text-text"
                aria-label={`Copy the ${c} vault address`}
              >
                {cfg.vaults[c]}
              </button>
              <a href={suiscan('object', cfg.vaults[c], cfg.network)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-chip px-2 py-1 text-sm font-semibold text-primary hover:bg-well-hover">
                View on Suiscan <External />
              </a>
            </div>
          </div>
        );
      })}
      {!compact ? (
        <div className="well rounded-chip p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-text">Cold Call contract</p>
            <a href={suiscan('object', cfg.packageId, cfg.network)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-chip px-2 py-1 text-sm font-semibold text-primary hover:bg-well-hover">
              View on Suiscan <External />
            </a>
          </div>
          <p className="mt-1 text-xs text-text-2">The Move package that runs both vaults and the test LOFI faucet. Do not send coins to a vault directly: use Add money so they are credited to you.</p>
        </div>
      ) : null}
      <p className="text-xs text-text-2">Sui devnet. Anyone can open these links and check each vault balance and every deposit and cash out.</p>
    </div>
  );
}
