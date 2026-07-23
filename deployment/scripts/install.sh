#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
DEPLOY_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)

for command in docker openssl curl; do
  command -v "$command" >/dev/null 2>&1 || { echo "$command is required." >&2; exit 1; }
done
docker compose version >/dev/null

if [ ! -f "$DEPLOY_DIR/.env" ]; then
  cp "$DEPLOY_DIR/.env.example" "$DEPLOY_DIR/.env"
  echo "Created $DEPLOY_DIR/.env. Set DOMAIN, TLS_EMAIL and immutable image tags, then run this command again." >&2
  exit 2
fi

"$SCRIPT_DIR/generate-secrets.sh"
. "$SCRIPT_DIR/_common.sh"

case "$DOMAIN" in
  clinic.example.org|'') echo "Set a real DOMAIN in $DEPLOY_DIR/.env" >&2; exit 2 ;;
esac

compose config --quiet
compose pull
compose up -d --remove-orphans
"$SCRIPT_DIR/healthcheck.sh"

echo "Installation complete. Retrieve the bootstrap password from deployment/secrets/bootstrap_admin_password, sign in, change it, and enroll MFA immediately."
