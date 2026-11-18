'use client';
/**
 * Email and Google sign in through Privy, with an embedded Solana wallet made for every new user.
 * The rest of the app only sees the EvensWallet interface, so deposits and cash outs work the same
 * as with the guest wallet or Phantom. Without NEXT_PUBLIC_PRIVY_APP_ID this layer is a no-op.
 */
import { createContext, useCallback, useContext, useEffect, useRef, type ReactNode } from 'react';
import { PrivyProvider, usePrivy, useLogin } from '@privy-io/react-auth';
import { useWallets, useSignMessage, useSignTransaction, type ConnectedStandardSolanaWallet } from '@privy-io/react-auth/solana';
import { Transaction } from '@solana/web3.js';
import { PRIVY_APP_ID, type EvensWallet } from '@/lib/wallet';

interface PrivyApi {
  available: boolean;
  /** Opens the Privy email / Google modal and resolves with the user's embedded wallet. */
  start: () => Promise<EvensWallet>;
}
const Ctx = createContext<PrivyApi>({ available: false, start: async () => Promise.reject(new Error('Email sign in is not set up.')) });
export const usePrivyLogin = () => useContext(Ctx);

export function PrivyLayer({ children, onWallet }: { children: ReactNode; onWallet: (w: EvensWallet) => void }) {
  if (!PRIVY_APP_ID) return <>{children}</>;
  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        loginMethods: ['email', 'google'],
        appearance: { theme: 'dark', accentColor: '#C6FF3D', walletChainType: 'solana-only', landingHeader: 'Sign in to Evens', showWalletLoginFirst: false },
        embeddedWallets: { solana: { createOnLogin: 'users-without-wallets' }, showWalletUIs: false },
      }}
    >
      <Bridge onWallet={onWallet}>{children}</Bridge>
    </PrivyProvider>
  );
}

function Bridge({ children, onWallet }: { children: ReactNode; onWallet: (w: EvensWallet) => void }) {
  const pending = useRef<{ resolve: (w: EvensWallet) => void; reject: (e: Error) => void } | null>(null);
  const { ready, authenticated, logout } = usePrivy();
  const { login } = useLogin({
    onError: () => {
      pending.current?.reject(new Error('Sign in was cancelled.'));
      pending.current = null;
    },
  });
  const { wallets, ready: walletsReady } = useWallets();
  const { signMessage } = useSignMessage();
  const { signTransaction } = useSignTransaction();

  // Keep the latest hook functions in refs so the wallet object stays valid across renders.
  const fns = useRef({ signMessage, signTransaction, logout });
  fns.current = { signMessage, signTransaction, logout };

  const toEvens = useCallback((w: ConnectedStandardSolanaWallet): EvensWallet => {
    const quiet = { uiOptions: { showWalletUIs: false } } as const;
    return {
      kind: 'privy',
      label: 'Evens wallet (email)',
      address: w.address,
      signMessage: async (message) => (await fns.current.signMessage({ message, wallet: w, options: quiet })).signature,
      signTransaction: async (t: Transaction) => {
        const bytes = t.serialize({ requireAllSignatures: false, verifySignatures: false });
        const { signedTransaction } = await fns.current.signTransaction({ transaction: new Uint8Array(bytes), wallet: w, options: quiet });
        return Transaction.from(signedTransaction);
      },
      disconnect: async () => {
        await fns.current.logout();
      },
    };
  }, []);

  const embedded = wallets.find((w) => (w as { walletClientType?: string }).walletClientType === 'privy' || w.standardWallet?.name?.toLowerCase().includes('privy')) ?? wallets[0];

  // Resolve a pending sign in once Privy has a wallet for the user.
  useEffect(() => {
    if (!ready || !authenticated || !walletsReady || !embedded) return;
    const w = toEvens(embedded);
    if (pending.current) {
      pending.current.resolve(w);
      pending.current = null;
    } else onWallet(w); // returning visit: give the session its signer back
  }, [ready, authenticated, walletsReady, embedded, toEvens, onWallet]);

  const start = useCallback(
    () =>
      new Promise<EvensWallet>((resolve, reject) => {
        if (authenticated && embedded) return resolve(toEvens(embedded));
        pending.current = { resolve, reject };
        login();
        // If the modal is closed without signing in, stop waiting after a while.
        setTimeout(() => {
          if (pending.current?.resolve === resolve) {
            pending.current = null;
            reject(new Error('Sign in was cancelled.'));
          }
        }, 5 * 60_000);
      }),
    [authenticated, embedded, login, toEvens],
  );

  return <Ctx.Provider value={{ available: ready, start }}>{children}</Ctx.Provider>;
}
