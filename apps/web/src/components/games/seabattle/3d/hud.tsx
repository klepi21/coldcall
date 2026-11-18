'use client';
/**
 * DOM pieces around the 3D sea. These mirror the 2D board's status line, fleet tracker and shot
 * stats word for word. They are copies only because SeaBattleBoard.tsx keeps them module private;
 * once it exports FleetTracker, ShotStats and a battleStatus() helper, import those and delete
 * this file's duplicates.
 */
import { motion } from 'motion/react';
import { SB_FLEET, type SbView } from '@evens/games/seabattle';
import { ShipIcon } from '../art';
import { cellName } from '../Grid';

type Board = SbView['boards'][number];
export type Tone = 'turn' | 'wait' | 'hit' | 'sunk' | 'win' | 'lose';

export function battleStatus(args: {
  view: SbView;
  me: number;
  spectator: boolean;
  seatNames: string[];
  flight: { shooter: number; row: number; col: number } | null;
}): { status: string; tone: Tone } {
  const { view, me, spectator, seatNames, flight } = args;
  const opp = 1 - me;
  const theirs = view.boards[opp as 0 | 1];
  const oppName = seatNames[opp] ?? 'Opponent';
  const ls = view.lastShot;
  const result = view.result;
  if (result) {
    const won = result.winners.includes(me);
    let status: string;
    if (spectator) status = `${seatNames[result.winners[0] ?? 0] ?? 'A captain'} wins the battle.`;
    else if (result.reason !== 'fleet_sunk') status = won ? `${oppName} left the battle. You win.` : 'You left the battle.';
    else status = won ? `Victory! You sank the whole enemy fleet in ${theirs.shotsTaken} shots.` : `${oppName} sank your whole fleet. Their ships are now revealed.`;
    return { status, tone: won ? 'win' : 'lose' };
  }
  if (flight) return { status: flight.shooter === me ? `Firing at ${cellName(flight.row, flight.col)}.` : `Incoming fire at ${cellName(flight.row, flight.col)}!`, tone: 'wait' };
  if (spectator) return { status: `${seatNames[view.turn ?? 0] ?? 'Captain'} to fire.`, tone: 'wait' };
  if (ls && ls.seat === me) {
    return {
      tone: ls.result === 'miss' ? 'wait' : ls.result === 'hit' ? 'hit' : 'sunk',
      status: ls.result === 'miss' ? `Miss at ${cellName(ls.row, ls.col)}. ${oppName} fires next.` : ls.result === 'hit' ? 'Hit! Fire again next turn.' : `You sank their ${ls.shipName ?? 'ship'}!`,
    };
  }
  if (ls && ls.seat === opp) {
    const where = cellName(ls.row, ls.col);
    return {
      tone: 'turn',
      status:
        ls.result === 'miss'
          ? `${oppName} missed at ${where}. Your turn. Pick a square in enemy waters.`
          : ls.result === 'hit'
            ? `${oppName} hit your ${ls.shipName ?? 'ship'} at ${where}. Your turn, fire back.`
            : `${oppName} sank your ${ls.shipName ?? 'ship'}. Your turn, fire back.`,
    };
  }
  return view.turn === me ? { tone: 'turn', status: 'Your turn. Pick a square in enemy waters.' } : { tone: 'wait', status: `${oppName} fires first.` };
}

export function toneClass(tone: Tone, error: boolean) {
  if (error) return 'bg-loss/15 text-loss';
  switch (tone) {
    case 'turn':
      return 'bg-primary/15 text-text ring-1 ring-primary/50';
    case 'hit':
      return 'bg-[#FF5A1F]/15 text-text ring-1 ring-[#FF5A1F]/60';
    case 'sunk':
      return 'bg-[#FF5A1F]/25 text-text ring-1 ring-[#FF5A1F]';
    case 'win':
      return 'bg-primary/20 text-text ring-1 ring-primary';
    case 'lose':
      return 'bg-loss/15 text-text ring-1 ring-loss/60';
    default:
      return 'bg-surface text-text-2';
  }
}

export function StatusBar({ text, tone, error, reduce }: { text: string; tone: Tone; error: boolean; reduce: boolean }) {
  return (
    <motion.div
      key={text}
      aria-hidden
      initial={reduce ? false : { opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex min-h-[48px] items-center gap-2 rounded-card px-4 py-2.5 text-[15px] font-bold lg:text-base ${toneClass(tone, error)}`}
    >
      <StatusIcon tone={error ? 'error' : tone} />
      <span>{text}</span>
    </motion.div>
  );
}

export function FleetTracker({ board, title, wide }: { board: Board; title: string; wide?: boolean }) {
  return (
    <div className="rounded-card bg-surface p-3 shadow-card">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <p className="text-xs font-bold uppercase tracking-wider text-text-2">{title}</p>
        <p className="tabular text-xs font-bold text-text">
          {board.afloat.length}/5 <span className="font-semibold text-text-2">afloat</span>
        </p>
      </div>
      <ul className={wide ? 'grid grid-cols-2 gap-2' : 'flex flex-col gap-1.5'}>
        {SB_FLEET.map((f) => {
          const sunk = board.sunk.includes(f.id);
          return (
            <li key={f.id} className={`flex items-center gap-2 ${wide ? 'flex-col items-start rounded-chip bg-surface-2 px-2 py-2' : ''}`} aria-label={`${f.name}, ${sunk ? 'sunk' : 'afloat'}`}>
              <span className="relative inline-block shrink-0" style={{ width: f.size * (wide ? 18 : 13), height: wide ? 18 : 13 }}>
                <ShipIcon id={f.id} size={f.size} look={sunk ? 'sunk' : 'own'} className="absolute inset-0 h-full w-full" style={{ opacity: sunk ? 0.55 : 1 }} />
                {sunk ? <span className="absolute left-0 right-0 top-1/2 h-[2.5px] -translate-y-1/2 -rotate-6 rounded bg-[#FF5A1F]" /> : null}
              </span>
              <span className={`truncate text-[12px] font-semibold ${sunk ? 'text-text-2 line-through' : 'text-text'}`}>
                {f.name}
                {wide ? <span className="tabular text-text-2"> {f.size}</span> : null}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function ShotStats({ mine, theirs }: { mine: Board; theirs: Board }) {
  const acc = theirs.shotsTaken ? Math.round((theirs.hitsTaken / theirs.shotsTaken) * 100) : 0;
  return (
    <div className="grid grid-cols-3 gap-1.5 text-center">
      <Stat label="Shots" value={String(theirs.shotsTaken)} />
      <Stat label="Hits" value={String(theirs.hitsTaken)} hot />
      <Stat label="Aim" value={`${acc}%`} />
      <span className="sr-only">Your ships have taken {mine.hitsTaken} hits.</span>
    </div>
  );
}

function Stat({ label, value, hot }: { label: string; value: string; hot?: boolean }) {
  return (
    <div className="rounded-chip bg-surface px-1 py-1.5">
      <p className={`tabular text-base font-extrabold ${hot ? 'text-loss' : 'text-text'}`}>{value}</p>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-text-2">{label}</p>
    </div>
  );
}

export function PanelTitle({ color, title, sub, small }: { color: string; title: string; sub: string; small?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-2 px-1 ${small ? 'mb-1' : 'mb-2'}`}>
      <p className={`flex items-center gap-2 font-extrabold uppercase tracking-wider ${small ? 'text-[11px]' : 'text-sm'}`}>
        <span className="inline-block size-2.5 rounded-full" style={{ background: color, boxShadow: `0 0 10px ${color}` }} />
        {title}
      </p>
      <p className={`truncate text-text-2 ${small ? 'text-[11px]' : 'text-xs'}`}>{sub}</p>
    </div>
  );
}

export function ResultBanner({ won, spectator, shots, reduce }: { won: boolean; spectator: boolean; shots: number; reduce: boolean }) {
  const good = won || spectator;
  const color = good ? '#C6FF3D' : '#FF4D6D';
  // Sits at the bottom of the sea so the revealed fleet stays visible.
  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.6, duration: 0.35, ease: [0.2, 0.8, 0.3, 1] }}
      className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-3"
    >
      <div
        className="flex items-center gap-3 rounded-[16px] px-4 py-2.5 backdrop-blur-[2px]"
        style={{ background: 'rgba(7, 7, 12, 0.78)', boxShadow: good ? '0 0 0 2px #C6FF3D, 0 0 40px rgba(198,255,61,0.4)' : '0 0 0 2px #FF4D6D, 0 0 36px rgba(255,77,109,0.32)' }}
      >
        <span style={{ color }}>
          <Icon name={good ? 'trophy' : 'anchor'} size={30} />
        </span>
        <div>
          <p className="font-display text-xl font-black uppercase leading-tight tracking-wide sm:text-2xl" style={{ color }}>
            {spectator ? 'Battle over' : won ? 'Victory' : 'Defeat'}
          </p>
          <p className="text-[13px] text-[#d8d8ea]">{won ? `Fleet sunk in ${shots} shots.` : spectator ? 'Both fleets are now revealed.' : 'Good fight. Their ships are now shown.'}</p>
        </div>
      </div>
    </motion.div>
  );
}

function StatusIcon({ tone }: { tone: string }) {
  const map: Record<string, { name: IconName; color: string }> = {
    turn: { name: 'target', color: 'var(--primary)' },
    wait: { name: 'radar', color: '#5AE1FF' },
    hit: { name: 'burst', color: '#FF5A1F' },
    sunk: { name: 'burst', color: '#FFD166' },
    win: { name: 'trophy', color: 'var(--primary)' },
    lose: { name: 'anchor', color: '#FF4D6D' },
    error: { name: 'warn', color: '#FF4D6D' },
  };
  const m = map[tone] ?? map.wait!;
  return (
    <span className="shrink-0" style={{ color: m.color }}>
      <Icon name={m.name} size={22} />
    </span>
  );
}

export type IconName = 'target' | 'radar' | 'burst' | 'trophy' | 'anchor' | 'warn';

export function Icon({ name, size = 18, className }: { name: IconName; size?: number; className?: string }) {
  const p = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className={className}>
      {name === 'target' ? (
        <>
          <circle cx={12} cy={12} r={7} {...p} />
          <circle cx={12} cy={12} r={2} fill="currentColor" />
          <path d="M12 2v4M12 18v4M2 12h4M18 12h4" {...p} />
        </>
      ) : name === 'radar' ? (
        <>
          <circle cx={12} cy={12} r={9} {...p} />
          <circle cx={12} cy={12} r={5} {...p} opacity={0.6} />
          <path d="M12 12L19 6" {...p} />
          <circle cx={16} cy={15} r={1.3} fill="currentColor" />
        </>
      ) : name === 'burst' ? (
        <path d="M12 2l2.2 5.5L20 6l-3 5 4.5 3.2-5.6.8L15 21l-3-4.4L9 21l-.9-6L2.5 14.2 7 11 4 6l5.8 1.5z" fill="currentColor" stroke="none" />
      ) : name === 'trophy' ? (
        <>
          <path d="M7 4h10v5a5 5 0 0 1-10 0z" {...p} />
          <path d="M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4M12 14v4M8 21h8M9 18h6" {...p} />
        </>
      ) : name === 'anchor' ? (
        <>
          <circle cx={12} cy={5} r={2} {...p} />
          <path d="M12 7v14M8 11h8M4 14a8 7 0 0 0 16 0" {...p} />
        </>
      ) : (
        <>
          <path d="M12 3l10 18H2z" {...p} />
          <path d="M12 10v5" {...p} />
          <circle cx={12} cy={18} r={1} fill="currentColor" />
        </>
      )}
    </svg>
  );
}
