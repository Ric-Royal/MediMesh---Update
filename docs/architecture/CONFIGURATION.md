# Current Configuration

The supported local runtime is defined by the repository-root
`docker-compose.yml`. Generate ignored local secret files with
`scripts/Initialize-LocalSecrets.ps1` before starting the stack.

Only the web service is published to the host. The API, PostgreSQL, Redis,
object storage, and malware scanner remain on internal container networks.
Browser API calls use the same origin under `/api` and authenticate with an
HttpOnly cookie plus an anti-CSRF header for state-changing requests.

Production uses `deployment/compose.prod.yml` and requires:

- HTTPS ingress and HTTPS-only allowed origins;
- TLS-enabled PostgreSQL, Redis, and S3-compatible object storage;
- secret files for database, cache, object storage, session signing, MFA,
  file encryption, payment callbacks, and initial administrator bootstrap;
- mandatory MFA, short sessions, fail-closed auditing, and disabled runtime
  schema mutation; and
- independently managed backups, recovery testing, monitoring, and incident
  response.

See `SECURITY_IMPLEMENTATION_2026-07-24.md` for the full control and
deployment checklist.
