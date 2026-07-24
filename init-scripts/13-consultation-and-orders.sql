-- =====================================================
-- 13. CONSULTATION AND ORDERS ENHANCEMENT
-- =====================================================
-- Purpose: Enable doctors to create medical records and order multiple services
-- Author: MediMesh Development Team
-- Date: December 1, 2025

\c medimesh;

-- =====================================================
-- CONSULTATION RECORDS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS consultation_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    encounter_id UUID NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    doctor_id UUID NOT NULL REFERENCES staff(id),
    consultation_date TIMESTAMP NOT NULL DEFAULT NOW(),

    -- Vitals
    blood_pressure VARCHAR(20),
    temperature DECIMAL(4,1),
    pulse INTEGER,
    respiratory_rate INTEGER,
    oxygen_saturation INTEGER,
    weight DECIMAL(5,2),
    height DECIMAL(5,2),
    bmi DECIMAL(4,2),

    -- Clinical Information
    chief_complaint TEXT,
    history_present_illness TEXT,
    past_medical_history TEXT,
    family_history TEXT,
    social_history TEXT,
    allergies TEXT,
    current_medications TEXT,

    -- Physical Examination
    general_appearance TEXT,
    cardiovascular_exam TEXT,
    respiratory_exam TEXT,
    abdominal_exam TEXT,
    neurological_exam TEXT,
    musculoskeletal_exam TEXT,
    skin_exam TEXT,
    other_findings TEXT,

    -- Assessment and Plan
    provisional_diagnosis TEXT,
    differential_diagnosis TEXT,
    final_diagnosis TEXT,
    treatment_plan TEXT,
    follow_up_instructions TEXT,

    -- Orders Summary
    has_lab_orders BOOLEAN DEFAULT FALSE,
    has_radiology_orders BOOLEAN DEFAULT FALSE,
    has_prescriptions BOOLEAN DEFAULT FALSE,
    total_lab_orders INTEGER DEFAULT 0,
    total_radiology_orders INTEGER DEFAULT 0,
    total_prescriptions INTEGER DEFAULT 0,

    -- Status
    status VARCHAR(50) DEFAULT 'draft', -- draft, completed, reviewed
    completed_at TIMESTAMP,
    reviewed_by UUID REFERENCES staff(id),
    reviewed_at TIMESTAMP,

    -- Metadata
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    created_by VARCHAR(255),
    updated_by VARCHAR(255)
);

-- =====================================================
-- ENHANCE ENCOUNTERS TABLE
-- =====================================================
ALTER TABLE encounters ADD COLUMN IF NOT EXISTS has_pending_orders BOOLEAN DEFAULT FALSE;
ALTER TABLE encounters ADD COLUMN IF NOT EXISTS pending_lab_orders INTEGER DEFAULT 0;
ALTER TABLE encounters ADD COLUMN IF NOT EXISTS pending_radiology_orders INTEGER DEFAULT 0;
ALTER TABLE encounters ADD COLUMN IF NOT EXISTS pending_prescriptions INTEGER DEFAULT 0;
ALTER TABLE encounters ADD COLUMN IF NOT EXISTS consultation_completed BOOLEAN DEFAULT FALSE;
ALTER TABLE encounters ADD COLUMN IF NOT EXISTS all_services_completed BOOLEAN DEFAULT FALSE;

-- =====================================================
-- ENHANCE QUEUE ENTRIES TABLE
-- =====================================================
ALTER TABLE queue_entries ADD COLUMN IF NOT EXISTS service_type VARCHAR(50) DEFAULT 'consultation';
-- service_type: 'consultation', 'lab-collection', 'pharmacy-dispensing', 'radiology-imaging', 'billing-payment'

ALTER TABLE queue_entries ADD COLUMN IF NOT EXISTS related_order_id TEXT;
-- Links to lab_orders.id, prescriptions.id, or radiology_orders.id

ALTER TABLE queue_entries ADD COLUMN IF NOT EXISTS order_type VARCHAR(50);
-- 'lab', 'pharmacy', 'radiology', null for consultation/billing

-- =====================================================
-- ENHANCE LAB ORDERS TABLE
-- =====================================================
ALTER TABLE lab_orders ADD COLUMN IF NOT EXISTS consultation_record_id UUID REFERENCES consultation_records(id);
ALTER TABLE lab_orders ADD COLUMN IF NOT EXISTS results_entered_by UUID REFERENCES staff(id);
ALTER TABLE lab_orders ADD COLUMN IF NOT EXISTS results_entered_at TIMESTAMP;
ALTER TABLE lab_orders ADD COLUMN IF NOT EXISTS results_reviewed_by UUID REFERENCES staff(id);
ALTER TABLE lab_orders ADD COLUMN IF NOT EXISTS results_reviewed_at TIMESTAMP;

-- =====================================================
-- ENHANCE PRESCRIPTIONS TABLE
-- =====================================================
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS consultation_record_id UUID REFERENCES consultation_records(id);
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS dispensed_by UUID REFERENCES staff(id);
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS dispensed_at TIMESTAMP;
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS total_cost DECIMAL(10,2) DEFAULT 0;

-- =====================================================
-- ENHANCE RADIOLOGY ORDERS TABLE
-- =====================================================
ALTER TABLE radiology_orders ADD COLUMN IF NOT EXISTS consultation_record_id UUID REFERENCES consultation_records(id);
ALTER TABLE radiology_orders ADD COLUMN IF NOT EXISTS performed_by UUID REFERENCES staff(id);
ALTER TABLE radiology_orders ADD COLUMN IF NOT EXISTS performed_at TIMESTAMP;
ALTER TABLE radiology_orders ADD COLUMN IF NOT EXISTS reported_by UUID REFERENCES staff(id);
ALTER TABLE radiology_orders ADD COLUMN IF NOT EXISTS reported_at TIMESTAMP;

-- =====================================================
-- LAB TEST CATALOG TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS lab_test_catalog (
    id SERIAL PRIMARY KEY,
    test_code VARCHAR(50) UNIQUE NOT NULL,
    test_name VARCHAR(255) NOT NULL,
    test_category VARCHAR(100), -- Hematology, Biochemistry, Microbiology, etc.
    department VARCHAR(100),
    sample_type VARCHAR(100), -- Blood, Urine, Stool, etc.
    normal_range TEXT,
    unit VARCHAR(50),
    turnaround_time INTEGER, -- in minutes
    price DECIMAL(10,2),
    is_active BOOLEAN DEFAULT TRUE,
    requires_fasting BOOLEAN DEFAULT FALSE,
    special_instructions TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- =====================================================
-- LAB ORDER ITEMS TABLE (Many-to-Many)
-- =====================================================
CREATE TABLE IF NOT EXISTS lab_order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lab_order_id UUID NOT NULL REFERENCES lab_orders(id) ON DELETE CASCADE,
    test_id INTEGER NOT NULL REFERENCES lab_test_catalog(id),
    test_name VARCHAR(255) NOT NULL,
    test_code VARCHAR(50),
    status VARCHAR(50) DEFAULT 'pending', -- pending, collected, processing, completed
    result_value TEXT,
    result_unit VARCHAR(50),
    normal_range TEXT,
    is_abnormal BOOLEAN DEFAULT FALSE,
    result_notes TEXT,
    performed_by UUID REFERENCES staff(id),
    performed_at TIMESTAMP,
    price DECIMAL(10,2),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- =====================================================
-- RADIOLOGY STUDY CATALOG TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS radiology_study_catalog (
    id SERIAL PRIMARY KEY,
    study_code VARCHAR(50) UNIQUE NOT NULL,
    study_name VARCHAR(255) NOT NULL,
    modality VARCHAR(50), -- X-Ray, CT, MRI, Ultrasound, etc.
    body_part VARCHAR(100),
    contrast_required BOOLEAN DEFAULT FALSE,
    typical_duration INTEGER, -- in minutes
    price DECIMAL(10,2),
    is_active BOOLEAN DEFAULT TRUE,
    special_instructions TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- =====================================================
-- RADIOLOGY ORDER ITEMS TABLE (Many-to-Many)
-- =====================================================
CREATE TABLE IF NOT EXISTS radiology_order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    radiology_order_id UUID NOT NULL REFERENCES radiology_orders(id) ON DELETE CASCADE,
    study_id INTEGER NOT NULL REFERENCES radiology_study_catalog(id),
    study_name VARCHAR(255) NOT NULL,
    study_code VARCHAR(50),
    modality VARCHAR(50),
    status VARCHAR(50) DEFAULT 'ordered', -- ordered, scheduled, in-progress, completed, reported
    findings TEXT,
    impression TEXT,
    images_uploaded BOOLEAN DEFAULT FALSE,
    image_count INTEGER DEFAULT 0,
    performed_by UUID REFERENCES staff(id),
    performed_at TIMESTAMP,
    reported_by UUID REFERENCES staff(id),
    reported_at TIMESTAMP,
    price DECIMAL(10,2),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- =====================================================
-- PRESCRIPTION ITEMS TABLE (Already exists, enhance)
-- =====================================================
-- Add columns if they don't exist
ALTER TABLE prescription_items ADD COLUMN IF NOT EXISTS dispensed_quantity INTEGER DEFAULT 0;
ALTER TABLE prescription_items ADD COLUMN IF NOT EXISTS dispensed_at TIMESTAMP;
ALTER TABLE prescription_items ADD COLUMN IF NOT EXISTS dispensed_by UUID REFERENCES staff(id);
ALTER TABLE prescription_items ADD COLUMN IF NOT EXISTS unit_price DECIMAL(10,2);
ALTER TABLE prescription_items ADD COLUMN IF NOT EXISTS total_price DECIMAL(10,2);

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_consultation_records_encounter ON consultation_records(encounter_id);
CREATE INDEX IF NOT EXISTS idx_consultation_records_patient ON consultation_records(patient_id);
CREATE INDEX IF NOT EXISTS idx_consultation_records_doctor ON consultation_records(doctor_id);
CREATE INDEX IF NOT EXISTS idx_consultation_records_date ON consultation_records(consultation_date);
CREATE INDEX IF NOT EXISTS idx_consultation_records_status ON consultation_records(status);

CREATE INDEX IF NOT EXISTS idx_lab_order_items_order ON lab_order_items(lab_order_id);
CREATE INDEX IF NOT EXISTS idx_lab_order_items_test ON lab_order_items(test_id);
CREATE INDEX IF NOT EXISTS idx_lab_order_items_status ON lab_order_items(status);

CREATE INDEX IF NOT EXISTS idx_radiology_order_items_order ON radiology_order_items(radiology_order_id);
CREATE INDEX IF NOT EXISTS idx_radiology_order_items_test ON radiology_order_items(test_id);
CREATE INDEX IF NOT EXISTS idx_radiology_order_items_status ON radiology_order_items(status);

CREATE INDEX IF NOT EXISTS idx_queue_entries_service_type ON queue_entries(service_type);
CREATE INDEX IF NOT EXISTS idx_queue_entries_related_order ON queue_entries(related_order_id);

-- =====================================================
-- SEED DATA: LAB TEST CATALOG
-- =====================================================
INSERT INTO lab_test_catalog (test_code, test_name, test_category, sample_type, normal_range, unit, turnaround_time, price) VALUES
('CBC', 'Complete Blood Count', 'Hematology', 'Blood', 'WBC: 4-11, RBC: 4.5-5.5, Hgb: 12-16', 'x10^9/L', 60, 50.00),
('CRP', 'C-Reactive Protein', 'Biochemistry', 'Blood', '< 10', 'mg/L', 120, 30.00),
('ESR', 'Erythrocyte Sedimentation Rate', 'Hematology', 'Blood', '0-20', 'mm/hr', 60, 20.00),
('FBS', 'Fasting Blood Sugar', 'Biochemistry', 'Blood', '70-100', 'mg/dL', 30, 15.00),
('RBS', 'Random Blood Sugar', 'Biochemistry', 'Blood', '< 140', 'mg/dL', 30, 15.00),
('HbA1c', 'Glycated Hemoglobin', 'Biochemistry', 'Blood', '< 5.7', '%', 180, 80.00),
('LFT', 'Liver Function Tests', 'Biochemistry', 'Blood', 'ALT: 7-56, AST: 10-40', 'U/L', 120, 100.00),
('RFT', 'Renal Function Tests', 'Biochemistry', 'Blood', 'Creatinine: 0.6-1.2', 'mg/dL', 120, 80.00),
('LIPID', 'Lipid Profile', 'Biochemistry', 'Blood', 'Total Cholesterol: < 200', 'mg/dL', 180, 120.00),
('URINE', 'Urinalysis', 'Clinical Pathology', 'Urine', 'pH: 4.5-8, Protein: Negative', '-', 30, 25.00),
('STOOL', 'Stool Analysis', 'Clinical Pathology', 'Stool', 'No parasites, No blood', '-', 60, 30.00),
('MALARIA', 'Malaria Rapid Test', 'Microbiology', 'Blood', 'Negative', '-', 15, 20.00),
('TYPHOID', 'Typhoid Test (Widal)', 'Microbiology', 'Blood', 'Negative', '-', 120, 40.00),
('HIV', 'HIV Rapid Test', 'Serology', 'Blood', 'Non-reactive', '-', 20, 50.00),
('PREG', 'Pregnancy Test', 'Serology', 'Urine', 'Negative/Positive', '-', 10, 15.00)
ON CONFLICT (test_code) DO NOTHING;

-- =====================================================
-- SEED DATA: RADIOLOGY STUDY CATALOG
-- =====================================================
INSERT INTO radiology_study_catalog (study_code, study_name, modality, body_part, contrast_required, typical_duration, price) VALUES
('XRAY-CHEST', 'Chest X-Ray', 'X-Ray', 'Chest', FALSE, 15, 80.00),
('XRAY-ABD', 'Abdominal X-Ray', 'X-Ray', 'Abdomen', FALSE, 15, 80.00),
('XRAY-SPINE', 'Spine X-Ray', 'X-Ray', 'Spine', FALSE, 20, 100.00),
('XRAY-LIMB', 'Limb X-Ray', 'X-Ray', 'Extremity', FALSE, 15, 70.00),
('US-ABD', 'Abdominal Ultrasound', 'Ultrasound', 'Abdomen', FALSE, 30, 150.00),
('US-PELV', 'Pelvic Ultrasound', 'Ultrasound', 'Pelvis', FALSE, 30, 150.00),
('US-OBS', 'Obstetric Ultrasound', 'Ultrasound', 'Pregnancy', FALSE, 30, 200.00),
('CT-HEAD', 'CT Head', 'CT Scan', 'Head', FALSE, 20, 500.00),
('CT-ABD', 'CT Abdomen', 'CT Scan', 'Abdomen', TRUE, 30, 800.00),
('CT-CHEST', 'CT Chest', 'CT Scan', 'Chest', TRUE, 25, 700.00),
('MRI-BRAIN', 'MRI Brain', 'MRI', 'Brain', TRUE, 45, 1500.00),
('MRI-SPINE', 'MRI Spine', 'MRI', 'Spine', TRUE, 45, 1500.00),
('MAMMO', 'Mammography', 'Mammography', 'Breast', FALSE, 20, 250.00),
('ECHO', 'Echocardiography', 'Ultrasound', 'Heart', FALSE, 40, 300.00),
('DOPPLER', 'Doppler Ultrasound', 'Ultrasound', 'Vascular', FALSE, 30, 250.00)
ON CONFLICT (study_code) DO NOTHING;

-- =====================================================
-- FUNCTIONS FOR ORDER TRACKING
-- =====================================================

-- Function to update encounter pending orders count
CREATE OR REPLACE FUNCTION update_encounter_pending_orders()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_TABLE_NAME = 'lab_orders' THEN
        IF NEW.status IN ('pending', 'collected', 'processing') THEN
            UPDATE encounters SET
                pending_lab_orders = pending_lab_orders + 1,
                has_pending_orders = TRUE
            WHERE id = NEW.encounter_id;
        ELSIF NEW.status = 'completed' AND OLD.status != 'completed' THEN
            UPDATE encounters SET
                pending_lab_orders = GREATEST(pending_lab_orders - 1, 0)
            WHERE id = NEW.encounter_id;
        END IF;
    ELSIF TG_TABLE_NAME = 'radiology_orders' THEN
        IF NEW.status IN ('ordered', 'scheduled', 'in-progress') THEN
            UPDATE encounters SET
                pending_radiology_orders = pending_radiology_orders + 1,
                has_pending_orders = TRUE
            WHERE id = NEW.encounter_id;
        ELSIF NEW.status = 'completed' AND OLD.status != 'completed' THEN
            UPDATE encounters SET
                pending_radiology_orders = GREATEST(pending_radiology_orders - 1, 0)
            WHERE id = NEW.encounter_id;
        END IF;
    ELSIF TG_TABLE_NAME = 'prescriptions' THEN
        IF NEW.status IN ('pending', 'processing') THEN
            UPDATE encounters SET
                pending_prescriptions = pending_prescriptions + 1,
                has_pending_orders = TRUE
            WHERE id = NEW.encounter_id;
        ELSIF NEW.status = 'dispensed' AND OLD.status != 'dispensed' THEN
            UPDATE encounters SET
                pending_prescriptions = GREATEST(pending_prescriptions - 1, 0)
            WHERE id = NEW.encounter_id;
        END IF;
    END IF;

    -- Check if all orders are completed
    UPDATE encounters SET
        all_services_completed = (
            pending_lab_orders = 0 AND
            pending_radiology_orders = 0 AND
            pending_prescriptions = 0 AND
            has_pending_orders = TRUE
        ),
        has_pending_orders = (
            pending_lab_orders > 0 OR
            pending_radiology_orders > 0 OR
            pending_prescriptions > 0
        )
    WHERE id = NEW.encounter_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for order tracking
DROP TRIGGER IF EXISTS trg_lab_order_status_update ON lab_orders;
CREATE TRIGGER trg_lab_order_status_update
    AFTER INSERT OR UPDATE OF status ON lab_orders
    FOR EACH ROW
    EXECUTE FUNCTION update_encounter_pending_orders();

DROP TRIGGER IF EXISTS trg_radiology_order_status_update ON radiology_orders;
CREATE TRIGGER trg_radiology_order_status_update
    AFTER INSERT OR UPDATE OF status ON radiology_orders
    FOR EACH ROW
    EXECUTE FUNCTION update_encounter_pending_orders();

DROP TRIGGER IF EXISTS trg_prescription_status_update ON prescriptions;
CREATE TRIGGER trg_prescription_status_update
    AFTER INSERT OR UPDATE OF status ON prescriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_encounter_pending_orders();

-- =====================================================
-- GRANT PERMISSIONS
-- =====================================================
GRANT ALL PRIVILEGES ON TABLE consultation_records TO medimesh_user;
GRANT ALL PRIVILEGES ON TABLE lab_test_catalog TO medimesh_user;
GRANT ALL PRIVILEGES ON TABLE lab_order_items TO medimesh_user;
GRANT ALL PRIVILEGES ON TABLE radiology_study_catalog TO medimesh_user;
GRANT ALL PRIVILEGES ON TABLE radiology_order_items TO medimesh_user;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO medimesh_user;

-- =====================================================
-- COMPLETION MESSAGE
-- =====================================================
DO $$
BEGIN
    RAISE NOTICE '✅ Consultation and Orders Enhancement Complete';
    RAISE NOTICE '   - consultation_records table created';
    RAISE NOTICE '   - encounters table enhanced with pending orders tracking';
    RAISE NOTICE '   - queue_entries enhanced with service_type and related_order_id';
    RAISE NOTICE '   - lab_test_catalog with % tests', (SELECT COUNT(*) FROM lab_test_catalog);
    RAISE NOTICE '   - radiology_study_catalog with % studies', (SELECT COUNT(*) FROM radiology_study_catalog);
    RAISE NOTICE '   - Automatic order tracking triggers installed';
END $$;
