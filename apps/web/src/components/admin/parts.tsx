'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { Button, Card, Credits, InfoTip, Skeleton } from '@/components/ui';
import { ACCOUNT_KIND, explorer, fmtDate, short, TX_KIND, useAdminConfig } from './data';

/* ---------- navigation ---------- */

const TABS = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/accounts', label: 'Accounts' },
  { href: '/admin/games', label: 'Games' },
  { href: '/admin/money', label: 'Money' },
];

export function AdminTabs() {
  const path = usePathname();
  const on = (h: string) => (h === '/admin' ? path === '/admin' : path === h || path.startsWith(h + '/'));
  return (
    <nav aria-label="Admin sections" className="-mx-4 overflow-x-auto px-4 no-scrollbar sm:mx-0 sm:px-0">
      <div className="glass inline-flex gap-1 rounded-[16px] p-1">
        {TABS.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            aria-current={on(t.href) ? 'page' : undefined}
            className={`press inline-flex h-10 items-center rounded-[12px] px-4 text-[15px] font-semibold transition-colors ${on(t.href) ? 'btn-primary' : 'text-text-2 hover:bg-well-hover hover:text-text'}`}
          >
            {t.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}

/* ---------- panels and tiles ---------- */

export function Panel({ title, info, action, children, className = '', pad = true }: { title: ReactNode; info?: string; action?: ReactNode; children: ReactNode; className?: string; pad?: boolean }) {
  return (
    <Card className={`min-w-0 ${className}`}>
      <div className="flex items-center justify-between gap-3 px-4 pt-4 sm:px-5">
        <h2 className="inline-flex min-w-0 items-center gap-1 font-display text-[15px] font-bold uppercase tracking-[-0.01em]">
          <span className="truncate">{title}</span>
          {info ? <InfoTip text={info} label={`About ${typeof title === 'string' ? title : 'this'}`} /> : null}
        </h2>
        {action}
      </div>
      <div className={pad ? 'px-4 pb-4 pt-3 sm:px-5 sm:pb-5' : 'pt-3'}>{children}</div>
    </Card>
  );
}

export function Kpi({ label, value, sub, info, tone, href }: { label: string; value: ReactNode; sub?: ReactNode; info: string; tone?: 'good' | 'bad' | 'warn'; href?: string }) {
  const body = (
    <>
      <p className="inline-flex items-center gap-1 text-[13px] font-medium text-text-2">
        {label}
        <InfoTip text={info} label={`About ${label}`} />
      </p>
      <div className={`mt-1 font-display text-[22px] font-bold leading-tight tabular sm:text-[24px] ${tone === 'good' ? 'text-win' : tone === 'bad' ? 'text-loss' : tone === 'warn' ? 'text-warn' : ''}`}>{value}</div>
      {sub ? <p className="mt-1 text-[13px] text-text-2">{sub}</p> : null}
    </>
  );
  return (
    <Card className="min-w-0 p-4" tint={tone === 'bad' ? 'var(--loss)' : tone === 'warn' ? 'var(--warn)' : undefined}>
      {body}
      {href ? (
        <Link href={href} className="mt-2 inline-block text-[13px] font-semibold text-primary hover:underline">
          Open
        </Link>
      ) : null}
    </Card>
  );
}

export function Pill({ children, tone = 'neutral', title }: { children: ReactNode; tone?: 'neutral' | 'good' | 'bad' | 'warn' | 'accent'; title?: string }) {
  const c = {
    neutral: 'text-text-2 [box-shadow:inset_0_0_0_1px_var(--well-line)]',
    good: 'text-win bg-[color-mix(in_srgb,var(--win)_12%,transparent)]',
    bad: 'text-loss bg-[color-mix(in_srgb,var(--loss)_14%,transparent)]',
    warn: 'text-warn bg-[color-mix(in_srgb,var(--warn)_14%,transparent)]',
    accent: 'text-text bg-[color-mix(in_srgb,var(--accent)_28%,transparent)]',
  }[tone];
  return (
    <span title={title} className={`inline-flex h-6 shrink-0 items-center whitespace-nowrap rounded-full px-2.5 text-[12px] font-semibold ${c}`}>
      {children}
    </span>
  );
}

/** Signed credits: win colour for plus, loss colour for minus, words for screen readers come from Credits. */
export function Net({ minor, className = '' }: { minor: number; className?: string }) {
  return <Credits minor={minor} sign className={`${minor > 0 ? 'text-win' : minor < 0 ? 'text-loss' : 'text-text-2'} ${className}`} />;
}

/* ---------- states ---------- */

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Card className="flex flex-col items-start gap-3 p-5 sm:flex-row sm:items-center sm:justify-between" tint="var(--loss)">
      <div>
        <p className="font-semibold">That did not load</p>
        <p className="text-sm text-text-2">{message}</p>
      </div>
      {onRetry ? (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </Card>
  );
}

export function RowsSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-11 rounded-chip" />
      ))}
    </div>
  );
}

export function EmptyRow({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-chip bg-well px-4 py-8 text-center">
      <span className="text-[22px]" aria-hidden>
        ∅
      </span>
      <p className="text-sm text-text-2">{text}</p>
    </div>
  );
}

/* ---------- tables ---------- */

export interface Col<T> {
  key: string;
  label: ReactNode;
  info?: string;
  align?: 'right';
  className?: string;
  render: (r: T) => ReactNode;
}

/** Wide data table that scrolls sideways inside its card on small screens. */
export function DataTable<T>({ cols, rows, rowKey, href, empty, caption }: { cols: Col<T>[]; rows: T[]; rowKey: (r: T) => string; href?: (r: T) => string; empty: string; caption: string }) {
  if (!rows.length) return <EmptyRow text={empty} />;
  return (
    <div className="-mx-4 overflow-x-auto sm:-mx-5">
      <table className="w-full min-w-max border-separate border-spacing-0 text-[14px]">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="text-left text-[12px] font-semibold uppercase tracking-[0.06em] text-text-2">
            {cols.map((c, i) => (
              <th key={c.key} scope="col" className={`whitespace-nowrap border-b border-well-line py-2 pr-4 font-semibold ${i === 0 ? 'pl-4 sm:pl-5' : ''} ${c.align === 'right' ? 'text-right' : ''}`}>
                <span className={`inline-flex items-center gap-0.5 ${c.align === 'right' ? 'flex-row-reverse' : ''}`}>
                  {c.label}
                  {c.info ? <InfoTip text={c.info} /> : null}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const link = href?.(r);
            return (
              <tr key={rowKey(r)} className="group">
                {cols.map((c, i) => (
                  <td
                    key={c.key}
                    className={`whitespace-nowrap border-b border-well-line py-2.5 pr-4 align-middle group-hover:bg-well ${i === 0 ? 'pl-4 sm:pl-5' : ''} ${c.align === 'right' ? 'text-right tabular' : ''} ${c.className ?? ''}`}
                  >
                    {i === 0 && link ? (
                      <Link href={link} className="font-semibold hover:text-primary hover:underline">
                        {c.render(r)}
                      </Link>
                    ) : (
                      c.render(r)
                    )}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function Pager({ page, limit, total, onPage, loading }: { page: number; limit: number; total: number; onPage: (p: number) => void; loading?: boolean }) {
  const pages = Math.max(1, Math.ceil(total / limit));
  const from = total ? (page - 1) * limit + 1 : 0;
  const to = Math.min(total, page * limit);
  return (
    <div className="mt-3 flex items-center justify-between gap-3 text-sm text-text-2">
      <span className="tabular" aria-live="polite">
        {total ? `${from} to ${to} of ${total.toLocaleString('en-US')}` : 'No results'}
        {loading ? ', loading' : ''}
      </span>
      <span className="flex gap-2">
        <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
          Previous
        </Button>
        <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page">
          Next
        </Button>
      </span>
    </div>
  );
}

/* ---------- filters ---------- */

export function Field({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`flex min-w-0 flex-col gap-1 text-[13px] font-medium text-text-2 ${className}`}>
      {label}
      {children}
    </label>
  );
}
const inputCls = 'h-11 w-full min-w-0 rounded-chip bg-well px-3 text-[15px] text-text outline-none [box-shadow:inset_0_0_0_1px_var(--well-line)] focus:[box-shadow:inset_0_0_0_2px_var(--primary)]';

export function Select({ value, onChange, options, label }: { value: string; onChange: (v: string) => void; options: [string, string][]; label: string }) {
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className={`${inputCls} pr-8`}>
      {options.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );
}

/** Text input that reports its value after the user stops typing for 300ms. */
export function SearchInput({ value, onChange, placeholder, label }: { value: string; onChange: (v: string) => void; placeholder?: string; label: string }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  useEffect(() => {
    if (v === value) return;
    const t = setTimeout(() => onChange(v.trim()), 300);
    return () => clearTimeout(t);
  }, [v, value, onChange]);
  return <input type="search" aria-label={label} value={v} placeholder={placeholder} onChange={(e) => setV(e.target.value)} className={inputCls} />;
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputCls} ${props.className ?? ''}`} />;
}

/* ---------- money and chain bits ---------- */

export function Addr({ value, kind = 'address', chars = 4 }: { value: string | null | undefined; kind?: 'address' | 'tx'; chars?: number }) {
  const cfg = useAdminConfig();
  const [copied, setCopied] = useState(false);
  if (!value) return <span className="text-text-2">None</span>;
  return (
    <span className="inline-flex items-center gap-1">
      <a href={explorer(cfg, kind, value)} target="_blank" rel="noreferrer" className="font-mono text-[13px] hover:text-primary hover:underline" title={`${value}, open in Solana Explorer`}>
        {short(value, chars, chars)}
      </a>
      <button
        type="button"
        onClick={() => {
          navigator.clipboard?.writeText(value).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          });
        }}
        aria-label={copied ? 'Copied' : 'Copy full value'}
        className="inline-flex size-7 items-center justify-center rounded-full text-text-2 hover:bg-well-hover hover:text-text"
      >
        {copied ? (
          <svg viewBox="0 0 20 20" className="size-3.5" fill="currentColor" aria-hidden>
            <path d="M7.6 13.6 4.3 10.3a1 1 0 0 0-1.4 1.4l4 4a1 1 0 0 0 1.4 0l8.8-8.8a1 1 0 0 0-1.4-1.4l-8.1 8.1Z" />
          </svg>
        ) : (
          <svg viewBox="0 0 20 20" className="size-3.5" fill="currentColor" aria-hidden>
            <path d="M7 3a2 2 0 0 0-2 2v1H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2v-1h1a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H7Zm4 11v1H4V8h1v4a2 2 0 0 0 2 2h4Zm3-2H7V5h7v7Z" />
          </svg>
        )}
      </button>
    </span>
  );
}

export interface Leg {
  account: string;
  userId: string | null;
  tableId: string | null;
  amount: number;
}

/** The legs of one ledger transaction. They always add up to zero. */
export function Legs({ legs, focusUser }: { legs: Leg[]; focusUser?: string }) {
  return (
    <div className="min-w-[260px] space-y-0.5">
      {legs.map((l, i) => (
        <div key={i} className={`flex items-center justify-between gap-4 text-[13px] ${focusUser && l.userId === focusUser ? 'font-semibold text-text' : 'text-text-2'}`}>
          <span>
            {ACCOUNT_KIND[l.account] ?? l.account}
            {l.userId && l.userId !== focusUser ? (
              <Link href={`/admin/accounts/${l.userId}`} className="ml-1 text-text-2 underline decoration-dotted hover:text-primary">
                {short(l.userId, 4, 0)}
              </Link>
            ) : null}
            {l.tableId ? (
              <Link href={`/admin/games/${l.tableId}`} className="ml-1 text-text-2 underline decoration-dotted hover:text-primary">
                game {short(l.tableId, 4, 0)}
              </Link>
            ) : null}
          </span>
          <Credits minor={l.amount} sign coin={false} className={l.amount > 0 ? 'text-text' : ''} />
        </div>
      ))}
    </div>
  );
}

export const txLabel = (k: string) => TX_KIND[k] ?? k;

/* ---------- accounts ---------- */

export interface AccountRow {
  id: string;
  display_name: string;
  wallet_address: string;
  wallet_kind: string;
  role: string;
  created_at: string;
  onboarded: boolean;
  cooloff: boolean;
  cooloff_until: string | null;
  excluded: boolean;
  excluded_until: string | null;
  has_limits: boolean;
  available: number;
  locked: number;
  games: number;
  net: number;
  deposits: number;
  deposit_count: number;
  withdrawals: number;
  withdrawal_count: number;
  last_active: string | null;
}

export const WALLET_KIND: Record<string, string> = { external: 'Own wallet', embedded: 'Guest wallet', privy: 'Email or Google' };

export function SaferPlay({ r }: { r: Pick<AccountRow, 'cooloff' | 'excluded' | 'has_limits' | 'cooloff_until' | 'excluded_until'> }) {
  if (!r.cooloff && !r.excluded && !r.has_limits) return <span className="text-text-2">None set</span>;
  return (
    <span className="inline-flex gap-1">
      {r.excluded ? <Pill tone="bad" title={`Until ${fmtDate(r.excluded_until)}`}>Self excluded</Pill> : null}
      {r.cooloff ? <Pill tone="warn" title={`Until ${fmtDate(r.cooloff_until)}`}>Cool off</Pill> : null}
      {r.has_limits ? <Pill>Limits set</Pill> : null}
    </span>
  );
}

