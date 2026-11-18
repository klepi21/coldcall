'use client';
import { motion } from 'motion/react';
import { C, COLORS, GRID } from './art';

/** Shell flight on a ballistic arc from the edge of the grid to the target cell. Original SVG. */
export function Shell({ row, col, from, duration }: { row: number; col: number; from: 'bottom' | 'top'; duration: number }) {
  const tx = col * C + C / 2;
  const ty = row * C + C / 2;
  const sx = GRID / 2 + (col - 4.5) * 8;
  const sy = from === 'bottom' ? GRID + 30 : -30;
  const peak = Math.min(sy, ty) - 90;
  const n = 14;
  const xs: number[] = [];
  const ys: number[] = [];
  const sc: number[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    // Quadratic bezier through a raised control point gives the arc.
    const cx = (sx + tx) / 2;
    const cy = peak;
    xs.push((1 - t) * (1 - t) * sx + 2 * (1 - t) * t * cx + t * t * tx);
    ys.push((1 - t) * (1 - t) * sy + 2 * (1 - t) * t * cy + t * t * ty);
    sc.push(1 + Math.sin(t * Math.PI) * 0.9);
  }
  return (
    <motion.g
      pointerEvents="none"
      initial={{ x: xs[0], y: ys[0], scale: 1, opacity: 1 }}
      animate={{ x: xs, y: ys, scale: sc }}
      transition={{ duration, ease: 'linear' }}
    >
      <circle r={9} fill="rgba(127, 227, 255, 0.25)" />
      <circle r={5} fill="#f6ffe0" stroke={COLORS.lime} strokeWidth={2} />
    </motion.g>
  );
}

export function Splash({ row, col, reduce }: { row: number; col: number; reduce: boolean }) {
  const x = col * C + C / 2;
  const y = row * C + C / 2;
  if (reduce)
    return <motion.circle cx={x} cy={y} r={16} fill="rgba(255,255,255,0.25)" initial={{ opacity: 1 }} animate={{ opacity: 0 }} transition={{ duration: 0.5 }} />;
  return (
    <g pointerEvents="none">
      {[0, 0.12, 0.24].map((d, k) => (
        <motion.circle
          key={k}
          cx={x}
          cy={y}
          fill="none"
          stroke="#ffffff"
          strokeWidth={2.4 - k * 0.6}
          initial={{ r: 3, opacity: 0.95 }}
          animate={{ r: 24 + k * 6, opacity: 0 }}
          transition={{ duration: 0.75, delay: d, ease: 'easeOut' }}
        />
      ))}
      {[-1, -0.4, 0.3, 1].map((dx, k) => (
        <motion.circle
          key={`d${k}`}
          cx={x}
          cy={y}
          r={2.4}
          fill="#e8f7ff"
          initial={{ x: 0, y: 0, opacity: 1 }}
          animate={{ x: dx * 16, y: [0, -18 - k * 3, -4], opacity: [1, 1, 0] }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        />
      ))}
    </g>
  );
}

export function Explosion({ row, col, big, reduce }: { row: number; col: number; big: boolean; reduce: boolean }) {
  const x = col * C + C / 2;
  const y = row * C + C / 2;
  const R = big ? 46 : 30;
  if (reduce)
    return <motion.circle cx={x} cy={y} r={R * 0.7} fill={COLORS.fire} initial={{ opacity: 0.8 }} animate={{ opacity: 0 }} transition={{ duration: 0.5 }} />;
  const sparks = big ? 12 : 8;
  return (
    <g pointerEvents="none">
      <motion.circle cx={x} cy={y} fill="#fff7d6" initial={{ r: 4, opacity: 1 }} animate={{ r: R * 0.55, opacity: 0 }} transition={{ duration: 0.28, ease: 'easeOut' }} />
      <motion.circle cx={x} cy={y} fill={COLORS.fire} initial={{ r: 6, opacity: 0.95 }} animate={{ r: R, opacity: 0 }} transition={{ duration: 0.6, ease: 'easeOut' }} />
      <motion.circle cx={x} cy={y} fill="none" stroke={COLORS.fireHot} strokeWidth={3} initial={{ r: 8, opacity: 1 }} animate={{ r: R + 12, opacity: 0 }} transition={{ duration: 0.7, ease: 'easeOut' }} />
      {Array.from({ length: sparks }, (_, k) => {
        const a = (k / sparks) * Math.PI * 2 + 0.3;
        const d = R * (0.9 + (k % 3) * 0.2);
        return (
          <motion.line
            key={k}
            x1={x}
            y1={y}
            x2={x + Math.cos(a) * 6}
            y2={y + Math.sin(a) * 6}
            stroke={k % 2 ? COLORS.fireHot : COLORS.fire}
            strokeWidth={2.6}
            strokeLinecap="round"
            initial={{ x: 0, y: 0, opacity: 1 }}
            animate={{ x: Math.cos(a) * d, y: Math.sin(a) * d, opacity: 0 }}
            transition={{ duration: 0.65, ease: 'easeOut' }}
          />
        );
      })}
    </g>
  );
}

/** Red flash over every square of a ship that just sank. */
export function SinkFlash({ cells, reduce }: { cells: { row: number; col: number }[]; reduce: boolean }) {
  return (
    <g pointerEvents="none">
      {cells.map((p, k) => (
        <motion.rect
          key={k}
          x={p.col * C + 1}
          y={p.row * C + 1}
          width={C - 2}
          height={C - 2}
          rx={6}
          fill={COLORS.fire}
          initial={{ opacity: 0.75 }}
          animate={{ opacity: 0 }}
          transition={{ duration: reduce ? 0.4 : 0.9, delay: reduce ? 0 : k * 0.06 }}
        />
      ))}
    </g>
  );
}
