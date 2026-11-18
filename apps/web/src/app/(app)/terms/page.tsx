import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage } from '@/components/app/LegalPage';

export const metadata: Metadata = { title: 'Terms', description: 'The rules for using Cold Call, a skill games demo on Sui devnet with test coins only.' };

export default function Terms() {
  return (
    <LegalPage eyebrow="Terms" title="Terms of use" updated="18 November 2026 (terms version 2026-11-18-coldcall)">
      <p>
        By using Cold Call you agree to these terms. They are short on purpose. If anything here and the <Link href="/how-it-works">How it works</Link> page disagree, How it works wins for numbers like fees, stakes and limits.
      </p>
      <section>
        <h2>A devnet demo with test coins</h2>
        <ul>
          <li>Cold Call runs on Sui devnet. LOFI and SUI used here are <strong>test coins with no money value</strong>. You cannot buy them from us and we will never pay you money for them.</li>
          <li>Devnet is reset from time to time. When that happens, test balances, vaults and history can disappear.</li>
          <li>The service is a beta. It can be slow, paused or offline, and it is provided as it is, without guarantees.</li>
        </ul>
      </section>
      <section>
        <h2>Who can play</h2>
        <p>You must be 18 or older and allowed to play skill games for stakes where you live. One person, one account. Do not use bots, scripts or a second account to play against yourself.</p>
      </section>
      <section>
        <h2>Games, stakes and fees</h2>
        <ul>
          <li>Each table is played in one coin, LOFI or SUI. Stakes, fees and payouts of that table only use that coin. The two coins are never converted.</li>
          <li>Against people the winner takes the pot and Cold Call keeps a fee of 5% of the stake, rounded down, shown before you join. Against the bot there is no fee and the house keeps a published 5% edge.</li>
          <li>Leaving a game in progress, running out of time or missing too many turns counts as a loss.</li>
          <li>The server decides every game. Dice and shuffles use seeds that are locked before the game and revealed after, so you can verify them.</li>
        </ul>
      </section>
      <section>
        <h2>Your wallet and cash outs</h2>
        <ul>
          <li>You are responsible for your wallet. If you lose the key of a wallet kept in this browser, nobody can recover it.</li>
          <li>Cash outs use tickets signed by our server and checked by the Cold Call Move contract. Daily limits apply, and large cash outs wait for a short manual check.</li>
          <li>We can pause the vaults for safety. While paused, balances stay safe and cash outs resume afterwards.</li>
        </ul>
      </section>
      <section>
        <h2>Fair play</h2>
        <p>We may void games and reverse results that come from cheating, collusion, bugs or abuse of the faucet, and close accounts that break these terms.</p>
      </section>
      <section>
        <h2>Safer play</h2>
        <p>
          You can set limits per coin, take a break or pause your account in your profile at any time, and you can always cash out. If playing stops being fun, free help is available from <a href="https://www.begambleaware.org" target="_blank" rel="noreferrer">BeGambleAware</a> and <a href="https://www.gamblingtherapy.org" target="_blank" rel="noreferrer">Gambling Therapy</a>.
        </p>
      </section>
      <section>
        <h2>Changes and contact</h2>
        <p>
          If these terms change, we update the terms version and ask you to accept them again. Questions: open an issue on <a href="https://github.com/klepi21/coldcall" target="_blank" rel="noreferrer">GitHub</a>. See also our <Link href="/privacy">privacy policy</Link>.
        </p>
      </section>
    </LegalPage>
  );
}
