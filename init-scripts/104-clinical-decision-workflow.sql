-- Keep clinical decisions explicit across consultation, diagnostics, pharmacy,
-- and billing. These constraints protect the workflow even if a client sends
-- an invalid combination of fields.

ALTER TABLE consultation_records
  ADD COLUMN IF NOT EXISTS clinical_outcome VARCHAR(32),
  ADD COLUMN IF NOT EXISTS investigation_reason TEXT;

UPDATE consultation_records
SET clinical_outcome = CASE
  WHEN NULLIF(TRIM(final_diagnosis), '') IS NOT NULL THEN 'diagnosis-confirmed'
  WHEN has_lab_orders OR has_radiology_orders THEN 'investigations-pending'
  ELSE 'no-treatment-required'
END
WHERE clinical_outcome IS NULL;

ALTER TABLE consultation_records
  ALTER COLUMN clinical_outcome SET NOT NULL;

ALTER TABLE consultation_records
  DROP CONSTRAINT IF EXISTS chk_consultation_clinical_outcome;

ALTER TABLE consultation_records
  ADD CONSTRAINT chk_consultation_clinical_outcome CHECK (
    clinical_outcome IN (
      'investigations-pending',
      'diagnosis-confirmed',
      'no-treatment-required'
    )
    AND (
      clinical_outcome <> 'investigations-pending'
      OR ((has_lab_orders OR has_radiology_orders) AND NOT has_prescriptions)
    )
    AND (
      clinical_outcome <> 'diagnosis-confirmed'
      OR NULLIF(TRIM(final_diagnosis), '') IS NOT NULL
    )
    AND (
      clinical_outcome <> 'no-treatment-required'
      OR NOT has_prescriptions
    )
  );

CREATE OR REPLACE FUNCTION enforce_consultation_prescription_diagnosis()
RETURNS TRIGGER AS $$
DECLARE
  recorded_outcome VARCHAR(32);
  recorded_diagnosis TEXT;
BEGIN
  IF NEW.consultation_record_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT clinical_outcome, final_diagnosis
  INTO recorded_outcome, recorded_diagnosis
  FROM consultation_records
  WHERE id = NEW.consultation_record_id;

  IF recorded_outcome <> 'diagnosis-confirmed'
     OR NULLIF(TRIM(recorded_diagnosis), '') IS NULL THEN
    RAISE EXCEPTION 'A consultation prescription requires a recorded final diagnosis';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_consultation_prescription_diagnosis ON prescriptions;
CREATE TRIGGER trg_consultation_prescription_diagnosis
  BEFORE INSERT OR UPDATE OF consultation_record_id ON prescriptions
  FOR EACH ROW
  EXECUTE FUNCTION enforce_consultation_prescription_diagnosis();

CREATE INDEX IF NOT EXISTS idx_consultation_records_clinical_outcome
  ON consultation_records(clinical_outcome);

GRANT SELECT, INSERT, UPDATE ON consultation_records TO medimesh_user;
