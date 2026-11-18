'use client';
import { memo } from 'react';
import { BAR, BAR_X, BOT, FY, H, LEFT_X, MID, PL, PW, RIGHT_X, TOP, TRAY, TRAY_X, W, colRow, colX } from './geometry';

/**
 * Static board art, drawn by hand for Evens. An original take on a Mediterranean tavli board:
 * walnut frame with a thin ivory inlay line, warm olive wood field, ivory and terracotta points,
 * and a lozenge and rosette inlay down the bar. Rendered once; nothing here re-renders during play.
 */
function BoardArtImpl({ uid }: { uid: string }) {
  const id = (s: string) => `${uid}-${s}`;
  const points = [];
  for (let c = 0; c < 24; c++) {
    const { col, top } = colRow(c);
    const x = colX(col);
    const half = PW / 2 - 3;
    const base = top ? TOP : BOT;
    const tip = top ? TOP + PL : BOT - PL;
    const terracotta = (col + (top ? 0 : 1)) % 2 === 0;
    const d = `M ${x - half} ${base} L ${x + half} ${base} L ${x + 2.2} ${tip + (top ? -2 : 2)} Q ${x} ${tip} ${x - 2.2} ${tip + (top ? -2 : 2)} Z`;
    points.push(
      <g key={c}>
        <path d={d} fill={`url(#${id(terracotta ? 'terra' : 'ivory')}${top ? 'T' : 'B'})`} />
        <path d={d} fill="none" stroke="rgba(40,22,10,0.35)" strokeWidth={1.2} />
        {/* inlay line down the middle of each point, a small original detail */}
        <path
          d={`M ${x} ${base + (top ? 14 : -14)} L ${x} ${tip + (top ? -46 : 46)}`}
          stroke={terracotta ? 'rgba(255,230,210,0.16)' : 'rgba(120,80,40,0.14)'}
          strokeWidth={1.4}
        />
        <text
          x={x}
          y={top ? FY / 2 + 7 : H - FY / 2 + 7}
          textAnchor="middle"
          fontSize={19}
          fontFamily="var(--font-inter), system-ui, sans-serif"
          fontWeight={600}
          fill="rgba(244,232,210,0.55)"
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {c + 1}
        </text>
      </g>,
    );
  }

  // Lozenge inlay down the bar
  const lozenges = [];
  const lz = 30;
  for (let y = TOP + 26; y < BOT - 20; y += lz + 6) {
    if (Math.abs(y + lz / 2 - MID) < 70) continue;
    const cx = BAR_X + BAR / 2;
    const cy = y + lz / 2;
    lozenges.push(
      <path
        key={y}
        d={`M ${cx} ${cy - lz / 2} L ${cx + 9} ${cy} L ${cx} ${cy + lz / 2} L ${cx - 9} ${cy} Z`}
        fill={(Math.round((y - TOP) / (lz + 6)) % 2 === 0) ? 'rgba(239,230,210,0.20)' : 'rgba(198,90,58,0.30)'}
      />,
    );
  }
  const rcx = BAR_X + BAR / 2;
  const rosette = [];
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4;
    rosette.push(
      <ellipse key={k} cx={rcx + Math.cos(a) * 14} cy={MID + Math.sin(a) * 14} rx={11} ry={4.5} transform={`rotate(${(a * 180) / Math.PI} ${rcx + Math.cos(a) * 14} ${MID + Math.sin(a) * 14})`} fill={k % 2 ? 'rgba(198,90,58,0.45)' : 'rgba(239,230,210,0.35)'} />,
    );
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 h-full w-full" aria-hidden>
      <defs>
        <linearGradient id={id('frame')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5C3E25" />
          <stop offset="0.5" stopColor="#4A3120" />
          <stop offset="1" stopColor="#3A2618" />
        </linearGradient>
        <linearGradient id={id('field')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8A6240" />
          <stop offset="0.5" stopColor="#7E5838" />
          <stop offset="1" stopColor="#8A6240" />
        </linearGradient>
        <radialGradient id={id('vignette')} cx="0.5" cy="0.5" r="0.75">
          <stop offset="0.55" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#1a0d05" stopOpacity="0.38" />
        </radialGradient>
        <linearGradient id={id('barwood')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#3A2618" />
          <stop offset="0.5" stopColor="#563922" />
          <stop offset="1" stopColor="#3A2618" />
        </linearGradient>
        <linearGradient id={id('tray')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#24170E" />
          <stop offset="1" stopColor="#33221A" />
        </linearGradient>
        {(['T', 'B'] as const).map((r) => (
          <g key={r}>
            <linearGradient id={id('terra' + r)} x1="0" y1={r === 'T' ? 0 : 1} x2="0" y2={r === 'T' ? 1 : 0}>
              <stop offset="0" stopColor="#B9512F" />
              <stop offset="1" stopColor="#CF6644" />
            </linearGradient>
            <linearGradient id={id('ivory' + r)} x1="0" y1={r === 'T' ? 0 : 1} x2="0" y2={r === 'T' ? 1 : 0}>
              <stop offset="0" stopColor="#E6DAC0" />
              <stop offset="1" stopColor="#F3EBDA" />
            </linearGradient>
          </g>
        ))}
        <filter id={id('grain')} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.0035 0.09" numOctaves={3} seed={7} />
          <feColorMatrix values="0 0 0 0 0.12  0 0 0 0 0.07  0 0 0 0 0.03  0 0 0 0.9 -0.32" />
        </filter>
        <filter id={id('grainFine')} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.09 0.006" numOctaves={2} seed={3} />
          <feColorMatrix values="0 0 0 0 0.1  0 0 0 0 0.06  0 0 0 0 0.02  0 0 0 0.8 -0.28" />
        </filter>
      </defs>

      {/* frame */}
      <rect x={0} y={0} width={W} height={H} rx={26} fill={`url(#${id('frame')})`} />
      <rect x={0} y={0} width={W} height={H} rx={26} filter={`url(#${id('grainFine')})`} opacity={0.9} />
      <rect x={1.5} y={1.5} width={W - 3} height={H - 3} rx={25} fill="none" stroke="rgba(255,230,200,0.12)" strokeWidth={2} />

      {/* fields */}
      {[LEFT_X, RIGHT_X].map((x) => (
        <g key={x}>
          <rect x={x} y={TOP} width={6 * PW} height={BOT - TOP} fill={`url(#${id('field')})`} />
          <rect x={x} y={TOP} width={6 * PW} height={BOT - TOP} filter={`url(#${id('grain')})`} />
          <rect x={x} y={TOP} width={6 * PW} height={BOT - TOP} fill={`url(#${id('vignette')})`} />
        </g>
      ))}
      {points}
      {/* ivory inlay line around both fields */}
      {[LEFT_X, RIGHT_X].map((x) => (
        <rect key={x} x={x - 4} y={TOP - 4} width={6 * PW + 8} height={BOT - TOP + 8} rx={3} fill="none" stroke="rgba(239,230,210,0.30)" strokeWidth={1.5} />
      ))}

      {/* bar */}
      <rect x={BAR_X + 4} y={TOP - 4} width={BAR - 8} height={BOT - TOP + 8} rx={6} fill={`url(#${id('barwood')})`} />
      <rect x={BAR_X + 4} y={TOP - 4} width={BAR - 8} height={BOT - TOP + 8} rx={6} filter={`url(#${id('grainFine')})`} opacity={0.7} />
      <rect x={BAR_X + 4} y={TOP - 4} width={BAR - 8} height={BOT - TOP + 8} rx={6} fill="none" stroke="rgba(0,0,0,0.35)" strokeWidth={2} />
      {lozenges}
      <circle cx={rcx} cy={MID} r={30} fill="rgba(20,10,4,0.25)" stroke="rgba(239,230,210,0.22)" strokeWidth={1.5} />
      {rosette}
      <circle cx={rcx} cy={MID} r={4} fill="rgba(239,230,210,0.5)" />

      {/* bear off tray */}
      <rect x={TRAY_X} y={TOP - 4} width={TRAY} height={BOT - TOP + 8} rx={8} fill={`url(#${id('tray')})`} />
      <rect x={TRAY_X} y={TOP - 4} width={TRAY} height={BOT - TOP + 8} rx={8} fill="none" stroke="rgba(0,0,0,0.5)" strokeWidth={2} />
      <rect x={TRAY_X + 1.5} y={TOP - 2.5} width={TRAY - 3} height={BOT - TOP + 5} rx={7} fill="none" stroke="rgba(255,230,200,0.08)" strokeWidth={1.5} />
      <line x1={TRAY_X + 8} x2={TRAY_X + TRAY - 8} y1={MID} y2={MID} stroke="rgba(239,230,210,0.18)" strokeWidth={1.5} />
    </svg>
  );
}

export const BoardArt = memo(BoardArtImpl);
