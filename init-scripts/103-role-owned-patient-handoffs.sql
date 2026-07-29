\c medimesh;

CREATE TABLE IF NOT EXISTS triage_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  encounter_id UUID NOT NULL UNIQUE REFERENCES encounters(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  performed_by UUID REFERENCES staff(id) ON DELETE SET NULL,
  triage_level VARCHAR(20) NOT NULL DEFAULT 'routine'
    CHECK (triage_level IN ('routine', 'urgent', 'emergency', 'critical')),
  vital_signs JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(vital_signs) = 'object'),
  chief_complaint TEXT,
  history_present_illness TEXT,
  past_medical_history TEXT,
  family_history TEXT,
  social_history TEXT,
  allergies TEXT,
  current_medications TEXT,
  notes TEXT,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_triage_assessments_patient
  ON triage_assessments(patient_id, completed_at DESC);

CREATE INDEX IF NOT EXISTS idx_triage_assessments_performer
  ON triage_assessments(performed_by, completed_at DESC);

REVOKE ALL ON triage_assessments FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON triage_assessments TO medimesh_user;

COMMENT ON TABLE triage_assessments IS
  'Role-attributed triage assessment linked to one patient encounter.';
