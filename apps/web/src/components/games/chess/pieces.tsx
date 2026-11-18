'use client';
/**
 * Cold Call chess pieces.
 *
 * ORIGINAL ARTWORK: every path in this file was drawn by hand for Cold Call on a 100 x 100 grid
 * (November 2026). It is not traced from, adapted from or based on any existing piece set
 * (not cburnett, Merida, Alpha, Staunton fonts or any other). Licence: owned by Cold Call.
 *
 * Style: clean, slightly classical silhouettes built from a few stacked shapes so the
 * overlaps draw the inner contour lines. Ivory pieces have an ink outline, ink pieces have
 * a thin cool highlight on their inner lines. Readable at 32px.
 */
import { useId } from 'react';

export type PieceColor = 'w' | 'b';
export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';

export const PIECE_NAMES: Record<PieceType, string> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
};

interface PieceDef {
  /** Filled shapes, drawn back to front. */
  shapes: string[];
  /** Inner lines (stroke only). */
  lines?: string[];
  /** Small solid marks (eye, nostril), filled with the line colour. */
  marks?: string[];
}

const BASE = 'M25 89H75A4 4 0 0 0 79 85A6 6 0 0 0 73 79H27A6 6 0 0 0 21 85A4 4 0 0 0 25 89Z';
const RING = 'M28 79H72A2.5 2.5 0 0 0 74.5 76.5V73A2.5 2.5 0 0 0 72 70.5H28A2.5 2.5 0 0 0 25.5 73V76.5A2.5 2.5 0 0 0 28 79Z';

const DEFS: Record<PieceType, PieceDef> = {
  p: {
    shapes: [
      'M30 89H70A4 4 0 0 0 74 85A6 6 0 0 0 68 79H32A6 6 0 0 0 26 85A4 4 0 0 0 30 89Z',
      'M35.5 79C41 71 43.5 62 44 52H56C56.5 62 59 71 64.5 79Z',
      'M36.5 51.5A13.5 4.6 0 0 1 63.5 51.5A13.5 4.6 0 0 1 36.5 51.5Z',
      'M61.5 34A11.5 11.5 0 1 1 38.5 34A11.5 11.5 0 1 1 61.5 34Z',
    ],
  },
  r: {
    shapes: [
      BASE,
      RING,
      'M32.5 70.5L35.5 39H64.5L67.5 70.5Z',
      'M30 39.5H70V34H30Z',
      'M28.5 34V18.5A2 2 0 0 1 30.5 16.5H36A1 1 0 0 1 37 17.5V23H43V17.5A1 1 0 0 1 44 16.5H56A1 1 0 0 1 57 17.5V23H63V17.5A1 1 0 0 1 64 16.5H69.5A2 2 0 0 1 71.5 18.5V34Z',
    ],
    lines: ['M36.5 46H63.5', 'M34.5 63.5H65.5'],
  },
  n: {
    shapes: [
      BASE,
      RING,
      'M33 70.5C32.5 61 36 55.5 43 51.5C38 51.5 33 53.5 28 55.5C22.5 57 19 52 20.5 47.5C22 44 27 39.5 30.5 34C33 29 36 24.5 40 21.5L42 13L47.5 19C59.5 20 69.5 29.5 71.5 43.5C72.5 54.5 70.5 63 69.5 70.5Z',
    ],
    lines: ['M51 24.5C60 27.5 65.5 35.5 66.5 47', 'M22.5 51Q26 52.5 29.5 50.5', 'M43 51.5C46 50 48.5 47.5 49.5 44'],
    marks: ['M43.5 31.5A2.8 2.2 -20 1 1 38 32.5A2.8 2.2 -20 1 1 43.5 31.5Z', 'M27 46.5A1.6 1.6 0 1 1 23.8 46.5A1.6 1.6 0 1 1 27 46.5Z'],
  },
  b: {
    shapes: [
      'M27 89H73A4 4 0 0 0 77 85A6 6 0 0 0 71 79H29A6 6 0 0 0 23 85A4 4 0 0 0 27 89Z',
      'M34 79C40.5 74.5 42.5 70 42.5 66H57.5C57.5 70 59.5 74.5 66 79Z',
      'M35 66A15 4.5 0 0 1 65 66A15 4.5 0 0 1 35 66Z',
      'M50 19.5C40 26.5 34.5 38 36 50C37 58 42.5 62 50 62C57.5 62 63 58 64 50C65.5 38 60 26.5 50 19.5Z',
      'M54.5 15A4.5 4.5 0 1 1 45.5 15A4.5 4.5 0 1 1 54.5 15Z',
    ],
    lines: ['M56 31L46.5 43.5', 'M38.5 54Q50 58.5 61.5 54'],
  },
  q: {
    shapes: [
      BASE,
      RING,
      'M33 70.5L27 33L36.5 51L39 27L45 47.5L50 23L55 47.5L61 27L63.5 51L73 33L67 70.5Z',
      'M29.5 32A4 4 0 1 1 21.5 32A4 4 0 1 1 29.5 32Z',
      'M42 25A4 4 0 1 1 34 25A4 4 0 1 1 42 25Z',
      'M54.5 20.5A4.5 4.5 0 1 1 45.5 20.5A4.5 4.5 0 1 1 54.5 20.5Z',
      'M66 25A4 4 0 1 1 58 25A4 4 0 1 1 66 25Z',
      'M78.5 32A4 4 0 1 1 70.5 32A4 4 0 1 1 78.5 32Z',
    ],
    lines: ['M32 61.5Q50 66 68 61.5'],
  },
  k: {
    shapes: [
      BASE,
      RING,
      'M32.5 70.5C30.5 61 25 52 28.5 44.5C32 37.5 43 38 50 47C57 38 68 37.5 71.5 44.5C75 52 69.5 61 67.5 70.5Z',
      'M42 47C42 40 45.5 34.5 50 34.5C54.5 34.5 58 40 58 47Z',
      'M47.5 13H52.5V19H58V24H52.5V34.5H47.5V24H42V19H47.5Z',
    ],
    lines: ['M33.5 62Q50 67 66.5 62'],
  },
};

const INK = '#141a28';

interface PieceArtProps {
  color: PieceColor;
  type: PieceType;
  /** Light rim for ink pieces on dark backgrounds (Night board, dark UI surfaces). */
  halo?: boolean;
  /** Rim thickness in grid units (thinner for tiny icons). */
  haloWidth?: number;
  /** Soft contact shadow under the base. */
  shadow?: boolean;
  className?: string;
  title?: string;
}

export function PieceArt({ color, type, halo = false, haloWidth = 8.5, shadow = true, className = 'size-full', title }: PieceArtProps) {
  const raw = useId();
  const gid = `pg${raw.replace(/[^a-zA-Z0-9]/g, '')}`;
  const def = DEFS[type];
  const light = color === 'w';
  const stroke = light ? INK : '#05070d';
  const lineColor = light ? INK : 'rgba(170,184,214,0.75)';
  const markColor = light ? INK : 'rgba(205,215,236,0.9)';
  return (
    <svg viewBox="0 0 100 100" className={className} role={title ? 'img' : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
      <defs>
        <linearGradient id={gid} x1="0.15" y1="0" x2="0.85" y2="1">
          {light ? (
            <>
              <stop offset="0" stopColor="#fffbf2" />
              <stop offset="0.55" stopColor="#f1e8d6" />
              <stop offset="1" stopColor="#dccfb5" />
            </>
          ) : (
            <>
              <stop offset="0" stopColor="#47526b" />
              <stop offset="0.45" stopColor="#262e41" />
              <stop offset="1" stopColor="#11151f" />
            </>
          )}
        </linearGradient>
      </defs>
      {shadow ? <ellipse cx="50" cy="89.5" rx="31" ry="4.2" fill="rgba(0,0,0,0.22)" /> : null}
      {halo ? (
        <g fill="none" stroke="rgba(214,224,246,0.62)" strokeWidth={haloWidth} strokeLinejoin="round">
          {def.shapes.map((d, i) => (
            <path key={i} d={d} />
          ))}
        </g>
      ) : null}
      <g fill={`url(#${gid})`} stroke={stroke} strokeWidth="3.2" strokeLinejoin="round" strokeLinecap="round">
        {def.shapes.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
      {def.lines ? (
        <g fill="none" stroke={lineColor} strokeWidth="2.6" strokeLinecap="round">
          {def.lines.map((d, i) => (
            <path key={i} d={d} />
          ))}
        </g>
      ) : null}
      {def.marks ? (
        <g fill={markColor}>
          {def.marks.map((d, i) => (
            <path key={i} d={d} />
          ))}
        </g>
      ) : null}
    </svg>
  );
}
