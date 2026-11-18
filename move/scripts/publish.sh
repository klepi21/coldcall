#!/usr/bin/env bash
# Publishes the COLD CALL Move package to Sui devnet end to end and rewrites ../../cold_call.config.json.
# Devnet is wiped about every two weeks: after a wipe just run this again (keys in .secrets stay valid).
#
#   cd ~/Desktop/coldcall/move/scripts && ./publish.sh && node e2e.mjs
#
# Uses a dedicated CLI config in ~/Desktop/coldcall/.secrets/sui so the global ~/.sui config is never touched.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
MOVE_DIR="$(cd "$HERE/.." && pwd)"
ROOT="$(cd "$MOVE_DIR/.." && pwd)"
CLIENT_CFG="$ROOT/.secrets/sui/client.yaml"
SUI_BIN="${SUI_BIN:-$HOME/.local/bin/sui-devnet}"
GAS_BUDGET="${GAS_BUDGET:-2000000000}"   # publish costs about 1.2 SUI on devnet
MIN_ADMIN=12000000000                    # publish + 5 SUI bankroll + gas
MIN_GAME=5000000000                      # sponsor gas + e2e transfers

S() { "$SUI_BIN" client --client.config "$CLIENT_CFG" "$@"; }

echo "== CLI: $("$SUI_BIN" --version)"
S switch --env devnet >/dev/null
CHAIN_ID="$(S chain-identifier | sed -n 's/^Hex: //p')"
[ -n "$CHAIN_ID" ] || { echo "could not read chain id"; exit 1; }
echo "== devnet chain id: $CHAIN_ID"

# Point Move.toml at the current devnet chain id and forget any previous devnet publication.
sed -i.bak -E "s/^devnet = \"[0-9a-f]+\"/devnet = \"$CHAIN_ID\"/" "$MOVE_DIR/Move.toml" && rm -f "$MOVE_DIR/Move.toml.bak"
rm -f "$MOVE_DIR/Published.toml"

(cd "$HERE" && [ -d node_modules ] || npm ci --silent)

topup() { # alias address min
  local bal i
  for i in 1 2 3 4 5 6; do
    bal="$(node "$HERE/balance.mjs" "$2" 2>/dev/null || echo 0)"
    echo "== $1 balance: $bal MIST"
    [ "${bal:-0}" -ge "$3" ] && return 0
    S faucet --address "$1" >/dev/null 2>&1 || echo "faucet request failed (rate limit?), retrying"
    sleep 8
  done
  echo "could not fund $1"; exit 1
}
ENV_FILE="$ROOT/.secrets/devnet.env"
ADMIN_ADDR="$(sed -n 's/^CC_ADMIN_ADDRESS=//p' "$ENV_FILE")"
GAME_ADDR="$(sed -n 's/^CC_GAME_ADDRESS=//p' "$ENV_FILE")"
topup cc-admin "$ADMIN_ADDR" "$MIN_ADMIN"
topup cc-game "$GAME_ADDR" "$MIN_GAME"

echo "== unit tests"
(cd "$MOVE_DIR" && "$SUI_BIN" move test >/dev/null) || { echo "unit tests failed"; exit 1; }

S switch --address cc-admin >/dev/null
OUT="$HERE/.last-publish.json"
echo "== publishing (budget $GAS_BUDGET MIST)"
(cd "$MOVE_DIR" && S publish --gas-budget "$GAS_BUDGET" --json) > "$OUT"
echo "== publish digest: $(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["digest"])' "$OUT")"

echo "== setup: register LOFI currency, create vaults, mint + fund bankrolls"
node "$HERE/post-publish.mjs" "$OUT"
echo "== wrote $ROOT/cold_call.config.json"
echo "== now run: node $HERE/e2e.mjs"
