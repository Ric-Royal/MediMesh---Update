# Kenyan Health Data Security Implementation

Date: 24 July 2026

This implementation addresses the technical findings in
`SECURITY_KENYA_HEALTH_DATA_REVIEW_2026-07-23.md`. It is a security hardening
record, not legal advice, a Data Protection Impact Assessment, an independent
penetration test, or regulatory certification.

## Implemented controls

### Identity and session security

- Removed shared demo accounts and predictable source-controlled credentials.
- Bootstrap creates only an explicitly configured administrator, with a
  generated password supplied through an ignored runtime-secret file.
- Local authentication uses a short-lived, HttpOnly, same-site cookie.
- Browser-readable bearer tokens are not returned by the login endpoint or
  stored in browser local storage.
- State-changing cookie-authenticated requests require a double-submit
  anti-CSRF token.
- Password changes, role changes, account status changes, MFA changes, and
  logout revoke prior sessions.
- MFA secrets use AES-256-GCM and TOTP counters cannot be replayed.
- Login throttling is keyed by both normalized account name and source address.
- Production startup fails if MFA, TLS endpoints, strong secrets, short
  sessions, encrypted file storage, or fail-closed auditing are absent.

### Clinical access control

- Patient access is evaluated against role, department, direct encounter, or
  active care relationship.
- Reception access is limited to registration demographics and workflows.
- Clinical writes require an active linked staff identity and, for care
  providers, current professional licence information.
- Emergency access is limited to clinical roles, requires a recorded reason,
  and emits a dedicated audit event.
- Patient, encounter, appointment, schedule, ward, medical-record,
  consultation, laboratory, radiology, pharmacy, file, queue, billing,
  dashboard, and staff routes now enforce resource-level authorization.
- Clinical orders derive provider identity and prices from server-side records;
  client-supplied provider identities and prices are ignored.
- Encounter/queue creation, consultations, orders, clinical records, invoices,
  and related actions use database transactions so partial clinical,
  operational, or financial writes roll back.

### Auditability and record integrity

- Every authenticated request produces a structured database audit event with
  user, role, action, resource, patient context, purpose, emergency-access
  context, source address, response status, and timestamp.
- Audit rows form a SHA-256 hash chain and database triggers reject changes or
  deletion.
- Clinical change history is append-only. Report amendments create versions
  instead of silently replacing the prior clinical statement.
- Patient, medical-record, and file deletion is replaced with reasoned
  archiving. Database triggers reject hard deletion of retained health data.
- Audit and archive controls use a twenty-year minimum retention marker.

### File, export, and logging security

- Uploads are limited in number and size, tied to an authorized patient or
  record, checked by magic bytes, and scanned by ClamAV before availability.
- Files are always private, encrypted with AES-256-GCM before object storage,
  served as attachments, and stored under randomized object keys.
- The object-storage application account has no delete permission.
- CSV exports neutralize spreadsheet formulas and require a stated purpose.
- Logs redact credentials, tokens, cookies, clinical values, and request query
  strings; production error responses do not disclose dependency details or
  stack traces.

### Deployment and supply-chain security

- Runtime secrets are generated outside version control and mounted as files.
- The database application role is not a superuser and has no schema-creation
  or retained-record deletion privileges.
- PostgreSQL, Redis, object storage, malware scanning, Node.js, and web-server
  images are pinned by immutable digest; release API and web images are
  rejected unless they are also digest-pinned.
- Internal services are isolated from the host network; only the web service is
  published in the local preview.
- Containers run without new privileges and application containers run
  unprivileged with resource limits.
- Production configuration requires externally managed TLS-enabled PostgreSQL,
  Redis, object storage, and HTTPS ingress.

## Kenyan legal and regulatory alignment

The code controls support, but do not by themselves complete, these obligations:

- The [Data Protection Act, 2019](https://new.kenyalaw.org/akn/ke/act/2019/24/eng@2019-11-15),
  including safeguards for sensitive health data and processing under the
  responsibility of a healthcare provider or person owing professional
  secrecy.
- The [Health Act, 2017](https://new.kenyalaw.org/akn/ke/act/2017/21/eng@2022-12-31),
  including confidentiality, privacy, and secure health-information handling.
- The [Digital Health Act, 2023](https://new.kenyalaw.org/akn/ke/act/2023/15/eng@2023-11-24),
  including privacy, confidentiality, security, lifecycle governance, and safe
  transfer of identifiable health data.
- The [Digital Health (Health Information Management Procedures) Regulations,
  2025](https://new.kenyalaw.org/akn/ke/act/ln/2025/76/eng@2025-04-11),
  including authorization, retention, data sharing, DPIA evidence, controller
  registration, and digital-solution certification.
- The [Digital Health (Data Exchange Component) Regulations,
  2025](https://new.kenyalaw.org/akn/ke/act/ln/2025/77/eng@2025-04-11),
  including auditable access and secure health-data exchange.
- The ODPC [Guidance Note on the Processing of Health
  Data](https://www.odpc.go.ke/wp-content/uploads/2024/02/ODPC-Guidance-Note-on-Processing-of-Health-Data.pdf).

## Required organizational actions before production

The deploying facility and vendor must still:

1. Register their applicable controller and processor roles with the ODPC.
2. Complete and submit the facility-specific DPIA where required.
3. Obtain Digital Health Agency certification before deployment and complete
   interoperability onboarding where applicable.
4. Approve privacy notices, lawful-purpose rules, consent and data-sharing
   procedures, patient-rights workflows, retention schedules, and processor
   agreements.
5. Maintain a tested incident-response process capable of ODPC notification
   within the statutory period and communication to affected people.
6. Provision authoritative facility, provider, licence, client, terminology,
   and product identifiers from approved registries.
7. Commission an independent penetration test, dependency review, backup
   restoration exercise, and business-continuity test before handling live
   patient data.

## Local preview

Generate local secrets once:

```powershell
.\scripts\Initialize-LocalSecrets.ps1
```

Launch an isolated preview on fresh volumes:

```powershell
docker compose -p medimesh-security-preview up -d --build
```

Open `http://localhost:3000`. Sign in as `admin` with the ignored password in
`secrets/bootstrap_admin_password.txt`. Do not use real patient data in the
local HTTP preview.

Run the security smoke test:

```powershell
.\scripts\Test-SecurePreview.ps1
```

Stop the preview without deleting its volumes:

```powershell
docker compose -p medimesh-security-preview down
```
