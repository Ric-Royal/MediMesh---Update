-- =============================================================================
-- DEPARTMENTS, CLINICS, AND LOCATIONS
-- Migration 02: Core organizational structure for Kranium-inspired workflows
-- =============================================================================

-- Ensure we're connected to the medimesh database
\c medimesh;

-- Departments (organizational units)
CREATE TABLE IF NOT EXISTS departments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    department_code VARCHAR(20) UNIQUE NOT NULL,
    department_name VARCHAR(200) NOT NULL,
    description TEXT,
    head_of_department_id UUID,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_departments_code ON departments(department_code);
CREATE INDEX IF NOT EXISTS idx_departments_active ON departments(is_active);

-- Sample departments
INSERT INTO departments (department_code, department_name, description) VALUES
('GEN_MED', 'General Medicine', 'General medical consultations and primary care'),
('SURGERY', 'Surgery', 'Surgical procedures and post-operative care'),
('PEDIATRICS', 'Pediatrics', 'Child and adolescent healthcare'),
('OB_GYN', 'Obstetrics & Gynecology', 'Maternal and reproductive health'),
('CARDIOLOGY', 'Cardiology', 'Heart and cardiovascular care'),
('ORTHOPEDICS', 'Orthopedics', 'Musculoskeletal system care'),
('ENT', 'Ear, Nose & Throat', 'ENT specialist care'),
('OPHTHALMOLOGY', 'Ophthalmology', 'Eye care and vision'),
('DERMATOLOGY', 'Dermatology', 'Skin care'),
('RADIOLOGY', 'Radiology', 'Medical imaging and diagnostics')
ON CONFLICT (department_code) DO NOTHING;

-- Locations (physical spaces - hierarchical)
CREATE TABLE IF NOT EXISTS locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    location_code VARCHAR(50) UNIQUE NOT NULL,
    location_type VARCHAR(20) NOT NULL,
    location_name VARCHAR(200) NOT NULL,
    parent_location_id UUID REFERENCES locations(id),
    capacity INTEGER,
    is_active BOOLEAN DEFAULT TRUE,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),

    CHECK (location_type IN ('facility', 'building', 'floor', 'ward', 'room', 'bed'))
);

CREATE INDEX IF NOT EXISTS idx_locations_code ON locations(location_code);
CREATE INDEX IF NOT EXISTS idx_locations_type ON locations(location_type);
CREATE INDEX IF NOT EXISTS idx_locations_parent ON locations(parent_location_id);
CREATE INDEX IF NOT EXISTS idx_locations_active ON locations(is_active);

-- Sample location hierarchy
INSERT INTO locations (location_code, location_type, location_name, parent_location_id) VALUES
-- Main facility
('FAC_MAIN', 'facility', 'MediMesh Main Hospital', NULL)
ON CONFLICT (location_code) DO NOTHING;

-- Buildings
INSERT INTO locations (location_code, location_type, location_name, parent_location_id) VALUES
('BUILD_A', 'building', 'Building A - Outpatient',
    (SELECT id FROM locations WHERE location_code = 'FAC_MAIN')),
('BUILD_B', 'building', 'Building B - Inpatient',
    (SELECT id FROM locations WHERE location_code = 'FAC_MAIN'))
ON CONFLICT (location_code) DO NOTHING;

-- Floors
INSERT INTO locations (location_code, location_type, location_name, parent_location_id) VALUES
('BUILD_A_FL1', 'floor', 'Building A - Floor 1',
    (SELECT id FROM locations WHERE location_code = 'BUILD_A')),
('BUILD_A_FL2', 'floor', 'Building A - Floor 2',
    (SELECT id FROM locations WHERE location_code = 'BUILD_A')),
('BUILD_B_FL1', 'floor', 'Building B - Floor 1',
    (SELECT id FROM locations WHERE location_code = 'BUILD_B')),
('BUILD_B_FL2', 'floor', 'Building B - Floor 2',
    (SELECT id FROM locations WHERE location_code = 'BUILD_B'))
ON CONFLICT (location_code) DO NOTHING;

-- Clinics (sub-units within departments)
CREATE TABLE IF NOT EXISTS clinics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_code VARCHAR(20) UNIQUE NOT NULL,
    clinic_name VARCHAR(200) NOT NULL,
    department_id UUID REFERENCES departments(id) ON DELETE CASCADE,
    location_id UUID REFERENCES locations(id),
    is_active BOOLEAN DEFAULT TRUE,
    operating_hours JSONB,
    max_daily_capacity INTEGER DEFAULT 50,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clinics_code ON clinics(clinic_code);
CREATE INDEX IF NOT EXISTS idx_clinics_department ON clinics(department_id);
CREATE INDEX IF NOT EXISTS idx_clinics_active ON clinics(is_active);

-- Sample clinics
INSERT INTO clinics (clinic_code, clinic_name, department_id, max_daily_capacity) VALUES
('GEN_OPD', 'General Outpatient Department',
    (SELECT id FROM departments WHERE department_code = 'GEN_MED'), 60),
('ANDERSON', 'Anderson Clinic',
    (SELECT id FROM departments WHERE department_code = 'GEN_MED'), 40),
('CARDIAC', 'Cardiology Clinic',
    (SELECT id FROM departments WHERE department_code = 'CARDIOLOGY'), 30),
('PEDIATRIC', 'Children''s Clinic',
    (SELECT id FROM departments WHERE department_code = 'PEDIATRICS'), 50),
('SURGICAL', 'Surgical Outpatient Clinic',
    (SELECT id FROM departments WHERE department_code = 'SURGERY'), 35),
('MATERNITY', 'Maternity Clinic',
    (SELECT id FROM departments WHERE department_code = 'OB_GYN'), 45)
ON CONFLICT (clinic_code) DO NOTHING;

-- Success message
DO $$
BEGIN
    RAISE NOTICE 'Migration 02 completed: Departments, Clinics, and Locations created successfully';
END $$;
