#!/usr/bin/env bash
# Local development on Sui devnet: Postgres (Homebrew), the API server and the web app.
# Needs apps/server/.env (copy apps/server/.env.example) and cold_call.config.json from the Move publish.
set -euo pipefail
cd "$(dirname "$0")/.."
LOGS=.logs; mkdir -p $LOGS
brew services start postgresql@17 >/dev/null 2>&1 || true
createdb coldcall_devnet 2>/dev/null || true
[ -f apps/server/.env ] || { echo "Missing apps/server/.env (see apps/server/.env.example)"; exit 1; }
echo "API on :4000, web on :3000 (logs in $LOGS)"
( cd apps/server && npx tsx watch --env-file=.env src/index.ts > ../../$LOGS/server.log 2>&1 ) &
( cd apps/web && npx next dev -p 3000 > ../../$LOGS/web.log 2>&1 ) &
wait
