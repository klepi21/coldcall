'use client';
import { Buffer } from 'buffer';
import { Connection, Transaction } from '@solana/web3.js';
import type { EvensWallet } from './wallet';
import { api } from './api';

let conn: Connection | null = null;
let cfg: { rpc: string; cluster: string; vault: string; mint: string; programId: string } | null = null;

export async function chainConfig() {
  if (!cfg) cfg = await api('/api/config');
  return cfg!;
}

async function connection() {
  if (!conn) conn = new Connection((await chainConfig()).rpc, 'confirmed');
  return conn;
}

/** Sign a server-built transaction with the user's wallet and send it to the network. */
export async function signAndSend(wallet: EvensWallet, b64: string): Promise<string> {
  const tx = Transaction.from(Buffer.from(b64, 'base64'));
  const signed = await wallet.signTransaction(tx);
  const c = await connection();
  const sig = await c.sendRawTransaction(signed.serialize());
  const latest = await c.getLatestBlockhash();
  await c.confirmTransaction({ signature: sig, ...latest }, 'confirmed');
  return sig;
}

export async function explorerUrl(kind: 'tx' | 'address', value: string) {
  const c = await chainConfig();
  const cluster = c.cluster === 'devnet' ? '?cluster=devnet' : `?cluster=custom&customUrl=${encodeURIComponent(c.rpc)}`;
  return `https://explorer.solana.com/${kind}/${value}${cluster}`;
}
