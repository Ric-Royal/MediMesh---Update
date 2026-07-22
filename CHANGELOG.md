# MediMesh changelog

All notable product changes are recorded here. MediMesh uses semantic versioning;
production deployments must use an explicit image tag and must not use `latest`.

## 1.0.0-rc.1 - 2026-07-22

### Clinical operations

- Added transaction-safe hand-offs between consultation, laboratory, radiology,
  pharmacy and billing queues.
- Added repeatable diagnostic loops: a completed laboratory or radiology order
  returns the encounter to a results-review consultation before billing.
- Prevented duplicate active queues and premature billing while clinical work is
  still outstanding.
- Added configurable departments, clinics, wards, beds, medications, laboratory
  tests, radiology studies and staff accounts for solo clinics and team hospitals.

### Payments

- Added a 60-second M-Pesa STK prompt lease. An unanswered request expires and
  the cashier can send a numbered retry to the same patient phone number.
- Added atomic invoice payment reservation, late-callback reconciliation,
  duplicate-attempt protection and patient-credit handling when a late genuine
  payment arrives after the invoice was already settled.
- Kept invoices pending until an authenticated Safaricom callback confirms the
  payment; sending an STK prompt alone never marks an invoice as paid.

### Interface and accessibility

- Reworked the application shell, page spacing, clinical dashboards, tables,
  statuses, priority indicators and forms for long clinical work sessions.
- Made the desktop navigation collapsible and persistent, with a compact mobile
  drawer and a full-width workspace without the former empty right-side gutter.
- Added role-aware actions, keyboard labels, clearer empty/error states and
  truthful operational metrics.

### Identity, privacy and security

- Added local-account TOTP MFA enrolment, login challenge, removal and
  administrator reset with session revocation.
- Added stronger password policy, rate limits, token versioning, restrictive
  production validation, safer error responses and structured audit events.
- Added protected file storage, authenticated previews and stricter upload
  validation.
- Added file-based secret loading and AES-256-GCM protection for stored MFA
  secrets.

### Release and operations

- Added versioned GHCR release workflows, tests, dependency audits, container
  scanning, SBOM generation and provenance attestations.
- Added a production Compose package with automatic TLS, private service
  networking, non-root/read-only application containers, health checks and
  external secrets.
- Added encrypted backup, validation, restore, update, health-check and rollback
  scripts plus production, user and regulatory guides.

### Release gates

- This version is a release candidate. A live site still requires the operator's
  domain/DNS, production M-Pesa credentials, tested restore evidence, independent
  penetration testing and the applicable Kenyan regulatory approvals described
  in `docs/REGULATORY-AND-RELEASE-GATES.md`.
