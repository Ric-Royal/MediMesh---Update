# Connected clinical record and workstation activity report

**Implementation date:** 2 August 2026

**Branch:** `security/kenya-health-hardening`

**Local Docker project:** `medimesh-security-preview`
**Scope:** continuity of the patient record from triage through clinician review,
diagnostics, medication, admission, printing, and clinical-file handling

## Outcome

The visit is now treated as one connected encounter. Information recorded by one
authorized care stage is restored for the next authorized user and remains
visible when the patient returns to the clinician after laboratory or radiology
work. The implementation does not require a doctor to re-enter triage or earlier
clinical data merely to continue the same visit.

The completed flow now supports:

- restoration of vital signs, history, examination, diagnoses, clinical outcome,
  treatment plan, follow-up plan, requested investigations, and medications;
- results review containing released laboratory values and radiology findings and
  impressions;
- medication selection only after a final diagnosis is recorded, while preserving
  the valid paths where no investigation or no medication is needed;
- clinician-directed admission to an available ward bed after final diagnosis,
  including transactional bed allocation and an admitted encounter state;
- longitudinal medical records containing triage, every clinician assessment,
  laboratory results, radiology reports, prescriptions, admissions, and linked
  result documents;
- upload, malware inspection, private storage, listing, viewing, and download of
  files associated with a patient, encounter, laboratory order, radiology order,
  prescription, admission, or medical record;
- working print actions for the complete medical record, laboratory report,
  radiology report, and pharmacy document.

## Implementation details

### Persistence and handoff

The browser now requests the complete clinical context for the encounter and
merges the latest saved values into the consultation form. This includes all
vital-sign and history fields; those values were previously omitted from the
consultation payload. The form reset is keyed to the encounter identifier so a
background refresh cannot erase in-progress entries.

Medical records now carry both the encounter identifier and originating
consultation-record identifier. Existing records are backfilled where a safe
relationship can be derived. New consultation records and medical records are
created in the same transaction and are linked to the same encounter.

### Diagnosis, medication, and admission

Medication is available as a late-stage clinical decision. Its controls become
active after the clinician selects a final-diagnosis outcome and enters the final
diagnosis. Investigation-pending pathways continue to accept null diagnosis and
medication values. The same decision rules are enforced in the browser and API.

The new disposition stage lets the clinician choose outpatient completion or
admission. Admission requires a final diagnosis, a ward, an available bed, an
admission type, and a reason. The API locks the selected bed before creating the
admission, preventing two simultaneous requests from allocating the same bed.
The encounter remains admitted/inpatient and billing completion is deferred
until the inpatient pathway is finished. Ward Occupancy now receives the linked
encounter, admission, clinical reason, admitting clinician, and billing context.

### Files, results, and printing

Clinical attachments are always linked to server-verified patient and encounter
context. Conflicting patient, encounter, order, prescription, admission, or
record relationships are rejected. Files are limited to three per selection and
10 MB each, inspected for declared-type mismatch and malware, and stored as
private clinical objects. Access is available only to authorized clinical roles
with the required patient or encounter context.

The file viewer now consumes the API's actual upload-date field and safely
handles missing or invalid legacy dates. This fixed the error boundary that was
discovered immediately after a successful live upload. Upload error messages now
show the API's specific rejection reason rather than a generic failure.

Print styles isolate the selected clinical document, hide application navigation
and actions, preserve readable result tables, and avoid printing unrelated screen
content.

## Database change

`init-scripts/105-connected-clinical-record.sql` was applied to the existing local
PostgreSQL volume. It is additive and:

- adds encounter and consultation links to medical records, with indexes and
  safe backfill;
- adds encounter, order, prescription, admission, and record context to file
  attachments;
- adds patient disposition and admission links to consultation records;
- permits the encounter state `admitted`;
- prevents more than one active admission for the same encounter.

The first application added the medical-record columns and then stopped because
the proposed prescription attachment type did not match the existing integer
prescription key. The migration was corrected to use the actual integer key and
was reapplied successfully. PostgreSQL transactional behavior and idempotent
guards preserved the partial safe additions. No table, row, volume, or patient
record was deleted or reset.

## Source files changed

- `init-scripts/105-connected-clinical-record.sql`
- `services/patient-api/src/models/FileAttachment.js`
- `services/patient-api/src/models/MedicalRecord.js`
- `services/patient-api/src/models/__tests__/FileAttachment.test.js`
- `services/patient-api/src/routes/consultations.js`
- `services/patient-api/src/routes/files.js`
- `services/patient-api/src/routes/wards.js`
- `services/patient-api/src/utils/consultationValidation.js`
- `services/patient-api/src/utils/__tests__/consultationValidation.test.js`
- `web-app/src/components/common/FilePreview.js`
- `web-app/src/components/common/FileUpload.js`
- `web-app/src/components/consultation/AdmissionSection.js`
- `web-app/src/components/consultation/ClinicalContextSection.js`
- `web-app/src/components/consultation/ConsultationForm.js`
- `web-app/src/components/consultation/MedicationsSelector.js`
- `web-app/src/pages/LaboratoryPage.js`
- `web-app/src/pages/PharmacyPage.js`
- `web-app/src/pages/RadiologyPage.js`
- `web-app/src/pages/RecordDetailPage.js`
- `web-app/src/utils/consultationWorkflow.js`
- `web-app/src/utils/consultationWorkflow.test.js`
- `web-app/src/utils/printClinicalDocument.js`
- `web-app/src/printStyles.css`
- `web-app/src/index.js`
- `web-app/src/__tests__/hospitalWorkflows.test.js`

## Verification record

- Patient API: 21 test suites, 101 tests passed.
- Web application: 10 test suites, 63 tests passed.
- The frontend suite initially exhausted the small Compose test-container memory
  limit. The unchanged suite passed in an isolated 1 GB test container. Production
  memory settings were not changed.
- Production web and patient-API images built successfully.
- The patient API reported healthy after recreation; the web application served
  successfully on `127.0.0.1:3000`.
- Browser verification confirmed restored triage, released laboratory results,
  the radiology report, prior clinician assessment, final-diagnosis medication
  enablement, disposition/admission controls, the complete record print action,
  and the linked clinical file.
- No admission or new clinical decision was submitted during verification. The
  test did not make a diagnosis or admission decision on behalf of a clinician.
- The first GitHub Docker security job stopped before scanning because its hosted
  runner timed out while reading the pinned Node and nginx manifests from Docker
  Hub. This was a registry-network timeout, not a vulnerability result. Only the
  failed job was retried after CodeQL completed. The retry built both images and
  completed both Trivy scans successfully. CodeQL, secret detection, dependency
  vulnerability scanning, license compliance, and the Docker scan all finished
  green.

The browser check used an existing synthetic encounter. One 86-byte plain-text
file named `medimesh-synthetic-lab-evidence.txt` was uploaded into the local
object-storage volume and linked to its completed laboratory order. The content
contains only a statement that it is a synthetic local workflow check. It was
accepted after content inspection and is visible from both the laboratory order
and the longitudinal record. An earlier repository text fixture was rejected
because its byte encoding did not match the declared plain-text type; it was not
stored. The temporary source file created under `C:\tmp` was deleted after the
test. The stored synthetic attachment remains intentionally available for user
inspection.

## What entered the computer

- The source changes, migration, tests, print stylesheet, admission component,
  and this report were created in the existing workspace.
- The additive migration schema and backfill entered the existing local database.
- Source code entered local Docker build contexts, producing temporary test images
  and final production images.
- Docker read pinned Node and nginx base-image metadata from its configured
  registry. Dependency layers were supplied by the existing build cache during
  the final build.
- The 86-byte synthetic text file entered local MinIO after type and malware
  inspection.
- Public GitHub pull-request and check metadata may be read during final source
  publication.

No new application dependency was installed directly on Windows. No external
patient record, diagnostic image, result document, credential, or production
database was downloaded.

## What left the computer

- Browser, API, PostgreSQL, Redis, MinIO, and malware-scanner traffic remained on
  `127.0.0.1` or the private local Docker network.
- Docker registry requests contained image names, digests, and build metadata;
  they did not contain patient data, database contents, application logs, or
  credentials.
- The completed source changes and this engineering report are pushed to the
  configured GitHub repository on the named branch. Git excludes the database,
  object-storage volume, synthetic attachment, logs, temporary file, passwords,
  and secret files from that transfer.
- GitHub received authenticated requests to update the existing draft pull
  request, read its check results and failed-job log, retry the transient failed
  Docker job, and monitor the replacement job. Those requests contained source
  and workflow metadata, not local clinical data or credentials.
- No patient data or clinical attachment was sent to GitHub or another external
  service.

The local administrator secret was used only to renew the local browser session
after its short expiry. It was not printed, copied into source or documentation,
stored in a new file, or sent outside the computer.

## Container and local-state impact

- Rebuilt and recreated:
  - `medimesh-security-preview-patient-api-1`
  - `medimesh-security-preview-web-app-1`
- Preserved without reset:
  - PostgreSQL data volume
  - Redis data volume
  - MinIO object-storage volume
  - malware-signature volume
- Temporary test containers used automatic removal. One initial frontend test
  container exhausted its test memory allowance; the rerun completed in an
  isolated container with a larger test-only limit.
- No user file, application volume, existing patient, appointment, encounter,
  order, result, prescription, invoice, or admission was removed.

## Kenyan health-data safeguards

These changes support the Data Protection Act, 2019 principles of purpose
limitation, data minimisation, accuracy, privacy by design/default, integrity,
confidentiality, and accountability; the Act's special handling of health data;
and the Health Act confidentiality duty. In particular, the implementation keeps
one accurate encounter record, verifies cross-resource relationships on the
server, restricts clinical-file access by role and care context, keeps files
private, scans uploads, and preserves accountable clinical handoffs.

This is an engineering implementation and activity record. It is not a legal
opinion, Digital Health Agency certification, ODPC registration evidence, or a
substitute for the facility's Data Protection Impact Assessment, retention
schedule, clinical-governance approval, or legal review.
