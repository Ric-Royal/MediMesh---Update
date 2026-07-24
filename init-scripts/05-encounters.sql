-- =============================================================================
-- ENCOUNTERS - Patient Visits
-- Migration 05: Core encounter tracking for every patient visit
-- =============================================================================

-- Ensure we're connected to the medimesh database
\c medimesh;

CREATE TABLE IF NOT EXISTS encounters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    encounter_number VARCHAR(50) UNIQUE NOT NULL,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    appointment_id UUID,

    -- Encounter type and status
    encounter_type VARCHAR(20) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'registered',
    triage_level VARCHAR(20) DEFAULT 'routine',

    -- Clinical context
    department_id UUID REFERENCES departments(id),
    clinic_id UUID REFERENCES clinics(id),
    doctor_id UUID REFERENCES staff(id),

    -- Location tracking
    waiting_location VARCHAR(100),
    current_location_id UUID REFERENCES locations(id),

    -- Timing
    registration_time TIMESTAMP DEFAULT NOW(),
    triage_time TIMESTAMP,
    consultation_start_time TIMESTAMP,
    consultation_end_time TIMESTAMP,
    total_waiting_minutes INTEGER,

    -- Clinical information
    chief_complaint TEXT,
    presenting_symptoms TEXT,
    vital_signs JSONB,

    -- Administrative
    payment_status VARCHAR(20) DEFAULT 'unpaid',
    payment_type VARCHAR(20) DEFAULT 'self-pay',
    corporate_scheme VARCHAR(200),

    -- Metadata
    referred_from VARCHAR(200),
    notes TEXT,
    created_by UUID,  -- Removed FK constraint - can be staff or system user
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),

    CHECK (encounter_type IN ('outpatient', 'inpatient', 'emergency', 'day-case', 'follow-up')),
    CHECK (status IN ('registered', 'waiting', 'triage', 'in-consultation', 'pending-lab',
                     'pending-radiology', 'pending-pharmacy', 'completed', 'cancelled', 'no-show')),
    CHECK (triage_level IN ('routine', 'urgent', 'emergency', 'critical')),
    CHECK (payment_status IN ('unpaid', 'partial', 'paid', 'billed-later', 'waived')),
    CHECK (payment_type IN ('self-pay', 'corporate', 'insurance', 'government', 'ngo'))
);

CREATE INDEX IF NOT EXISTS idx_encounters_number ON encounters(encounter_number);
CREATE INDEX IF NOT EXISTS idx_encounters_patient ON encounters(patient_id);
CREATE INDEX IF NOT EXISTS idx_encounters_appointment ON encounters(appointment_id);
CREATE INDEX IF NOT EXISTS idx_encounters_status ON encounters(status);
CREATE INDEX IF NOT EXISTS idx_encounters_triage ON encounters(triage_level);
CREATE INDEX IF NOT EXISTS idx_encounters_department ON encounters(department_id);
CREATE INDEX IF NOT EXISTS idx_encounters_clinic ON encounters(clinic_id);
CREATE INDEX IF NOT EXISTS idx_encounters_doctor ON encounters(doctor_id);
CREATE INDEX IF NOT EXISTS idx_encounters_registration_time ON encounters(registration_time);
CREATE INDEX IF NOT EXISTS idx_encounters_type ON encounters(encounter_type);
CREATE INDEX IF NOT EXISTS idx_encounters_date ON encounters(DATE(registration_time));

-- Sequence for encounter number
CREATE SEQUENCE IF NOT EXISTS encounter_sequence START 1;

-- Function to auto-generate encounter number
CREATE OR REPLACE FUNCTION generate_encounter_number()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.encounter_number IS NULL THEN
        NEW.encounter_number := 'ENC' || TO_CHAR(NOW(), 'YYYYMMDD') ||
                               LPAD(NEXTVAL('encounter_sequence')::TEXT, 5, '0');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_encounter_number ON encounters;
CREATE TRIGGER set_encounter_number
    BEFORE INSERT ON encounters
    FOR EACH ROW
    EXECUTE FUNCTION generate_encounter_number();

-- Function to calculate waiting time
CREATE OR REPLACE FUNCTION update_encounter_waiting_time()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.consultation_start_time IS NOT NULL AND NEW.registration_time IS NOT NULL THEN
        NEW.total_waiting_minutes := EXTRACT(EPOCH FROM
            (NEW.consultation_start_time - NEW.registration_time)) / 60;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS calculate_waiting_time ON encounters;
CREATE TRIGGER calculate_waiting_time
    BEFORE UPDATE ON encounters
    FOR EACH ROW
    EXECUTE FUNCTION update_encounter_waiting_time();

-- Sample encounters for existing patients
INSERT INTO encounters (patient_id, encounter_type, status, triage_level, clinic_id, doctor_id, chief_complaint, payment_type, waiting_location)
SELECT
    p.id,
    'outpatient',
    'waiting',
    'routine',
    (SELECT id FROM clinics WHERE clinic_code = 'GEN_OPD'),
    (SELECT id FROM staff WHERE staff_number = 'DOC001'),
    'Regular checkup',
    p.payment_type,
    'reception'
FROM patients p
LIMIT 3
ON CONFLICT DO NOTHING;

-- Success message
DO $$
DECLARE
    encounter_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO encounter_count FROM encounters;
    RAISE NOTICE 'Migration 05 completed: Created encounters table with % sample encounters', encounter_count;
END $$;
