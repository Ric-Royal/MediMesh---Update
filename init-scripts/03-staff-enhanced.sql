-- =============================================================================
-- ENHANCED STAFF MANAGEMENT
-- Migration 03: Staff table with clinical assignments and scheduling
-- =============================================================================

-- Ensure we're connected to the medimesh database
\c medimesh;

-- Create staff table if it doesn't exist
CREATE TABLE IF NOT EXISTS staff (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_number VARCHAR(50) UNIQUE NOT NULL,
    keycloak_user_id VARCHAR(100),

    -- Personal information
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(200) UNIQUE NOT NULL,
    phone_number VARCHAR(20),
    profile_photo VARCHAR(500),

    -- Professional information
    role VARCHAR(50) NOT NULL,
    specialization VARCHAR(200),
    license_number VARCHAR(100),
    license_expiry DATE,

    -- Organizational assignment
    department_id UUID REFERENCES departments(id),
    primary_clinic_id UUID REFERENCES clinics(id),

    -- Scheduling preferences
    employment_type VARCHAR(20) DEFAULT 'full-time',
    is_available BOOLEAN DEFAULT TRUE,
    max_appointments_per_day INTEGER DEFAULT 20,
    consultation_duration_minutes INTEGER DEFAULT 30,

    -- Status
    hire_date DATE DEFAULT CURRENT_DATE,
    status VARCHAR(20) DEFAULT 'active',

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),

    CHECK (role IN ('doctor', 'nurse', 'receptionist', 'lab-tech', 'radiologist',
                    'pharmacist', 'admin', 'manager', 'cleaner', 'security')),
    CHECK (employment_type IN ('full-time', 'part-time', 'consultant', 'locum')),
    CHECK (status IN ('active', 'on-leave', 'suspended', 'terminated'))
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_staff_number ON staff(staff_number);
CREATE INDEX IF NOT EXISTS idx_staff_email ON staff(email);
CREATE INDEX IF NOT EXISTS idx_staff_role ON staff(role);
CREATE INDEX IF NOT EXISTS idx_staff_department ON staff(department_id);
CREATE INDEX IF NOT EXISTS idx_staff_clinic ON staff(primary_clinic_id);
CREATE INDEX IF NOT EXISTS idx_staff_status ON staff(status);
CREATE INDEX IF NOT EXISTS idx_staff_available ON staff(is_available);

-- Sample staff members
INSERT INTO staff (staff_number, first_name, last_name, email, role, specialization, department_id, primary_clinic_id, consultation_duration_minutes) VALUES
('DOC001', 'James', 'Anderson', 'j.anderson@medimesh.com', 'doctor', 'General Medicine',
    (SELECT id FROM departments WHERE department_code = 'GEN_MED'),
    (SELECT id FROM clinics WHERE clinic_code = 'ANDERSON'), 30),
('DOC002', 'Sarah', 'Williams', 's.williams@medimesh.com', 'doctor', 'Pediatrics',
    (SELECT id FROM departments WHERE department_code = 'PEDIATRICS'),
    (SELECT id FROM clinics WHERE clinic_code = 'PEDIATRIC'), 20),
('DOC003', 'Robert', 'Chen', 'r.chen@medimesh.com', 'doctor', 'Cardiology',
    (SELECT id FROM departments WHERE department_code = 'CARDIOLOGY'),
    (SELECT id FROM clinics WHERE clinic_code = 'CARDIAC'), 45),
('DOC004', 'Emily', 'Brown', 'e.brown@medimesh.com', 'doctor', 'General Surgery',
    (SELECT id FROM departments WHERE department_code = 'SURGERY'),
    (SELECT id FROM clinics WHERE clinic_code = 'SURGICAL'), 40),
('DOC005', 'Michael', 'Davis', 'm.davis@medimesh.com', 'doctor', 'Obstetrics',
    (SELECT id FROM departments WHERE department_code = 'OB_GYN'),
    (SELECT id FROM clinics WHERE clinic_code = 'MATERNITY'), 30),
('NUR001', 'Mary', 'Johnson', 'm.johnson@medimesh.com', 'nurse', 'General Nursing',
    (SELECT id FROM departments WHERE department_code = 'GEN_MED'), NULL, NULL),
('NUR002', 'Patricia', 'Wilson', 'p.wilson@medimesh.com', 'nurse', 'Pediatric Nursing',
    (SELECT id FROM departments WHERE department_code = 'PEDIATRICS'), NULL, NULL),
('NUR003', 'Linda', 'Martinez', 'l.martinez@medimesh.com', 'nurse', 'Surgical Nursing',
    (SELECT id FROM departments WHERE department_code = 'SURGERY'), NULL, NULL),
('REC001', 'Alice', 'Taylor', 'a.taylor@medimesh.com', 'receptionist', NULL, NULL, NULL, NULL),
('REC002', 'Susan', 'Moore', 's.moore@medimesh.com', 'receptionist', NULL, NULL, NULL, NULL),
('LAB001', 'David', 'Garcia', 'd.garcia@medimesh.com', 'lab-tech', 'Clinical Chemistry',
    (SELECT id FROM departments WHERE department_code = 'GEN_MED'), NULL, NULL),
('LAB002', 'Jennifer', 'Lee', 'j.lee@medimesh.com', 'lab-tech', 'Hematology',
    (SELECT id FROM departments WHERE department_code = 'GEN_MED'), NULL, NULL),
('PHAR001', 'Thomas', 'White', 't.white@medimesh.com', 'pharmacist', 'Clinical Pharmacy', NULL, NULL, NULL)
ON CONFLICT (staff_number) DO NOTHING;

-- Update department heads
UPDATE departments SET head_of_department_id = (SELECT id FROM staff WHERE staff_number = 'DOC001') WHERE department_code = 'GEN_MED';
UPDATE departments SET head_of_department_id = (SELECT id FROM staff WHERE staff_number = 'DOC002') WHERE department_code = 'PEDIATRICS';
UPDATE departments SET head_of_department_id = (SELECT id FROM staff WHERE staff_number = 'DOC003') WHERE department_code = 'CARDIOLOGY';
UPDATE departments SET head_of_department_id = (SELECT id FROM staff WHERE staff_number = 'DOC004') WHERE department_code = 'SURGERY';

-- Success message
DO $$
BEGIN
    RAISE NOTICE 'Migration 03 completed: Staff table created with % members', (SELECT COUNT(*) FROM staff);
END $$;
