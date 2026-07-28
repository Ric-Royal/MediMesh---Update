# Security Change Activity Record

Date range: 23–28 July 2026
Workstation scope: `D:\MediMesh` and the local Docker daemon
Branch: `security/kenya-health-hardening`

This record documents the security-review activity performed on the
workstation. It intentionally excludes secret values, credentials, patient
data, and access tokens.

## Data and software received by the workstation

- Pinned Docker image layers were obtained from Docker Hub for Node.js, nginx,
  PostgreSQL, Redis, MinIO, the MinIO client, and ClamAV. Image references in
  the project use immutable digests or fixed release tags.
- Frontend packages were obtained from the public npm registry. The direct
  additions were:
  - Vite 7.2.2
  - Vite React plugin 5.1.1
  - Jest, Babel Jest, and jsdom test environment 30.2.0
  - Babel core and React/environment presets 7.28.5
  - React Router DOM 7.18.1
- Transitive npm packages and their integrity hashes were recorded in
  `web-app/package-lock.json`.
- GitHub Actions job status and failure logs were downloaded through the
  authenticated GitHub CLI. These logs contained build and scanner output, not
  clinical records.
- Public release metadata was consulted to pin supported GitHub Actions by
  immutable commit hashes.

## Information sent from the workstation

- Docker received image names, versions, digests, and normal registry request
  metadata while resolving image layers.
- npm received package names, requested versions, dependency-resolution
  metadata, the workstation's public network address, and normal HTTPS request
  metadata during installation.
- A local npm advisory request was attempted but blocked before execution.
  No local advisory payload was sent by that blocked command.
- GitHub received authenticated API requests identifying the repository,
  branch, workflow run, and job identifiers when workflow status and logs were
  inspected.
- GitHub previously received commit
  `635b63ed2a157063cbb01114e546ca3c3be711cc` on the security branch.
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
- The base Compose file was restored to production targets, nginx proxying,
  read-only application filesystems, internal networks, and loopback-only web
  publication.
- Local secret files were generated under `secrets/`. They are ignored by Git
  and were not printed into this report.
- Two incomplete frontend dependency trees were preserved for recovery under
  the ignored `.dependency-recovery` directory:
  - `web-app-node_modules-enotempty-20260724`
  - `web-app-node_modules-partial-20260727`
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

## Validation performed

- Backend: 16 suites and 72 tests passed.
- Frontend: 7 suites and 48 tests passed after migration.
- Frontend production bundle built successfully with Vite.
- Live preview smoke checks passed for cookie-only login, absence of a bearer
  token, session identity, route validation, CSRF rejection, and logout.
- The preview serves the production bundle through nginx on port 3000.
- Earlier Trivy scans found no gated high or critical findings in either
  application image.
- The remote workflow still requires one final pushed run after the current
  workflow corrections are committed.

## Credentials and local sign-in

The local preview administrator name is `admin`. Its generated password is in
`secrets/bootstrap_admin_password.txt`. The password must not be committed,
copied into tickets, or placed in chat history. Production deployments must
replace this bootstrap credential, require MFA, use HTTPS, and use a formally
approved identity and access-management process.

## Recovery and cleanup

The two preserved dependency directories can be deleted after the branch is
committed, pushed, and the remote security run passes. They are not used by the
application or Docker build. Temporary containers have already been removed;
the older stopped application containers were intentionally retained.

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
  Dependency installation steps were satisfied from Docker build cache; the
  captured build output showed no new npm package download step.
- Official Kenya Law and Office of the Data Protection Commissioner pages were
  consulted for the Data Protection Act, Health Act, Digital Health Act,
  2025 Digital Health Regulations, and health-data processing guidance. Normal
  web request metadata and the search terms left the workstation; no repository
  files, credentials, tokens, secrets, database rows, or patient data were
  uploaded to those sites.
- At this report checkpoint, no new branch push, commit, pull request, email,
  chat message, or external application write had been performed during the
  workflow repair. The final repository commit and push are recorded in the
  completion handoff.
- The final evidence and fault descriptions are recorded in
  `PATIENT_WORKFLOW_FIX_REPORT_2026-07-28.md`.
