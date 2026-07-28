# Patient Workflow Fault and Remediation Report

Date: 28 July 2026
Branch: `security/kenya-health-hardening`
Preview: `http://127.0.0.1:3000`

## Outcome

The live synthetic outpatient cycle now completes from registration through
triage, consultation, automatic invoicing, payment, and visit closure. The
preview data volumes were preserved while the API and web containers were
rebuilt.

This is a technical verification record, not a legal certification or a
substitute for a formal data-protection impact assessment, health-system
certification, professional licensure verification, or production acceptance
testing.

## Faults reproduced and corrected

1. Signing out one session invalidated every active session for the same
   account. Tokens now have unique session identifiers. Sign-out revokes only
   the presented session in Redis for its remaining lifetime. Password and MFA
   security events still invalidate all account sessions, as intended.
2. New outpatient and emergency visits were inserted directly into the
   consultation queue. They now start in triage by default. The existing
   patient "Register Visit" action explicitly starts in consultation because
   that action is labelled and designed as a direct consultation handoff.
3. The queue dialog defaulted triage completion to billing. Triage now has one
   permitted completion route: consultation.
4. Queue status input was not schema validated, state transitions were not
   enforced, and queue handoff plus current-status completion could occur in
   separate transactions. Status and destination are now allow-listed,
   impossible transitions return a conflict response, and the handoff is
   transactional.
5. Generic queue completion could bypass the clinical workspaces, allowing a
   consultation, diagnostic service, pharmacy service, or billing visit to
   close without its authoritative clinical or financial record. The generic
   endpoint now completes triage only. Other services must be completed in
   their dedicated workspace.
6. An administrator saving a consultation was recorded as the clinical
   provider even when the visit had an assigned doctor. Administrative
   delegated entry now retains the administrator as the creating actor while
   the clinical record and invoice use the active doctor assigned to the
   encounter. A mismatched or inactive provider is rejected.
7. Automatic invoicing failed after least-privilege hardening because its
   trigger called routines and an invoice-number sequence that the application
   role could no longer use. A non-login billing-engine database role now owns
   only the required security-definer functions, uses a fixed search path, and
   has narrowly scoped table and sequence permissions. The application role
   cannot execute those routines directly.
8. Paying an invoice closed the encounter but left its billing queue entry
   active. A fully paid invoice now closes the matching billing queue entry in
   the same payment transaction.
9. The frontend offered patient registration to doctor and nurse roles even
   though the API correctly restricted demographic creation to administrators
   and receptionists. Routes and buttons now match the server authorization
   policy.
10. A queued consultation could be created without assigning a clinician,
    leaving the patient stuck later. The queued-visit interfaces now require a
    clinician and the API returns a specific conflict response if a
    consultation has no active provider.
11. Encounter creation hid the server response behind a generic message and
    logged an undefined encounter number. The frontend now surfaces the
    server-provided error and the API logs the persisted encounter number.
12. The frontend routing dependency had a published high-severity advisory in
    the only registry-available release line that otherwise satisfied the
    application. It was removed and replaced with a small compatibility layer
    over Wouter. Regression coverage now verifies dynamic patient paths,
    redirects, query parameters, and navigation state used to carry patient
    identifiers and completion messages between workspaces.
13. Dependency and container gates found vulnerable development dependency
    chains and outdated runtime operating-system packages. The frontend and
    API now use patched, digest-pinned Node.js, nginx, Vite, Jest, Babel,
    authentication-client, and test-library releases. Dependency overrides
    constrain vulnerable coverage-only transitive packages to fixed versions.
14. The API production image retained npm, Corepack, and Yarn even though the
    running service needs only Node.js. Those package managers, their caches,
    and their global package trees are now removed from the runtime image.
15. The remote licence gate omitted Wouter's permissive Unlicense identifier
    and used an obsolete checker that installed the old vulnerable glob chain.
    The allow-list now includes the exact SPDX identifier, the checker is
    replaced by maintained version 5.0.1, and checkout/setup actions are pinned
    to current immutable releases that use the supported runner runtime.

## Kenyan health-data alignment

The remediation was designed around the following obligations:

- Data Protection Act, 2019: lawful and transparent processing, purpose
  limitation, data minimisation, accuracy, storage limitation, safeguards, and
  accountable access to sensitive health data.
- Health Act, 2017 section 11: confidentiality of information about a health
  system user, treatment, and stay in a health facility.
- Digital Health Act, 2023 sections 18 to 21 and 35: confidentiality,
  security, privacy, accuracy, reliability, data-lifecycle security,
  accountability, and prevention of privilege abuse or health-data tampering.
- Digital Health (Health Information Management Procedures) Regulations,
  2025: controlled access, auditability, system documentation, and the broader
  certification and data-protection impact-assessment framework.
- Office of the Data Protection Commissioner health-data guidance: access
  control, integrity and confidentiality, accurate records, encryption,
  retention governance, impact assessment, and privacy by design and default.

The provider-attribution, role-alignment, transaction, validation, and
session-isolation changes directly reduce inaccurate clinical records,
privilege abuse, unintended disclosure, and unauthorised workflow changes.

Official sources used:

- [Data Protection Act, 2019](https://new.kenyalaw.org/akn/ke/act/2019/24)
- [Health Act, 2017](https://new.kenyalaw.org/akn/ke/act/2017/21/eng@2017-06-30)
- [Digital Health Act, 2023](https://new.kenyalaw.org/akn/ke/act/2023/15/eng@2023-11-24)
- [Digital Health (Health Information Management Procedures) Regulations,
  2025](https://new.kenyalaw.org/akn/ke/act/ln/2025/76/eng@2025-04-11)
- [ODPC Guidance Note on Processing of Health
  Data](https://www.odpc.go.ke/wp-content/uploads/2024/02/ODPC-Guidance-Note-on-Processing-of-Health-Data.pdf)

## Verification evidence

- API: 17 suites, 77 tests passed in the isolated locked-dependency image.
- Frontend: 8 suites, 51 tests passed in the isolated locked-dependency image.
- Production frontend bundle completed successfully with Vite 7.3.6 on the
  pinned Node.js 22.23.1 build image.
- Reproducible npm installation reported zero known vulnerabilities for both
  application lockfiles.
- Offline scans of the exact frontend and API runtime images reported zero
  high or critical findings in operating-system and application packages.
- API and web containers were rebuilt and replaced in
  `medimesh-security-preview`.
- PostgreSQL, Redis, MinIO, ClamAV, and the API reported healthy after the
  rebuild.
- `GET /health/live`, the web root, the direct `/dashboard` SPA route, and the
  public health endpoint returned HTTP 200.
- The live web response carried the content-security, frame, MIME-sniffing,
  referrer, permissions, and cross-origin opener protections.
- Two simultaneous administrator sessions were created. Signing out session B
  did not invalidate session A.
- Live synthetic record:
  - patient number: `P000001004`
  - encounter number: `ENC2026072800004`
  - route: triage to consultation to billing
  - consultation invoice: KES 50.00
  - payment marker: local synthetic cash record; no money or payment-network
    request was sent
  - final encounter status: `completed`
  - billing queue status: `completed`
  - billed provider matched the encounter's assigned doctor

## Sign-in

Use username `admin`. The local generated password is the exact text in
`secrets/bootstrap_admin_password.txt`. Do not copy that password into source
control, issue trackers, screenshots, or shared messages. Refresh the page
before signing in because sessions issued before this rebuild intentionally do
not satisfy the new per-session identifier requirement.

## Remaining production governance

Before handling real patient data, the operator still needs formal
organisation-specific approval, an updated data-protection impact assessment,
ODPC/controller-processor registration as applicable, Digital Health Agency
certification and interoperability assessment as applicable, verified
professional licensing and named staff accounts, HTTPS, MFA enforcement,
retention schedules, incident-response procedures, backup restore exercises,
and user acceptance testing by Kenyan clinical and privacy stakeholders.
