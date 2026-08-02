#!/usr/bin/env sh
set -eu
. "$(dirname "$0")/_common.sh"

NEW_API_IMAGE=${1:-}
NEW_WEB_IMAGE=${2:-}
BACKUP_EVIDENCE=${3:-}
[ -n "$NEW_API_IMAGE" ] && [ -n "$NEW_WEB_IMAGE" ] && [ -n "$BACKUP_EVIDENCE" ] || {
  echo "Usage: $0 api-image@sha256:... web-image@sha256:... backups/verified.tar.age" >&2
  exit 2
}
for image in "$NEW_API_IMAGE" "$NEW_WEB_IMAGE"; do
  case "$image" in
    *@sha256:????????????????????????????????????????????????????????????????) ;;
    *) echo "Both images must be pinned by a full sha256 digest." >&2; exit 2 ;;
  esac
done

"$SCRIPT_DIR/verify-backup.sh" "$BACKUP_EVIDENCE"

PREVIOUS_API=$MEDIMESH_API_IMAGE
PREVIOUS_WEB=$MEDIMESH_WEB_IMAGE
sed -i.bak "s|^MEDIMESH_API_IMAGE=.*|MEDIMESH_API_IMAGE=${NEW_API_IMAGE}|" "$DEPLOY_DIR/.env"
sed -i.bak "s|^MEDIMESH_WEB_IMAGE=.*|MEDIMESH_WEB_IMAGE=${NEW_WEB_IMAGE}|" "$DEPLOY_DIR/.env"

if compose pull && compose up -d --remove-orphans && "$SCRIPT_DIR/healthcheck.sh"; then
  rm -f "$DEPLOY_DIR/.env.bak"
  echo "Application images updated successfully."
  exit 0
fi

echo "Update failed; rolling back to the previous images." >&2
sed -i "s|^MEDIMESH_API_IMAGE=.*|MEDIMESH_API_IMAGE=${PREVIOUS_API}|" "$DEPLOY_DIR/.env"
sed -i "s|^MEDIMESH_WEB_IMAGE=.*|MEDIMESH_WEB_IMAGE=${PREVIOUS_WEB}|" "$DEPLOY_DIR/.env"
compose pull
compose up -d --remove-orphans
"$SCRIPT_DIR/healthcheck.sh"
exit 1
