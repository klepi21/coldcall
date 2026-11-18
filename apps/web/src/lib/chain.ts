'use client';
import type { Currency } from '@coldcall/shared';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { generateNonce, generateRandomness } from '@mysten/sui/zklogin';
import type { CcWallet } from './wallet';
import { loadZk, savePending } from './wallet';
import { api } from './api';

export interface ChainCfg {
  network: string;
  packageId: string;
  faucetId: string;
  vaults: Record<Currency, string>;
  coinTypes: Record<Currency, string>;
  gameAddress: string;
  googleClientId: string | null;
  termsVersion: string;
}

let cfg: Promise<ChainCfg> | null = null;
export function chainConfig() {
  if (!cfg) cfg = api<ChainCfg>('/api/config').catch((e) => ((cfg = null), Promise.reject(e)));
  return cfg;
}

let epochCache: { at: number; epoch: number } | null = null;
export async function currentEpoch(): Promise<number> {
  if (epochCache && Date.now() - epochCache.at < 60_000) return epochCache.epoch;
  const r = await api<{ epoch: number }>('/api/chain/epoch');
  epochCache = { at: Date.now(), epoch: r.epoch };
  return r.epoch;
}

export class NeedsGoogleAgain extends Error {}

/**
 * The server built `bytes` (user is the sender, Cold Call pays the network fee). Sign them in this
 * browser and hand them back; the server adds its fee signature and sends them to the network.
 */
export async function signAndSubmit(wallet: CcWallet, bytes: string) {
  if (wallet.kind === 'zklogin') {
    const zk = loadZk();
    if (!zk || (await currentEpoch()) > zk.maxEpoch) throw new NeedsGoogleAgain('Your Google sign in on this device has run out. Sign in with Google again to approve this, it takes a few seconds.');
  }
  const signature = await wallet.signTransaction(bytes);
  return api<{ digest: string; kind: string; credited: number; currency: Currency | null }>('/api/wallet/submit', { bytes, signature });
}

export function suiscan(kind: 'tx' | 'account' | 'object' | 'coin', id: string, network = 'devnet') {
  return `https://suiscan.xyz/${network}/${kind}/${id}`;
}

/** Start the Google zkLogin redirect. Returns false (and does nothing) if Google is not set up. */
export async function startGoogleLogin(returnTo = '/play'): Promise<boolean> {
  const c = await chainConfig();
  if (!c.googleClientId) return false;
  const epoch = await currentEpoch();
  const kp = new Ed25519Keypair();
  const maxEpoch = epoch + 2;
  const randomness = generateRandomness();
  const nonce = generateNonce(kp.getPublicKey(), maxEpoch, randomness);
  savePending({ ephemeral: kp.getSecretKey(), maxEpoch, randomness, nonce, returnTo });
  const p = new URLSearchParams({
    client_id: c.googleClientId,
    response_type: 'id_token',
    redirect_uri: `${location.origin}/auth/google`,
    scope: 'openid email profile',
    nonce,
    prompt: 'select_account',
  });
  location.assign(`https://accounts.google.com/o/oauth2/v2/auth?${p}`);
  return true;
}
