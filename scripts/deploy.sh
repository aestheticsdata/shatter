#!/usr/bin/env bash
set -Eeuo pipefail

######################################
# Configuration
######################################
REMOTE_USER_HOST="${REMOTE_USER_HOST:-debian@ks-b}"
WEB_ROOT_BASE="${WEB_ROOT_BASE:-/var/www/1991computer/shatter}"
CURRENT_DIR="$WEB_ROOT_BASE"
BACKUP_DIR="${BACKUP_DIR:-${WEB_ROOT_BASE}.bak}"
RELEASES_DIR="$WEB_ROOT_BASE/releases"
HEALTHCHECK_URL="${HEALTHCHECK_URL:-https://shatter.1991computer.com/}"
EXPECTED_HTML_MARKER="${EXPECTED_HTML_MARKER:-SHATTER}"
MAX_RELEASES_TO_KEEP="${MAX_RELEASES_TO_KEEP:-20}"
BUILD_BASE_PATH="${BUILD_BASE_PATH:-./}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

######################################
# Utility
######################################
log() {
  echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*"
}

require_command() {
  local command_name="$1"
  command -v "$command_name" >/dev/null 2>&1 || {
    echo "❌ ERROR: Missing required command '$command_name'" >&2
    exit 1
  }
}

prepare_local_build() {
  log "➡️  Installing dependencies"
  cd "$PROJECT_DIR"
  pnpm install --frozen-lockfile

  log "➡️  Building production assets with base path: $BUILD_BASE_PATH"
  pnpm exec vite build --base="$BUILD_BASE_PATH"

  if [ ! -f "$PROJECT_DIR/dist/index.html" ]; then
    echo "❌ ERROR: dist/index.html is missing after build" >&2
    exit 1
  fi

  local expected_asset_prefix
  if [ "$BUILD_BASE_PATH" = "./" ]; then
    expected_asset_prefix="./assets/"
  else
    expected_asset_prefix="${BUILD_BASE_PATH}assets/"
  fi

  if ! grep -Fq "$expected_asset_prefix" "$PROJECT_DIR/dist/index.html"; then
    echo "❌ ERROR: dist/index.html does not contain the expected asset prefix: $expected_asset_prefix" >&2
    exit 1
  fi

}

write_release_metadata() {
  local release_name="$1"
  local git_hash="$2"
  local git_branch="$3"
  local timestamp="$4"

  cat > "$PROJECT_DIR/dist/release.json" <<__META__
{
  "release": "$release_name",
  "gitHash": "$git_hash",
  "gitBranch": "$git_branch",
  "builtAt": "$timestamp"
}
__META__
}

remote_prepare_staging() {
  local staging_dir="$1"

  ssh "$REMOTE_USER_HOST" RELEASES_DIR="$RELEASES_DIR" STAGING_DIR="$staging_dir" 'bash -s' <<'__REMOTE_PREPARE__'
set -Eeuo pipefail

mkdir -p "$RELEASES_DIR"
rm -rf "$STAGING_DIR"
mkdir -p "$STAGING_DIR"
__REMOTE_PREPARE__
}

remote_activate_from_dir() {
  local source_dir="$1"

  ssh "$REMOTE_USER_HOST" \
    WEB_ROOT_BASE="$WEB_ROOT_BASE" \
    CURRENT_DIR="$CURRENT_DIR" \
    BACKUP_DIR="$BACKUP_DIR" \
    SOURCE_DIR="$source_dir" \
    'bash -s' <<'__REMOTE_ACTIVATE__'
set -Eeuo pipefail

if [ ! -d "$SOURCE_DIR" ]; then
  echo "❌ ERROR: Source directory does not exist: $SOURCE_DIR" >&2
  exit 1
fi

ACTIVATION_SOURCE_DIR="$(dirname "$CURRENT_DIR")/.activation_source_$(date +%s%N)"
rm -rf "$ACTIVATION_SOURCE_DIR"
mkdir -p "$ACTIVATION_SOURCE_DIR"
trap 'rm -rf "$ACTIVATION_SOURCE_DIR"' EXIT

# Copy the release outside the live directory first so the switch can
# manipulate the live tree safely without invalidating the source path.
cp -a "$SOURCE_DIR"/. "$ACTIVATION_SOURCE_DIR"/

mkdir -p "$CURRENT_DIR"
mkdir -p "$(dirname "$BACKUP_DIR")"
rm -rf "$BACKUP_DIR"
mkdir -p "$BACKUP_DIR"

cd "$WEB_ROOT_BASE"

TMP_RELEASES_DIR="$WEB_ROOT_BASE/.releases_tmp_switch"
if [ -d "$CURRENT_DIR/releases" ]; then
  rm -rf "$TMP_RELEASES_DIR"
  mv "$CURRENT_DIR/releases" "$TMP_RELEASES_DIR"
fi

cd "$CURRENT_DIR"
shopt -s dotglob
if compgen -G "*" > /dev/null; then
  mv * "$BACKUP_DIR"/ 2>/dev/null || true
fi
shopt -u dotglob

if [ -d "$TMP_RELEASES_DIR" ]; then
  mv "$TMP_RELEASES_DIR" "$CURRENT_DIR/releases"
fi

cp -a "$ACTIVATION_SOURCE_DIR"/. "$CURRENT_DIR"/
__REMOTE_ACTIVATE__
}

remote_rollback_backup() {
  ssh "$REMOTE_USER_HOST" \
    WEB_ROOT_BASE="$WEB_ROOT_BASE" \
    CURRENT_DIR="$CURRENT_DIR" \
    BACKUP_DIR="$BACKUP_DIR" \
    'bash -s' <<'__REMOTE_ROLLBACK__'
set -Eeuo pipefail

if [ ! -d "$BACKUP_DIR" ]; then
  echo "❌ ERROR: No backup directory found at $BACKUP_DIR" >&2
  exit 1
fi

mkdir -p "$CURRENT_DIR"
cd "$WEB_ROOT_BASE"

TMP_RELEASES_DIR="$WEB_ROOT_BASE/.releases_tmp_rollback"
if [ -d "$CURRENT_DIR/releases" ]; then
  rm -rf "$TMP_RELEASES_DIR"
  mv "$CURRENT_DIR/releases" "$TMP_RELEASES_DIR"
fi

cd "$CURRENT_DIR"
shopt -s dotglob
if compgen -G "*" > /dev/null; then
  rm -rf * 2>/dev/null || true
fi
shopt -u dotglob

if [ -d "$TMP_RELEASES_DIR" ]; then
  mv "$TMP_RELEASES_DIR" "$CURRENT_DIR/releases"
fi

shopt -s dotglob
if compgen -G "$BACKUP_DIR/*" > /dev/null; then
  mv "$BACKUP_DIR"/* "$CURRENT_DIR"/ 2>/dev/null || true
fi
shopt -u dotglob

rm -rf "$BACKUP_DIR"
__REMOTE_ROLLBACK__
}

remote_prune_releases() {
  ssh "$REMOTE_USER_HOST" RELEASES_DIR="$RELEASES_DIR" MAX_KEEP="$MAX_RELEASES_TO_KEEP" 'bash -s' <<'__REMOTE_PRUNE__'
set -Eeuo pipefail

if [ ! -d "$RELEASES_DIR" ]; then
  exit 0
fi

release_count="$(find "$RELEASES_DIR" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')"
if [ "$release_count" -le "$MAX_KEEP" ]; then
  exit 0
fi

to_delete=$((release_count - MAX_KEEP))
find "$RELEASES_DIR" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort | head -n "$to_delete" | while IFS= read -r release_name; do
  rm -rf "$RELEASES_DIR/$release_name"
done
__REMOTE_PRUNE__
}

run_healthcheck() {
  local mode="${1:-strict}"

  require_command curl

  local response
  response="$(curl -fsSL --max-time 15 "$HEALTHCHECK_URL")"

  if [ "$mode" = "status-only" ]; then
    return 0
  fi

  if ! grep -Fq "$EXPECTED_HTML_MARKER" <<< "$response"; then
    echo "❌ ERROR: Healthcheck marker not found: $EXPECTED_HTML_MARKER" >&2
    exit 1
  fi

  if ! grep -Eq '(\./assets/|/assets/)' <<< "$response"; then
    echo "❌ ERROR: Healthcheck HTML does not reference any expected asset path" >&2
    exit 1
  fi

  local origin
  origin="$(sed -E 's#^(https?://[^/]+).*$#\1#' <<< "$HEALTHCHECK_URL")"

  local asset_urls=()
  while IFS= read -r asset_url; do
    asset_urls+=("$asset_url")
  done < <(grep -oE '(src|href)="[^"]+\.(js|css)"' <<< "$response" | sed -E 's/^(src|href)="(.*)"$/\2/' | sort -u)

  if [ "${#asset_urls[@]}" -eq 0 ]; then
    echo "❌ ERROR: Healthcheck could not find any JS/CSS asset URLs in HTML" >&2
    exit 1
  fi

  local asset_url
  for asset_url in "${asset_urls[@]}"; do
    local asset_full_url
    case "$asset_url" in
      http://*|https://*)
        asset_full_url="$asset_url"
        ;;
      /*)
        asset_full_url="$origin$asset_url"
        ;;
      ./*)
        asset_full_url="${HEALTHCHECK_URL%/}/${asset_url#./}"
        ;;
      *)
        asset_full_url="${HEALTHCHECK_URL%/}/$asset_url"
        ;;
    esac

    curl -fsSL --max-time 15 -o /dev/null "$asset_full_url"
  done
}

list_releases() {
  log "➡️  Remote release list"
  ssh "$REMOTE_USER_HOST" RELEASES_DIR="$RELEASES_DIR" 'bash -s' <<'__REMOTE_LIST__'
set -Eeuo pipefail

if [ ! -d "$RELEASES_DIR" ]; then
  echo "No releases directory: $RELEASES_DIR"
  exit 0
fi

find "$RELEASES_DIR" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort -r
__REMOTE_LIST__
}

deploy() {
  require_command git
  require_command pnpm
  require_command ssh
  require_command rsync

  cd "$PROJECT_DIR"

  local git_hash
  git_hash="$(git rev-parse --short HEAD 2>/dev/null || echo no-git)"

  local git_branch_raw
  git_branch_raw="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo no-branch)"

  local git_branch
  git_branch="${git_branch_raw//\//-}"
  git_branch="${git_branch// /_}"

  local timestamp
  timestamp="$(date +'%Y%m%d-%H%M%S')"

  local release_name="release-${timestamp}-${git_branch}-${git_hash}"
  local staging_dir="$RELEASES_DIR/$release_name"
  local switch_done="false"

  on_error() {
    local lineno="$1"
    log "❌ ERROR: Deployment failed at line $lineno"

    if [[ "$switch_done" == "true" ]]; then
      log "↩️  Auto rollback to previous live version"
      if remote_rollback_backup; then
        log "✅ Auto rollback succeeded"
      else
        log "❌ Auto rollback failed, manual intervention required"
      fi
    else
      log "ℹ️  No rollback needed (live version was not switched)"
    fi
  }

  trap 'on_error $LINENO' ERR

  prepare_local_build
  write_release_metadata "$release_name" "$git_hash" "$git_branch" "$timestamp"

  log "➡️  Preparing remote staging directory: $staging_dir"
  remote_prepare_staging "$staging_dir"

  log "➡️  Uploading dist/ to remote staging"
  rsync -az --delete "$PROJECT_DIR/dist/" "$REMOTE_USER_HOST:$staging_dir/"

  log "➡️  Activating release"
  switch_done="true"
  remote_activate_from_dir "$staging_dir"

  log "➡️  Running healthcheck: $HEALTHCHECK_URL"
  run_healthcheck strict

  log "➡️  Pruning old releases (keep: $MAX_RELEASES_TO_KEEP)"
  remote_prune_releases

  trap - ERR

  log "✅ Deployment completed: $release_name"
  log "ℹ️  Current live directory: $CURRENT_DIR"
  log "ℹ️  Backup available at: $BACKUP_DIR"
  log "ℹ️  Releases directory: $RELEASES_DIR"
}

rollback() {
  log "↩️  Manual rollback to backup version"
  remote_rollback_backup
  log "➡️  Running healthcheck: $HEALTHCHECK_URL"
  run_healthcheck status-only
  log "✅ Rollback completed"
}

rollback_to_release() {
  local release_name="${1:-}"

  if [ -z "$release_name" ]; then
    echo "Usage: $0 rollback-to <release_name>" >&2
    exit 1
  fi

  local release_dir="$RELEASES_DIR/$release_name"

  log "↩️  Manual rollback to release: $release_name"
  remote_activate_from_dir "$release_dir"
  log "➡️  Running healthcheck: $HEALTHCHECK_URL"
  run_healthcheck status-only
  log "✅ Rollback-to-release completed"
}

######################################
# Entry point
######################################
ACTION="${1:-deploy}"

case "$ACTION" in
  deploy)
    deploy
    ;;
  rollback)
    rollback
    ;;
  rollback-to)
    rollback_to_release "${2:-}"
    ;;
  list-releases)
    list_releases
    ;;
  *)
    echo "Usage: $0 [deploy|rollback|rollback-to <release_name>|list-releases]" >&2
    exit 1
    ;;
esac
