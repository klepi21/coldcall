'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { fmtDay } from './data';

/*
 * Hand built SVG charts for the admin dashboard.
 * Honest by construction: the y axis always starts at zero, one axis per chart, every day of the
 * window is present (the server fills empty days with zero), a legend whenever there are two or
 * more series, a tooltip on hover or tap, and a screen reader table with the same numbers.
 */

export interface Series {
  key: string;
  label: string;
  color: string;
}
type Row = { d: string } & Record<string, number | string>;

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.floor(e!.contentRect.width)));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/** A round upper bound and tick step (1, 2 or 5 times a power of ten), about four ticks. */
export function niceScale(max: number, integer: boolean) {
  if (!(max > 0)) return { top: integer ? 4 : 1, step: integer ? 1 : 0.25 };
  const raw = max / 4;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  let step = [1, 2, 5, 10].map((m) => m * p).find((s) => s >= raw) ?? 10 * p;
  if (integer) step = Math.max(1, Math.ceil(step));
  return { top: Math.ceil(max / step) * step, step };
}

const num = (v: unknown) => (typeof v === 'number' ? v : Number(v) || 0);

export function TimeChart({
  title,
  data,
  series,
  kind = 'bar',
  format,
  integer = true,
  height = 200,
  scale = 1,
}: {
  title: string;
  data: Row[];
  series: Series[];
  /** bar: stacked when several series; group: side by side; line: line with a soft area. */
  kind?: 'bar' | 'group' | 'line';
  format: (n: number) => string;
  /** Integer ticks (counts). For money pass false and `scale` 100 to show coins from minor units. */
  integer?: boolean;
  height?: number;
  /** Values are divided by this for the axis (minor units to coins). Tooltips use `format` on raw values. */
  scale?: number;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const n = data.length;
  const stacked = kind === 'bar' && series.length > 1;

  const totals = useMemo(() => data.map((r) => series.reduce((s, x) => s + num(r[x.key]), 0)), [data, series]);
  const max = useMemo(() => {
    if (stacked) return Math.max(0, ...totals);
    return Math.max(0, ...data.flatMap((r) => series.map((x) => num(r[x.key]))));
  }, [data, series, stacked, totals]);
  const empty = max === 0;
  const { top, step } = niceScale(max / scale, integer);
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const tickLabel = (t: number) => (Math.abs(t) >= 1000 ? `${+(t / 1000).toFixed(1)}k` : integer ? String(t) : t.toLocaleString('en-US', { maximumFractionDigits: 2 }));
  const left = Math.max(28, Math.max(...ticks.map((t) => tickLabel(t).length)) * 7 + 12);
  const right = 8;
  const topPad = 10;
  const bottom = 26;
  const plotW = Math.max(10, width - left - right);
  const plotH = height - topPad - bottom;
  const band = plotW / Math.max(1, n);
  const y = (v: number) => topPad + plotH - (v / scale / top) * plotH;
  const labelEvery = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(plotW / 58))));

  const barW = Math.max(2, Math.min(22, band * 0.68));
  const pick = (clientX: number) => {
    const el = ref.current;
    if (!el) return;
    const x = clientX - el.getBoundingClientRect().left - left;
    const i = Math.floor(x / band);
    setHover(i >= 0 && i < n ? i : null);
  };

  const h = hover !== null ? data[hover] : null;
  const tipLeft = hover !== null ? Math.min(Math.max(left + band * hover + band / 2, 90), Math.max(90, width - 90)) : 0;

  return (
    <figure className="relative">
      {series.length > 1 ? (
        <figcaption className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-text-2">
          {series.map((s) => (
            <span key={s.key} className="inline-flex items-center gap-1.5">
              <span className="inline-block size-2.5 rounded-[3px]" style={{ background: s.color }} aria-hidden />
              {s.label}
            </span>
          ))}
        </figcaption>
      ) : null}
      <div
        ref={ref}
        className="relative touch-pan-y select-none"
        style={{ height }}
        onPointerMove={(e) => pick(e.clientX)}
        onPointerDown={(e) => pick(e.clientX)}
        onPointerLeave={(e) => e.pointerType === 'mouse' && setHover(null)}
      >
        {width > 0 ? (
          <svg width={width} height={height} role="img" aria-label={`${title}. ${empty ? 'No data in this period.' : `Highest day ${format(stacked ? Math.max(...totals) : max)}.`} Full numbers in the table below.`}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={left} x2={width - right} y1={y(t * scale)} y2={y(t * scale)} stroke="var(--well-line)" strokeWidth={1} strokeDasharray={t === 0 ? undefined : '2 4'} />
                <text x={left - 8} y={y(t * scale)} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--text-2)" className="tabular">
                  {tickLabel(t)}
                </text>
              </g>
            ))}
            {hover !== null ? <rect x={left + band * hover} y={topPad} width={band} height={plotH} fill="var(--well-hover)" rx={4} /> : null}

            {kind === 'line'
              ? series.map((s) => {
                  const pts = data.map((r, i) => [left + band * i + band / 2, y(num(r[s.key]))] as const);
                  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('');
                  const area = `${line}L${pts[pts.length - 1]![0].toFixed(1)},${y(0)}L${pts[0]![0].toFixed(1)},${y(0)}Z`;
                  return (
                    <g key={s.key}>
                      {series.length === 1 ? <path d={area} fill={s.color} opacity={0.12} /> : null}
                      <path d={line} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                      {hover !== null ? <circle cx={pts[hover]![0]} cy={pts[hover]![1]} r={4.5} fill={s.color} stroke="var(--bg)" strokeWidth={2} /> : null}
                    </g>
                  );
                })
              : data.map((r, i) => {
                  const cx = left + band * i + band / 2;
                  if (kind === 'group') {
                    const k = series.length;
                    const w = Math.max(2, (barW - 2 * (k - 1)) / k);
                    return (
                      <g key={r.d}>
                        {series.map((s, j) => {
                          const v = num(r[s.key]);
                          if (!v) return null;
                          const yy = y(v);
                          return <rect key={s.key} x={cx - barW / 2 + j * (w + 2)} y={yy} width={w} height={Math.max(1, y(0) - yy)} rx={Math.min(3, w / 2)} fill={s.color} />;
                        })}
                      </g>
                    );
                  }
                  let acc = 0;
                  return (
                    <g key={r.d}>
                      {series.map((s) => {
                        const v = num(r[s.key]);
                        if (!v) return null;
                        const y0 = y(acc);
                        acc += v;
                        const y1 = y(acc);
                        const gap = y0 < y(0) ? 2 : 0; // 2px surface gap between stacked segments
                        return <rect key={s.key} x={cx - barW / 2} y={y1} width={barW} height={Math.max(1, y0 - y1 - gap)} rx={Math.min(3, barW / 2)} fill={s.color} />;
                      })}
                    </g>
                  );
                })}

            {data.map((r, i) =>
              i % labelEvery === 0 || i === n - 1 ? (
                i === n - 1 || n - 1 - i >= labelEvery * 0.6 ? (
                  <text key={r.d} x={i === n - 1 ? Math.min(left + band * i + band / 2 + 6, width - 2) : left + band * i + band / 2} y={height - 8} textAnchor={i === n - 1 ? 'end' : 'middle'} fontSize={11} fill="var(--text-2)">
                    {fmtDay(r.d)}
                  </text>
                ) : null
              ) : null,
            )}
          </svg>
        ) : null}
        {empty && width > 0 ? (
          <p className="pointer-events-none absolute inset-x-0 top-[38%] text-center text-sm text-text-2">Nothing yet in the last 30 days</p>
        ) : null}
        {h ? (
          <div role="presentation" className="glass glass-strong pointer-events-none absolute top-0 z-10 w-[176px] -translate-x-1/2 rounded-chip px-3 py-2 text-[13px] shadow-modal" style={{ left: tipLeft }}>
            <p className="mb-1 font-semibold">{fmtDay(h.d)} (UTC)</p>
            {series.map((s) => (
              <p key={s.key} className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-text-2">
                  <span className="inline-block size-2 rounded-[2px]" style={{ background: s.color }} aria-hidden />
                  {s.label}
                </span>
                <span className="tabular font-semibold">{format(num(h[s.key]))}</span>
              </p>
            ))}
            {stacked ? (
              <p className="mt-1 flex justify-between border-t border-well-line pt-1">
                <span className="text-text-2">Total</span>
                <span className="tabular font-semibold">{format(totals[hover!]!)}</span>
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="sr-only"><table>
        <caption>{title}, per UTC day</caption>
        <thead>
          <tr>
            <th scope="col">Day</th>
            {series.map((s) => (
              <th key={s.key} scope="col">
                {s.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((r) => (
            <tr key={r.d}>
              <th scope="row">{r.d}</th>
              {series.map((s) => (
                <td key={s.key}>{format(num(r[s.key]))}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table></div>
    </figure>
  );
}

/** Thin horizontal meter: actual against a target marker. Both 0..1. */
export function Meter({ value, target, label }: { value: number | null; target: number | null; label: string }) {
  return (
    <div className="relative h-2 w-full min-w-[80px] rounded-full bg-well" role="img" aria-label={label}>
      {value !== null ? <div className="absolute inset-y-0 left-0 rounded-full bg-[var(--s-accent)]" style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }} /> : null}
      {target !== null ? <div className="absolute -top-1 h-4 w-[2px] rounded bg-text" style={{ left: `calc(${Math.min(100, Math.max(0, target * 100))}% - 1px)` }} aria-hidden /> : null}
    </div>
  );
}
