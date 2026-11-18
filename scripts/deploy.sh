#!/usr/bin/env bash
# Deploys the committed HEAD of Cold Call to the shared VPS (ssh alias "evens") as a SEPARATE app.
#
#   ./scripts/deploy.sh --setup   first time only: user, folders, database, systemd units, Caddy site
#   ./scripts/deploy.sh           every release
#
# Everything Cold Call owns on the server is named coldcall and lives under /opt/coldcall:
#   /opt/coldcall/app       live release        /opt/coldcall/prev   previous release
#   /opt/coldcall/next      release being built /opt/coldcall/config server.env, web.env, cold_call.config.json
#   services coldcall-api (port 4100) and coldcall-web (port 3100), Postgres database coldcall_devnet, user coldcall
# It never reads, writes or restarts anything of Evens (/opt/evens, evens-api, evens-web, evens_devnet).
# Secrets stay on the server in /opt/coldcall/config and are never in git.
set -euo pipefail
cd "$(dirname "$0")/.."

HOST=evens
ROOT=/opt/coldcall
DOMAIN=coldcall.45-81-6-214.sslip.io
API_PORT=4100
WEB_PORT=3100

# Guard: refuse to run if any path or name here could point at Evens.
for v in "$ROOT" coldcall-api coldcall-web coldcall_devnet; do
  case "$v" in *evens*) echo "Refusing: '$v' looks like an Evens name"; exit 1 ;; esac
done

if [ "${1:-}" = "--setup" ]; then
  echo "First time setup of Cold Call on $HOST ($ROOT)"
  ssh "$HOST" "ROOT=$ROOT DOMAIN=$DOMAIN API_PORT=$API_PORT WEB_PORT=$WEB_PORT bash -s" <<'SETUP'
set -euo pipefail
id coldcall >/dev/null 2>&1 || useradd --system --create-home --shell /bin/bash coldcall
# Node and pnpm must be usable by the coldcall user (installed system wide, not inside another user's nvm).
if ! sudo -iu coldcall bash -lc 'node -v && pnpm -v' >/dev/null 2>&1; then
  echo "The coldcall user cannot run node and pnpm. Install Node 20+ system wide and run: corepack enable (or npm i -g pnpm), then run --setup again."
  exit 1
fi
# No empty $ROOT/app here: the first deploy creates it, and a failed first health check never rolls back to an empty folder.
mkdir -p "$ROOT/config"
chown -R coldcall:coldcall "$ROOT"
chmod 750 "$ROOT/config"

# Database with its own user. The password is generated once and kept only in $ROOT/config/db-password.
if [ ! -f "$ROOT/config/db-password" ]; then
  openssl rand -hex 24 > "$ROOT/config/db-password"
  chmod 600 "$ROOT/config/db-password"
  chown coldcall:coldcall "$ROOT/config/db-password"
fi
PW=$(cat "$ROOT/config/db-password")
sudo -u postgres psql -tAc "select 1 from pg_roles where rolname='coldcall'" | grep -q 1 || sudo -u postgres psql -qc "create role coldcall login password '$PW'"
sudo -u postgres psql -tAc "select 1 from pg_database where datname='coldcall_devnet'" | grep -q 1 || sudo -u postgres createdb -O coldcall coldcall_devnet

# Env file templates (filled in by hand, never overwritten).
if [ ! -f "$ROOT/config/server.env" ]; then
  cat > "$ROOT/config/server.env" <<EOF
NODE_ENV=production
PORT=$API_PORT
DATABASE_URL=postgres://coldcall:$PW@127.0.0.1:5432/coldcall_devnet
WEB_ORIGIN=https://$DOMAIN
SUI_NETWORK=devnet
SUI_RPC=https://fullnode.devnet.sui.io:443
COLD_CALL_CONFIG=$ROOT/config/cold_call.config.json
CC_GAME_KEY=
GOOGLE_CLIENT_ID=
ZK_SALT_SECRET=$(openssl rand -hex 32)
ADMIN_WALLETS=
EOF
fi
if [ ! -f "$ROOT/config/web.env" ]; then
  cat > "$ROOT/config/web.env" <<EOF
API_ORIGIN=http://127.0.0.1:$API_PORT
NEXT_PUBLIC_WS_URL=wss://$DOMAIN/ws
NEXT_PUBLIC_SITE_URL=https://$DOMAIN
EOF
fi
chown coldcall:coldcall "$ROOT/config/"*.env
chmod 600 "$ROOT/config/"*.env

# systemd units, Cold Call only.
cat > /etc/systemd/system/coldcall-api.service <<EOF
[Unit]
Description=Cold Call API (Fastify, port $API_PORT)
After=network-online.target postgresql.service
Wants=network-online.target

[Service]
User=coldcall
WorkingDirectory=$ROOT/app/apps/server
Environment=NODE_OPTIONS=--dns-result-order=ipv4first
ExecStart=/usr/bin/env bash -lc 'exec ./node_modules/.bin/tsx --env-file=.env src/index.ts'
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
cat > /etc/systemd/system/coldcall-web.service <<EOF
[Unit]
Description=Cold Call web (Next.js, port $WEB_PORT)
After=network-online.target coldcall-api.service

[Service]
User=coldcall
WorkingDirectory=$ROOT/app/apps/web
Environment=NODE_ENV=production
ExecStart=/usr/bin/env bash -lc 'exec ./node_modules/.bin/next start -p $WEB_PORT -H 127.0.0.1'
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable coldcall-api coldcall-web >/dev/null

# Caddy: Cold Call gets its own site file. The main Caddyfile only gains one import line, and the change
# is validated before reload and rolled back if Caddy does not accept it.
cat > /etc/caddy/coldcall.caddy <<EOF
$DOMAIN {
  encode zstd gzip
  handle /api/* {
    reverse_proxy 127.0.0.1:$API_PORT
  }
  handle /ws {
    reverse_proxy 127.0.0.1:$API_PORT
  }
  handle {
    reverse_proxy 127.0.0.1:$WEB_PORT
  }
}
EOF
if ! grep -q "import /etc/caddy/coldcall.caddy" /etc/caddy/Caddyfile; then
  cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.before-coldcall
  printf '\nimport /etc/caddy/coldcall.caddy\n' >> /etc/caddy/Caddyfile
  if ! caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1; then
    cp /etc/caddy/Caddyfile.before-coldcall /etc/caddy/Caddyfile
    echo "Caddy rejected the Cold Call site, Caddyfile restored. Nothing was reloaded."
    exit 1
  fi
fi
systemctl reload caddy
echo "Setup done. Now fill in $ROOT/config/server.env (CC_GAME_KEY, GOOGLE_CLIENT_ID, ADMIN_WALLETS), then run ./scripts/deploy.sh"
SETUP
  exit 0
fi

git diff --quiet HEAD || echo "Note: uncommitted changes are not deployed (deploy ships HEAD)."
REL=$(git rev-parse --short HEAD)
echo "Deploying Cold Call $REL to $HOST:$ROOT"
[ -f cold_call.config.json ] || { echo "Missing cold_call.config.json (from the Move publish)"; exit 1; }
ssh "$HOST" "test -f $ROOT/config/server.env" || { echo "Run ./scripts/deploy.sh --setup first"; exit 1; }
ssh "$HOST" "grep -q '^CC_GAME_KEY=suiprivkey' $ROOT/config/server.env" || { echo "Fill in CC_GAME_KEY in $ROOT/config/server.env first"; exit 1; }

# Restart the API only when server or shared code changed; web only releases never touch live games.
LAST=$(ssh "$HOST" "cat $ROOT/RELEASE 2>/dev/null" || true)
API_RESTART=1
if [ -n "$LAST" ] && git cat-file -e "$LAST" 2>/dev/null; then
  git diff --quiet "$LAST" HEAD -- apps/server packages pnpm-lock.yaml && API_RESTART=0
fi
echo "API restart: $([ $API_RESTART = 1 ] && echo yes || echo no, web only)"

ssh "$HOST" "rm -rf $ROOT/next && mkdir -p $ROOT/next"
git archive HEAD | ssh "$HOST" "tar -x -C $ROOT/next"
# Public chain ids travel next to the code; keys never do.
scp -q cold_call.config.json "$HOST:$ROOT/config/cold_call.config.json"

ssh "$HOST" "ROOT=$ROOT REL=$REL API_RESTART=$API_RESTART API_PORT=$API_PORT WEB_PORT=$WEB_PORT bash -s" <<'R'
set -e
cd "$ROOT"
ln -sf "$ROOT/config/server.env" next/apps/server/.env
ln -sf "$ROOT/config/web.env" next/apps/web/.env.production
chown -R coldcall:coldcall next config
sudo -iu coldcall bash -lc "export COREPACK_ENABLE_DOWNLOAD_PROMPT=0; cd $ROOT/next && pnpm install --frozen-lockfile >/dev/null"
# Build next to the live release; never go live without a finished build (one retry for network blips).
ok=0
for attempt in 1 2; do
  if sudo -iu coldcall bash -lc "cd $ROOT/next/apps/web && set -a && . ./.env.production && set +a && COLDCALL_RELEASE=$REL-\$(date +%s) pnpm build > /tmp/coldcall-build.log 2>&1"; then ok=1; break; fi
  echo "build attempt $attempt failed"; tail -15 /tmp/coldcall-build.log
done
if [ "$ok" != 1 ] || [ ! -f next/apps/web/.next/BUILD_ID ]; then echo "BUILD FAILED, live Cold Call untouched"; exit 1; fi
grep -E "Compiled" /tmp/coldcall-build.log | tail -1 || true
# Keep the previous build's static files so open tabs keep working until they update.
[ -d app/apps/web/.next/static ] && cp -r --update=none app/apps/web/.next/static/. next/apps/web/.next/static/ || true
rm -rf prev && { [ -d app ] && mv app prev || true; } && mv next app
systemctl restart coldcall-web
sleep 4
[ "$API_RESTART" = 1 ] && systemctl restart coldcall-api || true
sleep 8
if ! curl -sf -o /dev/null "http://127.0.0.1:$WEB_PORT/" || ! curl -sf -o /dev/null "http://127.0.0.1:$API_PORT/api/health"; then
  echo "HEALTH CHECK FAILED, rolling back Cold Call"
  if [ -d prev ] && [ -n "$(ls -A prev 2>/dev/null)" ]; then
    rm -rf failed && mv app failed && mv prev app
    systemctl restart coldcall-web coldcall-api
  else
    echo "First release: nothing to roll back to. Cold Call stays down; Evens is not affected."
    systemctl stop coldcall-web coldcall-api || true
  fi
  exit 1
fi
systemctl is-active coldcall-api coldcall-web
echo "$REL" > "$ROOT/RELEASE"
R
curl -s -o /dev/null -w "site %{http_code}\n" "https://$DOMAIN/"
curl -s "https://$DOMAIN/api/health"; echo
