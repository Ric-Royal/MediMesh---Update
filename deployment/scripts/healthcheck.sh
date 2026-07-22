#!/usr/bin/env sh
set -eu
. "$(dirname "$0")/_common.sh"

require_command curl
attempt=1
while [ "$attempt" -le 30 ]; do
  if curl --fail --silent --show-error --max-time 10 "https://${DOMAIN}/health" >/dev/null; then
    echo "MediMesh is healthy at https://${DOMAIN}"
    compose ps
    exit 0
  fi
  attempt=$((attempt + 1))
  sleep 2
done

echo "Health check failed for https://${DOMAIN}" >&2
compose ps >&2
exit 1
