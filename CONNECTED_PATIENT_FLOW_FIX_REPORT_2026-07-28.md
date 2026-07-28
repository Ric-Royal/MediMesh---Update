# Connected Patient Flow Repair Report

Date: 28 July 2026

Environment: local `medimesh-security-preview` Docker deployment

Branch: `security/kenya-health-hardening`

## Outcome

The appointment handoff is now connected to the clinical visit lifecycle.
Checking in an eligible appointment atomically creates or reuses one encounter,
links it to the appointment, creates or reuses the active triage queue entry,
and opens Patient Flow on the relevant queue. Triage, consultation, appointment,
and billing states remain synchronized as the patient advances.

A future appointment is not automatically checked in. Staff can use the new
Reschedule action to change its date and time. Rescheduling alone preserves its
scheduled or confirmed state. A separate Check In action starts the patient
visit only when the appointment is within the permitted window.

## Defects found

1. Appointment check-in updated only `appointments.status`. It created neither
   an encounter nor a queue entry, so the patient disappeared between
   Appointments and Patient Flow.
2. Check-in accepted appointments regardless of their scheduled date or time.
3. Encounter creation did not persist the appointment link even though the
   database contained an `appointment_id` field.
4. The appointment's legacy `encounter_id` link was not populated.
5. Starting triage or consultation did not consistently synchronize encounter
   and appointment status.
6. Finishing triage did not fully express that the patient was waiting for
   consultation.
7. Consultation completion did not consistently mark the linked appointment
   complete.
8. Patient Flow always opened on Consultation, even when Check In had just
   created a Triage entry.
9. All-clinic queue boards did not receive an immediate data-minimised refresh
   signal.
10. Direct appointment status updates could bypass the guarded check-in,
    consultation, completion, and cancellation workflows.
11. Appointment cancellation did not close the linked active encounter and
    queues.
12. The Appointments interface had no way to reschedule an existing future
    appointment even though the API supported date and time updates.
13. Existing premature check-ins were orphaned and required a safe data repair.

## Changes made

- Replaced check-in with one database transaction that locks the appointment,
  validates the facility-local time window, resolves staff attribution, creates
  or reuses the linked encounter, creates or reuses triage, updates both
  appointment-to-encounter links, and commits all changes together.
- Configured check-in to open 60 minutes before the appointment and expire 12
  hours after it. Both limits are deployment settings.
- Added unique partial indexes preventing more than one encounter per
  appointment and more than one active entry for the same encounter and stage.
- Added the appointment foreign key with `ON DELETE SET NULL`.
- Added recovery migration
  `init-scripts/102-appointment-checkin-workflow.sql`.
- Returned legacy premature future check-ins without encounters to `scheduled`
  and cleared only their invalid check-in markers.
- Made the recovery migration create missing encounter and triage records for
  legacy check-ins that are inside the valid visit window.
- Synchronized encounter and appointment state when triage or consultation
  starts, when triage hands off to consultation, and when consultation ends.
- Propagated appointment cancellation to the linked unfinished encounter and
  active queues within one transaction.
- Blocked direct writes to workflow-controlled appointment statuses.
- Added a data-minimised queue refresh event containing only the action and
  clinic identifier; patient details remain behind an authenticated refetch.
- Added a Reschedule action and dialog to the Appointments screen.
- After a successful Check In, navigation carries the queue type and opens the
  correct Patient Flow stage.

## Live verification

The local synthetic appointment `APT-20260728-1000` was used for a complete
verification:

1. It began as a future scheduled appointment.
2. It was rescheduled to the current Africa/Nairobi visit window.
3. Rescheduling left it scheduled.
4. Check In changed it to checked-in and created one waiting triage entry.
5. Patient Flow returned the patient in Triage.
6. Triage started and completed, creating one waiting Consultation entry.
7. Consultation started, changing the appointment to in-progress.
8. A synthetic consultation with no clinical orders was completed.
9. The appointment became completed.
10. One waiting Billing entry and invoice `INV-20260728-1001` were created.
11. The Billing screen displayed the patient and KES 50.00 consultation invoice.

The invoice was deliberately left unpaid so it remains visible for inspection.
No payment provider was contacted and no real payment was made.

Appointment `APT-20260728-1001` remains future-dated and scheduled. An attempted
early Check In returned HTTP 409 and did not create an encounter or queue entry.

## Verification evidence

- Focused API workflow tests: 3 suites, 13 tests passed.
- Full API clean-container tests: 19 suites, 86 tests passed.
- Full frontend clean-container tests: 9 suites, 54 tests passed.
- Production API and frontend images built successfully.
- API, PostgreSQL, Redis, MinIO, and ClamAV were healthy after replacement.
- Live database preflight found no duplicate encounter-per-appointment records
  and no duplicate active stage entries.
- The visible local Appointments screen showed both premature records restored
  to scheduled and exposed the new Reschedule action.
- The visible local Billing screen showed the verification invoice.

## Kenyan health-data safeguards

The repair supports the accuracy, integrity, confidentiality, access-control,
auditability, and accountability duties in Kenya's Data Protection Act, Health
Act, Digital Health Act, and applicable health-information regulations.
Workflow changes are transactional and attributable; invalid shortcuts are
blocked; duplicate clinical context is prevented; and queue refresh broadcasts
do not contain patient details.

This technical repair does not replace organisational lawful-basis review,
data-protection impact assessment, retention approval, access recertification,
incident-response testing, professional licensing checks, or applicable Digital
Health Agency certification before production use with real patient data.

## Workstation ingress and egress

### Entered the workstation

- Docker checked public image metadata for the already pinned Node.js and nginx
  base images.
- Docker reused cached public dependency layers and the locked npm dependency
  graph for clean test and production builds.
- Local loopback responses entered the browser and test client from the local
  web and API containers.

### Left the workstation

- Normal Docker Hub request metadata may have left during image metadata checks.
- No repository source, credentials, session cookies, tokens, database rows,
  patient records, clinical notes, or invoice details were uploaded to Docker
  Hub or another third party.
- The administrator password and CSRF values travelled only over loopback
  between the workstation and `127.0.0.1`.
- No email, chat message, calendar event, payment request, SMS, or external
  application write was sent.
- The browser interacted only with the local application.

### Local changes

- The API and web containers were rebuilt and replaced.
- PostgreSQL, Redis, MinIO, ClamAV, and all persistent volumes were preserved.
- Migration 102 added integrity constraints and repaired two invalid legacy
  future check-in markers.
- One existing synthetic appointment was rescheduled and advanced to an unpaid
  billing invoice for verification.
- The user-created future appointment was not advanced and remains scheduled.
- No database row, patient file, volume, or real-person record was deleted.
