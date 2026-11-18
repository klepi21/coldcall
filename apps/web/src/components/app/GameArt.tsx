import { useId } from 'react';
import type { GameKind } from '@evens/shared';

/** Per game neon accent, used for tiles, glows and badges. */
export const GAME_COLOR: Record<GameKind, string> = {
  chess: '#c6ff3d',
  backgammon: '#ff8a3d',
  tichu: '#ff4d8d',
  seabattle: '#3ddcff',
};

/** Original arena style illustrations: dark stage, neon outlines, one hero object per game. */
export function GameArt({ game, className = '' }: { game: GameKind; className?: string }) {
  const c = GAME_COLOR[game];
  // Unique per instance: the same game can render twice on a page (one copy hidden at a breakpoint).
  const id = `ga-${game}-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <svg viewBox="0 0 320 200" className={className} aria-hidden preserveAspectRatio="xMidYMid slice">
      <defs>
        <radialGradient id={`${id}-bg`} cx="0.5" cy="0.15" r="0.95">
          <stop offset="0" stopColor={c} stopOpacity="0.35" />
          <stop offset="0.45" stopColor="#1a1336" />
          <stop offset="1" stopColor="#08070f" />
        </radialGradient>
        <filter id={`${id}-glow`} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="4" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <pattern id={`${id}-grid`} width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M20 0H0V20" fill="none" stroke="#7c5cff" strokeOpacity="0.14" />
        </pattern>
      </defs>
      <rect width="320" height="200" fill={`url(#${id}-bg)`} />
      <rect width="320" height="200" fill={`url(#${id}-grid)`} />
      {/* floor glow */}
      <ellipse cx="160" cy="186" rx="130" ry="18" fill={c} opacity="0.18" />

      {game === 'chess' && (
        <g filter={`url(#${id}-glow)`}>
          <g transform="translate(30 150) skewX(-20) scale(1 .42)" opacity=".85">
            {Array.from({ length: 40 }, (_, i) => (
              <rect key={i} x={(i % 8) * 34} y={Math.floor(i / 8) * 34} width="34" height="34" fill={(i + Math.floor(i / 8)) % 2 ? '#1d1840' : c} fillOpacity={(i + Math.floor(i / 8)) % 2 ? 1 : 0.22} stroke={c} strokeOpacity=".35" />
            ))}
          </g>
          <g transform="translate(126 18)">
            <path d="M10 150h58l-5-16H15z" fill="#0e0b1d" stroke={c} strokeWidth="2.5" />
            <path d="M18 134c2-24 13-32 19-45-11 2-19 9-26 4-4-3 0-11 7-18 9-9 11-22 24-28l2-11 9 11c18 7 28 24 28 50 0 15-4 26-9 37z" fill="#0e0b1d" stroke={c} strokeWidth="3" strokeLinejoin="round" />
            <circle cx="42" cy="47" r="3.5" fill={c} />
          </g>
        </g>
      )}

      {game === 'backgammon' && (
        <g filter={`url(#${id}-glow)`}>
          <g transform="translate(40 40)">
            <rect width="240" height="120" rx="10" fill="#120d22" stroke={c} strokeWidth="2.5" />
            {Array.from({ length: 10 }, (_, i) => (
              <g key={i}>
                <path d={`M${12 + i * 21.6} 6 l10.8 44 l10.8 -44z`} fill={i % 2 ? c : 'none'} fillOpacity=".55" stroke={c} strokeOpacity=".7" />
                <path d={`M${12 + i * 21.6} 114 l10.8 -44 l10.8 44z`} fill={i % 2 ? 'none' : c} fillOpacity=".55" stroke={c} strokeOpacity=".7" />
              </g>
            ))}
          </g>
          {[
            [112, 74, -14, [[8, 8], [22, 22], [15, 15]]],
            [168, 86, 16, [[8, 8], [22, 22], [22, 8], [8, 22]]],
          ].map(([x, y, r, pips]: any, k) => (
            <g key={k} transform={`translate(${x} ${y}) rotate(${r})`}>
              <rect width="34" height="34" rx="7" fill="#fff" stroke={c} strokeWidth="2" />
              {pips.map(([px, py]: number[], i: number) => (
                <circle key={i} cx={px! * 1.13} cy={py! * 1.13} r="3.4" fill="#0b0816" />
              ))}
            </g>
          ))}
        </g>
      )}

      {game === 'tichu' && (
        <g filter={`url(#${id}-glow)`}>
          {[
            { r: -26, x: 104, col: '#1f9d55', rank: 'A', sym: 'jade' },
            { r: -9, x: 136, col: '#16161c', rank: 'K', sym: 'sword' },
            { r: 9, x: 168, col: '#1f5fd6', rank: 'Q', sym: 'pagoda' },
            { r: 26, x: 200, col: '#d1312b', rank: 'J', sym: 'star' },
          ].map((card, i) => (
            <g key={i} transform={`translate(${card.x} 172) rotate(${card.r}) translate(-30 -112)`}>
              <rect width="62" height="88" rx="7" fill="#fff" stroke={c} strokeWidth="2" />
              <text x="8" y="21" fontSize="17" fontWeight="800" fill={card.col} fontFamily="system-ui">
                {card.rank}
              </text>
              {card.sym === 'jade' && <g><circle cx="31" cy="50" r="13" fill={card.col} /><circle cx="31" cy="50" r="5" fill="#fff" /></g>}
              {card.sym === 'sword' && <g fill={card.col}><rect x="29" y="32" width="5" height="30" rx="1.5" /><rect x="21" y="60" width="21" height="4" rx="2" /><rect x="29" y="63" width="5" height="9" rx="2" /></g>}
              {card.sym === 'pagoda' && <g fill={card.col}><path d="M31 33l14 9H17z" /><rect x="22" y="42" width="18" height="6" /><path d="M31 47l16 9H15z" /><rect x="22" y="56" width="18" height="8" /></g>}
              {card.sym === 'star' && <path d="M31 36l4.4 9.6 10.4 1-7.9 6.9 2.4 10.2-9.3-5.5-9.3 5.5 2.4-10.2-7.9-6.9 10.4-1z" fill={card.col} />}
            </g>
          ))}
        </g>
      )}

      {game === 'seabattle' && (
        <g filter={`url(#${id}-glow)`}>
          <g transform="translate(70 26)" opacity=".9">
            {Array.from({ length: 7 }, (_, i) => (
              <g key={i}>
                <line x1={i * 30} y1="0" x2={i * 30} y2="150" stroke={c} strokeOpacity=".35" />
                <line x1="0" y1={i * 25} x2="180" y2={i * 25} stroke={c} strokeOpacity=".35" />
              </g>
            ))}
            <circle cx="90" cy="75" r="62" fill="none" stroke={c} strokeOpacity=".5" strokeWidth="1.5" />
            <circle cx="90" cy="75" r="34" fill="none" stroke={c} strokeOpacity=".4" />
            <path d="M90 75 L150 46 A62 62 0 0 1 152 80 Z" fill={c} opacity=".25" />
          </g>
          {/* original ship silhouette from above */}
          <g transform="translate(96 88)">
            <path d="M0 14 Q8 0 30 2 L104 4 Q118 8 122 14 Q118 20 104 24 L30 26 Q8 28 0 14Z" fill="#0d1424" stroke={c} strokeWidth="2.5" />
            <rect x="44" y="8" width="26" height="12" rx="3" fill="none" stroke={c} strokeWidth="2" />
            <circle cx="88" cy="14" r="4" fill="none" stroke={c} strokeWidth="2" />
            <circle cx="24" cy="14" r="4" fill="none" stroke={c} strokeWidth="2" />
          </g>
          <g transform="translate(232 60)">
            <circle r="13" fill="#ff5a36" opacity=".9" />
            <circle r="7" fill="#ffd23f" />
          </g>
        </g>
      )}
    </svg>
  );
}
