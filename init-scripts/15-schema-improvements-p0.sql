-- =====================================================
-- 15. SCHEMA IMPROVEMENTS - P0 (Critical)
-- =====================================================
-- Multi-tenancy, audit trail, clinical coding,
-- structured lab results, pharmacy stock, attachments
-- Author: MediMesh Development Team
-- Date: February 2026
-- =====================================================

\c medimesh;

-- =====================================================
-- 1. MULTI-TENANCY BOUNDARY
-- =====================================================
-- Add tenant/organization layer for multi-clinic SaaS

CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL, -- URL-safe identifier
    type VARCHAR(50) DEFAULT 'clinic' CHECK (type IN ('clinic', 'hospital', 'network', 'laboratory')),
    
    -- Contact
    email VARCHAR(255),
    phone VARCHAR(50),
    address TEXT,
    city VARCHAR(100),
    country VARCHAR(100) DEFAULT 'Kenya',
    
    -- Settings
    timezone VARCHAR(50) DEFAULT 'Africa/Nairobi',
    currency VARCHAR(3) DEFAULT 'KES',
    logo_url TEXT,
    
    -- Status
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'trial', 'cancelled')),
    subscription_tier VARCHAR(30) DEFAULT 'basic' CHECK (subscription_tier IN ('basic', 'standard', 'premium', 'enterprise')),
    trial_ends_at TIMESTAMP,
    
    -- Metadata
    settings JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add tenant_id to core tables (nullable for backward compatibility)
ALTER TABLE patients ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES organizations(id);
ALTER TABLE encounters ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES organizations(id);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES organizations(id);
ALTER TABLE billing_payments ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES organizations(id);
ALTER TABLE lab_orders ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES organizations(id);
ALTER TABLE radiology_orders ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES organizations(id);
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES organizations(id);
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES organizations(id);
ALTER TABLE staff ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES organizations(id);
ALTER TABLE departments ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES organizations(id);

-- Indexes for tenant scoping
CREATE INDEX IF NOT EXISTS idx_patients_tenant ON patients(tenant_id);
CREATE INDEX IF NOT EXISTS idx_encounters_tenant ON encounters(tenant_id);
CREATE INDEX IF NOT EXISTS idx_invoices_tenant ON invoices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_lab_orders_tenant ON lab_orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_radiology_orders_tenant ON radiology_orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_tenant ON prescriptions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_appointments_tenant ON appointments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_staff_tenant ON staff(tenant_id);

-- Organization membership (staff can belong to multiple orgs)
CREATE TABLE IF NOT EXISTS organization_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
    role VARCHAR(50) DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
    is_active BOOLEAN DEFAULT true,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(organization_id, staff_id)
);

-- =====================================================
-- 2. AUDIT TRAIL & DATA ACCESS LOG
-- =====================================================

-- Comprehensive audit events table
CREATE TABLE IF NOT EXISTS audit_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES organizations(id),
    
    -- Who
    user_id UUID, -- Could be staff ID or system
    user_name VARCHAR(255),
    user_role VARCHAR(50),
    
    -- What
    action VARCHAR(50) NOT NULL CHECK (action IN (
        'create', 'read', 'update', 'delete', 
        'login', 'logout', 'login_failed',
        'export', 'print', 'share',
        'approve', 'reject', 'submit',
        'access_denied', 'permission_change'
    )),
    entity_type VARCHAR(100) NOT NULL, -- 'patient', 'encounter', 'invoice', etc.
    entity_id UUID,
    entity_display VARCHAR(255), -- Human-readable identifier
    
    -- Context
    description TEXT,
    changes JSONB, -- { field: { old: ..., new: ... } }
    metadata JSONB, -- Additional context data
    
    -- Security
    ip_address INET,
    user_agent TEXT,
    session_id VARCHAR(255),
    
    -- Hashing for tamper detection
    data_hash VARCHAR(64), -- SHA-256 of (entity_type + entity_id + action + timestamp)
    previous_hash VARCHAR(64), -- Chain to previous audit event for entity
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Data access log (for read events - Kenya health data compliance)
CREATE TABLE IF NOT EXISTS data_access_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES organizations(id),
    
    -- Who accessed
    user_id UUID NOT NULL,
    user_role VARCHAR(50),
    
    -- What was accessed
    resource_type VARCHAR(100) NOT NULL, -- 'patient_record', 'lab_result', 'prescription', etc.
    resource_id UUID NOT NULL,
    patient_id UUID REFERENCES patients(id), -- The patient whose data was accessed
    
    -- Access details
    access_type VARCHAR(30) NOT NULL CHECK (access_type IN ('view', 'download', 'print', 'export', 'api_read')),
    access_reason TEXT, -- Optional justification
    
    -- Context
    ip_address INET,
    user_agent TEXT,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Link staff to IAM (Keycloak)
ALTER TABLE staff ADD COLUMN IF NOT EXISTS auth_subject_id VARCHAR(255); -- Keycloak subject ID
ALTER TABLE staff ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS login_count INTEGER DEFAULT 0;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_staff_auth_subject ON staff(auth_subject_id);

-- Indexes for audit
CREATE INDEX IF NOT EXISTS idx_audit_events_user ON audit_events(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_entity ON audit_events(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_action ON audit_events(action);
CREATE INDEX IF NOT EXISTS idx_audit_events_created ON audit_events(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_events_tenant ON audit_events(tenant_id);

CREATE INDEX IF NOT EXISTS idx_data_access_log_user ON data_access_log(user_id);
CREATE INDEX IF NOT EXISTS idx_data_access_log_patient ON data_access_log(patient_id);
CREATE INDEX IF NOT EXISTS idx_data_access_log_resource ON data_access_log(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_data_access_log_created ON data_access_log(created_at);

-- =====================================================
-- 3. CODED CLINICAL DATA (encounter_diagnoses, observations, clinical_notes)
-- =====================================================

-- Encounter diagnoses (coded, not free text)
CREATE TABLE IF NOT EXISTS encounter_diagnoses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    encounter_id UUID NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES patients(id),
    
    -- Coding
    code_system VARCHAR(30) NOT NULL DEFAULT 'ICD-10' CHECK (code_system IN ('ICD-10', 'ICD-11', 'SNOMED-CT', 'LOCAL')),
    code VARCHAR(20) NOT NULL, -- e.g., 'J06.9' for acute upper respiratory infection
    display VARCHAR(500) NOT NULL, -- Human-readable display name
    
    -- Classification
    diagnosis_type VARCHAR(30) DEFAULT 'working' CHECK (diagnosis_type IN ('working', 'provisional', 'confirmed', 'differential', 'rule-out')),
    is_primary BOOLEAN DEFAULT false,
    severity VARCHAR(20) CHECK (severity IN ('mild', 'moderate', 'severe', 'critical')),
    
    -- Chronicity
    onset_date DATE,
    resolution_date DATE,
    is_chronic BOOLEAN DEFAULT false,
    
    -- Attribution
    recorded_by UUID REFERENCES staff(id),
    verified_by UUID REFERENCES staff(id),
    
    -- Notes
    clinical_notes TEXT,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Observations/vitals (structured, queryable)
CREATE TABLE IF NOT EXISTS observations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    encounter_id UUID NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES patients(id),
    
    -- Observation type
    obs_type VARCHAR(50) NOT NULL CHECK (obs_type IN (
        'vital_sign', 'lab_value', 'physical_exam', 'symptom', 
        'measurement', 'score', 'assessment'
    )),
    
    -- Coding (LOINC for vitals/labs, SNOMED for symptoms)
    code_system VARCHAR(30) DEFAULT 'LOINC',
    code VARCHAR(20), -- e.g., '8310-5' for body temperature
    display VARCHAR(255) NOT NULL, -- e.g., 'Body Temperature'
    
    -- Value (one of these)
    value_numeric DECIMAL(12, 4),
    value_text TEXT,
    value_boolean BOOLEAN,
    value_datetime TIMESTAMP,
    
    -- Units & reference range
    unit VARCHAR(30), -- e.g., '°C', 'mmHg', 'kg'
    reference_low DECIMAL(12, 4),
    reference_high DECIMAL(12, 4),
    abnormal_flag VARCHAR(10) CHECK (abnormal_flag IN ('N', 'L', 'H', 'LL', 'HH', 'A', 'AA')),
    
    -- Interpretation
    interpretation VARCHAR(50) CHECK (interpretation IN ('normal', 'abnormal', 'critical', 'indeterminate')),
    
    -- Context
    body_site VARCHAR(100), -- e.g., 'left arm', 'oral'
    method VARCHAR(100), -- e.g., 'automated', 'manual', 'estimated'
    
    -- Attribution
    taken_by UUID REFERENCES staff(id),
    taken_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Status
    status VARCHAR(20) DEFAULT 'final' CHECK (status IN ('preliminary', 'final', 'amended', 'cancelled')),
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Clinical notes (SOAP model)
CREATE TABLE IF NOT EXISTS clinical_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    encounter_id UUID NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES patients(id),
    
    -- Note metadata
    note_type VARCHAR(30) NOT NULL CHECK (note_type IN (
        'soap', 'progress', 'admission', 'discharge', 'procedure',
        'consultation', 'referral', 'handoff', 'nursing', 'pharmacy'
    )),
    title VARCHAR(255),
    
    -- Author
    author_staff_id UUID NOT NULL REFERENCES staff(id),
    author_name VARCHAR(255),
    author_role VARCHAR(50),
    
    -- Status
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'final', 'amended', 'addendum')),
    signed_at TIMESTAMP,
    signed_by UUID REFERENCES staff(id),
    
    -- Versioning
    version INTEGER DEFAULT 1,
    parent_note_id UUID REFERENCES clinical_notes(id), -- For amendments/addenda
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Clinical note sections (structured content within notes)
CREATE TABLE IF NOT EXISTS clinical_note_sections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    note_id UUID NOT NULL REFERENCES clinical_notes(id) ON DELETE CASCADE,
    
    -- Section identification
    section VARCHAR(30) NOT NULL CHECK (section IN (
        'subjective', 'objective', 'assessment', 'plan', -- SOAP
        'chief_complaint', 'hpi', 'ros', 'physical_exam',
        'diagnostics', 'procedures', 'medications', 'follow_up',
        'patient_education', 'disposition', 'other'
    )),
    section_order INTEGER DEFAULT 0,
    
    -- Content
    content TEXT NOT NULL,
    structured_data JSONB, -- Optional structured data (e.g., coded findings)
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for clinical data
CREATE INDEX IF NOT EXISTS idx_encounter_diagnoses_encounter ON encounter_diagnoses(encounter_id);
CREATE INDEX IF NOT EXISTS idx_encounter_diagnoses_patient ON encounter_diagnoses(patient_id);
CREATE INDEX IF NOT EXISTS idx_encounter_diagnoses_code ON encounter_diagnoses(code_system, code);
CREATE INDEX IF NOT EXISTS idx_encounter_diagnoses_primary ON encounter_diagnoses(is_primary) WHERE is_primary = true;

CREATE INDEX IF NOT EXISTS idx_observations_encounter ON observations(encounter_id);
CREATE INDEX IF NOT EXISTS idx_observations_patient ON observations(patient_id);
CREATE INDEX IF NOT EXISTS idx_observations_type ON observations(obs_type);
CREATE INDEX IF NOT EXISTS idx_observations_code ON observations(code_system, code);
CREATE INDEX IF NOT EXISTS idx_observations_taken ON observations(taken_at);
CREATE INDEX IF NOT EXISTS idx_observations_abnormal ON observations(abnormal_flag) WHERE abnormal_flag IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_clinical_notes_encounter ON clinical_notes(encounter_id);
CREATE INDEX IF NOT EXISTS idx_clinical_notes_patient ON clinical_notes(patient_id);
CREATE INDEX IF NOT EXISTS idx_clinical_notes_author ON clinical_notes(author_staff_id);
CREATE INDEX IF NOT EXISTS idx_clinical_notes_type ON clinical_notes(note_type);

CREATE INDEX IF NOT EXISTS idx_clinical_note_sections_note ON clinical_note_sections(note_id);

-- =====================================================
-- 4. STRUCTURED LAB RESULTS
-- =====================================================

-- Lab results header (replaces simple Result field on lab_order_items)
CREATE TABLE IF NOT EXISTS lab_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lab_order_item_id UUID NOT NULL REFERENCES lab_order_items(id) ON DELETE CASCADE,
    lab_order_id UUID NOT NULL REFERENCES lab_orders(id),
    patient_id UUID NOT NULL REFERENCES patients(id),
    
    -- Status
    status VARCHAR(30) DEFAULT 'pending' CHECK (status IN (
        'pending', 'in-progress', 'preliminary', 'final', 'amended', 'cancelled'
    )),
    
    -- Result metadata
    result_date TIMESTAMP,
    reported_at TIMESTAMP,
    
    -- Verification
    performed_by UUID REFERENCES staff(id),
    verified_by UUID REFERENCES staff(id),
    verified_at TIMESTAMP,
    
    -- Equipment/method
    analyzer_name VARCHAR(100),
    method VARCHAR(100),
    
    -- Notes
    clinical_notes TEXT,
    technical_notes TEXT,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Lab result values (individual analytes within a test)
CREATE TABLE IF NOT EXISTS lab_result_values (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lab_result_id UUID NOT NULL REFERENCES lab_results(id) ON DELETE CASCADE,
    
    -- Analyte identification
    analyte_code VARCHAR(30), -- LOINC or local code
    analyte_name VARCHAR(200) NOT NULL, -- e.g., 'Hemoglobin', 'WBC Count'
    
    -- Value (one of these)
    value_numeric DECIMAL(12, 4),
    value_text TEXT,
    
    -- Units & reference range
    unit VARCHAR(30), -- e.g., 'g/dL', '10^9/L'
    reference_low DECIMAL(12, 4),
    reference_high DECIMAL(12, 4),
    critical_low DECIMAL(12, 4), -- Panic values
    critical_high DECIMAL(12, 4),
    
    -- Flags
    flag VARCHAR(10) CHECK (flag IN ('N', 'L', 'H', 'LL', 'HH', 'A', 'AA', 'R', 'S', 'I')),
    -- N=Normal, L=Low, H=High, LL=Critical Low, HH=Critical High, 
    -- A=Abnormal, AA=Critical Abnormal, R=Resistant, S=Sensitive, I=Intermediate
    
    -- Age/sex specific ranges
    reference_range_text VARCHAR(200), -- Display text like "4.5-11.0 x10^9/L"
    age_group VARCHAR(50), -- e.g., 'adult', 'pediatric', 'neonatal'
    sex_specific VARCHAR(10), -- 'M', 'F', 'all'
    
    -- Ordering
    sort_order INTEGER DEFAULT 0,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Specimen tracking
CREATE TABLE IF NOT EXISTS specimens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lab_order_id UUID NOT NULL REFERENCES lab_orders(id),
    patient_id UUID NOT NULL REFERENCES patients(id),
    
    -- Specimen info
    specimen_type VARCHAR(50) NOT NULL, -- 'blood', 'urine', 'csf', 'tissue', etc.
    barcode VARCHAR(100) UNIQUE,
    collection_container VARCHAR(50), -- 'EDTA', 'plain', 'lithium heparin', etc.
    
    -- Collection
    collected_at TIMESTAMP,
    collected_by UUID REFERENCES staff(id),
    collection_site VARCHAR(100), -- 'left antecubital vein', etc.
    
    -- Processing
    received_at TIMESTAMP,
    received_by UUID REFERENCES staff(id),
    
    -- Status
    status VARCHAR(30) DEFAULT 'ordered' CHECK (status IN (
        'ordered', 'collected', 'received', 'processing', 'completed', 'rejected'
    )),
    rejection_reason TEXT,
    
    -- Volume
    volume_ml DECIMAL(8, 2),
    
    -- Storage
    storage_location VARCHAR(100),
    storage_temperature VARCHAR(20),
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for lab results
CREATE INDEX IF NOT EXISTS idx_lab_results_order_item ON lab_results(lab_order_item_id);
CREATE INDEX IF NOT EXISTS idx_lab_results_order ON lab_results(lab_order_id);
CREATE INDEX IF NOT EXISTS idx_lab_results_patient ON lab_results(patient_id);
CREATE INDEX IF NOT EXISTS idx_lab_results_status ON lab_results(status);

CREATE INDEX IF NOT EXISTS idx_lab_result_values_result ON lab_result_values(lab_result_id);
CREATE INDEX IF NOT EXISTS idx_lab_result_values_flag ON lab_result_values(flag) WHERE flag IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_specimens_order ON specimens(lab_order_id);
CREATE INDEX IF NOT EXISTS idx_specimens_patient ON specimens(patient_id);
CREATE INDEX IF NOT EXISTS idx_specimens_barcode ON specimens(barcode);

-- =====================================================
-- 5. PHARMACY: REAL STOCK MODEL
-- =====================================================

-- Drug batches (lot/batch tracking with expiry)
CREATE TABLE IF NOT EXISTS drug_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    drug_id INTEGER NOT NULL REFERENCES drugs(id),
    tenant_id UUID REFERENCES organizations(id),
    
    -- Batch info
    batch_number VARCHAR(100) NOT NULL,
    lot_number VARCHAR(100),
    
    -- Dates
    manufacture_date DATE,
    expiry_date DATE NOT NULL,
    received_date DATE DEFAULT CURRENT_DATE,
    
    -- Quantity
    initial_quantity INTEGER NOT NULL,
    current_quantity INTEGER NOT NULL DEFAULT 0,
    
    -- Costing
    unit_cost DECIMAL(10, 2),
    total_cost DECIMAL(12, 2),
    
    -- Supplier
    supplier_name VARCHAR(200),
    supplier_invoice VARCHAR(100),
    purchase_order_number VARCHAR(100),
    
    -- Storage
    storage_conditions TEXT,
    storage_location VARCHAR(100),
    
    -- Status
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'depleted', 'expired', 'recalled', 'quarantine')),
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(drug_id, batch_number)
);

-- Stock movements (comprehensive movement tracking)
CREATE TABLE IF NOT EXISTS stock_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID NOT NULL REFERENCES drug_batches(id),
    drug_id INTEGER NOT NULL REFERENCES drugs(id),
    tenant_id UUID REFERENCES organizations(id),
    
    -- Movement type
    movement_type VARCHAR(30) NOT NULL CHECK (movement_type IN (
        'received', 'dispensed', 'returned', 'transferred',
        'adjustment_up', 'adjustment_down', 'expired', 'damaged', 'recalled'
    )),
    
    -- Quantity (positive for additions, negative for removals)
    quantity INTEGER NOT NULL,
    quantity_before INTEGER NOT NULL, -- Stock before this movement
    quantity_after INTEGER NOT NULL, -- Stock after this movement
    
    -- Reference (what triggered the movement)
    reference_type VARCHAR(50), -- 'prescription', 'purchase_order', 'adjustment', etc.
    reference_id UUID,
    
    -- Context
    reason TEXT,
    by_staff_id UUID REFERENCES staff(id),
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Dispensations (tracks actual dispensing events separate from prescriptions)
CREATE TABLE IF NOT EXISTS dispensations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prescription_id UUID NOT NULL REFERENCES prescriptions(id),
    prescription_item_id UUID NOT NULL REFERENCES prescription_items(id),
    patient_id UUID NOT NULL REFERENCES patients(id),
    
    -- Drug & batch
    drug_id INTEGER NOT NULL REFERENCES drugs(id),
    batch_id UUID REFERENCES drug_batches(id),
    
    -- Quantity
    quantity_prescribed INTEGER NOT NULL,
    quantity_dispensed INTEGER NOT NULL,
    quantity_remaining INTEGER GENERATED ALWAYS AS (quantity_prescribed - quantity_dispensed) STORED,
    
    -- Dispensing details
    dispensed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    dispensed_by UUID NOT NULL REFERENCES staff(id),
    
    -- Verification
    verified_by UUID REFERENCES staff(id),
    verified_at TIMESTAMP,
    
    -- Patient counseling
    counseling_provided BOOLEAN DEFAULT false,
    counseling_notes TEXT,
    
    -- Substitution
    is_substitution BOOLEAN DEFAULT false,
    substitution_reason TEXT,
    original_drug_id INTEGER REFERENCES drugs(id),
    
    -- Notes
    notes TEXT,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for pharmacy
CREATE INDEX IF NOT EXISTS idx_drug_batches_drug ON drug_batches(drug_id);
CREATE INDEX IF NOT EXISTS idx_drug_batches_expiry ON drug_batches(expiry_date);
CREATE INDEX IF NOT EXISTS idx_drug_batches_status ON drug_batches(status);
CREATE INDEX IF NOT EXISTS idx_drug_batches_batch ON drug_batches(batch_number);

CREATE INDEX IF NOT EXISTS idx_stock_movements_batch ON stock_movements(batch_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_drug ON stock_movements(drug_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_type ON stock_movements(movement_type);
CREATE INDEX IF NOT EXISTS idx_stock_movements_created ON stock_movements(created_at);

CREATE INDEX IF NOT EXISTS idx_dispensations_prescription ON dispensations(prescription_id);
CREATE INDEX IF NOT EXISTS idx_dispensations_patient ON dispensations(patient_id);
CREATE INDEX IF NOT EXISTS idx_dispensations_drug ON dispensations(drug_id);
CREATE INDEX IF NOT EXISTS idx_dispensations_batch ON dispensations(batch_id);

-- =====================================================
-- 6. POLYMORPHIC ATTACHMENTS (object storage)
-- =====================================================

CREATE TABLE IF NOT EXISTS attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES organizations(id),
    
    -- Polymorphic owner (what this attachment belongs to)
    owner_type VARCHAR(50) NOT NULL, -- 'encounter', 'lab_report', 'radiology', 'invoice', 'patient', 'clinical_note'
    owner_id UUID NOT NULL,
    
    -- File metadata (for object storage: MinIO/Nextcloud)
    storage_key VARCHAR(500) NOT NULL, -- Object key in storage
    bucket VARCHAR(100) NOT NULL DEFAULT 'medimesh-attachments',
    original_filename VARCHAR(500) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    size_bytes BIGINT NOT NULL,
    checksum VARCHAR(64), -- SHA-256 hash for integrity
    
    -- Classification
    category VARCHAR(50), -- 'medical_image', 'lab_report', 'referral_letter', 'consent_form', 'insurance_doc', etc.
    description TEXT,
    
    -- Security
    is_encrypted BOOLEAN DEFAULT false,
    encryption_key_id VARCHAR(100),
    access_level VARCHAR(20) DEFAULT 'restricted' CHECK (access_level IN ('public', 'internal', 'restricted', 'confidential')),
    
    -- DICOM specific (for radiology)
    dicom_study_uid VARCHAR(255),
    dicom_series_uid VARCHAR(255),
    dicom_instance_uid VARCHAR(255),
    
    -- Upload info
    uploaded_by UUID REFERENCES staff(id),
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Versioning
    version INTEGER DEFAULT 1,
    is_latest BOOLEAN DEFAULT true,
    previous_version_id UUID REFERENCES attachments(id),
    
    -- Soft delete
    deleted_at TIMESTAMP,
    deleted_by UUID REFERENCES staff(id),
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for attachments
CREATE INDEX IF NOT EXISTS idx_attachments_owner ON attachments(owner_type, owner_id);
CREATE INDEX IF NOT EXISTS idx_attachments_tenant ON attachments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_attachments_category ON attachments(category);
CREATE INDEX IF NOT EXISTS idx_attachments_uploaded ON attachments(uploaded_at);
CREATE INDEX IF NOT EXISTS idx_attachments_dicom_study ON attachments(dicom_study_uid) WHERE dicom_study_uid IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_attachments_latest ON attachments(is_latest) WHERE is_latest = true AND deleted_at IS NULL;

-- =====================================================
-- 7. PATIENT IDENTIFIERS & CONTACTS
-- =====================================================

-- Multiple identifiers per patient (MRN, national ID, passport, etc.)
CREATE TABLE IF NOT EXISTS patient_identifiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    
    identifier_type VARCHAR(30) NOT NULL CHECK (identifier_type IN (
        'mrn', 'national_id', 'passport', 'birth_cert', 'nhif', 
        'insurance_id', 'driver_license', 'other'
    )),
    identifier_value VARCHAR(100) NOT NULL,
    issuing_authority VARCHAR(200),
    issue_date DATE,
    expiry_date DATE,
    is_primary BOOLEAN DEFAULT false,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(identifier_type, identifier_value)
);

-- Patient contacts / next-of-kin
CREATE TABLE IF NOT EXISTS patient_contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    
    -- Contact details
    relationship VARCHAR(50) NOT NULL, -- 'spouse', 'parent', 'child', 'sibling', 'guardian', 'friend', 'employer'
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    phone VARCHAR(50),
    email VARCHAR(255),
    address TEXT,
    
    -- Emergency contact
    is_emergency_contact BOOLEAN DEFAULT false,
    is_next_of_kin BOOLEAN DEFAULT false,
    
    -- Authorization
    can_receive_info BOOLEAN DEFAULT false, -- HIPAA/data privacy
    can_make_decisions BOOLEAN DEFAULT false, -- Medical decisions
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Consent records
CREATE TABLE IF NOT EXISTS consents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    
    -- Consent type
    consent_type VARCHAR(50) NOT NULL CHECK (consent_type IN (
        'treatment', 'data_processing', 'data_sharing', 'research',
        'procedure', 'imaging', 'anesthesia', 'transfusion', 'other'
    )),
    
    -- Details
    description TEXT NOT NULL,
    given_by VARCHAR(255), -- Patient or guardian name
    relationship VARCHAR(50), -- If given by guardian
    
    -- Status
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'expired')),
    given_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    revoked_at TIMESTAMP,
    revoked_reason TEXT,
    
    -- Witness
    witnessed_by UUID REFERENCES staff(id),
    
    -- Document reference
    document_attachment_id UUID REFERENCES attachments(id),
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_patient_identifiers_patient ON patient_identifiers(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_identifiers_type ON patient_identifiers(identifier_type);
CREATE INDEX IF NOT EXISTS idx_patient_contacts_patient ON patient_contacts(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_contacts_emergency ON patient_contacts(is_emergency_contact) WHERE is_emergency_contact = true;
CREATE INDEX IF NOT EXISTS idx_consents_patient ON consents(patient_id);
CREATE INDEX IF NOT EXISTS idx_consents_type ON consents(consent_type);

-- =====================================================
-- COMMENTS
-- =====================================================
COMMENT ON TABLE organizations IS 'Multi-tenancy: organizations/clinics that use MediMesh';
COMMENT ON TABLE audit_events IS 'Comprehensive audit trail for all CUD operations';
COMMENT ON TABLE data_access_log IS 'Log of read access to sensitive health data (Kenya compliance)';
COMMENT ON TABLE encounter_diagnoses IS 'Coded diagnoses (ICD-10/SNOMED) linked to encounters';
COMMENT ON TABLE observations IS 'Structured clinical observations, vitals, and measurements';
COMMENT ON TABLE clinical_notes IS 'Structured clinical notes with SOAP model support';
COMMENT ON TABLE clinical_note_sections IS 'Sections within clinical notes (Subjective, Objective, Assessment, Plan)';
COMMENT ON TABLE lab_results IS 'Structured lab result headers with verification workflow';
COMMENT ON TABLE lab_result_values IS 'Individual analyte values within lab results (panels support)';
COMMENT ON TABLE specimens IS 'Specimen tracking with collection and processing workflow';
COMMENT ON TABLE drug_batches IS 'Batch/lot tracking for pharmacy inventory with expiry dates';
COMMENT ON TABLE stock_movements IS 'Complete audit trail of all pharmacy stock movements';
COMMENT ON TABLE dispensations IS 'Tracks actual drug dispensing events with counseling and substitution';
COMMENT ON TABLE attachments IS 'Polymorphic file attachments with object storage metadata (MinIO/Nextcloud)';
COMMENT ON TABLE patient_identifiers IS 'Multiple identifiers per patient (MRN, National ID, NHIF, etc.)';
COMMENT ON TABLE patient_contacts IS 'Patient emergency contacts and next-of-kin';
COMMENT ON TABLE consents IS 'Patient consent records for treatment, data processing, procedures';

-- =====================================================
-- GRANT PERMISSIONS
-- =====================================================
GRANT ALL PRIVILEGES ON TABLE organizations TO medimesh_user;
GRANT ALL PRIVILEGES ON TABLE organization_members TO medimesh_user;
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
GRANT ALL PRIVILEGES ON TABLE patient_identifiers TO medimesh_user;
GRANT ALL PRIVILEGES ON TABLE patient_contacts TO medimesh_user;
GRANT ALL PRIVILEGES ON TABLE consents TO medimesh_user;

-- =====================================================
-- COMPLETION MESSAGE
-- =====================================================
DO $$
BEGIN
    RAISE NOTICE '=== P0 Schema Improvements Complete ===';
    RAISE NOTICE '  1. Multi-tenancy: organizations + tenant_id on core tables';
    RAISE NOTICE '  2. Audit trail: audit_events + data_access_log + staff IAM link';
    RAISE NOTICE '  3. Clinical coding: encounter_diagnoses + observations + clinical_notes';
    RAISE NOTICE '  4. Structured lab: lab_results + lab_result_values + specimens';
    RAISE NOTICE '  5. Pharmacy stock: drug_batches + stock_movements + dispensations';
    RAISE NOTICE '  6. Attachments: polymorphic object storage metadata';
    RAISE NOTICE '  7. Patient: identifiers + contacts + consents';
END $$;
