'use client';
/**
 * Live updates without asking anyone to restart. When a new release is deployed:
 * - outside a game, the page swaps to the new version on the next page change (or right away if the tab is in the background);
 * - inside a game, nothing reloads; a small note says the update loads after the game.
 * Also recovers from a missing code chunk after a deploy by reloading once.
 */
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

const MINE = process.env.NEXT_PUBLIC_BUILD_ID ?? 'dev';
const inGame = (p: string | null) => !!p && (p.startsWith('/table/') || p.startsWith('/invite/'));

export function UpdateWatcher() {
  const path = usePathname();
  const [ready, setReady] = useState(false);
  const firstPath = useRef(path);

  // Poll the server build id: every minute, and whenever the tab comes back.
  useEffect(() => {
    if (MINE === 'dev' || process.env.NODE_ENV !== 'production') return;
    let stop = false;
    const check = async () => {
      try {
        const r = await fetch('/version.json', { cache: 'no-store' });
        const { build } = await r.json();
        if (!stop && build && build !== MINE) {
          document.documentElement.dataset.update = 'ready'; // visible to tests and support tools
          setReady(true);
        }
      } catch {
        /* offline or restarting: try again later */
      }
    };
    const t = setInterval(check, 60_000);
    const onVis = () => document.visibilityState === 'visible' && check();
    document.addEventListener('visibilitychange', onVis);
    void check();
    return () => {
      stop = true;
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  // Apply the update at a safe moment.
  useEffect(() => {
    if (!ready || inGame(path)) return;
    if (document.visibilityState === 'hidden' || path !== firstPath.current) window.location.reload();
    firstPath.current = path;
  }, [ready, path]);

  // A tab left open across a deploy may ask for a code file that no longer exists: reload once.
  useEffect(() => {
    const bad = (msg: string) => /ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module|Importing a module script failed/i.test(msg);
    const recover = (msg: string) => {
      if (!bad(msg) || inGame(location.pathname)) return;
      try {
        if (sessionStorage.getItem('coldcall:chunk-reload') === MINE) return;
        sessionStorage.setItem('coldcall:chunk-reload', MINE);
      } catch {}
      window.location.reload();
    };
    const onErr = (e: ErrorEvent) => recover(String(e.message ?? e.error));
    const onRej = (e: PromiseRejectionEvent) => recover(String((e.reason as Error)?.message ?? e.reason));
    window.addEventListener('error', onErr);
    window.addEventListener('unhandledrejection', onRej);
    return () => {
      window.removeEventListener('error', onErr);
      window.removeEventListener('unhandledrejection', onRej);
    };
  }, []);

  if (!ready || !inGame(path)) return null;
  return (
    <div role="status" className="pointer-events-none fixed inset-x-0 top-2 z-[70] flex justify-center px-4">
      <span className="glass glass-strong rounded-full px-4 py-2 text-sm text-text-2 shadow-modal">Cold Call has an update. It loads after this game.</span>
    </div>
  );
}
