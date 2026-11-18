'use client';
/**
 * Evens Tichu cards. All art here is original, drawn by hand in SVG for Evens. It follows the
 * conventions of the standard Tichu deck so players recognise it at once: white stock, suit
 * colours and symbols, classic pip layout, double ended court cards, special cards on a lemon
 * panel in a flat folk print style, and an olive back covered in characters. No photo or
 * publisher illustration was traced, embedded or copied. Licence: Evens own work.
 *
 * Suit mapping from engine card ids to the four Tichu suits:
 *   S = Swords  (black, curved sword)
 *   H = Stars   (red, star)
 *   D = Jade    (green, jade stone)
 *   C = Pagodas (blue, tiered pagoda roof)
 * Every suit has its own shape and colour, so cards stay readable for colour blind players.
 */
import { memo, useId } from 'react';
import { cardRank, cardSuit, DOG, DRAGON, MAHJONG, PHOENIX, type CardId } from '@coldcall/games/tichu-combos';

export type SuitShape = 'jade' | 'sword' | 'pagoda' | 'star';
export interface SuitInfo {
  name: string;
  color: string;
  shape: SuitShape;
}
export const SUITS: Record<'S' | 'H' | 'D' | 'C', SuitInfo> = {
  D: { name: 'Jade', color: '#1E8A47', shape: 'jade' },
  S: { name: 'Swords', color: '#16161A', shape: 'sword' },
  C: { name: 'Pagodas', color: '#1E62D8', shape: 'pagoda' },
  H: { name: 'Stars', color: '#D3282B', shape: 'star' },
};

const FACE: Record<number, string> = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
const FACE_WORD: Record<number, string> = { 11: 'Jack', 12: 'Queen', 13: 'King', 14: 'Ace' };

export function cardName(id: CardId): string {
  if (id === MAHJONG) return 'Mah Jong';
  if (id === DOG) return 'Dog';
  if (id === PHOENIX) return 'Phoenix';
  if (id === DRAGON) return 'Dragon';
  const s = cardSuit(id);
  const r = cardRank(id);
  return `${FACE_WORD[r] ?? r} of ${s ? SUITS[s].name : ''}`;
}

/* palette of the folk print specials */
const INK = '#111111';
const LEMON = '#E9E52C';
const RED = '#D8262A';
const GREEN = '#17A04A';
const BLUE = '#1C9BDB';
const DEEP_BLUE = '#1E4FB8';
const SKIN = '#F6D334';
const STOCK = '#FFFFFF';
const FONT = { fontFamily: 'var(--font-inter), system-ui, sans-serif' };
const SERIF = { fontFamily: 'Georgia, "Times New Roman", serif' };

/* ---------- suit symbols, centred on (x, y), size s ---------- */

function starPoints(cx: number, cy: number, R: number, r: number) {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 === 0 ? R : r;
    pts.push(`${(cx + Math.cos(a) * rad).toFixed(2)},${(cy + Math.sin(a) * rad).toFixed(2)}`);
  }
  return pts.join(' ');
}

function roofTier(cx: number, cy: number, w: number, h: number) {
  return `M${cx - w} ${cy} Q${cx - w * 0.5} ${cy - h * 0.3} ${cx} ${cy - h} Q${cx + w * 0.5} ${cy - h * 0.3} ${cx + w} ${cy} Q${cx + w * 0.55} ${cy - h * 0.12} ${cx} ${cy - h * 0.12} Q${cx - w * 0.55} ${cy - h * 0.12} ${cx - w} ${cy}Z`;
}

export function SuitGlyph({ shape, x, y, s, fill, flip }: { shape: SuitShape; x: number; y: number; s: number; fill?: string; flip?: boolean }) {
  const c = fill ?? Object.values(SUITS).find((v) => v.shape === shape)!.color;
  let g: React.ReactNode;
  switch (shape) {
    case 'jade':
      // a rounded jade stone with a hole through the middle
      g = (
        <g>
          <rect x={x - s * 0.46} y={y - s * 0.46} width={s * 0.92} height={s * 0.92} rx={s * 0.34} fill={c} />
          <ellipse cx={x} cy={y} rx={s * 0.17} ry={s * 0.2} fill={STOCK} />
          <path d={`M${x - s * 0.3} ${y - s * 0.12} Q${x - s * 0.3} ${y - s * 0.3} ${x - s * 0.12} ${y - s * 0.32}`} stroke="rgba(255,255,255,.55)" strokeWidth={s * 0.06} fill="none" strokeLinecap="round" />
        </g>
      );
      break;
    case 'sword': {
      // a curved sword drawn diagonally, tip to the top right
      const u = s * 1.15;
      g = (
        <g transform={`rotate(38 ${x} ${y})`} fill={c}>
          <path d={`M${x - u * 0.075} ${y + u * 0.1} Q${x - u * 0.08} ${y - u * 0.28} ${x + u * 0.13} ${y - u * 0.6} Q${x + u * 0.17} ${y - u * 0.22} ${x + u * 0.08} ${y + u * 0.1}Z`} />
          <path d={`M${x - u * 0.26} ${y + u * 0.08} Q${x} ${y + u * 0.2} ${x + u * 0.26} ${y + u * 0.08} L${x + u * 0.26} ${y + u * 0.17} Q${x} ${y + u * 0.29} ${x - u * 0.26} ${y + u * 0.17}Z`} />
          <rect x={x - u * 0.055} y={y + u * 0.2} width={u * 0.11} height={u * 0.24} rx={u * 0.03} />
          <circle cx={x} cy={y + u * 0.48} r={u * 0.085} />
        </g>
      );
      break;
    }
    case 'pagoda':
      g = (
        <g fill={c}>
          <rect x={x - s * 0.035} y={y - s * 0.62} width={s * 0.07} height={s * 0.2} />
          <path d={roofTier(x, y - s * 0.2, s * 0.3, s * 0.28)} />
          <rect x={x - s * 0.16} y={y - s * 0.22} width={s * 0.32} height={s * 0.12} />
          <path d={roofTier(x, y + s * 0.1, s * 0.44, s * 0.3)} />
          <rect x={x - s * 0.26} y={y + s * 0.08} width={s * 0.52} height={s * 0.12} />
          <path d={roofTier(x, y + s * 0.4, s * 0.58, s * 0.3)} />
          <rect x={x - s * 0.36} y={y + s * 0.38} width={s * 0.72} height={s * 0.14} rx={s * 0.03} />
        </g>
      );
      break;
    case 'star':
      g = <polygon points={starPoints(x, y + s * 0.04, s * 0.56, s * 0.24)} fill={c} stroke={c} strokeWidth={s * 0.04} strokeLinejoin="round" />;
      break;
  }
  return flip ? <g transform={`rotate(180 ${x} ${y})`}>{g}</g> : <>{g}</>;
}

/* ---------- number cards: classic pip layouts ---------- */

const L = 33;
const C = 50;
const R = 67;
const PIPS: Record<number, [number, number][]> = {
  2: [[C, 32], [C, 108]],
  3: [[C, 32], [C, 70], [C, 108]],
  4: [[L, 32], [R, 32], [L, 108], [R, 108]],
  5: [[L, 32], [R, 32], [C, 70], [L, 108], [R, 108]],
  6: [[L, 32], [R, 32], [L, 70], [R, 70], [L, 108], [R, 108]],
  7: [[L, 32], [R, 32], [C, 51], [L, 70], [R, 70], [L, 108], [R, 108]],
  8: [[L, 32], [R, 32], [C, 51], [L, 70], [R, 70], [C, 89], [L, 108], [R, 108]],
  9: [[L, 32], [R, 32], [L, 57], [R, 57], [C, 70], [L, 83], [R, 83], [L, 108], [R, 108]],
  10: [[L, 32], [R, 32], [C, 45], [L, 57], [R, 57], [L, 83], [R, 83], [C, 95], [L, 108], [R, 108]],
};

function Index({ label, s, ten }: { label: string; s: SuitInfo; ten: boolean }) {
  return (
    <g>
      <text x={11} y={22} textAnchor="middle" fontSize={ten ? 18 : 21} fontWeight={800} letterSpacing={ten ? -1.6 : 0} fill={s.color} style={FONT}>
        {label}
      </text>
      <SuitGlyph shape={s.shape} x={11} y={33} s={11} fill={s.color} />
    </g>
  );
}

/* ---------- court cards: double ended East Asian portraits ---------- */

const ROBE: Record<number, string> = { 11: GREEN, 12: RED, 13: DEEP_BLUE };

/** Top half of a court figure, drawn inside the frame (x 21 to 79, y 15 to 70). */
function CourtHalf({ rank, s }: { rank: number; s: SuitInfo }) {
  const robe = ROBE[rank]!;
  const o = { stroke: INK, strokeWidth: 1, strokeLinejoin: 'round' as const };
  return (
    <g>
      {/* robe */}
      <path d="M22 72 L22 63 C24 55 33 51 41 49.5 L50 59 L59 49.5 C67 51 76 55 78 63 L78 72 Z" fill={robe} {...o} />
      {[28, 32, 36, 64, 68, 72].map((x) => (
        <path key={x} d={`M${x} 58 L${x - 2} 70`} stroke={INK} strokeWidth={0.5} opacity={0.55} />
      ))}
      <path d="M40.5 48.5 L50 60 L59.5 48.5 L56.5 47.5 L50 55 L43.5 47.5 Z" fill="#FFFFFF" {...o} strokeWidth={0.8} />
      <circle cx={31} cy={64} r={4.4} fill="#FFFFFF" {...o} strokeWidth={0.7} />
      <SuitGlyph shape={s.shape} x={31} y={64} s={5.6} fill={s.color} />
      <circle cx={69} cy={64} r={4.4} fill="#FFFFFF" {...o} strokeWidth={0.7} />
      <SuitGlyph shape={s.shape} x={69} y={64} s={5.6} fill={s.color} />
      {/* neck and face */}
      <rect x={46} y={42} width={8} height={8} fill={SKIN} {...o} strokeWidth={0.8} />
      <ellipse cx={50} cy={35} rx={8.6} ry={10} fill={SKIN} {...o} />
      <path d="M44 32 l4.4 -1 M51.6 31 l4.4 1" stroke={INK} strokeWidth={0.9} strokeLinecap="round" />
      <path d="M44.6 34.6 q2 -1.6 4 0 q-2 1 -4 0 Z M51.4 34.6 q2 -1.6 4 0 q-2 1 -4 0 Z" fill={INK} />
      <path d="M49 37.6 q1 0.8 2 0" stroke={INK} strokeWidth={0.7} fill="none" strokeLinecap="round" />
      {rank === 11 ? (
        // Jack: young, round cap with a red knob, holding a short staff
        <g>
          <path d="M41.2 31 C41.5 21.5 58.5 21.5 58.8 31 C55 28.6 45 28.6 41.2 31 Z" fill={INK} />
          <rect x={41} y={29.4} width={18} height={2.6} rx={1} fill={RED} {...o} strokeWidth={0.6} />
          <circle cx={50} cy={21.8} r={2} fill={RED} {...o} strokeWidth={0.6} />
          <path d="M46.8 41 q3.2 1.6 6.4 0" stroke={RED} strokeWidth={1.1} fill="none" strokeLinecap="round" />
          <path d="M70 26 L64 70" stroke={INK} strokeWidth={2.6} strokeLinecap="round" />
          <path d="M70 26 L64 70" stroke="#C99A2E" strokeWidth={1.4} strokeLinecap="round" />
          <circle cx={70.3} cy={24.5} r={2.6} fill={RED} {...o} strokeWidth={0.6} />
        </g>
      ) : rank === 12 ? (
        // Queen: hair in a high bun with pins, a flower and earrings
        <g>
          <path d="M41 37 C39.5 23 60.5 23 59 37 C57.5 29.5 52 27.5 50 27.5 C48 27.5 42.5 29.5 41 37 Z" fill={INK} />
          <ellipse cx={50} cy={21.5} rx={6.4} ry={4.6} fill={INK} />
          <path d="M40 19 L60 24 M40.5 24 L59.5 19" stroke="#E9B52A" strokeWidth={1.3} strokeLinecap="round" />
          <circle cx={58.6} cy={27.6} r={2.8} fill={RED} {...o} strokeWidth={0.6} />
          <circle cx={58.6} cy={27.6} r={1} fill={LEMON} />
          <circle cx={41.6} cy={40} r={1.3} fill={GREEN} {...o} strokeWidth={0.5} />
          <circle cx={58.4} cy={40} r={1.3} fill={GREEN} {...o} strokeWidth={0.5} />
          <path d="M47 41.2 q3 1.4 6 0" stroke={RED} strokeWidth={1.3} fill="none" strokeLinecap="round" />
          <path d="M42 49 C46 53 54 53 58 49" stroke="#E9B52A" strokeWidth={1.4} fill="none" />
        </g>
      ) : (
        // King: black hat with side wings and a long grey beard
        <g>
          <rect x={42} y={19} width={16} height={10} rx={1.5} fill={INK} />
          <rect x={33} y={25.5} width={34} height={2.8} rx={1.2} fill={INK} />
          <rect x={46} y={21} width={8} height={2.4} rx={0.8} fill="#E9B52A" />
          <path d="M42.5 38 C42 46 45 53 50 56 C55 53 58 46 57.5 38 C55 41.5 45 41.5 42.5 38 Z" fill="#E6E6E6" {...o} strokeWidth={0.8} />
          {[46, 48.5, 51.5, 54].map((x) => (
            <path key={x} d={`M${x} 42 L${x + (x < 50 ? 0.8 : -0.8)} 52`} stroke="#888" strokeWidth={0.5} />
          ))}
          <path d="M44.5 38.6 C47 37 53 37 55.5 38.6" stroke="#E6E6E6" strokeWidth={2} fill="none" strokeLinecap="round" />
          <path d="M44.5 38.6 C47 37 53 37 55.5 38.6" stroke={INK} strokeWidth={0.5} fill="none" />
        </g>
      )}
    </g>
  );
}

function NormalFace({ id, uid }: { id: CardId; uid: string }) {
  const s = SUITS[cardSuit(id)!];
  const r = cardRank(id);
  const label = FACE[r] ?? String(r);
  const index = <Index label={label} s={s} ten={r === 10} />;
  let centre: React.ReactNode;
  if (r >= 11 && r <= 13) {
    centre = (
      <g>
        <defs>
          <clipPath id={`${uid}top`}>
            <rect x={21} y={11} width={58} height={59} />
          </clipPath>
        </defs>
        <g clipPath={`url(#${uid}top)`}>
          <g transform="translate(50 70) scale(1.14) translate(-50 -70)">
            <CourtHalf rank={r} s={s} />
          </g>
        </g>
        <g transform="rotate(180 50 70)">
          <g clipPath={`url(#${uid}top)`}>
            <g transform="translate(50 70) scale(1.14) translate(-50 -70)">
              <CourtHalf rank={r} s={s} />
            </g>
          </g>
        </g>
        <line x1={21} y1={70} x2={79} y2={70} stroke={s.color} strokeWidth={1} />
        <rect x={21} y={11} width={58} height={118} fill="none" stroke={s.color} strokeWidth={1.3} />
      </g>
    );
  } else if (r === 14) {
    centre = (
      <g>
        <circle cx={50} cy={70} r={25} fill="none" stroke={s.color} strokeWidth={1.2} />
        <circle cx={50} cy={70} r={22} fill="none" stroke={s.color} strokeWidth={0.5} />
        {Array.from({ length: 12 }, (_, i) => {
          const a = (i * Math.PI) / 6;
          return <circle key={i} cx={50 + Math.cos(a) * 28.5} cy={70 + Math.sin(a) * 28.5} r={1.4} fill={s.color} />;
        })}
        <SuitGlyph shape={s.shape} x={50} y={70} s={36} fill={s.color} />
      </g>
    );
  } else {
    centre = (
      <g>
        {PIPS[r]!.map(([x, y], i) => (
          <SuitGlyph key={i} shape={s.shape} x={x} y={y} s={r >= 9 ? 15.5 : 17} fill={s.color} flip={y > 72} />
        ))}
      </g>
    );
  }
  return (
    <g>
      <rect x={0} y={0} width={100} height={140} rx={6} fill={STOCK} />
      {centre}
      {index}
      <g transform="rotate(180 50 70)">{index}</g>
    </g>
  );
}

/* ---------- special cards: lemon panel, folk print art breaking out of the frame ---------- */

function Panel() {
  return <rect x={15} y={18} width={70} height={104} fill={LEMON} stroke={INK} strokeWidth={1.4} />;
}

/** A small exotic bird with a long tail, perched facing right. Drawn around (0, 0). */
function Bird() {
  return (
    <g stroke={INK} strokeWidth={0.7} strokeLinejoin="round">
      {/* long tail */}
      <path d="M-4 3 C-10 8 -14 14 -15 21 C-11 16 -8 12 -3 7 Z" fill={BLUE} />
      <path d="M-3 4 C-6 11 -7 17 -6 23 C-3 17 -2 11 0 6 Z" fill={DEEP_BLUE} />
      {/* body */}
      <path d="M-5 2 C-5 -4 1 -7 6 -5 C9 -3 9 2 5 5 C1 7 -4 6 -5 2 Z" fill={RED} />
      <path d="M-5 1 C-3 -5 3 -6 6 -3 C2 -3 -1 -1 -2 3 Z" fill={INK} />
      <path d="M-4 0 C-1 -1 2 0 4 3" stroke="#FFFFFF" strokeWidth={0.6} fill="none" />
      {/* head */}
      <circle cx={7} cy={-7} r={3.6} fill={INK} />
      <path d="M10 -7.6 L14.5 -6.4 L10 -5.6 Z" fill={LEMON} />
      <circle cx={8} cy={-7.8} r={0.9} fill="#FFFFFF" stroke="none" />
      <path d="M5 -10 C4 -14 7 -15 9 -13" fill="none" stroke={INK} strokeWidth={0.9} />
      {/* feet */}
      <path d="M0 6 L-1 9 M3 6 L3 9" stroke={INK} strokeWidth={0.9} />
    </g>
  );
}

/** A twisted vine running from (x, y1) to (x, y2). */
function Vine({ x, y1, y2 }: { x: number; y1: number; y2: number }) {
  const parts: React.ReactNode[] = [];
  for (let y = y1, i = 0; y < y2; y += 4, i++) {
    parts.push(<ellipse key={y} cx={x + (i % 2 ? 0.6 : -0.6)} cy={y + 2} rx={1.4} ry={2.6} transform={`rotate(${i % 2 ? 28 : -28} ${x} ${y + 2})`} fill="#9A7B3C" stroke={INK} strokeWidth={0.5} />);
  }
  return <g>{parts}</g>;
}

function MahjongArt() {
  return (
    <g>
      <Panel />
      <Vine x={25} y1={8} y2={130} />
      <Vine x={75} y1={10} y2={132} />
      <text x={50} y={84} textAnchor="middle" fontSize={44} fontWeight={700} fill={INK} style={SERIF}>
        1
      </text>
      <g transform="translate(18 15)">
        <Bird />
      </g>
      <g transform="translate(80 122) scale(-1 1)">
        <Bird />
      </g>
    </g>
  );
}

/** Blue and white guardian lion dog, crouching and facing right, drawn around (0, 0), about 64 by 48. */
function FooDog() {
  const curl = (x: number, y: number, r: number, k: string) => (
    <g key={k}>
      <circle cx={x} cy={y} r={r} fill="#FFFFFF" stroke={INK} strokeWidth={0.8} />
      <path d={`M${x + r * 0.55} ${y} A${r * 0.55} ${r * 0.55} 0 1 0 ${x} ${y + r * 0.55} A${r * 0.25} ${r * 0.25} 0 1 0 ${x - r * 0.1} ${y + r * 0.05}`} fill="none" stroke={BLUE} strokeWidth={0.9} />
    </g>
  );
  const ring = Array.from({ length: 11 }, (_, i) => {
    const a = (i / 11) * Math.PI * 2 - Math.PI / 2;
    return curl(14 + Math.cos(a) * 11.5, -10 + Math.sin(a) * 11.5, 4.2, `m${i}`);
  });
  return (
    <g strokeLinejoin="round">
      {/* bushy tail curling up behind */}
      {curl(-26, -14, 4.6, 't1')}
      {curl(-30, -20, 4, 't2')}
      {curl(-24, -22, 3.8, 't3')}
      {curl(-31, -11, 3.6, 't4')}
      {curl(-20, -17, 3.4, 't5')}
      {/* body */}
      <path d="M-23 -6 C-24 -14 -10 -16 2 -13 L8 -6 L9 10 L1 10 L0 4 C-6 5 -12 5 -14 4 L-15 10 L-23 10 L-22 2 C-24 0 -24 -3 -23 -6 Z" fill={BLUE} stroke={INK} strokeWidth={1} />
      <path d="M-19 -10 q3 -2.5 6 0 M-12 -11 q3 -2.5 6 0 M-5 -11 q3 -2.5 6 0" stroke="#FFFFFF" strokeWidth={1} fill="none" />
      <path d="M-18 -4 q2 3 0 6 M-9 -5 q2 3 0 6" stroke={INK} strokeWidth={0.6} fill="none" />
      {/* leg curls and paws */}
      {curl(-19, 6, 3, 'l1')}
      {curl(4, 5, 3, 'l2')}
      <path d="M0 10 h10 v2.4 h-10z M-24 10 h10 v2.4 h-10z" fill="#FFFFFF" stroke={INK} strokeWidth={0.8} />
      <path d="M2 10 v2.4 M5 10 v2.4 M8 10 v2.4 M-22 10 v2.4 M-19 10 v2.4 M-16 10 v2.4" stroke={INK} strokeWidth={0.5} />
      {/* ribbon ball under the paw */}
      <circle cx={-4} cy={7} r={3.4} fill={RED} stroke={INK} strokeWidth={0.8} />
      <path d="M-7 7 h6 M-4 4 v6" stroke={INK} strokeWidth={0.5} />
      {/* curly mane all round the head */}
      {ring}
      {/* face */}
      <circle cx={14} cy={-10} r={9} fill={BLUE} stroke={INK} strokeWidth={1.1} />
      <path d="M8 -16 q3 -2 5 0 M15.5 -16 q3 -2 5 0" stroke={INK} strokeWidth={1} fill="none" strokeLinecap="round" />
      <circle cx={10.4} cy={-12} r={2.9} fill="#FFFFFF" stroke={INK} strokeWidth={0.8} />
      <circle cx={17.6} cy={-12} r={2.9} fill="#FFFFFF" stroke={INK} strokeWidth={0.8} />
      <circle cx={10.8} cy={-11.6} r={1.4} fill={INK} />
      <circle cx={18} cy={-11.6} r={1.4} fill={INK} />
      <ellipse cx={14.2} cy={-7.6} rx={2.6} ry={1.7} fill={INK} />
      <path d="M8.6 -4.8 C10.4 -1 18 -1 19.8 -4.8 Z" fill={RED} stroke={INK} strokeWidth={0.8} />
      <path d="M9.6 -4.4 l1.2 1.6 l1.2 -1.6 l1.2 1.6 l1.2 -1.6 l1.2 1.6 l1.2 -1.6 l1.2 1.6 l1.2 -1.6" fill="#FFFFFF" stroke={INK} strokeWidth={0.4} />
    </g>
  );
}

function DogArt() {
  return (
    <g>
      <Panel />
      <g transform="translate(50 42) scale(1.12)">
        <FooDog />
      </g>
      <g transform="rotate(180 50 70)">
        <g transform="translate(50 42) scale(1.12)">
          <FooDog />
        </g>
      </g>
    </g>
  );
}

/** One flowing tail feather: black outline, colour band, then fine hatching. */
function Feather({ d, color }: { d: string; color: string }) {
  return (
    <g fill="none" strokeLinecap="round">
      <path d={d} stroke={INK} strokeWidth={4.6} />
      <path d={d} stroke={color} strokeWidth={3} />
      <path d={d} stroke={INK} strokeWidth={3} strokeDasharray="0.5 1.6" opacity={0.45} />
    </g>
  );
}

function PhoenixArt() {
  return (
    <g>
      <Panel />
      {/* long tail feathers curling down and out of the panel */}
      <Feather color={BLUE} d="M48 70 C38 86 22 92 18 108 C16 116 22 121 27 117 C30 114 27 110 24 112" />
      <Feather color={RED} d="M50 70 C46 88 34 98 36 114 C37 122 44 126 46 120" />
      <Feather color={GREEN} d="M52 70 C54 88 46 104 54 118 C58 125 66 124 64 118 C63 115 60 116 60 118" />
      <Feather color={BLUE} d="M54 70 C64 86 70 98 72 114 C73 122 82 126 84 120 C85 116 81 114 79 117" />
      <Feather color={RED} d="M56 68 C70 80 82 86 86 100 C88 108 82 112 80 108" />
      <Feather color={GREEN} d="M46 70 C40 84 28 82 20 92 C16 98 20 104 25 101" />
      {/* wings raised to the right, green and black bands */}
      <path d="M52 50 C60 36 74 30 84 30 C80 36 78 40 80 44 C74 46 70 50 70 56 C64 58 58 58 52 58 Z" fill={GREEN} stroke={INK} strokeWidth={1} strokeLinejoin="round" />
      <path d="M56 50 C63 41 72 36 80 34 M58 54 C65 47 72 44 78 42 M62 57 C66 52 70 50 74 49" stroke={INK} strokeWidth={1.4} fill="none" />
      <path d="M57 47 C63 41 70 38 76 37" stroke="#FFFFFF" strokeWidth={0.7} fill="none" />
      {/* body and neck */}
      <path d="M40 27 C30 34 33 46 43 51 C56 56 61 64 57 74 C47 79 36 73 34 63 C32 55 27 47 28 38 C28 31 33 26 40 27 Z" fill={RED} stroke={INK} strokeWidth={1} strokeLinejoin="round" />
      <path d="M43 51 C52 54 57 60 57 70 C51 65 46 61 39 59 Z" fill={INK} />
      <path d="M44 55 l3 4 M48 56 l2 4 M52 58 l2 4" stroke={GREEN} strokeWidth={1} />
      <path d="M38 52 C42 56 46 58 50 62 M36 46 C40 50 44 52 48 54" stroke={INK} strokeWidth={0.6} fill="none" />
      <path d="M41 58 C44 60 48 62 51 66" stroke={INK} strokeWidth={2.2} fill="none" />
      {/* legs */}
      <path d="M44 72 L42 84 L38 86 M42 84 L44 87 M50 72 L50 84 L54 86 M50 84 L48 87" stroke={INK} strokeWidth={1.4} fill="none" strokeLinecap="round" />
      {/* head with crest */}
      <path d="M36 22 C36 16 44 14 47 19 C48 22 46 26 42 27 C39 28 36 26 36 22 Z" fill={LEMON} stroke={INK} strokeWidth={1} />
      <path d="M47 19 L55 18 L47.5 22.5 Z" fill="#F2A11E" stroke={INK} strokeWidth={0.8} strokeLinejoin="round" />
      <circle cx={43} cy={20} r={1.4} fill={INK} />
      <path d="M38 17 C36 11 39 7 42 6 C41 10 42 13 41 16 M41 16 C42 10 46 8 49 8 C46 11 45 14 43 17" fill={GREEN} stroke={INK} strokeWidth={0.8} />
      <path d="M37 26 C38 30 40 31 40 30" stroke={RED} strokeWidth={2} fill="none" />
    </g>
  );
}

function DragonArt() {
  const body = 'M30 30 C46 26 62 30 64 42 C66 54 46 54 38 62 C30 70 34 84 50 86 C66 88 74 96 70 108 C67 116 58 118 52 116';
  return (
    <g>
      <Panel />
      {/* coiled body: spines, outline, green fill, white scale marks, blue belly accents */}
      <path d={body} fill="none" stroke={INK} strokeWidth={21} strokeDasharray="2.4 2.6" />
      <path d={body} fill="none" stroke={INK} strokeWidth={15} strokeLinecap="round" />
      <path d={body} fill="none" stroke={GREEN} strokeWidth={12} strokeLinecap="round" />
      <path d={body} fill="none" stroke="#FFFFFF" strokeWidth={8} strokeDasharray="1.2 2.6" strokeLinecap="round" opacity={0.85} />
      <path d={body} fill="none" stroke={GREEN} strokeWidth={5} strokeLinecap="round" />
      <path d={body} fill="none" stroke={BLUE} strokeWidth={1.6} strokeDasharray="5 4" strokeLinecap="round" />
      {/* tail tip */}
      <path d="M52 116 C46 115 42 118 40 122 C46 121 50 122 54 125 Z" fill={GREEN} stroke={INK} strokeWidth={0.9} />
      {/* claws with red flames, reaching over the panel */}
      {[
        [70, 40, 1],
        [30, 66, -1],
        [76, 96, 1],
        [38, 108, -1],
      ].map(([x, y, dir], i) => (
        <g key={i} stroke={INK} strokeWidth={0.8} strokeLinejoin="round">
          <path d={`M${x} ${y} l${dir! * 9} -3 l${dir! * 3} 3 l${dir! * -3} 3 l${dir! * 4} 3 l${dir! * -5} 1 Z`} fill={GREEN} />
          <path d={`M${x! + dir! * 12} ${y! - 4} l${dir! * 4} -2 M${x! + dir! * 13} ${y!} l${dir! * 5} 0 M${x! + dir! * 12} ${y! + 4} l${dir! * 4} 2`} stroke={RED} strokeWidth={1.8} strokeLinecap="round" />
          <path d={`M${x! + dir! * 18} ${y! - 7} c${dir! * 4} -2 ${dir! * 6} 2 ${dir! * 3} 5 c${dir! * 4} 0 ${dir! * 5} 5 ${dir! * 1} 6 c${dir! * 2} 3 ${dir! * -1} 6 ${dir! * -4} 3 Z`} fill={RED} />
        </g>
      ))}
      {/* head at the top left with an open jaw */}
      <g stroke={INK} strokeWidth={0.9} strokeLinejoin="round">
        <path d="M34 26 C30 18 22 16 14 18 L8 14 L10 21 L4 23 L10 26 L8 31 C14 33 22 34 28 34 Z" fill={GREEN} />
        <path d="M10 26 L28 30 L26 34 L8 31 Z" fill={RED} />
        <path d="M11 26 l2 2 l2 -2 l2 2 l2 -2 l2 2 l2 -2 M10 30 l2 -2 l2 2 l2 -2 l2 2 l2 -2" stroke="#FFFFFF" strokeWidth={0.9} fill="none" />
        <circle cx={22} cy={20} r={2.6} fill="#FFFFFF" />
        <circle cx={22.6} cy={20} r={1.2} fill={INK} stroke="none" />
        <path d="M24 16 C26 9 32 7 36 8 C32 11 30 13 29 17 Z" fill={LEMON} />
        <path d="M18 17 C18 11 22 8 25 8 C23 11 22 14 22 17 Z" fill={BLUE} />
        <path d="M8 14 C4 10 2 6 4 2 M6 23 C1 24 -1 28 1 31" stroke={RED} strokeWidth={1.2} fill="none" strokeLinecap="round" />
      </g>
      {/* a flame breath */}
      <path d="M4 26 C0 25 -2 27 1 29 C-1 31 2 33 4 31 Z" fill={RED} stroke={INK} strokeWidth={0.6} />
    </g>
  );
}

export const CardFace = memo(function CardFace({ id, className = '' }: { id: CardId; className?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const special = id === MAHJONG || id === DOG || id === PHOENIX || id === DRAGON;
  return (
    <svg viewBox="0 0 100 140" className={`block h-full w-full ${className}`} role="img" aria-label={cardName(id)}>
      <defs>
        <clipPath id={`${uid}card`}>
          <rect x={0} y={0} width={100} height={140} rx={6} />
        </clipPath>
      </defs>
      {special ? (
        <g clipPath={`url(#${uid}card)`}>
          <rect x={0} y={0} width={100} height={140} fill={STOCK} />
          {id === DRAGON ? <DragonArt /> : id === PHOENIX ? <PhoenixArt /> : id === DOG ? <DogArt /> : <MahjongArt />}
        </g>
      ) : (
        <NormalFace id={id} uid={uid} />
      )}
      <rect x={0.5} y={0.5} width={99} height={139} rx={5.6} fill="none" stroke="#CFCAC0" strokeWidth={1} />
    </svg>
  );
});

/* ---------- card back: olive gold covered in white characters ---------- */

const GLYPHS = ['福', '禄', '寿', '喜', '財', '龍', '天', '和', '風'];
const CJK = { fontFamily: '"Songti SC", "STSong", "Noto Serif SC", "Noto Serif CJK SC", "SimSun", "PingFang SC", "Hiragino Sans GB", serif', fontWeight: 900 };

export const CardBack = memo(function CardBack({ className = '', mini = false }: { className?: string; mini?: boolean }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const cell = mini ? 22 : 12;
  const size = mini ? 19 : 10.5;
  const tileW = cell * 3;
  const tileH = cell * 2;
  return (
    <svg viewBox="0 0 100 140" className={`block h-full w-full ${className}`} aria-hidden>
      <defs>
        <pattern id={`${uid}hz`} width={tileW} height={tileH} patternUnits="userSpaceOnUse" patternTransform="rotate(-8)">
          <rect width={tileW} height={tileH} fill="#8F7E22" />
          {[0, 1, 2].map((i) => (
            <text key={`a${i}`} x={cell * i + cell / 2} y={cell * 0.86} textAnchor="middle" fontSize={size} fill="#FFFFFF" style={CJK}>
              {GLYPHS[i * 3]}
            </text>
          ))}
          {[0, 1, 2].map((i) => (
            <text
              key={`b${i}`}
              x={cell * i + cell / 2}
              y={cell * 1.86}
              textAnchor="middle"
              fontSize={size}
              fill="#FFFFFF"
              style={CJK}
              transform={i === 1 ? `rotate(180 ${cell * i + cell / 2} ${cell * 1.5})` : undefined}
            >
              {GLYPHS[i * 3 + 1 + (i % 2)]}
            </text>
          ))}
        </pattern>
        <clipPath id={`${uid}bc`}>
          <rect x={0} y={0} width={100} height={140} rx={6} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${uid}bc)`}>
        <rect x={0} y={0} width={100} height={140} fill="#8F7E22" />
        <rect x={0} y={0} width={100} height={140} fill={`url(#${uid}hz)`} />
      </g>
      <rect x={0.5} y={0.5} width={99} height={139} rx={5.6} fill="none" stroke="#6E611A" strokeWidth={1} />
    </svg>
  );
});
