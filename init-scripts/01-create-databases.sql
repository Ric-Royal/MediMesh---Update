\set app_db_password `cat /run/secrets/app_db_password`

SELECT 'CREATE DATABASE medimesh'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'medimesh')\gexec

SELECT format('CREATE ROLE medimesh_user LOGIN PASSWORD %L', :'app_db_password')
WHERE NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'medimesh_user')\gexec

ALTER ROLE medimesh_user NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
ALTER ROLE medimesh_user PASSWORD :'app_db_password';

\c medimesh;

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON DATABASE medimesh FROM PUBLIC;
GRANT CONNECT ON DATABASE medimesh TO medimesh_user;
GRANT USAGE ON SCHEMA public TO medimesh_user;

CREATE SEQUENCE IF NOT EXISTS patient_id_sequence START 1000;

CREATE TABLE IF NOT EXISTS patients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id VARCHAR(50) UNIQUE NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    date_of_birth DATE NOT NULL,
    gender VARCHAR(10),
    phone VARCHAR(20),
    email VARCHAR(100),
    address JSONB,
    emergency_contact JSONB,
    insurance JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by VARCHAR(100),
    updated_by VARCHAR(100)
);

CREATE OR REPLACE FUNCTION generate_patient_id()
RETURNS TRIGGER AS $$
DECLARE
    generated_id TEXT;
BEGIN
    IF NEW.patient_id IS NULL OR NEW.patient_id = '' THEN
        LOOP
            generated_id := 'P' || LPAD(NEXTVAL('patient_id_sequence')::TEXT, 9, '0');
            EXIT WHEN NOT EXISTS (SELECT 1 FROM patients WHERE patient_id = generated_id);
        END LOOP;
        NEW.patient_id := generated_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_patient_id ON patients;
CREATE TRIGGER set_patient_id
    BEFORE INSERT ON patients
    FOR EACH ROW EXECUTE FUNCTION generate_patient_id();

CREATE TABLE IF NOT EXISTS medical_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id),
    record_type VARCHAR(50) NOT NULL,
    record_date DATE NOT NULL,
    provider_name VARCHAR(100),
    diagnosis TEXT,
    treatment_plan TEXT,
    medications TEXT,
    lab_results TEXT,
    notes TEXT,
    vital_signs JSONB,
    follow_up_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by VARCHAR(100),
    updated_by VARCHAR(100)
);

CREATE TABLE IF NOT EXISTS file_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_key VARCHAR(500) NOT NULL,
    bucket_name VARCHAR(100) NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_type VARCHAR(100) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    file_size BIGINT NOT NULL,
    storage_path TEXT,
    storage_bucket VARCHAR(100),
    storage_key VARCHAR(500),
    category VARCHAR(50) NOT NULL DEFAULT 'medical-records',
    patient_id UUID REFERENCES patients(id),
    medical_record_id UUID REFERENCES medical_records(id),
    description TEXT,
    tags TEXT,
    is_private BOOLEAN DEFAULT TRUE,
    is_active BOOLEAN DEFAULT TRUE,
    uploaded_by UUID NOT NULL,
    upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    upload_url TEXT,
    etag VARCHAR(100),
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by VARCHAR(100),
    updated_by VARCHAR(100)
);

CREATE INDEX IF NOT EXISTS idx_patients_patient_id ON patients(patient_id);
CREATE INDEX IF NOT EXISTS idx_medical_records_patient_id ON medical_records(patient_id);
CREATE INDEX IF NOT EXISTS idx_medical_records_date ON medical_records(record_date);
CREATE INDEX IF NOT EXISTS idx_file_attachments_patient_id ON file_attachments(patient_id);
CREATE INDEX IF NOT EXISTS idx_file_attachments_record_id ON file_attachments(medical_record_id);
