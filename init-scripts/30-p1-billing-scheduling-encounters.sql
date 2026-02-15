-- ============================================
-- MediMesh P1: Billing, Scheduling, Encounter Improvements
-- Migration Script
-- ============================================
-- Covers: Payment model cleanup, insurance policies, service catalog,
--         scheduling recurrence, multi-staff encounters
-- ============================================

\c medimesh;

-- ============================================
-- PART 1: INSURANCE & PAYER MODEL
-- ============================================

-- 1.1 Payers (insurance companies, corporates)
CREATE TABLE IF NOT EXISTS payers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  name VARCHAR(300) NOT NULL,
  payer_type VARCHAR(30) NOT NULL CHECK (payer_type IN ('insurance', 'corporate', 'government', 'ngo', 'self-pay')),
  payer_code VARCHAR(50) UNIQUE,
  
  -- Contact
  address TEXT,
  phone VARCHAR(20),
  email VARCHAR(200),
  website VARCHAR(300),
  
  -- Contract
  contract_start DATE,
  contract_end DATE,
  discount_percentage DECIMAL(5, 2) DEFAULT 0.00,
  payment_terms_days INTEGER DEFAULT 30,
  
  -- Kenya-specific
  nhif_code VARCHAR(50),
  
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'terminated', 'pending')),
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  tenant_id UUID REFERENCES organizations(id)
);

-- 1.2 Insurance Policies
CREATE TABLE IF NOT EXISTS insurance_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payer_id UUID NOT NULL REFERENCES payers(id),
  
  policy_number VARCHAR(100) NOT NULL,
  policy_name VARCHAR(300),
  
  -- Coverage
  coverage_type VARCHAR(30) CHECK (coverage_type IN ('comprehensive', 'outpatient-only', 'inpatient-only', 'maternity', 'dental', 'optical')),
  annual_limit DECIMAL(12, 2),
  per_visit_limit DECIMAL(10, 2),
  co_pay_percentage DECIMAL(5, 2) DEFAULT 0.00,
  deductible DECIMAL(10, 2) DEFAULT 0.00,
  
  -- Covered services (which item_types are covered)
  covered_services TEXT[],  -- e.g., ['consultation', 'lab-test', 'drug', 'radiology']
  excluded_services TEXT[],
  
  -- Pre-authorization
  requires_preauth BOOLEAN DEFAULT FALSE,
  preauth_services TEXT[],  -- services requiring pre-auth
  
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'expired', 'suspended', 'cancelled')),
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  tenant_id UUID REFERENCES organizations(id)
);

CREATE INDEX IF NOT EXISTS idx_policies_payer ON insurance_policies(payer_id);

-- 1.3 Patient Policies (which patients have which policies)
CREATE TABLE IF NOT EXISTS patient_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id),
  policy_id UUID NOT NULL REFERENCES insurance_policies(id),
  
  -- Member details
  member_number VARCHAR(100) NOT NULL,
  member_name VARCHAR(300),
  relationship VARCHAR(30) CHECK (relationship IN ('self', 'spouse', 'child', 'parent', 'dependent')),
  
  -- Validity
  start_date DATE NOT NULL,
  end_date DATE,
  
  -- Priority
  is_primary BOOLEAN DEFAULT TRUE,
  priority_order INTEGER DEFAULT 1,
  
  -- Usage tracking
  annual_used DECIMAL(12, 2) DEFAULT 0.00,
  annual_remaining DECIMAL(12, 2),
  
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'expired', 'suspended', 'cancelled', 'pending-verification')),
  verified_at TIMESTAMP,
  verified_by UUID REFERENCES staff(id),
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  tenant_id UUID REFERENCES organizations(id)
);

CREATE INDEX IF NOT EXISTS idx_patient_policies_patient ON patient_policies(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_policies_policy ON patient_policies(policy_id);
CREATE INDEX IF NOT EXISTS idx_patient_policies_member ON patient_policies(member_number);

-- ============================================
-- PART 2: SERVICE CATALOG
-- ============================================

CREATE TABLE IF NOT EXISTS service_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Service identification
  service_code VARCHAR(50) UNIQUE NOT NULL,
  service_name VARCHAR(300) NOT NULL,
  description TEXT,
  
  -- Classification
  service_type VARCHAR(30) NOT NULL CHECK (service_type IN (
    'consultation', 'procedure', 'lab-test', 'drug', 'radiology',
    'bed-charge', 'nursing', 'equipment', 'ambulance', 'other'
  )),
  department_id UUID REFERENCES departments(id),
  category VARCHAR(100),
  subcategory VARCHAR(100),
  
  -- Pricing
  base_price DECIMAL(10, 2) NOT NULL,
  tax_percentage DECIMAL(5, 2) DEFAULT 0.00,
  
  -- Price tiers (for different patient types)
  cash_price DECIMAL(10, 2),
  insurance_price DECIMAL(10, 2),
  corporate_price DECIMAL(10, 2),
  
  -- Insurance billing
  cpt_code VARCHAR(20),
  icd_code VARCHAR(20),
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  effective_from DATE DEFAULT CURRENT_DATE,
  effective_to DATE,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  tenant_id UUID REFERENCES organizations(id)
);

CREATE INDEX IF NOT EXISTS idx_service_catalog_type ON service_catalog(service_type);
CREATE INDEX IF NOT EXISTS idx_service_catalog_dept ON service_catalog(department_id);
CREATE INDEX IF NOT EXISTS idx_service_catalog_code ON service_catalog(service_code);

-- ============================================
-- PART 3: SCHEDULING IMPROVEMENTS
-- ============================================

-- 3.1 Schedule Templates (recurring weekly patterns)
CREATE TABLE IF NOT EXISTS schedule_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES staff(id),
  clinic_id UUID REFERENCES clinics(id),
  
  -- Weekly pattern
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),  -- 0=Sunday, 6=Saturday
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  
  -- Slot configuration
  slot_duration_minutes INTEGER DEFAULT 15,
  max_patients_per_slot INTEGER DEFAULT 1,
  max_overbooking INTEGER DEFAULT 0,
  
  -- Appointment types allowed
  appointment_types TEXT[],  -- ['new-patient', 'follow-up', 'emergency']
  
  -- Validity
  effective_from DATE DEFAULT CURRENT_DATE,
  effective_to DATE,
  
  is_active BOOLEAN DEFAULT TRUE,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  tenant_id UUID REFERENCES organizations(id)
);

CREATE INDEX IF NOT EXISTS idx_sched_template_staff ON schedule_templates(staff_id);
CREATE INDEX IF NOT EXISTS idx_sched_template_day ON schedule_templates(day_of_week);

-- 3.2 Schedule Exceptions (leave, blocks, special hours)
CREATE TABLE IF NOT EXISTS schedule_exceptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES staff(id),
  
  -- Exception type
  exception_type VARCHAR(30) NOT NULL CHECK (exception_type IN (
    'leave', 'sick-leave', 'holiday', 'block', 'conference',
    'emergency-only', 'extended-hours', 'reduced-hours'
  )),
  
  -- When
  exception_date DATE NOT NULL,
  start_time TIME,  -- NULL means whole day
  end_time TIME,
  
  -- If this is a replacement schedule (e.g., extended hours)
  is_available BOOLEAN DEFAULT FALSE,
  replacement_start TIME,
  replacement_end TIME,
  
  -- Details
  reason TEXT,
  approved_by UUID REFERENCES staff(id),
  approved_at TIMESTAMP,
  
  status VARCHAR(20) DEFAULT 'approved' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  tenant_id UUID REFERENCES organizations(id)
);

CREATE INDEX IF NOT EXISTS idx_sched_exception_staff ON schedule_exceptions(staff_id);
CREATE INDEX IF NOT EXISTS idx_sched_exception_date ON schedule_exceptions(exception_date);
CREATE INDEX IF NOT EXISTS idx_sched_exception_type ON schedule_exceptions(exception_type);

-- ============================================
-- PART 4: MULTI-STAFF ENCOUNTERS
-- ============================================

CREATE TABLE IF NOT EXISTS encounter_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  encounter_id UUID NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES staff(id),
  
  -- Role in encounter
  participant_role VARCHAR(50) NOT NULL CHECK (participant_role IN (
    'primary-provider', 'attending', 'consulting', 'referring',
    'nurse', 'lab-tech', 'pharmacist', 'radiologist',
    'anesthesiologist', 'surgeon', 'assistant', 'observer',
    'interpreter', 'social-worker'
  )),
  
  -- Timing
  joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  left_at TIMESTAMP,
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_enc_part_encounter ON encounter_participants(encounter_id);
CREATE INDEX IF NOT EXISTS idx_enc_part_staff ON encounter_participants(staff_id);
CREATE INDEX IF NOT EXISTS idx_enc_part_role ON encounter_participants(participant_role);

-- Auto-insert primary provider when encounter is created
-- (this is handled in application code, but adding a convenience trigger)
CREATE OR REPLACE FUNCTION auto_add_encounter_participant()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.doctor_id IS NOT NULL THEN
    INSERT INTO encounter_participants (encounter_id, staff_id, participant_role)
    VALUES (NEW.id, NEW.doctor_id, 'primary-provider')
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Only create trigger if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_auto_encounter_participant') THEN
    CREATE TRIGGER trg_auto_encounter_participant
    AFTER INSERT ON encounters
    FOR EACH ROW EXECUTE FUNCTION auto_add_encounter_participant();
  END IF;
END $$;

-- ============================================
-- PART 5: BILLING PAYMENT MODEL CLEANUP
-- ============================================

-- Make invoice_id nullable on billing_payments (payments can exist independently)
ALTER TABLE billing_payments ALTER COLUMN invoice_id DROP NOT NULL;

-- Add indexes for payment reconciliation
CREATE INDEX IF NOT EXISTS idx_billing_pay_invoice ON billing_payments(invoice_id) WHERE invoice_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_billing_pay_patient ON billing_payments(patient_id);
CREATE INDEX IF NOT EXISTS idx_billing_pay_date ON billing_payments(payment_date);
CREATE INDEX IF NOT EXISTS idx_billing_pay_status ON billing_payments(status);

-- Add payment receipt tracking
ALTER TABLE billing_payments ADD COLUMN IF NOT EXISTS receipt_number VARCHAR(50);
ALTER TABLE billing_payments ADD COLUMN IF NOT EXISTS receipt_printed_at TIMESTAMP;

-- Payment allocation indexes
CREATE INDEX IF NOT EXISTS idx_pay_alloc_payment ON payment_allocations(payment_id);
CREATE INDEX IF NOT EXISTS idx_pay_alloc_invoice ON payment_allocations(invoice_id);

-- ============================================
-- PART 6: WARD DEDUPLICATION
-- ============================================
-- Add a unique constraint to prevent ward duplication
-- (the schema diagram showed wards appearing twice)
ALTER TABLE wards ADD CONSTRAINT IF NOT EXISTS unique_ward_name_dept 
  UNIQUE (ward_name, department_id);
