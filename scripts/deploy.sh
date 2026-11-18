#!/usr/bin/env bash
# Deploys the committed HEAD to the Evens server (ssh alias "evens", see ~/.ssh/config).
# Secrets live outside the code on the server: /opt/evens/config/{server,web}.env and /opt/evens/keys.
set -euo pipefail
cd "$(dirname "$0")/.."
git diff --quiet HEAD || echo "Note: uncommitted changes are not deployed (deploy ships HEAD)."
REL=$(git rev-parse --short HEAD)
echo "Deploying $REL"
# Restart the game server only when server or shared game code changed; web only releases never touch live games.
LAST=$(ssh evens "cat /opt/evens/RELEASE 2>/dev/null" || true)
API_RESTART=1
if [ -n "$LAST" ] && git cat-file -e "$LAST" 2>/dev/null; then
  git diff --quiet "$LAST" HEAD -- apps/server packages pnpm-lock.yaml && API_RESTART=0
fi
echo "Game server restart: $([ $API_RESTART = 1 ] && echo yes || echo no, web only)"
ssh evens "rm -rf /opt/evens/next && mkdir -p /opt/evens/next"
git archive HEAD | ssh evens "tar -x -C /opt/evens/next"
ssh evens "API_RESTART=$API_RESTART bash -s" <<R
set -e
cd /opt/evens
# Build the new release next to the live one (pnpm's shared store keeps the install fast).
# If anything fails here the live release is untouched.
ln -sf /opt/evens/config/server.env next/apps/server/.env
ln -sf /opt/evens/config/web.env next/apps/web/.env.production
chown -R evens:evens next
sudo -iu evens bash -lc "export COREPACK_ENABLE_DOWNLOAD_PROMPT=0; cd /opt/evens/next && pnpm install --frozen-lockfile >/dev/null"
# Build (one retry for network blips such as the Google Fonts download). Never go live without a finished build.
ok=0
for attempt in 1 2; do
  if sudo -iu evens bash -lc "cd /opt/evens/next/apps/web && EVENS_RELEASE=$REL-\$(date +%s) pnpm build > /tmp/evens-build.log 2>&1"; then ok=1; break; fi
  echo "build attempt \$attempt failed"; tail -15 /tmp/evens-build.log
done
if [ "\$ok" != 1 ] || [ ! -f next/apps/web/.next/BUILD_ID ]; then echo "BUILD FAILED, live site untouched"; exit 1; fi
grep -E "Compiled" /tmp/evens-build.log | tail -1
# Keep the previous build's code files so tabs still open on the old version keep working until they update.
[ -d app/apps/web/.next/static ] && cp -r --update=none app/apps/web/.next/static/. next/apps/web/.next/static/ || true
rm -rf prev && mv app prev && mv next app
# Web first (Caddy holds requests while it boots), then the API (games recover from the database, sockets reconnect).
systemctl restart evens-web
sleep 4
[ "$API_RESTART" = 1 ] && systemctl restart evens-api || true
sleep 8
# Health check; roll back automatically if the new release does not serve.
if ! curl -sf -o /dev/null http://127.0.0.1:3000/ || ! curl -sf -o /dev/null http://127.0.0.1:4000/api/health; then
  echo "HEALTH CHECK FAILED, rolling back"
  rm -rf failed && mv app failed && mv prev app
  systemctl restart evens-web evens-api
  exit 1
fi
systemctl is-active evens-api evens-web
echo "$REL" > /opt/evens/RELEASE
R
curl -s -o /dev/null -w "site %{http_code}\n" https://45-81-6-214.sslip.io/
curl -s https://45-81-6-214.sslip.io/api/health; echo
