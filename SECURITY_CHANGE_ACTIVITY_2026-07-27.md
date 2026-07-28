# Security Change Activity Record

Date range: 23–28 July 2026
Workstation scope: `D:\MediMesh` and the local Docker daemon
Branch: `security/kenya-health-hardening`

This record documents the security-review activity performed on the
workstation. It intentionally excludes secret values, credentials, patient
data, and access tokens.

## Data and software received by the workstation

- Pinned Docker image layers were obtained from Docker Hub for Node.js, nginx,
  PostgreSQL, Redis, MinIO, the MinIO client, ClamAV, and a temporary
  vulnerability scanner. The final application references use immutable
  digests or fixed release tags.
- The final build used Node.js 22.23.1 on Alpine 3.23 and unprivileged nginx
  1.31.3 on Alpine. The temporary scanner was version 0.70.0.
- A public vulnerability database of approximately 102 MB was downloaded to
  `C:\tmp\medimesh-trivy-20260728\cache` for network-disabled image scans.
  The cache, exported image archives, and containing temporary directory were
  removed after results were recorded.
- Frontend packages were obtained from the public npm registry. The direct
  security-maintenance additions and updates included:
  - Vite 7.3.6 and Vite React plugin 5.2.0
  - Jest 30.4.2, Babel Jest 30.4.1, and jsdom test environment 30.4.1
  - Babel core and React/environment presets 7.29.7
  - Wouter 3.10.0
  - Keycloak JavaScript client 26.2.4
  - Testing Library DOM 10.4.1, React 16.3.2, user-event 14.6.1, and
    jest-dom 7.0.0
- Backend development dependencies were updated to Jest 30.4.2, Nodemon
  3.1.14, and Supertest 7.2.2.
- Fixed transitive versions were locked for coverage tooling, globbing, and
  brace expansion in both applications.
- Transitive npm packages and integrity hashes were recorded in both
  application lockfiles.
- GitHub Actions job status and failure logs were downloaded through the
  authenticated GitHub CLI. These logs contained build and scanner output, not
  clinical records.
- The security-results artifact from run `30345376042` was downloaded under
  the ignored `.activity` directory to identify exact dependency and image
  findings. It contains scanner metadata and package paths, not secrets or
  clinical records.
- Public release metadata was consulted to pin supported GitHub Actions by
  immutable commit hashes.
- Official GitHub release/tag metadata was consulted again after the runner
  reported a deprecated action runtime. Checkout 7.0.1 and setup-node 7.0.0
  commit identifiers were obtained from the official action repositories.
- npm metadata for `license-checker-rseidelsohn` 5.0.1, including its engine,
  licence, executable, dependencies, and integrity value, was consulted before
  it replaced the obsolete licence-checker package in CI.

## Information sent from the workstation

- Docker received image names, versions, digests, and normal registry request
  metadata while resolving image layers.
- npm received package names, requested versions, dependency-resolution
  metadata, the workstation's public network address, and normal HTTPS request
  metadata during installation, lockfile resolution, and individual release
  metadata checks.
- A local npm advisory request was attempted but blocked before execution.
  No local advisory payload was sent by that blocked command.
- Docker image builds performed their standard npm installation audit checks
  and reported zero known vulnerabilities. No source files, secrets, patient
  rows, cookies, or tokens were part of package-registry requests.
- GitHub received authenticated API requests identifying the repository,
  branch, workflow run, and job identifiers when workflow status and logs were
  inspected.
- GitHub previously received commit
  `635b63ed2a157063cbb01114e546ca3c3be711cc` on the security branch.
- GitHub also received commit
  `a14af950ff13fba7eeff432459e314785ce18ad0` on the same security branch. The
  transmitted Git objects contained reviewed source, tests, migrations, and
  documentation; ignored local secrets and preview database contents were not
  included.
- GitHub subsequently received commits
  `dd01cee49c270f05d29eec9c07e12cdcfd30353c` and
  `1dd1c358d69197ec6dc4c3d0a08b313e02391a32` on the same branch for the
  dependency/runtime remediation and focused licence-gate repair.
- Public GitHub advisory metadata and Wouter documentation were consulted to
  select a routing option that did not require suppressing a known
  vulnerability. Only normal HTTPS request metadata and the requested package
  or advisory identifiers left the workstation.
- GitHub received read-only API requests for official action releases, tags,
  workflow jobs, and the failed licence-job log. The log download contained CI
  output and masked its automatically supplied token.
- No patient data, database rows, locally generated passwords, Docker secrets,
  private keys, session cookies, or application bearer tokens were sent by
  these activities.

## Files and repository state changed

- The full application, database migrations, infrastructure, tests, workflows,
  and documentation were reviewed and hardened.
- Browser authentication was changed to an HttpOnly cookie session with CSRF
  enforcement, revocation, throttling, MFA support, and stricter account
  validation.
- Clinical access controls, relationship checks, break-glass auditing,
  file-encryption and malware-scanning controls, audit-chain integrity,
  least-privilege database roles, backup protection, and container isolation
  were implemented.
- The obsolete frontend build chain was replaced with Vite and current Jest and
  Babel tooling. The generated lockfile no longer contains `react-scripts`.
- The vulnerable frontend routing release line was removed. A local
  compatibility module over Wouter now supplies the routing surface used by
  the application, with tests for dynamic paths, redirects, query parameters,
  and patient navigation state.
- The authentication client, Vite, Jest, Babel, Testing Library, backend test
  tools, and vulnerable transitive coverage/globbing packages were updated and
  reproducibly locked.
- Security and release workflows now pin checkout 7.0.1 and setup-node 7.0.0
  by immutable commit. The licence job uses Node.js 24 and maintained
  `license-checker-rseidelsohn` 5.0.1. Wouter's reviewed permissive Unlicense
  SPDX identifier is explicitly allow-listed.
- The API production image was reduced to the Node.js runtime and application
  dependencies; npm, Corepack, Yarn, their caches, and their global package
  trees are removed after installation.
- The base Compose file was restored to production targets, nginx proxying,
  read-only application filesystems, internal networks, and loopback-only web
  publication.
- Local secret files were generated under `secrets/`. They are ignored by Git
  and were not printed into this report.
- Two incomplete frontend dependency trees had been preserved for recovery
  under the ignored `.dependency-recovery` directory:
  - `web-app-node_modules-enotempty-20260724`
  - `web-app-node_modules-partial-20260727`
- After clean locked builds and all automated tests passed, both obsolete
  recovery trees and the empty parent directory were removed, releasing about
  663 MB. They are not recoverable except by reinstalling the locked public
  packages.
- Build logs are stored under the ignored `.activity` directory.

## Docker changes

- The current preview project is `medimesh-security-preview`.
- The web service is published only at `127.0.0.1:3000` and proxies API traffic
  internally to the patient service.
- PostgreSQL, Redis, MinIO, ClamAV, and the patient API are not published to the
  host network.
- Existing preview volumes were preserved during rebuilds. Database contents
  and the generated administrator account were not reset.
- Older `medimesh-*` containers remain stopped for comparison; they were not
  deleted.
- Temporary dependency and test containers were created. Completed ephemeral
  installers were automatically removed, and the remaining stopped installer
  and exited test container were removed after their results were recorded.
- The temporary test, CI scan, and scanner images were verified to have no
  dependent containers and then removed. The exact removed tags were
  `medimesh-workflow-api-test`, `medimesh-workflow-web-test`,
  `medimesh-backend-ci`, `medimesh-frontend-ci`, and
  `aquasec/trivy:0.70.0`.
- The isolated `C:\tmp\medimesh-trivy-20260728` directory, including the public
  vulnerability database and exported image archives, was removed after both
  final scans passed. These temporary artifacts are not recoverable except by
  downloading or rebuilding them again.

## Validation performed

- Backend: 17 suites and 77 tests passed.
- Frontend: 8 suites and 51 tests passed after migration and routing
  replacement.
- The frontend production bundle built successfully with Vite 7.3.6 on the
  pinned Node.js 22.23.1 image.
- Clean dependency installation reported zero known vulnerabilities for both
  application lockfiles.
- Live preview smoke checks passed for cookie-only login, absence of a bearer
  token, session identity, route validation, CSRF rejection, and logout.
- The preview serves the production bundle through nginx on port 3000.
- Final network-disabled scans of the exact frontend and API runtime images
  found zero high or critical operating-system or application-package
  findings.
- The direct `/dashboard` route returned HTTP 200, loaded the application
  entry point, and included the configured content-security policy.
- Hosted security run
  [30352418868](https://github.com/Ric-Royal/MediMesh---Update/actions/runs/30352418868)
  passed dependency auditing, secret detection, exact Docker image scanning,
  licence compliance, CodeQL analysis, and the aggregate security report.

## Credentials and local sign-in

The local preview administrator name is `admin`. Its generated password is in
`secrets/bootstrap_admin_password.txt`. The password must not be committed,
copied into tickets, or placed in chat history. Production deployments must
replace this bootstrap credential, require MFA, use HTTPS, and use a formally
approved identity and access-management process.

## Recovery and cleanup

The two obsolete dependency-recovery directories, temporary scanner database,
exported image archives, test/scan images, installers, and test containers were
removed after their results were recorded. The current application images and
preview volumes were retained. Older stopped application containers were
intentionally retained for comparison and were not altered.

## Patient workflow repair activity on 28 July 2026

- The running preview was inspected through loopback HTTP, Docker status and
  logs, and read-only database queries.
- Two isolated test images were built:
  `medimesh-workflow-api-test` and `medimesh-workflow-web-test`.
- Both temporary test images were removed after their successful results were
  recorded. They contained no persistent data and remain reproducible from the
  project Dockerfiles.
- The API and web services in `medimesh-security-preview` were rebuilt and
  replaced. PostgreSQL, Redis, MinIO, and ClamAV remained running and their
  volumes were preserved.
- Database migration `init-scripts/100-workflow-security-fixes.sql` was applied
  to the existing PostgreSQL volume. It created a non-login billing-engine
  role and changed only the ownership, security context, and narrow grants
  required by automatic invoice triggers.
- A clearly synthetic patient and encounter were persisted for live
  verification: patient `P000001004`, encounter `ENC2026072800004`. A local
  synthetic KES 50 cash ledger record was created to test visit closure. No
  actual payment occurred and no payment provider was contacted.
- Additional earlier failed synthetic records remain in the preview database;
  no real-person data was supplied by this work.
- Loopback API requests sent synthetic registration, queue, consultation, and
  payment fields into the local containers. Responses, logs, and identifiers
  stayed on the workstation.
- Docker resolved pinned/base image metadata through Docker Hub during builds.
  Some later dependency installation steps were satisfied from Docker build
  cache; earlier clean builds downloaded the locked public npm packages listed
  above.
- Browser-control connection was attempted for visual inspection of the open
  dashboard, but the local integration failed before a page binding was
  established. No browser cookies, local storage, passwords, session stores,
  or page data were inspected. Equivalent loopback route, header, session, and
  application-entry checks were completed without reading browser storage.
- Official Kenya Law and Office of the Data Protection Commissioner pages were
  consulted for the Data Protection Act, Health Act, Digital Health Act,
  2025 Digital Health Regulations, and health-data processing guidance. Normal
  web request metadata and the search terms left the workstation; no repository
  files, credentials, tokens, secrets, database rows, or patient data were
  uploaded to those sites.
- No pull request, email, chat message, or external application write was
  performed. The final repository push was limited to reviewed Git objects on
  the existing security branch; the exact commit is recorded in the completion
  handoff.
- The final evidence and fault descriptions are recorded in
  `PATIENT_WORKFLOW_FIX_REPORT_2026-07-28.md`.

## Appointment booking repair activity on 28 July 2026

- Inspected the running appointment page, API logs, route validation, database
  helper definitions, service-role grants, doctor schedules, and audit output.
- Confirmed that the application role could not execute
  `is_time_slot_available` or `get_available_time_slots`.
- Added and applied
  `init-scripts/101-appointment-scheduling-permissions.sql`. It revoked
  implicit public execution and granted only those two helpers to the
  application role. It did not grant ownership, schema creation, role
  creation, or unrestricted database access.
- Changed appointment list request construction and backwards-compatible API
  validation, improved visible slot-loading errors, and corrected the sample
  schedule expansion query.
- Built isolated test images `medimesh-appointment-api-tests` and
  `medimesh-appointment-web-tests`. They contained source, locked public
  dependencies, and synthetic test fixtures only; no preview volume or
  database was mounted into them. Both temporary images were removed after
  their successful results were recorded; they can be reproduced from the
  project Dockerfiles and lockfiles.
- Backend testing passed 18 suites and 80 tests. Frontend testing passed 9
  suites and 53 tests.
- Rebuilt and replaced only the API and web services. PostgreSQL, Redis,
  MinIO, ClamAV, their persistent volumes, and existing records were
  preserved.
- Local loopback requests sent the administrator username, generated password,
  CSRF token, synthetic patient identifier, doctor identifier, appointment
  date/time, and synthetic reason only between the workstation web/API client
  and the local preview. Secrets were read from ignored local files and were
  not printed, committed, or transmitted externally.
- Created synthetic appointment `APT-20260728-1000` for patient
  `P000001004`. No payment or external notification was initiated.
- The user independently created appointment `APT-20260728-1001`. It was
  mistakenly cancelled during verification and immediately restored through
  the audited API after the user clarified ownership. Its current status is
  `scheduled`, its cancellation reason is null, no row was deleted, and both
  state changes remain in the security audit history.
- Docker checked pinned image metadata and reused cached image/dependency
  layers while building. Ordinary Docker Hub request metadata may have left
  the workstation; no repository source, credentials, secrets, database rows,
  or patient records were uploaded.
- Browser testing inspected the visible local login and appointment pages and
  submitted only the synthetic verification data described above. Browser
  cookies, local storage, password stores, and session stores were not read.
- No email, chat message, payment request, or other third-party application
  write occurred.
- Detailed findings are recorded in
  `APPOINTMENT_BOOKING_FIX_REPORT_2026-07-28.md`.

## Connected appointment-to-billing repair activity on 28 July 2026

- Inspected the local appointment, encounter, queue, consultation, invoice, and
  payment handoffs through source review, clean-container tests, local browser
  verification, loopback API calls, and targeted database queries.
- Confirmed that two `checked-in` future appointments had no encounter or queue
  entry. Migration `init-scripts/102-appointment-checkin-workflow.sql` returned
  both to scheduled and cleared only the invalid check-in markers.
- Added unique encounter-per-appointment and active-stage constraints, an
  appointment foreign key, and legacy in-window check-in recovery.
- Rebuilt and replaced the API and web containers while preserving every
  persistent volume and supporting container.
- Clean-container testing passed 19 API suites with 86 tests and 9 frontend
  suites with 54 tests.
- The browser read the local generated administrator password from its ignored
  secret file and submitted it only to the loopback login endpoint. It was not
  displayed, committed, or sent externally.
- Synthetic appointment `APT-20260728-1000` was rescheduled into the current
  visit window and advanced through triage and consultation to billing.
  Invoice `INV-20260728-1001` was created and left unpaid for inspection.
- Future appointment `APT-20260728-1001` remains scheduled. Its early check-in
  attempt was rejected without creating a visit or queue entry.
- Docker checked public base-image metadata and reused cached dependency
  layers. Ordinary Docker Hub request metadata may have left the workstation;
  no repository source, secret, health record, or invoice data was uploaded.
- No payment network, email, chat, calendar, SMS, or other external service was
  contacted. All application requests and health-data fields remained on
  loopback.
- Detailed findings and the complete ingress/egress record are in
  `CONNECTED_PATIENT_FLOW_FIX_REPORT_2026-07-28.md`.
