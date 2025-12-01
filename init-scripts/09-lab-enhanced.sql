-- ============================================
-- MediMesh Phase 2: Enhanced Laboratory Module
-- Database Schema Enhancement
-- ============================================
-- Priority: CRITICAL (from Gap Analysis)
-- Current Coverage: 40% → Target: 85%
-- Timeline: Weeks 9-12
-- ============================================

-- Ensure we're connected to the medimesh database
\c medimesh;

-- 1. Lab Test Catalog (Enhanced)
CREATE TABLE IF NOT EXISTS lab_tests (
  id SERIAL PRIMARY KEY,
  test_code VARCHAR(50) UNIQUE NOT NULL,
  test_name VARCHAR(200) NOT NULL,
  test_category VARCHAR(100), -- Hematology, Biochemistry, Microbiology, etc.
  specimen_type VARCHAR(100), -- Blood, Urine, Stool, etc.
  specimen_volume VARCHAR(50),
  container_type VARCHAR(100), -- Plain tube, EDTA tube, etc.
  storage_requirements TEXT,
  
  -- Testing
  turnaround_time_hours INTEGER DEFAULT 24,
  requires_fasting BOOLEAN DEFAULT false,
  
  -- Pricing
  price DECIMAL(10, 2) DEFAULT 0.00,
  
  -- Reference Ranges (stored as JSONB for flexibility)
  reference_ranges JSONB, -- {male: {min: 13, max: 18, unit: "g/dL"}, female: {...}}
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Lab Orders (Enhanced from existing)
CREATE TABLE IF NOT EXISTS lab_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number VARCHAR(50) UNIQUE NOT NULL, -- Auto: LAB-YYYYMMDD-XXXX
  patient_id UUID NOT NULL REFERENCES patients(id),
  encounter_id UUID REFERENCES encounters(id),
  ordering_doctor_id UUID NOT NULL REFERENCES staff(id),
  clinic_id UUID REFERENCES clinics(id),
  
  -- Order Details
  priority VARCHAR(20) DEFAULT 'routine' CHECK (priority IN ('routine', 'urgent', 'stat', 'emergency')),
  clinical_notes TEXT,
  diagnosis TEXT,
  
  -- Status Tracking
  status VARCHAR(30) DEFAULT 'pending' CHECK (status IN ('pending', 'sample-collected', 'in-progress', 'completed', 'cancelled', 'rejected')),
  
  -- Dates
  order_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  sample_collection_date TIMESTAMP,
  result_date TIMESTAMP,
  reported_date TIMESTAMP,
  
  -- Personnel
  collected_by UUID REFERENCES staff(id),
  verified_by UUID REFERENCES staff(id),
  reported_by UUID REFERENCES staff(id),
  
  -- Billing
  total_amount DECIMAL(10, 2) DEFAULT 0.00,
  payment_status VARCHAR(20) DEFAULT 'unpaid',
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Lab Order Items (Individual Tests)
CREATE TABLE IF NOT EXISTS lab_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_order_id UUID NOT NULL REFERENCES lab_orders(id) ON DELETE CASCADE,
  test_id INTEGER NOT NULL REFERENCES lab_tests(id),
  
  -- Sample Tracking
  sample_barcode VARCHAR(50) UNIQUE, -- Auto-generated or scanned
  sample_status VARCHAR(30) DEFAULT 'pending' CHECK (sample_status IN ('pending', 'collected', 'received', 'rejected', 'processed')),
  rejection_reason TEXT,
  
  -- Results
  result_value VARCHAR(500),
  result_unit VARCHAR(50),
  result_flag VARCHAR(20), -- normal, high, low, critical
  result_notes TEXT,
  
  -- Reference Range at time of test (snapshot)
  reference_min VARCHAR(50),
  reference_max VARCHAR(50),
  
  -- Status
  status VARCHAR(30) DEFAULT 'pending' CHECK (status IN ('pending', 'in-progress', 'completed', 'cancelled')),
  
  -- Pricing
  price DECIMAL(10, 2) DEFAULT 0.00,
  
  -- Dates
  sample_collected_at TIMESTAMP,
  result_entered_at TIMESTAMP,
  verified_at TIMESTAMP,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Lab Samples (Barcode Tracking)
CREATE TABLE IF NOT EXISTS lab_samples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barcode VARCHAR(50) UNIQUE NOT NULL,
  lab_order_id UUID NOT NULL REFERENCES lab_orders(id),
  lab_order_item_id UUID REFERENCES lab_order_items(id),
  
  -- Sample Details
  specimen_type VARCHAR(100) NOT NULL,
  container_type VARCHAR(100),
  volume_collected VARCHAR(50),
  
  -- Collection
  collection_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  collected_by UUID REFERENCES staff(id),
  collection_site VARCHAR(100),
  
  -- Tracking
  status VARCHAR(30) DEFAULT 'collected' CHECK (status IN ('collected', 'in-transit', 'received', 'rejected', 'processed', 'stored', 'discarded')),
  current_location VARCHAR(100),
  storage_location VARCHAR(100),
  
  -- Quality
  quality_acceptable BOOLEAN DEFAULT true,
  quality_notes TEXT,
  rejection_reason TEXT,
  
  -- Temperature Monitoring
  temperature_log JSONB, -- [{time: "...", temp: 4.5, location: "..."}]
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. Lab Queue (Real-time Processing Queue)
CREATE TABLE IF NOT EXISTS lab_queue (
  id SERIAL PRIMARY KEY,
  lab_order_id UUID NOT NULL REFERENCES lab_orders(id),
  patient_id UUID NOT NULL REFERENCES patients(id),
  
  -- Queue Management
  queue_position INTEGER,
  priority_level VARCHAR(20) DEFAULT 'normal',
  
  -- Status
  status VARCHAR(30) DEFAULT 'waiting' CHECK (status IN ('waiting', 'sample-collection', 'processing', 'completed', 'cancelled')),
  
  -- Timing
  joined_queue_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  called_at TIMESTAMP,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  waiting_minutes INTEGER,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. Lab Equipment (Optional but useful)
CREATE TABLE IF NOT EXISTS lab_equipment (
  id SERIAL PRIMARY KEY,
  equipment_code VARCHAR(50) UNIQUE NOT NULL,
  equipment_name VARCHAR(200) NOT NULL,
  equipment_type VARCHAR(100), -- Analyzer, Microscope, Centrifuge, etc.
  manufacturer VARCHAR(200),
  model VARCHAR(100),
  serial_number VARCHAR(100),
  
  -- Status
  status VARCHAR(30) DEFAULT 'operational' CHECK (status IN ('operational', 'maintenance', 'calibration', 'out-of-service', 'retired')),
  location VARCHAR(100),
  
  -- Maintenance
  last_calibration_date DATE,
  next_calibration_date DATE,
  last_maintenance_date DATE,
  next_maintenance_date DATE,
  
  -- Tests supported
  supported_tests INTEGER[], -- Array of test IDs
  
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- AUTO-NUMBERING & BARCODES
-- ============================================

-- Lab Order Number Sequence
CREATE SEQUENCE IF NOT EXISTS lab_order_number_seq START 1000;

CREATE OR REPLACE FUNCTION generate_lab_order_number()
RETURNS TRIGGER AS $$
DECLARE
    new_order_number TEXT;
    max_attempts INTEGER := 10;
    attempt INTEGER := 0;
BEGIN
    IF NEW.order_number IS NULL OR NEW.order_number = '' THEN
        LOOP
            -- Generate order_number: LAB-YYYYMMDD-XXXX
            new_order_number := 'LAB-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-' || 
                               LPAD(NEXTVAL('lab_order_number_seq')::TEXT, 4, '0');
            
            -- Check if this order_number already exists
            IF NOT EXISTS (SELECT 1 FROM lab_orders WHERE order_number = new_order_number) THEN
                NEW.order_number := new_order_number;
                EXIT; -- Success, exit loop
            END IF;
            
            -- Increment attempt counter
            attempt := attempt + 1;
            IF attempt >= max_attempts THEN
                RAISE EXCEPTION 'Failed to generate unique lab order_number after % attempts', max_attempts;
            END IF;
        END LOOP;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_lab_order_number
BEFORE INSERT ON lab_orders
FOR EACH ROW EXECUTE FUNCTION generate_lab_order_number();

-- Sample Barcode Generation
CREATE SEQUENCE IF NOT EXISTS sample_barcode_seq START 1;

CREATE OR REPLACE FUNCTION generate_sample_barcode()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.barcode IS NULL OR NEW.barcode = '' THEN
    NEW.barcode := 'SMP-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-' || LPAD(nextval('sample_barcode_seq')::TEXT, 6, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_sample_barcode
BEFORE INSERT ON lab_samples
FOR EACH ROW EXECUTE FUNCTION generate_sample_barcode();

-- Auto-set sample barcode on lab_order_items
CREATE OR REPLACE FUNCTION set_order_item_barcode()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.sample_barcode IS NULL AND NEW.sample_status = 'collected' THEN
    NEW.sample_barcode := 'SMP-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-' || LPAD(nextval('sample_barcode_seq')::TEXT, 6, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_item_sample_barcode
BEFORE UPDATE ON lab_order_items
FOR EACH ROW EXECUTE FUNCTION set_order_item_barcode();

-- ============================================
-- BUSINESS LOGIC TRIGGERS
-- ============================================

-- Update lab order total amount
CREATE OR REPLACE FUNCTION update_lab_order_total()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE lab_orders
  SET total_amount = (
    SELECT COALESCE(SUM(price), 0)
    FROM lab_order_items
    WHERE lab_order_id = NEW.lab_order_id
  )
  WHERE id = NEW.lab_order_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_order_amount
AFTER INSERT OR UPDATE ON lab_order_items
FOR EACH ROW EXECUTE FUNCTION update_lab_order_total();

-- Update lab order status based on items
CREATE OR REPLACE FUNCTION update_lab_order_status()
RETURNS TRIGGER AS $$
DECLARE
  total_items INTEGER;
  completed_items INTEGER;
  in_progress_items INTEGER;
BEGIN
  SELECT COUNT(*), 
         COUNT(CASE WHEN status = 'completed' THEN 1 END),
         COUNT(CASE WHEN status = 'in-progress' THEN 1 END)
  INTO total_items, completed_items, in_progress_items
  FROM lab_order_items
  WHERE lab_order_id = NEW.lab_order_id;
  
  IF completed_items = total_items THEN
    UPDATE lab_orders SET status = 'completed', result_date = CURRENT_TIMESTAMP WHERE id = NEW.lab_order_id;
  ELSIF in_progress_items > 0 THEN
    UPDATE lab_orders SET status = 'in-progress' WHERE id = NEW.lab_order_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_order_status_on_item
AFTER UPDATE ON lab_order_items
FOR EACH ROW EXECUTE FUNCTION update_lab_order_status();

-- Auto-flag abnormal results
CREATE OR REPLACE FUNCTION flag_abnormal_results()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.result_value IS NOT NULL AND NEW.reference_min IS NOT NULL AND NEW.reference_max IS NOT NULL THEN
    IF NEW.result_value::NUMERIC < NEW.reference_min::NUMERIC THEN
      NEW.result_flag := 'low';
    ELSIF NEW.result_value::NUMERIC > NEW.reference_max::NUMERIC THEN
      NEW.result_flag := 'high';
    ELSE
      NEW.result_flag := 'normal';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER flag_results
BEFORE UPDATE ON lab_order_items
FOR EACH ROW
WHEN (NEW.result_value IS DISTINCT FROM OLD.result_value)
EXECUTE FUNCTION flag_abnormal_results();

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================

CREATE INDEX IF NOT EXISTS idx_lab_tests_code ON lab_tests(test_code);
CREATE INDEX IF NOT EXISTS idx_lab_tests_category ON lab_tests(test_category);
CREATE INDEX IF NOT EXISTS idx_lab_tests_active ON lab_tests(is_active);

CREATE INDEX IF NOT EXISTS idx_lab_orders_patient ON lab_orders(patient_id);
CREATE INDEX IF NOT EXISTS idx_lab_orders_doctor ON lab_orders(ordering_doctor_id);
CREATE INDEX IF NOT EXISTS idx_lab_orders_status ON lab_orders(status);
CREATE INDEX IF NOT EXISTS idx_lab_orders_date ON lab_orders(order_date);
CREATE INDEX IF NOT EXISTS idx_lab_orders_priority ON lab_orders(priority);

CREATE INDEX IF NOT EXISTS idx_lab_order_items_order ON lab_order_items(lab_order_id);
CREATE INDEX IF NOT EXISTS idx_lab_order_items_test ON lab_order_items(test_id);
CREATE INDEX IF NOT EXISTS idx_lab_order_items_barcode ON lab_order_items(sample_barcode);
CREATE INDEX IF NOT EXISTS idx_lab_order_items_status ON lab_order_items(status);
CREATE INDEX IF NOT EXISTS idx_lab_order_items_flag ON lab_order_items(result_flag);

CREATE INDEX IF NOT EXISTS idx_lab_samples_barcode ON lab_samples(barcode);
CREATE INDEX IF NOT EXISTS idx_lab_samples_order ON lab_samples(lab_order_id);
CREATE INDEX IF NOT EXISTS idx_lab_samples_status ON lab_samples(status);

CREATE INDEX IF NOT EXISTS idx_lab_queue_order ON lab_queue(lab_order_id);
CREATE INDEX IF NOT EXISTS idx_lab_queue_patient ON lab_queue(patient_id);
CREATE INDEX IF NOT EXISTS idx_lab_queue_status ON lab_queue(status);

-- ============================================
-- SAMPLE DATA
-- ============================================

-- Lab Test Catalog
INSERT INTO lab_tests (test_code, test_name, test_category, specimen_type, price, reference_ranges) VALUES
('CBC001', 'Complete Blood Count (CBC)', 'Hematology', 'Blood (EDTA)', 500.00, '{"hemoglobin": {"male": {"min": 13, "max": 18, "unit": "g/dL"}, "female": {"min": 12, "max": 16, "unit": "g/dL"}}, "wbc": {"min": 4000, "max": 11000, "unit": "cells/µL"}}'),
('FBS001', 'Fasting Blood Sugar', 'Biochemistry', 'Blood (Fluoride)', 300.00, '{"fasting": {"min": 70, "max": 100, "unit": "mg/dL"}}'),
('HBA1C', 'HbA1c', 'Biochemistry', 'Blood (EDTA)', 800.00, '{"normal": {"min": 4, "max": 5.6, "unit": "%"}, "prediabetes": {"min": 5.7, "max": 6.4, "unit": "%"}}'),
('LFT001', 'Liver Function Tests', 'Biochemistry', 'Blood (Serum)', 1200.00, '{"ALT": {"min": 7, "max": 56, "unit": "U/L"}, "AST": {"min": 10, "max": 40, "unit": "U/L"}}'),
('RFT001', 'Renal Function Tests', 'Biochemistry', 'Blood (Serum)', 1000.00, '{"creatinine": {"min": 0.7, "max": 1.3, "unit": "mg/dL"}, "urea": {"min": 7, "max": 20, "unit": "mg/dL"}}'),
('URINE', 'Urinalysis', 'Urinalysis', 'Urine (Mid-stream)', 200.00, '{"pH": {"min": 4.5, "max": 8, "unit": ""}}'),
('MALARIA', 'Malaria Test', 'Microbiology', 'Blood (EDTA)', 400.00, '{}'),
('LIPID', 'Lipid Profile', 'Biochemistry', 'Blood (Serum)', 1500.00, '{"cholesterol": {"min": 0, "max": 200, "unit": "mg/dL"}, "HDL": {"min": 40, "max": 60, "unit": "mg/dL"}}')
ON CONFLICT (test_code) DO NOTHING;

COMMENT ON TABLE lab_tests IS 'Catalog of all available laboratory tests with reference ranges';
COMMENT ON TABLE lab_orders IS 'Laboratory test orders from doctors';
COMMENT ON TABLE lab_order_items IS 'Individual tests within a lab order';
COMMENT ON TABLE lab_samples IS 'Physical samples with barcode tracking';
COMMENT ON TABLE lab_queue IS 'Real-time queue for sample collection and processing';
COMMENT ON TABLE lab_equipment IS 'Laboratory equipment and instruments';

