'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, Eyebrow } from '@/components/ui';
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
    <svg viewBox="0 0 560 112" className="w-full" role="img" aria-label="Your wallet sends money to the vault, you play with credits, and you cash out back to your wallet">
      {box(0, 'Your wallet', 'test USDC')}
      {box(205, 'Evens vault', 'public contract')}
      {box(410, 'Your credits', '1 USDC = 100')}
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
  const [reserve, setReserve] = useState<{ vault_minor: number; liabilities_minor: number; ok: boolean; checked_at: string } | null>(null);
  useEffect(() => {
    api('/api/reserve').then(setReserve).catch(() => {});
  }, []);
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="pb-2">
        <Eyebrow className="mb-2">No small print</Eyebrow>
        <h1 className="t-display">
          How Evens <span className="t-grad-primary">works</span>
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
        <p>Money you add goes from your wallet into the Evens vault, a public contract on Solana. You get credits one to one: 1 test USDC is 100 credits.</p>
        <p>Games use credits, so they are instant and free of network fees. When you cash out, credits turn back into money in your wallet.</p>
        <p>This beta runs on Solana devnet. All money is test money with no real value. You can get free test USDC in your wallet.</p>
      </Section>

      <Section id="stakes" title="Stakes and fees">
        <p>You choose your stake: any amount from 1 credit up to 10,000 credits (about $100) against people, or up to 5,000 credits (about $50) against the bot. A single bot game never risks more than 1% of the house bankroll, so the biggest bot stake can be lower at times. Practice games are always free.</p>
        <p>
          <strong className="text-text">Against people:</strong> everyone puts in the same stake. The winner takes the whole pot (in Tichu the winning team splits it). Evens keeps a fee of 5% of the stake, at least 0.05 credits, shown before you join. A chess draw returns your stake, the fee is kept. If you leave before the game starts, you get everything back including the fee.
        </p>
        <p>
          <strong className="text-text">Against the bot:</strong> there is no fee. A win pays double your stake. A loss loses the stake. A chess draw returns 90%.
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
        <p>Credits are backed one to one by money in the vault: 100 credits for every 1 USDC. Every 5 minutes we also check that the vault holds at least what we owe all players.</p>

        <p className="font-semibold text-text">Check it yourself</p>
        <VaultLinks />
        <p>Cash outs are signed by our server and checked by the contract. Up to 20,000 credits a day per player; cash outs above 10,000 credits get a quick check by our team first. Because our server signs them, cash outs pause if our service is down or if we pause the vault for safety.</p>
        <p>Evens controls this contract: we can pause it and update its code. Before real money, these powers move to a group of keys that must agree, with a time delay.</p>
      </Section>

      <Section id="limits" title="Safer play">
        <p>Playing for credits should be fun. In your profile you can set limits for adding money and for losses per day or week, take a break for 24 hours, 7 days or 30 days, or pause your account for 6 months.</p>
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
            ['Credits', 'What you play with. 100 credits equal 1 test USDC.'],
            ['Stake', 'The credits you put into one game.'],
            ['Fee', 'What Evens keeps from games between people: 5% of the stake.'],
            ['Pot', 'All stakes in a game between people. The winner takes it.'],
            ['Bot target', 'How often you are expected to win against the bot.'],
            ['Fair shuffle', 'A shuffle you can check after the game with the revealed seed.'],
            ['Cash out', 'Turning credits back into money in your wallet.'],
            ['Network fee', 'A tiny amount of SOL the Solana network charges to move money.'],
            ['Wallet', 'Where your money lives outside Evens. We create one for you if you do not have one.'],
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
