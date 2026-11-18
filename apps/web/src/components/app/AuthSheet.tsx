'use client';
import { useEffect, useState } from 'react';
import { Sheet, Button, Mascot } from '@/components/ui';
import { useSession } from './Providers';
import { guestWallet } from '@/lib/wallet';
import { chainConfig, startGoogleLogin } from '@/lib/chain';

function GoogleG() {
  return (
    <svg viewBox="0 0 48 48" className="size-5" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

export function AuthSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { signIn, toast } = useSession();
  const [busy, setBusy] = useState<string | null>(null);
  const [google, setGoogle] = useState<boolean | null>(null);

  useEffect(() => {
    if (open) chainConfig().then((c) => setGoogle(!!c.googleClientId), () => setGoogle(false));
  }, [open]);

  const guest = async () => {
    setBusy('guest');
    try {
      await signIn(guestWallet(true)!);
      onClose();
    } catch (e: any) {
      toast(e?.message ?? 'Sign in did not work. Please try again.', 'error');
    } finally {
      setBusy(null);
    }
  };

  const withGoogle = async () => {
    setBusy('google');
    try {
      const started = await startGoogleLogin(location.pathname === '/' ? '/play' : location.pathname);
      if (!started) {
        setGoogle(false);
        setBusy(null);
      }
      // On success the page goes to Google, so the button stays busy.
    } catch (e: any) {
      toast(e?.message ?? 'Google sign in did not start. Please try again.', 'error');
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
        <div className="relative flex h-32 items-end justify-center overflow-hidden" aria-hidden>
          <span className="absolute bottom-0 size-44 rounded-full bg-accent/25 blur-3xl" />
          <Mascot pose="neutral" className="relative -mb-3 size-36" priority />
        </div>
      }
    >
      <p className="mb-5 text-text-2">Pull up a chair. Create your account in one tap. We make a Sui wallet for you, so you do not need to know anything about crypto. Cold Call pays every network fee.</p>

      <Button size="lg" full loading={busy === 'google'} disabled={!!busy || google === false} onClick={withGoogle}>
        <span className="grid size-7 place-items-center rounded-full bg-white">
          <GoogleG />
        </span>
        Continue with Google
      </Button>
      <p className="mt-2 text-center text-sm text-text-2">
        {google === false ? 'Google sign in is not switched on here yet. Use a wallet on this device for now.' : 'Your Google account becomes your wallet. No passwords, no seed phrase.'}
      </p>

      <div className="my-5 flex items-center gap-3 text-sm text-text-2">
        <span className="h-px flex-1 bg-[var(--well-line)]" />
        or
        <span className="h-px flex-1 bg-[var(--well-line)]" />
      </div>

      <Button variant="secondary" size="lg" full loading={busy === 'guest'} disabled={!!busy} onClick={guest}>
        Play with a wallet on this device
      </Button>
      <p className="mt-2 text-center text-sm text-text-2">Quick account kept in this browser only. If you clear it, the account is gone.</p>

      <p className="mt-6 text-xs leading-relaxed text-text-2">
        By continuing you confirm you are 18 or older. Cold Call is a devnet beta: LOFI and SUI here are test coins with no real value.{' '}
        <a className="font-semibold text-primary" href="/how-it-works">
          How it works
        </a>
        ,{' '}
        <a className="font-semibold text-primary" href="/terms">
          Terms
        </a>{' '}
        and{' '}
        <a className="font-semibold text-primary" href="/privacy">
          Privacy
        </a>
        .
      </p>
    </Sheet>
  );
}
