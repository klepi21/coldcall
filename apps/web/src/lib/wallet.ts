'use client';
/**
 * Wallet layer. Two ways to hold a Sui wallet, both signing locally in this browser:
 *  1. Google (zkLogin): a short lived key made in the browser plus a zero knowledge proof of the
 *     Google sign in. The address comes from the Google account and a salt the server keeps stable.
 *  2. Guest wallet: an Ed25519 key kept in this browser only.
 * The server builds every transaction and pays its network fee. The wallet only signs the bytes.
 */
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { fromBase64, toBase64 } from '@mysten/sui/utils';
import { genAddressSeed, getZkLoginSignature, decodeJwt } from '@mysten/sui/zklogin';

export interface CcWallet {
  kind: 'guest' | 'zklogin';
  label: string;
  address: string;
  /** Sign server built transaction bytes (base64). Returns a serialized Sui signature. */
  signTransaction(bytesB64: string): Promise<string>;
  /** Guest only: sign the sign in message. */
  signPersonalMessage?(msg: Uint8Array): Promise<string>;
  disconnect(): Promise<void>;
}

const GUEST_KEY = 'coldcall:guest-wallet:v1';
const ZK_KEY = 'coldcall:zk:v1';
const ZK_PENDING = 'coldcall:zk-pending:v1';

const read = (k: string, store: 'local' | 'session' = 'local') => {
  try {
    return (store === 'local' ? localStorage : sessionStorage).getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string | null, store: 'local' | 'session' = 'local') => {
  try {
    const s = store === 'local' ? localStorage : sessionStorage;
    if (v === null) s.removeItem(k);
    else s.setItem(k, v);
  } catch {
    /* private mode: the wallet then lives for this page only */
  }
};

// ---------- guest ----------

export function hasGuestWallet() {
  return !!read(GUEST_KEY);
}

export function guestWallet(create = true): CcWallet | null {
  let kp: Ed25519Keypair;
  try {
    const raw = read(GUEST_KEY);
    if (raw) kp = Ed25519Keypair.fromSecretKey(raw);
    else if (create) {
      kp = new Ed25519Keypair();
      write(GUEST_KEY, kp.getSecretKey());
    } else return null;
  } catch {
    return null;
  }
  return {
    kind: 'guest',
    label: 'Wallet on this device',
    address: kp.toSuiAddress(),
    signTransaction: async (b64) => (await kp.signTransaction(fromBase64(b64))).signature,
    signPersonalMessage: async (m) => (await kp.signPersonalMessage(m)).signature,
    disconnect: async () => {},
  };
}

/** The guest key (suiprivkey...), so the player can move it into a Sui wallet app. Shown behind a warning. */
export function exportGuestKey(): string | null {
  return read(GUEST_KEY);
}

// ---------- Google zkLogin ----------

export interface ZkPending {
  ephemeral: string; // suiprivkey
  maxEpoch: number;
  randomness: string;
  nonce: string;
  returnTo: string;
}
export interface ZkSession {
  ephemeral: string;
  maxEpoch: number;
  randomness: string;
  jwt: string;
  salt: string;
  address: string;
  proof: ZkProof;
}
export interface ZkProof {
  proofPoints: { a: string[]; b: string[][]; c: string[] };
  issBase64Details: { value: string; indexMod4: number };
  headerBase64: string;
}

export const savePending = (p: ZkPending) => write(ZK_PENDING, JSON.stringify(p), 'session');
export const takePending = (): ZkPending | null => {
  const raw = read(ZK_PENDING, 'session');
  write(ZK_PENDING, null, 'session');
  try {
    return raw ? (JSON.parse(raw) as ZkPending) : null;
  } catch {
    return null;
  }
};
export const saveZk = (s: ZkSession | null) => write(ZK_KEY, s ? JSON.stringify(s) : null);
export function loadZk(): ZkSession | null {
  try {
    const raw = read(ZK_KEY);
    return raw ? (JSON.parse(raw) as ZkSession) : null;
  } catch {
    return null;
  }
}

/** Wallet from a stored zkLogin session, or null if there is none. Expiry is checked when signing. */
export function zkWallet(s: ZkSession | null = loadZk()): CcWallet | null {
  if (!s) return null;
  const kp = Ed25519Keypair.fromSecretKey(s.ephemeral);
  const claims = decodeJwt(s.jwt);
  const aud = Array.isArray(claims.aud) ? claims.aud[0]! : claims.aud;
  const addressSeed = genAddressSeed(BigInt(s.salt), 'sub', claims.sub, aud).toString();
  return {
    kind: 'zklogin',
    label: 'Google account',
    address: s.address,
    signTransaction: async (b64) => {
      const { signature: userSignature } = await kp.signTransaction(fromBase64(b64));
      return getZkLoginSignature({ inputs: { ...s.proof, addressSeed }, maxEpoch: s.maxEpoch, userSignature });
    },
    disconnect: async () => saveZk(null),
  };
}

export const b64 = toBase64;
