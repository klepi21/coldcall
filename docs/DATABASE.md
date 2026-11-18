# Evens database design

Postgres 16 or newer (local dev uses Homebrew Postgres 17). Schema lives in `apps/server/src/db/migrations/*.sql` and runs automatically when the server boots (`pnpm --filter @evens/server db:migrate` to run it on its own).

Money is always `BIGINT` minor units: 1 credit = 100 minor, 1 test USDC = 100 credits = 10,000 minor = 1,000,000 token base units.

## Diagram

```
users ──< sessions
  │
  ├──< deposits            (one row per on-chain deposit signature, unique)
  ├──< withdrawals         (ticket nonce unique, status machine)
  ├──< table_seats >── game_tables ──1 game_states
  │                         │
  │                         └──< game_moves   (ordered log, replayable)
  │
  └──< ledger_accounts ──< ledger_entries >── ledger_transactions
                                              (idempotency_key unique)
```

## Tables

| Table | Purpose | Key rules |
|---|---|---|
| `users` | Player, house and admin accounts | `wallet_address` unique. Holds responsible play fields (limits, cool off, exclusion), skill `ratings` (never money based), settings |
| `auth_nonces` | Sign in with Solana challenges | single use, 10 minute expiry |
| `sessions` | httpOnly cookie sessions | random 32 byte id |
| `ledger_accounts` | One account per (kind, user, table) | kinds: `user_available`, `user_locked`, `game_escrow`, `house_bankroll`, `fee_revenue`, `vault_onchain`. User and escrow accounts can never go negative (CHECK). `balance` is a cache updated in the same transaction as entries |
| `ledger_transactions` | One business event | `idempotency_key` unique: `deposit:<sig>`, `join:<table>:<seat>:<user>`, `settle:<table>`, `wlock:<id>`, `wdone:<id>`, `wrel:<id>` |
| `ledger_entries` | Signed legs of a transaction | append only (UPDATE and DELETE raise). A deferred constraint trigger rejects any transaction whose legs do not sum to zero |
| `deposits` | Verified on-chain deposits | primary key is the transaction signature, so a deposit can only be credited once |
| `withdrawals` | Cash out tickets | `review → pending → confirmed`, or `expired` (credits released only if the nonce PDA was never created on chain) |
| `reserve_checks` | Vault vs liabilities snapshots | every 5 minutes |
| `game_tables` | One game | mode `practice`/`bot`/`pvp`, stake and fee, `server_seed` (secret until settled) and `seed_commit`, `client_seeds`, disclosed `bot_meta`, final `result` |
| `table_seats` | Who sits where | human or bot, final net `payout` |
| `game_states` | Latest engine state + RNG position + clocks | used to resume games after a restart |
| `game_moves` | Every move in order | with the seed this replays the whole game (public verify page) |

## Money flows (all inside one serializable transaction)

| Event | Legs |
|---|---|
| Deposit | `vault_onchain -X`, `user_available +X` (house wallet deposits go to `house_bankroll`) |
| Join a table | `user_available -(stake+fee)`, `game_escrow +(stake+fee)` |
| Bot table start | `house_bankroll -stake`, `game_escrow +stake` |
| Settle vs people | `game_escrow -all`, winners `+pot share`, `fee_revenue +fees (+rounding remainder)` |
| Settle vs bot | `game_escrow -2×stake`, player and/or house get their share (chess draw: 90% to player) |
| Leave before start | `game_escrow -(stake+fee)`, `user_available +(stake+fee)` |
| Cash out request | `user_available -X`, `user_locked +X` |
| Cash out confirmed | `user_locked -X`, `vault_onchain +X` |
| Cash out expired | `user_locked -X`, `user_available +X` |

Invariant checked by `pnpm e2e` and the reserve job: `-balance(vault_onchain) = sum(all other accounts)`, and the on-chain vault token balance covers it.
