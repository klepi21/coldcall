'use client';
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Button, Card, CoinChip, Sheet } from '@/components/ui';
import { useSession } from './Providers';

/**
 * The player's own Sui address. Coins sent here stay theirs until they tap Add, which moves them into
 * the vault of that coin. We never show a vault as a deposit address: a plain transfer to a vault
 * cannot be matched to a player.
 */
export function ReceiveCoins({ address }: { address: string }) {
  const { toast } = useSession();
  const [open, setOpen] = useState(false);
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => {
    if (open) QRCode.toDataURL(address, { margin: 1, width: 480, color: { dark: '#0a0a0f', light: '#ffffff' } }).then(setQr);
  }, [open, address]);

  const copy = () => {
    navigator.clipboard.writeText(address);
    toast('Your wallet address is copied.');
  };

  return (
    <>
      <Card className="mt-4 p-5" tint="#4DA2FF">
        <div className="flex items-start gap-3">
          <span className="flex shrink-0 -space-x-2">
            <CoinChip currency="LOFI" className="size-9" />
            <CoinChip currency="SUI" className="size-9" />
          </span>
          <div className="min-w-0">
            <p className="font-semibold">Receive coins</p>
            <p className="mt-1 text-sm text-text-2">Send LOFI or SUI from another Sui devnet wallet to your own address below. Then tap Add to move them into Cold Call.</p>
          </div>
        </div>
        <button onClick={copy} className="well press mt-3 block w-full break-all rounded-chip p-3 text-left font-mono text-xs hover:shadow-[inset_0_0_0_1px_var(--primary)]" aria-label="Copy your wallet address">
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
          Only send <strong>LOFI or SUI on Sui devnet</strong>. Coins from other networks cannot be recovered. In this beta the free test coin buttons are the easy way.
        </p>
      </Card>

      <Sheet open={open} onClose={() => setOpen(false)} title="Your Sui address" tint="#4DA2FF">
        <div className="flex flex-col items-center text-center">
          {qr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt="QR code of your wallet address" className="size-56 rounded-card bg-white p-2" />
          ) : (
            <div className="shimmer size-56 rounded-card" />
          )}
          <p className="mt-3 text-sm font-semibold">Sui devnet</p>
          <p className="mt-2 break-all font-mono text-xs text-text-2">{address}</p>
          <Button full className="mt-4" onClick={copy}>
            Copy address
          </Button>
        </div>
      </Sheet>
    </>
  );
}
