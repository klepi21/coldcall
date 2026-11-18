import type { Metadata } from 'next';
import { LegalPage } from '@/components/app/LegalPage';

export const metadata: Metadata = { title: 'Privacy', description: 'What Cold Call stores about you, why, and how to have it removed.' };

export default function Privacy() {
  return (
    <LegalPage eyebrow="Privacy" title="Privacy policy" updated="18 November 2026">
      <p>
        Cold Call is a skill games demo on Sui devnet. It uses test coins only, LOFI and SUI on devnet, which have no money value. We keep as little about you as we can. This page says what we store and why.
      </p>
      <section>
        <h2>What we store</h2>
        <ul>
          <li><strong>Your Sui wallet address.</strong> Every account is a wallet address. Anyone can see an address and its activity on the public Sui network.</li>
          <li><strong>If you sign in with Google:</strong> your Google account id (the &quot;sub&quot; value) so we can recognise you, and your first name to suggest a player name. We do not store your email address, your Google password or your contacts. We never post anything to your Google account.</li>
          <li><strong>Your player name, avatar and settings</strong> such as sound, theme, the coin you play with and the limits you set.</li>
          <li><strong>Games and money records:</strong> tables you sat at, moves, results, deposits, cash outs and the ledger entries behind your balances. We need these to run fair games, pay out correctly and let you verify games.</li>
          <li><strong>A session cookie</strong> that keeps you signed in. It is httpOnly and is not used for advertising.</li>
          <li><strong>Basic server logs</strong> (time, address of the request, errors) to keep the service safe. Logs are deleted after 14 days.</li>
        </ul>
      </section>
      <section>
        <h2>What stays in your browser</h2>
        <p>
          The key of a wallet on this device, and the short lived key and proof of a Google sign in, are kept in your browser only. We never receive them. If you clear your browser data, a wallet on this device is gone for good.
        </p>
      </section>
      <section>
        <h2>Google sign in (zkLogin)</h2>
        <p>
          When you continue with Google, Google sends your browser a signed token. Our server checks it, works out your stable Sui address from your Google account id and a secret salt, and sends a zero knowledge proof request to the Sui proving service run by Mysten Labs. The proof lets your browser sign Sui transactions without revealing your Google identity on chain.
        </p>
      </section>
      <section>
        <h2>Who we share data with</h2>
        <ul>
          <li>The Sui network: your deposits and cash outs are public transactions, like every Sui transaction.</li>
          <li>Google, only to sign you in when you choose Google.</li>
          <li>Mysten Labs, only the data needed to create your zkLogin proof.</li>
        </ul>
        <p>We do not sell data, we do not use advertising trackers, and we do not use your balance or spending to change how games or bots behave.</p>
      </section>
      <section>
        <h2>Your choices</h2>
        <p>
          You can change your name and settings in your profile, set limits, take a break or pause your account. To have your account data deleted, open an issue on <a href="https://github.com/klepi21/coldcall" target="_blank" rel="noreferrer">GitHub</a> with your wallet address. Records already written to the Sui network cannot be deleted by anyone.
        </p>
      </section>
      <section>
        <h2>Age</h2>
        <p>Cold Call is for people aged 18 or older.</p>
      </section>
    </LegalPage>
  );
}
