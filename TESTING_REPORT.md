# MediMesh Security Verification Report

Date: 27 July 2026

## Automated verification

- Backend: 17 suites, 77 tests, all passed in the digest-pinned Node.js test
  image.
- Frontend: 8 suites, 51 tests, all passed in the digest-pinned Node.js test
  image.
- Production frontend: the Vite 7.3.6 optimized build completed successfully
  on Node.js 22.23.1.
- Reproducible dependency installation: both application lockfiles reported
  zero known vulnerabilities.
- Exact runtime image scans: zero high or critical operating-system or
  application-package findings for the frontend and API.
- JavaScript syntax: all 69 backend source files passed.
- Python syntax: the approved Airflow aggregation DAG and Superset security
  configuration both passed AST parsing.
- Deployment scripts: all eight production shell scripts passed `sh -n`.
- Compose: local and production models both passed configuration validation.
- Repository diff: whitespace validation passed.

The GitHub workflows are configured to enforce dependency auditing, secret
detection, CodeQL, licence checks, image vulnerability scanning, SBOM
generation, provenance attestations, and immutable release digests. Hosted
security run
[30352418868](https://github.com/Ric-Royal/MediMesh---Update/actions/runs/30352418868)
passed all six jobs for commit
`1dd1c358d69197ec6dc4c3d0a08b313e02391a32`.

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
- Frontend: 8 suites and 51 tests passed in the isolated locked-dependency test
  image.
- The production frontend bundle completed successfully under Vite 7.3.6 on
  Node.js 22.23.1.
- Router regression tests cover dynamic patient paths, protected redirects,
  invoice query parameters, and patient navigation state.
- A live two-session check confirmed that signing out one session leaves the
  other session valid.
- A synthetic outpatient visit completed registration, triage, consultation,
  automatic invoicing, local cash-ledger settlement, encounter closure, and
  billing-queue closure.
- The automatic consultation charge used the clinician assigned to the
  encounter rather than the administrator performing delegated data entry.
- Patient `P000001004` and encounter `ENC2026072800004` are synthetic
  verification records and must not be treated as clinical or financial truth.

## Dependency and runtime security gate — 28 July 2026

- Frontend and API clean dependency installs each reported zero known
  vulnerabilities.
- The vulnerable frontend routing release line was removed; Wouter 3.10.0 and
  a locally tested compatibility layer now provide the required navigation
  surface.
- Patched and digest-pinned Node.js 22.23.1 Alpine 3.23 and unprivileged nginx
  1.31.3 Alpine images replaced the outdated build/runtime bases.
- npm, Corepack, Yarn, their caches, and their global package trees are absent
  from the API production image.
- Offline scans used a locally cached public vulnerability database with
  network access disabled. The exact final images produced zero high or
  critical findings.
- Two upstream deprecation notices remain during the frontend dependency
  build: one in the jsdom test-only encoding chain and one in the current MUI
  date-picker chain. Neither is a reported vulnerability, and the production
  nginx image contains no Node.js package tree.
- The production builder reports a performance advisory because the main
  minified JavaScript chunk is about 1.49 MB. This does not fail the build or
  the security gate; route-level code splitting remains a performance
  improvement for a later user-interface release.
- The first remote licence rerun correctly rejected Wouter's Unlicense because
  the policy omitted that SPDX identifier. The permissive licence was reviewed
  and added, and the obsolete licence checker was replaced by maintained
  version 5.0.1 so CI no longer installs the old glob chain.
- Some negative-path tests intentionally emit simulated API-error messages,
  and MUI tooltip transitions emit test-only React timing warnings. All 51
  assertions pass, and these messages do not occur as patient-workflow
  failures in the rebuilt preview.

## Appointment booking regression verification — 28 July 2026

- API: 18 suites and 80 tests passed in the isolated locked-dependency image.
- Frontend: 9 suites and 53 tests passed in the isolated locked-dependency
  image.
- Regression coverage confirms that legacy blank filters are accepted, the
  frontend omits blank filters, status tabs remain authoritative, scheduling
  helpers return available slots, and an available appointment is created.
- The production frontend bundle rebuilt successfully.
- The existing preview database received the narrow scheduling-function
  permission migration without recreating its volume.
- The rebuilt appointment list returned HTTP 200.
- Synthetic appointment `APT-20260728-1000` was created through the complete
  local authentication, CSRF, API, database-trigger, and audit path.
- User-created appointment `APT-20260728-1001` remains scheduled. A mistaken
  verification cancellation was reversed through the audited API; no row was
  deleted.
- Full findings and evidence are in
  `APPOINTMENT_BOOKING_FIX_REPORT_2026-07-28.md`.
