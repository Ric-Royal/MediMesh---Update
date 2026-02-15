-- ============================================
-- MediMesh P0: Structured Clinical Data
-- Migration Script
-- ============================================
-- Replaces free-text diagnosis/examination with coded, queryable structures
-- Aligns with HL7 FHIR: Encounter → Diagnoses, Observations, Clinical Notes
-- ============================================

\c medimesh;

-- ============================================
-- 1. ENCOUNTER DIAGNOSES (coded, not free text)
-- ============================================
CREATE TABLE IF NOT EXISTS encounter_diagnoses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  encounter_id UUID NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
  consultation_record_id UUID,  -- links back to consultation_records if needed
  
  -- Coding
  code_system VARCHAR(30) NOT NULL DEFAULT 'ICD-10' CHECK (code_system IN ('ICD-10', 'ICD-11', 'SNOMED-CT', 'LOCAL')),
  code VARCHAR(50) NOT NULL,
  display VARCHAR(500) NOT NULL,  -- Human-readable diagnosis name
  
  -- Classification
  diagnosis_type VARCHAR(30) DEFAULT 'provisional' CHECK (diagnosis_type IN ('provisional', 'differential', 'final', 'admitting', 'discharge')),
  is_primary BOOLEAN DEFAULT FALSE,
  sequence_number INTEGER DEFAULT 1,
  
  -- Clinical details
  onset_date DATE,
  resolved_date DATE,
  severity VARCHAR(20) CHECK (severity IN ('mild', 'moderate', 'severe', 'critical')),
  certainty VARCHAR(20) CHECK (certainty IN ('confirmed', 'probable', 'suspected', 'ruled-out')),
  body_site VARCHAR(200),
  laterality VARCHAR(10) CHECK (laterality IN ('left', 'right', 'bilateral', 'N/A')),
  
  -- Notes
  clinical_notes TEXT,
  
  -- Audit
  recorded_by UUID REFERENCES staff(id),
  recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_by UUID REFERENCES staff(id),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Tenant
  tenant_id UUID REFERENCES organizations(id)
);

CREATE INDEX IF NOT EXISTS idx_enc_diag_encounter ON encounter_diagnoses(encounter_id);
CREATE INDEX IF NOT EXISTS idx_enc_diag_code ON encounter_diagnoses(code_system, code);
CREATE INDEX IF NOT EXISTS idx_enc_diag_primary ON encounter_diagnoses(encounter_id, is_primary) WHERE is_primary = TRUE;
CREATE INDEX IF NOT EXISTS idx_enc_diag_type ON encounter_diagnoses(diagnosis_type);

-- ============================================
-- 2. OBSERVATIONS (vitals, measurements, exam findings)
-- ============================================
CREATE TABLE IF NOT EXISTS observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  encounter_id UUID NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id),
  
  -- Observation type
  obs_category VARCHAR(30) NOT NULL CHECK (obs_category IN ('vital-signs', 'laboratory', 'exam-finding', 'social-history', 'survey', 'procedure')),
  obs_type VARCHAR(100) NOT NULL,  -- e.g., 'blood_pressure', 'temperature', 'heart_rate'
  
  -- Coding (LOINC or local)
  code_system VARCHAR(30) DEFAULT 'LOCAL' CHECK (code_system IN ('LOINC', 'SNOMED-CT', 'LOCAL')),
  code VARCHAR(50),
  display VARCHAR(300),
  
  -- Value (one of these)
  value_numeric DECIMAL(12, 4),
  value_text VARCHAR(1000),
  value_boolean BOOLEAN,
  value_datetime TIMESTAMP,
  value_code VARCHAR(100),     -- coded value (e.g., 'positive', 'negative')
  
  -- Units & reference
  unit VARCHAR(50),            -- e.g., 'mmHg', 'C', 'bpm'
  reference_low DECIMAL(12, 4),
  reference_high DECIMAL(12, 4),
  reference_text VARCHAR(200), -- e.g., '36.1-37.2°C'
  
  -- Interpretation
  interpretation VARCHAR(20) CHECK (interpretation IN ('normal', 'abnormal', 'high', 'low', 'critical-high', 'critical-low', 'positive', 'negative')),
  is_abnormal BOOLEAN DEFAULT FALSE,
  
  -- Components (for composite observations like BP: systolic/diastolic)
  parent_observation_id UUID REFERENCES observations(id),
  component_name VARCHAR(100),  -- e.g., 'systolic', 'diastolic'
  
  -- Context
  body_site VARCHAR(200),
  method VARCHAR(200),          -- e.g., 'auscultation', 'palpation'
  device VARCHAR(200),          -- measuring device
  
  -- Audit
  taken_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  taken_by UUID REFERENCES staff(id),
  verified_by UUID REFERENCES staff(id),
  verified_at TIMESTAMP,
  
  status VARCHAR(20) DEFAULT 'final' CHECK (status IN ('preliminary', 'final', 'amended', 'corrected', 'cancelled', 'entered-in-error')),
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  tenant_id UUID REFERENCES organizations(id)
);

CREATE INDEX IF NOT EXISTS idx_obs_encounter ON observations(encounter_id);
CREATE INDEX IF NOT EXISTS idx_obs_patient ON observations(patient_id);
CREATE INDEX IF NOT EXISTS idx_obs_type ON observations(obs_category, obs_type);
CREATE INDEX IF NOT EXISTS idx_obs_code ON observations(code_system, code);
CREATE INDEX IF NOT EXISTS idx_obs_abnormal ON observations(is_abnormal) WHERE is_abnormal = TRUE;
CREATE INDEX IF NOT EXISTS idx_obs_taken ON observations(taken_at);

-- ============================================
-- 3. CLINICAL NOTES (SOAP structure)
-- ============================================
CREATE TABLE IF NOT EXISTS clinical_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  encounter_id UUID NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id),
  
  -- Note metadata
  note_type VARCHAR(30) NOT NULL DEFAULT 'progress' CHECK (note_type IN (
    'progress', 'admission', 'discharge', 'procedure', 'consultation',
    'nursing', 'therapy', 'dietary', 'social-work', 'referral'
  )),
  title VARCHAR(300),
  
  -- SOAP format
  subjective TEXT,     -- Patient's symptoms, complaints, history
  objective TEXT,      -- Physical exam findings, observations, test results
  assessment TEXT,     -- Diagnosis, clinical reasoning
  plan TEXT,           -- Treatment plan, orders, follow-up
  
  -- Additional fields
  education TEXT,      -- Patient education provided
  follow_up TEXT,      -- Follow-up instructions
  
  -- Status
  status VARCHAR(20) DEFAULT 'final' CHECK (status IN ('draft', 'final', 'amended', 'entered-in-error')),
  is_addendum BOOLEAN DEFAULT FALSE,
  parent_note_id UUID REFERENCES clinical_notes(id),  -- For addenda
  
  -- Audit
  author_staff_id UUID NOT NULL REFERENCES staff(id),
  co_signer_id UUID REFERENCES staff(id),
  co_signed_at TIMESTAMP,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  signed_at TIMESTAMP,
  tenant_id UUID REFERENCES organizations(id)
);

CREATE INDEX IF NOT EXISTS idx_notes_encounter ON clinical_notes(encounter_id);
CREATE INDEX IF NOT EXISTS idx_notes_patient ON clinical_notes(patient_id);
CREATE INDEX IF NOT EXISTS idx_notes_author ON clinical_notes(author_staff_id);
CREATE INDEX IF NOT EXISTS idx_notes_type ON clinical_notes(note_type);

-- ============================================
-- 4. CLINICAL NOTE SECTIONS (granular structured content)
-- ============================================
CREATE TABLE IF NOT EXISTS clinical_note_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id UUID NOT NULL REFERENCES clinical_notes(id) ON DELETE CASCADE,
  
  section VARCHAR(100) NOT NULL,  -- e.g., 'chief_complaint', 'hpi', 'review_of_systems'
  content TEXT NOT NULL,
  sequence_number INTEGER DEFAULT 0,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_note_sections_note ON clinical_note_sections(note_id);

-- ============================================
-- 5. PROCEDURES (coded)
-- ============================================
CREATE TABLE IF NOT EXISTS encounter_procedures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  encounter_id UUID NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id),
  
  -- Coding
  code_system VARCHAR(30) DEFAULT 'CPT' CHECK (code_system IN ('CPT', 'ICD-10-PCS', 'SNOMED-CT', 'LOCAL')),
  code VARCHAR(50),
  display VARCHAR(500) NOT NULL,
  
  -- Details
  category VARCHAR(50),  -- 'surgical', 'diagnostic', 'therapeutic'
  body_site VARCHAR(200),
  laterality VARCHAR(10) CHECK (laterality IN ('left', 'right', 'bilateral', 'N/A')),
  
  -- Timing
  performed_at TIMESTAMP,
  duration_minutes INTEGER,
  
  -- Performers
  primary_performer_id UUID REFERENCES staff(id),
  assistant_ids UUID[],  -- Array of staff IDs
  
  -- Outcome
  outcome VARCHAR(200),
  complications TEXT,
  
  -- Status
  status VARCHAR(20) DEFAULT 'completed' CHECK (status IN ('preparation', 'in-progress', 'completed', 'aborted', 'entered-in-error')),
  
  -- Billing
  is_billable BOOLEAN DEFAULT TRUE,
  base_charge DECIMAL(10, 2),
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  tenant_id UUID REFERENCES organizations(id)
);

CREATE INDEX IF NOT EXISTS idx_proc_encounter ON encounter_procedures(encounter_id);
CREATE INDEX IF NOT EXISTS idx_proc_code ON encounter_procedures(code_system, code);

-- ============================================
-- 6. PATIENT IDENTIFIERS (MRN, National ID, etc.)
-- ============================================
CREATE TABLE IF NOT EXISTS patient_identifiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  
  identifier_type VARCHAR(30) NOT NULL CHECK (identifier_type IN ('MRN', 'NATIONAL_ID', 'PASSPORT', 'NHIF', 'INSURANCE_MEMBER', 'BIRTH_CERT', 'OTHER')),
  identifier_value VARCHAR(100) NOT NULL,
  issuing_authority VARCHAR(200),
  
  is_primary BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  valid_from DATE,
  valid_to DATE,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  tenant_id UUID REFERENCES organizations(id)
);

CREATE INDEX IF NOT EXISTS idx_patient_ident_patient ON patient_identifiers(patient_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_patient_ident_unique ON patient_identifiers(identifier_type, identifier_value, tenant_id);

-- ============================================
-- 7. PATIENT CONTACTS / NEXT OF KIN
-- ============================================
CREATE TABLE IF NOT EXISTS patient_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  
  contact_type VARCHAR(30) NOT NULL CHECK (contact_type IN ('next_of_kin', 'emergency', 'guardian', 'employer', 'insurance')),
  relationship VARCHAR(50),  -- 'spouse', 'parent', 'child', 'sibling', 'friend'
  
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  phone VARCHAR(20),
  email VARCHAR(200),
  address TEXT,
  
  is_primary BOOLEAN DEFAULT FALSE,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  tenant_id UUID REFERENCES organizations(id)
);

CREATE INDEX IF NOT EXISTS idx_patient_contacts ON patient_contacts(patient_id);

-- ============================================
-- 8. ALLERGY RECORDS (structured, not free text)
-- ============================================
CREATE TABLE IF NOT EXISTS patient_allergies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  
  allergen_type VARCHAR(30) NOT NULL CHECK (allergen_type IN ('drug', 'food', 'environment', 'biological', 'other')),
  allergen_name VARCHAR(300) NOT NULL,
  allergen_code VARCHAR(50),  -- Drug code or substance code
  
  reaction VARCHAR(300),
  severity VARCHAR(20) CHECK (severity IN ('mild', 'moderate', 'severe', 'life-threatening')),
  onset_date DATE,
  
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'resolved', 'entered-in-error')),
  verification VARCHAR(20) DEFAULT 'unconfirmed' CHECK (verification IN ('confirmed', 'unconfirmed', 'refuted')),
  
  recorded_by UUID REFERENCES staff(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  tenant_id UUID REFERENCES organizations(id)
);

CREATE INDEX IF NOT EXISTS idx_allergies_patient ON patient_allergies(patient_id);
CREATE INDEX IF NOT EXISTS idx_allergies_active ON patient_allergies(patient_id, status) WHERE status = 'active';
