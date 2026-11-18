'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, Eyebrow } from '@/components/ui';
import { CURRENCY, formatAmount } from '@coldcall/shared';
import { api } from '@/lib/api';
import { VaultLinks } from '@/components/app/VaultLinks';

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-32">
      <Card className="p-5 sm:p-7">
        <h2 className="t-title">{title}</h2>
        <div className="mt-3 space-y-3 text-[16px] leading-relaxed text-text-2">{children}</div>
      </Card>
    </section>
  );
}

function FlowDiagram() {
  const box = (x: number, label: string, sub: string) => (
    <g transform={`translate(${x} 20)`}>
      <rect width="150" height="72" rx="14" fill="var(--well)" stroke="var(--well-line)" />
      <text x="75" y="32" textAnchor="middle" fontSize="15" fontWeight="600" fill="var(--text)">
        {label}
      </text>
      <text x="75" y="52" textAnchor="middle" fontSize="12" fill="var(--text-2)">
        {sub}
      </text>
    </g>
  );
  return (
    <svg viewBox="0 0 560 112" className="w-full" role="img" aria-label="Your wallet sends LOFI or SUI to the vault of that coin, you play with your balance in that coin, and you cash out back to your wallet">
      {box(0, 'Your wallet', 'test LOFI or SUI')}
      {box(205, 'Coin vault', 'one per coin, public')}
      {box(410, 'Your balance', 'same coin, same amount')}
      <path d="M152 48h48" stroke="var(--primary)" strokeWidth="3" markerEnd="url(#a)" />
      <path d="M357 48h48" stroke="var(--primary)" strokeWidth="3" markerEnd="url(#a)" />
      <path d="M485 94 C485 112 75 112 75 94" fill="none" stroke="var(--gold)" strokeWidth="2.5" strokeDasharray="5 5" markerEnd="url(#b)" />
      <text x="280" y="108" textAnchor="middle" fontSize="11" fill="var(--text-2)">
        cash out anytime
      </text>
      <defs>
        <marker id="a" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M0 0 10 5 0 10z" fill="var(--primary)" />
        </marker>
        <marker id="b" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M0 0 10 5 0 10z" fill="var(--gold)" />
        </marker>
      </defs>
    </svg>
  );
}

export default function HowItWorks() {
  const [reserve, setReserve] = useState<{ currency: 'LOFI' | 'SUI'; vault_minor: number; liabilities_minor: number; ok: boolean; checked_at: string }[] | null>(null);
  useEffect(() => {
    api('/api/reserve').then(setReserve).catch(() => {});
  }, []);
  const L = CURRENCY.LOFI;
  const S = CURRENCY.SUI;
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="pb-2">
        <Eyebrow className="mb-2">No small print</Eyebrow>
        <h1 className="t-display">
          How Cold Call <span className="t-grad-primary">works</span>
        </h1>
        <p className="mt-3 text-[18px] text-text-2">Everything about money, fees, bots and fairness, in plain words.</p>
      </div>

      <nav className="glass-blur sticky top-16 z-20 -mx-4 flex gap-2 overflow-x-auto px-4 py-2 text-sm font-semibold no-scrollbar sm:mx-0 sm:flex-wrap sm:px-0">
        {[
          ['money', 'Money'],
          ['stakes', 'Stakes and fees'],
          ['bots', 'The bot'],
          ['fairness', 'Fairness'],
          ['vault', 'The vault'],
          ['limits', 'Safer play'],
          ['glossary', 'Glossary'],
        ].map(([id, l]) => (
          <a key={id} href={`#${id}`} className="btn-secondary press shrink-0 rounded-full px-3.5 py-2">
            {l}
          </a>
        ))}
      </nav>

      <Section id="money" title="Money">
        <FlowDiagram />
        <p>Cold Call has two coins: <strong className="text-text">LOFI</strong>, a test coin made for this beta, and <strong className="text-text">SUI</strong>. You hold a separate balance in each. They are never swapped, converted or added together, and there is no exchange rate between them.</p>
        <p>Coins you add go from your wallet into the vault of that coin, a public contract on Sui. Your balance in that coin goes up by exactly the same amount. Every table is played in one coin, so a LOFI game only ever moves LOFI and a SUI game only ever moves SUI. Pick the coin with the LOFI and SUI switch at the top.</p>
        <p>Games use your balance, so they are instant. When you cash out, the coins go back to your wallet. Cold Call pays the Sui network fee for adding money, cashing out and getting test LOFI.</p>
        <p>This beta runs on Sui devnet. LOFI and SUI here are test coins with no real value. You can get free test LOFI and test SUI on the wallet page.</p>
      </Section>

      <Section id="stakes" title="Stakes and fees">
        <p>You choose the coin and your stake. Quick picks are {L.stakeLevels.map((l) => formatAmount(l, 'LOFI')).join(', ')} and {S.stakeLevels.map((l) => formatAmount(l, 'SUI')).join(', ')}. Any amount in between works too:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>LOFI: from {formatAmount(L.minStake, 'LOFI')} up to {formatAmount(L.maxStakePvp, 'LOFI')} against people, or {formatAmount(L.maxStakeBot, 'LOFI')} against the bot.</li>
          <li>SUI: from {formatAmount(S.minStake, 'SUI')} up to {formatAmount(S.maxStakePvp, 'SUI')} against people, or {formatAmount(S.maxStakeBot, 'SUI')} against the bot.</li>
        </ul>
        <p>Each coin has its own house bankroll. A single bot game never risks more than 1% of the bankroll of its coin, so the biggest bot stake can be lower at times. Quick match only pairs players of the same game, coin and stake. Practice games are always free.</p>
        <p>
          <strong className="text-text">Against people:</strong> everyone puts in the same stake. The winner takes the whole pot (in Tichu the winning team splits it). Cold Call keeps a fee of 5% of the stake, rounded down to 0.01 of the coin, shown before you join. In LOFI the fee is at least 0.05 LOFI. In SUI there is no minimum, so tables of 0.05 and 0.10 SUI have no fee. A chess draw returns your stake, the fee is kept. If you leave before the game starts, you get everything back including the fee.
        </p>
        <p>
          <strong className="text-text">Against the bot:</strong> there is no fee. A win pays double your stake. A loss loses the stake. A chess draw returns 90%, rounded down to 0.01 (so a 0.05 SUI draw returns 0.04 SUI).
        </p>
        <p>While a game is in play your stake is held for that game, and it is paid out automatically the moment the game ends.</p>
      </Section>

      <Section id="bots" title="How the bot works">
        <p>The bot adapts to your skill so games stay close and fun. The house keeps one flat, published edge of 5% at every stake level.</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Chess: you win about 36 of 100 games, draw about 25, and lose about 39.</li>
          <li>Backgammon and Tichu: you win about 47 of 100 games.</li>
          <li>Sea Battle: you win about 47 of 100 games.</li>
        </ul>
        <p className="font-semibold text-text">The Sea Battle bot never peeks</p>
        <p>The Sea Battle bot only knows what you would know in its seat: where it has fired, what it hit or missed, and which of your ships are still afloat. It never sees where your fleet is hidden.</p>
        <p>Its fleet is placed at random from the locked game seed, so it cannot move ships during the game, and you can check the placement on the verify page afterwards. To aim, it works out where your remaining ships could still fit and fires at the likeliest squares. Weaker levels add more random shots, and that is how it is matched to your skill.</p>
        <p>The bot strength is set from your skill rating for that game, before the game starts, and never changes during a game. We never use your balance, deposits, losses or spending to set it.</p>
        <p>Practice games do not change your rating, and a rating cannot drop more than 150 points below its best, so nobody can lose on purpose to get an easier bot.</p>
        <p>These are targets of a model, not guarantees. We publish the real results per stake level and watch them closely.</p>
      </Section>

      <Section id="fairness" title="Fair dice and fair shuffles">
        <p>Before a game starts, the server picks a secret seed and shows you its lock: a fingerprint (SHA 256) that proves the seed cannot change later. Each player adds their own seed too.</p>
        <p>Every dice roll and card shuffle comes from those seeds. When the game ends we reveal the secret seed. Open any game and tap Verify to recompute every roll or deal yourself.</p>
        <p>Chess has no luck at all, so there is nothing to shuffle.</p>
      </Section>

      <Section id="vault" title="The vault">
        <p>There is one vault per coin. Your LOFI is backed one to one by LOFI in the LOFI vault, and your SUI by SUI in the SUI vault. Every 5 minutes we check each vault on its own: it must hold at least everything we hold for players and the house in that coin.</p>
        {reserve?.length ? (
          <ul className="space-y-1 text-[15px]">
            {reserve.map((r) => (
              <li key={r.currency}>
                Last {r.currency} check {new Date(r.checked_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}: vault {formatAmount(r.vault_minor, r.currency)}, held {formatAmount(r.liabilities_minor, r.currency)}.{' '}
                <span className={r.ok ? 'font-semibold text-win' : 'font-semibold text-loss'}>{r.ok ? 'Fully backed.' : 'Not fully backed, our team is alerted.'}</span>
              </li>
            ))}
          </ul>
        ) : null}

        <p className="font-semibold text-text">Check it yourself</p>
        <VaultLinks />
        <p>
          Cash outs are signed by our server and checked by the contract. Per player per day: up to {formatAmount(L.withdrawDaily, 'LOFI')} and up to {formatAmount(S.withdrawDaily, 'SUI')}. Cash outs above {formatAmount(L.withdrawReviewAbove, 'LOFI')} or {formatAmount(S.withdrawReviewAbove, 'SUI')} get a quick check by our team first. Because our server signs them, cash outs pause if our service is down or if we pause the vault for safety.
        </p>
        <p>Cold Call controls this contract: we can pause it and update its code. Before real money, these powers move to a group of keys that must agree, with a time delay.</p>
      </Section>

      <Section id="limits" title="Safer play">
        <p>Playing for a stake should be fun. In your profile you can set limits for adding money and for losses per day or week, separately for LOFI and for SUI, take a break for 24 hours, 7 days or 30 days, or pause your account for 6 months.</p>
        <p>You get a gentle reminder after every hour of play. You can still cash out during a break. You must be 18 or older to play.</p>
        <p>
          Need to talk? <a className="font-semibold text-primary" href="https://www.begambleaware.org" target="_blank" rel="noreferrer">BeGambleAware</a> and{' '}
          <a className="font-semibold text-primary" href="https://www.gamblingtherapy.org" target="_blank" rel="noreferrer">Gambling Therapy</a> offer free, confidential help.
        </p>
        <Link href="/profile#limits" className="inline-block font-semibold text-primary">
          Set my limits
        </Link>
      </Section>

      <Section id="glossary" title="Glossary">
        <dl className="grid gap-3 sm:grid-cols-2">
          {[
            ['LOFI', 'A test coin made for this Cold Call beta on Sui devnet. No real value.'],
            ['SUI', 'The coin of the Sui network. Here on devnet it is a test coin with no real value.'],
            ['Stake', 'The LOFI or SUI you put into one game. A game uses one coin only.'],
            ['Fee', 'What Cold Call keeps from games between people: 5% of the stake.'],
            ['Pot', 'All stakes in a game between people. The winner takes it.'],
            ['Bot target', 'How often you are expected to win against the bot.'],
            ['Fair shuffle', 'A shuffle you can check after the game with the revealed seed.'],
            ['Cash out', 'Moving coins from your Cold Call balance back to your wallet.'],
            ['Network fee', 'A tiny amount of SUI the Sui network charges for each transaction. Cold Call pays it for you.'],
            ['Wallet', 'Where your coins live outside Cold Call. We make one for you from your Google account or in this browser.'],
            ['Limits', 'Caps you set on adding money and losses.'],
          ].map(([t, d]) => (
            <div key={t}>
              <dt className="font-semibold text-text">{t}</dt>
              <dd className="text-[15px]">{d}</dd>
            </div>
          ))}
        </dl>
      </Section>
    </div>
  );
}
