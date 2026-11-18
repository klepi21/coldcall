'use client';
/**
 * Wallet layer. Three ways to hold a Solana wallet:
 *  1. Guest wallet: a key created in this browser (the stand-in for an embedded wallet on devnet).
 *  2. Browser wallet: Phantom, Solflare or any Wallet Standard extension.
 *  3. Privy (email or Google login with an embedded wallet), when NEXT_PUBLIC_PRIVY_APP_ID is set.
 * The rest of the app only sees the EvensWallet interface.
 */
import { Keypair, Transaction, VersionedTransaction, PublicKey } from '@solana/web3.js';
import nacl from 'tweetnacl';
import bs58 from 'bs58';

export interface EvensWallet {
  kind: 'embedded' | 'external' | 'privy';
  label: string;
  address: string;
  signMessage(msg: Uint8Array): Promise<Uint8Array>;
  signTransaction(tx: Transaction): Promise<Transaction>;
  disconnect(): Promise<void>;
}

const GUEST_KEY = 'evens:guest-wallet:v1';

export function hasGuestWallet() {
  try {
    return !!localStorage.getItem(GUEST_KEY);
  } catch {
    return false;
  }
}

export function guestWallet(create = true): EvensWallet | null {
  let kp: Keypair;
  try {
    const raw = localStorage.getItem(GUEST_KEY);
    if (raw) kp = Keypair.fromSecretKey(bs58.decode(raw));
    else if (create) {
      kp = Keypair.generate();
      localStorage.setItem(GUEST_KEY, bs58.encode(kp.secretKey));
    } else return null;
  } catch {
    return null;
  }
  return {
    kind: 'embedded',
    label: 'Wallet on this device',
    address: kp.publicKey.toBase58(),
    signMessage: async (m) => nacl.sign.detached(m, kp.secretKey),
    signTransaction: async (t) => {
      t.partialSign(kp);
      return t;
    },
    disconnect: async () => {},
  };
}

/** Export the guest key so the user can move it into Phantom. Shown behind a warning. */
export function exportGuestKey(): string | null {
  try {
    return localStorage.getItem(GUEST_KEY);
  } catch {
    return null;
  }
}

// ---- Wallet Standard (Phantom, Solflare, Backpack...) ----
interface StdWallet {
  name: string;
  icon: string;
  accounts: { address: string; publicKey: Uint8Array }[];
  features: Record<string, any>;
}

export function detectBrowserWallets(): Promise<StdWallet[]> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') return resolve([]);
    const found: StdWallet[] = [];
    const register = (...ws: StdWallet[]) => {
      for (const w of ws) if (w.features['solana:signTransaction'] && w.features['standard:connect'] && !found.some((f) => f.name === w.name)) found.push(w);
    };
    const api = { register };
    window.addEventListener('wallet-standard:register-wallet', (e: any) => e.detail?.(api));
    window.dispatchEvent(new CustomEvent('wallet-standard:app-ready', { detail: api }));
    setTimeout(() => resolve(found), 250);
  });
}

export async function connectBrowserWallet(w: StdWallet): Promise<EvensWallet> {
  const { accounts } = await w.features['standard:connect'].connect();
  const account = accounts[0] ?? w.accounts[0];
  if (!account) throw new Error('No account was shared by the wallet.');
  const chain = 'solana:devnet';
  return {
    kind: 'external',
    label: w.name,
    address: account.address,
    signMessage: async (message) => {
      const f = w.features['solana:signMessage'];
      if (!f) throw new Error('This wallet cannot sign messages.');
      const [out] = await f.signMessage({ account, message });
      return out.signature;
    },
    signTransaction: async (t) => {
      const bytes = t.serialize({ requireAllSignatures: false, verifySignatures: false });
      const [out] = await w.features['solana:signTransaction'].signTransaction({ account, transaction: bytes, chain });
      const signed = out.signedTransaction as Uint8Array;
      try {
        return Transaction.from(signed);
      } catch {
        const v = VersionedTransaction.deserialize(signed);
        const legacy = Transaction.from(Buffer.from(bytes));
        legacy.addSignature(new PublicKey(account.address), Buffer.from(v.signatures[0]!));
        return legacy;
      }
    },
    disconnect: async () => {
      await w.features['standard:disconnect']?.disconnect?.();
    },
  };
}

export const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? '';
