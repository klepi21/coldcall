'use client';
/**
 * Cold Call Tichu cards. All art here is original, drawn by hand in SVG for Cold Call. It follows the
 * conventions of the standard Tichu deck so players recognise it at once: white stock, suit
 * colours and symbols, classic pip layout and double ended court cards. Cold Call twist: Lucky Lo
 * on the four special cards and a Lofi Blue back with a snowflake. No photo or
 * publisher illustration was traced, embedded or copied. Licence: Cold Call own work.
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

/* palette of the court cards */
const INK = '#111111';
const RED = '#D8262A';
const GREEN = '#17A04A';
const DEEP_BLUE = '#1E4FB8';
const SKIN = '#F6D334';
const STOCK = '#FFFFFF';
const FONT = { fontFamily: 'var(--font-inter), system-ui, sans-serif' };

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
          <circle cx={58.6} cy={27.6} r={1} fill={'#E9E52C'} />
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
          <LoSpecial id={id} uid={uid} />
        </g>
      ) : (
        <NormalFace id={id} uid={uid} />
      )}
      <rect x={0.5} y={0.5} width={99} height={139} rx={5.6} fill="none" stroke="#B9CDE2" strokeWidth={1} />
    </svg>
  );
});

/* ---------- special cards: Lucky Lo on Snow, each with its own sign ---------- */

const LO_SPECIAL: Record<string, { title: string; img: string; tint: string; mark: string }> = {
  [MAHJONG]: { title: 'MAH JONG', img: '/brand/mascot-deal.png', tint: '#5A8FE0', mark: '1' },
  [DOG]: { title: 'DOG', img: '/brand/mascot-shrug.png', tint: '#3DDC97', mark: 'Dog' },
  [PHOENIX]: { title: 'PHOENIX', img: '/brand/mascot-win.png', tint: '#7FE3FF', mark: 'Ph' },
  [DRAGON]: { title: 'DRAGON', img: '/img/mascot-shades.png', tint: '#FF5A6E', mark: 'Dr' },
};

/** Lucky Lo on the four special cards: dealing (Mah Jong), shrugging (Dog), with ice wings (Phoenix), and in a dragon scarf (Dragon). */
function LoSpecial({ id, uid }: { id: CardId; uid: string }) {
  const c = LO_SPECIAL[id]!;
  return (
    <>
      <defs>
        <linearGradient id={`${uid}snow`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#E3EFFA" />
        </linearGradient>
      </defs>
      <rect x={0} y={0} width={100} height={140} fill={`url(#${uid}snow)`} />
      <rect x={6} y={6} width={88} height={128} rx={4} fill="none" stroke={c.tint} strokeWidth={1.6} />
      <circle cx={50} cy={74} r={36} fill={c.tint} opacity={0.18} />
      {id === PHOENIX ? (
        <g fill="#BFF1FF" stroke={INK} strokeWidth={1} strokeLinejoin="round">
          <path d="M44 72 C30 60 16 58 8 64 C16 66 20 70 22 74 C14 74 10 78 8 84 C18 80 26 82 34 84 Z" />
          <path d="M56 72 C70 60 84 58 92 64 C84 66 80 70 78 74 C86 74 90 78 92 84 C82 80 74 82 66 84 Z" />
        </g>
      ) : null}
      <image href={c.img} x={12} y={34} width={76} height={76} preserveAspectRatio="xMidYMid meet" />
      {id === DRAGON ? (
        <path d="M30 96 C40 104 60 104 70 96 L74 104 C62 112 38 112 26 104 Z" fill="#FF5A6E" stroke={INK} strokeWidth={1} strokeLinejoin="round" />
      ) : null}
      <text x={56} y={26} textAnchor="middle" fontSize={10} fill={INK} style={{ fontFamily: 'var(--font-lilita), system-ui, sans-serif', letterSpacing: '0.04em' }}>
        {c.title}
      </text>
      <text x={10} y={20} fontSize={12} fill={c.tint} stroke={INK} strokeWidth={0.5} style={{ fontFamily: 'var(--font-lilita), system-ui, sans-serif' }}>
        {c.mark}
      </text>
      <text x={89} y={130} textAnchor="end" fontSize={10} fill={c.tint} stroke={INK} strokeWidth={0.4} style={{ fontFamily: 'var(--font-lilita), system-ui, sans-serif' }}>
        {c.mark}
      </text>
    </>
  );
}

/* ---------- card back: Lofi Blue with a white snowflake and a thin gold border ---------- */

function Snowflake({ cx, cy, r, stroke = '#FFFFFF', width = 2.2 }: { cx: number; cy: number; r: number; stroke?: string; width?: number }) {
  const arms = [0, 60, 120];
  return (
    <g stroke={stroke} strokeWidth={width} strokeLinecap="round" fill="none">
      {arms.map((a) => (
        <g key={a} transform={`rotate(${a} ${cx} ${cy})`}>
          <path d={`M${cx} ${cy - r}V${cy + r}`} />
          <path d={`M${cx - r * 0.28} ${cy - r * 0.78}L${cx} ${cy - r * 0.5}L${cx + r * 0.28} ${cy - r * 0.78}M${cx - r * 0.28} ${cy + r * 0.78}L${cx} ${cy + r * 0.5}L${cx + r * 0.28} ${cy + r * 0.78}`} />
        </g>
      ))}
    </g>
  );
}

export const CardBack = memo(function CardBack({ className = '', mini = false }: { className?: string; mini?: boolean }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  return (
    <svg viewBox="0 0 100 140" className={`block h-full w-full ${className}`} aria-hidden>
      <defs>
        <linearGradient id={`${uid}bk`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6F9FE8" />
          <stop offset="1" stopColor="#4A7ECC" />
        </linearGradient>
        <pattern id={`${uid}fl`} width={20} height={20} patternUnits="userSpaceOnUse">
          <circle cx={4} cy={4} r={0.9} fill="#FFFFFF" opacity={0.35} />
          <circle cx={14} cy={13} r={0.7} fill="#FFFFFF" opacity={0.28} />
        </pattern>
        <clipPath id={`${uid}bc`}>
          <rect x={0} y={0} width={100} height={140} rx={6} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${uid}bc)`}>
        <rect x={0} y={0} width={100} height={140} fill={`url(#${uid}bk)`} />
        {!mini ? <rect x={0} y={0} width={100} height={140} fill={`url(#${uid}fl)`} /> : null}
        <rect x={6} y={6} width={88} height={128} rx={4} fill="none" stroke="#F5C542" strokeWidth={mini ? 3 : 1.4} />
        <Snowflake cx={50} cy={70} r={mini ? 30 : 22} width={mini ? 5 : 2.6} />
      </g>
      <rect x={0.5} y={0.5} width={99} height={139} rx={5.6} fill="none" stroke="#080E1A" strokeWidth={1} />
    </svg>
  );
});
