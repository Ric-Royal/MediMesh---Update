\c medimesh;

-- One appointment represents one visit. The partial unique index makes the
-- check-in handoff retry-safe while preserving encounters created without an
-- appointment.
CREATE UNIQUE INDEX IF NOT EXISTS idx_encounters_unique_appointment
  ON encounters(appointment_id)
  WHERE appointment_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_queue_unique_active_stage
  ON queue_entries(encounter_id, queue_type)
  WHERE status IN ('waiting', 'called', 'in-service', 'deferred');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'encounters_appointment_id_fkey'
      AND conrelid = 'encounters'::regclass
  ) THEN
    ALTER TABLE encounters
      ADD CONSTRAINT encounters_appointment_id_fkey
      FOREIGN KEY (appointment_id)
      REFERENCES appointments(id)
      ON DELETE SET NULL;
  END IF;
END;
$$;

-- Recover legacy check-ins accepted before check-in created an encounter and
-- triage queue entry. Appointment timestamps are evaluated in facility time.
WITH facility_timezone AS (
  SELECT CASE
    WHEN EXISTS (
      SELECT 1
      FROM pg_timezone_names
      WHERE name = COALESCE(
        (SELECT TRIM(BOTH '"' FROM value::text)
         FROM system_settings
         WHERE key = 'organization.timezone'
         LIMIT 1),
        'Africa/Nairobi'
      )
    )
    THEN COALESCE(
      (SELECT TRIM(BOTH '"' FROM value::text)
       FROM system_settings
       WHERE key = 'organization.timezone'
       LIMIT 1),
      'Africa/Nairobi'
    )
    ELSE 'Africa/Nairobi'
  END AS name
)
INSERT INTO encounters (
  patient_id,
  appointment_id,
  encounter_type,
  status,
  triage_level,
  clinic_id,
  department_id,
  doctor_id,
  chief_complaint,
  payment_type,
  waiting_location,
  created_by,
  registration_time
)
SELECT
  a.patient_id,
  a.id,
  CASE WHEN a.appointment_type = 'follow-up' THEN 'follow-up' ELSE 'outpatient' END,
  'waiting',
  'routine',
  a.clinic_id,
  a.department_id,
  a.doctor_id,
  a.reason_for_visit,
  COALESCE(a.payment_type, 'cash'),
  'triage-waiting',
  a.checked_in_by,
  COALESCE(a.checked_in_at, NOW())
FROM appointments a
CROSS JOIN facility_timezone tz
WHERE a.status = 'checked-in'
  AND NOT EXISTS (
    SELECT 1 FROM encounters e WHERE e.appointment_id = a.id
  )
  AND (
    (a.scheduled_date + a.scheduled_time) AT TIME ZONE tz.name
  ) BETWEEN NOW() - INTERVAL '12 hours' AND NOW() + INTERVAL '60 minutes'
ON CONFLICT DO NOTHING;

UPDATE appointments a
SET encounter_id = e.id,
    updated_at = NOW()
FROM encounters e
WHERE e.appointment_id = a.id
  AND a.status = 'checked-in'
  AND a.encounter_id IS DISTINCT FROM e.id;

INSERT INTO queue_entries (
  encounter_id,
  patient_id,
  clinic_id,
  doctor_id,
  queue_type,
  queue_position,
  priority_level,
  joined_at,
  status,
  waiting_location,
  is_emergency
)
SELECT
  e.id,
  e.patient_id,
  e.clinic_id,
  e.doctor_id,
  'triage',
  COALESCE((
    SELECT MAX(q.queue_position) + 1
    FROM queue_entries q
    WHERE q.queue_type = 'triage'
      AND q.status IN ('waiting', 'called', 'in-service', 'deferred')
      AND q.clinic_id IS NOT DISTINCT FROM e.clinic_id
  ), 1),
  5,
  COALESCE(a.checked_in_at, NOW()),
  'waiting',
  'triage-waiting',
  false
FROM encounters e
JOIN appointments a ON a.id = e.appointment_id
WHERE a.status = 'checked-in'
  AND NOT EXISTS (
    SELECT 1
    FROM queue_entries q
    WHERE q.encounter_id = e.id
      AND q.queue_type = 'triage'
      AND q.status IN ('waiting', 'called', 'in-service', 'deferred')
  )
ON CONFLICT DO NOTHING;

-- A future appointment is not checked in merely because it was edited. Legacy
-- premature check-ins are returned to scheduled and can be checked in only
-- after staff changes the appointment into the allowed visit window.
WITH facility_timezone AS (
  SELECT CASE
    WHEN EXISTS (
      SELECT 1
      FROM pg_timezone_names
      WHERE name = COALESCE(
        (SELECT TRIM(BOTH '"' FROM value::text)
         FROM system_settings
         WHERE key = 'organization.timezone'
         LIMIT 1),
        'Africa/Nairobi'
      )
    )
    THEN COALESCE(
      (SELECT TRIM(BOTH '"' FROM value::text)
       FROM system_settings
       WHERE key = 'organization.timezone'
       LIMIT 1),
      'Africa/Nairobi'
    )
    ELSE 'Africa/Nairobi'
  END AS name
)
UPDATE appointments a
SET status = 'scheduled',
    checked_in_at = NULL,
    checked_in_by = NULL,
    updated_at = NOW()
FROM facility_timezone tz
WHERE a.status = 'checked-in'
  AND NOT EXISTS (
    SELECT 1 FROM encounters e WHERE e.appointment_id = a.id
  )
  AND (
    (a.scheduled_date + a.scheduled_time) AT TIME ZONE tz.name
  ) > NOW() + INTERVAL '60 minutes';
