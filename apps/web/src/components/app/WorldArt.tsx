'use client';
import { useId, type CSSProperties, type ReactNode } from 'react';
import type { GameKind } from '@coldcall/shared';

/**
 * "Four Worlds" lobby art. Original SVG, three depth layers (far sky, the world, the hero object)
 * that shift with the pointer inside a .tilt parent. Ambient motion is CSS only and stops under
 * prefers-reduced-motion. Cheap: no filters except one blur per tile.
 */
export const WORLD: Record<GameKind, { c: string; c2: string; hook: string; world: string }> = {
  chess: { c: '#c6ff3d', c2: '#3dffc8', hook: 'Marble, obsidian and nothing left to luck.', world: 'The Marble World' },
  backgammon: { c: '#ff8a3d', c2: '#ffd23f', hook: 'Lantern light, warm wood, dice in orbit.', world: 'The Lantern World' },
  tichu: { c: '#ff4d8d', c2: '#2fd6a0', hook: 'Four players, two teams, one Dragon.', world: 'The Dragon World' },
  seabattle: { c: '#3ddcff', c2: '#7c5cff', hook: 'Hide your fleet. The sonar never sleeps.', world: 'The Ocean World' },
};

function Layer({ depth, children, className = '' }: { depth: number; children: ReactNode; className?: string }) {
  return (
    <div className={`parallax absolute inset-0 ${className}`} style={{ '--depth': `${depth}px` } as CSSProperties}>
      <svg viewBox="0 0 400 260" preserveAspectRatio="xMidYMid slice" className="size-full overflow-visible">
        {children}
      </svg>
    </div>
  );
}

const spinAt = (x: number, y: number, dur: string, reverse = false): CSSProperties => ({
  transformOrigin: `${x}px ${y}px`,
  transformBox: 'view-box',
  ['--dur' as string]: dur,
  animationDirection: reverse ? 'reverse' : undefined,
});

function Stars({ seed, color = '#fff' }: { seed: number; color?: string }) {
  const pts = Array.from({ length: 22 }, (_, i) => {
    const a = Math.sin(seed * 9.1 + i * 12.9898) * 43758.5453;
    const b = Math.sin(seed * 3.7 + i * 78.233) * 12345.678;
    // Rounded so server and client render identical attributes (Math.sin differs in the last digits).
    return { x: Math.round((a - Math.floor(a)) * 4000) / 10, y: Math.round((b - Math.floor(b)) * 1500) / 10, r: 0.5 + ((i * 7) % 5) * 0.2, d: `${2 + (i % 5)}s`, delay: `${(i % 7) * -600}ms` };
  });
  return (
    <g>
      {pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={p.r} fill={color} className={i % 3 === 0 ? 'w-glow' : undefined} style={{ ['--dur' as string]: p.d, animationDelay: p.delay }} opacity={0.75} />
      ))}
    </g>
  );
}

export function WorldArt({ game, className = '' }: { game: GameKind; className?: string }) {
  const uid = useId().replace(/:/g, '');
  const { c, c2 } = WORLD[game];
  const g = (n: string) => `${uid}-${n}`;
  return (
    <div className={`relative overflow-hidden ${className}`} aria-hidden>
      {/* far: sky, nebula, stars */}
      <Layer depth={4}>
        <defs>
          <radialGradient id={g('sky')} cx="0.5" cy="0.95" r="0.9">
            <stop offset="0" stopColor={c} stopOpacity="0.38" />
            <stop offset="0.45" stopColor={c2} stopOpacity="0.1" />
            <stop offset="1" stopColor="#000" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="400" height="260" fill={`url(#${g('sky')})`} />
        <Stars seed={game.length} />
        {game === 'chess' && (
          <g className="w-aurora" style={{ ['--dur' as string]: '11s' }}>
            <path d="M-20 90 C60 40 140 110 210 70 S330 30 420 80 L420 118 C330 70 260 130 200 108 S70 80 -20 128Z" fill={c} opacity="0.22" />
            <path d="M-20 70 C80 30 150 80 230 52 S350 30 420 50 L420 70 C340 50 280 90 220 78 S80 60 -20 96Z" fill={c2} opacity="0.16" />
          </g>
        )}
        {game === 'backgammon' && (
          <g>
            <circle cx="320" cy="60" r="46" fill={c} opacity="0.14" className="w-glow" style={{ ['--dur' as string]: '4s' }} />
            <circle cx="320" cy="60" r="20" fill={c2} opacity="0.3" />
          </g>
        )}
        {game === 'tichu' && (
          <g className="w-aurora" style={{ ['--dur' as string]: '13s' }}>
            <ellipse cx="110" cy="70" rx="140" ry="40" fill={c} opacity="0.16" />
            <ellipse cx="300" cy="50" rx="120" ry="34" fill={c2} opacity="0.13" />
          </g>
        )}
        {game === 'seabattle' && (
          <g>
            {[0, 1, 2].map((i) => (
              <circle key={i} cx="200" cy="200" r={90 + i * 46} fill="none" stroke={c} strokeOpacity={0.16 - i * 0.04} strokeWidth="1" />
            ))}
          </g>
        )}
      </Layer>

      {/* mid: the world itself */}
      <Layer depth={9}>
        <defs>
          <radialGradient id={g('orb')} cx="0.38" cy="0.22" r="0.85">
            {game === 'chess' && [<stop key="a" offset="0" stopColor="#f2ede4" />, <stop key="b" offset="0.38" stopColor="#7d766a" />, <stop key="c" offset="0.75" stopColor="#15131c" />, <stop key="d" offset="1" stopColor="#07070c" />]}
            {game === 'backgammon' && [<stop key="a" offset="0" stopColor="#ffcf8a" />, <stop key="b" offset="0.35" stopColor="#a8643a" />, <stop key="c" offset="0.75" stopColor="#3b2114" />, <stop key="d" offset="1" stopColor="#120a08" />]}
            {game === 'tichu' && [<stop key="a" offset="0" stopColor="#9ff5d6" />, <stop key="b" offset="0.4" stopColor="#1f9d74" />, <stop key="c" offset="0.78" stopColor="#0b3a33" />, <stop key="d" offset="1" stopColor="#061512" />]}
            {game === 'seabattle' && [<stop key="a" offset="0" stopColor="#a6f3ff" />, <stop key="b" offset="0.38" stopColor="#1a8fc4" />, <stop key="c" offset="0.78" stopColor="#0a2546" />, <stop key="d" offset="1" stopColor="#050b18" />]}
          </radialGradient>
          <clipPath id={g('clip')}>
            <circle cx="200" cy="292" r="168" />
          </clipPath>
          <radialGradient id={g('rim')} cx="0.5" cy="0.5" r="0.5">
            <stop offset="0.86" stopColor={c} stopOpacity="0" />
            <stop offset="0.985" stopColor={c} stopOpacity="0.9" />
            <stop offset="1" stopColor={c} stopOpacity="0" />
          </radialGradient>
        </defs>
        {/* atmosphere glow */}
        <circle cx="200" cy="292" r="196" fill={c} opacity="0.1" />
        <circle cx="200" cy="292" r="168" fill={`url(#${g('orb')})`} />
        <g clipPath={`url(#${g('clip')})`}>
          {game === 'chess' && (
            <g className="w-spin" style={spinAt(200, 292, '80s')}>
              {Array.from({ length: 18 }, (_, i) =>
                Array.from({ length: 18 }, (_, j) => ((i + j) % 2 ? <rect key={`${i}-${j}`} x={-52 + i * 28} y={40 + j * 28} width="28" height="28" fill="#07070c" opacity="0.42" /> : null)),
              )}
            </g>
          )}
          {game === 'backgammon' && (
            <g opacity="0.5">
              {Array.from({ length: 9 }, (_, i) => (
                <path key={i} d={`M${20 + i * 44} 150 C ${40 + i * 44} 200, ${0 + i * 44} 260, ${30 + i * 44} 470`} stroke="#2a160c" strokeWidth="5" fill="none" opacity="0.55" />
              ))}
              {Array.from({ length: 8 }, (_, i) => (
                <path key={`t${i}`} d={`M${48 + i * 40} 132 l20 0 l-10 46z`} fill={i % 2 ? '#efe6d2' : '#c65a3a'} opacity="0.7" />
              ))}
            </g>
          )}
          {game === 'tichu' && (
            <g opacity="0.45" className="w-spin" style={spinAt(200, 292, '90s', true)}>
              {Array.from({ length: 6 }, (_, i) => (
                <circle key={i} cx={200} cy={292} r={40 + i * 26} fill="none" stroke="#ffffff" strokeOpacity="0.18" strokeDasharray="4 10" />
              ))}
            </g>
          )}
          {game === 'seabattle' && (
            <g>
              {Array.from({ length: 7 }, (_, i) => (
                <ellipse key={i} cx="200" cy="292" rx="168" ry={20 + i * 26} fill="none" stroke="#bff6ff" strokeOpacity="0.16" />
              ))}
              {Array.from({ length: 7 }, (_, i) => (
                <ellipse key={`m${i}`} cx="200" cy="292" rx={20 + i * 26} ry="168" fill="none" stroke="#bff6ff" strokeOpacity="0.1" />
              ))}
              <g className="w-spin" style={spinAt(200, 292, '5s')}>
                <path d="M200 292 L200 124 A168 168 0 0 1 320 172 Z" fill={c} opacity="0.32" />
              </g>
            </g>
          )}
          {/* terminator shadow */}
          <circle cx="250" cy="330" r="190" fill="#000" opacity="0.28" />
        </g>
        <circle cx="200" cy="292" r="168" fill={`url(#${g('rim')})`} />
        {game === 'backgammon' && (
          <g>
            <ellipse cx="200" cy="170" rx="190" ry="26" fill="none" stroke={c2} strokeOpacity="0.55" strokeWidth="2" />
            <ellipse cx="200" cy="170" rx="176" ry="21" fill="none" stroke={c} strokeOpacity="0.3" strokeWidth="5" />
          </g>
        )}
      </Layer>

      {/* near: the hero objects */}
      <Layer depth={16}>
        <defs>
          <linearGradient id={g('piece')} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#2a2738" />
            <stop offset="1" stopColor="#09080f" />
          </linearGradient>
          <filter id={g('soft')} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
        </defs>

        {game === 'chess' && (
          <g>
            <ellipse cx="200" cy="146" rx="46" ry="9" fill={c} opacity="0.35" filter={`url(#${g('soft')})`} />
            <g className="w-bob" style={{ ['--dur' as string]: '5.5s' }}>
              <g transform="translate(162 22) scale(0.92)">
                <path d="M10 150h58l-5-16H15z" fill={`url(#${g('piece')})`} stroke={c} strokeWidth="2.5" />
                <path d="M18 134c2-24 13-32 19-45-11 2-19 9-26 4-4-3 0-11 7-18 9-9 11-22 24-28l2-11 9 11c18 7 28 24 28 50 0 15-4 26-9 37z" fill={`url(#${g('piece')})`} stroke={c} strokeWidth="3" strokeLinejoin="round" />
                <path d="M51 40c12 8 18 22 17 40" fill="none" stroke="#ffffff" strokeOpacity="0.35" strokeWidth="3" strokeLinecap="round" />
                <circle cx="42" cy="47" r="3.5" fill={c} />
              </g>
            </g>
            {[
              [96, 168, 0.5, '6.5s'],
              [300, 160, 0.56, '7s'],
            ].map(([x, y, s, d], i) => (
              <g key={i} className="w-bob" style={{ ['--dur' as string]: d as string, animationDelay: `${-i * 2}s` }}>
                <g transform={`translate(${x} ${y}) scale(${s})`}>
                  <circle cx="0" cy="-58" r="14" fill={i ? '#efe9dd' : `url(#${g('piece')})`} stroke={c} strokeWidth="3" />
                  <path d="M-12 -44h24l6 36h-36z" fill={i ? '#efe9dd' : `url(#${g('piece')})`} stroke={c} strokeWidth="3" />
                  <path d="M-24 -8h48l4 12h-56z" fill={i ? '#efe9dd' : `url(#${g('piece')})`} stroke={c} strokeWidth="3" />
                </g>
              </g>
            ))}
          </g>
        )}

        {game === 'backgammon' && (
          <g>
            <circle cx="200" cy="120" r="58" fill={c} opacity="0.25" filter={`url(#${g('soft')})`} />
            {/* dice in orbit */}
            <g className="w-spin" style={spinAt(200, 150, '16s')}>
              {[
                [96, 120, -14, [[8, 8], [22, 22], [15, 15]]],
                [270, 150, 18, [[8, 8], [22, 22], [22, 8], [8, 22]]],
              ].map(([x, y, r, pips]: any, k) => (
                <g key={k} transform={`translate(${x} ${y})`}>
                  <g className="w-spin" style={spinAt(17, 17, '16s', true)}>
                    <g transform={`rotate(${r} 17 17)`}>
                      <rect width="38" height="38" rx="8" fill="#fbf6ea" stroke={c} strokeWidth="2" />
                      <rect x="3" y="3" width="32" height="10" rx="5" fill="#ffffff" opacity="0.7" />
                      {pips.map(([px, py]: number[], i: number) => (
                        <circle key={i} cx={px! * 1.25} cy={py! * 1.25} r="3.6" fill="#2a160c" />
                      ))}
                    </g>
                  </g>
                </g>
              ))}
            </g>
            {/* checker stack */}
            <g className="w-bob" style={{ ['--dur' as string]: '6s' }}>
              {[0, 1, 2].map((i) => (
                <g key={i} transform={`translate(200 ${132 - i * 12})`}>
                  <ellipse rx="30" ry="11" cy="6" fill={i % 2 ? '#1a120e' : '#efe6d2'} stroke={c} strokeWidth="1.5" />
                  <ellipse rx="30" ry="11" fill={i % 2 ? '#2a1d16' : '#fffaf0'} stroke={c} strokeWidth="1.5" />
                  <ellipse rx="18" ry="6" fill="none" stroke={i % 2 ? '#5a4030' : '#d8ccb4'} strokeWidth="1.5" />
                </g>
              ))}
            </g>
          </g>
        )}

        {game === 'tichu' && (
          <g>
            <circle cx="200" cy="110" r="60" fill={c} opacity="0.3" filter={`url(#${g('soft')})`} />
            {[
              { x: 96, y: 126, r: -22, col: '#1f9d55', rank: 'A', d: '6s' },
              { x: 304, y: 122, r: 20, col: '#1f5fd6', rank: 'K', d: '6.6s' },
              { x: 140, y: 100, r: -10, col: '#d1312b', rank: '10', d: '7.2s' },
              { x: 260, y: 98, r: 10, col: '#16161c', rank: 'Q', d: '5.8s' },
            ].map((k, i) => (
              <g key={i} className="w-bob" style={{ ['--dur' as string]: k.d, animationDelay: `${-i * 1.3}s` }}>
                <g transform={`translate(${k.x} ${k.y}) rotate(${k.r}) translate(-24 -34)`}>
                  <rect width="48" height="68" rx="6" fill="#fffdf8" stroke={c} strokeOpacity="0.8" strokeWidth="1.5" />
                  <text x="6" y="17" fontSize="14" fontWeight="800" fill={k.col} fontFamily="system-ui">
                    {k.rank}
                  </text>
                  <circle cx="24" cy="40" r="9" fill={k.col} opacity="0.9" />
                </g>
              </g>
            ))}
            {/* the Dragon card, glowing */}
            <g className="w-bob" style={{ ['--dur' as string]: '5s' }}>
              <g transform="translate(200 96) translate(-34 -48)">
                <rect x="-4" y="-4" width="76" height="104" rx="10" fill={c2} opacity="0.35" filter={`url(#${g('soft')})`} className="w-glow" />
                <rect width="68" height="96" rx="8" fill="#1a0b14" stroke="#ffd23f" strokeWidth="2.5" />
                <rect x="5" y="5" width="58" height="86" rx="5" fill="none" stroke={c} strokeOpacity="0.6" />
                {/* stylised dragon: a coiled body and a flame, original drawing */}
                <path d="M18 70 C10 52 30 46 34 56 C38 66 56 60 50 44 C46 32 30 34 30 26 C30 18 42 16 46 22" fill="none" stroke="#ffd23f" strokeWidth="4" strokeLinecap="round" />
                <circle cx="46" cy="22" r="4" fill="#ffd23f" />
                <path d="M50 20 q8 -2 10 -8 q-2 6 2 10 q-6 0 -12 -2z" fill={c} />
                <text x="34" y="88" fontSize="7" fontWeight="800" fill="#ffd23f" textAnchor="middle" fontFamily="system-ui" letterSpacing="1.5">
                  DRAGON
                </text>
              </g>
            </g>
          </g>
        )}

        {game === 'seabattle' && (
          <g>
            <g className="w-sail" style={{ ['--dur' as string]: '9s' }}>
              <g transform="translate(150 106)">
                <ellipse cx="50" cy="26" rx="62" ry="6" fill={c} opacity="0.3" filter={`url(#${g('soft')})`} />
                <path d="M0 14 Q8 0 30 2 L84 4 Q98 8 102 14 Q98 20 84 24 L30 26 Q8 28 0 14Z" fill="#0d1424" stroke={c} strokeWidth="2.5" />
                <rect x="36" y="8" width="22" height="12" rx="3" fill="none" stroke={c} strokeWidth="2" />
                <circle cx="72" cy="14" r="3.5" fill="none" stroke={c} strokeWidth="2" />
                <circle cx="20" cy="14" r="3.5" fill="none" stroke={c} strokeWidth="2" />
              </g>
            </g>
            {[
              [104, 168, '2.4s'],
              [300, 176, '3.1s'],
              [252, 150, '2.7s'],
            ].map(([x, y, d], i) => (
              <g key={i} className="w-glow" style={{ ['--dur' as string]: d as string, animationDelay: `${-i}s` }}>
                <circle cx={x as number} cy={y as number} r="9" fill="none" stroke={i === 2 ? '#ff5a36' : c} strokeWidth="1.5" />
                <circle cx={x as number} cy={y as number} r="3" fill={i === 2 ? '#ffd23f' : c} />
              </g>
            ))}
          </g>
        )}
      </Layer>
    </div>
  );
}
