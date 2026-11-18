'use client';
import { R, SLAB_H, TRAY } from './geometry';

/** Gradients shared by checkers, slabs and dice. Put once inside the foreground SVG. */
export function PieceDefs({ uid }: { uid: string }) {
  const id = (s: string) => `${uid}-${s}`;
  return (
    <defs>
      <radialGradient id={id('ivory')} cx="0.38" cy="0.32" r="0.8">
        <stop offset="0" stopColor="#FFFBF2" />
        <stop offset="0.55" stopColor="#F1E8D5" />
        <stop offset="1" stopColor="#CDBE9F" />
      </radialGradient>
      <radialGradient id={id('ivoryCap')} cx="0.6" cy="0.7" r="0.75">
        <stop offset="0" stopColor="#F6EEDD" />
        <stop offset="1" stopColor="#E4D7BD" />
      </radialGradient>
      <radialGradient id={id('ink')} cx="0.38" cy="0.32" r="0.8">
        <stop offset="0" stopColor="#47527A" />
        <stop offset="0.5" stopColor="#222B45" />
        <stop offset="1" stopColor="#0D1222" />
      </radialGradient>
      <radialGradient id={id('inkCap')} cx="0.6" cy="0.7" r="0.75">
        <stop offset="0" stopColor="#2A3454" />
        <stop offset="1" stopColor="#161D33" />
      </radialGradient>
      <linearGradient id={id('slab0')} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#FBF5E8" />
        <stop offset="1" stopColor="#CDBE9F" />
      </linearGradient>
      <linearGradient id={id('slab1')} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#3A4568" />
        <stop offset="1" stopColor="#0F1426" />
      </linearGradient>
      <linearGradient id={id('die')} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#FFFCF5" />
        <stop offset="0.6" stopColor="#F1E9D8" />
        <stop offset="1" stopColor="#D8CBB0" />
      </linearGradient>
      <radialGradient id={id('pip')} cx="0.4" cy="0.35" r="0.7">
        <stop offset="0" stopColor="#2B3350" />
        <stop offset="1" stopColor="#0B1220" />
      </radialGradient>
    </defs>
  );
}

/** A checker centred on (0,0) with a soft bevel. seat 0 is ivory, seat 1 is ink. */
export function Checker({ seat, uid, badge, lifted }: { seat: number; uid: string; badge?: number; lifted?: boolean }) {
  const ivory = seat === 0;
  const id = (s: string) => `url(#${uid}-${s})`;
  return (
    <g>
      <circle cx={lifted ? 5 : 2} cy={lifted ? 9 : 4} r={R} fill="rgba(20,8,2,0.38)" />
      <circle r={R} fill={id(ivory ? 'ivory' : 'ink')} stroke={ivory ? '#8C7A58' : '#060912'} strokeWidth={1.6} />
      <circle r={R - 5} fill="none" stroke={ivory ? 'rgba(120,98,62,0.35)' : 'rgba(150,170,220,0.22)'} strokeWidth={1.4} />
      <circle r={R * 0.62} fill={id(ivory ? 'ivoryCap' : 'inkCap')} stroke={ivory ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.5)'} strokeWidth={1.2} />
      <circle r={R * 0.62} fill="none" stroke={ivory ? 'rgba(120,98,62,0.28)' : 'rgba(150,170,220,0.16)'} strokeWidth={1} transform="translate(0.8 1)" />
      <path d={`M ${-R * 0.72} ${-R * 0.25} A ${R * 0.78} ${R * 0.78} 0 0 1 ${R * 0.2} ${-R * 0.74}`} fill="none" stroke={ivory ? 'rgba(255,255,255,0.85)' : 'rgba(180,195,235,0.35)'} strokeWidth={2.2} strokeLinecap="round" />
      {badge ? (
        <text y={8} textAnchor="middle" fontSize={24} fontWeight={700} fontFamily="var(--font-inter), system-ui, sans-serif" fill={ivory ? '#3A2A14' : '#F4EFE6'}>
          {badge}
        </text>
      ) : null}
    </g>
  );
}

/** A borne off checker seen side on, centred on (0,0). */
export function Slab({ seat, uid }: { seat: number; uid: string }) {
  const w = TRAY - 10;
  return (
    <g>
      <rect x={-w / 2} y={-SLAB_H / 2} width={w} height={SLAB_H} rx={5} fill={`url(#${uid}-slab${seat === 0 ? 0 : 1})`} stroke={seat === 0 ? '#8C7A58' : '#05080f'} strokeWidth={1.2} />
      <line x1={-w / 2 + 5} x2={w / 2 - 5} y1={-SLAB_H / 2 + 3} y2={-SLAB_H / 2 + 3} stroke={seat === 0 ? 'rgba(255,255,255,0.8)' : 'rgba(170,190,235,0.3)'} strokeWidth={1.4} strokeLinecap="round" />
    </g>
  );
}

const PIPS: Record<number, [number, number][]> = {
  1: [[0, 0]],
  2: [[-1, -1], [1, 1]],
  3: [[-1, -1], [0, 0], [1, 1]],
  4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
  5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
  6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
};

/** An ivory die with ink pips, centred on (0,0). */
export function Die({ value, size, uid }: { value: number; size: number; uid: string }) {
  const h = size / 2;
  const off = size * 0.27;
  const pr = size * 0.085;
  return (
    <g>
      <rect x={-h + 2} y={-h + 5} width={size} height={size} rx={size * 0.2} fill="rgba(20,8,2,0.4)" />
      <rect x={-h} y={-h} width={size} height={size} rx={size * 0.2} fill={`url(#${uid}-die)`} stroke="#9A8762" strokeWidth={1.4} />
      <rect x={-h + 3} y={-h + 3} width={size - 6} height={size - 6} rx={size * 0.16} fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth={1.2} />
      {(PIPS[value] ?? []).map(([px, py], i) => (
        <circle key={i} cx={px * off} cy={py * off} r={pr} fill={`url(#${uid}-pip)`} />
      ))}
    </g>
  );
}
