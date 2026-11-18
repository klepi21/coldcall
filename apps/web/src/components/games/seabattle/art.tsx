'use client';
/**
 * Sea Battle art. Every shape here is original SVG drawn by hand for Evens (ship silhouettes seen
 * from above, sonar ocean, splash and explosion effects). No third party art, fonts or images.
 * Asset record for docs/ASSETS.md: "Sea Battle ships, ocean and effects: original SVG, Evens".
 *
 * The ocean stays dark navy in both themes (sonar screen), so the colours below are fixed and do
 * not follow the page tokens. Lime = aim, violet = your fleet, orange red = fire and explosions.
 */
import type { SbShipId } from '@evens/games/seabattle';

export const C = 40; // cell size in SVG units
export const M = 24; // label margin (letters on top, numbers on the left)
export const GRID = C * 10;
export const VB = M + GRID + 4;

export const COLORS = {
  lime: '#C6FF3D',
  violet: '#8B70FF',
  violetDeep: '#5B3DF5',
  fire: '#FF5A1F',
  fireHot: '#FFD166',
  red: '#FF4D6D',
  gridLine: 'rgba(90, 225, 255, 0.20)',
  gridLineStrong: 'rgba(90, 225, 255, 0.42)',
  label: 'rgba(170, 235, 255, 0.78)',
};

export type ShipLook = 'own' | 'sunk' | 'ownSunk' | 'ok' | 'bad' | 'dock' | 'reveal';

interface Palette {
  hull: string;
  deck: string;
  detail: string;
  stroke: string;
  strokeW: number;
  opacity: number;
}

function palette(look: ShipLook): Palette {
  switch (look) {
    case 'own':
    case 'dock':
      return { hull: '#232a4d', deck: '#363f6e', detail: '#8f9ad0', stroke: COLORS.violet, strokeW: 2, opacity: 1 };
    case 'ownSunk':
      return { hull: '#2a1d2a', deck: '#3a2633', detail: '#7a5a66', stroke: COLORS.red, strokeW: 2, opacity: 0.9 };
    case 'sunk':
      return { hull: '#2b1f1f', deck: '#3d2a26', detail: '#9a6a52', stroke: COLORS.fire, strokeW: 2, opacity: 0.95 };
    case 'reveal':
      return { hull: 'rgba(16, 30, 60, 0.85)', deck: 'rgba(60, 80, 110, 0.9)', detail: '#cfe8a0', stroke: COLORS.lime, strokeW: 2, opacity: 0.9 };
    case 'ok':
      return { hull: 'rgba(124, 92, 255, 0.45)', deck: 'rgba(160, 140, 255, 0.4)', detail: '#d8ceff', stroke: '#b9a8ff', strokeW: 2, opacity: 1 };
    case 'bad':
      return { hull: 'rgba(255, 77, 109, 0.45)', deck: 'rgba(255, 120, 140, 0.4)', detail: '#ffd0d8', stroke: COLORS.red, strokeW: 2.5, opacity: 1 };
  }
}

/**
 * One ship drawn horizontally in a box of (size * C) by C, bow pointing right.
 * Each class has its own silhouette so they are easy to tell apart at a glance.
 */
export function ShipShape({ id, look }: { id: SbShipId; look: ShipLook }) {
  const p = palette(look);
  const s = { fill: p.hull, stroke: p.stroke, strokeWidth: p.strokeW, strokeLinejoin: 'round' as const };
  const d = { fill: p.deck };
  const t = { fill: p.detail };
  switch (id) {
    case 'carrier': {
      // Flat flight deck with an angled bow, runway marks and an island on the starboard side.
      const L = 5 * C;
      return (
        <g opacity={p.opacity}>
          <path d={`M6 9 L${L - 22} 7 L${L - 4} 16 L${L - 4} 24 L${L - 22} 33 L6 31 L3 26 L3 14 Z`} {...s} />
          <path d={`M14 13 L${L - 26} 12 L${L - 14} 20 L${L - 26} 28 L14 27 Z`} {...d} />
          <line x1={20} y1={20} x2={L - 34} y2={20} stroke={p.detail} strokeWidth={1.6} strokeDasharray="7 6" />
          <path d={`M30 14 L84 24`} stroke={p.detail} strokeWidth={1.2} opacity={0.7} />
          <rect x={L - 86} y={27} width={30} height={7} rx={2} {...t} />
          <rect x={L - 80} y={29} width={8} height={3} rx={1} fill={p.hull} />
          <circle cx={46} cy={16} r={2} {...t} />
          <circle cx={100} cy={16} r={2} {...t} />
        </g>
      );
    }
    case 'warship': {
      // Long pointed hull, two forward turrets, a bridge block and one aft turret.
      const L = 4 * C;
      return (
        <g opacity={p.opacity}>
          <path d={`M5 12 Q4 20 5 28 L${L - 40} 32 Q${L - 14} 30 ${L - 3} 20 Q${L - 14} 10 ${L - 40} 8 Z`} {...s} />
          <rect x={58} y={13} width={34} height={14} rx={3} {...d} />
          <rect x={66} y={16} width={14} height={8} rx={2} {...t} />
          <Turret x={L - 46} y={20} c={p} barrel={16} />
          <Turret x={L - 72} y={20} c={p} barrel={14} />
          <Turret x={34} y={20} c={p} barrel={-14} />
        </g>
      );
    }
    case 'destroyer': {
      // Slim fast hull, one forward turret, a funnel and a radar mast.
      const L = 3 * C;
      return (
        <g opacity={p.opacity}>
          <path d={`M6 13 L${L - 34} 10 Q${L - 10} 13 ${L - 3} 20 Q${L - 10} 27 ${L - 34} 30 L6 27 Q3 20 6 13 Z`} {...s} />
          <rect x={36} y={14} width={26} height={12} rx={3} {...d} />
          <ellipse cx={30} cy={20} rx={5} ry={4} {...t} />
          <circle cx={54} cy={20} r={3} fill={p.hull} stroke={p.detail} strokeWidth={1.4} />
          <Turret x={L - 30} y={20} c={p} barrel={13} />
        </g>
      );
    }
    case 'submarine': {
      // Rounded cigar hull with a conning tower and tail fins.
      const L = 3 * C;
      return (
        <g opacity={p.opacity}>
          <path d={`M10 20 L4 11 L10 13 Z M10 20 L4 29 L10 27 Z`} {...t} />
          <rect x={8} y={11} width={L - 12} height={18} rx={9} {...s} />
          <rect x={46} y={15} width={22} height={10} rx={5} {...d} />
          <line x1={52} y1={20} x2={64} y2={20} stroke={p.detail} strokeWidth={1.6} strokeLinecap="round" />
          <circle cx={L - 16} cy={20} r={2.2} {...t} />
          <line x1={20} y1={20} x2={36} y2={20} stroke={p.detail} strokeWidth={1.2} strokeDasharray="2 3" />
        </g>
      );
    }
    case 'patrol': {
      // Small quick boat with a cabin and a bow rail.
      const L = 2 * C;
      return (
        <g opacity={p.opacity}>
          <path d={`M5 12 L${L - 26} 11 Q${L - 6} 14 ${L - 3} 20 Q${L - 6} 26 ${L - 26} 29 L5 28 Q3 20 5 12 Z`} {...s} />
          <rect x={14} y={14} width={24} height={12} rx={3} {...d} />
          <rect x={30} y={16} width={6} height={8} rx={1.5} {...t} />
          <path d={`M${L - 20} 15 Q${L - 9} 20 ${L - 20} 25`} fill="none" stroke={p.detail} strokeWidth={1.4} />
        </g>
      );
    }
  }
}

function Turret({ x, y, c, barrel }: { x: number; y: number; c: Palette; barrel: number }) {
  return (
    <g>
      <line x1={x} y1={y - 2.5} x2={x + barrel} y2={y - 2.5} stroke={c.detail} strokeWidth={1.8} strokeLinecap="round" />
      <line x1={x} y1={y + 2.5} x2={x + barrel} y2={y + 2.5} stroke={c.detail} strokeWidth={1.8} strokeLinecap="round" />
      <circle cx={x} cy={y} r={6.5} fill={c.deck} stroke={c.detail} strokeWidth={1.2} />
    </g>
  );
}

/** Transform that places a horizontally drawn ship at (row, col) with direction dir, inside the grid group. */
export function shipTransform(row: number, col: number, dir: 'h' | 'v'): string {
  const x = col * C;
  const y = row * C;
  return dir === 'h' ? `translate(${x} ${y})` : `translate(${x + C} ${y}) rotate(90)`;
}

/** Standalone ship icon (dock, fleet tracker). */
export function ShipIcon({ id, size, look = 'dock', className, style }: { id: SbShipId; size: number; look?: ShipLook; className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox={`0 0 ${size * C} ${C}`} className={className} style={style} aria-hidden>
      <ShipShape id={id} look={look} />
    </svg>
  );
}

/** Shared defs: ocean gradient, wave pattern, sweep gradient, fire gradient, glows. */
export function OceanDefs({ uid }: { uid: string }) {
  return (
    <defs>
      <radialGradient id={`${uid}-sea`} cx="50%" cy="40%" r="75%">
        <stop offset="0%" stopColor="#123a72" />
        <stop offset="55%" stopColor="#0b2552" />
        <stop offset="100%" stopColor="#06132f" />
      </radialGradient>
      <pattern id={`${uid}-waves`} width={80} height={28} patternUnits="userSpaceOnUse">
        <path d="M0 14 Q10 8 20 14 T40 14 T60 14 T80 14" fill="none" stroke="rgba(140, 210, 255, 0.10)" strokeWidth={1.4} />
        <path d="M-20 2 Q-10 -4 0 2 T20 2 T40 2" fill="none" stroke="rgba(140, 210, 255, 0.06)" strokeWidth={1} transform="translate(40 24)" />
      </pattern>
      <linearGradient id={`${uid}-sweep`} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="rgba(198, 255, 61, 0)" />
        <stop offset="100%" stopColor="rgba(198, 255, 61, 0.28)" />
      </linearGradient>
      <radialGradient id={`${uid}-fire`}>
        <stop offset="0%" stopColor="#fff4c2" />
        <stop offset="35%" stopColor={COLORS.fireHot} />
        <stop offset="70%" stopColor={COLORS.fire} />
        <stop offset="100%" stopColor="rgba(255, 90, 31, 0)" />
      </radialGradient>
      <radialGradient id={`${uid}-scorch`}>
        <stop offset="0%" stopColor="rgba(20, 8, 6, 0.85)" />
        <stop offset="100%" stopColor="rgba(20, 8, 6, 0)" />
      </radialGradient>
      <filter id={`${uid}-glow`} x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="3" result="b" />
        <feMerge>
          <feMergeNode in="b" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
  );
}

/** Keyframes for the board, scoped by the sb- prefix. Reduced motion is handled globally in globals.css. */
export const SB_CSS = `
@keyframes sb-drift { from { transform: translateX(0); } to { transform: translateX(-80px); } }
@keyframes sb-drift2 { from { transform: translate(-80px, 0); } to { transform: translate(0, 0); } }
@keyframes sb-sweep { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
@keyframes sb-flicker { 0%,100% { transform: scale(1) translateY(0); opacity: 1; } 30% { transform: scale(1.12, 0.92) translateY(-1px); opacity: 0.9; } 60% { transform: scale(0.92, 1.1) translateY(1px); opacity: 1; } }
@keyframes sb-ping { 0% { r: 4; opacity: 0.9; } 100% { r: 18; opacity: 0; } }
@keyframes sb-blink { 0%,100% { opacity: 1; } 50% { opacity: 0.45; } }
@keyframes sb-smoke { 0% { transform: translate(0, 0) scale(0.6); opacity: 0.5; } 100% { transform: translate(4px, -14px) scale(1.4); opacity: 0; } }
.sb-drift { animation: sb-drift 9s linear infinite; }
.sb-drift2 { animation: sb-drift2 13s linear infinite; }
.sb-sweep { transform-box: view-box; animation: sb-sweep 4s linear infinite; }
.sb-flame { transform-box: fill-box; transform-origin: 50% 90%; animation: sb-flicker 0.7s ease-in-out infinite; }
.sb-blink { animation: sb-blink 1.4s ease-in-out infinite; }
.sb-smoke { transform-box: fill-box; transform-origin: center; animation: sb-smoke 2.2s ease-out infinite; }
@media (prefers-reduced-motion: reduce) {
  .sb-drift, .sb-drift2, .sb-sweep, .sb-flame, .sb-blink, .sb-smoke { animation: none !important; }
}
`;
