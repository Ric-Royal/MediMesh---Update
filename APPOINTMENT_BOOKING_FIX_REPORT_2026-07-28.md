# Appointment booking repair report

Date: 28 July 2026

Preview project: `medimesh-security-preview`

Branch: `security/kenya-health-hardening`

## User-visible cause

Appointment booking failed for administrators and other authorised users
because the final least-privilege database script revoked execution of every
public function, but did not restore execution of the two read-only scheduling
helpers used by the appointment API:

- `is_time_slot_available(UUID, DATE, TIME, INTEGER)`
- `get_available_time_slots(UUID, DATE)`

The application correctly recognised the signed-in user as an administrator,
but every application user connects to PostgreSQL through the same restricted
service role. PostgreSQL therefore rejected the scheduling operation before
the application could create the appointment.

The appointment list had a separate frontend defect. It sent blank optional
query parameters, which strict API validation rejected with HTTP 400. The
blank filter object also overwrote the status selected by the page tabs.

The sample doctor-schedule seed had a third defect: `LIMIT 3` was applied after
weekday expansion, producing three weekday rows for one doctor instead of five
weekday rows for each of three doctors.

## Corrections

- Added an idempotent database migration that restores `EXECUTE` only on the
  two scheduling helpers to `medimesh_user`; `PUBLIC` remains denied.
- Kept the application role non-owner and retained application-level role and
  patient-scope checks. Administrators retain full legitimate workflow access;
  ordinary roles remain restricted by route and patient context.
- Removed blank optional appointment filters from frontend requests.
- Made the selected status tab authoritative over any stored filter value.
- Made the API tolerate blank optional filters from older clients.
- Added a visible, actionable error when available-time lookup fails.
- Corrected the sample schedule query so three doctors each receive five
  Monday-to-Friday schedule rows on a new database.
- Added backend and frontend regression tests for the repaired paths.

## Live verification

- The live database confirmed both scheduling helpers were initially denied to
  the application role and executable after the narrow migration.
- Appointment-number sequence usage remained available.
- The rebuilt appointment list returned HTTP 200 and rendered without an
  error.
- A synthetic appointment was created successfully:
  `APT-20260728-1000`, scheduled for 30 July 2026 at 09:00.
- The user independently created `APT-20260728-1001`.
- During verification, the second appointment was mistakenly attributed to
  automation and cancelled. After the user clarified ownership, it was
  immediately restored to `scheduled` and its cancellation reason was cleared
  through the application API. No row was deleted; the audit history preserves
  the cancellation and restoration.
- Backend: 18 suites, 80 tests passed.
- Frontend: 9 suites, 53 tests passed.
- The production frontend bundle rebuilt successfully.
- The API and web services were replaced and returned healthy/running status;
  PostgreSQL and all persistent volumes were preserved.

## Kenyan health-data safeguards

The change supports the Data Protection Act, 2019 principles of accuracy,
integrity, confidentiality, data minimisation, and accountable processing. It
also supports Health Act confidentiality and Digital Health Act requirements
for reliable records, controlled access, auditability, and prevention of
privilege abuse. The database grant is deliberately limited to the two
functions required for scheduling rather than expanding the application
account to database-owner or unrestricted privileges.

The verification used the existing clearly synthetic patient
`P000001004`/`UHID2026001004`. No real patient data or external payment service
was used.
