# How Cold Call works (public explanation, terms version 2026-11-18-coldcall)

This is the source text for the in-app "How it works" page. If any number here changes, update the app copy, `packages/shared/src/money.ts` and the terms version (`TERMS_VERSION` in `apps/server/src/lib/auth.ts`) together.

## Money: two coins, never converted
- Cold Call has two coins: **LOFI** ("LOFI (devnet test)", a test coin made for this beta) and **SUI**. Both have 9 decimals on chain.
- Every player holds a separate balance in each coin. The coins are never swapped, converted or added together, and there is no exchange rate. There is no shared pool.
- Coins you add go from your wallet into the vault of that coin (one shared `Vault<T>` per coin, a public Move contract on Sui). Your balance in that coin goes up by exactly the same amount.
- Inside Cold Call amounts are integers in hundredths of a coin (1 unit = 0.01 coin = 10,000,000 base units). Amounts below 0.01 that reach a vault stay in the vault and are never credited.
- Every table is played in exactly one coin. Stakes, fees and payouts of that table only move that coin.
- Cold Call pays the Sui network fee for adding money, cashing out and test LOFI claims (sponsored transactions).
- The beta runs on Sui devnet. LOFI and SUI here are test coins with no value. Test LOFI: 1,000 per claim, once every 6 hours (enforced by the contract). Test SUI: 0.5 SUI sent by the game wallet, once every 12 hours per player.

## Stakes and fees
- LOFI: quick picks 1, 10, 100 and 500 LOFI. Any stake from 1 LOFI up to 1,000 LOFI against people, or up to 500 LOFI against the bot.
- SUI: quick picks 0.05, 0.1, 0.5 and 1 SUI. Any stake from 0.05 SUI up to 2 SUI against people, or up to 1 SUI against the bot.
- Each coin has its own house bankroll. A bot game never risks more than 1% of the bankroll of its coin, so the biggest bot stake can be lower at times.
- Quick match only pairs players of the same game, coin and stake.
- Against people: equal stakes form the pot, the winner (or winning Tichu team) takes it. Fee: 5% of the stake, rounded down to 0.01 of the coin, shown before joining. LOFI minimum fee 0.05 LOFI. SUI has no minimum, so 0.05 and 0.10 SUI tables have no fee (0.5 SUI pays 0.02, 1 SUI pays 0.05). Chess draw: stakes back, fee kept. Leaving before the start refunds everything, fee included.
- Against the bot: no fee. Win pays 2x the stake, loss loses the stake, chess draw returns 90% rounded down to 0.01 of the coin (a 0.05 SUI draw returns 0.04 SUI).
- Practice is free and uses no coin.

## The bot
- One flat, disclosed house edge of 5% at every stake, in both coins: expected return per game is minus 5% of the stake.
- Chess: Davidson model (draw factor 2/3). The engine Elo is solved so that win minus loss minus 0.1 x draw = minus 0.05. That is about 36% wins, 25% draws, 39% losses. Stockfish 19 with UCI_Elo (1320 to 3190); below 1320 we use Skill Level, which is approximate.
- Backgammon, Tichu and Ice Floe Battle: target win chance 47.5% using a level ladder (level L is about 1100 + 60L Elo).
- Ice Floe Battle bot: reads only the public view of its seat, never the hidden enemy fleet. Its fleet is a random valid placement from the game seed (checkable on the verify page).
- Inputs: only the player's skill rating for that game. Never balance, deposits, losses, spending or the coin.
- The setting is locked before the game starts and shown on the verify page.
- Anti sandbagging: practice games do not change ratings, and a rating cannot drop more than 150 below its peak.

## Fairness
- Before a game the server picks a 32 byte secret seed and publishes `sha256(seed)`. Each player contributes a client seed.
- Randomness is `HMAC_SHA256(key = serverSeed, msg = clientSeeds.join(':') + ':' + block)`, read with rejection sampling. Dice use `int(6)+1`, shuffles use Fisher Yates.
- After the game the seed is revealed. The verify page recomputes the commit and replays every move in the browser.

## Vaults and cash outs
- Deposits are credited only from `vault::Deposited` events read from the chain, once per transaction digest and event index (`deposit:<digest>:<eventIndex>`). A background scanner of vault events is the backup path.
- Cash out tickets: the server's Ed25519 key signs exactly 88 bytes, `vault id | recipient | amount (u64 LE) | nonce (u64 LE) | expiry_ms (u64 LE)`. The contract checks the signature, the expiry against the on-chain clock, and burns the nonce (single use per vault). Tickets last 10 minutes; an unused ticket's amount returns to the player after it expires and the chain confirms the nonce was not used.
- Per player per day: up to 20,000 LOFI and up to 50 SUI. Cash outs above 10,000 LOFI or 20 SUI wait for a manual review first.
- Reserve check every 5 minutes, per coin: the LOFI vault must cover everything held in LOFI (players, games, house, fees), and the SUI vault everything held in SUI.

## Sign in
- Google (zkLogin): your Google account becomes your Sui wallet. The address comes from your Google account id and a salt our server keeps stable. Signing happens in your browser with a short lived key.
- Guest: a wallet key kept in this browser only.

## Safer play
- 18+ at sign up. Deposit and loss limits (daily, weekly), set separately for LOFI and SUI: lowering applies now, raising waits 24 hours. Breaks of 24 hours, 7 days or 30 days, and a 6 month account pause. Hourly session reminder. Cashing out always works.
