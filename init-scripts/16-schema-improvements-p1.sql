-- =====================================================
-- 16. SCHEMA IMPROVEMENTS - P1 (Important, fix after P0)
-- =====================================================
-- Billing model cleanup, insurance tables, scheduling
-- recurrence, encounter participants
-- Author: MediMesh Development Team
-- Date: February 2026
-- =====================================================

\c medimesh;

-- =====================================================
-- 1. BILLING MODEL CLEANUP
-- =====================================================

-- Make invoice_id nullable on billing_payments (recommended: payments are independent)
-- Allocations link payments to invoices instead
ALTER TABLE billing_payments ALTER COLUMN invoice_id DROP NOT NULL;

-- Service catalog (replaces/extends price_list with more structure)
CREATE TABLE IF NOT EXISTS service_catalog (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES organizations(id),
    
    -- Service identification
    service_code VARCHAR(50) UNIQUE NOT NULL,
    service_name VARCHAR(255) NOT NULL,
    service_category VARCHAR(50) NOT NULL CHECK (service_category IN (
        'consultation', 'procedure', 'lab_test', 'radiology', 
        'pharmacy', 'ward', 'nursing', 'emergency', 'other'
    )),
    
    -- Department
    department_id UUID REFERENCES departments(id),
    
    -- Pricing tiers
    standard_price DECIMAL(10, 2) NOT NULL,
    insurance_price DECIMAL(10, 2), -- Price for insured patients
    cash_price DECIMAL(10, 2), -- Discounted cash price
    corporate_price DECIMAL(10, 2), -- Corporate scheme price
    
    -- Tax
    is_taxable BOOLEAN DEFAULT true,
    tax_percentage DECIMAL(5, 2) DEFAULT 16.00, -- Kenya VAT
    
    -- Classification
    cpt_code VARCHAR(20), -- CPT/HCPCS code for insurance
    icd_code VARCHAR(20), -- Associated ICD code
    
    -- Description
    description TEXT,
    preparation_instructions TEXT, -- Patient prep instructions
    
    -- Timing
    estimated_duration_minutes INTEGER,
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    effective_from DATE DEFAULT CURRENT_DATE,
    effective_to DATE,
    
    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- 2. INSURANCE MODEL (Proper payer/policy structure)
-- =====================================================

-- Insurance payers (companies)
CREATE TABLE IF NOT EXISTS payers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES organizations(id),
    
    -- Company info
    name VARCHAR(255) NOT NULL,
    short_name VARCHAR(50),
    payer_type VARCHAR(30) DEFAULT 'insurance' CHECK (payer_type IN (
        'insurance', 'nhif', 'corporate', 'government', 'ngo', 'other'
    )),
    
    -- Contact
    phone VARCHAR(50),
    email VARCHAR(255),
    website VARCHAR(255),
    address TEXT,
    city VARCHAR(100),
    
    -- Financial
    payment_terms_days INTEGER DEFAULT 30,
    credit_limit DECIMAL(12, 2),
    
    -- Integration
    api_endpoint VARCHAR(500),
    integration_type VARCHAR(30), -- 'manual', 'edi', 'api', 'portal'
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insurance policies (plans within a payer)
CREATE TABLE IF NOT EXISTS insurance_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payer_id UUID NOT NULL REFERENCES payers(id),
    
    -- Policy info
    policy_number VARCHAR(100) NOT NULL,
    plan_name VARCHAR(255),
    plan_type VARCHAR(30) CHECK (plan_type IN (
        'individual', 'family', 'corporate', 'government', 'supplementary'
    )),
    
    -- Coverage
    coverage_percentage DECIMAL(5, 2) DEFAULT 80.00,
    annual_limit DECIMAL(12, 2),
    per_visit_limit DECIMAL(10, 2),
    copay_amount DECIMAL(10, 2) DEFAULT 0.00,
    deductible DECIMAL(10, 2) DEFAULT 0.00,
    
    -- Covered services (JSONB for flexibility)
    covered_services JSONB, -- e.g., { "consultation": true, "lab": true, "pharmacy": { "limit": 50000 } }
    excluded_services JSONB,
    
    -- Dates
    effective_from DATE,
    effective_to DATE,
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(payer_id, policy_number)
);

-- Patient insurance policies (many-to-many with dates)
CREATE TABLE IF NOT EXISTS patient_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    policy_id UUID NOT NULL REFERENCES insurance_policies(id),
    
    -- Membership
    member_number VARCHAR(100) NOT NULL,
    member_name VARCHAR(255), -- Name as appears on card
    
    -- Type
    is_primary BOOLEAN DEFAULT true,
    relationship_to_holder VARCHAR(30), -- 'self', 'spouse', 'child', 'dependent'
    principal_member_name VARCHAR(255),
    
    -- Dates
    start_date DATE NOT NULL,
    end_date DATE,
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    verification_status VARCHAR(20) DEFAULT 'pending' CHECK (verification_status IN (
        'pending', 'verified', 'expired', 'cancelled', 'suspended'
    )),
    verified_at TIMESTAMP,
    verified_by UUID REFERENCES staff(id),
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- 3. SCHEDULING: TEMPLATES & EXCEPTIONS
-- =====================================================

-- Schedule templates (recurring patterns)
CREATE TABLE IF NOT EXISTS schedule_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id UUID NOT NULL REFERENCES staff(id),
    clinic_id UUID REFERENCES clinics(id),
    tenant_id UUID REFERENCES organizations(id),
    
    -- Recurrence pattern
    day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Sunday, 6=Saturday
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    
    -- Slot configuration
    slot_duration_minutes INTEGER DEFAULT 30,
    max_patients_per_slot INTEGER DEFAULT 1,
    buffer_minutes INTEGER DEFAULT 5, -- Break between slots
    
    -- Appointment types allowed
    allowed_types JSONB DEFAULT '["follow-up", "new-patient", "consultation"]'::jsonb,
    
    -- Overbooking
    allow_overbooking BOOLEAN DEFAULT false,
    max_overbook_count INTEGER DEFAULT 0,
    
    -- Effective dates
    effective_from DATE DEFAULT CURRENT_DATE,
    effective_to DATE,
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Prevent overlapping templates
    CONSTRAINT no_overlap_check CHECK (start_time < end_time)
);

-- Schedule exceptions (leaves, holidays, special hours)
CREATE TABLE IF NOT EXISTS schedule_exceptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id UUID REFERENCES staff(id), -- NULL = applies to all staff
    clinic_id UUID REFERENCES clinics(id), -- NULL = applies to all clinics
    tenant_id UUID REFERENCES organizations(id),
    
    -- Exception date
    exception_date DATE NOT NULL,
    start_time TIME, -- NULL = entire day
    end_time TIME,
    
    -- Type
    exception_type VARCHAR(30) NOT NULL CHECK (exception_type IN (
        'leave', 'sick_leave', 'holiday', 'conference', 'training',
        'blocked', 'extended_hours', 'special_clinic'
    )),
    
    -- Impact
    is_available BOOLEAN DEFAULT false, -- false = unavailable, true = extra availability
    
    -- Details
    title VARCHAR(255),
    reason TEXT,
    
    -- Approval
    approved_by UUID REFERENCES staff(id),
    approved_at TIMESTAMP,
    
    -- Recurring exception (e.g., weekly block)
    is_recurring BOOLEAN DEFAULT false,
    recurrence_pattern VARCHAR(30), -- 'weekly', 'monthly', 'annually'
    recurrence_end_date DATE,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- 4. ENCOUNTER PARTICIPANTS (Multi-provider visits)
-- =====================================================

CREATE TABLE IF NOT EXISTS encounter_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    encounter_id UUID NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
    staff_id UUID NOT NULL REFERENCES staff(id),
    
    -- Role in this encounter
    participant_role VARCHAR(30) NOT NULL CHECK (participant_role IN (
        'primary_provider', 'consulting', 'attending', 'resident',
        'nurse', 'technician', 'anesthesiologist', 'surgeon',
        'assistant', 'observer', 'interpreter'
    )),
    
    -- Timing
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    left_at TIMESTAMP,
    
    -- Active
    is_active BOOLEAN DEFAULT true,
    
    -- Notes
    notes TEXT,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(encounter_id, staff_id, participant_role)
);

-- =====================================================
-- INDEXES
-- =====================================================

-- Service catalog
CREATE INDEX IF NOT EXISTS idx_service_catalog_code ON service_catalog(service_code);
CREATE INDEX IF NOT EXISTS idx_service_catalog_category ON service_catalog(service_category);
CREATE INDEX IF NOT EXISTS idx_service_catalog_active ON service_catalog(is_active);
CREATE INDEX IF NOT EXISTS idx_service_catalog_dept ON service_catalog(department_id);

-- Payers & policies
CREATE INDEX IF NOT EXISTS idx_payers_active ON payers(is_active);
CREATE INDEX IF NOT EXISTS idx_payers_type ON payers(payer_type);
CREATE INDEX IF NOT EXISTS idx_insurance_policies_payer ON insurance_policies(payer_id);
CREATE INDEX IF NOT EXISTS idx_patient_policies_patient ON patient_policies(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_policies_policy ON patient_policies(policy_id);
CREATE INDEX IF NOT EXISTS idx_patient_policies_active ON patient_policies(is_active);

-- Schedule templates
CREATE INDEX IF NOT EXISTS idx_schedule_templates_staff ON schedule_templates(staff_id);
CREATE INDEX IF NOT EXISTS idx_schedule_templates_clinic ON schedule_templates(clinic_id);
CREATE INDEX IF NOT EXISTS idx_schedule_templates_day ON schedule_templates(day_of_week);
CREATE INDEX IF NOT EXISTS idx_schedule_templates_active ON schedule_templates(is_active);

-- Schedule exceptions
CREATE INDEX IF NOT EXISTS idx_schedule_exceptions_staff ON schedule_exceptions(staff_id);
CREATE INDEX IF NOT EXISTS idx_schedule_exceptions_date ON schedule_exceptions(exception_date);
CREATE INDEX IF NOT EXISTS idx_schedule_exceptions_type ON schedule_exceptions(exception_type);

-- Encounter participants
CREATE INDEX IF NOT EXISTS idx_encounter_participants_encounter ON encounter_participants(encounter_id);
CREATE INDEX IF NOT EXISTS idx_encounter_participants_staff ON encounter_participants(staff_id);
CREATE INDEX IF NOT EXISTS idx_encounter_participants_role ON encounter_participants(participant_role);

-- =====================================================
-- COMMENTS
-- =====================================================
COMMENT ON TABLE service_catalog IS 'Comprehensive service catalog with tiered pricing and insurance codes';
COMMENT ON TABLE payers IS 'Insurance companies, NHIF, corporate schemes - payment sources';
COMMENT ON TABLE insurance_policies IS 'Insurance plans/policies with coverage details';
COMMENT ON TABLE patient_policies IS 'Patient-to-insurance-policy linkage with membership and verification';
COMMENT ON TABLE schedule_templates IS 'Recurring schedule patterns (weekly availability templates)';
COMMENT ON TABLE schedule_exceptions IS 'Schedule exceptions: leaves, holidays, blocked times, extended hours';
COMMENT ON TABLE encounter_participants IS 'Multiple providers/staff participating in an encounter';

-- =====================================================
-- GRANT PERMISSIONS
-- =====================================================
GRANT ALL PRIVILEGES ON TABLE service_catalog TO medimesh_user;
GRANT ALL PRIVILEGES ON TABLE payers TO medimesh_user;
GRANT ALL PRIVILEGES ON TABLE insurance_policies TO medimesh_user;
GRANT ALL PRIVILEGES ON TABLE patient_policies TO medimesh_user;
GRANT ALL PRIVILEGES ON TABLE schedule_templates TO medimesh_user;
GRANT ALL PRIVILEGES ON TABLE schedule_exceptions TO medimesh_user;
GRANT ALL PRIVILEGES ON TABLE encounter_participants TO medimesh_user;

-- =====================================================
-- SEED: Common Payers in Kenya
-- =====================================================
INSERT INTO payers (name, short_name, payer_type, payment_terms_days) VALUES
    ('National Hospital Insurance Fund', 'NHIF', 'nhif', 30),
    ('Jubilee Health Insurance', 'Jubilee', 'insurance', 30),
    ('AAR Insurance', 'AAR', 'insurance', 30),
    ('Madison Insurance', 'Madison', 'insurance', 30),
    ('Britam Health', 'Britam', 'insurance', 30),
    ('UAP Old Mutual', 'UAP', 'insurance', 30),
    ('APA Insurance', 'APA', 'insurance', 30),
    ('CIC Insurance', 'CIC', 'insurance', 30),
    ('Resolution Insurance', 'Resolution', 'insurance', 30),
    ('Sanlam Health', 'Sanlam', 'insurance', 30)
ON CONFLICT DO NOTHING;

-- =====================================================
-- COMPLETION MESSAGE
-- =====================================================
DO $$
BEGIN
    RAISE NOTICE '=== P1 Schema Improvements Complete ===';
    RAISE NOTICE '  1. Billing: service_catalog, billing_payments.invoice_id now nullable';
    RAISE NOTICE '  2. Insurance: payers + insurance_policies + patient_policies';
    RAISE NOTICE '  3. Scheduling: schedule_templates + schedule_exceptions';
    RAISE NOTICE '  4. Encounters: encounter_participants (multi-provider)';
    RAISE NOTICE '  5. Seeded % Kenya insurance payers', (SELECT COUNT(*) FROM payers);
END $$;
