'use client';
import { useEffect, useRef, useState } from 'react';
import { animate, motion, useReducedMotion } from 'motion/react';
import type { ProgressGame } from '@evens/shared';

export const GAME_COLOR: Record<ProgressGame, string> = { chess: '#c6ff3d', backgammon: '#ff8a3d', tichu: '#ff4d8d', seabattle: '#3ddcff' };
export const GAME_NAME: Record<ProgressGame, string> = { chess: 'Chess', backgammon: 'Backgammon', tichu: 'Tichu', seabattle: 'Sea Battle' };

/** Dark glass panel: blur, faint tinted border, 1px highlight on the top edge. */
export const glass =
  'relative rounded-card border border-[color-mix(in_srgb,var(--text)_9%,transparent)] bg-[color-mix(in_srgb,var(--surface)_78%,transparent)] shadow-[inset_0_1px_0_color-mix(in_srgb,white_7%,transparent),var(--shadow-card)] backdrop-blur-xl';

/** Game neon as readable text in both themes: pulled toward the text colour (white in dark, ink in light). */
export const ink = (c: string) => `color-mix(in srgb, ${c} 62%, var(--text))`;

export const tint = (c: string, pct = 18) => `color-mix(in srgb, ${c} ${pct}%, transparent)`;

/** Number that counts up instead of jumping. */
export function CountUp({ to, from = 0, duration = 0.9, delay = 0, className = '', prefix = '' }: { to: number; from?: number; duration?: number; delay?: number; className?: string; prefix?: string }) {
  const reduce = useReducedMotion();
  const [v, setV] = useState(reduce ? to : from);
  useEffect(() => {
    if (reduce) return setV(to);
    const c = animate(from, to, { duration, delay, ease: [0.2, 0.8, 0.2, 1], onUpdate: (x) => setV(Math.round(x)) });
    return () => c.stop();
  }, [to, from, duration, delay, reduce]);
  return (
    <span className={`tabular ${className}`}>
      {prefix}
      {v.toLocaleString('en-US')}
    </span>
  );
}

/** Level number in a glowing badge with an XP ring around it. */
export function LevelBadge({ level, pct, size = 40, glow = true, className = '' }: { level: number; pct: number; size?: number; glow?: boolean; className?: string }) {
  const reduce = useReducedMotion();
  const r = 46;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, pct));
  return (
    <span className={`relative inline-flex shrink-0 items-center justify-center ${className}`} style={{ width: size, height: size }} aria-hidden>
      <svg viewBox="0 0 100 100" className="absolute inset-0 size-full -rotate-90">
        <defs>
          <linearGradient id="lvl-ring" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#c6ff3d" />
            <stop offset="1" stopColor="#7c5cff" />
          </linearGradient>
          <radialGradient id="lvl-core" cx="50%" cy="35%" r="70%">
            <stop offset="0" stopColor="#2a2350" />
            <stop offset="1" stopColor="#0d0b1c" />
          </radialGradient>
        </defs>
        <circle cx="50" cy="50" r="40" fill="url(#lvl-core)" />
        <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,.1)" strokeWidth="6" />
        <motion.circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke="url(#lvl-ring)"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={c}
          initial={false}
          animate={{ strokeDashoffset: c * (1 - p) }}
          transition={{ duration: reduce ? 0 : 0.7, ease: [0.2, 0.8, 0.2, 1] }}
          style={glow ? { filter: 'drop-shadow(0 0 4px rgba(198,255,61,.55))' } : undefined}
        />
      </svg>
      <span className="relative font-display font-extrabold leading-none text-white" style={{ fontSize: size * 0.36, textShadow: glow ? '0 0 10px rgba(198,255,61,.55)' : undefined }}>
        {level}
      </span>
    </span>
  );
}

/** Horizontal XP bar. `from` lets the fill animate from an earlier value. */
export function XpBar({ pct, from, height = 8, className = '', color, delay = 0 }: { pct: number; from?: number; height?: number; className?: string; color?: string; delay?: number }) {
  const reduce = useReducedMotion();
  const p = Math.max(0, Math.min(1, pct));
  return (
    <div className={`relative w-full overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--text)_10%,transparent)] ${className}`} style={{ height }}>
      <motion.div
        className="absolute inset-y-0 left-0 rounded-full"
        style={{ background: color ?? 'linear-gradient(90deg, #c6ff3d, #7c5cff)', boxShadow: `0 0 12px ${color ?? 'rgba(198,255,61,.5)'}` }}
        initial={{ width: `${(from ?? p) * 100}%` }}
        animate={{ width: `${p * 100}%` }}
        transition={{ duration: reduce ? 0 : 0.9, delay: reduce ? 0 : delay, ease: [0.2, 0.8, 0.2, 1] }}
      />
    </div>
  );
}

/** Gold particle burst for celebrations. Renders nothing with reduced motion. */
export function Burst({ count = 18, color = 'var(--gold)', className = '' }: { count?: number; color?: string; className?: string }) {
  const reduce = useReducedMotion();
  const seeds = useRef(Array.from({ length: count }, (_, i) => ({ a: (i / count) * Math.PI * 2 + Math.random() * 0.4, d: 50 + Math.random() * 60, s: 4 + Math.random() * 5 })));
  if (reduce) return null;
  return (
    <span className={`pointer-events-none absolute inset-0 flex items-center justify-center ${className}`} aria-hidden>
      {seeds.current.map((p, i) => (
        <motion.span
          key={i}
          className="absolute rounded-full"
          style={{ width: p.s, height: p.s, background: color, boxShadow: `0 0 8px ${color}` }}
          initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
          animate={{ x: Math.cos(p.a) * p.d, y: Math.sin(p.a) * p.d, opacity: 0, scale: 0.4 }}
          transition={{ duration: 0.85, ease: [0.1, 0.7, 0.3, 1] }}
        />
      ))}
    </span>
  );
}

const ICONS: Record<string, string> = {
  spark: 'M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8L12 2Z',
  trophy: 'M7 3h10v3h3v2a4 4 0 0 1-4 4h-.3A5 5 0 0 1 13 14.9V17h3v3H8v-3h3v-2.1A5 5 0 0 1 8.3 12H8a4 4 0 0 1-4-4V6h3V3Zm-1 5a2 2 0 0 0 1 1.7V8H6Zm11 1.7A2 2 0 0 0 18 8h-1v1.7Z',
  flame: 'M12 2c1 3.5 5 5.5 5 10.5A5 5 0 0 1 12 18a5 5 0 0 1-5-5.5c0-2 1-3.5 2-4.5.2 1.6 1 2.6 2 3 0-3 .3-6 1-9Zm0 11c-1 1-1.5 1.8-1.5 2.6a1.5 1.5 0 0 0 3 0c0-.8-.5-1.6-1.5-2.6Z',
  crown: 'M3 7l4.5 4L12 4l4.5 7L21 7l-2 11H5L3 7Zm3 13h12v2H6v-2Z',
  compass: 'M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20Zm4.5 5.5-6.3 2.7-2.7 6.3 6.3-2.7 2.7-6.3ZM12 11a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z',
  star: 'M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9 2.9-6Z',
  bolt: 'M13 2 4 14h6l-1 8 9-12h-6l1-8Z',
  arrow: 'M12 3l7 7h-4v9H9v-9H5l7-7Z',
  sun: 'M12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm-1-6h2v4h-2V1Zm0 18h2v4h-2v-4ZM1 11h4v2H1v-2Zm18 0h4v2h-4v-2ZM4.2 2.8l2.9 2.9-1.4 1.4-2.9-2.9 1.4-1.4Zm12.7 12.7 2.9 2.9-1.4 1.4-2.9-2.9 1.4-1.4ZM2.8 19.8l2.9-2.9 1.4 1.4-2.9 2.9-1.4-1.4ZM15.5 7.1l2.9-2.9 1.4 1.4-2.9 2.9-1.4-1.4Z',
  king: 'M11 1h2v2h2v2h-2v2.1A4 4 0 0 1 16 11c0 1.2-.5 2.2-1.3 3l1.3 4H8l1.3-4A4 4 0 0 1 8 11a4 4 0 0 1 3-3.9V5H9V3h2V1ZM6 19h12v3H6v-3Z',
  dice: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm3 3.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm8 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm-4 4a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm-4 4a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm8 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z',
  card: 'M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm5 5-3 5 3 5 3-5-3-5Z',
  dragon: 'M4 18c3-1 4-4 4-7 0-3 2-6 6-7-1 2 0 3 2 3 2 0 3 1 4 3-2 0-3 1-3 3 0 3-3 6-8 6-2 0-4 0-5-1Zm10-9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z',
  anchor: 'M12 2a3 3 0 0 1 1 5.8V9h3v2h-3v8.9A7 7 0 0 0 18.9 14H17l3-4 3 4h-2a9 9 0 0 1-18 0H1l3-4 3 4H5.1A7 7 0 0 0 11 19.9V11H8V9h3V7.8A3 3 0 0 1 12 2Zm0 2a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z',
  target: 'M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20Zm0 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm0 3a4 4 0 1 1 0 8 4 4 0 0 1 0-8Zm0 2.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z',
  shield: 'M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5l-8-3Z',
  lock: 'M12 2a5 5 0 0 1 5 5v3h1a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h1V7a5 5 0 0 1 5-5Zm0 2a3 3 0 0 0-3 3v3h6V7a3 3 0 0 0-3-3Z',
  check: 'M9.5 16.2 5.3 12l-1.4 1.4 5.6 5.6L20.1 8.4 18.7 7 9.5 16.2Z',
};

export function Icon({ name, className = 'size-5', style }: { name: string; className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" className={className} style={style} fill="currentColor" aria-hidden>
      <path d={ICONS[name] ?? ICONS.star} fillRule="evenodd" />
    </svg>
  );
}

export function fmtDuration(ms: number) {
  const m = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}h ${m % 60}m` : `${m}m`;
}

/** Live countdown to the daily reset (no pressure, just information). */
export function useResetIn(resetsInMs: number | undefined) {
  const [base] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  if (resetsInMs === undefined) return null;
  return Math.max(0, resetsInMs - (now - base));
}
