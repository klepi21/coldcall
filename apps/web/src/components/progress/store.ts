'use client';
/**
 * One shared progress store for the whole app: a single fetch of /api/progress, refreshed when the
 * server pushes a 'progress' message. Also caches the last progress message per table so a result
 * screen that mounts after the push still gets it.
 */
import { useEffect, useSyncExternalStore } from 'react';
import type { ProgressMsg, ProgressResponse } from '@coldcall/shared';
import { api } from '@/lib/api';
import { useSession, type SocketHub } from '@/components/app/Providers';

type State = { data: ProgressResponse | null; loading: boolean; error: string | null };
let state: State = { data: null, loading: false, error: null };
const listeners = new Set<() => void>();
const set = (s: Partial<State>) => {
  state = { ...state, ...s };
  for (const l of listeners) l();
};

const byTable = new Map<string, ProgressMsg>();
const msgListeners = new Set<(m: ProgressMsg) => void>();
const attached = new WeakSet<SocketHub>();
let inflight: Promise<void> | null = null;
let forUser: string | null = null;

export async function reloadProgress() {
  if (inflight) return inflight;
  set({ loading: true });
  inflight = api<ProgressResponse>('/api/progress')
    .then((data) => set({ data, loading: false, error: null }))
    .catch((e) => set({ loading: false, error: e?.message ?? 'Could not load your progress.' }))
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

function attach(socket: SocketHub) {
  if (attached.has(socket)) return;
  attached.add(socket);
  socket.on((m) => {
    if (m?.t !== 'progress') return;
    byTable.set(m.tableId, m);
    for (const l of msgListeners) l(m);
    void reloadProgress();
  });
}

/** Call once anywhere signed in (every progress component does). Subscribes the shared socket. */
export function useProgressFeed() {
  const { socket, me } = useSession();
  useEffect(() => attach(socket), [socket]);
  useEffect(() => {
    const uid = me?.id ?? null;
    if (uid === forUser) return;
    forUser = uid;
    if (uid) void reloadProgress();
    else set({ data: null, error: null });
  }, [me?.id]);
}

/** Your level, XP, stats, achievements, daily challenges and cosmetics. Refreshes after every game. */
export function useProgress() {
  useProgressFeed();
  const s = useSyncExternalStore(
    (l) => (listeners.add(l), () => void listeners.delete(l)),
    () => state,
    () => state,
  );
  return { ...s, reload: reloadProgress };
}

/** Listen to progress pushes (for toasts and the result screen). */
export function onProgressMsg(fn: (m: ProgressMsg) => void) {
  msgListeners.add(fn);
  return () => void msgListeners.delete(fn);
}

export const cachedAward = (tableId: string) => byTable.get(tableId) ?? null;
export const rememberAward = (m: ProgressMsg) => byTable.set(m.tableId, m);

/** Replace the cached progress (after equipping, the server returns the fresh state). */
export const setProgressData = (data: ProgressResponse) => set({ data, error: null });
