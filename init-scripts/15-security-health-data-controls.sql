-- Security and health-data lifecycle controls.
\c medimesh;

CREATE TABLE IF NOT EXISTS app_users (
  id UUID PRIMARY KEY,
  username VARCHAR(80) NOT NULL,
  password_hash VARCHAR(100) NOT NULL,
  display_name VARCHAR(160) NOT NULL,
  email VARCHAR(200),
  roles JSONB NOT NULL DEFAULT '["user"]'::jsonb,
  department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
  mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  mfa_secret_encrypted TEXT,
  mfa_pending_secret_encrypted TEXT,
  mfa_enabled_at TIMESTAMP,
  mfa_last_counter BIGINT,
  token_version INTEGER NOT NULL DEFAULT 0,
  last_login_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_app_users_username_lower
  ON app_users (LOWER(username));

CREATE TABLE IF NOT EXISTS user_settings (
  user_id UUID PRIMARY KEY REFERENCES app_users(id),
  profile JSONB DEFAULT '{}',
  preferences JSONB DEFAULT '{}',
  notifications JSONB DEFAULT '{}',
  medical_defaults JSONB DEFAULT '{}',
  working_hours JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS system_settings (
  key VARCHAR(255) PRIMARY KEY,
  value JSONB NOT NULL,
  category VARCHAR(100) NOT NULL,
  description TEXT,
  requires_restart BOOLEAN DEFAULT FALSE,
  updated_by UUID REFERENCES app_users(id),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS setting_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  setting_type VARCHAR(50) NOT NULL,
  setting_key VARCHAR(255) NOT NULL,
  old_value JSONB,
  new_value JSONB NOT NULL,
  changed_at TIMESTAMP DEFAULT NOW(),
  ip_address INET,
  user_agent TEXT
);

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY,
  patient_id UUID NOT NULL REFERENCES patients(id),
  medical_record_id UUID REFERENCES medical_records(id),
  invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
  amount DECIMAL(10, 2) NOT NULL CHECK (amount > 0),
  currency VARCHAR(3) DEFAULT 'KES',
  phone_number VARCHAR(20) NOT NULL,
  payment_method VARCHAR(20) NOT NULL CHECK (payment_method IN ('mpesa', 'cash', 'card', 'insurance')),
  transaction_type VARCHAR(50) NOT NULL,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'cancelled', 'refunded')),
  mpesa_checkout_request_id VARCHAR(100) UNIQUE,
  mpesa_merchant_request_id VARCHAR(100),
  mpesa_receipt_number VARCHAR(50),
  mpesa_transaction_date TIMESTAMP,
  mpesa_prompt_sent_at TIMESTAMP,
  mpesa_prompt_expires_at TIMESTAMP,
  mpesa_attempt INTEGER NOT NULL DEFAULT 1 CHECK (mpesa_attempt > 0),
  description TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(100) NOT NULL
);

ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS record_version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by UUID,
  ADD COLUMN IF NOT EXISTS delete_reason VARCHAR(500);

ALTER TABLE medical_records
  ADD COLUMN IF NOT EXISTS record_version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by UUID,
  ADD COLUMN IF NOT EXISTS delete_reason VARCHAR(500);

ALTER TABLE file_attachments
  ADD COLUMN IF NOT EXISTS detected_mime_type VARCHAR(100),
  ADD COLUMN IF NOT EXISTS malware_scan_status VARCHAR(20) NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by UUID,
  ADD COLUMN IF NOT EXISTS delete_reason VARCHAR(500);

CREATE TABLE IF NOT EXISTS audit_events (
  sequence_id BIGSERIAL PRIMARY KEY,
  request_id UUID NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  user_id UUID,
  provider_identifier VARCHAR(100),
  username VARCHAR(100),
  action VARCHAR(500) NOT NULL,
  method VARCHAR(12),
  path VARCHAR(1000),
  status_code INTEGER,
  outcome VARCHAR(40) NOT NULL,
  resource_type VARCHAR(100) NOT NULL,
  resource_id VARCHAR(100),
  patient_id UUID,
  purpose VARCHAR(500),
  break_glass BOOLEAN NOT NULL DEFAULT FALSE,
  source_ip INET,
  user_agent VARCHAR(1000),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  previous_hash CHAR(64) NOT NULL,
  event_hash CHAR(64) NOT NULL UNIQUE,
  retain_until TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '20 years'),
  CONSTRAINT audit_event_hash_format CHECK (event_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT audit_previous_hash_format CHECK (previous_hash ~ '^[0-9a-f]{64}$')
);

CREATE INDEX IF NOT EXISTS idx_audit_events_occurred_at
  ON audit_events (occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_patient
  ON audit_events (patient_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_user
  ON audit_events (user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_break_glass
  ON audit_events (occurred_at DESC) WHERE break_glass;

CREATE TABLE IF NOT EXISTS clinical_change_history (
  sequence_id BIGSERIAL PRIMARY KEY,
  table_name VARCHAR(100) NOT NULL,
  record_id UUID NOT NULL,
  operation VARCHAR(12) NOT NULL,
  record_version INTEGER,
  old_values JSONB,
  new_values JSONB,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  retain_until TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '20 years')
);

CREATE INDEX IF NOT EXISTS idx_clinical_history_record
  ON clinical_change_history (table_name, record_id, sequence_id DESC);

CREATE OR REPLACE FUNCTION reject_immutable_change()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_events_immutable ON audit_events;
CREATE TRIGGER audit_events_immutable
  BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_change();

DROP TRIGGER IF EXISTS clinical_history_immutable ON clinical_change_history;
CREATE TRIGGER clinical_history_immutable
  BEFORE UPDATE OR DELETE ON clinical_change_history
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_change();

CREATE OR REPLACE FUNCTION record_clinical_change()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO clinical_change_history (
    table_name, record_id, operation, record_version, old_values, new_values
  ) VALUES (
    TG_TABLE_NAME,
    NEW.id,
    TG_OP,
    COALESCE(NEW.record_version, 1),
    CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END,
    to_jsonb(NEW)
  );
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION increment_clinical_version()
RETURNS TRIGGER AS $$
BEGIN
  NEW.record_version := COALESCE(OLD.record_version, 0) + 1;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS patients_change_history ON patients;
CREATE TRIGGER patients_change_history
  AFTER INSERT OR UPDATE ON patients
  FOR EACH ROW EXECUTE FUNCTION record_clinical_change();

DROP TRIGGER IF EXISTS patients_increment_version ON patients;
CREATE TRIGGER patients_increment_version
  BEFORE UPDATE ON patients
  FOR EACH ROW EXECUTE FUNCTION increment_clinical_version();

DROP TRIGGER IF EXISTS medical_records_change_history ON medical_records;
CREATE TRIGGER medical_records_change_history
  AFTER INSERT OR UPDATE ON medical_records
  FOR EACH ROW EXECUTE FUNCTION record_clinical_change();

DROP TRIGGER IF EXISTS medical_records_increment_version ON medical_records;
CREATE TRIGGER medical_records_increment_version
  BEFORE UPDATE ON medical_records
  FOR EACH ROW EXECUTE FUNCTION increment_clinical_version();

CREATE OR REPLACE FUNCTION reject_health_record_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Hard deletion of retained health records is prohibited';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS patients_reject_delete ON patients;
CREATE TRIGGER patients_reject_delete
  BEFORE DELETE ON patients
  FOR EACH ROW EXECUTE FUNCTION reject_health_record_delete();

DROP TRIGGER IF EXISTS medical_records_reject_delete ON medical_records;
CREATE TRIGGER medical_records_reject_delete
  BEFORE DELETE ON medical_records
  FOR EACH ROW EXECUTE FUNCTION reject_health_record_delete();

DROP TRIGGER IF EXISTS file_attachments_reject_delete ON file_attachments;
CREATE TRIGGER file_attachments_reject_delete
  BEFORE DELETE ON file_attachments
  FOR EACH ROW EXECUTE FUNCTION reject_health_record_delete();
