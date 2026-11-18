'use client';
import { motion } from 'motion/react';
import type { TichuView } from '@coldcall/games';
import { Button } from '@/components/ui';

type Round = TichuView['rounds'][number];

const ordinal = (n: number) => ['1st', '2nd', '3rd', '4th'][n] ?? `${n + 1}th`;
const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

/** End of round panel: card points, Tichu bonuses, totals, double victory, and the match result when it is over. */
export function ScoreSummary({
  round,
  view,
  myTeam,
  names,
  onClose,
}: {
  round: Round;
  view: TichuView;
  myTeam: number;
  names: string[];
  onClose: () => void;
}) {
  const us = myTeam;
  const them = 1 - myTeam;
  const total = [view.scores.team0, view.scores.team1];
  const over = !!view.result;
  const weWon = over && view.result!.winners.some((s) => s % 2 === us);
  const doubleUs = round.doubleVictory === us;
  const doubleThem = round.doubleVictory === them;
  const rows: { label: string; a: number; b: number; note?: string }[] = [
    {
      label: round.doubleVictory !== null ? 'Double victory' : 'Card points',
      a: round.cardPoints[us]!,
      b: round.cardPoints[them]!,
      note: round.doubleVictory !== null ? 'Both partners went out first and second, worth 200. Card points do not count.' : undefined,
    },
    { label: 'Tichu calls', a: round.bonus[us]!, b: round.bonus[them]! },
  ];
  return (
    <motion.div
      className="absolute inset-0 z-40 flex items-center justify-center bg-black/45 p-4 backdrop-blur-[3px]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={over ? 'Game over' : `Round ${round.round} summary`}
        initial={{ y: 24, opacity: 0, scale: 0.97 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        transition={{ duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }}
        className="w-full max-w-sm rounded-sheet border border-[#7C5CFF]/60 bg-surface p-5 shadow-modal" style={{ boxShadow: '0 0 40px rgba(124,92,255,.35), 0 24px 64px rgba(0,0,0,.6)' }}
      >
        {over ? (
          <div className="mb-3 text-center">
            {weWon ? <LaurelBurst /> : null}
            <p className={`text-[28px] font-black uppercase italic leading-tight tracking-tight ${weWon ? 'text-gold' : 'text-text'}`}>
              {weWon ? 'You and Partner win' : 'Opponents win this one'}
            </p>
            <p className="mt-1 text-sm text-text-2">{weWon ? 'Lovely teamwork. Well played.' : 'Close games teach the most. Ready for another?'}</p>
          </div>
        ) : (
          <div className="mb-3">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-2">Round {round.round}</p>
            <p className="text-[22px] font-black uppercase italic leading-tight tracking-tight">
              {doubleUs ? 'Double victory for you!' : doubleThem ? 'Double victory for the opponents' : 'Round complete'}
            </p>
          </div>
        )}

        <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-4 gap-y-1 text-[15px]">
          <span />
          <span className="text-right text-xs font-semibold text-primary">You and Partner</span>
          <span className="text-right text-xs font-semibold text-text-2">Opponents</span>
          {rows.map((r) => (
            <div key={r.label} className="contents">
              <span className="py-1.5 text-text-2">{r.label}</span>
              <span className="tabular text-right font-semibold">{signed(r.a)}</span>
              <span className="tabular text-right font-semibold">{signed(r.b)}</span>
            </div>
          ))}
          <div className="col-span-3 my-1 h-px bg-line" />
          <span className="py-1 font-semibold">This round</span>
          <span className="tabular text-right font-semibold">{signed(round.total[us]!)}</span>
          <span className="tabular text-right font-semibold">{signed(round.total[them]!)}</span>
          <span className="py-1 font-semibold">Match total</span>
          <span className="tabular text-right font-display text-[22px] font-semibold text-primary">{total[us]}</span>
          <span className="tabular text-right font-display text-[22px] font-semibold">{total[them]}</span>
        </div>
        {rows[0]!.note ? <p className="mt-2 text-xs text-text-2">{rows[0]!.note}</p> : null}

        {round.calls.length ? (
          <ul className="mt-3 space-y-1 text-sm">
            {round.calls.map((c, i) => (
              <li key={i} className="flex items-center justify-between gap-2">
                <span>
                  {names[c.seat]} called {c.kind === 'grand' ? 'Grand Tichu' : 'Tichu'}
                </span>
                <span className={`inline-flex items-center gap-1 font-semibold ${c.made ? 'text-win' : 'text-loss'}`}>
                  {c.made ? (
                    <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden fill="currentColor"><path d="M6.4 11.6 3 8.2l1.1-1.1 2.3 2.3 5.5-5.5L13 5z" /></svg>
                  ) : (
                    <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden fill="currentColor"><path d="M4.2 3.1 8 6.9l3.8-3.8 1.1 1.1L9.1 8l3.8 3.8-1.1 1.1L8 9.1l-3.8 3.8-1.1-1.1L6.9 8 3.1 4.2z" /></svg>
                  )}
                  {c.made ? 'Made' : 'Missed'} {signed((c.kind === 'grand' ? 200 : 100) * (c.made ? 1 : -1))}
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="mt-3 rounded-chip bg-surface-2 px-3 py-2 text-sm">
          <span className="text-text-2">Finishing order: </span>
          {round.order.map((s, i) => `${ordinal(i)} ${names[s]}`).join(', ')}
        </div>

        <Button full size="lg" className="mt-4" onClick={onClose} autoFocus>
          {over ? 'See the table' : 'Next round'}
        </Button>
        {!over ? <p className="mt-2 text-center text-xs text-text-2">First team to {view.targetScore} wins the match.</p> : null}
      </motion.div>
    </motion.div>
  );
}

function LaurelBurst() {
  return (
    <motion.svg viewBox="0 0 120 40" className="mx-auto mb-1 h-10 w-32 text-gold" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.5 }} aria-hidden>
      {[...Array(6)].map((_, i) => (
        <g key={i} fill="currentColor">
          <ellipse cx={46 - i * 7} cy={22 - i * 2.2} rx={5} ry={2.2} transform={`rotate(${-20 - i * 12} ${46 - i * 7} ${22 - i * 2.2})`} />
          <ellipse cx={74 + i * 7} cy={22 - i * 2.2} rx={5} ry={2.2} transform={`rotate(${20 + i * 12} ${74 + i * 7} ${22 - i * 2.2})`} />
        </g>
      ))}
      <circle cx={60} cy={24} r={6} fill="currentColor" />
    </motion.svg>
  );
}
