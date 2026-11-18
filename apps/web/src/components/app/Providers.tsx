'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { api, ApiError, wsUrl } from '@/lib/api';
import { DEFAULT_CURRENCY, isCurrency, type Currency } from '@coldcall/shared';
import { guestWallet, hasGuestWallet, zkWallet, type CcWallet } from '@/lib/wallet';
import { setSoundEnabled } from '@/lib/sound';
import { UpdateWatcher } from './UpdateWatcher';

export interface Me {
  id: string;
  walletAddress: string;
  walletKind: string;
  displayName: string;
  avatar: string;
  role: string;
  onboarded: boolean;
  ratings: Record<string, { r: number; n: number }>;
  settings: { currency?: Currency; sound?: boolean; theme?: 'system' | 'dark' | 'light'; confirmMoves?: boolean; boardTheme?: 'marble' | 'night'; hints?: boolean; render3d?: boolean; pendingLimits?: any };
  /** Spending limits, one set per currency. */
  limits: Record<Currency, { depositDaily: number | null; lossDaily: number | null; lossWeekly: number | null; pending: Record<string, number | null> | null; pendingAt: string | null }>;
  cooloffUntil: string | null;
  excludedUntil: string | null;
}
export interface Balance {
  available: number;
  locked: number;
  inGames: number;
}
export type Balances = Record<Currency, Balance>;
const ZERO: Balance = { available: 0, locked: 0, inGames: 0 };

interface Session {
  ready: boolean;
  me: Me | null;
  /** Balance in the active currency. */
  balance: Balance | null;
  balances: Balances | null;
  /** The coin the player is looking at and playing with: wallet, stakes, results and history. */
  currency: Currency;
  setCurrency: (c: Currency) => void;
  wallet: CcWallet | null;
  /** Guest wallet sign in (signs a one time message). */
  signIn: (w: CcWallet) => Promise<Me>;
  /** Google sign in finished on /auth/google: adopt the zkLogin wallet. */
  adoptWallet: (w: CcWallet) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  setMe: (m: Me) => void;
  toast: (text: string, kind?: 'info' | 'win' | 'error') => void;
  socket: SocketHub;
  authOpen: boolean;
  openAuth: (open?: boolean) => void;
}

const Ctx = createContext<Session | null>(null);
export const useSession = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('useSession outside Providers');
  return c;
};

/** One WebSocket for the whole app, with automatic reconnect and re-watching. */
export class SocketHub {
  private ws: WebSocket | null = null;
  private listeners = new Set<(m: any) => void>();
  private watching = new Set<string>();
  private queue: string[] = [];
  private retry = 0;
  status: 'connecting' | 'open' | 'closed' = 'closed';
  private statusListeners = new Set<(s: SocketHub['status']) => void>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private ping: ReturnType<typeof setInterval> | null = null;

  connect() {
    if (typeof window === 'undefined') return;
    if (this.ws && this.ws.readyState <= 1) return;
    this.setStatus('connecting');
    const ws = new WebSocket(wsUrl());
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      this.setStatus('open');
      for (const id of this.watching) ws.send(JSON.stringify({ t: 'watch', tableId: id }));
      for (const m of this.queue.splice(0)) ws.send(m);
      this.ping = setInterval(() => ws.readyState === 1 && ws.send('{"t":"ping"}'), 25_000);
    };
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      for (const l of this.listeners) l(m);
    };
    ws.onclose = () => {
      if (this.ping) clearInterval(this.ping);
      this.setStatus('closed');
      if (this.ws !== ws) return;
      this.ws = null;
      const delay = Math.min(8000, 400 * 2 ** this.retry++);
      this.timer = setTimeout(() => this.connect(), delay);
    };
  }
  reconnect() {
    if (this.timer) clearTimeout(this.timer);
    const old = this.ws;
    this.ws = null;
    old?.close();
    this.connect();
  }
  private setStatus(s: SocketHub['status']) {
    this.status = s;
    for (const l of this.statusListeners) l(s);
  }
  onStatus(fn: (s: SocketHub['status']) => void) {
    this.statusListeners.add(fn);
    return () => void this.statusListeners.delete(fn);
  }
  on(fn: (m: any) => void) {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  }
  send(msg: object) {
    const s = JSON.stringify(msg);
    if (this.ws?.readyState === 1) this.ws.send(s);
    else {
      this.queue.push(s);
      this.connect();
    }
  }
  watch(id: string) {
    this.watching.add(id);
    this.send({ t: 'watch', tableId: id });
  }
  unwatch(id: string) {
    this.watching.delete(id);
    if (this.ws?.readyState === 1) this.ws.send(JSON.stringify({ t: 'unwatch', tableId: id }));
  }
}

function applyTheme(t?: string) {
  const root = document.documentElement;
  if (t === 'light' || t === 'dark') root.dataset.theme = t;
  else delete root.dataset.theme;
  try {
    localStorage.setItem('coldcall:theme', t ?? 'system');
  } catch {}
}

const CUR_KEY = 'coldcall:currency';
function storedCurrency(): Currency {
  try {
    const v = localStorage.getItem(CUR_KEY);
    return isCurrency(v) ? v : DEFAULT_CURRENCY;
  } catch {
    return DEFAULT_CURRENCY;
  }
}

export function Providers({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [me, setMe] = useState<Me | null>(null);
  const [balances, setBalances] = useState<Balances | null>(null);
  const [currency, setCurrencyState] = useState<Currency>(DEFAULT_CURRENCY);
  const [wallet, setWallet] = useState<CcWallet | null>(null);
  const [toasts, setToasts] = useState<{ id: number; text: string; kind: string }[]>([]);
  const [authOpen, setAuthOpen] = useState(false);
  const socket = useMemo(() => new SocketHub(), []);
  const tid = useRef(0);

  const toast = useCallback((text: string, kind: 'info' | 'win' | 'error' = 'info') => {
    const id = ++tid.current;
    setToasts((t) => [...t.slice(-2), { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const r = await api<{ user: Me; balances: Balances }>('/api/me');
      setMe(r.user);
      setBalances(r.balances);
      if (isCurrency(r.user.settings?.currency)) setCurrencyState(r.user.settings.currency);
      return r.user;
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setMe(null);
        setBalances(null);
      }
      return null;
    }
  }, []);

  useEffect(() => {
    setCurrencyState(storedCurrency());
    (async () => {
      const u = await refresh();
      // Give the session its signer back: the Google key or the guest key kept in this browser.
      if (u?.walletKind === 'zklogin') setWallet(zkWallet());
      else if (hasGuestWallet()) setWallet(guestWallet(false));
      setReady(true);
    })();
  }, [refresh]);

  const setCurrency = useCallback(
    (c: Currency) => {
      setCurrencyState(c);
      try {
        localStorage.setItem(CUR_KEY, c);
      } catch {}
      if (me) api('/api/me', { settings: { currency: c } }, 'PATCH').then((r: { user: Me }) => setMe(r.user)).catch(() => {});
    },
    [me],
  );

  useEffect(() => {
    applyTheme(me?.settings?.theme);
    setSoundEnabled(me?.settings?.sound !== false);
  }, [me?.settings?.theme, me?.settings?.sound]);

  useEffect(() => {
    socket.connect();
    return socket.on((m) => {
      if (m.t === 'balance' && isCurrency(m.currency))
        setBalances((b) => {
          const all = b ?? { LOFI: ZERO, SUI: ZERO };
          return { ...all, [m.currency]: { inGames: all[m.currency as Currency].inGames, available: m.available, locked: m.locked } };
        });
    });
  }, [socket]);

  // Reconnect the socket after sign in so it carries the new session cookie.
  useEffect(() => {
    if (me?.id) socket.reconnect();
  }, [me?.id, socket]);

  const signIn = useCallback(
    async (w: CcWallet) => {
      if (!w.signPersonalMessage) throw new Error('This wallet signs in with Google.');
      const n = await api<{ nonce: string; message: string; issuedAt: string }>(`/api/auth/nonce?address=${w.address}`);
      const signature = await w.signPersonalMessage(new TextEncoder().encode(n.message));
      const r = await api<{ user: Me }>('/api/auth/verify', { address: w.address, nonce: n.nonce, issuedAt: n.issuedAt, signature });
      setWallet(w);
      setMe(r.user);
      await refresh();
      return r.user;
    },
    [refresh],
  );

  const adoptWallet = useCallback(
    async (w: CcWallet) => {
      setWallet(w);
      await refresh();
    },
    [refresh],
  );

  const signOut = useCallback(async () => {
    await api('/api/auth/logout', {});
    await wallet?.disconnect();
    setMe(null);
    setBalances(null);
    setWallet(null);
    socket.reconnect();
  }, [wallet, socket]);

  const balance = balances ? balances[currency] : null;
  const value: Session = {
    ready,
    me,
    balance,
    balances,
    currency,
    setCurrency,
    wallet,
    signIn,
    adoptWallet,
    signOut,
    refresh: async () => void (await refresh()),
    setMe,
    toast,
    socket,
    authOpen,
    openAuth: (o = true) => setAuthOpen(o),
  };

  return (
    <Ctx.Provider value={value}>
      {children}
      <UpdateWatcher />
      <div className="pointer-events-none fixed inset-x-0 bottom-[calc(96px+env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6" aria-live="polite">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 14, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 420, damping: 30 }}
              className={`pointer-events-none max-w-md rounded-[14px] px-4 py-3 text-[15px] font-medium shadow-modal ${t.kind === 'error' ? 'bg-loss text-white' : t.kind === 'win' ? 'bg-gold text-[#14192a] shadow-[0_10px_36px_-8px_rgba(255,210,63,0.6)]' : 'glass glass-strong glass-blur text-text'}`}
            >
              {t.text}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  );
}
