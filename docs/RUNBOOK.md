# Cold Call runbook

Cold Call runs on **Sui devnet** with test coins only (LOFI and SUI). It is not deployed yet; the planned host is `https://coldcall.45-81-6-214.sslip.io` (separate folder, ports and database from any other app on that box).

## Chain
- Move package, vaults and faucet: see `move/README.md`. Public ids: `cold_call.config.json` (rewritten by `move/scripts/publish.sh`).
- Keys: `.secrets/devnet.env` (mode 600, git ignored). The server only needs `CC_GAME_KEY` (cc-game: gas sponsor, ticket signer, test SUI sender). cc-admin keeps the AdminCap and never runs on the server.
- Devnet is wiped about every two weeks. After a wipe: republish (`move/README.md`), restart the server so it reads the new config, and reset the devnet database (old deposits are gone).

## Local run
```bash
brew services start postgresql@17
createdb coldcall_devnet
pnpm install
cp apps/server/.env.example apps/server/.env   # fill CC_GAME_KEY, GOOGLE_CLIENT_ID, ZK_SALT_SECRET, COLD_CALL_CONFIG
(cd apps/server && npx tsx --env-file=.env src/index.ts)   # API on :4000, migrates on boot
(cd apps/web && npx next dev -p 3000)                      # web on :3000, proxies /api to :4000
```

## Server environment (`apps/server/.env`, never committed)
| Variable | Meaning |
|---|---|
| `DATABASE_URL` | Postgres, e.g. `postgres://localhost:5432/coldcall_devnet` |
| `WEB_ORIGIN` | Web origin for CORS, e.g. `http://localhost:3000` |
| `SUI_NETWORK`, `SUI_RPC` | `devnet`, `https://fullnode.devnet.sui.io:443` (gRPC, `@mysten/sui` 2.39.1) |
| `COLD_CALL_CONFIG` | absolute path to `cold_call.config.json` |
| `CC_GAME_KEY` | `suiprivkey1...` of cc-game. Checked against `gameAddress` and `gamePubkeyHex` at first use |
| `GOOGLE_CLIENT_ID` | Google OAuth web client for zkLogin. Empty means only guest wallets |
| `ZK_SALT_SECRET` | random secret for the stable zkLogin salt. **Never change it** once Google users exist: their addresses depend on it |
| `SUI_DRIP_BASE`, `SUI_DRIP_HOURS`, `SUI_DRIP_FLOOR_BASE` | test SUI per claim (default 0.5 SUI), hours between claims (12), game wallet floor (2 SUI) |
| `ADMIN_WALLETS` | comma separated Sui addresses that become admin at sign in |

Google OAuth client: authorized JS origins `http://localhost:3000` and the production origin; redirect URIs `<origin>/auth/google`.

## Jobs (inside the API process)
- Vault event scanner every 15 s (`scanVaultEvents`): credits `Deposited`, books `Funded` to the house bankroll, completes cash outs from `Withdrawn`, books `AdminWithdrawn`. Cursor in `chain_cursor`.
- Cash out sweep every 30 s: expired tickets are released only when `vault::is_used(nonce)` is false on chain.
- Reserve check every 5 min, per coin.

## Tests
- `pnpm test`: shared money rules, game engines, server tests including currency isolation (needs local Postgres; uses a throwaway `coldcall_test` database).
- `cd apps/server && npx tsx --env-file=.env scripts/e2e-devnet.ts`: live API flow on devnet with a fresh guest wallet.
- `node apps/web/e2e/flow.mjs <outDir>` (`WIDE=1` for 1440 px): the same flow in a real browser with screenshots.

## Admin
- `cd apps/server && npx tsx --env-file=.env scripts/grant-admin.ts <0x address>` (add `--revoke` to remove).
- House bankroll: fund a vault on chain with `vault::fund` (cc-admin). The scanner books the `Funded` event to the house bankroll of that coin.
- Pause: `vault::set_paused` with the AdminCap (per coin vault). Deposits and cash outs stop; balances are safe.

## Deploy (shared VPS, separate app)
- First time: `./scripts/deploy.sh --setup` creates the `coldcall` user, `/opt/coldcall/{config,app}`, the `coldcall_devnet` database with its own `coldcall` role, the `coldcall-api` (127.0.0.1:4100) and `coldcall-web` (127.0.0.1:3100) systemd units, and a Caddy site file `/etc/caddy/coldcall.caddy` for `coldcall.45-81-6-214.sslip.io` (the main Caddyfile only gains one `import` line, validated before reload, restored if rejected).
- Then fill `/opt/coldcall/config/server.env` (`CC_GAME_KEY`, `GOOGLE_CLIENT_ID`, `ADMIN_WALLETS`; the database URL and `ZK_SALT_SECRET` are generated) and check `web.env`.
- Every release: `./scripts/deploy.sh` ships the committed HEAD plus `cold_call.config.json`, builds next to the live release, switches, health checks and rolls back on failure. Previous release: `/opt/coldcall/prev`.
- Logs: `ssh coldcall 'journalctl -u coldcall-api -f'`. The script never touches other apps on the server.
