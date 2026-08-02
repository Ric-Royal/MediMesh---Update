-- Keep every clinical artifact connected to the encounter that produced it.
-- This migration is additive and preserves existing patient records.

ALTER TABLE medical_records
  ADD COLUMN IF NOT EXISTS encounter_id UUID REFERENCES encounters(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS consultation_record_id UUID REFERENCES consultation_records(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_medical_records_encounter
  ON medical_records(encounter_id, record_date DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_medical_records_consultation
  ON medical_records(consultation_record_id)
  WHERE consultation_record_id IS NOT NULL;

WITH candidate_matches AS (
  SELECT
    mr.id AS medical_record_id,
    cr.id AS consultation_record_id,
    cr.encounter_id,
    ROW_NUMBER() OVER (
      PARTITION BY mr.id
      ORDER BY ABS(EXTRACT(EPOCH FROM (mr.created_at - cr.created_at)))
    ) AS match_rank
  FROM medical_records mr
  JOIN consultation_records cr ON cr.patient_id = mr.patient_id
  WHERE mr.encounter_id IS NULL
    AND mr.record_type = 'consultation'
    AND ABS(EXTRACT(EPOCH FROM (mr.created_at - cr.created_at))) <= 172800
)
UPDATE medical_records mr
SET encounter_id = matched.encounter_id,
    consultation_record_id = matched.consultation_record_id
FROM candidate_matches matched
WHERE matched.medical_record_id = mr.id
  AND matched.match_rank = 1;

ALTER TABLE file_attachments
  ADD COLUMN IF NOT EXISTS encounter_id UUID REFERENCES encounters(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS lab_order_id UUID REFERENCES lab_orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS radiology_order_id UUID REFERENCES radiology_orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS prescription_id INTEGER REFERENCES prescriptions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS admission_id UUID REFERENCES admissions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_file_attachments_encounter
  ON file_attachments(encounter_id, upload_date DESC)
  WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_file_attachments_lab_order
  ON file_attachments(lab_order_id)
  WHERE is_active = TRUE AND lab_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_file_attachments_radiology_order
  ON file_attachments(radiology_order_id)
  WHERE is_active = TRUE AND radiology_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_file_attachments_prescription
  ON file_attachments(prescription_id)
  WHERE is_active = TRUE AND prescription_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_file_attachments_admission
  ON file_attachments(admission_id)
  WHERE is_active = TRUE AND admission_id IS NOT NULL;

UPDATE file_attachments attachment
SET encounter_id = record.encounter_id
FROM medical_records record
WHERE attachment.medical_record_id = record.id
  AND attachment.encounter_id IS NULL
  AND record.encounter_id IS NOT NULL;

ALTER TABLE consultation_records
  ADD COLUMN IF NOT EXISTS patient_disposition VARCHAR(30) NOT NULL DEFAULT 'outpatient',
  ADD COLUMN IF NOT EXISTS admission_id UUID REFERENCES admissions(id) ON DELETE SET NULL;

ALTER TABLE consultation_records
  DROP CONSTRAINT IF EXISTS consultation_records_patient_disposition_check;
ALTER TABLE consultation_records
  ADD CONSTRAINT consultation_records_patient_disposition_check
  CHECK (patient_disposition IN ('outpatient', 'admit'));

ALTER TABLE encounters DROP CONSTRAINT IF EXISTS encounters_status_check;
ALTER TABLE encounters
  ADD CONSTRAINT encounters_status_check CHECK (
    status IN (
      'registered', 'waiting', 'triage', 'in-consultation', 'pending-lab',
      'pending-radiology', 'pending-pharmacy', 'admitted', 'completed',
      'cancelled', 'no-show'
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_admissions_one_active_encounter
  ON admissions(encounter_id)
  WHERE status IN ('admitted', 'under-care', 'pending-discharge');
