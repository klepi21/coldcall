'use client';
import type { GameKind } from '@coldcall/shared';
import { GAME_COLOR } from '@/components/app/GameArt';

/** Surface paint per world: marble and obsidian, wood and brass, pink and jade, deep ocean. */
const ORB_BG: Record<GameKind, string> = {
  chess:
    'radial-gradient(circle at 34% 30%, #ffffff 0%, #d9dce6 22%, #8c8fa6 46%, #1b1a2b 70%, #07060f 100%), repeating-conic-gradient(from 20deg, rgba(0,0,0,.35) 0 25%, transparent 0 50%)',
  backgammon:
    'radial-gradient(circle at 34% 30%, #ffd9a8 0%, #c9773a 26%, #7a3d16 55%, #2a1206 85%), repeating-linear-gradient(80deg, rgba(0,0,0,.18) 0 3px, transparent 3px 9px)',
  tichu: 'radial-gradient(circle at 34% 30%, #ffd1e4 0%, #ff4d8d 30%, #1f9d6e 62%, #082a1e 90%)',
  seabattle: 'radial-gradient(circle at 34% 30%, #c9f6ff 0%, #3ddcff 24%, #0a5a8a 52%, #04182c 85%)',
};

export function WorldGlyph({ game, className = 'size-1/2' }: { game: GameKind; className?: string }) {
  if (game === 'chess')
    return (
      <svg viewBox="0 0 64 64" className={className} aria-hidden>
        <path
          d="M18 56h30l-3-8H21zM22 48c1-12 7-16 10-23-6 1-10 5-14 2-2-2 0-6 4-10 5-5 6-12 13-15l1-6 5 6c10 4 15 13 15 27 0 8-2 14-5 19z"
          fill="#0b0a14"
          stroke="#c6ff3d"
          strokeWidth="2.4"
          strokeLinejoin="round"
        />
        <circle cx="36" cy="16" r="2" fill="#c6ff3d" />
      </svg>
    );
  if (game === 'backgammon')
    return (
      <svg viewBox="0 0 64 64" className={className} aria-hidden>
        <g transform="rotate(-14 22 34)">
          <rect x="8" y="20" width="26" height="26" rx="6" fill="#fff8ee" stroke="#ff8a3d" strokeWidth="2" />
          {[[15, 27], [27, 39], [21, 33]].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="2.6" fill="#1a0f08" />
          ))}
        </g>
        <g transform="rotate(16 44 30)">
          <rect x="32" y="16" width="24" height="24" rx="6" fill="#fff8ee" stroke="#ff8a3d" strokeWidth="2" />
          {[[38, 22], [50, 22], [38, 34], [50, 34]].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="2.4" fill="#1a0f08" />
          ))}
        </g>
      </svg>
    );
  if (game === 'tichu')
    return (
      <svg viewBox="0 0 64 64" className={className} aria-hidden>
        <g transform="rotate(-16 24 40)">
          <rect x="10" y="14" width="24" height="34" rx="4" fill="#fff" stroke="#1f9d6e" strokeWidth="2" />
          <circle cx="22" cy="31" r="6" fill="#1f9d6e" />
        </g>
        <g transform="rotate(12 40 36)">
          <rect x="28" y="10" width="26" height="38" rx="4" fill="#ffe7f0" stroke="#ff4d8d" strokeWidth="2.2" />
          <path d="M41 18c6 3 8 9 4 13 4 1 6 5 3 8-3-2-6-2-8 0-1-4-5-5-8-3 0-5 4-8 9-8-3-3-3-7 0-10z" fill="#ff4d8d" />
        </g>
      </svg>
    );
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <circle cx="32" cy="34" r="20" fill="none" stroke="#3ddcff" strokeOpacity=".5" strokeWidth="1.5" />
      <circle cx="32" cy="34" r="11" fill="none" stroke="#3ddcff" strokeOpacity=".4" />
      <path d="M8 36 Q14 28 26 29 L52 30 Q58 32 60 36 Q58 40 52 41 L26 42 Q14 43 8 36Z" fill="#0b1626" stroke="#3ddcff" strokeWidth="2.2" />
      <rect x="28" y="31.5" width="12" height="7" rx="2" fill="none" stroke="#3ddcff" strokeWidth="1.8" />
    </svg>
  );
}

/** A small CSS world: shaded sphere in the game's materials, with its hero object floating on it. */
export function WorldOrb({ game, size = 120, className = '' }: { game: GameKind; size?: number; className?: string }) {
  const c = GAME_COLOR[game];
  return (
    <div className={`relative ${className}`} style={{ width: size, height: size }} aria-hidden>
      {game === 'seabattle' ? (
        <span className="lp-sonar absolute inset-0 rounded-full border-2" style={{ borderColor: c }} />
      ) : null}
      <div className="lp-orb absolute inset-0" style={{ ['--tint' as string]: c, background: ORB_BG[game] }} />
      {/* ring */}
      <div
        className="absolute left-1/2 top-1/2 h-[26%] w-[150%] -translate-x-1/2 -translate-y-1/2 rounded-[50%] border"
        style={{ borderColor: `${c}66`, transform: 'translate(-50%,-50%) rotate(-14deg)' }}
      />
      <div className="lp-float absolute inset-0 flex items-center justify-center">
        <WorldGlyph game={game} className="size-[62%] drop-shadow-[0_6px_14px_rgba(0,0,0,.6)]" />
      </div>
    </div>
  );
}

/** The vault coin in SVG: gold, with the equals sign embossed. */
export function VaultCoin({ size = 160 }: { size?: number }) {
  return (
    <div className="lp-coin-spin relative" style={{ width: size, height: size, perspective: 600 }} aria-hidden>
      <div className="absolute inset-[-40%] rounded-full bg-[radial-gradient(closest-side,rgba(255,210,63,.45),transparent_70%)]" />
      <svg viewBox="0 0 100 100" className="relative size-full drop-shadow-[0_0_30px_rgba(255,210,63,.55)]">
        <defs>
          <radialGradient id="lp-coin-face" cx="0.35" cy="0.3" r="0.8">
            <stop offset="0" stopColor="#fff3b8" />
            <stop offset="0.35" stopColor="#ffd23f" />
            <stop offset="0.8" stopColor="#c78a00" />
            <stop offset="1" stopColor="#7a4f00" />
          </radialGradient>
          <linearGradient id="lp-coin-rim" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#fff0a0" />
            <stop offset="0.5" stopColor="#b77a00" />
            <stop offset="1" stopColor="#ffe17a" />
          </linearGradient>
        </defs>
        <circle cx="50" cy="50" r="48" fill="url(#lp-coin-rim)" />
        <circle cx="50" cy="50" r="41" fill="url(#lp-coin-face)" />
        <circle cx="50" cy="50" r="36" fill="none" stroke="rgba(90,55,0,.45)" strokeWidth="1.5" strokeDasharray="2 3" />
        <rect x="30" y="37" width="40" height="9" rx="4.5" fill="#8a5a00" />
        <rect x="30" y="54" width="40" height="9" rx="4.5" fill="#8a5a00" />
        <rect x="30" y="36" width="40" height="8" rx="4" fill="#ffe680" />
        <rect x="30" y="53" width="40" height="8" rx="4" fill="#ffe680" />
      </svg>
    </div>
  );
}

const ORDER: GameKind[] = ['chess', 'backgammon', 'seabattle', 'tichu'];

/** Rich static composition used before three loads, and as the full fallback without WebGL. */
export function StaticUniverse({ compact = false }: { compact?: boolean }) {
  const R = compact ? 150 : 150;
  const orb = compact ? 64 : 80;
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div className="lp-stars absolute inset-0" />
      <div className="lp-stars lp-stars--b absolute inset-0" />
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        {/* tilted orbit plane */}
        <div style={{ transform: 'rotateX(64deg)', transformStyle: 'preserve-3d' }} className="absolute left-1/2 top-1/2">
          <div className="absolute rounded-full border border-[#7c5cff]/35" style={{ width: R * 2, height: R * 2, left: -R, top: -R }} />
          <div className="absolute rounded-full border border-[#7c5cff]/15" style={{ width: R * 2.5, height: R * 2.5, left: -R * 1.25, top: -R * 1.25 }} />
        </div>
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <VaultCoin size={compact ? 104 : 150} />
        </div>
        {/* worlds on a flattened ellipse; positions are fixed so it reads well even without motion */}
        {ORDER.map((g, i) => {
          const a = (i / ORDER.length) * Math.PI * 2 + 0.5;
          const x = Math.cos(a) * R;
          const y = Math.sin(a) * R * 0.36;
          const s = 0.82 + (Math.sin(a) + 1) * 0.14;
          return (
            <div
              key={g}
              className="absolute"
              style={{ left: x - orb / 2, top: y - orb / 2, transform: `scale(${s})`, zIndex: y > 0 ? 2 : 0, animationDelay: `${i * -1.2}s` }}
            >
              <div className="lp-float" style={{ animationDelay: `${i * -1.3}s` }}>
                <WorldOrb game={g} size={orb} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
