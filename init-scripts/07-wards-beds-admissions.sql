-- =============================================================================
-- WARDS AND BEDS - Inpatient bed management
-- Migration 07: Ward occupancy tracking (Kranium Screen #3)
-- =============================================================================

-- Ensure we're connected to the medimesh database
\c medimesh;

-- Wards
CREATE TABLE IF NOT EXISTS wards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ward_code VARCHAR(20) UNIQUE NOT NULL,
    ward_name VARCHAR(200) NOT NULL,
    ward_type VARCHAR(50) NOT NULL,
    location_id UUID REFERENCES locations(id),
    department_id UUID REFERENCES departments(id),

    -- Capacity
    total_beds INTEGER NOT NULL,
    available_beds INTEGER,

    -- Management
    nurse_station_location VARCHAR(100),
    head_nurse_id UUID REFERENCES staff(id),

    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),

    CHECK (ward_type IN ('general', 'icu', 'maternity', 'pediatric', 'isolation',
                        'surgical', 'medical', 'emergency'))
);

CREATE INDEX IF NOT EXISTS idx_wards_code ON wards(ward_code);
CREATE INDEX IF NOT EXISTS idx_wards_type ON wards(ward_type);
CREATE INDEX IF NOT EXISTS idx_wards_department ON wards(department_id);
CREATE INDEX IF NOT EXISTS idx_wards_active ON wards(is_active);

-- Sample wards
INSERT INTO wards (ward_code, ward_name, ward_type, total_beds, available_beds, department_id) VALUES
('ICU', 'Intensive Care Unit', 'icu', 10, 10, NULL),
('MAT', 'Maternity Ward', 'maternity', 20, 20,
    (SELECT id FROM departments WHERE department_code = 'OB_GYN')),
('GEN_A', 'General Ward A', 'general', 30, 30,
    (SELECT id FROM departments WHERE department_code = 'GEN_MED')),
('PED', 'Pediatric Ward', 'pediatric', 15, 15,
    (SELECT id FROM departments WHERE department_code = 'PEDIATRICS')),
('SURG', 'Surgical Ward', 'surgical', 25, 25,
    (SELECT id FROM departments WHERE department_code = 'SURGERY')),
('ISO', 'Isolation Ward', 'isolation', 8, 8, NULL)
ON CONFLICT (ward_code) DO NOTHING;

-- Beds
CREATE TABLE IF NOT EXISTS beds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ward_id UUID NOT NULL REFERENCES wards(id) ON DELETE CASCADE,
    bed_number VARCHAR(20) NOT NULL,
    bed_type VARCHAR(50) NOT NULL,

    -- Status
    status VARCHAR(20) DEFAULT 'available',

    -- Assignment
    location_id UUID REFERENCES locations(id),
    assigned_doctor_id UUID REFERENCES staff(id),

    -- Pricing
    daily_rate DECIMAL(10,2),

    -- Features
    features JSONB,

    -- Maintenance
    last_cleaned TIMESTAMP,
    last_maintenance TIMESTAMP,
    maintenance_notes TEXT,

    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),

    UNIQUE(ward_id, bed_number),
    CHECK (bed_type IN ('standard', 'icu', 'isolation', 'oxygen', 'electric', 'bariatric')),
    CHECK (status IN ('available', 'occupied', 'reserved', 'maintenance', 'cleaning', 'out-of-service'))
);

CREATE INDEX IF NOT EXISTS idx_beds_ward ON beds(ward_id);
CREATE INDEX IF NOT EXISTS idx_beds_status ON beds(status);
CREATE INDEX IF NOT EXISTS idx_beds_doctor ON beds(assigned_doctor_id);
CREATE INDEX IF NOT EXISTS idx_beds_active ON beds(is_active);

-- Sample beds for each ward
INSERT INTO beds (ward_id, bed_number, bed_type, status, daily_rate)
SELECT
    w.id,
    w.ward_code || '-BED' || LPAD(generate_series::TEXT, 2, '0'),
    CASE w.ward_type
        WHEN 'icu' THEN 'icu'
        WHEN 'isolation' THEN 'isolation'
        ELSE 'standard'
    END,
    'available',
    CASE w.ward_type
        WHEN 'icu' THEN 5000.00
        WHEN 'isolation' THEN 3000.00
        WHEN 'maternity' THEN 2000.00
        ELSE 1500.00
    END
FROM wards w
CROSS JOIN generate_series(1, w.total_beds)
ON CONFLICT (ward_id, bed_number) DO NOTHING;

-- Admissions
CREATE TABLE IF NOT EXISTS admissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admission_number VARCHAR(50) UNIQUE NOT NULL,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    encounter_id UUID NOT NULL REFERENCES encounters(id),

    -- Bed assignment
    ward_id UUID NOT NULL REFERENCES wards(id),
    bed_id UUID NOT NULL REFERENCES beds(id),
    room_number VARCHAR(20),

    -- Clinical
    admission_date TIMESTAMP DEFAULT NOW(),
    expected_discharge_date DATE,
    actual_discharge_date TIMESTAMP,
    admission_type VARCHAR(50) NOT NULL,
    admitting_doctor_id UUID NOT NULL REFERENCES staff(id),
    consultant_doctor_id UUID REFERENCES staff(id),
    department_id UUID REFERENCES departments(id),

    -- Reason
    reason_for_admission TEXT NOT NULL,
    diagnosis TEXT,
    discharge_summary TEXT,
    discharge_instructions TEXT,

    -- Status
    status VARCHAR(30) DEFAULT 'admitted',

    -- Administrative
    payment_type VARCHAR(20) DEFAULT 'self-pay',
    corporate_scheme VARCHAR(200),
    insurance_auth_number VARCHAR(100),

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),

    CHECK (admission_type IN ('emergency', 'elective', 'transfer', 'observation', 'day-case')),
    CHECK (status IN ('admitted', 'under-care', 'pending-discharge', 'discharged',
                      'transferred', 'absconded', 'deceased')),
    CHECK (payment_type IN ('self-pay', 'corporate', 'insurance', 'government'))
);

CREATE INDEX IF NOT EXISTS idx_admissions_number ON admissions(admission_number);
CREATE INDEX IF NOT EXISTS idx_admissions_patient ON admissions(patient_id);
CREATE INDEX IF NOT EXISTS idx_admissions_encounter ON admissions(encounter_id);
CREATE INDEX IF NOT EXISTS idx_admissions_ward ON admissions(ward_id);
CREATE INDEX IF NOT EXISTS idx_admissions_bed ON admissions(bed_id);
CREATE INDEX IF NOT EXISTS idx_admissions_status ON admissions(status);
CREATE INDEX IF NOT EXISTS idx_admissions_date ON admissions(admission_date);
CREATE INDEX IF NOT EXISTS idx_admissions_doctor ON admissions(admitting_doctor_id);

-- Sequence for admission number
CREATE SEQUENCE IF NOT EXISTS admission_sequence START 1;

-- Function to auto-generate admission number
CREATE OR REPLACE FUNCTION generate_admission_number()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.admission_number IS NULL THEN
        NEW.admission_number := 'ADM' || TO_CHAR(NOW(), 'YYYYMMDD') ||
                               LPAD(NEXTVAL('admission_sequence')::TEXT, 5, '0');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_admission_number ON admissions;
CREATE TRIGGER set_admission_number
    BEFORE INSERT ON admissions
    FOR EACH ROW
    EXECUTE FUNCTION generate_admission_number();

-- Function to update bed status on admission
CREATE OR REPLACE FUNCTION update_bed_on_admission()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE beds SET status = 'occupied' WHERE id = NEW.bed_id;
        UPDATE wards SET available_beds = available_beds - 1 WHERE id = NEW.ward_id;
    ELSIF TG_OP = 'UPDATE' AND NEW.status = 'discharged' AND OLD.status != 'discharged' THEN
        UPDATE beds SET status = 'cleaning' WHERE id = NEW.bed_id;
        UPDATE wards SET available_beds = available_beds + 1 WHERE id = NEW.ward_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS manage_bed_occupancy ON admissions;
CREATE TRIGGER manage_bed_occupancy
    AFTER INSERT OR UPDATE ON admissions
    FOR EACH ROW
    EXECUTE FUNCTION update_bed_on_admission();

-- Success message
DO $$
DECLARE
    ward_count INTEGER;
    bed_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO ward_count FROM wards;
    SELECT COUNT(*) INTO bed_count FROM beds;
    RAISE NOTICE 'Migration 07 completed: Created % wards with % beds total', ward_count, bed_count;
END $$;
