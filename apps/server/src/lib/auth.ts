/**
 * Sign in. Two ways, both ending in our own httpOnly session cookie:
 *  1. Google (zkLogin): the browser sends a Google id_token. We verify it (RS256, Google keys, audience,
 *     issuer, expiry), derive a stable salt from a server secret, and compute the player's Sui address
 *     ourselves with jwtToAddress. The session is keyed by the Google account id and that address.
 *  2. Guest wallet: an Ed25519 key made in the browser signs a one time message.
 */
import { createHmac, createPublicKey, createVerify, randomBytes } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { verifyPersonalMessageSignature } from '@mysten/sui/verify';
import { Ed25519PublicKey } from '@mysten/sui/keypairs/ed25519';
import { jwtToAddress, generateNonce } from '@mysten/sui/zklogin';
import { fromBase64 } from '@mysten/sui/utils';
import { pool, q, one, maybe } from '../db/pool';
import { env, isProd } from '../env';

export const COOKIE = 'cc_sid';
export const TERMS_VERSION = '2026-11-18-coldcall';

const isAddress = (a: string) => /^0x[0-9a-f]{64}$/.test(a);

export function signInMessage(address: string, nonce: string, issuedAt: string) {
  return [
    'Cold Call wants you to sign in with your Sui account:',
    address,
    '',
    'Sign in to play. This does not cost anything and does not move any money.',
    '',
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt}`,
  ].join('\n');
}

export async function createNonce(address: string) {
  if (!isAddress(address)) throw new Error('bad address');
  const nonce = randomBytes(16).toString('hex');
  const issuedAt = new Date().toISOString();
  await q(pool, `insert into auth_nonces(nonce, address, expires_at) values ($1,$2, now() + interval '10 minutes')`, [nonce, address]);
  return { nonce, message: signInMessage(address, nonce, issuedAt), issuedAt };
}

async function grantAdminIfListed(user: any) {
  const admins = env.ADMIN_WALLETS.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (admins.includes(user.wallet_address) && user.role !== 'admin') {
    await q(pool, `update users set role='admin' where id=$1`, [user.id]);
    user.role = 'admin';
  }
}

async function newSession(user: any) {
  await grantAdminIfListed(user);
  const sid = randomBytes(32).toString('hex');
  await q(pool, `insert into sessions(id, user_id, expires_at) values ($1,$2, now() + ($3 || ' days')::interval)`, [sid, user.id, String(env.SESSION_DAYS)]);
  return { user, sid };
}

/** Guest wallet sign in: the browser key signs our one time message as a Sui personal message. */
export async function verifyGuestSignIn(address: string, nonce: string, issuedAt: string, signature: string) {
  if (!isAddress(address)) return null;
  const row = await maybe<any>(
    pool,
    `update auth_nonces set used=true where nonce=$1 and address=$2 and used=false and expires_at > now() returning nonce`,
    [nonce, address],
  );
  if (!row) return null;
  try {
    await verifyPersonalMessageSignature(new TextEncoder().encode(signInMessage(address, nonce, issuedAt)), signature, { address });
  } catch {
    return null;
  }
  const existing = await maybe<any>(pool, `select * from users where wallet_address=$1`, [address]);
  if (existing && existing.wallet_kind !== 'guest') return null; // a zkLogin address only signs in through Google
  const user =
    existing ??
    (await one<any>(pool, `insert into users(wallet_address, wallet_kind, display_name) values ($1,'guest',$2) returning *`, [address, `Player ${address.slice(2, 6)}`]));
  return newSession(user);
}

// ---------- Google id_token ----------

interface Jwk {
  kid: string;
  kty: string;
  n: string;
  e: string;
  alg?: string;
}
let jwks: { at: number; keys: Jwk[] } | null = null;
async function googleKeys(force = false): Promise<Jwk[]> {
  if (!force && jwks && Date.now() - jwks.at < 3600_000) return jwks.keys;
  const r = await fetch('https://www.googleapis.com/oauth2/v3/certs', { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`Google keys HTTP ${r.status}`);
  const j = (await r.json()) as { keys: Jwk[] };
  jwks = { at: Date.now(), keys: j.keys };
  return j.keys;
}

const b64url = (s: string) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

export interface GoogleClaims {
  iss: string;
  aud: string;
  sub: string;
  exp: number;
  iat: number;
  nonce?: string;
  email?: string;
  name?: string;
}

export class AuthError extends Error {}

/** Verifies a Google id_token: RS256 signature with Google's keys, audience, issuer and expiry. */
export async function verifyGoogleIdToken(jwt: string, keys?: Jwk[]): Promise<GoogleClaims> {
  if (!env.GOOGLE_CLIENT_ID) throw new AuthError('Google sign in is not set up on this server yet.');
  const parts = jwt.split('.');
  if (parts.length !== 3) throw new AuthError('That Google sign in was not valid.');
  const header = JSON.parse(b64url(parts[0]!).toString('utf8')) as { alg: string; kid: string };
  if (header.alg !== 'RS256') throw new AuthError('That Google sign in was not valid.');
  let set = keys ?? (await googleKeys());
  let jwk = set.find((k) => k.kid === header.kid);
  if (!jwk && !keys) {
    set = await googleKeys(true);
    jwk = set.find((k) => k.kid === header.kid);
  }
  if (!jwk) throw new AuthError('That Google sign in was not valid.');
  const key = createPublicKey({ key: { kty: jwk.kty, n: jwk.n, e: jwk.e }, format: 'jwk' });
  const ok = createVerify('RSA-SHA256').update(`${parts[0]}.${parts[1]}`).verify(key, b64url(parts[2]!));
  if (!ok) throw new AuthError('That Google sign in was not valid.');
  const c = JSON.parse(b64url(parts[1]!).toString('utf8')) as GoogleClaims;
  if (c.iss !== 'https://accounts.google.com' && c.iss !== 'accounts.google.com') throw new AuthError('That sign in did not come from Google.');
  if (c.aud !== env.GOOGLE_CLIENT_ID) throw new AuthError('That Google sign in was meant for another app.');
  const now = Math.floor(Date.now() / 1000);
  if (typeof c.exp !== 'number' || c.exp < now - 30) throw new AuthError('That Google sign in has expired. Please try again.');
  if (!c.sub) throw new AuthError('That Google sign in was not valid.');
  return c;
}

/**
 * Stable zkLogin salt per Google account: HMAC(ZK_SALT_SECRET, iss|aud|sub), cut to 128 bits as zkLogin
 * requires. Same account, same salt, same address, on every device.
 */
export function zkSalt(c: Pick<GoogleClaims, 'iss' | 'aud' | 'sub'>): string {
  if (!env.ZK_SALT_SECRET) throw new AuthError('Google sign in is not set up on this server yet.');
  // Google sends the issuer with or without the scheme; one account must always get one salt.
  const iss = c.iss === 'accounts.google.com' ? 'https://accounts.google.com' : c.iss;
  const h = createHmac('sha256', env.ZK_SALT_SECRET).update(`${iss}|${c.aud}|${c.sub}`).digest();
  return BigInt(`0x${h.subarray(0, 16).toString('hex')}`).toString();
}

/**
 * Google sign in. When the browser also sends its ephemeral key, max epoch and randomness, we check the
 * token's nonce was made from them, so this token belongs to this sign in.
 */
export async function verifyGoogleSignIn(
  jwt: string,
  bind?: { ephemeralPublicKey: string; maxEpoch: number; randomness: string },
) {
  const c = await verifyGoogleIdToken(jwt);
  if (bind) {
    const pk = new Ed25519PublicKey(fromBase64(bind.ephemeralPublicKey));
    if (generateNonce(pk, bind.maxEpoch, bind.randomness) !== c.nonce) throw new AuthError('That Google sign in did not match this browser. Please try again.');
  }
  const salt = zkSalt(c);
  const address = jwtToAddress(jwt, salt, false);
  let user = await maybe<any>(pool, `select * from users where google_sub=$1`, [c.sub]);
  if (!user) {
    const name = (c.name ?? '').replace(/[^\p{L}\p{N} _.]/gu, '').trim().slice(0, 20);
    user = await one<any>(
      pool,
      `insert into users(wallet_address, wallet_kind, google_sub, display_name) values ($1,'zklogin',$2,$3)
       on conflict (wallet_address) do update set google_sub = excluded.google_sub returning *`,
      [address, c.sub, name.length >= 2 ? name : `Player ${address.slice(2, 6)}`],
    );
  } else if (user.wallet_address !== address) {
    throw new AuthError('Your Google account maps to a different wallet than before. Please contact support.');
  }
  const s = await newSession(user);
  return { ...s, salt, address };
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

export function publicUser(u: any, limits: Record<string, { depositDaily: number | null; lossDaily: number | null; lossWeekly: number | null; pending: unknown }> = {}) {
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
    limits,
    cooloffUntil: u.cooloff_until,
    excludedUntil: u.excluded_until,
    createdAt: u.created_at,
  };
}
