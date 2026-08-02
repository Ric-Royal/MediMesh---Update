#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
DEPLOY_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)

require_file() {
  if [ ! -f "$1" ]; then
    echo "Required file missing: $1" >&2
    exit 1
  fi
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Required command is not installed: $1" >&2
    exit 1
  fi
}

require_file "$DEPLOY_DIR/.env"
set -a
# shellcheck disable=SC1091
. "$DEPLOY_DIR/.env"
set +a

compose() {
  docker compose --env-file "$DEPLOY_DIR/.env" -f "$DEPLOY_DIR/compose.prod.yml" "$@"
}
