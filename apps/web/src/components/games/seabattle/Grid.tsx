'use client';
import { forwardRef, useImperativeHandle, useRef, type PointerEvent as RPointerEvent, type ReactNode } from 'react';
import type { SbMark, SbShip } from '@coldcall/games/seabattle';
import { C, COLORS, GRID, M, OceanDefs, ShipShape, VB, shipTransform, type ShipLook } from './art';

export const COLS = 'ABCDEFGHIJ';
export const cellName = (row: number, col: number) => `${COLS[col]}${row + 1}`;

export interface GridShip {
  ship: SbShip;
  look: ShipLook;
  /** Wrap the ship (for animation or pointer handlers). */
  wrap?: (node: ReactNode) => ReactNode;
}

export interface GridHandle {
  /** Fractional grid coordinates (row, col) of a client point; may be outside 0..10. */
  toCell(clientX: number, clientY: number): { r: number; c: number } | null;
  /** Size of one cell in CSS pixels. */
  cellPx(): number;
  el(): SVGSVGElement | null;
}

export interface GridProps {
  uid: string;
  marks?: SbMark[];
  ships?: GridShip[];
  /** Cells to tint red (placement conflicts). */
  badCells?: Set<number>;
  aim?: { row: number; col: number } | null;
  aimActive?: boolean;
  lastShot?: { row: number; col: number } | null;
  radar?: boolean;
  compact?: boolean;
  /** Cursor and pointer handlers on the water. */
  interactive?: boolean;
  onCellDown?: (row: number, col: number, e: RPointerEvent) => void;
  /** Tap (pointer up close to where it went down). Scroll gestures cancel it. */
  onCellTap?: (row: number, col: number) => void;
  onCellMove?: (row: number, col: number) => void;
  onLeave?: () => void;
  children?: ReactNode;
  /** Rendered under ships (placement preview). */
  under?: ReactNode;
  className?: string;
  label: string;
}

/** Sonar style 10 by 10 grid, drawn in SVG. Coordinates A to J across the top, 1 to 10 down the side. */
export const Grid = forwardRef<GridHandle, GridProps>(function Grid(
  { uid, marks, ships = [], badCells, aim, aimActive, lastShot, radar, compact, interactive, onCellDown, onCellTap, onCellMove, onLeave, children, under, className = '', label },
  ref,
) {
  const svg = useRef<SVGSVGElement>(null);
  const downAt = useRef<{ x: number; y: number } | null>(null);
  const toCell = (x: number, y: number) => {
    const el = svg.current;
    const m = el?.getScreenCTM();
    if (!el || !m) return null;
    const p = new DOMPoint(x, y).matrixTransform(m.inverse());
    return { r: (p.y - M) / C, c: (p.x - M) / C };
  };
  useImperativeHandle(ref, () => ({
    toCell,
    cellPx: () => {
      const r = svg.current?.getBoundingClientRect();
      return r ? (r.width / VB) * C : 32;
    },
    el: () => svg.current,
  }));

  const cellOf = (e: RPointerEvent) => {
    const p = toCell(e.clientX, e.clientY);
    if (!p) return null;
    const row = Math.floor(p.r);
    const col = Math.floor(p.c);
    return row >= 0 && row < 10 && col >= 0 && col < 10 ? { row, col } : null;
  };

  const fs = compact ? 15 : 13;
  return (
    <svg ref={svg} viewBox={`0 0 ${VB} ${VB}`} className={`block h-auto w-full select-none ${className}`} role="img" aria-label={label} style={{ touchAction: interactive ? (onCellDown ? 'none' : 'manipulation') : undefined }}>
      <OceanDefs uid={uid} />
      {/* Coordinates */}
      <g fontFamily="var(--font-sans), system-ui" fontWeight={700} fontSize={fs} fill={COLORS.label} textAnchor="middle">
        {Array.from(COLS).map((L, i) => (
          <text key={L} x={M + i * C + C / 2} y={M - 8}>
            {L}
          </text>
        ))}
        {Array.from({ length: 10 }, (_, i) => (
          <text key={i} x={M / 2 - 1} y={M + i * C + C / 2 + fs / 3}>
            {i + 1}
          </text>
        ))}
      </g>
      <g transform={`translate(${M} ${M})`}>
        <clipPath id={`${uid}-clip`}>
          <rect width={GRID} height={GRID} rx={10} />
        </clipPath>
        <g clipPath={`url(#${uid}-clip)`}>
          <rect width={GRID} height={GRID} fill={`url(#${uid}-sea)`} />
          <g>
            <rect x={0} y={0} width={GRID + 160} height={GRID} fill={`url(#${uid}-waves)`} />
          </g>
          <g opacity={0.6} transform="translate(-37 0)">
            <rect x={0} y={9} width={GRID + 160} height={GRID} fill={`url(#${uid}-waves)`} />
          </g>
          {radar ? <Radar uid={uid} /> : null}
          {/* Grid lines */}
          <g stroke={COLORS.gridLine} strokeWidth={1}>
            {Array.from({ length: 9 }, (_, i) => (
              <line key={`v${i}`} x1={(i + 1) * C} y1={0} x2={(i + 1) * C} y2={GRID} />
            ))}
            {Array.from({ length: 9 }, (_, i) => (
              <line key={`h${i}`} x1={0} y1={(i + 1) * C} x2={GRID} y2={(i + 1) * C} />
            ))}
          </g>
          <g stroke={COLORS.gridLineStrong} strokeWidth={1.5}>
            <line x1={GRID / 2} y1={0} x2={GRID / 2} y2={GRID} strokeDasharray="2 6" />
            <line x1={0} y1={GRID / 2} x2={GRID} y2={GRID / 2} strokeDasharray="2 6" />
          </g>
          {badCells
            ? [...badCells].map((i) => <rect key={`bad${i}`} x={(i % 10) * C + 1} y={Math.floor(i / 10) * C + 1} width={C - 2} height={C - 2} rx={5} fill="rgba(255, 90, 110, 0.32)" />)
            : null}
          {under}
          {/* Misses and known empty squares sit under the ships */}
          {marks?.map((m, i) => {
            const x = (i % 10) * C + C / 2;
            const y = Math.floor(i / 10) * C + C / 2;
            if (m === 'miss')
              return (
                <g key={i}>
                  <path d={`M${x - 12} ${y + 6} L${x - 4} ${y + 2} L${x + 3} ${y + 5} L${x + 12} ${y - 2}`} fill="none" stroke="rgba(47, 111, 208, 0.45)" strokeWidth={1} strokeLinecap="round" />
                  <circle cx={x - 3} cy={y} r={5.5} fill="#ffffff" stroke="rgba(90, 143, 224, 0.55)" strokeWidth={1} />
                  <circle cx={x + 3.5} cy={y - 2} r={4.5} fill="#ffffff" stroke="rgba(90, 143, 224, 0.55)" strokeWidth={1} />
                  <circle cx={x + 1} cy={y + 3} r={4} fill="#ffffff" />
                </g>
              );
            if (m === 'auto') return <circle key={i} cx={x} cy={y} r={2.6} fill="rgba(47, 111, 208, 0.35)" />;
            return null;
          })}
          {ships.map((s) => {
            const node = (
              <g key={s.ship.id} transform={shipTransform(s.ship.row, s.ship.col, s.ship.dir)}>
                <ShipShape id={s.ship.id} look={s.look} />
              </g>
            );
            return s.wrap ? <g key={s.ship.id}>{s.wrap(node)}</g> : node;
          })}
          {/* Hits burn on top of the ships */}
          {marks?.map((m, i) => {
            if (m !== 'hit' && m !== 'sunk') return null;
            const x = (i % 10) * C + C / 2;
            const y = Math.floor(i / 10) * C + C / 2;
            return <Burn key={`b${i}`} uid={uid} x={x} y={y} sunk={m === 'sunk'} seed={i} />;
          })}
          {lastShot ? (
            <rect x={lastShot.col * C + 2} y={lastShot.row * C + 2} width={C - 4} height={C - 4} rx={6} fill="none" stroke="#2F6FD0" strokeWidth={1.8} strokeDasharray="4 4" />
          ) : null}
          {aim ? <Crosshair row={aim.row} col={aim.col} active={!!aimActive} /> : null}
          {children}
        </g>
        <rect width={GRID} height={GRID} rx={10} fill="none" stroke={COLORS.gridLineStrong} strokeWidth={2} />
        {interactive ? (
          <rect
            width={GRID}
            height={GRID}
            fill="transparent"
            style={{ cursor: 'crosshair' }}
            onPointerDown={(e) => {
              downAt.current = { x: e.clientX, y: e.clientY };
              const c = cellOf(e);
              if (c) onCellDown?.(c.row, c.col, e);
            }}
            onPointerUp={(e) => {
              const d = downAt.current;
              downAt.current = null;
              if (!d || !onCellTap || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 8) return;
              const c = cellOf(e);
              if (c) onCellTap(c.row, c.col);
            }}
            onPointerCancel={() => {
              downAt.current = null;
            }}
            onPointerMove={(e) => {
              if (e.pointerType !== 'mouse') return;
              const c = cellOf(e);
              if (c) onCellMove?.(c.row, c.col);
            }}
            onPointerLeave={() => onLeave?.()}
          />
        ) : null}
      </g>
    </svg>
  );
});

function Radar({ uid }: { uid: string }) {
  const R = GRID * 0.72;
  const cx = GRID / 2;
  return (
    <g pointerEvents="none">
      {[0.18, 0.36, 0.54, 0.72].map((f) => (
        <circle key={f} cx={cx} cy={cx} r={GRID * f} fill="none" stroke="rgba(127, 227, 255, 0.14)" strokeWidth={1.2} />
      ))}
      <g className="sb-sweep" style={{ transformOrigin: `${cx}px ${cx}px` }}>
        <path d={`M${cx} ${cx} L${cx + R} ${cx} A${R} ${R} 0 0 0 ${cx + R * Math.cos(-0.7)} ${cx + R * Math.sin(-0.7)} Z`} fill={`url(#${uid}-sweep)`} />
        <line x1={cx} y1={cx} x2={cx + R} y2={cx} stroke="rgba(127, 227, 255, 0.55)" strokeWidth={1.5} />
      </g>
    </g>
  );
}

function Crosshair({ row, col, active }: { row: number; col: number; active: boolean }) {
  const x = col * C + C / 2;
  const y = row * C + C / 2;
  const col1 = active ? '#2F6FD0' : 'rgba(47, 111, 208, 0.5)';
  return (
    <g pointerEvents="none" style={{ filter: active ? 'drop-shadow(0 0 4px rgba(127, 227, 255,0.8))' : undefined }}>
      <rect x={col * C} y={0} width={C} height={GRID} fill="rgba(127, 227, 255, 0.05)" />
      <rect x={0} y={row * C} width={GRID} height={C} fill="rgba(127, 227, 255, 0.05)" />
      <circle cx={x} cy={y} r={14} fill="none" stroke={col1} strokeWidth={2.2} />
      <circle cx={x} cy={y} r={2.5} fill={col1} />
      {[
        [0, -1],
        [0, 1],
        [-1, 0],
        [1, 0],
      ].map(([dx, dy], k) => (
        <line key={k} x1={x + dx! * 8} y1={y + dy! * 8} x2={x + dx! * 21} y2={y + dy! * 21} stroke={col1} strokeWidth={2.2} strokeLinecap="round" />
      ))}
    </g>
  );
}

/** A hit cracks the ice open in a star and shows dark water. A sunk square is an open hole that slowly refreezes. */
function Burn({ uid, x, y, sunk, seed }: { uid: string; x: number; y: number; sunk: boolean; seed: number }) {
  const rot = (seed * 37) % 360;
  const rays = Array.from({ length: 6 }, (_, k) => {
    const a = ((rot + k * 60 + (k % 2) * 14) * Math.PI) / 180;
    const len = 14 + (k % 3) * 4;
    return `M${x + Math.cos(a) * 6} ${y + Math.sin(a) * 6}L${x + Math.cos(a) * len} ${y + Math.sin(a) * len}`;
  }).join('');
  return (
    <g pointerEvents="none">
      <path d={rays} stroke="#ffffff" strokeWidth={2.2} strokeLinecap="round" opacity={0.95} />
      <path d={rays} stroke="#2F6FD0" strokeWidth={0.9} strokeLinecap="round" opacity={0.7} />
      <circle cx={x} cy={y} r={sunk ? 15 : 10} fill={`url(#${uid}-scorch)`} />
      <path d={`M${x - 7} ${y - 3} L${x - 2} ${y - 8} L${x + 6} ${y - 6} L${x + 8} ${y + 2} L${x + 2} ${y + 8} L${x - 6} ${y + 6} Z`} fill={COLORS.fire} stroke="#BFF1FF" strokeWidth={1.2} strokeLinejoin="round" />
      {sunk ? <circle cx={x} cy={y} r={9} fill="none" stroke="rgba(242, 247, 252, 0.6)" strokeWidth={2} strokeDasharray="3 3" /> : null}
    </g>
  );
}
