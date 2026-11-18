'use client';
import { forwardRef, useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { CURRENCY, formatAmount, formatNumber, type Currency } from '@coldcall/shared';
import { feedback } from '@/lib/haptics';
import { play } from '@/lib/sound';

/* =====================================================================
   Cold Call UI primitives, v3 "Four Worlds".
   Every export from v2 is kept with the same props. New in v3:
   Glass, TiltCard, useTilt, CountUp, useCountUp, Cosmos, PageHeader, Eyebrow.
   ===================================================================== */

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
const variants: Record<Variant, string> = {
  primary: 'btn-primary',
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
    const sz = size === 'lg' ? 'h-14 px-6 text-[19px] rounded-[14px]' : size === 'sm' ? 'h-9 px-3 text-[15px] rounded-chip' : 'h-11 px-5 text-[17px] rounded-chip';
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        onClick={(e) => {
          // On click, not pointerdown, so starting a scroll on a button never buzzes. The squash is CSS :active.
          if (variant === 'primary' || variant === 'danger') feedback('press');
          onClick?.(e);
        }}
        className={`press inline-flex select-none items-center justify-center gap-2 font-display tracking-[0.01em] disabled:cursor-not-allowed disabled:opacity-45 ${sz} ${variants[variant]} ${full ? 'w-full' : ''} ${className}`}
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

/** Coin chip for a currency: the brand chip image, with a lettered fallback if the image fails to load. */
export function CoinChip({ currency, className = 'size-4' }: { currency: Currency; className?: string }) {
  const [broken, setBroken] = useState(false);
  if (broken)
    return (
      <span
        className={`inline-grid shrink-0 place-items-center rounded-full text-[0.55em] font-extrabold leading-none ${currency === 'SUI' ? 'bg-[#4DA2FF] text-white' : 'bg-gold text-[#14192a]'} ${className}`}
        aria-hidden
      >
        {currency === 'SUI' ? 'S' : 'L'}
      </span>
    );
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={CURRENCY[currency].chip} alt="" aria-hidden className={`inline-block shrink-0 rounded-full object-contain ${className}`} onError={() => setBroken(true)} />
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
 * An amount in one currency, always with its coin chip and code ("12.50 LOFI"). `animate` counts the
 * number up when it changes (display only; the screen reader label always carries the exact amount).
 */
export function Amount({ minor, currency, sign, className = '', coin = true, code = true, animate = false, from }: { minor: number; currency: Currency; sign?: boolean; className?: string; coin?: boolean; code?: boolean; animate?: boolean; from?: number }) {
  const neg = minor < 0;
  return (
    <span className={`inline-flex items-center gap-1 tabular font-semibold ${className}`} aria-label={`${neg ? 'lost ' : ''}${formatAmount(Math.abs(minor), currency)}`}>
      {coin ? <CoinChip currency={currency} className="size-[1.05em]" /> : null}
      {animate ? <CountUp value={minor} from={from} format={(n) => formatNumber(Math.round(n), { sign })} /> : <span>{formatNumber(minor, { sign })}</span>}
      {code ? <span className="text-[0.72em] font-bold opacity-75">{currency}</span> : null}
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
/** Night sky over the mountain lounge: soft aurora, stars, distant peaks and gentle falling snow. */
export function Cosmos({ snow = true }: { snow?: boolean }) {
  return (
    <div className="cosmos" aria-hidden>
      <div className="cosmos-nebula" />
      <div className="cosmos-light" />
      <div className="cosmos-stars" />
      <svg className="absolute inset-x-0 bottom-0 h-[34vh] w-full opacity-[0.22]" viewBox="0 0 1440 300" preserveAspectRatio="none">
        <path d="M0 300V190l120-70 90 50 160-120 110 80 90-40 170 130 120-90 140 70 150-110 130 90 160-60v190Z" fill="var(--surface-2)" />
        <path d="M0 300v-60l180-60 150 70 210-90 160 80 200-70 170 60 190-50 180 70v50Z" fill="var(--surface)" opacity="0.9" />
      </svg>
      {snow ? (
        <>
          <div className="snowfall snowfall-1" />
          <div className="snowfall snowfall-2" />
        </>
      ) : null}
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

export type MascotPose = 'neutral' | 'win' | 'deal' | 'shrug';
const MASCOT_ALT: Record<MascotPose, string> = {
  neutral: 'Lucky Lo, the Cold Call dealer, holding a chip',
  win: 'Lucky Lo grinning with a fist pump',
  deal: 'Lucky Lo dealing a fan of cards',
  shrug: 'Lucky Lo shrugging, palms up',
};
/** Lucky Lo, the mascot. Decorative by default (empty alt); pass `label` to announce him. */
export function Mascot({ pose = 'neutral', className = 'size-24', label = false, priority = false }: { pose?: MascotPose; className?: string; label?: boolean; priority?: boolean }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/brand/mascot-${pose}.png`}
      alt={label ? MASCOT_ALT[pose] : ''}
      aria-hidden={label ? undefined : true}
      loading={priority ? 'eager' : 'lazy'}
      decoding="async"
      draggable={false}
      className={`pointer-events-none select-none object-contain ${className}`}
    />
  );
}

export function Empty({ title, text, action, pose = 'shrug' }: { title: string; text: string; action?: ReactNode; pose?: MascotPose }) {
  return (
    <div className="glass relative flex flex-col items-center gap-3 overflow-hidden rounded-card px-6 pb-12 pt-6 text-center">
      <span className="spill pointer-events-none absolute inset-0" aria-hidden />
      <span className="relative grid size-32 place-items-center">
        <span className="absolute inset-4 rounded-full bg-accent/20 blur-2xl" aria-hidden />
        <Mascot pose={pose} className="relative size-32" />
      </span>
      <p className="t-title relative">{title}</p>
      <p className="relative max-w-sm text-text-2">{text}</p>
      {action ? <div className="relative mt-1">{action}</div> : null}
    </div>
  );
}

/** The CC snow chip, Cold Call's small mark. */
export function Logo({ className = 'size-8' }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/img/cc-chip.png" alt="" aria-hidden className={`shrink-0 select-none object-contain ${className}`} draggable={false} />
  );
}

/** The COLD CALL wordmark (icy letters, Ink outline, icicles). The image carries the name for screen readers. */
export function Wordmark({ className = '', height = 30 }: { className?: string; height?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/brand/logo.png" alt="Cold Call" width={Math.round((height * 1200) / 297)} height={height} className={`inline-block select-none object-contain ${className}`} draggable={false} />
  );
}
