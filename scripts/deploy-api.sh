#!/usr/bin/env bash
# Deploy the shatter-api score service to ks-b: rsync server/, install production
# dependencies, reload the pm2 app, then healthcheck through the nginx proxy.
# The remote SQLite file lives in $REMOTE_APP_DIR/data and is never touched by rsync.
set -Eeuo pipefail

REMOTE_USER_HOST="${REMOTE_USER_HOST:-debian@ks-b}"
REMOTE_APP_DIR="${REMOTE_APP_DIR:-/home/debian/apps/shatter-api}"
HEALTHCHECK_URL="${HEALTHCHECK_URL:-https://shatter.1991computer.com/api/scores}"

# The branch a deploy is allowed to ship. The tree must be clean and level with it — see
# `require_clean_tree`.
DEPLOY_BRANCH="${DEPLOY_BRANCH:-master}"

log() { printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$SCRIPT_DIR/../server"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

######################################
# Reporting to Zeus (SHA-28)
######################################
# Ported from Spira's deploy scripts (SPI-52), themselves ported from Zeus's own — the recipe in
# Zeus/docs/reporting/README.md. Same functions as ../scripts/deploy.sh; only the role, the marker
# location and the error handling differ, because this script has no staging and no rollback.

# Shatter's slug in Zeus's port registry, and which half of it this script deploys.
ZEUS_APP_NAME="${ZEUS_APP_NAME:-shatter}"
ZEUS_ROLE="api"

# The two files **on ks-b** that may hold the ingest URL and the shared secret, in the order
# Zeus's API itself resolves them — see `read_setting` in `zeus_report`. Read there rather than
# carried on the laptop: the secret never travels, and the endpoint is loopback-only anyway.
ZEUS_ECOSYSTEM_FILE="${ZEUS_ECOSYSTEM_FILE:-/var/www/zeus/ecosystem.config.js}"
ZEUS_ENV_FILE="${ZEUS_ENV_FILE:-/var/www/zeus/nest-api/.env}"

# The last successfully deployed commit — the base of the next report's commit range. It lives in
# data/ because that is the one directory the rsync below is told to leave alone: an --exclude also
# protects the receiver from --delete, so the marker survives every deploy the way the SQLite file
# does.
ZEUS_MARKER="$REMOTE_APP_DIR/data/.zeus-last-$ZEUS_ROLE"

# Refuse to ship a tree that is not exactly what is on the remote branch.
#
# The rsync uploads whatever the working tree holds — not what is committed and not what is
# pushed. The report to Zeus, though, describes HEAD: its commit hash and its range of commit
# messages. A dirty or unpushed tree would make every one of those a lie, so the check is part of
# the reporting port, not an extra.
#
# Runs before any ssh or rsync: the whole point is to fail on the laptop, with nothing on the
# server touched.
require_clean_tree() {
  cd "$PROJECT_DIR"

  local dirty
  dirty=$(git status --porcelain)
  if [ -n "$dirty" ]; then
    echo "❌ ERROR: refusing to deploy — the working tree is not clean:" >&2
    printf '%s\n' "$dirty" >&2
    echo "   commit, stash or clean these first." >&2
    exit 1
  fi

  # Without a fetch, `origin/$DEPLOY_BRANCH` is whatever this laptop last heard — exactly the stale
  # value that lets a behind-by-one tree deploy. A failure here is fatal on purpose: a deploy needs
  # the network anyway, so "cannot reach the remote" is never the moment to guess.
  if ! git fetch --quiet origin "$DEPLOY_BRANCH"; then
    echo "❌ ERROR: refusing to deploy — could not fetch origin/$DEPLOY_BRANCH to compare against." >&2
    exit 1
  fi

  local head remote
  head=$(git rev-parse HEAD)
  remote=$(git rev-parse FETCH_HEAD)

  if [ "$head" != "$remote" ]; then
    echo "❌ ERROR: refusing to deploy — HEAD does not match origin/$DEPLOY_BRANCH:" >&2
    echo "   local  $head" >&2
    echo "   remote $remote" >&2
    echo "   pull, push or check out the right branch first." >&2
    exit 1
  fi
}

# The commit the previous deploy shipped — the base of this deploy's commit range.
#
# Order: the marker (steady state) → a `ZEUS_SINCE` override → empty, which the consumer reads as
# "no baseline, fall back to the last ten commits". Unlike the front there is no release-folder
# fallback, because this deploy keeps no releases on the server.
#
# Resolved **once, before anything writes**: `write_zeus_marker` moves the marker at the end of a
# successful deploy.
resolve_base_hash() {
  local base
  base=$(ssh "$REMOTE_USER_HOST" "cat '$ZEUS_MARKER' 2>/dev/null || true" 2>/dev/null || true)
  [ -z "$base" ] && base="${ZEUS_SINCE:-}"

  # A hash this checkout does not have is no baseline at all — a shallow clone, or a marker left by
  # a deploy from a branch since rewritten.
  if [ -n "$base" ] && ! git cat-file -e "${base}^{commit}" 2>/dev/null; then
    base=""
  fi

  printf '%s' "$base"
}

# The commits this deploy ships, as a JSON array, newest first.
#
# `ZEUS_BASE_HASH` is the commit the last deploy shipped; with none — a first report — the last ten
# commits stand in for a range nobody can reconstruct.
#
# Every message is escaped in awk rather than interpolated into a shell string. `%s` is the subject
# line only, so it cannot contain a newline, and splitting on the first two spaces is exact because
# neither a sha nor an ISO-8601 date contains one.
zeus_commits_json() {
  local -a range

  if [ "${ZEUS_REPORT_COMMITS:-true}" != "true" ]; then
    printf '[]'
    return 0
  fi

  if [ -n "${ZEUS_BASE_HASH:-}" ]; then
    range=("${ZEUS_BASE_HASH}..HEAD")
  else
    range=(-n 10 HEAD)
  fi

  git log --no-merges --pretty=format:'%H %aI %s' "${range[@]}" 2>/dev/null | awk '
    BEGIN { printf "["; first = 1 }
    NF >= 3 {
      sha = $1
      when = $2
      msg = substr($0, length(sha) + length(when) + 3)
      gsub(/\\/, "\\\\", msg)
      gsub(/"/, "\\\"", msg)
      gsub(/\t/, " ", msg)
      if (!first) printf ","
      printf "{\"sha\":\"%s\",\"authoredAt\":\"%s\",\"message\":\"%s\"}", sha, when, msg
      first = 0
    }
    END { printf "]" }'
}

# Escape a value for a JSON string literal.
#
# `zeus_commits_json` escapes commit messages in awk because it reads them a line at a time. Every
# *other* string in the payload is interpolated by hand below, and one
# `zeus_report "failed" "could not read \"x\""` away from posting malformed JSON. Zeus would answer
# 400, and since every error on this path is swallowed the report would vanish with no symptom.
#
# Backslash first: the reverse order would escape the backslashes this step adds. Commit subjects
# and git ref names cannot contain a newline, so tab is the only control character left to handle.
json_escape() {
  local s="$1"
  s=${s//\\/\\\\}
  s=${s//\"/\\\"}
  s=${s//$'\t'/ }
  printf '%s' "$s"
}

# Tell Zeus what this deploy did: `zeus_report <success|failed> [summary]`.
#
# Three rules, from `Zeus/docs/reporting/README.md`, and none of them is optional:
#   1. reporting must never fail the deploy — every step here is `|| true`, and the caller ignores
#      the return value too;
#   2. fire and forget, 2 second timeout, no retries;
#   3. the payload travels as a **file**, never interpolated into a shell command, because commit
#      messages contain quotes, backticks and `$`.
#
# The POST happens on ks-b over ssh rather than from here: the endpoint is loopback-only and nginx
# denies it from outside ks-b.
zeus_report() {
  local status="$1"
  local summary="${2:-}"
  local commits payload remote_payload duration

  commits=$(zeus_commits_json 2>/dev/null || echo "[]")
  duration=$(( ($(date +%s) - ${ZEUS_STARTED_EPOCH:-$(date +%s)}) * 1000 ))
  payload=$(mktemp)
  remote_payload="/tmp/.zeus-deploy-report.$$.json"

  {
    printf '{"app":"%s","role":"%s","status":"%s"' \
      "$(json_escape "$ZEUS_APP_NAME")" "$(json_escape "$ZEUS_ROLE")" "$(json_escape "$status")"
    printf ',"startedAt":"%s","durationMs":%s' "$(json_escape "${ZEUS_STARTED_AT}")" "$duration"
    [ -n "${ZEUS_COMMIT:-}" ] && printf ',"commit":"%s"' "$(json_escape "$ZEUS_COMMIT")"
    [ -n "${ZEUS_BRANCH:-}" ] && printf ',"branch":"%s"' "$(json_escape "$ZEUS_BRANCH")"
    [ -n "$summary" ] && printf ',"summary":"%s"' "$(json_escape "$summary")"
    printf ',"commits":%s}' "$commits"
  } > "$payload"

  scp -q "$payload" "$REMOTE_USER_HOST:$remote_payload" || { rm -f "$payload"; return 0; }
  rm -f "$payload"

  ssh "$REMOTE_USER_HOST" \
    ZEUS_ECOSYSTEM_FILE="$ZEUS_ECOSYSTEM_FILE" \
    ZEUS_ENV_FILE="$ZEUS_ENV_FILE" \
    PAYLOAD="$remote_payload" \
    'bash -s' << 'EOF' || true
set -uo pipefail

cleanup() { rm -f "$PAYLOAD"; }
trap cleanup EXIT

# One setting, looked for in the pm2 ecosystem file first and the `.env` second — the order Zeus's
# API itself resolves them. Neither value is ever defaulted here: a fallback URL would put Zeus's
# port in this repo's source, which is the one place a port reassignment cannot rewrite — and since
# every error below is swallowed, a stale default would fail quietly and forever.
#
# `\042` and `\047` are the double and single quote, so a value written either way is unwrapped
# without this needing quotes of its own inside a heredoc.
read_setting() {
  local key="$1" value=""

  if [ -f "$ZEUS_ECOSYSTEM_FILE" ]; then
    value=$(sed -n "s/.*${key}: *['\"]\([^'\"]*\)['\"].*/\1/p" "$ZEUS_ECOSYSTEM_FILE" 2>/dev/null | tail -1)
  fi

  if [ -z "$value" ] && [ -f "$ZEUS_ENV_FILE" ]; then
    value=$(sed -n "s/^${key}=//p" "$ZEUS_ENV_FILE" 2>/dev/null | tail -1 | tr -d '\042\047')
  fi

  printf '%s' "$value"
}

url=$(read_setting ZEUS_DEPLOY_INGEST_URL)
token=$(read_setting ZEUS_INGEST_TOKEN)

if [ -z "$url" ] || [ -z "$token" ]; then
  echo "zeus: not reported — ZEUS_DEPLOY_INGEST_URL or ZEUS_INGEST_TOKEN found in neither" \
    "$ZEUS_ECOSYSTEM_FILE nor $ZEUS_ENV_FILE"
  exit 0
fi

code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 2 \
  -X POST "$url" \
  -H 'content-type: application/json' \
  -H "authorization: Bearer $token" \
  --data-binary @"$PAYLOAD" || true)

# 202 is the contract. Anything else is worth one line in the deploy output and nothing more —
# a deploy that shipped and could not say so still shipped.
[ "$code" = "202" ] || echo "zeus: report not recorded (HTTP ${code:-none})"
EOF
}

# Move the marker to the commit this deploy just shipped. Only a hex hash travels, so inlining it
# in the ssh command is safe — everything else in the reporting path goes by file.
write_zeus_marker() {
  ssh "$REMOTE_USER_HOST" \
    "mkdir -p '$REMOTE_APP_DIR/data' && printf '%s\n' '$(git rev-parse HEAD)' > '$ZEUS_MARKER'"
}

######################################
# Deploy
######################################

cd "$PROJECT_DIR"

# Before any ssh or rsync — see the function itself for why this guards the report's honesty.
require_clean_tree

if [[ ! -f "$SERVER_DIR/pnpm-lock.yaml" ]]; then
  log "❌ $SERVER_DIR/pnpm-lock.yaml is missing — run 'pnpm install --ignore-workspace' in server/ first"
  exit 1
fi

# What the report to Zeus will carry (SHA-28), gathered before anything runs so that a deploy which
# fails at its very first step still reports something true.
ZEUS_STARTED_AT=$(date -u +%FT%TZ)
ZEUS_STARTED_EPOCH=$(date +%s)
ZEUS_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)
ZEUS_COMMIT=$(git rev-parse HEAD 2>/dev/null || true)
ZEUS_BASE_HASH=$(resolve_base_hash)

# This script has no staging and no rollback, so a failure is only ever `failed` — there is no
# previous release to restore, and pm2 keeps running whatever it ran before the reload step.
on_error() {
  local lineno="$1"
  log "❌ ERROR: API deployment failed at line $lineno"
  zeus_report "failed" "deploy failed at line $lineno" || true
}

trap 'on_error $LINENO' ERR

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
  trap - ERR
  write_zeus_marker || log "⚠️  Zeus marker not moved — the next report's commit range will overshoot (non-fatal)"
  zeus_report "success" || log "⚠️  Zeus was not told about this deploy (non-fatal)"
  log "✅ shatter-api deployed and healthy"
else
  log "❌ Healthcheck failed — inspect with 'pm2 logs shatter-api' on $REMOTE_USER_HOST"
  # A plain `exit 1` does not fire the ERR trap, so the report is explicit here. `failed`, not
  # `rolled_back`: this script has no rollback, and the code pm2 just reloaded is what is live.
  zeus_report "failed" "healthcheck failed after reload — the new code is live and not answering" || true
  exit 1
fi
