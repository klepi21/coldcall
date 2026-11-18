import { randomBytes } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { PublicKey } from '@solana/web3.js';
import { pool, q, one, maybe } from '../db/pool';
import { env, isProd } from '../env';

export const COOKIE = 'evens_sid';
export const TERMS_VERSION = '2026-11-16b';

export function signInMessage(address: string, nonce: string, issuedAt: string) {
  return [
    'Evens wants you to sign in with your Solana account:',
    address,
    '',
    'Sign in to play. This does not cost anything and does not move any money.',
    '',
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt}`,
  ].join('\n');
}

export async function createNonce(address: string) {
  new PublicKey(address); // validates
  const nonce = randomBytes(16).toString('hex');
  const issuedAt = new Date().toISOString();
  await q(pool, `insert into auth_nonces(nonce, address, expires_at) values ($1,$2, now() + interval '10 minutes')`, [nonce, address]);
  return { nonce, message: signInMessage(address, nonce, issuedAt), issuedAt };
}

export async function verifySignIn(address: string, nonce: string, issuedAt: string, signatureB58: string, walletKind: string) {
  const row = await maybe<any>(
    pool,
    `update auth_nonces set used=true where nonce=$1 and address=$2 and used=false and expires_at > now() returning nonce`,
    [nonce, address],
  );
  if (!row) return null;
  const msg = new TextEncoder().encode(signInMessage(address, nonce, issuedAt));
  const ok = nacl.sign.detached.verify(msg, bs58.decode(signatureB58), new PublicKey(address).toBytes());
  if (!ok) return null;
  const kind = ['external', 'embedded', 'privy'].includes(walletKind) ? walletKind : 'external';
  const user = await one<any>(
    pool,
    `insert into users(wallet_address, wallet_kind, display_name) values ($1,$2,$3)
     on conflict (wallet_address) do update set wallet_kind = users.wallet_kind
     returning *`,
    [address, kind, `Player ${address.slice(0, 4)}`],
  );
  const admins = env.ADMIN_WALLETS.split(',').map((s) => s.trim()).filter(Boolean);
  if (admins.includes(address) && user.role !== 'admin') {
    await q(pool, `update users set role='admin' where id=$1`, [user.id]);
    user.role = 'admin';
  }
  const sid = randomBytes(32).toString('hex');
  await q(pool, `insert into sessions(id, user_id, expires_at) values ($1,$2, now() + ($3 || ' days')::interval)`, [sid, user.id, String(env.SESSION_DAYS)]);
  return { user, sid };
}

export function setSessionCookie(reply: FastifyReply, sid: string) {
  reply.setCookie(COOKIE, sid, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    maxAge: env.SESSION_DAYS * 86400,
  });
}

export async function sessionUser(sid: string | undefined): Promise<any | null> {
  if (!sid || !/^[0-9a-f]{64}$/.test(sid)) return null;
  return maybe(pool, `select u.* from sessions s join users u on u.id = s.user_id where s.id=$1 and s.expires_at > now()`, [sid]);
}

declare module 'fastify' {
  interface FastifyRequest {
    user: any | null;
  }
}

export async function requireUser(req: FastifyRequest, reply: FastifyReply) {
  if (!req.user) return reply.code(401).send({ error: 'signed_out', message: 'Please sign in first.' });
}
export async function requireAdmin(req: FastifyRequest, reply: FastifyReply) {
  if (req.user?.role !== 'admin') return reply.code(403).send({ error: 'forbidden', message: 'Admins only.' });
}

export function publicUser(u: any) {
  return {
    id: u.id,
    walletAddress: u.wallet_address,
    walletKind: u.wallet_kind,
    displayName: u.display_name,
    avatar: u.avatar,
    role: u.role,
    onboarded: !!(u.age_confirmed_at && u.terms_accepted_at && u.terms_version === TERMS_VERSION),
    ratings: u.ratings,
    settings: u.settings,
    limits: { depositDaily: u.limit_deposit_daily, lossDaily: u.limit_loss_daily, lossWeekly: u.limit_loss_weekly },
    cooloffUntil: u.cooloff_until,
    excludedUntil: u.excluded_until,
    createdAt: u.created_at,
  };
}
