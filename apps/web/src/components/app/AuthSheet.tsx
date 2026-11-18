'use client';
import { useEffect, useState } from 'react';
import { Sheet, Button, Spinner, Logo } from '@/components/ui';
import { useSession } from './Providers';
import { usePrivyLogin } from './PrivyLayer';
import { guestWallet, detectBrowserWallets, connectBrowserWallet, PRIVY_APP_ID } from '@/lib/wallet';

export function AuthSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { signIn, toast } = useSession();
  const privy = usePrivyLogin();
  const [busy, setBusy] = useState<string | null>(null);
  const [browserWallets, setBrowserWallets] = useState<Awaited<ReturnType<typeof detectBrowserWallets>>>([]);
  const [more, setMore] = useState(false);

  useEffect(() => {
    if (open) detectBrowserWallets().then(setBrowserWallets);
  }, [open]);

  const run = async (id: string, fn: () => Promise<unknown>) => {
    setBusy(id);
    try {
      await fn();
      onClose();
    } catch (e: any) {
      toast(e?.message?.includes('rejected') ? 'Sign in was cancelled in your wallet.' : e?.message ?? 'Sign in did not work. Please try again.', 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Start playing"
      tint="var(--accent)"
      header={
        <div className="relative flex h-28 items-center justify-center overflow-hidden" aria-hidden>
          <span className="absolute size-40 rounded-full bg-accent/30 blur-3xl" />
          <span className="w-spin absolute size-24 rounded-full opacity-80" style={{ background: 'conic-gradient(from 0deg, #c6ff3d, #3ddcff, #ff4d8d, #ff8a3d, #c6ff3d)', ['--dur' as string]: '9s', WebkitMask: 'radial-gradient(closest-side, transparent 86%, #000 88%)', mask: 'radial-gradient(closest-side, transparent 86%, #000 88%)' }} />
          <Logo className="relative size-14" />
        </div>
      }
    >
      <p className="mb-5 text-text-2">Create your account in one tap. We make a secure wallet for you, so you do not need to know anything about crypto.</p>

      {PRIVY_APP_ID ? (
        <>
          <Button size="lg" full loading={busy === 'privy'} disabled={!privy.available || !!busy} onClick={() => run('privy', async () => signIn(await privy.start()))}>
            Continue with email or Google
          </Button>
          <p className="mt-2 text-center text-sm text-text-2">We make a secure wallet for you. No passwords, no seed phrase.</p>
          <Button variant="secondary" size="lg" full className="mt-3" loading={busy === 'guest'} disabled={!!busy} onClick={() => run('guest', () => signIn(guestWallet(true)!))}>
            Create my account
          </Button>
          <p className="mt-2 text-center text-sm text-text-2">Quick account kept on this device only.</p>
        </>
      ) : (
        <>
          <Button size="lg" full loading={busy === 'guest'} onClick={() => run('guest', () => signIn(guestWallet(true)!))}>
            Create my account
          </Button>
          <p className="mt-2 text-center text-sm text-text-2">Free to start. You get test money on devnet.</p>
        </>
      )}

      <div className="my-5 flex items-center gap-3 text-sm text-text-2">
        <span className="h-px flex-1 bg-[var(--well-line)]" />
        or
        <span className="h-px flex-1 bg-[var(--well-line)]" />
      </div>

      <button type="button" onClick={() => setMore((m) => !m)} aria-expanded={more} className="btn-secondary press flex w-full items-center justify-between rounded-chip px-4 py-3 text-left font-semibold">
        I already have a Solana wallet
        <span className="text-text-2" aria-hidden>
          {more ? '−' : '+'}
        </span>
      </button>
      {more ? (
        <div className="mt-3 space-y-2">
          {browserWallets.length === 0 ? (
            <p className="well rounded-chip p-4 text-sm text-text-2">
              We did not find a wallet in this browser. Install Phantom or Solflare, set it to devnet, then reload this page.
            </p>
          ) : (
            browserWallets.map((w) => (
              <button
                key={w.name}
                type="button"
                disabled={!!busy}
                onClick={() => run(w.name, async () => signIn(await connectBrowserWallet(w)))}
                className="btn-secondary press flex w-full items-center gap-3 rounded-chip px-4 py-3 text-left font-semibold disabled:opacity-50"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={w.icon} alt="" className="size-7 rounded-md" />
                {w.name}
                {busy === w.name ? <Spinner className="ml-auto size-4" /> : null}
              </button>
            ))
          )}
          <p className="text-xs text-text-2">Your wallet asks you to sign a short message. Signing in never moves money.</p>
        </div>
      ) : null}

      <p className="mt-6 text-xs leading-relaxed text-text-2">
        By continuing you confirm you are 18 or older. Evens is a devnet beta: all money here is test money with no real value.{' '}
        <a className="font-semibold text-primary" href="/how-it-works">
          How it works
        </a>
      </p>
    </Sheet>
  );
}
