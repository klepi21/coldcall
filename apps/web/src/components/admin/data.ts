'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useSession } from '@/components/app/Providers';

export type GameId = 'chess' | 'backgammon' | 'tichu' | 'seabattle';
export const GAME_IDS: GameId[] = ['chess', 'seabattle', 'backgammon', 'tichu'];
export const GAME_NAME: Record<GameId, string> = { chess: 'Chess', backgammon: 'Backgammon', tichu: 'Tichu', seabattle: 'Ice Floe Battle' };
/** Series colours come from CSS variables scoped in the admin layout, so light theme gets its own validated steps. */
export const GAME_VAR: Record<GameId, string> = { chess: 'var(--s-chess)', backgammon: 'var(--s-backgammon)', tichu: 'var(--s-tichu)', seabattle: 'var(--s-seabattle)' };
export const MODE_NAME: Record<string, string> = { practice: 'Practice', bot: 'Vs bot', pvp: 'Vs people' };

export interface Paged<T> {
  rows: T[];
  total: number;
  page: number;
  limit: number;
}

/**
 * GET an admin endpoint. Every money figure in the admin area belongs to one coin: the coin picked in the
 * header switch is added to every request as `currency`, and switching refetches. Keeps the previous data
 * while a new page loads.
 */
export function useAdmin<T>(rawPath: string | null) {
  const { currency } = useSession();
  const path = rawPath ? `${rawPath}${rawPath.includes('?') ? '&' : '?'}currency=${currency}` : null;
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);
  const load = useCallback(() => {
    if (!path) return;
    const n = ++seq.current;
    setLoading(true);
    setError(null);
    api<T>(path)
      .then((d) => n === seq.current && setData(d))
      .catch((e) => n === seq.current && setError(e.message))
      .finally(() => n === seq.current && setLoading(false));
  }, [path]);
  useEffect(load, [load]);
  return { data, error, loading, reload: load };
}

export function qs(o: Record<string, string | number | undefined | null | false>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null && v !== '' && v !== false) p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
}

/* ---------- formatting ---------- */

export const fmtInt = (n: number) => n.toLocaleString('en-US');
export const fmtPct = (x: number | null | undefined, digits = 1) => (x === null || x === undefined || !Number.isFinite(x) ? 'None yet' : `${(x * 100).toFixed(digits)}%`);
export function fmtDate(s: string | null | undefined) {
  if (!s) return 'Never';
  return new Date(s).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
export function fmtDay(s: string) {
  return new Date(s + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}
export function fmtAgo(s: string | null | undefined) {
  if (!s) return 'Never';
  const ms = Date.now() - new Date(s).getTime();
  const m = Math.round(ms / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 45) return `${d} ${d === 1 ? 'day' : 'days'} ago`;
  return fmtDate(s);
}
export function fmtDuration(secs: number | null | undefined) {
  if (secs === null || secs === undefined || !Number.isFinite(secs)) return 'None';
  const t = Math.round(secs);
  if (t < 60) return `${t}s`;
  const m = Math.floor(t / 60);
  if (m < 60) return `${m}m ${t % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}
export const short = (s: string | null | undefined, a = 4, b = 4) => (!s ? '' : s.length <= a + b + 1 ? s : b > 0 ? `${s.slice(0, a)} ${s.slice(-b)}` : s.slice(0, a));

/* ---------- explorer ---------- */

export interface AdminConfig {
  network: string;
  packageId: string;
  gameAddress: string;
  termsVersion: string;
  limits: Record<'LOFI' | 'SUI', { reviewAbove: number; userDailyWithdraw: number }>;
  botHouseEdge: number;
}
let cfgPromise: Promise<AdminConfig> | null = null;
export function useAdminConfig() {
  const [cfg, setCfg] = useState<AdminConfig | null>(null);
  useEffect(() => {
    cfgPromise ??= api<AdminConfig>('/api/admin/config').catch((e) => {
      cfgPromise = null;
      throw e;
    });
    cfgPromise.then(setCfg).catch(() => {});
  }, []);
  return cfg;
}
/** Suiscan link: wallets are accounts, digests are transactions, vaults and the package are objects. */
export function explorer(cfg: AdminConfig | null, kind: 'address' | 'tx' | 'object', id: string) {
  const k = kind === 'address' ? 'account' : kind;
  return `https://suiscan.xyz/${cfg?.network ?? 'devnet'}/${k}/${id}`;
}

/* ---------- ledger labels ---------- */

export const TX_KIND: Record<string, string> = {
  deposit: 'Deposit',
  withdraw_lock: 'Cash out started',
  withdraw_release: 'Cash out released',
  withdraw_complete: 'Cash out completed',
  game_start: 'Game entry',
  game_settle: 'Game result',
  game_refund: 'Game refund',
  bankroll_fund: 'House funding',
  bankroll_withdraw: 'House money taken out',
  adjustment: 'Adjustment',
};
export const ACCOUNT_KIND: Record<string, string> = {
  user_available: 'Player available',
  user_locked: 'Player locked',
  game_escrow: 'Game escrow',
  house_bankroll: 'House bankroll',
  fee_revenue: 'Fee revenue',
  vault_onchain: 'Vault on chain',
};
export const WD_STATUS: Record<string, string> = {
  review: 'Needs review',
  pending: 'Ticket issued',
  submitted: 'Sent to chain',
  confirmed: 'Paid out',
  expired: 'Expired, released',
  rejected: 'Rejected',
};

/** Filter state mirrored into the URL query (replaceState, no navigation), so links and reloads keep filters. */
export function useUrlState<T extends Record<string, string>>(defaults: T) {
  const [state, setState] = useState<T>(defaults);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const next = { ...defaults };
    for (const k of Object.keys(defaults)) {
      const v = p.get(k);
      if (v !== null) (next as Record<string, string>)[k] = v;
    }
    setState(next);
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const set = useCallback(
    (patch: Partial<T>) => {
      setState((s) => {
        const n = { ...s, ...patch } as T;
        const p = new URLSearchParams();
        for (const [k, v] of Object.entries(n)) if (v && v !== defaults[k]) p.set(k, v);
        const q = p.toString();
        window.history.replaceState(null, '', `${window.location.pathname}${q ? `?${q}` : ''}`);
        return n;
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  return [state, set, ready] as const;
}
