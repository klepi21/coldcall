'use client';
import { R, SLAB_H, TRAY } from './geometry';

/** Gradients shared by checkers, slabs and dice. Put once inside the foreground SVG. */
export function PieceDefs({ uid }: { uid: string }) {
  const id = (s: string) => `${uid}-${s}`;
  return (
    <defs>
      <radialGradient id={id('ivory')} cx="0.38" cy="0.32" r="0.8">
        <stop offset="0" stopColor="#FFFFFF" />
        <stop offset="0.55" stopColor="#E6F6FF" />
        <stop offset="1" stopColor="#B5DDF2" />
      </radialGradient>
      <radialGradient id={id('ivoryCap')} cx="0.6" cy="0.7" r="0.75">
        <stop offset="0" stopColor="#F2FAFF" />
        <stop offset="1" stopColor="#D2EBF8" />
      </radialGradient>
      <radialGradient id={id('ink')} cx="0.38" cy="0.32" r="0.8">
        <stop offset="0" stopColor="#3D6FB3" />
        <stop offset="0.5" stopColor="#1E4A86" />
        <stop offset="1" stopColor="#0F2B54" />
      </radialGradient>
      <radialGradient id={id('inkCap')} cx="0.6" cy="0.7" r="0.75">
        <stop offset="0" stopColor="#25528F" />
        <stop offset="1" stopColor="#163A6B" />
      </radialGradient>
      <linearGradient id={id('slab0')} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#F7FCFF" />
        <stop offset="1" stopColor="#B5DDF2" />
      </linearGradient>
      <linearGradient id={id('slab1')} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#2F5E9E" />
        <stop offset="1" stopColor="#102C55" />
      </linearGradient>
      <linearGradient id={id('die')} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#D8F2FF" />
        <stop offset="0.6" stopColor="#A9DAF4" />
        <stop offset="1" stopColor="#7FB8E2" />
      </linearGradient>
      <radialGradient id={id('pip')} cx="0.4" cy="0.35" r="0.7">
        <stop offset="0" stopColor="#FFFFFF" />
        <stop offset="1" stopColor="#DCEEFA" />
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
      <circle cx={lifted ? 5 : 2} cy={lifted ? 9 : 4} r={R} fill="rgba(8,14,26,0.38)" />
      <circle r={R} fill={id(ivory ? 'ivory' : 'ink')} stroke={ivory ? '#4F7FAE' : '#08182f'} strokeWidth={1.6} />
      <circle r={R - 5} fill="none" stroke={ivory ? 'rgba(60,110,160,0.35)' : 'rgba(150,170,220,0.22)'} strokeWidth={1.4} />
      <circle r={R * 0.62} fill={id(ivory ? 'ivoryCap' : 'inkCap')} stroke={ivory ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.5)'} strokeWidth={1.2} />
      <circle r={R * 0.62} fill="none" stroke={ivory ? 'rgba(60,110,160,0.28)' : 'rgba(150,170,220,0.16)'} strokeWidth={1} transform="translate(0.8 1)" />
      <path d={`M ${-R * 0.72} ${-R * 0.25} A ${R * 0.78} ${R * 0.78} 0 0 1 ${R * 0.2} ${-R * 0.74}`} fill="none" stroke={ivory ? 'rgba(255,255,255,0.85)' : 'rgba(180,195,235,0.35)'} strokeWidth={2.2} strokeLinecap="round" />
      {badge ? (
        <text y={8} textAnchor="middle" fontSize={24} fontWeight={700} fontFamily="var(--font-inter), system-ui, sans-serif" fill={ivory ? '#0B1A2E' : '#F4EFE6'}>
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
      <rect x={-w / 2} y={-SLAB_H / 2} width={w} height={SLAB_H} rx={5} fill={`url(#${uid}-slab${seat === 0 ? 0 : 1})`} stroke={seat === 0 ? '#4F7FAE' : '#08182f'} strokeWidth={1.2} />
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
      <rect x={-h + 2} y={-h + 5} width={size} height={size} rx={size * 0.2} fill="rgba(8,14,26,0.4)" />
      <rect x={-h} y={-h} width={size} height={size} rx={size * 0.2} fill={`url(#${uid}-die)`} stroke="#7FB3DA" strokeWidth={1.4} />
      <rect x={-h + 3} y={-h + 3} width={size - 6} height={size - 6} rx={size * 0.16} fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth={1.2} />
      {(PIPS[value] ?? []).map(([px, py], i) => (
        <circle key={i} cx={px * off} cy={py * off} r={pr} fill={`url(#${uid}-pip)`} />
      ))}
    </g>
  );
}
