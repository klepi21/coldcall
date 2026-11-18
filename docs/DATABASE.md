# Cold Call database design

Postgres 16 or newer (local dev uses Homebrew Postgres 17). Schema lives in `apps/server/src/db/migrations/*.sql` and runs automatically when the server boots (`pnpm --filter @coldcall/server db:migrate` to run it on its own). The Cold Call database is new, so migrations are edited in place: `001_init.sql` (money, games) and `002_progress.sql`.

Money is always `BIGINT` minor units: 1 minor = 0.01 coin = 10,000,000 base units (both coins have 9 decimals).

**Two currencies, LOFI and SUI, never converted.** `ledger_accounts`, `ledger_transactions`, `deposits`, `withdrawals`, `reserve_checks`, `faucet_claims`, `user_limits` and `game_tables` all carry `currency text not null check (currency in ('LOFI','SUI'))`. The account unique index includes the currency. The deferred trigger `ledger_check_balanced` rejects a transaction whose legs do not sum to zero **or** that touches an account of another currency than the transaction's. `post()` in `ledger.ts` checks the same before writing.

## Diagram

```
users ──< sessions
  ├──< user_limits         (one row per currency)
  │
  ├──< deposits            (one row per vault event: digest + event index)
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
| `users` | Player and admin accounts | `wallet_address` unique (Sui address, 0x + 64 hex), `wallet_kind` `zklogin` or `guest`, `google_sub` unique for Google users. Cool off and exclusion, skill `ratings` (never money based), settings (incl. the active coin) |
| `user_limits` | Deposit and loss limits | one row per (user, currency) |
| `auth_nonces` | Guest wallet sign in challenges | single use, 10 minute expiry |
| `sessions` | httpOnly cookie sessions | random 32 byte id |
| `ledger_accounts` | One account per (kind, currency, user, table) | kinds: `user_available`, `user_locked`, `game_escrow`, `house_bankroll`, `fee_revenue`, `vault_onchain`. User and escrow accounts can never go negative (CHECK). `balance` is a cache updated in the same transaction as entries |
| `ledger_transactions` | One business event | `idempotency_key` unique: `deposit:<digest>:<eventIndex>`, `fund:<digest>:<eventIndex>`, `adminw:<digest>:<eventIndex>`, `join:<table>:<seat>:<user>`, `settle:<table>`, `wlock:<id>`, `wdone:<id>`, `wrel:<id>` |
| `ledger_entries` | Signed legs of a transaction | append only (UPDATE and DELETE raise). A deferred constraint trigger rejects any transaction whose legs do not sum to zero |
| `deposits` | `Deposited` (user) and `Funded` (house) vault events | primary key `(digest, event_seq)`, so each event is credited once |
| `withdrawals` | Cash out tickets | per currency, `review → pending → submitted → confirmed`, or `expired` (released only after `vault::is_used(nonce)` is false on chain, 2 minutes past expiry) |
| `reserve_checks` | Vault vs liabilities snapshots | per currency, every 5 minutes |
| `faucet_claims` | Test SUI sent by the game wallet, test LOFI claims | rate limits |
| `game_tables` | One game | mode `practice`/`bot`/`pvp`, one `currency`, stake and fee in it, `server_seed` (secret until settled) and `seed_commit`, `client_seeds`, disclosed `bot_meta`, final `result` |
| `table_seats` | Who sits where | human or bot, final net `payout` |
| `game_states` | Latest engine state + RNG position + clocks | used to resume games after a restart |
| `game_moves` | Every move in order | with the seed this replays the whole game (public verify page) |

## Money flows (all inside one serializable transaction)

| Event | Legs |
|---|---|
| Deposit | `vault_onchain -X`, `user_available +X` (a `Funded` event goes to `house_bankroll`) |
| Join a table | `user_available -(stake+fee)`, `game_escrow +(stake+fee)` |
| Bot table start | `house_bankroll -stake`, `game_escrow +stake` |
| Settle vs people | `game_escrow -all`, winners `+pot share`, `fee_revenue +fees (+rounding remainder)` |
| Settle vs bot | `game_escrow -2×stake`, player and/or house get their share (chess draw: 90% to player) |
| Leave before start | `game_escrow -(stake+fee)`, `user_available +(stake+fee)` |
| Cash out request | `user_available -X`, `user_locked +X` |
| Cash out confirmed | `user_locked -X`, `vault_onchain +X` |
| Cash out expired | `user_locked -X`, `user_available +X` |

Every leg of one transaction is in the same currency. Invariant per currency: `-balance(vault_onchain) = sum(all other accounts of that currency)`, and the on-chain vault of that currency covers it (reserve job).
