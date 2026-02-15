-- ============================================
-- MediMesh P0: Multi-Tenancy + Audit Trail
-- Migration Script
-- ============================================
-- Adds: tenant/org boundary, audit events, data access logging
-- ============================================

\c medimesh;

-- ============================================
-- 1. ORGANIZATIONS / TENANTS
-- ============================================
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  code VARCHAR(50) UNIQUE NOT NULL,  -- e.g., 'NAIROBI-MAIN'
  org_type VARCHAR(30) DEFAULT 'clinic' CHECK (org_type IN ('hospital', 'clinic', 'lab', 'pharmacy', 'group')),
  
  -- Contact
  address TEXT,
  city VARCHAR(100),
  county VARCHAR(100),
  country VARCHAR(3) DEFAULT 'KE',
  phone VARCHAR(20),
  email VARCHAR(200),
  website VARCHAR(300),
  
  -- Licensing
  license_number VARCHAR(100),
  license_expiry DATE,
  
  -- Status
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'inactive')),
  subscription_plan VARCHAR(30) DEFAULT 'basic' CHECK (subscription_plan IN ('basic', 'standard', 'premium', 'enterprise')),
  max_users INTEGER DEFAULT 50,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 2. ADD tenant_id TO CORE TABLES
-- ============================================

-- Add tenant_id columns (nullable initially for backward compatibility)
ALTER TABLE patients ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES organizations(id);
ALTER TABLE encounters ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES organizations(id);
ALTER TABLE staff ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES organizations(id);
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES organizations(id);
ALTER TABLE departments ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES organizations(id);

-- Billing tables
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES organizations(id);
ALTER TABLE billing_payments ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES organizations(id);
ALTER TABLE billing_accounts ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES organizations(id);

-- Clinical tables
ALTER TABLE lab_orders ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES organizations(id);
ALTER TABLE radiology_orders ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES organizations(id);
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES organizations(id);

-- Queue & scheduling
ALTER TABLE queue_entries ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES organizations(id);
ALTER TABLE doctor_schedules ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES organizations(id);
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES organizations(id);

-- Wards & beds
ALTER TABLE wards ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES organizations(id);

-- Indexes for tenant scoping
CREATE INDEX IF NOT EXISTS idx_patients_tenant ON patients(tenant_id);
CREATE INDEX IF NOT EXISTS idx_encounters_tenant ON encounters(tenant_id);
CREATE INDEX IF NOT EXISTS idx_staff_tenant ON staff(tenant_id);
CREATE INDEX IF NOT EXISTS idx_invoices_tenant ON invoices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_lab_orders_tenant ON lab_orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_radiology_orders_tenant ON radiology_orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_tenant ON prescriptions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_appointments_tenant ON appointments(tenant_id);

-- ============================================
-- 3. STAFF IAM LINK
-- ============================================
ALTER TABLE staff ADD COLUMN IF NOT EXISTS auth_subject_id VARCHAR(255);  -- Keycloak subject ID
ALTER TABLE staff ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS is_locked BOOLEAN DEFAULT FALSE;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_staff_auth_subject ON staff(auth_subject_id);

-- ============================================
-- 4. AUDIT EVENTS (write operations)
-- ============================================
CREATE TABLE IF NOT EXISTS audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES organizations(id),
  
  -- Who
  user_id UUID NOT NULL,
  user_role VARCHAR(50),
  user_ip INET,
  user_agent TEXT,
  
  -- What
  action VARCHAR(50) NOT NULL CHECK (action IN (
    'create', 'read', 'update', 'delete', 
    'login', 'logout', 'login_failed',
    'export', 'print', 'share',
    'approve', 'reject', 'void',
    'dispense', 'prescribe', 'order',
    'access_patient_data', 'break_glass'
  )),
  entity_type VARCHAR(100) NOT NULL,  -- e.g., 'patient', 'encounter', 'invoice'
  entity_id UUID,
  
  -- Details
  description TEXT,
  before_state JSONB,  -- Snapshot before change (hashed for sensitive)
  after_state JSONB,   -- Snapshot after change
  change_summary JSONB, -- { field: { old, new } }
  
  -- Context
  request_id VARCHAR(100),  -- Correlation ID for request tracing
  session_id VARCHAR(200),
  
  -- Metadata
  severity VARCHAR(20) DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical')),
  is_sensitive BOOLEAN DEFAULT FALSE,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_tenant ON audit_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_events(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_events(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_events(action);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_events(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_sensitive ON audit_events(is_sensitive) WHERE is_sensitive = TRUE;

-- ============================================
-- 5. DATA ACCESS LOG (read operations)
-- ============================================
CREATE TABLE IF NOT EXISTS data_access_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES organizations(id),
  
  -- Who accessed
  user_id UUID NOT NULL,
  user_role VARCHAR(50),
  user_ip INET,
  
  -- What was accessed
  resource_type VARCHAR(100) NOT NULL,  -- 'patient_record', 'lab_result', 'prescription'
  resource_id UUID NOT NULL,
  patient_id UUID,  -- Quick lookup for patient data access reviews
  
  -- Access details
  access_type VARCHAR(30) NOT NULL CHECK (access_type IN ('view', 'download', 'print', 'export', 'api_read')),
  access_reason TEXT,  -- Required for break-glass access
  
  -- Context
  endpoint VARCHAR(300),
  response_code INTEGER,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_access_log_patient ON data_access_log(patient_id);
CREATE INDEX IF NOT EXISTS idx_access_log_user ON data_access_log(user_id);
CREATE INDEX IF NOT EXISTS idx_access_log_resource ON data_access_log(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_access_log_created ON data_access_log(created_at);

-- ============================================
-- 6. CONSENT MANAGEMENT
-- ============================================
CREATE TABLE IF NOT EXISTS patient_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id),
  tenant_id UUID REFERENCES organizations(id),
  
  consent_type VARCHAR(50) NOT NULL CHECK (consent_type IN (
    'treatment', 'data_processing', 'data_sharing', 'research',
    'marketing', 'sms_notifications', 'email_notifications',
    'insurance_sharing', 'emergency_access'
  )),
  
  status VARCHAR(20) DEFAULT 'granted' CHECK (status IN ('granted', 'revoked', 'expired')),
  granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  revoked_at TIMESTAMP,
  expires_at TIMESTAMP,
  
  -- Details
  consent_text TEXT,
  signature_reference VARCHAR(200),  -- Link to signed form
  witnessed_by UUID REFERENCES staff(id),
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_consents_patient ON patient_consents(patient_id);
CREATE INDEX IF NOT EXISTS idx_consents_type ON patient_consents(consent_type, status);

-- ============================================
-- 7. DEFAULT ORGANIZATION (for existing data)
-- ============================================
INSERT INTO organizations (id, name, code, org_type, status)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'MediMesh Default Clinic',
  'DEFAULT',
  'clinic',
  'active'
) ON CONFLICT (code) DO NOTHING;

-- Backfill tenant_id for existing data
UPDATE patients SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE encounters SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE staff SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE invoices SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;

-- ============================================
-- 8. ROW LEVEL SECURITY POLICIES (optional, enable per-table)
-- ============================================
-- Enable RLS on patients
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;

-- Policy: users can only see patients in their tenant
-- Note: This requires setting `current_setting('app.tenant_id')` at connection time
CREATE POLICY IF NOT EXISTS tenant_isolation_patients ON patients
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid OR current_setting('app.tenant_id', true) IS NULL);

-- Repeat for other tables as needed
ALTER TABLE encounters ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS tenant_isolation_encounters ON encounters
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid OR current_setting('app.tenant_id', true) IS NULL);

-- Note: RLS policies are disabled by default for superusers. 
-- Application connections should use a non-superuser role.
