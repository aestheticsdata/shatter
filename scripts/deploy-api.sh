#!/usr/bin/env bash
# Deploy the shatter-api score service to ks-b: rsync server/, install production
# dependencies, reload the pm2 app, then healthcheck through the nginx proxy.
# The remote SQLite file lives in $REMOTE_APP_DIR/data and is never touched by rsync.
set -euo pipefail

REMOTE_USER_HOST="${REMOTE_USER_HOST:-debian@ks-b}"
REMOTE_APP_DIR="${REMOTE_APP_DIR:-/home/debian/apps/shatter-api}"
HEALTHCHECK_URL="${HEALTHCHECK_URL:-https://shatter.1991computer.com/api/scores}"

log() { printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$SCRIPT_DIR/../server"

if [[ ! -f "$SERVER_DIR/pnpm-lock.yaml" ]]; then
  log "❌ $SERVER_DIR/pnpm-lock.yaml is missing — run 'pnpm install --ignore-workspace' in server/ first"
  exit 1
fi

log "➡️  Uploading server/ to $REMOTE_USER_HOST:$REMOTE_APP_DIR"
ssh "$REMOTE_USER_HOST" "mkdir -p '$REMOTE_APP_DIR'"
rsync -az --delete --exclude node_modules --exclude data "$SERVER_DIR/" "$REMOTE_USER_HOST:$REMOTE_APP_DIR/"

# Non-interactive ssh does not source the login profile, so the standalone pnpm
# install dir (which also holds pm2) is missing from PATH on the remote.
REMOTE_PATH_PREFIX='export PATH="$HOME/.local/share/pnpm:$PATH";'

log "➡️  Installing production dependencies"
ssh "$REMOTE_USER_HOST" "$REMOTE_PATH_PREFIX cd '$REMOTE_APP_DIR' && pnpm install --prod --frozen-lockfile"

log "➡️  Reloading pm2 app"
ssh "$REMOTE_USER_HOST" "$REMOTE_PATH_PREFIX cd '$REMOTE_APP_DIR' && pm2 startOrReload ecosystem.config.cjs && pm2 save"

log "➡️  Healthcheck: $HEALTHCHECK_URL"
sleep 2
if curl -fsS --max-time 10 "$HEALTHCHECK_URL" | grep -q '"scores"'; then
  log "✅ shatter-api deployed and healthy"
else
  log "❌ Healthcheck failed — inspect with 'pm2 logs shatter-api' on $REMOTE_USER_HOST"
  exit 1
fi
