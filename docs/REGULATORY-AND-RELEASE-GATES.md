# Regulatory and commercial release gates

Status date: 22 July 2026
Product build: 1.0.0-rc.1

## Important status

MediMesh now includes production packaging, security controls, role-based workflow, MFA, encrypted/validated backups, release provenance, and operational guidance. That does **not** make the software certified, independently penetration-tested, legally approved, clinically validated, or authorized for live patient data.

Kenya’s [Digital Health (Health Information Management Procedures) Regulations, 2025](https://new.kenyalaw.org/akn/ke/act/ln/2025/76/eng%402025-04-11) state that a health facility must use a digital health solution certified by the Digital Health Agency. The certification application calls for, among other items, system documentation, ODPC registration evidence, a DPIA, security/privacy/confidentiality policy, backup and recovery policy, and a cyber-security assessment report. MediMesh must complete that external process before being represented as certified.

The [Digital Health (Data Exchange Component) Regulations, 2025](https://new.kenyalaw.org/akn/ke/act/ln/2025/77/eng%402025-04-11) also set onboarding, certification, interoperability, shared-health-record, encryption, audit, and encounter-transmission expectations. The current release does not claim that DHA onboarding or national exchange integration has been completed.

The [Digital Health Act, 2023](https://new.kenyalaw.org/akn/ke/act/2023/15/eng%402023-11-24) establishes the Digital Health Agency and the statutory digital-health framework. The [ODPC health-data guidance](https://www.odpc.go.ke/wp-content/uploads/2024/02/ODPC-Guidance-Note-on-Processing-of-Health-Data.pdf) should be reviewed with Kenyan privacy counsel and the facility’s data protection officer.

## Required owner actions before live use

| Gate | Required evidence | Owner | Repository status |
|---|---|---|---|
| Legal entity and contracts | Incorporation, customer contract, data processing terms, support/SLA, subprocessor schedule | Company/legal | External |
| ODPC registration | Current controller/processor registration as applicable | Privacy/legal | External |
| DPIA | Approved DPIA for product, hosting, M-Pesa, support, backups, integrations, facilities | DPO/privacy | External |
| DHA certification | Self-attestation, application, testing evidence, valid certificate | Product/regulatory | External |
| DHA/data exchange onboarding | Approved onboarding and certified interoperability implementation | Product/facility | Not implemented |
| Clinical safety | Hazard log, clinical risk owner, usability validation, safety case, change controls | Clinical governance | External |
| Independent penetration test | Signed report, fixes, retest, risk acceptance | Security | External; scope documented |
| Live infrastructure | Facility domain, DNS, TLS, firewall, hardened host, monitoring | Deployment owner | Package provided; not executed here |
| MFA and access review | Every live user enrolled; least-privilege matrix signed | Facility admin/security | Implemented; enrollment is deployment work |
| Backup recovery | Encrypted off-host backup and isolated restore evidence against objectives | Operations | Scripts implemented; live drill required |
| M-Pesa production | Approved Daraja credentials, callback reachability, reconciled test evidence | Finance/integration owner | Logic implemented; credentials/approval required |
| Interoperability | Required registries, minimum data set, coding, transport, audit/transmission behavior | Product/DHA | Gap; do not claim conformance |
| Patient rights/privacy | Notices, lawful bases, consent where required, access/correction/retention/deletion processes | Facility/DPO | Policy/workflow work required |
| Incident readiness | Contacts, notification decisions, downtime, breach and evidence procedures tested | Facility/security | Guide provided; exercise required |

## Product evidence included in this repository

- role-based user and administrator guide;
- production installation/update/rollback/backup/restore/health package;
- mandatory production MFA with encrypted TOTP seeds and session revocation;
- least-privilege application roles and auditable named accounts;
- payment reservation, callback reconciliation, duplicate/late callback handling, and 60-second M-Pesa resend;
- repeated doctor–diagnostics–doctor workflow and delayed billing handoff;
- private data services with an HTTPS-only public edge;
- file-mounted secrets and startup rejection of unsafe production configuration;
- CI tests, dependency/secret/static/container scans, SBOM, and provenance attestations;
- an explicit independent penetration-test scope and go-live checklist.

## Claims that must not be made yet

Do not advertise or contractually state that MediMesh is DHA-certified, ODPC-approved, “HIPAA compliant,” penetration-tested, breach-proof, interoperable with the national system, approved by Safaricom for production, or guaranteed fit for every clinical specialty unless current documentary evidence supports the exact claim.

Use “release candidate undergoing facility validation and statutory certification” until the external gates are complete. Security and compliance are continuing operating processes, not properties permanently conferred by a code release.
