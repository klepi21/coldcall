# How Evens works (public explanation, terms version 2026-11-16b)

This is the source text for the in-app "How it works" page. If any number here changes, update the app copy, `packages/shared/src/money.ts` and the terms version together.

## Money
- Money you add goes from your wallet into the Evens vault, a public Solana program. You receive credits one to one: 1 test USDC = 100 credits.
- Games run on credits. Cashing out turns credits back into money in your wallet.
- The beta runs on Solana devnet. All money is test money with no value.

## Stakes and fees
- Stakes: any amount from 1 credit up to 10,000 credits (about $100) against people, or up to 5,000 credits (about $50) against the bot. A bot game never risks more than 1% of the house bankroll. Quick picks: 1, 10, 100, 1,000 and 5,000 credits. Practice is free.
- Against people: equal stakes form the pot, the winner (or winning Tichu team) takes it. Fee: 5% of the stake, minimum 0.05 credits, shown before joining. Chess draw: stakes back, fee kept. Leaving before the start refunds everything, fee included.
- Against the bot: no fee. Win pays 2x the stake, loss loses the stake, chess draw returns 90% (rounded down to 0.01 credits).

## The bot
- One flat, disclosed house edge of 5% at every stake: expected return per game is minus 5% of the stake.
- Chess: Davidson model (draw factor 2/3). The engine Elo is solved so that win minus loss minus 0.1 x draw = minus 0.05. That is about 36% wins, 25% draws, 39% losses. Stockfish 19 with UCI_Elo (1320 to 3190); below 1320 we use Skill Level, which is approximate.
- Backgammon, Tichu and Sea Battle: target win chance 47.5% using a level ladder (level L is about 1100 + 60L Elo).
- Sea Battle bot: reads only the public view of its seat (its own shots, hits, misses, ships still afloat), never the hidden enemy fleet. Its fleet is a random valid placement from the game seed (checkable on the verify page). It aims by probability density over every placement that still fits; lower levels fire a random square with probability (10 minus level) x 0.07.
- Inputs: only the player's skill rating for that game. Never balance, deposits, losses or spending.
- The setting is locked before the game starts and shown on the verify page.
- Anti sandbagging: practice games do not change ratings, and a rating cannot drop more than 150 below its peak.
- Monitoring: the admin page shows actual return per game and stake vs the disclosed minus 5%, flagged when it drifts more than 3 points after 500 games.

## Fairness
- Before a game the server picks a 32 byte secret seed and publishes `sha256(seed)`. Each player contributes a client seed.
- Randomness is `HMAC_SHA256(key = serverSeed, msg = clientSeeds.join(':') + ':' + block)`, read with rejection sampling (no modulo bias). Dice use `int(6)+1`, shuffles use Fisher Yates.
- After the game the seed is revealed. The verify page recomputes the commit and replays every move in the browser.

## Vault and cash outs
- Cash out tickets are signed by the server's Ed25519 key over `EVENS_WITHDRAW_V1 | program | config | user | mint | amount | nonce | expiry`. The program verifies the Ed25519 precompile instruction (offsets must point inside that same instruction), burns the nonce by creating a PDA, and enforces a vault wide daily limit and a maximum ticket lifetime of 1 hour.
- Per user cash out limit 20,000 credits (about $200) per day, manual review above 10,000 credits (about $100).
- Reserve check every 5 minutes: vault balance must cover everything owed.

## Safer play
- 18+ at sign up. Deposit and loss limits (daily, weekly): lowering applies now, raising waits 24 hours. Breaks of 24 hours, 7 days or 30 days, and a 6 month account pause. Hourly session reminder. Cashing out always works.
