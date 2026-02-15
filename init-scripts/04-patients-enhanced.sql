-- =============================================================================
-- ENHANCED PATIENT MODEL
-- Migration 04: Add UHID and Kranium-inspired fields to patients
-- =============================================================================

-- Ensure we're connected to the medimesh database
\c medimesh;

-- Add new columns to existing patients table
ALTER TABLE patients ADD COLUMN IF NOT EXISTS uhid VARCHAR(50) UNIQUE;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS national_id VARCHAR(50);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS corporate_scheme VARCHAR(200);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS payment_type VARCHAR(20) DEFAULT 'self-pay';
ALTER TABLE patients ADD COLUMN IF NOT EXISTS insurance_company VARCHAR(200);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS insurance_policy_number VARCHAR(100);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS emergency_contact_name VARCHAR(200);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS emergency_contact_phone VARCHAR(20);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS emergency_contact_relationship VARCHAR(50);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS occupation VARCHAR(100);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS marital_status VARCHAR(20);

-- Drop existing constraint if it exists
ALTER TABLE patients DROP CONSTRAINT IF EXISTS check_payment_type;
ALTER TABLE patients DROP CONSTRAINT IF EXISTS check_marital_status;

-- Add new constraints
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_payment_type') THEN
        ALTER TABLE patients ADD CONSTRAINT check_payment_type 
            CHECK (payment_type IN ('self-pay', 'corporate', 'insurance', 'government', 'ngo'));
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_marital_status') THEN
        ALTER TABLE patients ADD CONSTRAINT check_marital_status 
            CHECK (marital_status IN ('single', 'married', 'divorced', 'widowed', 'other'));
    END IF;
END $$;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_patients_uhid ON patients(uhid);
CREATE INDEX IF NOT EXISTS idx_patients_national_id ON patients(national_id);
CREATE INDEX IF NOT EXISTS idx_patients_payment_type ON patients(payment_type);
-- CREATE INDEX IF NOT EXISTS idx_patients_phone ON patients(phone_number);
CREATE INDEX IF NOT EXISTS idx_patients_email ON patients(email);
CREATE INDEX IF NOT EXISTS idx_patients_first_name ON patients(first_name);
CREATE INDEX IF NOT EXISTS idx_patients_last_name ON patients(last_name);

-- Full-text search index for patient search
CREATE INDEX IF NOT EXISTS idx_patients_fulltext ON patients 
    USING gin(to_tsvector('english', 
        COALESCE(first_name, '') || ' ' || 
        COALESCE(last_name, '') || ' ' || 
        COALESCE(email, '')
    ));

-- Create sequence for UHID generation
CREATE SEQUENCE IF NOT EXISTS uhid_sequence START 1000;

-- Function to auto-generate UHID with collision detection
CREATE OR REPLACE FUNCTION generate_uhid()
RETURNS TRIGGER AS $$
DECLARE
    new_uhid TEXT;
    max_attempts INTEGER := 10;
    attempt INTEGER := 0;
BEGIN
    IF NEW.uhid IS NULL THEN
        LOOP
            -- Generate UHID using sequence
            new_uhid := 'UHID' || TO_CHAR(NOW(), 'YYYY') || 
                       LPAD(NEXTVAL('uhid_sequence')::TEXT, 6, '0');
            
            -- Check if this UHID already exists
            IF NOT EXISTS (SELECT 1 FROM patients WHERE uhid = new_uhid) THEN
                NEW.uhid := new_uhid;
                EXIT; -- Success, exit loop
            END IF;
            
            -- Increment attempt counter
            attempt := attempt + 1;
            IF attempt >= max_attempts THEN
                RAISE EXCEPTION 'Failed to generate unique UHID after % attempts', max_attempts;
            END IF;
        END LOOP;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS set_patient_uhid ON patients;
CREATE TRIGGER set_patient_uhid
    BEFORE INSERT ON patients
    FOR EACH ROW
    EXECUTE FUNCTION generate_uhid();

-- Update existing patients with UHID if they don't have one
DO $$
DECLARE
    rec RECORD;
    counter INTEGER := 1000;
    max_counter INTEGER := 1000;
BEGIN
    FOR rec IN SELECT id FROM patients WHERE uhid IS NULL ORDER BY created_at
    LOOP
        UPDATE patients 
        SET uhid = 'UHID2025' || LPAD(counter::TEXT, 6, '0'),
            payment_type = COALESCE(payment_type, 'self-pay'),
            marital_status = COALESCE(marital_status, 'single')
        WHERE id = rec.id;
        max_counter := counter;
        counter := counter + 1;
    END LOOP;
    
    -- Reset the sequence to start after the last assigned UHID
    IF max_counter >= 1000 THEN
        PERFORM setval('uhid_sequence', max_counter + 1, false);
        RAISE NOTICE 'UHID sequence reset to start from %', max_counter + 1;
    END IF;
END $$;

-- Ensure UHID sequence is in sync with existing UHIDs
DO $$
DECLARE
    max_uhid_num INTEGER;
    current_year TEXT;
BEGIN
    current_year := TO_CHAR(NOW(), 'YYYY');
    
    -- Find the highest UHID number for the current year
    SELECT COALESCE(MAX(SUBSTRING(uhid FROM 9)::INTEGER), 999)
    INTO max_uhid_num
    FROM patients
    WHERE uhid LIKE 'UHID' || current_year || '%';
    
    -- Set sequence to start from the next available number
    PERFORM setval('uhid_sequence', max_uhid_num + 1, false);
    
    RAISE NOTICE 'UHID sequence synchronized: will start from %', max_uhid_num + 1;
END $$;

-- Ensure patient_id sequence is in sync with existing patient_ids
DO $$
DECLARE
    max_patient_num INTEGER;
BEGIN
    -- Find the highest patient_id number (extract numeric part from P000000123 format)
    SELECT COALESCE(MAX(SUBSTRING(patient_id FROM 2)::INTEGER), 999)
    INTO max_patient_num
    FROM patients
    WHERE patient_id ~ '^P[0-9]+$';
    
    -- Set sequence to start from the next available number
    PERFORM setval('patient_id_sequence', max_patient_num + 1, false);
    
    RAISE NOTICE 'Patient ID sequence synchronized: will start from %', max_patient_num + 1;
END $$;

-- Success message
DO $$
DECLARE
    patient_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO patient_count FROM patients;
    RAISE NOTICE 'Migration 04 completed: Enhanced % patients with UHID and payment tracking', patient_count;
END $$;

