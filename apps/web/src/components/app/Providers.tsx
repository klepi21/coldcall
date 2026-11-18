'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { api, ApiError, wsUrl } from '@/lib/api';
import { guestWallet, hasGuestWallet, type EvensWallet } from '@/lib/wallet';
import { setSoundEnabled } from '@/lib/sound';
import bs58 from 'bs58';
import { PrivyLayer } from './PrivyLayer';
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
  settings: { sound?: boolean; theme?: 'system' | 'dark' | 'light'; confirmMoves?: boolean; boardTheme?: 'marble' | 'night'; hints?: boolean; render3d?: boolean; pendingLimits?: any };
  limits: { depositDaily: number | null; lossDaily: number | null; lossWeekly: number | null };
  cooloffUntil: string | null;
  excludedUntil: string | null;
}
export interface Balance {
  available: number;
  locked: number;
  inGames: number;
}

interface Session {
  ready: boolean;
  me: Me | null;
  balance: Balance | null;
  wallet: EvensWallet | null;
  signIn: (w: EvensWallet) => Promise<Me>;
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
    localStorage.setItem('evens:theme', t ?? 'system');
  } catch {}
}

export function Providers({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [me, setMe] = useState<Me | null>(null);
  const [balance, setBalance] = useState<Balance | null>(null);
  const [wallet, setWallet] = useState<EvensWallet | null>(null);
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
      const r = await api<{ user: Me; balance: Balance }>('/api/me');
      setMe(r.user);
      setBalance(r.balance);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setMe(null);
        setBalance(null);
      }
    }
  }, []);

  useEffect(() => {
    (async () => {
      await refresh();
      if (hasGuestWallet()) setWallet(guestWallet(false));
      setReady(true);
    })();
  }, [refresh]);

  useEffect(() => {
    applyTheme(me?.settings?.theme);
    setSoundEnabled(me?.settings?.sound !== false);
  }, [me?.settings?.theme, me?.settings?.sound]);

  useEffect(() => {
    socket.connect();
    return socket.on((m) => {
      if (m.t === 'balance') setBalance((b) => ({ inGames: b?.inGames ?? 0, available: m.available, locked: m.locked }));
    });
  }, [socket]);

  // Reconnect the socket after sign in so it carries the new session cookie.
  useEffect(() => {
    if (me?.id) socket.reconnect();
  }, [me?.id, socket]);

  const signIn = useCallback(
    async (w: EvensWallet) => {
      const n = await api<{ nonce: string; message: string; issuedAt: string }>(`/api/auth/nonce?address=${w.address}`);
      const sig = await w.signMessage(new TextEncoder().encode(n.message));
      const r = await api<{ user: Me }>('/api/auth/verify', { address: w.address, nonce: n.nonce, issuedAt: n.issuedAt, signature: bs58.encode(sig), walletKind: w.kind });
      setWallet(w);
      setMe(r.user);
      await refresh();
      return r.user;
    },
    [refresh],
  );

  const signOut = useCallback(async () => {
    await api('/api/auth/logout', {});
    await wallet?.disconnect();
    setMe(null);
    setBalance(null);
    socket.reconnect();
  }, [wallet, socket]);

  // A returning email / Google user: Privy hands back their embedded wallet, adopt it as the signer.
  const myAddress = me?.walletAddress;
  const adoptPrivy = useCallback(
    (w: EvensWallet) => {
      if (myAddress === w.address) setWallet((cur) => (cur?.address === w.address && cur.kind === 'privy' ? cur : w));
    },
    [myAddress],
  );

  const value: Session = { ready, me, balance, wallet, signIn, signOut, refresh, setMe, toast, socket, authOpen, openAuth: (o = true) => setAuthOpen(o) };

  return (
    <Ctx.Provider value={value}>
      <PrivyLayer onWallet={adoptPrivy}>{children}</PrivyLayer>
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
              className={`pointer-events-auto max-w-md rounded-[14px] px-4 py-3 text-[15px] font-medium shadow-modal ${t.kind === 'error' ? 'bg-loss text-white' : t.kind === 'win' ? 'bg-gold text-[#14192a] shadow-[0_10px_36px_-8px_rgba(255,210,63,0.6)]' : 'glass glass-strong glass-blur text-text'}`}
            >
              {t.text}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  );
}
