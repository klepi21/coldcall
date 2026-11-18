'use client';
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Button, Card, Sheet, UsdcIcon, Usdc } from '@/components/ui';
import { useSession } from './Providers';
import { chainConfig } from '@/lib/chain';

/**
 * The player's own deposit address is their Evens wallet. Money sent here stays theirs until they
 * tap Add to Evens, which moves it into the vault and credits them. We never show the vault itself
 * as a deposit address, because a plain transfer to the vault cannot be attributed to a player.
 */
export function ReceiveUsdc({ address }: { address: string }) {
  const { toast } = useSession();
  const [open, setOpen] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [cluster, setCluster] = useState('devnet');

  useEffect(() => {
    chainConfig().then((c) => setCluster(c.cluster)).catch(() => {});
  }, []);
  useEffect(() => {
    if (!open) return;
    QRCode.toDataURL(address, { margin: 1, width: 480, color: { dark: '#0a0a0f', light: '#ffffff' } }).then(setQr);
  }, [open, address]);

  const copy = () => {
    navigator.clipboard.writeText(address);
    toast('Your deposit address is copied.');
  };

  return (
    <>
      <Card className="mt-4 p-5" tint="#2775CA">
        <div className="flex items-start gap-3">
          <span className="relative shrink-0">
            <span className="absolute inset-0 rounded-full bg-[#2775CA]/50 blur-lg" aria-hidden />
            <UsdcIcon className="relative size-10" />
          </span>
          <div className="min-w-0">
            <p className="font-semibold">Receive USDC</p>
            <p className="mt-1 text-sm text-text-2">
              Send USDC from an exchange or another wallet to your own Evens address. Then tap Add to Evens to turn it into credits.
            </p>
          </div>
        </div>
        <button onClick={copy} className="well press mt-3 block w-full break-all rounded-chip p-3 text-left font-mono text-xs hover:shadow-[inset_0_0_0_1px_var(--primary)]" aria-label="Copy your deposit address">
          {address}
        </button>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={copy}>
            Copy address
          </Button>
          <Button variant="secondary" onClick={() => setOpen(true)}>
            Show QR code
          </Button>
        </div>
        <p className="mt-3 rounded-[14px] border border-warn/40 bg-warn/10 p-3 text-sm">
          Only send <strong>USDC on the Solana network</strong>. Other tokens or other networks (Ethereum, Tron, BNB) cannot be recovered.
          {cluster === 'devnet' ? ' In this devnet beta, use Get 100 test USDC instead. Real USDC sent here is not supported yet.' : ''}
        </p>
      </Card>

      <Sheet open={open} onClose={() => setOpen(false)} title="Your USDC deposit address" tint="#2775CA">
        <div className="flex flex-col items-center text-center">
          {qr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt="QR code of your deposit address" className="size-56 rounded-card bg-white p-2 shadow-[0_0_0_6px_rgba(39,117,202,0.25),0_20px_50px_-15px_rgba(39,117,202,0.6)]" />
          ) : (
            <div className="shimmer size-56 rounded-card" />
          )}
          <p className="mt-3 flex items-center gap-2 text-sm font-semibold">
            <UsdcIcon className="size-5" /> USDC on Solana{cluster === 'devnet' ? ' devnet' : ''}
          </p>
          <p className="mt-2 break-all font-mono text-xs text-text-2">{address}</p>
          <Button full className="mt-4" onClick={copy}>
            Copy address
          </Button>
          <p className="mt-3 text-xs text-text-2">Scan this with your exchange app or wallet. Choose the Solana network when you withdraw.</p>
        </div>
      </Sheet>
    </>
  );
}

/** Shown when USDC is sitting in the player's wallet but has not been added to Evens yet. */
export function UsdcWaitingBanner({ usdc, onAdd }: { usdc: number; onAdd: () => void }) {
  if (usdc < 0.01) return null;
  return (
    <div className="glass mt-4 flex flex-col gap-3 overflow-hidden rounded-card p-4 sm:flex-row sm:items-center sm:justify-between" style={{ '--tint': 'var(--primary)' } as React.CSSProperties}>
      <span className="spill pointer-events-none absolute inset-0" aria-hidden />
      <p className="relative text-sm">
        You have <Usdc amount={usdc} /> in your wallet, ready to add. That is {(usdc * 100).toLocaleString('en-US', { maximumFractionDigits: 2 })} credits.
      </p>
      <Button size="sm" className="relative" onClick={onAdd}>
        Add to Evens
      </Button>
    </div>
  );
}
