# Role-Owned Patient Handoff and Local Activity Report

Date: 29 July 2026
Workspace: `D:\MediMesh`
Branch: `security/kenya-health-hardening`
Preview project: `medimesh-security-preview`

## Outcome

The connected outpatient journey was changed from a single-user consultation
form into role-owned handoffs:

1. Appointment check-in creates or reuses one encounter and sends it to triage.
2. A nurse or administrator records triage observations and history.
3. The assigned doctor or an administrator performs examination, records the
   diagnosis and plan, and creates laboratory, radiology, and medication orders.
4. Laboratory, radiology, and pharmacy staff complete work in their own
   workspaces.
5. Completed diagnostic results return to the assigned doctor as a
   `results-review` consultation.
6. The visit moves to billing only when clinical review and all ordered services
   are complete.
7. A completed payment closes the billing queue and encounter.

Administrators retain access to every stage. Other users can see or process only
the stages required for their duties. A doctor’s consultation list is also
limited to encounters assigned to that doctor.

## Code and database changes made

### Database

- Added `init-scripts/103-role-owned-patient-handoffs.sql`.
- Added the `triage_assessments` table with:
  - one assessment per encounter;
  - patient and encounter foreign keys;
  - staff attribution;
  - structured vital signs;
  - complaint, history, allergies, current medication, and triage notes;
  - timestamps and restricted database grants.
- Applied this additive migration to the existing local PostgreSQL volume.
- Existing tables, records, and Docker volumes were not deleted or reset.

### Patient-flow API

- Added a dedicated transactional triage-completion endpoint.
- Prevented generic queue completion from bypassing clinical workspaces.
- Added server-side queue ownership for nurse, doctor, laboratory, radiology,
  pharmacy, billing, reception, and administrator roles.
- Prevented front-office staff from processing or reordering clinical stages.
- Limited doctors to their assigned consultation entries.
- Made the triage-to-consultation handoff retry-safe.
- Added a protected encounter clinical-context endpoint for triage, prior
  clinician assessments, laboratory results, radiology reports, and prescription
  fulfilment.
- Kept appointments `in-progress` while ordered services remain outstanding.
- Returned completed diagnostic work to the doctor for results review.
- Marked appointments complete only when the visit reaches billing.
- Fixed the shared request validator so JSON arrays remain arrays. This was the
  root cause that rejected valid laboratory, radiology, and prescription arrays.

### Web application

- Added a nurse-owned triage dialog.
- Replaced the editable clinician vitals/history tab with a read-only triage
  handoff summary.
- Added full triage vital signs and history to the clinician view.
- Renamed clinician actions to describe their responsibility:
  examination, diagnosis and plan, order laboratory tests, order imaging, and
  prescribe medication.
- Added a results-review view that displays completed laboratory and radiology
  results before the doctor finalizes the plan.
- Changed Patient Flow actions to `Resume triage`, `Resume consultation`, or
  `Open workspace`; the unsafe generic completion shortcut is no longer exposed.
- Limited queue selectors and navigation by role while retaining all options for
  administrators.
- Limited laboratory, radiology, pharmacy, and billing routes to their owning
  roles plus administrators.
- Added explanatory handoff notices to laboratory, radiology, and pharmacy
  workspaces.

### Security automation

- Updated the pinned artifact-upload action from version 4.6.2 to 7.0.1 so
  security reports run on the supported Node.js 24 action runtime.
- Kept immutable commit pinning for the workflow dependency.

## Local validation performed

- Backend: 20 suites, 92 tests passed.
- Frontend: 9 suites, 55 tests passed.
- Production web build completed successfully.
- Production API and web images were rebuilt.
- All preview services were left running; the API, database, Redis, object
  storage, and malware scanner reported healthy.
- Public local health endpoint returned HTTP 200.
- Signed-in administrator browser check confirmed:
  - all six queue types are available;
  - all department navigation items are available;
  - the consultation dialog contains the new role-owned tabs and triage summary;
  - the laboratory workspace explains the result-return handoff;
  - no browser console errors were present.
- GitHub security automation passed dependency, secret, container, static code,
  licence, and summary jobs after the source push.

## Synthetic end-to-end journey inserted locally

Only synthetic data was used. No real patient was used for this validation.

- Synthetic patient ID: `86cf90a0-8317-446f-b74b-9f228b34948c`
- Appointment ID: `11298fc4-b199-43ed-8f1b-7f9385f8abc5`
- Encounter ID: `d7adb22a-c628-4997-bb8f-06c3381e412d`
- Triage queue ID: `a06beb3f-d3ea-4389-bbcc-bc89fa7f1d1f`
- Triage assessment ID: `2fba5f05-4947-46dd-abe3-56778601466a`
- Initial consultation queue ID: `9816928b-4896-4769-84cb-3756be3ebe49`
- Initial consultation ID: `c42262e9-c94d-4387-a353-ff0f596de5da`
- Laboratory order ID: `5bcba17f-f2c0-4687-9d85-46f54fd7e917`
- Laboratory order number: `LAB-20260729-1000`
- Laboratory queue ID: `d4a43d4c-6ef9-437e-b271-25f9f0f394b1`
- Results-review queue ID: `ebf46abc-1f59-43e9-a788-91cf1b942cb4`
- Results-review consultation ID: `575c2e2a-3d8d-4156-96e6-f84945f6faf9`
- Billing queue ID: `f90377e2-a09d-45de-a655-eb89e81d6f1f`
- Invoice ID: `ea3a4f3e-85b1-48fb-afc0-ffc92588dc59`
- Synthetic invoice total: KES 600.00
- Synthetic payment ID: `0be007fd-1d20-4665-8d5a-40b0daa3818b`
- Final state: invoice paid, balance KES 0.00, appointment completed,
  encounter completed, and no active billing queue entry.

Two consultation requests were rejected with HTTP 400 before the array-validator
fix. They created no consultation or order records. The successful request was
then submitted after the correction.

## What entered the computer

- Local source changes listed in this report.
- One additive database table and its indexes/grants.
- Local Docker images for frontend and backend tests.
- Rebuilt local production images for the web application and patient API.
- Synthetic records listed above.
- Docker checked pinned base-image metadata. Dependency-install build layers were
  satisfied from the existing Docker cache during the final builds.
- Public release metadata for the pinned GitHub workflow action and pull-request
  check results were read from GitHub.

No application dependency was installed into the Windows host. The incomplete
host `web-app/node_modules` directory was not reused or repaired; clean container
builds used the lockfiles.

## What left the computer

- Browser and API validation traffic stayed on `127.0.0.1`.
- Source code, database rows, medical data, logs, passwords, secret values, and
  files were not sent to any third-party service during testing.
- Docker contacted its configured registry for pinned image metadata.
- The tested source changes were pushed to the configured GitHub repository on
  the named branch. No database content, Docker volume, or secret file was
  included in that push.
- Pull-request text and workflow-status requests were sent to GitHub. They
  contained source-change descriptions and check identifiers, not patient data
  or local credentials.

The local bootstrap administrator password was read into process memory only to
authenticate synthetic API tests against `127.0.0.1`. It was not printed,
written into source, placed in this report, or transmitted outside the computer.

## Container impact

- Recreated:
  - `medimesh-security-preview-patient-api-1`
  - `medimesh-security-preview-web-app-1`
- Preserved:
  - PostgreSQL volume
  - Redis volume
  - object-storage volume
  - malware-signature volume
- No container volume or user file was removed.
- Temporary test containers were started with `--rm`; their containers were
  removed automatically after each test run.
- Local test images remain in Docker’s image store:
  - `medimesh-security-preview-api-test`
  - `medimesh-security-preview-web-test`

## Kenyan health-data safeguards preserved

The implementation supports the Data Protection Act, 2019 principles of
lawfulness, purpose limitation, data minimisation, accuracy, integrity,
confidentiality, and accountability by:

- limiting each user to the minimum workflow stage needed for their duty;
- attributing triage and clinical decisions to authenticated staff;
- preventing front-office users from editing clinical content;
- retaining one connected encounter instead of duplicating patient information;
- keeping clinical data inside protected API responses and local encrypted
  service boundaries;
- recording deterministic handoffs and maintaining the existing audit controls;
- preventing billing or visit closure before required clinical work is complete.

This is an engineering implementation record, not a formal legal opinion or
substitute for a Data Protection Impact Assessment by the facility’s Data
Protection Officer.
