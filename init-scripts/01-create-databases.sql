-- Create databases for different services (only if they don't exist)
SELECT 'CREATE DATABASE medimesh' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'medimesh')\gexec
SELECT 'CREATE DATABASE keycloak' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'keycloak')\gexec
SELECT 'CREATE DATABASE airflow' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'airflow')\gexec
SELECT 'CREATE DATABASE metabase' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'metabase')\gexec
SELECT 'CREATE DATABASE superset' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'superset')\gexec

-- Create users for each service
DO
$do$
BEGIN
   IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'medimesh_user') THEN
      CREATE USER medimesh_user WITH PASSWORD 'MediMeshDB2024!';
   END IF;
END
$do$;

DO
$do$
BEGIN
   IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'keycloak_user') THEN
      CREATE USER keycloak_user WITH PASSWORD 'KeycloakDB2024!';
   END IF;
END
$do$;

DO
$do$
BEGIN
   IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'airflow_user') THEN
      CREATE USER airflow_user WITH PASSWORD 'AirflowDB2024!';
   END IF;
END
$do$;

DO
$do$
BEGIN
   IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'metabase_user') THEN
      CREATE USER metabase_user WITH PASSWORD 'MetabaseDB2024!';
   END IF;
END
$do$;

DO
$do$
BEGIN
   IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'superset_user') THEN
      CREATE USER superset_user WITH PASSWORD 'SupersetDB2024!';
   END IF;
END
$do$;

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE medimesh TO medimesh_user;
GRANT ALL PRIVILEGES ON DATABASE keycloak TO keycloak_user;
GRANT ALL PRIVILEGES ON DATABASE airflow TO airflow_user;
GRANT ALL PRIVILEGES ON DATABASE metabase TO metabase_user;
GRANT ALL PRIVILEGES ON DATABASE superset TO superset_user;

-- PostgreSQL 15 specific: Grant CREATE permission on public schema
-- This addresses the "permission denied for schema public" error
GRANT CREATE ON SCHEMA public TO PUBLIC;
GRANT USAGE ON SCHEMA public TO PUBLIC;

-- PostgreSQL 15 compatibility: Explicit permission grants to all service users
-- This prevents the "permission denied for schema public" errors that require manual intervention
GRANT ALL ON SCHEMA public TO metabase_user, keycloak_user, airflow_user, superset_user, medimesh_user;

-- Ensure permissions persist across database context switches
\c postgres;
GRANT ALL ON SCHEMA public TO metabase_user, keycloak_user, airflow_user, superset_user, medimesh_user;

-- Grant schema permissions for Keycloak
\c keycloak;
GRANT CREATE ON SCHEMA public TO keycloak_user;
GRANT USAGE ON SCHEMA public TO keycloak_user;
GRANT ALL ON SCHEMA public TO keycloak_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO keycloak_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO keycloak_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO keycloak_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO keycloak_user;

-- Grant schema permissions for other services
\c airflow;
GRANT CREATE ON SCHEMA public TO airflow_user;
GRANT USAGE ON SCHEMA public TO airflow_user;
GRANT ALL ON SCHEMA public TO airflow_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO airflow_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO airflow_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO airflow_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO airflow_user;

\c superset;
GRANT CREATE ON SCHEMA public TO superset_user;
GRANT USAGE ON SCHEMA public TO superset_user;
GRANT ALL ON SCHEMA public TO superset_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO superset_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO superset_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO superset_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO superset_user;

\c metabase;
GRANT CREATE ON SCHEMA public TO metabase_user;
GRANT USAGE ON SCHEMA public TO metabase_user;
GRANT ALL ON SCHEMA public TO metabase_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO metabase_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO metabase_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO metabase_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO metabase_user;

-- Grant schema permissions for MediMesh
\c medimesh;
GRANT CREATE ON SCHEMA public TO medimesh_user;
GRANT USAGE ON SCHEMA public TO medimesh_user;
GRANT ALL ON SCHEMA public TO medimesh_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO medimesh_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO medimesh_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO medimesh_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO medimesh_user;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO medimesh_user;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO medimesh_user;

-- Create schema for Apache Iceberg (data lakehouse)
CREATE SCHEMA IF NOT EXISTS iceberg;
CREATE SCHEMA IF NOT EXISTS audit;

-- Create sequence for patient_id generation
CREATE SEQUENCE IF NOT EXISTS patient_id_sequence START 1000;

-- Create basic tables for medical data
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
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by VARCHAR(100),
    updated_by VARCHAR(100)
);

-- Function to auto-generate patient_id with collision detection
CREATE OR REPLACE FUNCTION generate_patient_id()
RETURNS TRIGGER AS $$
DECLARE
    new_patient_id TEXT;
    max_attempts INTEGER := 10;
    attempt INTEGER := 0;
BEGIN
    IF NEW.patient_id IS NULL OR NEW.patient_id = '' THEN
        LOOP
            -- Generate patient_id using sequence: P + sequence number
            new_patient_id := 'P' || LPAD(NEXTVAL('patient_id_sequence')::TEXT, 9, '0');
            
            -- Check if this patient_id already exists
            IF NOT EXISTS (SELECT 1 FROM patients WHERE patient_id = new_patient_id) THEN
                NEW.patient_id := new_patient_id;
                EXIT; -- Success, exit loop
            END IF;
            
            -- Increment attempt counter
            attempt := attempt + 1;
            IF attempt >= max_attempts THEN
                RAISE EXCEPTION 'Failed to generate unique patient_id after % attempts', max_attempts;
            END IF;
        END LOOP;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS set_patient_id ON patients;
CREATE TRIGGER set_patient_id
    BEFORE INSERT ON patients
    FOR EACH ROW
    EXECUTE FUNCTION generate_patient_id();

CREATE TABLE IF NOT EXISTS medical_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID REFERENCES patients(id),
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
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by VARCHAR(100),
    updated_by VARCHAR(100)
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(100) NOT NULL,
    action VARCHAR(500) NOT NULL,
    resource_type VARCHAR(50) NOT NULL,
    resource_id VARCHAR(100),
    old_values JSONB,
    new_values JSONB,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ip_address INET,
    user_agent TEXT
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
    is_private BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    uploaded_by UUID NOT NULL,
    upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    upload_url TEXT,
    etag VARCHAR(100),
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by VARCHAR(100),
    updated_by VARCHAR(100)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_patients_patient_id ON patients(patient_id);
CREATE INDEX IF NOT EXISTS idx_medical_records_patient_id ON medical_records(patient_id);
CREATE INDEX IF NOT EXISTS idx_medical_records_date ON medical_records(record_date);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_file_attachments_patient_id ON file_attachments(patient_id);
CREATE INDEX IF NOT EXISTS idx_file_attachments_medical_record_id ON file_attachments(medical_record_id);
CREATE INDEX IF NOT EXISTS idx_file_attachments_category ON file_attachments(category);
CREATE INDEX IF NOT EXISTS idx_file_attachments_created_by ON file_attachments(created_by);
CREATE INDEX IF NOT EXISTS idx_file_attachments_active ON file_attachments(is_active);
CREATE INDEX IF NOT EXISTS idx_file_attachments_upload_date ON file_attachments(upload_date DESC);

-- Grant permissions on newly created tables to medimesh_user
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO medimesh_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO medimesh_user; 