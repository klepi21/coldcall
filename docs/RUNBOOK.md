# Evens runbook

## Live on Solana devnet (since 16 Nov 2026)
| What | Address |
|---|---|
| Vault program | `CRN6JXESEJUgFBAgYxf6bgGPq5iKya6jWhZphotQhyhN` |
| Vault config | `DEBAzsKqkL67soSGAi9nAPdY4snuzSpBoriSDS4XxYsc` |
| Vault token account | `H1ZVCVdLxaYB5dV3HmBZp1LVsBntDL5qpYijHgMBvNzD` |
| Test USDC mint (6 decimals) | `DkzuzHdoQ6kDRBEztL5sGu6DXVM4yUvqb15NaKfMUDST` |
| Ticket signer | `GcBy9HbRcnTjcW5tELSMzeDYVaYS7LAKwn9gDinYG5qF` |
| Admin, deployer and house wallet | `8mNwp5LdLG65JxXybq9S4m3HmSLkLTR8PysQpJoZ9L8K` |

Explorer: https://explorer.solana.com/address/H1ZVCVdLxaYB5dV3HmBZp1LVsBntDL5qpYijHgMBvNzD?cluster=devnet

The deployer pays 0.02 SOL to each new user for network fees (faucet button). Keep it topped up via https://faucet.solana.com.

## Local development (no server needed)
```
pnpm install
pnpm dev                      # devnet (apps/server/.env, database evens_devnet), API :4000, web :3000
CLUSTER=localnet pnpm dev     # fully offline: local validator + apps/server/.env.localnet, database evens
```
Open http://localhost:3000. Logs are in `.logs/`.

Tests:
```
pnpm test                      # game engines, money rules, calibration, contract (LiteSVM)
pnpm e2e                       # full API + chain run (needs pnpm dev running)
```

## Keys (never commit, `keys/` is gitignored)
| File | Role |
|---|---|
| `keys/deployer.json` | pays for deploys, vault admin, house wallet |
| `keys/server-signer.json` | signs withdrawal tickets. Production: move to AWS KMS (implement `TicketSigner` in `apps/server/src/chain/vault.ts`) |
| `keys/mint-authority.json` | mints test USDC for the faucet (devnet only) |
| `keys/program-evens_vault.json` | program id `CRN6JXESEJUgFBAgYxf6bgGPq5iKya6jWhZphotQhyhN` |
| `keys/chain.json` | written by `chain:setup` (mint, config, vault addresses) |

## Deploy the vault to devnet
The public devnet RPC faucet is closed. Get about 4 SOL to the deployer address first:
`solana-keygen pubkey keys/deployer.json`, then use https://faucet.solana.com (GitHub sign in) or any devnet faucet.
```
export PATH="$HOME/.local/share/solana/install/active_release/bin:$HOME/.avm/bin:$PATH"
anchor build
solana program deploy target/deploy/evens_vault.so --program-id keys/program-evens_vault.json -k keys/deployer.json --url devnet
cd apps/server
SOLANA_RPC=https://api.devnet.solana.com SOLANA_CLUSTER=devnet npx tsx scripts/chain-setup.ts
SOLANA_RPC=https://api.devnet.solana.com SOLANA_CLUSTER=devnet npx tsx scripts/fund-house.ts 5000
```
Then set `SOLANA_RPC` and `SOLANA_CLUSTER=devnet` in `apps/server/.env`. On devnet the faucet sends 0.05 SOL from the deployer to each new user for network fees, so keep the deployer topped up.

## Pause everything
Call `set_paused(true)` with the admin key (deposits and withdrawals stop on chain). Games keep running on credits.

## Rotate the ticket signer
Generate a new key, call `rotate_server_signer(newPubkey)` with the admin key, update `SERVER_SIGNER_KEY`, restart the server. Open tickets signed by the old key stop working and expire back to players automatically.

## Make someone admin
Add their wallet address to `ADMIN_WALLETS` in `apps/server/.env`, restart, and have them sign in again.

## Restore a backup
`pg_dump evens > backup.sql` daily (cron to R2 in production). Restore with `psql evens < backup.sql`, start the server, and check the admin page reserve status. Live games resume from `game_states`.

## If the reserve check fails
1. Pause the vault. 2. Compare `ledger_accounts` (vault_onchain mirror) with the on-chain vault balance and recent `deposits`/`withdrawals`. 3. Fix the cause, unpause.
