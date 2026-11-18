'use client';
/**
 * Hero card that shows the whole idea of Evens in about 15 seconds, on a loop:
 * both players put in the same stake, a short game is played, the winner takes the pot.
 * Numbers come from the real money rules (packages/shared), so the card never overpromises.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { Chess, type Square } from 'chess.js';
import { outcomeSummary, formatCredits } from '@coldcall/shared';
import { PieceArt, type PieceColor, type PieceType } from '@/components/games/chess/pieces';
import { Coin } from '@/components/ui';

const STAKE = 1_000; // 10 credits
const MOVES = ['e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'Nf6', 'Qxf7#'];
const LIGHT = '#EDE6D8';
const DARK = '#9C8F7B';
const LIME = '#C6FF3D';

interface P {
  id: string;
  type: PieceType;
  color: PieceColor;
  sq: Square;
}
type Phase = 'stake' | 'play' | 'win';

function initialPieces(): P[] {
  const c = new Chess();
  const out: P[] = [];
  for (const row of c.board()) for (const p of row) if (p) out.push({ id: `${p.color}${p.type}${p.square}`, type: p.type as PieceType, color: p.color, sq: p.square });
  return out;
}

/** Precompute every frame of the game: piece list and last move after each ply. */
function frames() {
  const c = new Chess();
  let pieces = initialPieces();
  const list: { pieces: P[]; from?: Square; to?: Square; check?: Square }[] = [{ pieces }];
  for (const san of MOVES) {
    const m = c.move(san);
    pieces = pieces.filter((p) => p.sq !== m.to).map((p) => (p.sq === m.from ? { ...p, sq: m.to } : p));
    const kingSq = c.inCheck() ? c.board().flat().find((p) => p && p.type === 'k' && p.color === c.turn())?.square : undefined;
    list.push({ pieces, from: m.from, to: m.to, check: kingSq });
  }
  return list;
}

const pos = (sq: Square) => ({ x: sq.charCodeAt(0) - 97, y: 8 - Number(sq[1]) });

export function MatchPreview(_props: { onPlay?: () => void; signedIn?: boolean }) {
  const reduce = useReducedMotion();
  const all = useMemo(frames, []);
  const s = outcomeSummary('pvp', 'chess', STAKE, 2);
  const [phase, setPhase] = useState<Phase>(reduce ? 'win' : 'stake');
  const [ply, setPly] = useState(reduce ? MOVES.length : 0);
  const [visible, setVisible] = useState(true);
  const ref = useRef<HTMLDivElement>(null);

  // Only animate while on screen.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(!!e?.isIntersecting), { threshold: 0.2 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (reduce || !visible) return;
    let t: ReturnType<typeof setTimeout>;
    if (phase === 'stake') t = setTimeout(() => setPhase('play'), 1800);
    else if (phase === 'play') {
      if (ply < MOVES.length) t = setTimeout(() => setPly((p) => p + 1), ply === 0 ? 500 : 950);
      else t = setTimeout(() => setPhase('win'), 900);
    } else
      t = setTimeout(() => {
        setPly(0);
        setPhase('stake');
      }, 4200);
    return () => clearTimeout(t);
  }, [phase, ply, visible, reduce]);

  const f = all[ply]!;
  const step = phase === 'stake' ? 0 : phase === 'play' ? 1 : 2;
  const potIn = phase !== "stake" || !!reduce;

  return (
    <div ref={ref} className="lp-glass relative w-full max-w-[320px] overflow-hidden rounded-[22px] p-3.5" style={{ ['--tint' as string]: LIME }}>
      <span className="pointer-events-none absolute -top-28 left-1/2 size-56 -translate-x-1/2 rounded-full opacity-30 blur-3xl" style={{ background: LIME }} aria-hidden />

      {/* Title and the pot on one line */}
      <div className="relative flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">How a match works</p>
          <h2 className="whitespace-nowrap font-display text-[13px] font-extrabold uppercase leading-tight">Winner takes the pot</h2>
        </div>
        <div className="relative">
          <motion.div
            className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[13px] font-bold tabular-nums"
            style={{ borderColor: 'rgba(255,210,63,.45)', background: 'rgba(255,210,63,.1)', color: '#FFD23F' }}
            animate={{ scale: phase === 'win' ? [1, 1.15, 0.85] : potIn ? [0.92, 1.08, 1] : 0.92, opacity: phase === 'win' ? [1, 1, 0.35] : potIn ? 1 : 0.4 }}
            transition={{ duration: phase === 'win' ? 0.9 : 0.5 }}
            aria-hidden
          >
            <Coin className="size-3.5" /> {potIn && phase !== 'win' ? formatCredits(STAKE * 2) : '0.00'}
          </motion.div>
          <AnimatePresence>
            {phase === 'stake' &&
              !reduce &&
              [-1, 1].map((dir) => (
                <motion.span key={dir} className="absolute left-1/2 top-1/2 -ml-2 -mt-2" initial={{ y: dir * 60 + 40, x: -60, opacity: 0, scale: 0.6 }} animate={{ y: 0, x: 0, opacity: [0, 1, 1, 0], scale: 1 }} transition={{ duration: 1.1, delay: 0.35 + (dir > 0 ? 0.25 : 0), ease: 'easeInOut' }} aria-hidden>
                  <Coin className="size-4" />
                </motion.span>
              ))}
          </AnimatePresence>
        </div>
      </div>

      <div className="relative mt-3" aria-hidden>
        <PlayerRow name="Maya" initial="M" color="#ff4d8d" stake={STAKE} staked={potIn} />

        {/* Mini board */}
        <div className="relative my-1.5 aspect-square w-full overflow-hidden rounded-lg shadow-[0_8px_28px_rgba(0,0,0,.45)]" style={{ outline: '1px solid rgba(255,255,255,.08)' }}>
          <div className="grid size-full grid-cols-8 grid-rows-8">
            {Array.from({ length: 64 }, (_, i) => {
              const x = i % 8;
              const y = Math.floor(i / 8);
              const sq = `${String.fromCharCode(97 + x)}${8 - y}` as Square;
              const last = sq === f.from || sq === f.to;
              const check = sq === f.check;
              return (
                <div key={sq} style={{ background: (x + y) % 2 ? DARK : LIGHT }} className="relative">
                  {last ? <span className="absolute inset-0" style={{ background: 'rgba(198,255,61,.42)' }} /> : null}
                  {check ? <span className="absolute inset-0" style={{ background: 'radial-gradient(circle, rgba(255,77,109,.9), rgba(255,77,109,0) 70%)' }} /> : null}
                </div>
              );
            })}
          </div>
          {f.pieces.map((p) => {
            const { x, y } = pos(p.sq);
            return (
              <motion.div key={p.id} className="absolute size-[12.5%] p-[2%]" initial={false} animate={{ left: `${x * 12.5}%`, top: `${y * 12.5}%` }} transition={{ type: 'spring', stiffness: 260, damping: 26 }}>
                <PieceArt color={p.color} type={p.type} />
              </motion.div>
            );
          })}
          <AnimatePresence>
            {phase === 'win' && (
              <motion.div className="absolute inset-0 grid place-items-center bg-[rgba(7,7,12,.55)] backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
                <motion.div className="text-center" initial={{ scale: 0.8, y: 8 }} animate={{ scale: 1, y: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 18, delay: 0.1 }}>
                  <p className="font-display text-[20px] font-extrabold uppercase text-white">Checkmate</p>
                  <p className="mt-0.5 flex items-center justify-center gap-1.5 font-display text-[18px] font-extrabold tabular-nums" style={{ color: '#FFD23F' }}>
                    <Coin className="size-5" /> +{formatCredits(s.ifWin)}
                  </p>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <PlayerRow name="You" initial="Y" color={LIME} stake={STAKE} staked={potIn} winner={phase === 'win'} won={s.ifWin} />
      </div>

      {/* Steps */}
      <ol className="relative mt-3 flex items-center justify-between gap-1 text-[11px] font-semibold">
        {[`Both stake ${formatCredits(STAKE).replace('.00', '')}`, 'Play', `Winner gets ${formatCredits(s.ifWin).replace('.00', '')}`].map((t, i) => (
          <li key={t} className="flex items-center gap-1">
            {i > 0 ? <span className="mx-0.5 h-px w-3 bg-white/15" aria-hidden /> : null}
            <span className={`rounded-full px-2 py-1 transition-colors duration-300 ${i === step ? 'bg-primary text-primary-ink' : 'bg-white/[.06] text-text-2'}`}>{t}</span>
          </li>
        ))}
      </ol>
      <p className="relative mt-2 text-center text-[10.5px] leading-snug text-text-2">Fee {formatCredits(s.fee)} credits per player, shown before you join. Practice is free.</p>
      <p className="sr-only">Example: you and another player each put in 10 credits. You win the chess game and take the pot of 20 credits. Evens charges a 0.50 credit fee per player.</p>
    </div>
  );
}

function PlayerRow({ name, initial, color, stake, staked, winner, won }: { name: string; initial: string; color: string; stake: number; staked: boolean; winner?: boolean; won?: number }) {
  return (
    <div className={`flex items-center gap-2.5 rounded-xl px-2.5 py-1.5 transition-colors duration-300 ${winner ? 'bg-[rgba(255,210,63,.12)]' : 'bg-white/[.04]'}`}>
      <span className="grid size-7 place-items-center rounded-full font-display text-xs font-extrabold" style={{ background: `${color}26`, color, boxShadow: winner ? `0 0 0 2px #FFD23F, 0 0 18px rgba(255,210,63,.5)` : `0 0 0 1.5px ${color}66` }}>
        {initial}
      </span>
      <span className="flex-1 text-sm font-semibold">{name}</span>
      <span className="flex items-center gap-1.5 text-[13px] font-bold tabular-nums" style={{ color: winner ? '#FFD23F' : staked ? 'var(--text-2)' : 'var(--text)' }}>
        <Coin className="size-3.5" />
        {winner && won ? `+${formatCredits(won)}` : staked ? 'in the pot' : formatCredits(stake)}
      </span>
    </div>
  );
}
