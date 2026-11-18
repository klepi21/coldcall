'use client';
import { useEffect, useState } from 'react';
import { chainConfig, explorerUrl } from '@/lib/chain';
import { api } from '@/lib/api';
import { UsdcIcon, Credits } from '@/components/ui';
import { useSession } from './Providers';

interface Item {
  label: string;
  hint: string;
  address: string;
  url: string;
}

/** Public, checkable addresses of the vault, the program and the test token, with explorer links. */
export function VaultLinks({ compact = false }: { compact?: boolean }) {
  const { toast } = useSession();
  const [items, setItems] = useState<Item[] | null>(null);
  const [cluster, setCluster] = useState('');
  const [vault, setVault] = useState<{ usdc: number; owedMinor: number; backed: boolean; at: string } | null>(null);

  useEffect(() => {
    const load = () => api('/api/vault').then(setVault).catch(() => {});
    load();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const c = await chainConfig();
        setCluster(c.cluster);
        const list: Omit<Item, 'url'>[] = [
          { label: 'Vault', hint: 'The account that holds every player deposit. Its balance is public. Do not send money here directly: use Add money in your wallet so it is credited to you.', address: c.vault },
          { label: 'Vault program', hint: 'The smart contract that controls deposits and cash outs.', address: c.programId },
          { label: 'Test USDC token', hint: 'The devnet token used for deposits in this beta.', address: c.mint },
        ];
        setItems(await Promise.all(list.map(async (i) => ({ ...i, url: await explorerUrl('address', i.address) }))));
      } catch {
        setItems([]);
      }
    })();
  }, []);

  if (!items) return <div className="shimmer h-24 rounded-chip" />;
  if (!items.length) return null;
  const shown = compact ? items.slice(0, 1) : items;

  return (
    <div className="space-y-2">
      <div className="well relative overflow-hidden rounded-[16px] p-4 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--gold)_35%,transparent),var(--gold-glow)]">
        <span className="pointer-events-none absolute -right-10 -top-10 size-36 rounded-full bg-gold/15 blur-2xl" aria-hidden />
        <p className="text-xs font-bold uppercase tracking-wider text-text-2">Vault balance, live from Solana</p>
        <p className="t-num mt-1 flex items-center gap-2 text-3xl text-text">
          <UsdcIcon className="size-8" />
          {vault ? vault.usdc.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}
          <span className="text-base font-bold text-text-2">USDC</span>
        </p>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-text-2">
          backs <Credits minor={Math.round((vault?.usdc ?? 0) * 10_000)} className="text-gold" /> credits
        </p>
        {vault ? (
          <p className="mt-1 text-sm text-text-2">
            Owed to players and the house: {(vault.owedMinor / 10_000).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC ({(vault.owedMinor / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} credits).{' '}
            <span className={vault.backed ? 'font-semibold text-win' : 'font-semibold text-loss'}>{vault.backed ? 'Fully backed.' : 'Not fully backed, our team is alerted.'}</span>
          </p>
        ) : null}
      </div>
      {shown.map((i) => (
        <div key={i.label} className="well rounded-chip p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-text">{i.label}</p>
            <a
              href={i.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-chip px-2 py-1 text-sm font-semibold text-primary hover:bg-well-hover"
            >
              View on Solana Explorer
              <svg viewBox="0 0 20 20" className="size-4" fill="currentColor" aria-hidden>
                <path d="M11 3h6v6h-2V6.4l-6.3 6.3-1.4-1.4L13.6 5H11V3ZM4 5h5v2H5v8h8v-4h2v6H3V5h1Z" />
              </svg>
            </a>
          </div>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(i.address);
              toast(`${i.label} address copied.`);
            }}
            className="mt-1 block w-full break-all text-left font-mono text-xs text-text-2 hover:text-text"
            aria-label={`Copy ${i.label} address`}
          >
            {i.address}
          </button>
          {!compact && <p className="mt-1 text-xs text-text-2">{i.hint}</p>}
        </div>
      ))}
      {cluster === 'localnet' ? (
        <p className="text-xs text-text-2">Running on a local test network. Explorer links open your local node and only work on this computer. On devnet they open the public explorer for anyone.</p>
      ) : (
        <p className="text-xs text-text-2">Solana devnet. Anyone can open these links and check the vault balance and every deposit and cash out.</p>
      )}
    </div>
  );
}
