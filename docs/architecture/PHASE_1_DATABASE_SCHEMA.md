# Phase 1: Database Schema - Kranium-Inspired Entities

**Date:** November 30, 2025  
**Branch:** `feature/kranium-inspired-workflows`  
**Status:** Ready for Implementation

---

## 📊 Schema Overview

This document defines the complete database schema for MediMesh's hospital operations module, inspired by Kranium's proven data model.

---

## 🗄️ SQL Migrations

### Migration 1: Core Organizational Structure

```sql
-- =============================================================================
-- DEPARTMENTS, CLINICS, AND LOCATIONS
-- =============================================================================

-- Departments (organizational units)
CREATE TABLE departments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    department_code VARCHAR(20) UNIQUE NOT NULL,
    department_name VARCHAR(200) NOT NULL,
    description TEXT,
    head_of_department_id UUID REFERENCES staff(id),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_departments_code ON departments(department_code);
CREATE INDEX idx_departments_active ON departments(is_active);

-- Sample data
INSERT INTO departments (department_code, department_name, description) VALUES
('GEN_MED', 'General Medicine', 'General medical consultations and primary care'),
('SURGERY', 'Surgery', 'Surgical procedures and post-operative care'),
('PEDIATRICS', 'Pediatrics', 'Child and adolescent healthcare'),
('OB_GYN', 'Obstetrics & Gynecology', 'Maternal and reproductive health'),
('CARDIOLOGY', 'Cardiology', 'Heart and cardiovascular care'),
('ORTHOPEDICS', 'Orthopedics', 'Musculoskeletal system care');

-- Clinics (sub-units within departments)
CREATE TABLE clinics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_code VARCHAR(20) UNIQUE NOT NULL,
    clinic_name VARCHAR(200) NOT NULL,
    department_id UUID REFERENCES departments(id) ON DELETE CASCADE,
    location_id UUID REFERENCES locations(id),
    is_active BOOLEAN DEFAULT TRUE,
    operating_hours JSONB, -- {monday: {open: "08:00", close: "17:00"}, ...}
    max_daily_capacity INTEGER DEFAULT 50,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_clinics_code ON clinics(clinic_code);
CREATE INDEX idx_clinics_department ON clinics(department_id);
CREATE INDEX idx_clinics_active ON clinics(is_active);

-- Sample data
INSERT INTO clinics (clinic_code, clinic_name, department_id) VALUES
('GEN_OPD', 'General Outpatient Department', 
    (SELECT id FROM departments WHERE department_code = 'GEN_MED')),
('ANDERSON', 'Anderson Clinic', 
    (SELECT id FROM departments WHERE department_code = 'GEN_MED')),
('CARDIAC', 'Cardiology Clinic', 
    (SELECT id FROM departments WHERE department_code = 'CARDIOLOGY')),
('PEDIATRIC', 'Children''s Clinic', 
    (SELECT id FROM departments WHERE department_code = 'PEDIATRICS'));

-- Locations (physical spaces - hierarchical)
CREATE TABLE locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    location_code VARCHAR(50) UNIQUE NOT NULL,
    location_type VARCHAR(20) NOT NULL, -- facility, building, floor, ward, room, bed
    location_name VARCHAR(200) NOT NULL,
    parent_location_id UUID REFERENCES locations(id),
    capacity INTEGER, -- for rooms/wards
    is_active BOOLEAN DEFAULT TRUE,
    metadata JSONB, -- equipment, features, accessibility
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    CHECK (location_type IN ('facility', 'building', 'floor', 'ward', 'room', 'bed'))
);

CREATE INDEX idx_locations_code ON locations(location_code);
CREATE INDEX idx_locations_type ON locations(location_type);
CREATE INDEX idx_locations_parent ON locations(parent_location_id);
CREATE INDEX idx_locations_active ON locations(is_active);

-- Sample location hierarchy
INSERT INTO locations (location_code, location_type, location_name, parent_location_id) VALUES
-- Main facility
('FAC_MAIN', 'facility', 'MediMesh Main Hospital', NULL),
-- Buildings
('BUILD_A', 'building', 'Building A - Outpatient', 
    (SELECT id FROM locations WHERE location_code = 'FAC_MAIN')),
('BUILD_B', 'building', 'Building B - Inpatient', 
    (SELECT id FROM locations WHERE location_code = 'FAC_MAIN')),
-- Floors
('BUILD_A_FL1', 'floor', 'Building A - Floor 1', 
    (SELECT id FROM locations WHERE location_code = 'BUILD_A')),
('BUILD_B_FL2', 'floor', 'Building B - Floor 2', 
    (SELECT id FROM locations WHERE location_code = 'BUILD_B'));
```

---

### Migration 2: Enhanced Staff Management

```sql
-- =============================================================================
-- STAFF / EMPLOYEES (Enhanced from existing)
-- =============================================================================

-- Drop existing staff table if it exists (or ALTER TABLE to add columns)
-- For this migration, assuming we're adding to existing structure

ALTER TABLE IF EXISTS staff ADD COLUMN IF NOT EXISTS staff_number VARCHAR(50) UNIQUE;
ALTER TABLE IF EXISTS staff ADD COLUMN IF NOT EXISTS specialization VARCHAR(200);
ALTER TABLE IF EXISTS staff ADD COLUMN IF NOT EXISTS license_number VARCHAR(100);
ALTER TABLE IF EXISTS staff ADD COLUMN IF NOT EXISTS license_expiry DATE;
ALTER TABLE IF EXISTS staff ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments(id);
ALTER TABLE IF EXISTS staff ADD COLUMN IF NOT EXISTS primary_clinic_id UUID REFERENCES clinics(id);
ALTER TABLE IF EXISTS staff ADD COLUMN IF NOT EXISTS employment_type VARCHAR(20) DEFAULT 'full-time';
ALTER TABLE IF EXISTS staff ADD COLUMN IF NOT EXISTS is_available BOOLEAN DEFAULT TRUE;
ALTER TABLE IF EXISTS staff ADD COLUMN IF NOT EXISTS max_appointments_per_day INTEGER DEFAULT 20;
ALTER TABLE IF EXISTS staff ADD COLUMN IF NOT EXISTS consultation_duration_minutes INTEGER DEFAULT 30;
ALTER TABLE IF EXISTS staff ADD COLUMN IF NOT EXISTS hire_date DATE;
ALTER TABLE IF EXISTS staff ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active';

-- Or create new table if doesn't exist
CREATE TABLE IF NOT EXISTS staff (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_number VARCHAR(50) UNIQUE NOT NULL,
    keycloak_user_id VARCHAR(100), -- Link to authentication system
    
    -- Personal information
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(200) UNIQUE NOT NULL,
    phone_number VARCHAR(20),
    profile_photo VARCHAR(500),
    
    -- Professional information
    role VARCHAR(50) NOT NULL, -- doctor, nurse, receptionist, lab-tech, etc.
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
    hire_date DATE,
    status VARCHAR(20) DEFAULT 'active',
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    CHECK (role IN ('doctor', 'nurse', 'receptionist', 'lab-tech', 'radiologist', 
                    'pharmacist', 'admin', 'manager', 'cleaner', 'security')),
    CHECK (employment_type IN ('full-time', 'part-time', 'consultant', 'locum')),
    CHECK (status IN ('active', 'on-leave', 'suspended', 'terminated'))
);

CREATE INDEX idx_staff_number ON staff(staff_number);
CREATE INDEX idx_staff_email ON staff(email);
CREATE INDEX idx_staff_role ON staff(role);
CREATE INDEX idx_staff_department ON staff(department_id);
CREATE INDEX idx_staff_clinic ON staff(primary_clinic_id);
CREATE INDEX idx_staff_status ON staff(status);
CREATE INDEX idx_staff_available ON staff(is_available);

-- Sample staff
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
('NUR001', 'Mary', 'Johnson', 'm.johnson@medimesh.com', 'nurse', 'General Nursing', 
    (SELECT id FROM departments WHERE department_code = 'GEN_MED'), NULL, NULL),
('REC001', 'Alice', 'Brown', 'a.brown@medimesh.com', 'receptionist', NULL, NULL, NULL, NULL);
```

---

### Migration 3: Enhanced Patient Model

```sql
-- =============================================================================
-- ENHANCED PATIENT MODEL (Kranium-inspired)
-- =============================================================================

-- Add new columns to existing patients table
ALTER TABLE patients ADD COLUMN IF NOT EXISTS uhid VARCHAR(50) UNIQUE; -- Unique Hospital ID
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

-- Add constraints
ALTER TABLE patients ADD CONSTRAINT check_payment_type 
    CHECK (payment_type IN ('self-pay', 'corporate', 'insurance', 'government', 'ngo'));

ALTER TABLE patients ADD CONSTRAINT check_marital_status 
    CHECK (marital_status IN ('single', 'married', 'divorced', 'widowed', 'other'));

-- Create indexes
CREATE INDEX idx_patients_uhid ON patients(uhid);
CREATE INDEX idx_patients_national_id ON patients(national_id);
CREATE INDEX idx_patients_payment_type ON patients(payment_type);
CREATE INDEX idx_patients_phone ON patients(phone_number);
CREATE INDEX idx_patients_email ON patients(email);

-- Function to auto-generate UHID
CREATE OR REPLACE FUNCTION generate_uhid()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.uhid IS NULL THEN
        NEW.uhid := 'UHID' || TO_CHAR(NOW(), 'YYYY') || 
                   LPAD(NEXTVAL('uhid_sequence')::TEXT, 6, '0');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE SEQUENCE IF NOT EXISTS uhid_sequence START 1000;

CREATE TRIGGER set_patient_uhid
    BEFORE INSERT ON patients
    FOR EACH ROW
    EXECUTE FUNCTION generate_uhid();

-- Update existing patients with UHID
UPDATE patients 
SET uhid = 'UHID2025' || LPAD(ROW_NUMBER() OVER (ORDER BY created_at)::TEXT, 6, '0')
WHERE uhid IS NULL;

-- Sample updates for existing patients
UPDATE patients SET 
    payment_type = 'self-pay',
    marital_status = 'married'
WHERE id IN (SELECT id FROM patients LIMIT 1);
```

---

### Migration 4: Encounters (NEW - Critical)

```sql
-- =============================================================================
-- ENCOUNTERS (NEW - Patient Visits)
-- =============================================================================

CREATE TABLE encounters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    encounter_number VARCHAR(50) UNIQUE NOT NULL,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    appointment_id UUID REFERENCES appointments(id),
    
    -- Encounter type and status
    encounter_type VARCHAR(20) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'registered',
    triage_level VARCHAR(20) DEFAULT 'routine',
    
    -- Clinical context
    department_id UUID REFERENCES departments(id),
    clinic_id UUID REFERENCES clinics(id),
    doctor_id UUID REFERENCES staff(id),
    
    -- Location tracking
    waiting_location VARCHAR(100), -- 'reception', 'lab', 'consulting-room-1'
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
    vital_signs JSONB, -- {temperature: 37.5, bp: "120/80", pulse: 72, ...}
    
    -- Administrative
    payment_status VARCHAR(20) DEFAULT 'unpaid',
    payment_type VARCHAR(20) DEFAULT 'self-pay',
    corporate_scheme VARCHAR(200),
    
    -- Metadata
    referred_from VARCHAR(200), -- Another clinic, emergency, etc.
    notes TEXT,
    created_by UUID REFERENCES staff(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    CHECK (encounter_type IN ('outpatient', 'inpatient', 'emergency', 'day-case', 'follow-up')),
    CHECK (status IN ('registered', 'waiting', 'triage', 'in-consultation', 'pending-lab', 
                     'pending-radiology', 'pending-pharmacy', 'completed', 'cancelled', 'no-show')),
    CHECK (triage_level IN ('routine', 'urgent', 'emergency', 'critical')),
    CHECK (payment_status IN ('unpaid', 'partial', 'paid', 'billed-later', 'waived')),
    CHECK (payment_type IN ('self-pay', 'corporate', 'insurance', 'government', 'ngo'))
);

CREATE INDEX idx_encounters_number ON encounters(encounter_number);
CREATE INDEX idx_encounters_patient ON encounters(patient_id);
CREATE INDEX idx_encounters_appointment ON encounters(appointment_id);
CREATE INDEX idx_encounters_status ON encounters(status);
CREATE INDEX idx_encounters_triage ON encounters(triage_level);
CREATE INDEX idx_encounters_department ON encounters(department_id);
CREATE INDEX idx_encounters_clinic ON encounters(clinic_id);
CREATE INDEX idx_encounters_doctor ON encounters(doctor_id);
CREATE INDEX idx_encounters_registration_time ON encounters(registration_time);
CREATE INDEX idx_encounters_type ON encounters(encounter_type);

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

CREATE SEQUENCE IF NOT EXISTS encounter_sequence START 1;

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

CREATE TRIGGER calculate_waiting_time
    BEFORE UPDATE ON encounters
    FOR EACH ROW
    EXECUTE FUNCTION update_encounter_waiting_time();
```

---

### Migration 5: Enhanced Appointments

```sql
-- =============================================================================
-- ENHANCED APPOINTMENTS
-- =============================================================================

-- If appointments table doesn't exist, create it
CREATE TABLE IF NOT EXISTS appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    appointment_number VARCHAR(50) UNIQUE NOT NULL,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    
    -- Type and timing
    appointment_type VARCHAR(50) NOT NULL,
    scheduled_date DATE NOT NULL,
    scheduled_time TIME NOT NULL,
    duration_minutes INTEGER DEFAULT 30,
    
    -- Status
    status VARCHAR(20) DEFAULT 'scheduled',
    
    -- Clinical context (NEW - Kranium-inspired)
    department_id UUID REFERENCES departments(id),
    clinic_id UUID REFERENCES clinics(id),
    doctor_id UUID REFERENCES staff(id),
    location_id UUID REFERENCES locations(id),
    
    -- Clinical information
    reason_for_visit TEXT,
    notes TEXT,
    cancellation_reason TEXT,
    
    -- Administrative (NEW)
    payment_type VARCHAR(20) DEFAULT 'self-pay',
    corporate_scheme VARCHAR(200),
    reminder_sent BOOLEAN DEFAULT FALSE,
    reminder_sent_at TIMESTAMP,
    confirmed_at TIMESTAMP,
    
    -- Tracking
    checked_in_at TIMESTAMP,
    completed_at TIMESTAMP,
    created_by UUID REFERENCES staff(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    CHECK (appointment_type IN ('consultation', 'follow-up', 'procedure', 'checkup', 
                                'vaccination', 'screening')),
    CHECK (status IN ('scheduled', 'confirmed', 'checked-in', 'in-progress', 
                      'completed', 'cancelled', 'no-show', 'rescheduled')),
    CHECK (payment_type IN ('self-pay', 'corporate', 'insurance', 'government'))
);

CREATE INDEX idx_appointments_number ON appointments(appointment_number);
CREATE INDEX idx_appointments_patient ON appointments(patient_id);
CREATE INDEX idx_appointments_doctor ON appointments(doctor_id);
CREATE INDEX idx_appointments_clinic ON appointments(clinic_id);
CREATE INDEX idx_appointments_date ON appointments(scheduled_date);
CREATE INDEX idx_appointments_status ON appointments(status);
CREATE INDEX idx_appointments_date_time ON appointments(scheduled_date, scheduled_time);

-- Function to auto-generate appointment number
CREATE OR REPLACE FUNCTION generate_appointment_number()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.appointment_number IS NULL THEN
        NEW.appointment_number := 'APT' || TO_CHAR(NOW(), 'YYYYMMDD') || 
                                 LPAD(NEXTVAL('appointment_sequence')::TEXT, 5, '0');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE SEQUENCE IF NOT EXISTS appointment_sequence START 1;

CREATE TRIGGER set_appointment_number
    BEFORE INSERT ON appointments
    FOR EACH ROW
    EXECUTE FUNCTION generate_appointment_number();

-- Sample appointments
INSERT INTO appointments (patient_id, appointment_type, scheduled_date, scheduled_time, doctor_id, clinic_id, reason_for_visit, status)
VALUES
((SELECT id FROM patients LIMIT 1), 'consultation', CURRENT_DATE + INTERVAL '1 day', '09:00', 
 (SELECT id FROM staff WHERE staff_number = 'DOC001'), 
 (SELECT id FROM clinics WHERE clinic_code = 'ANDERSON'), 
 'Regular checkup', 'scheduled'),
((SELECT id FROM patients LIMIT 1 OFFSET 1), 'follow-up', CURRENT_DATE + INTERVAL '2 days', '14:30', 
 (SELECT id FROM staff WHERE staff_number = 'DOC002'), 
 (SELECT id FROM clinics WHERE clinic_code = 'PEDIATRIC'), 
 'Follow-up on lab results', 'scheduled');
```

---

### Migration 6: Queue Management (NEW)

```sql
-- =============================================================================
-- QUEUE MANAGEMENT (NEW - Most Critical for Kranium Migration)
-- =============================================================================

CREATE TABLE queue_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    encounter_id UUID NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    
    -- Queue context
    clinic_id UUID NOT NULL REFERENCES clinics(id),
    doctor_id UUID REFERENCES staff(id),
    queue_type VARCHAR(20) NOT NULL,
    
    -- Position and priority
    queue_position INTEGER,
    priority_level INTEGER DEFAULT 5, -- 1=highest, 10=lowest
    
    -- Timing
    joined_at TIMESTAMP DEFAULT NOW(),
    called_at TIMESTAMP,
    served_at TIMESTAMP,
    completed_at TIMESTAMP,
    estimated_wait_minutes INTEGER,
    actual_wait_minutes INTEGER,
    
    -- Status
    status VARCHAR(20) DEFAULT 'waiting',
    waiting_location VARCHAR(100),
    
    -- Flags
    is_emergency BOOLEAN DEFAULT FALSE,
    requires_interpreter BOOLEAN DEFAULT FALSE,
    special_requirements TEXT,
    
    -- Metadata
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    CHECK (queue_type IN ('consultation', 'lab', 'radiology', 'pharmacy', 'billing', 'triage')),
    CHECK (status IN ('waiting', 'called', 'in-service', 'completed', 'no-show', 'deferred', 'cancelled')),
    CHECK (priority_level BETWEEN 1 AND 10)
);

CREATE INDEX idx_queue_encounter ON queue_entries(encounter_id);
CREATE INDEX idx_queue_patient ON queue_entries(patient_id);
CREATE INDEX idx_queue_clinic ON queue_entries(clinic_id);
CREATE INDEX idx_queue_doctor ON queue_entries(doctor_id);
CREATE INDEX idx_queue_status ON queue_entries(status);
CREATE INDEX idx_queue_type ON queue_entries(queue_type);
CREATE INDEX idx_queue_position ON queue_entries(queue_position);
CREATE INDEX idx_queue_priority ON queue_entries(priority_level);
CREATE INDEX idx_queue_joined_at ON queue_entries(joined_at);
CREATE INDEX idx_queue_emergency ON queue_entries(is_emergency);

-- Function to calculate actual wait time
CREATE OR REPLACE FUNCTION update_queue_wait_time()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.served_at IS NOT NULL AND NEW.joined_at IS NOT NULL THEN
        NEW.actual_wait_minutes := EXTRACT(EPOCH FROM 
            (NEW.served_at - NEW.joined_at)) / 60;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER calculate_queue_wait_time
    BEFORE UPDATE ON queue_entries
    FOR EACH ROW
    EXECUTE FUNCTION update_queue_wait_time();

-- Function to auto-assign queue position
CREATE OR REPLACE FUNCTION assign_queue_position()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.queue_position IS NULL THEN
        SELECT COALESCE(MAX(queue_position), 0) + 1 INTO NEW.queue_position
        FROM queue_entries
        WHERE clinic_id = NEW.clinic_id
          AND queue_type = NEW.queue_type
          AND status IN ('waiting', 'called');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_queue_position
    BEFORE INSERT ON queue_entries
    FOR EACH ROW
    EXECUTE FUNCTION assign_queue_position();
```

---

### Migration 7: Wards and Beds

```sql
-- =============================================================================
-- WARD AND BED MANAGEMENT
-- =============================================================================

-- Wards
CREATE TABLE wards (
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

CREATE INDEX idx_wards_code ON wards(ward_code);
CREATE INDEX idx_wards_type ON wards(ward_type);
CREATE INDEX idx_wards_department ON wards(department_id);
CREATE INDEX idx_wards_active ON wards(is_active);

-- Sample wards
INSERT INTO wards (ward_code, ward_name, ward_type, total_beds, available_beds, department_id) VALUES
('ICU', 'Intensive Care Unit', 'icu', 10, 10, NULL),
('MAT', 'Maternity Ward', 'maternity', 20, 20, 
    (SELECT id FROM departments WHERE department_code = 'OB_GYN')),
('GEN_A', 'General Ward A', 'general', 30, 30, 
    (SELECT id FROM departments WHERE department_code = 'GEN_MED')),
('PED', 'Pediatric Ward', 'pediatric', 15, 15, 
    (SELECT id FROM departments WHERE department_code = 'PEDIATRICS'));

-- Beds
CREATE TABLE beds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ward_id UUID NOT NULL REFERENCES wards(id) ON DELETE CASCADE,
    bed_number VARCHAR(20) NOT NULL,
    bed_type VARCHAR(50) NOT NULL,
    
    -- Status
    status VARCHAR(20) DEFAULT 'available',
    
    -- Assignment
    location_id UUID REFERENCES locations(id), -- Specific room
    assigned_doctor_id UUID REFERENCES staff(id),
    
    -- Pricing
    daily_rate DECIMAL(10,2),
    
    -- Features
    features JSONB, -- {ventilator: true, cardiac_monitor: false, ...}
    
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

CREATE INDEX idx_beds_ward ON beds(ward_id);
CREATE INDEX idx_beds_status ON beds(status);
CREATE INDEX idx_beds_doctor ON beds(assigned_doctor_id);
CREATE INDEX idx_beds_active ON beds(is_active);

-- Sample beds for each ward
INSERT INTO beds (ward_id, bed_number, bed_type, status, daily_rate)
SELECT 
    w.id,
    'BED-' || LPAD(generate_series::TEXT, 2, '0'),
    CASE w.ward_type 
        WHEN 'icu' THEN 'icu'
        WHEN 'isolation' THEN 'isolation'
        ELSE 'standard'
    END,
    'available',
    CASE w.ward_type 
        WHEN 'icu' THEN 5000.00
        WHEN 'isolation' THEN 3000.00
        ELSE 1500.00
    END
FROM wards w
CROSS JOIN generate_series(1, w.total_beds);

-- Admissions
CREATE TABLE admissions (
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

CREATE INDEX idx_admissions_number ON admissions(admission_number);
CREATE INDEX idx_admissions_patient ON admissions(patient_id);
CREATE INDEX idx_admissions_encounter ON admissions(encounter_id);
CREATE INDEX idx_admissions_ward ON admissions(ward_id);
CREATE INDEX idx_admissions_bed ON admissions(bed_id);
CREATE INDEX idx_admissions_status ON admissions(status);
CREATE INDEX idx_admissions_date ON admissions(admission_date);
CREATE INDEX idx_admissions_doctor ON admissions(admitting_doctor_id);

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

CREATE SEQUENCE IF NOT EXISTS admission_sequence START 1;

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

CREATE TRIGGER manage_bed_occupancy
    AFTER INSERT OR UPDATE ON admissions
    FOR EACH ROW
    EXECUTE FUNCTION update_bed_on_admission();
```

---

### Migration 8: Lab Orders (Enhanced)

```sql
-- =============================================================================
-- LABORATORY MANAGEMENT
-- =============================================================================

-- Lab Test Catalog
CREATE TABLE lab_tests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    test_code VARCHAR(50) UNIQUE NOT NULL,
    test_name VARCHAR(200) NOT NULL,
    test_category VARCHAR(100) NOT NULL,
    sample_type VARCHAR(50) NOT NULL,
    normal_range VARCHAR(200),
    unit_of_measure VARCHAR(50),
    turnaround_time_minutes INTEGER DEFAULT 120,
    price DECIMAL(10,2),
    is_active BOOLEAN DEFAULT TRUE,
    requires_fasting BOOLEAN DEFAULT FALSE,
    preparation_instructions TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    CHECK (test_category IN ('hematology', 'chemistry', 'microbiology', 'pathology', 
                            'immunology', 'serology', 'molecular'))
);

CREATE INDEX idx_lab_tests_code ON lab_tests(test_code);
CREATE INDEX idx_lab_tests_category ON lab_tests(test_category);
CREATE INDEX idx_lab_tests_active ON lab_tests(is_active);

-- Sample lab tests
INSERT INTO lab_tests (test_code, test_name, test_category, sample_type, normal_range, unit_of_measure, price) VALUES
('CBC', 'Complete Blood Count', 'hematology', 'blood', '4.5-11 x10^9/L', 'cells/L', 500.00),
('FBC', 'Full Blood Count', 'hematology', 'blood', '4.5-11 x10^9/L', 'cells/L', 500.00),
('RBS', 'Random Blood Sugar', 'chemistry', 'blood', '70-140', 'mg/dL', 200.00),
('UREA', 'Urea & Electrolytes', 'chemistry', 'blood', '2.5-7.5', 'mmol/L', 800.00),
('URINALYSIS', 'Urinalysis', 'chemistry', 'urine', 'Normal', 'N/A', 300.00);

-- Lab Orders
CREATE TABLE lab_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number VARCHAR(50) UNIQUE NOT NULL,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    encounter_id UUID REFERENCES encounters(id),
    ordered_by_id UUID NOT NULL REFERENCES staff(id),
    
    order_date TIMESTAMP DEFAULT NOW(),
    priority VARCHAR(20) DEFAULT 'routine',
    status VARCHAR(30) DEFAULT 'ordered',
    
    clinical_notes TEXT,
    
    -- Sample tracking
    sample_collected_at TIMESTAMP,
    sample_collected_by_id UUID REFERENCES staff(id),
    
    -- Results
    result_ready_at TIMESTAMP,
    result_viewed_at TIMESTAMP,
    result_viewed_by_id UUID REFERENCES staff(id),
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    CHECK (priority IN ('routine', 'urgent', 'stat')),
    CHECK (status IN ('ordered', 'sample-collected', 'in-progress', 
                     'result-ready', 'result-viewed', 'cancelled'))
);

CREATE INDEX idx_lab_orders_number ON lab_orders(order_number);
CREATE INDEX idx_lab_orders_patient ON lab_orders(patient_id);
CREATE INDEX idx_lab_orders_encounter ON lab_orders(encounter_id);
CREATE INDEX idx_lab_orders_status ON lab_orders(status);
CREATE INDEX idx_lab_orders_ordered_by ON lab_orders(ordered_by_id);
CREATE INDEX idx_lab_orders_date ON lab_orders(order_date);

-- Function to auto-generate lab order number
CREATE OR REPLACE FUNCTION generate_lab_order_number()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.order_number IS NULL THEN
        NEW.order_number := 'LAB' || TO_CHAR(NOW(), 'YYYYMMDD') || 
                           LPAD(NEXTVAL('lab_order_sequence')::TEXT, 5, '0');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE SEQUENCE IF NOT EXISTS lab_order_sequence START 1;

CREATE TRIGGER set_lab_order_number
    BEFORE INSERT ON lab_orders
    FOR EACH ROW
    EXECUTE FUNCTION generate_lab_order_number();

-- Lab Order Items
CREATE TABLE lab_order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lab_order_id UUID NOT NULL REFERENCES lab_orders(id) ON DELETE CASCADE,
    lab_test_id UUID NOT NULL REFERENCES lab_tests(id),
    
    status VARCHAR(30) DEFAULT 'pending',
    result_value VARCHAR(500),
    result_unit VARCHAR(50),
    is_abnormal BOOLEAN DEFAULT FALSE,
    result_notes TEXT,
    
    performed_by_id UUID REFERENCES staff(id),
    verified_by_id UUID REFERENCES staff(id),
    verified_at TIMESTAMP,
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    CHECK (status IN ('pending', 'in-progress', 'completed', 'cancelled'))
);

CREATE INDEX idx_lab_order_items_order ON lab_order_items(lab_order_id);
CREATE INDEX idx_lab_order_items_test ON lab_order_items(lab_test_id);
CREATE INDEX idx_lab_order_items_status ON lab_order_items(status);
```

---

## 🔄 Migration Execution Order

Run migrations in this exact order:

```bash
# 1. Core organizational structure
psql -U medimesh_user -d medimesh -f migration_01_departments_clinics_locations.sql

# 2. Enhanced staff
psql -U medimesh_user -d medimesh -f migration_02_staff_enhanced.sql

# 3. Enhanced patients
psql -U medimesh_user -d medimesh -f migration_03_patients_enhanced.sql

# 4. Encounters
psql -U medimesh_user -d medimesh -f migration_04_encounters.sql

# 5. Appointments
psql -U medimesh_user -d medimesh -f migration_05_appointments_enhanced.sql

# 6. Queue management
psql -U medimesh_user -d medimesh -f migration_06_queue_management.sql

# 7. Wards and beds
psql -U medimesh_user -d medimesh -f migration_07_wards_beds.sql

# 8. Lab orders
psql -U medimesh_user -d medimesh -f migration_08_lab_orders.sql
```

---

## ✅ Verification Queries

After running migrations, verify:

```sql
-- Check all tables created
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('departments', 'clinics', 'locations', 'staff', 'encounters', 
                    'appointments', 'queue_entries', 'wards', 'beds', 'admissions',
                    'lab_tests', 'lab_orders', 'lab_order_items');

-- Check sample data
SELECT COUNT(*) AS departments FROM departments;
SELECT COUNT(*) AS clinics FROM clinics;
SELECT COUNT(*) AS staff FROM staff;
SELECT COUNT(*) AS wards FROM wards;
SELECT COUNT(*) AS beds FROM beds;
SELECT COUNT(*) AS lab_tests FROM lab_tests;

-- Check indexes
SELECT tablename, indexname 
FROM pg_indexes 
WHERE schemaname = 'public' 
ORDER BY tablename, indexname;
```

---

## 📊 ER Diagram (Simplified)

```
Patient ──┬── Encounter ──┬── QueueEntry
          │               ├── LabOrder
          │               └── Admission ── Bed ── Ward
          └── Appointment
          
Department ──┬── Clinic ──── Appointment
             ├── Ward
             └── Staff ──── Encounter
             
Location (hierarchical)
```

---

## 🎯 Next Steps

After running migrations:

1. **Create Node.js models** (Sequelize) for all new entities
2. **Build API endpoints** for CRUD operations
3. **Start on frontend components** (Search, Queue, Ward screens)
4. **Set up WebSocket** for real-time queue updates

---

**Ready to execute! 🚀**

