# MediMesh production operations guide

Version: 1.0.0-rc.1
Audience: deployment administrators, security teams, managed-service operators

This guide describes one isolated MediMesh deployment for one clinic/hospital. Do not place unrelated facilities in the same database unless a reviewed multi-tenant architecture, legal basis, isolation model, and migration plan have been implemented.

## 1. Release architecture

The production package in `deployment/` runs:

- Traefik as the only internet-facing service on TCP 80/443;
- the versioned MediMesh web image behind automatic HTTPS;
- the versioned MediMesh API on the private Docker network;
- PostgreSQL, Redis, and MinIO with no host-published ports;
- Docker file secrets rather than credentials embedded in Compose or images;
- named volumes for database, object storage, cache, and ACME state.

The frontend proxies same-origin `/api` and `/socket.io` traffic to the API. Browser and intermediary caching is disabled for API responses. HSTS, CSP, anti-framing, referrer, MIME, and permissions headers are emitted by the web tier.

## 2. Host prerequisites

Use a supported, patched Linux server dedicated to the facility deployment. Minimum starting point for a small clinic is 4 vCPU, 8 GB RAM, encrypted storage, and separately monitored backup capacity; size from measured workload for larger hospitals.

Install:

- Docker Engine with the Compose v2 plugin;
- OpenSSL, `curl`, `tar`, and `sha256sum`;
- an OS firewall allowing inbound 22 from the management network and 80/443 from approved sources;
- endpoint monitoring, time synchronization, disk monitoring, and centralized protected logs.

Do not expose Docker’s API over TCP. Membership in the `docker` group is equivalent to host root and must be tightly controlled.

## 3. DNS and live TLS

1. Allocate a facility-owned name such as `medimesh.clinic.example.ke`.
2. Create an A/AAAA record pointing to the server/public load balancer.
3. Confirm inbound TCP 80 and 443 reach Traefik. Port 80 is used for ACME HTTP challenge and redirects to HTTPS.
4. Copy `deployment/.env.example` to `deployment/.env` and set `DOMAIN` and `TLS_EMAIL`.
5. After installation, verify the certificate chain, hostname, expiry, TLS protocol/cipher policy, HSTS response, redirect, and renewal. Use an approved external TLS scanner from outside the facility network.
6. If a corporate reverse proxy terminates TLS instead, remove the duplicate public listener only after documenting trusted-proxy headers, certificate ownership, renewal monitoring, and the private encrypted/plaintext hop decision.

The repository cannot complete live DNS, issue a certificate, or prove renewal without control of the target domain and deployment host. These are release-owner actions, not code flags.

## 4. Image and environment preparation

Every image in `.env` must be pinned to a tested release tag or, preferably, an immutable digest. Do not deploy `latest`.

```sh
cd deployment
cp .env.example .env
vi .env
```

Set unique `COMPOSE_PROJECT_NAME` values if multiple isolated instances share a host. Review `MEDIMESH_API_IMAGE`, `MEDIMESH_WEB_IMAGE`, and infrastructure images against the signed release/SBOM and vulnerability acceptance record.

## 5. Secrets and key management

Generate local secrets:

```sh
sh scripts/generate-secrets.sh
```

The generator uses restrictive permissions and does not replace existing non-empty keys. Move offline recovery copies of these values into an approved organizational password/key vault:

- `backup_passphrase`: decrypts every backup made with it;
- `mfa_encryption_key`: decrypts enrolled TOTP seeds;
- `jwt_secret`: signs sessions;
- database, Redis, and MinIO credentials;
- M-Pesa credentials and callback token.

Key rules:

- Never commit `deployment/.env`, `deployment/secrets`, backup files, real certificates, or provider credentials.
- Restrict host access to the deployment administrator/service account.
- Separate backup media from the application host and apply retention/immutability controls.
- Record key owner, purpose, creation date, rotation date, escrow location, and tested recovery procedure.
- Rotate JWT/database/storage keys during a planned maintenance window and expect session revocation.
- Rotating `mfa_encryption_key` requires a controlled re-encryption migration. Replacing it without migration forces MFA reset for every account.
- Remove or replace the bootstrap administrator secret after the first verified administrator has changed the password, enrolled MFA, and a second recovery administrator exists.

For production M-Pesa, replace the four empty `mpesa_*` credential files with Daraja production values. Keep `mpesa_callback_token` random.

## 6. Install

From the repository’s `deployment` directory:

```sh
sh scripts/install.sh
```

The installer validates configuration, generates missing secrets, pulls prebuilt images, starts the stack, waits for HTTPS health, and prints service state. It does not build source on the clinic server.

First-login checklist:

1. Read the bootstrap password directly from the protected host secret file.
2. Sign in over the final HTTPS name.
3. Change the temporary password.
4. Enroll MFA.
5. Create a second named administrator and enroll that account.
6. Configure facility name, departments, clinics, wards, users, catalogs, prices, and stock.
7. Test with non-patient training data before go-live.

## 7. M-Pesa production activation

Before changing `MPESA_ENVIRONMENT=production`:

1. Obtain approved production shortcode/till, passkey, consumer key, and consumer secret from Safaricom/Daraja.
2. Put them in the matching secret files; never in `.env` or screenshots.
3. Ensure the callback address is `https://<DOMAIN>/api/payments/mpesa/callback`. MediMesh adds its random callback token.
4. Confirm Safaricom can reach it from the public internet and that invalid/missing callback tokens are rejected.
5. Run test payments for success, decline, timeout, 60-second resend, late original callback, duplicate callback, partial payment, already-paid invoice, and reconciliation outage.
6. Reconcile MediMesh receipts/amounts/phone numbers against the M-Pesa portal/report.
7. Define cashier and finance handling for unapplied patient credit caused by two late-confirmed attempts.

Only the authenticated callback settles a payment. An STK request, browser message, patient SMS, or status query alone does not mark the invoice paid.

## 8. Backups and validation

Create and immediately validate an encrypted backup:

```sh
sh scripts/backup.sh
```

The script:

1. produces a PostgreSQL custom-format dump;
2. archives the MinIO object volume;
3. adds deployment configuration and a plaintext manifest inside the encrypted archive;
4. encrypts with AES-256 and PBKDF2;
5. creates an external SHA-256 checksum;
6. decrypts to temporary storage and verifies the checksum, PostgreSQL restore catalog, and object archive.

Copy the `.enc` and `.enc.sha256` files to encrypted off-host storage. A passing structural validation is necessary but not sufficient: schedule full restore drills into an isolated non-production instance and verify representative patient records/files, users, catalogs, invoices, audit events, and workflow counts.

Suggested policy must be set by the facility’s risk assessment: frequent automated backups, daily off-host copy, immutable retention, monthly restore drill, and documented recovery time/recovery point objectives.

Manual verification:

```sh
sh scripts/verify-backup.sh backups/medimesh-YYYYMMDDTHHMMSSZ.tar.enc
```

## 9. Restore

Restore replaces the current database and MinIO object volume. Confirm the exact backup, change approval, downtime notice, and rollback copy first.

```sh
sh scripts/restore.sh backups/medimesh-YYYYMMDDTHHMMSSZ.tar.enc --confirm-destroy-current-data
```

The script validates the backup before stopping the application, restores PostgreSQL and object storage, restarts services, and requires the HTTPS health check to pass. Afterward, perform clinical/application-level verification and document the restore outcome.

## 10. Update and rollback

Release tags build multi-architecture GHCR images with SBOM and provenance attestations. After reviewing the release, execute:

```sh
sh scripts/update.sh 1.0.1
```

The updater creates and validates a backup, changes both MediMesh image tags, pulls, restarts, and checks HTTPS. If the check fails it restores the prior image references and restarts them. Database migrations still require release-specific rollback review: an image rollback cannot undo a destructive schema migration.

Never update several facilities simultaneously. Use a pilot instance, observe, then roll forward in controlled waves.

## 11. Health and monitoring

Run:

```sh
sh scripts/healthcheck.sh
```

Monitor at minimum:

- external HTTPS availability and certificate expiry;
- API and container health/restart count;
- host CPU, memory, disk/inodes, filesystem latency, and clock drift;
- PostgreSQL connections, size, slow queries, backup age, replication if configured;
- MinIO capacity and object errors;
- Redis health;
- authentication failures, MFA resets, role/user changes, exports, and access anomalies;
- M-Pesa callback failures, pending/failed attempts, duplicates, and unapplied credit;
- queue age, stuck in-service/deferred encounters, unreviewed diagnostics, invoice imbalance;
- dependency/container vulnerability alerts.

Logs can contain identifiers even when bodies and callback query strings are excluded. Protect, minimize, retain, and dispose of them under the facility policy.

## 12. Security testing and penetration test gate

CI performs application tests, production dependency audit, CodeQL, secret scanning, container vulnerability scanning, Compose validation, SBOM generation, and build provenance. These controls do not equal an independent penetration test.

Before commercial live use, commission an authorized test against a staging copy that contains synthetic data and matches production controls. Scope:

- authentication, MFA enrollment/reset, session revocation, brute-force/rate limits;
- horizontal/vertical authorization for every role and object identifier;
- patient search, records, file upload/download/preview, exports, audit log access;
- queue/encounter state manipulation and concurrency;
- invoice/payment tampering, replay, duplicate/late M-Pesa callbacks, webhook authentication;
- SSRF, injection, XSS, CSRF assumptions, request smuggling, path traversal, unsafe file content;
- WebSocket authentication/authorization and cross-origin behavior;
- reverse proxy/TLS/security headers and host-header handling;
- Docker host, image, secret, volume, backup, restore, network, and management-plane controls;
- business-logic abuse by receptionist, clinician, technician, pharmacist, cashier, and administrator accounts.

Require a signed report, severity model, evidence, retest of fixes, and formal risk acceptance for unresolved findings. Do not test Safaricom or another third party outside written authorization.

## 13. Incident and downtime response

Maintain facility-approved runbooks for security incident, unavailable system, unavailable M-Pesa, wrong-patient documentation, lost device/account, ransomware, backup failure, and data breach.

Immediate priorities are patient safety, containment, evidence preservation, executive/privacy/security notification, and accurate downtime records. Do not delete suspicious accounts, logs, or transactions before evidence preservation. Recovery is complete only after integrity, access, workflows, payments, files, and audit visibility are verified.

## 14. Go-live acceptance checklist

- DNS, public HTTPS, renewal, external TLS scan, and firewall are verified.
- Immutable images, SBOM, provenance, vulnerability results, and release notes are approved.
- Secrets are unique, vaulted, recoverable, and absent from Git/logs/tickets.
- MFA is required and enrolled for every live user; two recovery administrators exist.
- Role matrix and least-privilege review are signed off.
- Departments, catalogs, capacity, prices, stock, and workflow names are approved.
- Repeated doctor–lab/radiology–doctor loops and all other patient journeys pass frontend acceptance.
- M-Pesa success/decline/timeout/retry/late-callback/reconciliation tests pass if enabled.
- Encrypted off-host backup and isolated restore drill pass.
- Monitoring, alert ownership, downtime, incident, and support escalation are active.
- Independent penetration test and retest are accepted.
- Privacy impact, data processing agreements, retention, patient rights, and applicable Kenyan health/digital-health approvals are complete.

Until every external gate is signed, the build is a release candidate—not proof of certification or permission to process live patient data.
