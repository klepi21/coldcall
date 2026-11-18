'use client';
import { useState } from 'react';
import { GAMES, type GameKind } from '@evens/shared';
import { Sheet, Button } from '@/components/ui';
import { RULES } from '@/content/rules';

export function RulesBody({ game, initialTab = 'quick', seedCommit }: { game: GameKind; initialTab?: 'quick' | 'full' | 'tips' | 'fair'; seedCommit?: string }) {
  const [tab, setTab] = useState(initialTab);
  const r = RULES[game];
  const tabs = [
    ['quick', 'Quick start'],
    ['full', 'Full rules'],
    ['tips', 'Tips'],
    ['fair', 'Fairness'],
  ] as const;
  return (
    <div>
      <div className="well mb-4 flex gap-1 overflow-x-auto rounded-[14px] p-1 no-scrollbar" role="tablist">
        {tabs.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`press h-10 flex-1 whitespace-nowrap rounded-[10px] px-2 text-[13px] font-semibold sm:px-3 sm:text-sm ${tab === id ? 'btn-primary' : 'text-text-2 hover:text-text'}`}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'quick' && (
        <dl className="space-y-4">
          {[
            ['Goal', r.quick.goal],
            ['Your turn', r.quick.turn],
            ['How you win', r.quick.win],
          ].map(([t, d]) => (
            <div key={t}>
              <dt className="text-sm font-semibold text-text-2">{t}</dt>
              <dd className="mt-0.5 text-[16px] leading-relaxed">{d}</dd>
            </div>
          ))}
        </dl>
      )}
      {tab === 'full' && (
        <div className="space-y-5">
          {r.full.map((s) => (
            <section key={s.id} id={s.id}>
              <h3 className="font-semibold">{s.title}</h3>
              <ul className="mt-1.5 list-disc space-y-1.5 pl-5 text-[15px] leading-relaxed text-text-2">
                {s.body.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      {tab === 'tips' && (
        <ol className="list-decimal space-y-2 pl-5 text-[15px] leading-relaxed">
          {r.tips.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ol>
      )}
      {tab === 'fair' && (
        <div className="space-y-3 text-[15px] leading-relaxed text-text-2">
          <p>
            {game === 'chess'
              ? 'Chess has no luck. Against the bot, its strength is set from your skill rating only, before the game starts, and it never changes during the game.'
              : game === 'seabattle' ? 'Sea Battle has no dice or cards. Your ships are hidden on the server and only revealed when sunk. Bot placements come from a secret seed that we reveal after the game.' : `Every ${game === 'backgammon' ? 'dice roll' : 'shuffle'} comes from a secret seed. Before the game starts we publish a lock (a fingerprint) of that seed, so we cannot change it later.`}
          </p>
          {(game === 'backgammon' || game === 'tichu') && <p>When the game ends we reveal the seed. Anyone can recompute every {game === 'backgammon' ? 'roll' : 'deal'} and check it matches.</p>}
          {seedCommit ? (
            <div className="well rounded-chip p-3">
              <p className="text-xs font-semibold text-text">Seed lock for this game</p>
              <p className="mt-1 break-all font-mono text-[11px]">{seedCommit}</p>
            </div>
          ) : null}
          <p>Against the bot, the house keeps a published 5% edge. {GAMES[game].botTarget}</p>
          <a href="/how-it-works#fairness" className="inline-block font-semibold text-primary">
            How we prove it
          </a>
        </div>
      )}
    </div>
  );
}

export function RulesSheet({ game, open, onClose, seedCommit, tutorial }: { game: GameKind; open: boolean; onClose: () => void; seedCommit?: string; tutorial?: boolean }) {
  const [step, setStep] = useState(0);
  const t = RULES[game].tutorial;
  if (tutorial && step < t.length)
    return (
      <Sheet open={open} onClose={onClose} title={`Learn ${GAMES[game].name} in a minute`}>
        <div className="flex items-center gap-3">
          <p className="t-eyebrow">
            Step {step + 1} of {t.length}
          </p>
          <span className="flex flex-1 gap-1" aria-hidden>
            {t.map((_, i) => (
              <span key={i} className={`h-1 flex-1 rounded-full transition-colors ${i <= step ? 'bg-primary shadow-[0_0_8px_var(--primary)]' : 'bg-[var(--well-hover)]'}`} />
            ))}
          </span>
        </div>
        <h3 className="t-title mt-3">{t[step]!.title}</h3>
        <p className="mt-1 text-text-2">{t[step]!.text}</p>
        <div className="mt-6 grid grid-cols-2 gap-2">
          <Button variant="ghost" onClick={onClose}>
            Skip
          </Button>
          <Button onClick={() => (step + 1 >= t.length ? onClose() : setStep(step + 1))}>{step + 1 >= t.length ? 'Start playing' : 'Next'}</Button>
        </div>
      </Sheet>
    );
  return (
    <Sheet open={open} onClose={onClose} title={`${GAMES[game].name} rules`} wide>
      <RulesBody game={game} seedCommit={seedCommit} />
    </Sheet>
  );
}
