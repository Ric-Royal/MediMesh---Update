-- ============================================
-- MediMesh Phase 3: Radiology/Imaging Module
-- Database Schema
-- ============================================
-- Priority: Medium-High for Diagnostics
-- Coverage: 0% → 70%
-- Timeline: Weeks 13-16
-- ============================================

-- Ensure we're connected to the medimesh database
\c medimesh;

-- 1. Imaging Modalities (Equipment types)
CREATE TABLE IF NOT EXISTS imaging_modalities (
  id SERIAL PRIMARY KEY,
  modality_code VARCHAR(20) UNIQUE NOT NULL, -- XR, CT, MRI, US, etc.
  modality_name VARCHAR(100) NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Radiology Tests Catalog
CREATE TABLE IF NOT EXISTS radiology_tests (
  id SERIAL PRIMARY KEY,
  test_code VARCHAR(50) UNIQUE NOT NULL,
  test_name VARCHAR(200) NOT NULL,
  modality_id INTEGER REFERENCES imaging_modalities(id),
  body_part VARCHAR(100),
  
  -- Preparation
  requires_preparation BOOLEAN DEFAULT false,
  preparation_instructions TEXT,
  requires_contrast BOOLEAN DEFAULT false,
  
  -- Timing
  typical_duration_minutes INTEGER DEFAULT 30,
  
  -- Pricing
  price DECIMAL(10, 2) DEFAULT 0.00,
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Radiology Orders
CREATE TABLE IF NOT EXISTS radiology_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number VARCHAR(50) UNIQUE NOT NULL, -- Auto: RAD-YYYYMMDD-XXXX
  patient_id UUID NOT NULL REFERENCES patients(id),
  encounter_id UUID REFERENCES encounters(id),
  ordering_doctor_id UUID NOT NULL REFERENCES staff(id),
  clinic_id UUID REFERENCES clinics(id),
  
  -- Clinical Info
  clinical_indication TEXT,
  provisional_diagnosis TEXT,
  relevant_history TEXT,
  
  -- Priority
  priority VARCHAR(20) DEFAULT 'routine' CHECK (priority IN ('routine', 'urgent', 'stat', 'emergency')),
  
  -- Status
  status VARCHAR(30) DEFAULT 'pending' CHECK (status IN ('pending', 'scheduled', 'in-progress', 'completed', 'reported', 'cancelled')),
  
  -- Scheduling
  scheduled_date TIMESTAMP,
  scheduled_location VARCHAR(100),
  
  -- Timing
  order_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  imaging_date TIMESTAMP,
  reported_date TIMESTAMP,
  
  -- Personnel
  radiographer_id UUID REFERENCES staff(id),
  radiologist_id UUID REFERENCES staff(id),
  
  -- Billing
  total_amount DECIMAL(10, 2) DEFAULT 0.00,
  payment_status VARCHAR(20) DEFAULT 'unpaid',
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Radiology Order Items (Individual imaging tests)
CREATE TABLE IF NOT EXISTS radiology_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  radiology_order_id UUID NOT NULL REFERENCES radiology_orders(id) ON DELETE CASCADE,
  test_id INTEGER NOT NULL REFERENCES radiology_tests(id),
  
  -- Test Details
  body_part VARCHAR(100),
  laterality VARCHAR(20), -- left, right, bilateral
  views_requested VARCHAR(200), -- AP, Lateral, Oblique, etc.
  
  -- Contrast
  contrast_used BOOLEAN DEFAULT false,
  contrast_type VARCHAR(100),
  contrast_volume VARCHAR(50),
  
  -- Status
  status VARCHAR(30) DEFAULT 'pending' CHECK (status IN ('pending', 'in-progress', 'completed', 'reported', 'cancelled')),
  
  -- Pricing
  price DECIMAL(10, 2) DEFAULT 0.00,
  
  -- Images
  images_count INTEGER DEFAULT 0,
  images_location VARCHAR(500), -- PACS URL or file path
  
  -- Quality
  technical_quality VARCHAR(20), -- excellent, good, adequate, poor
  repeat_required BOOLEAN DEFAULT false,
  repeat_reason TEXT,
  
  -- Dates
  imaging_completed_at TIMESTAMP,
  reported_at TIMESTAMP,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. Radiology Reports
CREATE TABLE IF NOT EXISTS radiology_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_number VARCHAR(50) UNIQUE NOT NULL, -- Auto: REP-YYYYMMDD-XXXX
  radiology_order_id UUID NOT NULL REFERENCES radiology_orders(id),
  radiology_order_item_id UUID REFERENCES radiology_order_items(id),
  
  -- Report Content
  findings TEXT,
  impression TEXT,
  recommendations TEXT,
  
  -- Classification
  report_category VARCHAR(50), -- normal, abnormal, critical
  critical_finding BOOLEAN DEFAULT false,
  critical_communicated_to UUID REFERENCES staff(id),
  critical_communicated_at TIMESTAMP,
  
  -- Personnel
  radiologist_id UUID NOT NULL REFERENCES staff(id),
  verified_by UUID REFERENCES staff(id),
  
  -- Status
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'preliminary', 'final', 'amended', 'cancelled')),
  
  -- Dates
  dictated_at TIMESTAMP,
  transcribed_at TIMESTAMP,
  verified_at TIMESTAMP,
  released_at TIMESTAMP,
  
  -- Version Control
  version INTEGER DEFAULT 1,
  previous_report_id UUID REFERENCES radiology_reports(id),
  amendment_reason TEXT,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. Radiology Images (PACS integration metadata)
CREATE TABLE IF NOT EXISTS radiology_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  radiology_order_item_id UUID NOT NULL REFERENCES radiology_order_items(id),
  
  -- Image Details
  image_number INTEGER,
  series_number INTEGER,
  image_type VARCHAR(50), -- DICOM, JPEG, PNG, etc.
  
  -- DICOM/PACS
  study_instance_uid VARCHAR(200),
  series_instance_uid VARCHAR(200),
  sop_instance_uid VARCHAR(200),
  accession_number VARCHAR(100),
  
  -- File Info
  file_path VARCHAR(500),
  file_size_bytes BIGINT,
  file_format VARCHAR(20),
  
  -- Image Metadata
  view_position VARCHAR(50),
  acquisition_date TIMESTAMP,
  
  -- Quality
  image_quality VARCHAR(20),
  
  -- Thumbnails
  thumbnail_path VARCHAR(500),
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 7. Radiology Queue
CREATE TABLE IF NOT EXISTS radiology_queue (
  id SERIAL PRIMARY KEY,
  radiology_order_id UUID NOT NULL REFERENCES radiology_orders(id),
  patient_id UUID NOT NULL REFERENCES patients(id),
  
  -- Queue Management
  queue_position INTEGER,
  priority_level VARCHAR(20) DEFAULT 'normal',
  
  -- Modality
  modality_id INTEGER REFERENCES imaging_modalities(id),
  room_location VARCHAR(100),
  
  -- Status
  status VARCHAR(30) DEFAULT 'waiting' CHECK (status IN ('waiting', 'called', 'in-room', 'imaging', 'completed', 'cancelled')),
  
  -- Timing
  joined_queue_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  called_at TIMESTAMP,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- AUTO-NUMBERING SEQUENCES & FUNCTIONS
-- ============================================

-- Radiology Order Number
CREATE SEQUENCE IF NOT EXISTS radiology_order_seq START 1000;

CREATE OR REPLACE FUNCTION generate_radiology_order_number()
RETURNS TRIGGER AS $$
DECLARE
    new_order_number TEXT;
    max_attempts INTEGER := 10;
    attempt INTEGER := 0;
BEGIN
    IF NEW.order_number IS NULL OR NEW.order_number = '' THEN
        LOOP
            -- Generate order_number: RAD-YYYYMMDD-XXXX
            new_order_number := 'RAD-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-' || 
                               LPAD(NEXTVAL('radiology_order_seq')::TEXT, 4, '0');
            
            -- Check if this order_number already exists
            IF NOT EXISTS (SELECT 1 FROM radiology_orders WHERE order_number = new_order_number) THEN
                NEW.order_number := new_order_number;
                EXIT; -- Success, exit loop
            END IF;
            
            -- Increment attempt counter
            attempt := attempt + 1;
            IF attempt >= max_attempts THEN
                RAISE EXCEPTION 'Failed to generate unique radiology order_number after % attempts', max_attempts;
            END IF;
        END LOOP;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_radiology_order_number
BEFORE INSERT ON radiology_orders
FOR EACH ROW EXECUTE FUNCTION generate_radiology_order_number();

-- Radiology Report Number
CREATE SEQUENCE IF NOT EXISTS radiology_report_seq START 1000;

CREATE OR REPLACE FUNCTION generate_radiology_report_number()
RETURNS TRIGGER AS $$
DECLARE
    new_report_number TEXT;
    max_attempts INTEGER := 10;
    attempt INTEGER := 0;
BEGIN
    IF NEW.report_number IS NULL OR NEW.report_number = '' THEN
        LOOP
            -- Generate report_number: REP-YYYYMMDD-XXXX
            new_report_number := 'REP-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-' || 
                                LPAD(NEXTVAL('radiology_report_seq')::TEXT, 4, '0');
            
            -- Check if this report_number already exists
            IF NOT EXISTS (SELECT 1 FROM radiology_reports WHERE report_number = new_report_number) THEN
                NEW.report_number := new_report_number;
                EXIT; -- Success, exit loop
            END IF;
            
            -- Increment attempt counter
            attempt := attempt + 1;
            IF attempt >= max_attempts THEN
                RAISE EXCEPTION 'Failed to generate unique radiology report_number after % attempts', max_attempts;
            END IF;
        END LOOP;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_radiology_report_number
BEFORE INSERT ON radiology_reports
FOR EACH ROW EXECUTE FUNCTION generate_radiology_report_number();

-- ============================================
-- BUSINESS LOGIC TRIGGERS
-- ============================================

-- Update radiology order total
CREATE OR REPLACE FUNCTION update_radiology_order_total()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE radiology_orders
  SET total_amount = (
    SELECT COALESCE(SUM(price), 0)
    FROM radiology_order_items
    WHERE radiology_order_id = NEW.radiology_order_id
  )
  WHERE id = NEW.radiology_order_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_rad_order_amount
AFTER INSERT OR UPDATE ON radiology_order_items
FOR EACH ROW EXECUTE FUNCTION update_radiology_order_total();

-- Update order status based on items
CREATE OR REPLACE FUNCTION update_radiology_order_status()
RETURNS TRIGGER AS $$
DECLARE
  total_items INTEGER;
  completed_items INTEGER;
  reported_items INTEGER;
BEGIN
  SELECT COUNT(*),
         COUNT(CASE WHEN status = 'completed' THEN 1 END),
         COUNT(CASE WHEN status = 'reported' THEN 1 END)
  INTO total_items, completed_items, reported_items
  FROM radiology_order_items
  WHERE radiology_order_id = NEW.radiology_order_id;
  
  IF reported_items = total_items THEN
    UPDATE radiology_orders SET status = 'reported' WHERE id = NEW.radiology_order_id;
  ELSIF completed_items = total_items THEN
    UPDATE radiology_orders SET status = 'completed' WHERE id = NEW.radiology_order_id;
  ELSIF completed_items > 0 THEN
    UPDATE radiology_orders SET status = 'in-progress' WHERE id = NEW.radiology_order_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_rad_order_status
AFTER UPDATE ON radiology_order_items
FOR EACH ROW EXECUTE FUNCTION update_radiology_order_status();

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_rad_tests_modality ON radiology_tests(modality_id);
CREATE INDEX IF NOT EXISTS idx_rad_tests_active ON radiology_tests(is_active);

CREATE INDEX IF NOT EXISTS idx_rad_orders_patient ON radiology_orders(patient_id);
CREATE INDEX IF NOT EXISTS idx_rad_orders_doctor ON radiology_orders(ordering_doctor_id);
CREATE INDEX IF NOT EXISTS idx_rad_orders_status ON radiology_orders(status);
CREATE INDEX IF NOT EXISTS idx_rad_orders_priority ON radiology_orders(priority);
CREATE INDEX IF NOT EXISTS idx_rad_orders_date ON radiology_orders(order_date);

CREATE INDEX IF NOT EXISTS idx_rad_items_order ON radiology_order_items(radiology_order_id);
CREATE INDEX IF NOT EXISTS idx_rad_items_test ON radiology_order_items(test_id);
CREATE INDEX IF NOT EXISTS idx_rad_items_status ON radiology_order_items(status);

CREATE INDEX IF NOT EXISTS idx_rad_reports_order ON radiology_reports(radiology_order_id);
CREATE INDEX IF NOT EXISTS idx_rad_reports_radiologist ON radiology_reports(radiologist_id);
CREATE INDEX IF NOT EXISTS idx_rad_reports_status ON radiology_reports(status);

CREATE INDEX IF NOT EXISTS idx_rad_images_item ON radiology_images(radiology_order_item_id);
CREATE INDEX IF NOT EXISTS idx_rad_images_study_uid ON radiology_images(study_instance_uid);

CREATE INDEX IF NOT EXISTS idx_rad_queue_order ON radiology_queue(radiology_order_id);
CREATE INDEX IF NOT EXISTS idx_rad_queue_patient ON radiology_queue(patient_id);
CREATE INDEX IF NOT EXISTS idx_rad_queue_status ON radiology_queue(status);

-- ============================================
-- SAMPLE DATA
-- ============================================

-- Imaging Modalities
INSERT INTO imaging_modalities (modality_code, modality_name, description) VALUES
('XR', 'X-Ray', 'Conventional radiography'),
('CT', 'CT Scan', 'Computed tomography'),
('MRI', 'MRI', 'Magnetic resonance imaging'),
('US', 'Ultrasound', 'Ultrasonography'),
('MAMMO', 'Mammography', 'Breast imaging'),
('FLUORO', 'Fluoroscopy', 'Real-time X-ray'),
('NM', 'Nuclear Medicine', 'Nuclear imaging')
ON CONFLICT (modality_code) DO NOTHING;

-- Radiology Tests
INSERT INTO radiology_tests (test_code, test_name, modality_id, body_part, price, typical_duration_minutes) VALUES
('XR-CHEST-PA', 'Chest X-Ray PA', 1, 'Chest', 1000.00, 15),
('XR-ABD', 'Abdominal X-Ray', 1, 'Abdomen', 1200.00, 15),
('CT-HEAD', 'CT Head (Brain)', 2, 'Head', 5000.00, 30),
('CT-CHEST', 'CT Chest', 2, 'Chest', 6000.00, 30),
('US-ABD', 'Ultrasound Abdomen', 4, 'Abdomen', 2500.00, 30),
('US-OBS', 'Obstetric Ultrasound', 4, 'Pelvis', 3000.00, 30),
('MRI-BRAIN', 'MRI Brain', 3, 'Head', 12000.00, 45)
ON CONFLICT (test_code) DO NOTHING;

COMMENT ON TABLE radiology_orders IS 'Radiology/imaging test orders';
COMMENT ON TABLE radiology_order_items IS 'Individual imaging tests within an order';
COMMENT ON TABLE radiology_reports IS 'Radiology reports by radiologists';
COMMENT ON TABLE radiology_images IS 'Image file metadata and PACS integration';
COMMENT ON TABLE radiology_queue IS 'Real-time imaging queue management';

-- ============================================
-- FINAL PERMISSIONS GRANT
-- Ensure medimesh_user has all necessary permissions
-- ============================================

-- Grant all permissions on all tables to medimesh_user
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO medimesh_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO medimesh_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO medimesh_user;

-- Change ownership of all tables to medimesh_user
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public')
    LOOP
        EXECUTE 'ALTER TABLE ' || quote_ident(r.tablename) || ' OWNER TO medimesh_user';
    END LOOP;
END $$;

-- Change ownership of all sequences to medimesh_user
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema = 'public')
    LOOP
        EXECUTE 'ALTER SEQUENCE ' || quote_ident(r.sequence_name) || ' OWNER TO medimesh_user';
    END LOOP;
    
    RAISE NOTICE 'All database objects ownership transferred to medimesh_user';
END $$;

