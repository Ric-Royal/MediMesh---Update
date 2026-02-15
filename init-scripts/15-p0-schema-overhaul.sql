-- =====================================================
-- 15. P0 SCHEMA OVERHAUL - Multi-tenancy, Audit, Clinical, Lab, Pharmacy, Attachments
-- =====================================================
-- Purpose: Address all P0 and P1 architectural gaps
-- Author: MediMesh Development Team
-- Date: February 2026
-- Priority: P0 (Critical for production readiness)
-- =====================================================

\c medimesh;

-- =====================================================
-- P0-1: MULTI-TENANCY BOUNDARY
-- =====================================================
-- Add tenant/organization layer for multi-clinic SaaS

CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_code VARCHAR(50) UNIQUE NOT NULL,
    org_name VARCHAR(255) NOT NULL,
    org_type VARCHAR(50) DEFAULT 'clinic' CHECK (org_type IN ('clinic', 'hospital', 'laboratory', 'pharmacy', 'group')),
    
    -- Contact
    email VARCHAR(200),
    phone VARCHAR(20),
    address JSONB,
    
    -- Licensing
    license_number VARCHAR(100),
    license_expiry DATE,
    
    -- Settings
    settings JSONB DEFAULT '{}',
    branding JSONB DEFAULT '{}'::jsonb,
    
    -- Status
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'trial', 'cancelled')),
    subscription_plan VARCHAR(50) DEFAULT 'basic',
    subscription_expires DATE,
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Add tenant_id to core tables
ALTER TABLE patients ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES organizations(id);
ALTER TABLE encounters ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES organizations(id);
ALTER TABLE staff ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES organizations(id);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES organizations(id);
ALTER TABLE billing_payments ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES organizations(id);
ALTER TABLE billing_accounts ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES organizations(id);
ALTER TABLE lab_orders ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES organizations(id);
ALTER TABLE radiology_orders ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES organizations(id);
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES organizations(id);
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES organizations(id);
ALTER TABLE consultation_records ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES organizations(id);
ALTER TABLE queue_entries ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES organizations(id);
ALTER TABLE insurance_claims ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES organizations(id);

-- Indexes for tenant scoping
CREATE INDEX IF NOT EXISTS idx_patients_tenant ON patients(tenant_id);
CREATE INDEX IF NOT EXISTS idx_encounters_tenant ON encounters(tenant_id);
CREATE INDEX IF NOT EXISTS idx_staff_tenant ON staff(tenant_id);
CREATE INDEX IF NOT EXISTS idx_invoices_tenant ON invoices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_billing_payments_tenant ON billing_payments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_lab_orders_tenant ON lab_orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_radiology_orders_tenant ON radiology_orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_tenant ON prescriptions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_appointments_tenant ON appointments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_consultation_records_tenant ON consultation_records(tenant_id);
CREATE INDEX IF NOT EXISTS idx_queue_entries_tenant ON queue_entries(tenant_id);

-- Create a default organization for existing data
INSERT INTO organizations (org_code, org_name, org_type, status)
VALUES ('DEFAULT', 'MediMesh Default Organization', 'hospital', 'active')
ON CONFLICT (org_code) DO NOTHING;

-- Row-level security policies (enable when ready)
-- ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY tenant_isolation_patients ON patients USING (tenant_id = current_setting('app.current_tenant')::uuid);

-- =====================================================
-- P0-2: AUDIT TRAIL + DATA ACCESS LOGGING
-- =====================================================
-- Kenya health data compliance requires full auditability

CREATE TABLE IF NOT EXISTS audit_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES organizations(id),
    
    -- Who
    user_id UUID,
    username VARCHAR(255),
    user_role VARCHAR(50),
    ip_address INET,
    user_agent TEXT,
    
    -- What
    action VARCHAR(50) NOT NULL CHECK (action IN (
        'create', 'read', 'update', 'delete',
        'login', 'logout', 'failed_login',
        'export', 'print', 'download',
        'approve', 'reject', 'escalate',
        'access_denied', 'permission_change'
    )),
    entity_type VARCHAR(100) NOT NULL,  -- e.g., 'patient', 'encounter', 'invoice'
    entity_id VARCHAR(255),             -- UUID or composite key
    
    -- Details
    description TEXT,
    old_value_hash VARCHAR(64),   -- SHA-256 hash of previous state
    new_value_hash VARCHAR(64),   -- SHA-256 hash of new state
    changes JSONB,                -- Detailed field-level changes
    metadata JSONB,               -- Additional context
    
    -- When
    event_time TIMESTAMP DEFAULT NOW(),
    
    -- Severity
    severity VARCHAR(20) DEFAULT 'info' CHECK (severity IN ('debug', 'info', 'warning', 'error', 'critical'))
);

-- Data access log (read events - disputes/compliance)
CREATE TABLE IF NOT EXISTS data_access_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES organizations(id),
    
    -- Who accessed
    user_id UUID NOT NULL,
    username VARCHAR(255),
    user_role VARCHAR(50),
    ip_address INET,
    
    -- What was accessed
    resource_type VARCHAR(100) NOT NULL,  -- 'patient_record', 'lab_result', 'prescription', etc.
    resource_id VARCHAR(255) NOT NULL,
    patient_id UUID,                       -- If patient-related
    
    -- Access details
    access_type VARCHAR(30) NOT NULL CHECK (access_type IN ('view', 'list', 'search', 'export', 'print', 'api')),
    fields_accessed TEXT[],                -- Which specific fields were accessed
    query_parameters JSONB,                -- Search/filter parameters used
    
    -- Context
    purpose VARCHAR(100),                  -- 'treatment', 'billing', 'audit', 'research'
    session_id VARCHAR(255),
    
    accessed_at TIMESTAMP DEFAULT NOW()
);

-- Link staff to IAM (Keycloak)
ALTER TABLE staff ADD COLUMN IF NOT EXISTS auth_subject_id VARCHAR(255);
CREATE INDEX IF NOT EXISTS idx_staff_auth_subject ON staff(auth_subject_id);

-- Audit indexes for performance
CREATE INDEX IF NOT EXISTS idx_audit_events_tenant ON audit_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_user ON audit_events(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_entity ON audit_events(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_action ON audit_events(action);
CREATE INDEX IF NOT EXISTS idx_audit_events_time ON audit_events(event_time);
CREATE INDEX IF NOT EXISTS idx_audit_events_severity ON audit_events(severity);

CREATE INDEX IF NOT EXISTS idx_data_access_log_tenant ON data_access_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_data_access_log_user ON data_access_log(user_id);
CREATE INDEX IF NOT EXISTS idx_data_access_log_resource ON data_access_log(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_data_access_log_patient ON data_access_log(patient_id);
CREATE INDEX IF NOT EXISTS idx_data_access_log_time ON data_access_log(accessed_at);

-- =====================================================
-- P0-3: STRUCTURED CLINICAL DATA
-- =====================================================
-- Replace free-text diagnosis/examination with coded, queryable structures

-- Coded diagnoses (ICD-10 compatible)
CREATE TABLE IF NOT EXISTS encounter_diagnoses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    encounter_id UUID NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
    consultation_record_id UUID REFERENCES consultation_records(id),
    
    -- Coding
    code_system VARCHAR(50) NOT NULL DEFAULT 'ICD-10' CHECK (code_system IN ('ICD-10', 'ICD-11', 'SNOMED-CT', 'local')),
    code VARCHAR(50) NOT NULL,
    display VARCHAR(500) NOT NULL,
    
    -- Classification
    diagnosis_type VARCHAR(30) DEFAULT 'provisional' CHECK (diagnosis_type IN ('provisional', 'differential', 'final', 'working', 'admission', 'discharge')),
    is_primary BOOLEAN DEFAULT FALSE,
    severity VARCHAR(20) CHECK (severity IN ('mild', 'moderate', 'severe', 'critical')),
    
    -- Clinical
    onset_date DATE,
    resolution_date DATE,
    notes TEXT,
    
    -- Attribution
    recorded_by UUID REFERENCES staff(id),
    recorded_at TIMESTAMP DEFAULT NOW(),
    verified_by UUID REFERENCES staff(id),
    verified_at TIMESTAMP,
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Structured observations (vitals, measurements, findings)
CREATE TABLE IF NOT EXISTS observations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    encounter_id UUID NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES patients(id),
    
    -- Observation type
    obs_type VARCHAR(50) NOT NULL CHECK (obs_type IN ('vital', 'measurement', 'finding', 'score', 'assessment')),
    
    -- Coding (LOINC compatible)
    code_system VARCHAR(50) DEFAULT 'LOINC',
    code VARCHAR(50) NOT NULL,
    display VARCHAR(255) NOT NULL,
    
    -- Values
    value_numeric DECIMAL(12, 4),
    value_text TEXT,
    value_coded VARCHAR(100),
    unit VARCHAR(50),
    
    -- Reference ranges
    ref_low DECIMAL(12, 4),
    ref_high DECIMAL(12, 4),
    is_abnormal BOOLEAN DEFAULT FALSE,
    abnormal_flag VARCHAR(10),  -- 'L', 'H', 'LL', 'HH', 'N'
    
    -- Context
    body_site VARCHAR(100),
    method VARCHAR(100),
    device VARCHAR(100),
    
    -- Attribution
    taken_at TIMESTAMP DEFAULT NOW(),
    taken_by UUID REFERENCES staff(id),
    verified_by UUID REFERENCES staff(id),
    verified_at TIMESTAMP,
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Clinical notes (SOAP model)
CREATE TABLE IF NOT EXISTS clinical_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    encounter_id UUID NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
    consultation_record_id UUID REFERENCES consultation_records(id),
    
    -- Note metadata
    note_type VARCHAR(50) NOT NULL CHECK (note_type IN ('soap', 'progress', 'admission', 'discharge', 'procedure', 'nursing', 'handoff', 'referral')),
    
    -- Author
    author_staff_id UUID NOT NULL REFERENCES staff(id),
    author_name VARCHAR(255),
    author_role VARCHAR(50),
    
    -- Status
    status VARCHAR(30) DEFAULT 'draft' CHECK (status IN ('draft', 'signed', 'cosigned', 'amended', 'addended')),
    signed_at TIMESTAMP,
    cosigned_by UUID REFERENCES staff(id),
    cosigned_at TIMESTAMP,
    
    -- Versioning
    version INTEGER DEFAULT 1,
    parent_note_id UUID REFERENCES clinical_notes(id),
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Clinical note sections (SOAP: Subjective, Objective, Assessment, Plan)
CREATE TABLE IF NOT EXISTS clinical_note_sections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    note_id UUID NOT NULL REFERENCES clinical_notes(id) ON DELETE CASCADE,
    
    section VARCHAR(50) NOT NULL CHECK (section IN ('subjective', 'objective', 'assessment', 'plan', 'history', 'examination', 'impression', 'recommendations', 'instructions', 'other')),
    content TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0,
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for clinical data
CREATE INDEX IF NOT EXISTS idx_encounter_diagnoses_encounter ON encounter_diagnoses(encounter_id);
CREATE INDEX IF NOT EXISTS idx_encounter_diagnoses_code ON encounter_diagnoses(code_system, code);
CREATE INDEX IF NOT EXISTS idx_encounter_diagnoses_primary ON encounter_diagnoses(encounter_id) WHERE is_primary = TRUE;
CREATE INDEX IF NOT EXISTS idx_encounter_diagnoses_type ON encounter_diagnoses(diagnosis_type);

CREATE INDEX IF NOT EXISTS idx_observations_encounter ON observations(encounter_id);
CREATE INDEX IF NOT EXISTS idx_observations_patient ON observations(patient_id);
CREATE INDEX IF NOT EXISTS idx_observations_code ON observations(code_system, code);
CREATE INDEX IF NOT EXISTS idx_observations_type ON observations(obs_type);
CREATE INDEX IF NOT EXISTS idx_observations_taken_at ON observations(taken_at);
CREATE INDEX IF NOT EXISTS idx_observations_abnormal ON observations(is_abnormal) WHERE is_abnormal = TRUE;

CREATE INDEX IF NOT EXISTS idx_clinical_notes_encounter ON clinical_notes(encounter_id);
CREATE INDEX IF NOT EXISTS idx_clinical_notes_author ON clinical_notes(author_staff_id);
CREATE INDEX IF NOT EXISTS idx_clinical_notes_type ON clinical_notes(note_type);
CREATE INDEX IF NOT EXISTS idx_clinical_notes_status ON clinical_notes(status);

CREATE INDEX IF NOT EXISTS idx_clinical_note_sections_note ON clinical_note_sections(note_id);

-- =====================================================
-- P0-4: STRUCTURED LAB RESULTS
-- =====================================================
-- Replace single Result field with multi-analyte, reference-range-aware results

CREATE TABLE IF NOT EXISTS lab_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lab_order_item_id UUID NOT NULL REFERENCES lab_order_items(id) ON DELETE CASCADE,
    lab_order_id UUID REFERENCES lab_orders(id),
    
    -- Status
    status VARCHAR(30) DEFAULT 'pending' CHECK (status IN ('pending', 'preliminary', 'final', 'corrected', 'cancelled')),
    
    -- Specimen
    specimen_type VARCHAR(100),
    specimen_id VARCHAR(100),
    collected_at TIMESTAMP,
    received_at TIMESTAMP,
    
    -- Verification
    performed_by UUID REFERENCES staff(id),
    performed_at TIMESTAMP,
    verified_by UUID REFERENCES staff(id),
    verified_at TIMESTAMP,
    
    -- Notes
    clinical_notes TEXT,
    technical_notes TEXT,
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Individual analyte values within a result
CREATE TABLE IF NOT EXISTS lab_result_values (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lab_result_id UUID NOT NULL REFERENCES lab_results(id) ON DELETE CASCADE,
    
    -- Analyte identification
    analyte_code VARCHAR(50) NOT NULL,
    analyte_name VARCHAR(255) NOT NULL,
    
    -- Values
    value_numeric DECIMAL(12, 4),
    value_text TEXT,
    unit VARCHAR(50),
    
    -- Reference ranges (age/sex specific)
    ref_low DECIMAL(12, 4),
    ref_high DECIMAL(12, 4),
    ref_range_text VARCHAR(200),  -- For non-numeric ranges
    
    -- Flags
    flag VARCHAR(10) CHECK (flag IN ('N', 'L', 'H', 'LL', 'HH', 'A', 'AA', 'U', 'D')),
    is_critical BOOLEAN DEFAULT FALSE,
    
    -- Methodology
    method VARCHAR(100),
    instrument VARCHAR(100),
    
    sort_order INTEGER DEFAULT 0,
    
    created_at TIMESTAMP DEFAULT NOW()
);

-- Specimen tracking
CREATE TABLE IF NOT EXISTS specimens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    specimen_number VARCHAR(50) UNIQUE,
    
    -- Source
    patient_id UUID NOT NULL REFERENCES patients(id),
    encounter_id UUID REFERENCES encounters(id),
    lab_order_id UUID REFERENCES lab_orders(id),
    
    -- Specimen details
    specimen_type VARCHAR(100) NOT NULL,  -- blood, urine, stool, swab, tissue, etc.
    collection_site VARCHAR(100),
    volume VARCHAR(50),
    container_type VARCHAR(100),
    
    -- Status tracking
    status VARCHAR(30) DEFAULT 'ordered' CHECK (status IN ('ordered', 'collected', 'in-transit', 'received', 'processing', 'completed', 'rejected')),
    rejection_reason TEXT,
    
    -- Timestamps
    ordered_at TIMESTAMP DEFAULT NOW(),
    collected_at TIMESTAMP,
    collected_by UUID REFERENCES staff(id),
    received_at TIMESTAMP,
    received_by UUID REFERENCES staff(id),
    
    -- Barcode
    barcode VARCHAR(100) UNIQUE,
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Lab result indexes
CREATE INDEX IF NOT EXISTS idx_lab_results_order_item ON lab_results(lab_order_item_id);
CREATE INDEX IF NOT EXISTS idx_lab_results_order ON lab_results(lab_order_id);
CREATE INDEX IF NOT EXISTS idx_lab_results_status ON lab_results(status);
CREATE INDEX IF NOT EXISTS idx_lab_result_values_result ON lab_result_values(lab_result_id);
CREATE INDEX IF NOT EXISTS idx_lab_result_values_analyte ON lab_result_values(analyte_code);
CREATE INDEX IF NOT EXISTS idx_lab_result_values_critical ON lab_result_values(is_critical) WHERE is_critical = TRUE;
CREATE INDEX IF NOT EXISTS idx_specimens_patient ON specimens(patient_id);
CREATE INDEX IF NOT EXISTS idx_specimens_order ON specimens(lab_order_id);
CREATE INDEX IF NOT EXISTS idx_specimens_status ON specimens(status);
CREATE INDEX IF NOT EXISTS idx_specimens_barcode ON specimens(barcode);

-- Specimen number generation
CREATE SEQUENCE IF NOT EXISTS specimen_number_seq START 1;
CREATE OR REPLACE FUNCTION generate_specimen_number()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.specimen_number IS NULL THEN
        NEW.specimen_number := 'SPM-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || 
                               LPAD(NEXTVAL('specimen_number_seq')::TEXT, 5, '0');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_specimen_number ON specimens;
CREATE TRIGGER set_specimen_number
    BEFORE INSERT ON specimens
    FOR EACH ROW
    EXECUTE FUNCTION generate_specimen_number();

-- =====================================================
-- P0-5: REAL PHARMACY STOCK MODEL
-- =====================================================
-- Proper batch/lot tracking, expiry, and dispensing

-- Drug batches with lot tracking
CREATE TABLE IF NOT EXISTS drug_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    drug_id INTEGER NOT NULL REFERENCES drugs(id),
    
    -- Batch details
    batch_number VARCHAR(100) NOT NULL,
    lot_number VARCHAR(100),
    
    -- Quantities
    initial_quantity INTEGER NOT NULL CHECK (initial_quantity > 0),
    current_quantity INTEGER NOT NULL DEFAULT 0,
    
    -- Dates
    manufacture_date DATE,
    expiry_date DATE NOT NULL,
    received_date DATE DEFAULT CURRENT_DATE,
    
    -- Cost
    unit_cost DECIMAL(10, 2) NOT NULL,
    total_cost DECIMAL(12, 2) GENERATED ALWAYS AS (initial_quantity * unit_cost) STORED,
    
    -- Supplier
    supplier_name VARCHAR(200),
    supplier_invoice VARCHAR(100),
    
    -- Status
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'depleted', 'expired', 'recalled', 'quarantine')),
    
    -- Storage
    storage_location VARCHAR(100),
    storage_conditions VARCHAR(200),
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    UNIQUE(drug_id, batch_number)
);

-- Enhanced stock movements (references batches)
CREATE TABLE IF NOT EXISTS stock_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    drug_id INTEGER NOT NULL REFERENCES drugs(id),
    batch_id UUID REFERENCES drug_batches(id),
    
    -- Movement
    movement_type VARCHAR(30) NOT NULL CHECK (movement_type IN (
        'purchase', 'receive', 'dispense', 'return', 'transfer_in', 'transfer_out',
        'adjustment_add', 'adjustment_remove', 'expired', 'damaged', 'recalled', 'wastage'
    )),
    quantity INTEGER NOT NULL,
    
    -- Before/after
    quantity_before INTEGER,
    quantity_after INTEGER,
    
    -- Reference
    reference_type VARCHAR(50),    -- 'prescription', 'purchase_order', 'transfer', 'manual'
    reference_id VARCHAR(100),
    
    -- Cost
    unit_cost DECIMAL(10, 2),
    
    -- Attribution
    performed_by UUID REFERENCES staff(id),
    performed_at TIMESTAMP DEFAULT NOW(),
    approved_by UUID REFERENCES staff(id),
    
    -- Notes
    reason TEXT,
    notes TEXT,
    
    created_at TIMESTAMP DEFAULT NOW()
);

-- Dispensation records (links prescriptions to batches)
CREATE TABLE IF NOT EXISTS dispensations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Links
    prescription_id INTEGER REFERENCES prescriptions(id),
    prescription_item_id INTEGER REFERENCES prescription_items(id),
    batch_id UUID NOT NULL REFERENCES drug_batches(id),
    drug_id INTEGER NOT NULL REFERENCES drugs(id),
    patient_id UUID NOT NULL REFERENCES patients(id),
    encounter_id UUID REFERENCES encounters(id),
    
    -- Quantity
    quantity_dispensed INTEGER NOT NULL CHECK (quantity_dispensed > 0),
    
    -- Instructions
    dosage_instructions TEXT,
    duration_days INTEGER,
    
    -- Staff
    dispensed_by UUID NOT NULL REFERENCES staff(id),
    verified_by UUID REFERENCES staff(id),
    
    -- Counseling
    patient_counseled BOOLEAN DEFAULT FALSE,
    counseling_notes TEXT,
    
    -- Timestamps
    dispensed_at TIMESTAMP DEFAULT NOW(),
    
    created_at TIMESTAMP DEFAULT NOW()
);

-- Stock/batch indexes
CREATE INDEX IF NOT EXISTS idx_drug_batches_drug ON drug_batches(drug_id);
CREATE INDEX IF NOT EXISTS idx_drug_batches_expiry ON drug_batches(expiry_date);
CREATE INDEX IF NOT EXISTS idx_drug_batches_status ON drug_batches(status);
CREATE INDEX IF NOT EXISTS idx_drug_batches_batch_number ON drug_batches(batch_number);

CREATE INDEX IF NOT EXISTS idx_stock_movements_drug ON stock_movements(drug_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_batch ON stock_movements(batch_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_type ON stock_movements(movement_type);
CREATE INDEX IF NOT EXISTS idx_stock_movements_date ON stock_movements(performed_at);

CREATE INDEX IF NOT EXISTS idx_dispensations_prescription ON dispensations(prescription_id);
CREATE INDEX IF NOT EXISTS idx_dispensations_batch ON dispensations(batch_id);
CREATE INDEX IF NOT EXISTS idx_dispensations_drug ON dispensations(drug_id);
CREATE INDEX IF NOT EXISTS idx_dispensations_patient ON dispensations(patient_id);
CREATE INDEX IF NOT EXISTS idx_dispensations_date ON dispensations(dispensed_at);

-- Trigger: Auto-expire batches past expiry date
CREATE OR REPLACE FUNCTION check_batch_expiry()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.expiry_date < CURRENT_DATE AND NEW.status = 'active' THEN
        NEW.status := 'expired';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_batch_expiry ON drug_batches;
CREATE TRIGGER trg_check_batch_expiry
    BEFORE INSERT OR UPDATE ON drug_batches
    FOR EACH ROW
    EXECUTE FUNCTION check_batch_expiry();

-- Trigger: Update batch quantity on dispensation
CREATE OR REPLACE FUNCTION update_batch_on_dispense()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE drug_batches 
    SET current_quantity = current_quantity - NEW.quantity_dispensed,
        status = CASE 
            WHEN current_quantity - NEW.quantity_dispensed <= 0 THEN 'depleted'
            ELSE status 
        END,
        updated_at = NOW()
    WHERE id = NEW.batch_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_batch_on_dispense ON dispensations;
CREATE TRIGGER trg_update_batch_on_dispense
    AFTER INSERT ON dispensations
    FOR EACH ROW
    EXECUTE FUNCTION update_batch_on_dispense();

-- =====================================================
-- P0-6: POLYMORPHIC ATTACHMENTS (OBJECT STORAGE)
-- =====================================================
-- Compatible with MinIO/Nextcloud/S3

CREATE TABLE IF NOT EXISTS attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES organizations(id),
    
    -- Polymorphic owner
    owner_type VARCHAR(50) NOT NULL CHECK (owner_type IN (
        'encounter', 'patient', 'lab_result', 'radiology_order', 'radiology_report',
        'invoice', 'prescription', 'clinical_note', 'consultation', 'insurance_claim'
    )),
    owner_id UUID NOT NULL,
    
    -- Storage reference (MinIO/S3 compatible)
    storage_key VARCHAR(500) NOT NULL,    -- Object key in bucket
    bucket VARCHAR(100) NOT NULL,          -- S3/MinIO bucket name
    storage_provider VARCHAR(50) DEFAULT 'minio',
    
    -- File metadata
    original_filename VARCHAR(500) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    size_bytes BIGINT NOT NULL,
    checksum VARCHAR(128),                 -- SHA-256 hash
    
    -- Classification
    category VARCHAR(50) CHECK (category IN ('document', 'image', 'dicom', 'report', 'consent', 'insurance', 'lab_report', 'prescription', 'other')),
    description TEXT,
    tags TEXT[],
    
    -- Security
    is_encrypted BOOLEAN DEFAULT FALSE,
    encryption_key_id VARCHAR(255),
    access_level VARCHAR(20) DEFAULT 'restricted' CHECK (access_level IN ('public', 'restricted', 'confidential', 'secret')),
    
    -- Upload
    uploaded_by UUID REFERENCES staff(id),
    uploaded_at TIMESTAMP DEFAULT NOW(),
    
    -- Soft delete
    is_deleted BOOLEAN DEFAULT FALSE,
    deleted_at TIMESTAMP,
    deleted_by UUID REFERENCES staff(id),
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attachments_owner ON attachments(owner_type, owner_id);
CREATE INDEX IF NOT EXISTS idx_attachments_tenant ON attachments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_attachments_category ON attachments(category);
CREATE INDEX IF NOT EXISTS idx_attachments_mime ON attachments(mime_type);
CREATE INDEX IF NOT EXISTS idx_attachments_uploaded_at ON attachments(uploaded_at);
CREATE INDEX IF NOT EXISTS idx_attachments_not_deleted ON attachments(is_deleted) WHERE is_deleted = FALSE;

-- =====================================================
-- P1-1: FIX COMPETING PAYMENT MODELS
-- =====================================================
-- Make billing_payments.invoice_id nullable (payments are independent, allocations link to invoices)
-- The column already allows NULL per schema, but we enforce the pattern:

-- Insurance policies and payers
CREATE TABLE IF NOT EXISTS payers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES organizations(id),
    payer_code VARCHAR(50) UNIQUE NOT NULL,
    payer_name VARCHAR(255) NOT NULL,
    payer_type VARCHAR(30) NOT NULL CHECK (payer_type IN ('insurance', 'corporate', 'government', 'ngo', 'self')),
    
    -- Contact
    contact_email VARCHAR(200),
    contact_phone VARCHAR(20),
    address JSONB,
    
    -- Contract
    contract_number VARCHAR(100),
    contract_start DATE,
    contract_end DATE,
    discount_percentage DECIMAL(5, 2) DEFAULT 0,
    payment_terms VARCHAR(50) DEFAULT '30-days',
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS insurance_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payer_id UUID NOT NULL REFERENCES payers(id),
    
    policy_number VARCHAR(100) NOT NULL,
    policy_name VARCHAR(255),
    policy_type VARCHAR(50) CHECK (policy_type IN ('individual', 'family', 'group', 'corporate', 'government')),
    
    -- Coverage
    coverage_type VARCHAR(50) DEFAULT 'comprehensive' CHECK (coverage_type IN ('comprehensive', 'outpatient-only', 'inpatient-only', 'maternity', 'dental', 'optical')),
    annual_limit DECIMAL(12, 2),
    per_visit_limit DECIMAL(10, 2),
    co_payment_percentage DECIMAL(5, 2) DEFAULT 0,
    deductible DECIMAL(10, 2) DEFAULT 0,
    
    -- Validity
    effective_date DATE NOT NULL,
    expiry_date DATE,
    
    is_active BOOLEAN DEFAULT TRUE,
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS patient_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id),
    policy_id UUID NOT NULL REFERENCES insurance_policies(id),
    
    member_number VARCHAR(100) NOT NULL,
    member_type VARCHAR(30) DEFAULT 'principal' CHECK (member_type IN ('principal', 'spouse', 'child', 'dependent')),
    
    -- Dates
    start_date DATE NOT NULL,
    end_date DATE,
    
    is_primary BOOLEAN DEFAULT TRUE,
    is_active BOOLEAN DEFAULT TRUE,
    
    -- Pre-authorization
    requires_preauth BOOLEAN DEFAULT FALSE,
    preauth_number VARCHAR(100),
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    UNIQUE(patient_id, policy_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_payers_type ON payers(payer_type);
CREATE INDEX IF NOT EXISTS idx_payers_active ON payers(is_active);
CREATE INDEX IF NOT EXISTS idx_insurance_policies_payer ON insurance_policies(payer_id);
CREATE INDEX IF NOT EXISTS idx_insurance_policies_number ON insurance_policies(policy_number);
CREATE INDEX IF NOT EXISTS idx_patient_policies_patient ON patient_policies(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_policies_policy ON patient_policies(policy_id);
CREATE INDEX IF NOT EXISTS idx_patient_policies_primary ON patient_policies(patient_id) WHERE is_primary = TRUE;

-- =====================================================
-- P1-2: SCHEDULE TEMPLATES + EXCEPTIONS
-- =====================================================

CREATE TABLE IF NOT EXISTS schedule_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id UUID NOT NULL REFERENCES staff(id),
    clinic_id UUID REFERENCES clinics(id),
    
    -- Recurrence pattern
    day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Sunday
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    slot_duration_minutes INTEGER DEFAULT 30,
    
    -- Capacity
    max_appointments INTEGER DEFAULT 20,
    overbooking_limit INTEGER DEFAULT 2,
    
    -- Validity
    effective_from DATE DEFAULT CURRENT_DATE,
    effective_until DATE,
    
    is_active BOOLEAN DEFAULT TRUE,
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    CHECK (start_time < end_time)
);

CREATE TABLE IF NOT EXISTS schedule_exceptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id UUID NOT NULL REFERENCES staff(id),
    
    -- Exception details
    exception_date DATE NOT NULL,
    start_time TIME,          -- NULL = full day exception
    end_time TIME,
    
    exception_type VARCHAR(30) NOT NULL CHECK (exception_type IN (
        'leave', 'sick', 'conference', 'training', 'personal',
        'holiday', 'block', 'open'   -- 'open' = extra availability
    )),
    
    reason TEXT,
    approved_by UUID REFERENCES staff(id),
    approved_at TIMESTAMP,
    
    status VARCHAR(20) DEFAULT 'approved' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_schedule_templates_staff ON schedule_templates(staff_id);
CREATE INDEX IF NOT EXISTS idx_schedule_templates_clinic ON schedule_templates(clinic_id);
CREATE INDEX IF NOT EXISTS idx_schedule_templates_day ON schedule_templates(day_of_week);
CREATE INDEX IF NOT EXISTS idx_schedule_templates_active ON schedule_templates(is_active) WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_schedule_exceptions_staff ON schedule_exceptions(staff_id);
CREATE INDEX IF NOT EXISTS idx_schedule_exceptions_date ON schedule_exceptions(exception_date);
CREATE INDEX IF NOT EXISTS idx_schedule_exceptions_type ON schedule_exceptions(exception_type);

-- =====================================================
-- P1-3: ENCOUNTER PARTICIPANTS (MULTI-PROVIDER)
-- =====================================================

CREATE TABLE IF NOT EXISTS encounter_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    encounter_id UUID NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
    staff_id UUID NOT NULL REFERENCES staff(id),
    
    -- Role in encounter
    participant_role VARCHAR(50) NOT NULL CHECK (participant_role IN (
        'primary_physician', 'consulting_physician', 'nurse', 'anesthesiologist',
        'surgeon', 'assistant_surgeon', 'technician', 'pharmacist', 'social_worker',
        'interpreter', 'observer', 'student'
    )),
    
    -- Timing
    joined_at TIMESTAMP DEFAULT NOW(),
    left_at TIMESTAMP,
    
    -- Notes
    notes TEXT,
    
    created_at TIMESTAMP DEFAULT NOW(),
    
    UNIQUE(encounter_id, staff_id, participant_role)
);

CREATE INDEX IF NOT EXISTS idx_encounter_participants_encounter ON encounter_participants(encounter_id);
CREATE INDEX IF NOT EXISTS idx_encounter_participants_staff ON encounter_participants(staff_id);
CREATE INDEX IF NOT EXISTS idx_encounter_participants_role ON encounter_participants(participant_role);

-- =====================================================
-- P1-4: PATIENT IDENTIFIERS + CONTACTS
-- =====================================================

CREATE TABLE IF NOT EXISTS patient_identifiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    
    identifier_type VARCHAR(50) NOT NULL CHECK (identifier_type IN ('mrn', 'national_id', 'passport', 'nhif', 'sha', 'birth_certificate', 'alien_id', 'military_id', 'other')),
    identifier_value VARCHAR(100) NOT NULL,
    
    -- Validity
    issued_date DATE,
    expiry_date DATE,
    issuing_authority VARCHAR(200),
    
    is_primary BOOLEAN DEFAULT FALSE,
    is_verified BOOLEAN DEFAULT FALSE,
    verified_by UUID REFERENCES staff(id),
    verified_at TIMESTAMP,
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    UNIQUE(identifier_type, identifier_value)
);

CREATE TABLE IF NOT EXISTS patient_contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    
    -- Contact details
    contact_type VARCHAR(30) NOT NULL CHECK (contact_type IN ('next_of_kin', 'emergency', 'guardian', 'employer', 'insurance_contact', 'other')),
    relationship VARCHAR(50),
    
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    alternative_phone VARCHAR(20),
    email VARCHAR(200),
    address JSONB,
    
    is_primary BOOLEAN DEFAULT FALSE,
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS consents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    encounter_id UUID REFERENCES encounters(id),
    
    consent_type VARCHAR(50) NOT NULL CHECK (consent_type IN ('treatment', 'procedure', 'anesthesia', 'research', 'data_sharing', 'telemedicine', 'photography', 'general')),
    
    -- Content
    description TEXT NOT NULL,
    details JSONB,
    
    -- Status
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'given', 'refused', 'withdrawn', 'expired')),
    
    -- Signatures
    given_at TIMESTAMP,
    given_by VARCHAR(255),     -- Patient or guardian name
    witnessed_by UUID REFERENCES staff(id),
    
    -- Validity
    valid_from TIMESTAMP DEFAULT NOW(),
    valid_until TIMESTAMP,
    
    -- Withdrawal
    withdrawn_at TIMESTAMP,
    withdrawal_reason TEXT,
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_patient_identifiers_patient ON patient_identifiers(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_identifiers_type ON patient_identifiers(identifier_type);
CREATE INDEX IF NOT EXISTS idx_patient_identifiers_value ON patient_identifiers(identifier_value);

CREATE INDEX IF NOT EXISTS idx_patient_contacts_patient ON patient_contacts(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_contacts_type ON patient_contacts(contact_type);

CREATE INDEX IF NOT EXISTS idx_consents_patient ON consents(patient_id);
CREATE INDEX IF NOT EXISTS idx_consents_encounter ON consents(encounter_id);
CREATE INDEX IF NOT EXISTS idx_consents_type ON consents(consent_type);
CREATE INDEX IF NOT EXISTS idx_consents_status ON consents(status);

-- =====================================================
-- GRANT PERMISSIONS
-- =====================================================

GRANT ALL PRIVILEGES ON TABLE organizations TO medimesh_user;
GRANT ALL PRIVILEGES ON TABLE audit_events TO medimesh_user;
GRANT ALL PRIVILEGES ON TABLE data_access_log TO medimesh_user;
GRANT ALL PRIVILEGES ON TABLE encounter_diagnoses TO medimesh_user;
GRANT ALL PRIVILEGES ON TABLE observations TO medimesh_user;
GRANT ALL PRIVILEGES ON TABLE clinical_notes TO medimesh_user;
GRANT ALL PRIVILEGES ON TABLE clinical_note_sections TO medimesh_user;
GRANT ALL PRIVILEGES ON TABLE lab_results TO medimesh_user;
GRANT ALL PRIVILEGES ON TABLE lab_result_values TO medimesh_user;
GRANT ALL PRIVILEGES ON TABLE specimens TO medimesh_user;
GRANT ALL PRIVILEGES ON TABLE drug_batches TO medimesh_user;
GRANT ALL PRIVILEGES ON TABLE stock_movements TO medimesh_user;
GRANT ALL PRIVILEGES ON TABLE dispensations TO medimesh_user;
GRANT ALL PRIVILEGES ON TABLE attachments TO medimesh_user;
GRANT ALL PRIVILEGES ON TABLE payers TO medimesh_user;
GRANT ALL PRIVILEGES ON TABLE insurance_policies TO medimesh_user;
GRANT ALL PRIVILEGES ON TABLE patient_policies TO medimesh_user;
GRANT ALL PRIVILEGES ON TABLE schedule_templates TO medimesh_user;
GRANT ALL PRIVILEGES ON TABLE schedule_exceptions TO medimesh_user;
GRANT ALL PRIVILEGES ON TABLE encounter_participants TO medimesh_user;
GRANT ALL PRIVILEGES ON TABLE patient_identifiers TO medimesh_user;
GRANT ALL PRIVILEGES ON TABLE patient_contacts TO medimesh_user;
GRANT ALL PRIVILEGES ON TABLE consents TO medimesh_user;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO medimesh_user;

-- =====================================================
-- COMPLETION MESSAGE
-- =====================================================
DO $$
BEGIN
    RAISE NOTICE '=== P0 Schema Overhaul Complete ===';
    RAISE NOTICE 'P0-1: Multi-tenancy (organizations + tenant_id on 13 tables)';
    RAISE NOTICE 'P0-2: Audit trail (audit_events + data_access_log + staff.auth_subject_id)';
    RAISE NOTICE 'P0-3: Structured clinical data (encounter_diagnoses + observations + clinical_notes + sections)';
    RAISE NOTICE 'P0-4: Structured lab results (lab_results + lab_result_values + specimens)';
    RAISE NOTICE 'P0-5: Real pharmacy stock (drug_batches + stock_movements + dispensations)';
    RAISE NOTICE 'P0-6: Polymorphic attachments (object storage compatible)';
    RAISE NOTICE 'P1-1: Insurance model (payers + insurance_policies + patient_policies)';
    RAISE NOTICE 'P1-2: Schedule templates + exceptions';
    RAISE NOTICE 'P1-3: Encounter participants (multi-provider)';
    RAISE NOTICE 'P1-4: Patient identifiers + contacts + consents';
END $$;
