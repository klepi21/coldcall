#!/usr/bin/env bash
# Starts everything for local development: Postgres (Homebrew), a local Solana validator with the
# vault program preloaded, one time chain setup + house bankroll, the API server and the web app.
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
LOGS=.logs; mkdir -p $LOGS

brew services start postgresql@17 >/dev/null 2>&1 || true
createdb evens 2>/dev/null || true

# CLUSTER=localnet pnpm dev  -> local validator and apps/server/.env.localnet
# pnpm dev                   -> Solana devnet with apps/server/.env (default)
ENVFILE=.env
if [ "${CLUSTER:-devnet}" = "localnet" ]; then ENVFILE=.env.localnet; fi
createdb evens_devnet 2>/dev/null || true

if [ "$ENVFILE" = ".env.localnet" ] && ! curl -s localhost:8899 -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' | grep -q ok; then
  echo "Starting local validator"
  [ -f target/deploy/evens_vault.so ] || (export PATH="$HOME/.cargo/bin:$HOME/.avm/bin:$PATH"; anchor build)
  solana-test-validator --quiet --ledger .localnet --bpf-program CRN6JXESEJUgFBAgYxf6bgGPq5iKya6jWhZphotQhyhN target/deploy/evens_vault.so > $LOGS/validator.log 2>&1 &
  for i in $(seq 1 30); do curl -s localhost:8899 -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' | grep -q ok && break; sleep 1; done
fi

[ -f apps/server/$ENVFILE ] || cp apps/server/.env.example apps/server/$ENVFILE
( cd apps/server && npx tsx --env-file=$ENVFILE src/db/migrate.ts && npx tsx --env-file=$ENVFILE scripts/chain-setup.ts >/dev/null )
DB=$(grep DATABASE_URL apps/server/$ENVFILE | sed "s#.*/##")
HOUSE=$(psql -d "$DB" -tAc "select coalesce(balance,0) from ledger_accounts where kind='house_bankroll' and user_id is null and table_id is null" || echo 0)
if [ -z "$HOUSE" ] || [ "$HOUSE" -lt 1000000 ]; then ( cd apps/server && npx tsx --env-file=$ENVFILE scripts/fund-house.ts 2000 ); fi

echo "API on :4000, web on :3000 (logs in $LOGS)"
( cd apps/server && npx tsx watch --env-file=$ENVFILE src/index.ts > ../../$LOGS/server.log 2>&1 ) &
( cd apps/web && npx next dev -p 3000 > ../../$LOGS/web.log 2>&1 ) &
wait
