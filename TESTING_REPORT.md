# MediMesh Security Verification Report

Date: 27 July 2026

## Automated verification

- Backend: 16 suites, 72 tests, all passed in the digest-pinned Node.js test
  image.
- Frontend: 7 suites, 48 tests, all passed in the digest-pinned Node.js test
  image.
- Production frontend: the Vite 7.2.2 optimized build completed successfully
  after 12,616 modules were transformed.
- Backend dependency installation: 541 packages audited, zero known
  vulnerabilities reported.
- JavaScript syntax: all 69 backend source files passed.
- Python syntax: the approved Airflow aggregation DAG and Superset security
  configuration both passed AST parsing.
- Deployment scripts: all eight production shell scripts passed `sh -n`.
- Compose: local and production models both passed configuration validation.
- Repository diff: whitespace validation passed.

The GitHub workflows are configured to enforce dependency auditing, secret
detection, CodeQL, licence checks, image vulnerability scanning, SBOM
generation, provenance attestations, and immutable release digests. The final
remote run for the current uncommitted workflow corrections remains pending.

## Live Docker verification

Preview URL: `http://localhost:3000`

- PostgreSQL, Redis, object storage, ClamAV, and the API report healthy.
- The API readiness endpoint returned HTTP 200 after checking PostgreSQL,
  Redis, and an encrypted object-store write/read probe.
- Only the web container is host-published, on `127.0.0.1:3000`.
- The web container serves the production bundle through nginx on internal
  port 8080; development source mounts and the Vite development port are not
  present in the base stack.
- The web tier is connected only to the edge and application networks.
- PostgreSQL is connected only to the database network.
- The secure smoke test verified cookie-only login, absence of a bearer token
  in the response, authenticated identity, strict appointment/schedule/ward
  validation, CSRF rejection, and logout.
- Response protections include CSP, frame protection, MIME sniffing
  protection, referrer policy, permissions policy, and suppressed server
  version information.

## Database security verification

- Application role is not a superuser and cannot create databases or roles.
- Application role owns zero public tables.
- Application role cannot create objects in the public schema.
- Application role cannot update audit rows or delete patients.
- The current audit chain had zero broken links.
- Every persisted audit hash was recomputed; zero mismatches were found.
- Audit and clinical-history immutability triggers rejected modification.
- Clinical versioning recorded the original row and each amendment while
  incrementing the record version.

## Document artifact verification

Three archived Word documents had creator, last-modifier, custom-property, and
revision-session metadata removed. ZIP and OOXML integrity checks passed.
Visual rendering was not available because an office renderer is not installed
in this environment; the privacy operation does not alter document content.
Two stale Office owner-lock files were removed.

## Repeat locally

```powershell
.\scripts\Initialize-LocalSecrets.ps1
docker compose -p medimesh-security-preview up -d --build
.\scripts\Test-SecurePreview.ps1
```

Use generated local credentials only. Do not place real patient data in the
HTTP preview.

## Patient journey regression verification — 28 July 2026

- API: 17 suites and 77 tests passed in the isolated locked-dependency test
  image.
- Frontend: 7 suites and 48 tests passed in the isolated locked-dependency test
  image.
- The production frontend bundle completed successfully under Vite 7.2.2.
- A live two-session check confirmed that signing out one session leaves the
  other session valid.
- A synthetic outpatient visit completed registration, triage, consultation,
  automatic invoicing, local cash-ledger settlement, encounter closure, and
  billing-queue closure.
- The automatic consultation charge used the clinician assigned to the
  encounter rather than the administrator performing delegated data entry.
- Patient `P000001004` and encounter `ENC2026072800004` are synthetic
  verification records and must not be treated as clinical or financial truth.
