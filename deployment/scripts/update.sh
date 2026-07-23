#!/usr/bin/env sh
set -eu
. "$(dirname "$0")/_common.sh"

NEW_VERSION=${1:-}
[ -n "$NEW_VERSION" ] || { echo "Usage: $0 1.0.1" >&2; exit 2; }
case "$NEW_VERSION" in *[!0-9A-Za-z._-]*) echo "Invalid version." >&2; exit 2 ;; esac

PREVIOUS_API=$MEDIMESH_API_IMAGE
PREVIOUS_WEB=$MEDIMESH_WEB_IMAGE
"$SCRIPT_DIR/backup.sh"

API_REPOSITORY=${MEDIMESH_API_IMAGE%:*}
WEB_REPOSITORY=${MEDIMESH_WEB_IMAGE%:*}
sed -i.bak "s|^MEDIMESH_API_IMAGE=.*|MEDIMESH_API_IMAGE=${API_REPOSITORY}:${NEW_VERSION}|" "$DEPLOY_DIR/.env"
sed -i.bak "s|^MEDIMESH_WEB_IMAGE=.*|MEDIMESH_WEB_IMAGE=${WEB_REPOSITORY}:${NEW_VERSION}|" "$DEPLOY_DIR/.env"

if compose pull && compose up -d --remove-orphans && "$SCRIPT_DIR/healthcheck.sh"; then
  rm -f "$DEPLOY_DIR/.env.bak"
  echo "MediMesh updated to $NEW_VERSION"
  exit 0
fi

echo "Update failed; rolling back to the previous images." >&2
sed -i "s|^MEDIMESH_API_IMAGE=.*|MEDIMESH_API_IMAGE=${PREVIOUS_API}|" "$DEPLOY_DIR/.env"
sed -i "s|^MEDIMESH_WEB_IMAGE=.*|MEDIMESH_WEB_IMAGE=${PREVIOUS_WEB}|" "$DEPLOY_DIR/.env"
compose pull
compose up -d --remove-orphans
"$SCRIPT_DIR/healthcheck.sh"
exit 1
