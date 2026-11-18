'use client';
import { forwardRef, useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { formatCredits } from '@evens/shared';
import { feedback } from '@/lib/haptics';
import { play } from '@/lib/sound';

/* =====================================================================
   Evens UI primitives, v3 "Four Worlds".
   Every export from v2 is kept with the same props. New in v3:
   Glass, TiltCard, useTilt, CountUp, useCountUp, Cosmos, PageHeader, Eyebrow.
   ===================================================================== */

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
const variants: Record<Variant, string> = {
  primary: 'btn-primary font-bold',
  secondary: 'btn-secondary',
  ghost: 'bg-transparent text-text hover:bg-well-hover',
  danger: 'bg-loss text-white hover:brightness-110 shadow-[0_8px_24px_-8px_rgba(255,77,109,0.6)]',
};

/**
 * Button. Primary and danger buttons give a soft tap sound (follows the sound setting) and an 8ms
 * haptic tick on phones. All buttons squash on press.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'md' | 'lg' | 'sm'; loading?: boolean; full?: boolean }>(
  function Button({ variant = 'primary', size = 'md', loading, full, className = '', children, disabled, onClick, ...rest }, ref) {
    const sz = size === 'lg' ? 'h-14 px-6 text-[17px] rounded-[14px]' : size === 'sm' ? 'h-9 px-3 text-sm rounded-chip' : 'h-11 px-5 text-[15px] rounded-chip';
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        onClick={(e) => {
          // On click, not pointerdown, so starting a scroll on a button never buzzes. The squash is CSS :active.
          if (variant === 'primary' || variant === 'danger') feedback('press');
          onClick?.(e);
        }}
        className={`press inline-flex select-none items-center justify-center gap-2 font-semibold disabled:cursor-not-allowed disabled:opacity-45 ${sz} ${variants[variant]} ${full ? 'w-full' : ''} ${className}`}
        {...rest}
      >
        {loading ? <Spinner /> : null}
        {children}
      </button>
    );
  },
);

export function Spinner({ className = 'size-4' }: { className?: string }) {
  return <span className={`inline-block animate-spin rounded-full border-2 border-current border-r-transparent ${className}`} aria-hidden />;
}

/** Glass card. Pass `tint` (a colour) to tint the gradient border and light spill. */
export function Card({ children, className = '', tint, style, ...rest }: { children: ReactNode; className?: string; tint?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`glass rounded-card ${className}`} style={tint ? ({ '--tint': tint, ...style } as CSSProperties) : style} {...rest}>
      {children}
    </div>
  );
}

/** Glass panel with options: `blur` (only for fixed bars and overlays), `strong` (more opaque), `spill` (coloured light from the top). */
export function Glass({ children, className = '', tint, blur, strong, spill, style, ...rest }: { children: ReactNode; className?: string; tint?: string; blur?: boolean; strong?: boolean; spill?: boolean } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`glass ${strong ? 'glass-strong' : ''} ${blur ? 'glass-blur' : ''} ${className}`} style={tint ? ({ '--tint': tint, ...style } as CSSProperties) : style} {...rest}>
      {spill ? <span className="spill pointer-events-none absolute inset-0 rounded-[inherit]" aria-hidden /> : null}
      {children}
    </div>
  );
}

/** Skeleton with a soft moving shimmer. */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`shimmer rounded-card ${className}`} aria-hidden />;
}

/** The credits coin: gold is reserved for credits and wins. */
export function Coin({ className = 'size-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <circle cx="12" cy="12" r="10.5" fill="var(--gold)" />
      <path d="M4.2 9.2A8.4 8.4 0 0 1 19.6 8" fill="none" stroke="rgba(255,255,255,.5)" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="12" cy="12" r="7.5" fill="none" stroke="rgba(0,0,0,.25)" strokeWidth="1.2" />
      <rect x="8" y="9" width="8" height="1.8" rx=".9" fill="rgba(0,0,0,.45)" />
      <rect x="8" y="13.2" width="8" height="1.8" rx=".9" fill="rgba(0,0,0,.45)" />
    </svg>
  );
}

/** USDC mark (blue circle, white dollar sign, side arcs), used to identify the USDC currency. USDC is a trademark of Circle. */
export function UsdcIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <circle cx="16" cy="16" r="16" fill="#2775CA" />
      <path d="M20.2 18.4c0-2.2-1.3-3-4-3.3-1.9-.3-2.3-.8-2.3-1.7s.7-1.5 2-1.5c1.2 0 1.8.4 2.1 1.4.1.2.2.3.4.3h1.1c.3 0 .5-.2.5-.5v-.1c-.3-1.5-1.5-2.6-3-2.8V8.6c0-.3-.2-.5-.6-.5h-1c-.3 0-.5.2-.6.5v1.6c-2 .3-3.2 1.6-3.2 3.3 0 2.1 1.3 2.9 3.9 3.2 1.8.3 2.4.7 2.4 1.8s-.9 1.8-2.2 1.8c-1.7 0-2.3-.7-2.5-1.7-.1-.3-.3-.4-.5-.4h-1.2c-.3 0-.5.2-.5.5v.1c.3 1.7 1.3 2.8 3.5 3.1v1.7c0 .3.2.5.6.5h1c.3 0 .5-.2.6-.5v-1.7c2-.3 3.5-1.7 3.5-3.5Z" fill="#fff" />
      <path d="M12.4 25.1c-5-1.8-7.6-7.4-5.8-12.4.9-2.7 3.1-4.8 5.8-5.8.3-.1.4-.3.4-.6v-.9c0-.2-.1-.4-.4-.5h-.1c-6 1.9-9.4 8.3-7.5 14.4 1.1 3.6 3.9 6.3 7.5 7.5.2.1.5 0 .5-.2.1-.1.1-.2.1-.3v-.9c0-.1-.2-.3-.5-.3Zm7.3-20.8c-.2-.1-.5 0-.5.2-.1.1-.1.2-.1.3v.9c0 .3.2.5.4.6 5 1.8 7.6 7.4 5.8 12.4-.9 2.7-3.1 4.8-5.8 5.8-.3.1-.4.3-.4.6v.9c0 .2.1.4.4.5h.1c6-1.9 9.4-8.3 7.5-14.4-1.1-3.6-3.9-6.4-7.4-7.8Z" fill="#fff" />
    </svg>
  );
}

/** USDC amount with its icon. `base` is token base units / 1e6 as a number of USDC. */
export function Usdc({ amount, className = '' }: { amount: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 tabular font-semibold ${className}`} aria-label={`${amount.toFixed(2)} USDC`}>
      <UsdcIcon className="size-[1em]" />
      <span>{amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
      <span className="text-[0.75em] font-bold opacity-80">USDC</span>
    </span>
  );
}

/* ---------- Count up ---------- */

/**
 * Animates a number from its previous value to `value` (ease out). Display only: the final value is
 * always exactly `value`. Under reduced motion it jumps straight to the value.
 * `from` sets the start on first mount (default: start at `value`, so the first paint does not move).
 */
export function useCountUp(value: number, { duration = 650, from }: { duration?: number; from?: number } = {}) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(from ?? value);
  const cur = useRef(from ?? value);
  useEffect(() => {
    if (reduce || !Number.isFinite(value)) {
      cur.current = value;
      setShown(value);
      return;
    }
    const start = cur.current;
    if (start === value) return setShown(value);
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / duration);
      const e = 1 - Math.pow(1 - k, 3);
      const v = k >= 1 ? value : start + (value - start) * e;
      cur.current = v;
      setShown(v);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration, reduce]);
  return shown;
}

/** Number that counts up. `format` turns the animated value into text. `value` should be an integer for money (minor units). */
export function CountUp({ value, format = (n) => Math.round(n).toLocaleString('en-US'), duration, from, className = '' }: { value: number; format?: (n: number) => string; duration?: number; from?: number; className?: string }) {
  const v = useCountUp(value, { duration, from });
  return <span className={`tabular ${className}`}>{format(v)}</span>;
}

/**
 * Credits with the gold coin. `animate` counts the number up when it changes (display only; the
 * screen reader label always carries the exact final amount).
 */
export function Credits({ minor, sign, className = '', coin = true, animate = false, from }: { minor: number; sign?: boolean; className?: string; coin?: boolean; animate?: boolean; from?: number }) {
  const neg = minor < 0;
  return (
    <span className={`inline-flex items-center gap-1 tabular font-semibold ${className}`} aria-label={`${neg ? 'lost ' : ''}${formatCredits(Math.abs(minor))} credits`}>
      {coin ? <Coin className="size-[1em]" /> : null}
      {animate ? <CountUp value={minor} from={from} format={(n) => formatCredits(Math.round(n), { sign })} /> : <span>{formatCredits(minor, { sign })}</span>}
    </span>
  );
}

/* ---------- Tilt ---------- */

/**
 * Hover tilt with a moving glare, for pointer devices only (touch and reduced motion get nothing).
 * Attach the returned ref to an element with the `tilt` class and put <span className="tilt-glare" />
 * inside it. Children with class `parallax` and style `--depth: 14px` move with the pointer.
 * No React state per move: CSS variables are written once per animation frame.
 */
export function useTilt<T extends HTMLElement>(max = 8) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof window === 'undefined') return;
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let raf = 0;
    let x = 0;
    let y = 0;
    const apply = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      const nx = Math.min(1, Math.max(0, (x - r.left) / r.width));
      const ny = Math.min(1, Math.max(0, (y - r.top) / r.height));
      el.style.setProperty('--rx', `${((0.5 - ny) * max).toFixed(2)}deg`);
      el.style.setProperty('--ry', `${((nx - 0.5) * max).toFixed(2)}deg`);
      el.style.setProperty('--gx', `${(nx * 100).toFixed(1)}%`);
      el.style.setProperty('--gy', `${(ny * 100).toFixed(1)}%`);
      el.style.setProperty('--px', ((nx - 0.5) * 2).toFixed(3));
      el.style.setProperty('--py', ((ny - 0.5) * 2).toFixed(3));
    };
    const move = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      x = e.clientX;
      y = e.clientY;
      el.dataset.hover = '1';
      if (!raf) raf = requestAnimationFrame(apply);
    };
    const leave = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      delete el.dataset.hover;
      el.style.setProperty('--rx', '0deg');
      el.style.setProperty('--ry', '0deg');
      el.style.setProperty('--px', '0');
      el.style.setProperty('--py', '0');
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerleave', leave);
    return () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerleave', leave);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [max]);
  return ref;
}

/** A glass card that tilts toward the pointer with a glare. Use for clickable cards on desktop. */
export function TiltCard({ children, className = '', tint, max = 7, style, ...rest }: { children: ReactNode; className?: string; tint?: string; max?: number } & React.HTMLAttributes<HTMLDivElement>) {
  const ref = useTilt<HTMLDivElement>(max);
  return (
    <div ref={ref} className={`tilt glass rounded-card ${className}`} style={tint ? ({ '--tint': tint, ...style } as CSSProperties) : style} {...rest}>
      <span className="tilt-glare" aria-hidden />
      {children}
    </div>
  );
}

/* ---------- Backdrop ---------- */

/** The persistent app backdrop: violet nebula, two star layers, one slow drifting light. CSS only. */
export function Cosmos() {
  return (
    <div className="cosmos" aria-hidden>
      <div className="cosmos-nebula" />
      <div className="cosmos-light" />
      <div className="cosmos-stars" />
      <div className="cosmos-stars-2" />
      <div className="cosmos-horizon" />
    </div>
  );
}

/* ---------- Typography helpers ---------- */

export function Eyebrow({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <p className={`t-eyebrow ${className}`}>{children}</p>;
}

/** Standard page header: small eyebrow, big Unbounded title, optional one line under it and an action on the right. */
export function PageHeader({ eyebrow, title, sub, action, className = '' }: { eyebrow?: ReactNode; title: ReactNode; sub?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={`flex items-end justify-between gap-4 ${className}`}>
      <div className="min-w-0">
        {eyebrow ? <Eyebrow className="mb-2">{eyebrow}</Eyebrow> : null}
        <h1 className="t-display">{title}</h1>
        {sub ? <p className="mt-2 text-[16px] text-text-2">{sub}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/* ---------- InfoTip ---------- */

/** Info icon with a one line explanation (layer 2) and optional link to the full page (layer 3). */
export function InfoTip({ text, href, label = 'More info' }: { text: string; href?: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  return (
    <span ref={ref} className="relative inline-flex">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex size-6 items-center justify-center rounded-full text-text-2 transition hover:bg-well-hover hover:text-text"
      >
        <svg viewBox="0 0 20 20" className="size-4" fill="currentColor" aria-hidden>
          <path d="M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm0 3.5a1.1 1.1 0 1 1 0 2.2 1.1 1.1 0 0 1 0-2.2ZM11.2 14.5H8.8v-1h.7V10h-.7V9h2.4v4.5h.7v1Z" />
        </svg>
      </button>
      <AnimatePresence>
        {open ? (
          <motion.span
            id={id}
            role="tooltip"
            initial={{ opacity: 0, y: 4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.15 }}
            className="glass glass-strong absolute bottom-full left-1/2 z-50 mb-2 w-64 -translate-x-1/2 rounded-chip p-3 text-left text-sm font-normal normal-case leading-snug tracking-normal text-text shadow-modal"
          >
            {text}
            {href ? (
              <a href={href} className="mt-2 block font-semibold text-primary">
                How this works
              </a>
            ) : null}
          </motion.span>
        ) : null}
      </AnimatePresence>
    </span>
  );
}

/* ---------- Sheet ---------- */

/** Bottom sheet on mobile, centred dialog on desktop. Glass, with an optional game `tint` and `header` art above the title. */
export function Sheet({ open, onClose, title, children, wide, tint, header, footer }: { open: boolean; onClose: () => void; title?: string; children: ReactNode; wide?: boolean; tint?: string; header?: ReactNode; footer?: ReactNode }) {
  // Sound and the paused backdrop depend on `open` only, so parent re-renders never replay them.
  useEffect(() => {
    if (!open) return;
    play('open');
    const n = Number(document.body.dataset.sheets ?? 0) + 1;
    document.body.dataset.sheets = String(n);
    return () => {
      const m = Number(document.body.dataset.sheets ?? 1) - 1;
      if (m > 0) document.body.dataset.sheets = String(m);
      else delete document.body.dataset.sheets;
    };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', k);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', k);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open ? (
        <motion.div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
          <div className="absolute inset-0 bg-[#05040c]/70 backdrop-blur-[6px]" onClick={onClose} aria-hidden />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ y: 48, opacity: 0, scale: 0.985 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 48, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }}
            style={{ '--tint': tint ?? 'var(--glass-rim-2)' } as CSSProperties}
            className={`glass glass-strong relative max-h-[92dvh] w-full overflow-y-auto overscroll-contain rounded-t-sheet shadow-modal sm:rounded-sheet ${wide ? 'sm:max-w-2xl' : 'sm:max-w-md'}`}
          >
            <span className="spill pointer-events-none absolute inset-x-0 top-0 h-56 rounded-t-[inherit]" aria-hidden />
            {header ? <div className="relative">{header}</div> : null}
            <div className={`relative p-5 sm:p-6 ${footer ? 'pb-4 sm:pb-4' : 'pb-[calc(32px+env(safe-area-inset-bottom))]'}`}>
              {!header ? <div className="mx-auto -mt-1 mb-3 h-1 w-10 rounded-full bg-line sm:hidden" aria-hidden /> : null}
              {title ? (
                <div className="mb-4 flex items-start justify-between gap-4">
                  <h2 className="t-title text-[22px]">{title}</h2>
                  <button onClick={onClose} aria-label="Close" className="press -mr-2 -mt-1 inline-flex size-10 shrink-0 items-center justify-center rounded-full text-text-2 hover:bg-well-hover hover:text-text">
                    <svg viewBox="0 0 20 20" className="size-5" fill="currentColor" aria-hidden>
                      <path d="M5.3 5.3a1 1 0 0 1 1.4 0L10 8.6l3.3-3.3a1 1 0 1 1 1.4 1.4L11.4 10l3.3 3.3a1 1 0 0 1-1.4 1.4L10 11.4l-3.3 3.3a1 1 0 0 1-1.4-1.4L8.6 10 5.3 6.7a1 1 0 0 1 0-1.4Z" />
                    </svg>
                  </button>
                </div>
              ) : null}
              {children}
            </div>
            {footer ? (
              /* The primary action stays in reach on short phones instead of scrolling away below the fold. */
              <div className="glass-blur sticky bottom-0 z-10 border-t border-well-line bg-[color-mix(in_srgb,var(--bg)_82%,transparent)] px-5 pb-[calc(12px+env(safe-area-inset-bottom))] pt-3 sm:px-6 sm:pb-6">{footer}</div>
            ) : null}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

/* ---------- Chip, Row, Empty ---------- */

export function Chip({ active, children, onClick, disabled }: { active?: boolean; children: ReactNode; onClick?: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      onClick={() => {
        if (!active) feedback('select');
        onClick?.();
      }}
      className={`press h-11 min-w-[64px] rounded-chip px-4 text-[15px] font-semibold disabled:opacity-40 ${active ? 'btn-primary' : 'btn-secondary'}`}
    >
      {children}
    </button>
  );
}

export function Row({ label, value, info, strong }: { label: string; value: ReactNode; info?: string; strong?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-3 py-2 ${strong ? 'font-semibold' : ''}`}>
      <span className="inline-flex shrink-0 items-center gap-1 text-text-2">
        {label}
        {info ? <InfoTip text={info} href="/how-it-works" /> : null}
      </span>
      <span className="text-right">{value}</span>
    </div>
  );
}

export function Empty({ title, text, action }: { title: string; text: string; action?: ReactNode }) {
  return (
    <div className="glass relative flex flex-col items-center gap-3 overflow-hidden rounded-card px-6 py-12 text-center">
      <span className="spill pointer-events-none absolute inset-0" aria-hidden />
      <span className="relative grid size-20 place-items-center">
        <span className="absolute inset-0 rounded-full bg-accent/25 blur-xl" aria-hidden />
        <Logo className="relative size-12" />
      </span>
      <p className="t-title relative">{title}</p>
      <p className="relative max-w-sm text-text-2">{text}</p>
      {action ? <div className="relative mt-1">{action}</div> : null}
    </div>
  );
}

/** Evens mark: an equals sign whose bars are two halves of a board square. */
export function Logo({ className = 'size-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <defs>
        <linearGradient id="evens-mark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--accent)" />
          <stop offset="1" stopColor="#2a1a7a" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="30" height="30" rx="9" fill="url(#evens-mark)" />
      <rect x="7" y="9.5" width="18" height="5" rx="2.5" fill="#ffffff" />
      <rect x="7" y="17.5" width="18" height="5" rx="2.5" fill="var(--primary)" />
    </svg>
  );
}

export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <Logo className="size-8" />
      <span className="font-display text-[20px] font-extrabold uppercase tracking-tight">evens</span>
    </span>
  );
}
