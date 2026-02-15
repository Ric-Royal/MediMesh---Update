-- ============================================
-- MediMesh P0: Structured Lab Results, Pharmacy Stock, Attachments
-- Migration Script
-- ============================================
-- Covers: Lab result values, specimens, drug batches, dispensations,
--         stock movements, polymorphic attachments
-- ============================================

\c medimesh;

-- ============================================
-- PART 1: STRUCTURED LAB RESULTS
-- ============================================

-- 1.1 Specimens (sample tracking)
CREATE TABLE IF NOT EXISTS specimens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_order_id UUID NOT NULL REFERENCES lab_orders(id) ON DELETE CASCADE,
  lab_order_item_id UUID,  -- specific test item
  patient_id UUID NOT NULL REFERENCES patients(id),
  
  -- Specimen details
  specimen_type VARCHAR(100) NOT NULL,  -- 'blood', 'urine', 'csf', 'stool', 'swab'
  collection_method VARCHAR(100),        -- 'venipuncture', 'fingerstick', 'midstream'
  body_site VARCHAR(200),               -- where collected from
  
  -- Container & volume
  container_type VARCHAR(50),
  volume_ml DECIMAL(8, 2),
  
  -- Tracking
  barcode VARCHAR(100) UNIQUE,
  accession_number VARCHAR(100) UNIQUE,
  
  -- Status
  status VARCHAR(30) DEFAULT 'collected' CHECK (status IN (
    'collected', 'in-transit', 'received', 'processing', 
    'completed', 'rejected', 'disposed'
  )),
  
  -- Timestamps
  collected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  collected_by UUID REFERENCES staff(id),
  received_at TIMESTAMP,
  received_by UUID REFERENCES staff(id),
  
  -- Quality
  rejection_reason TEXT,
  storage_condition VARCHAR(50),  -- 'room-temp', 'refrigerated', 'frozen'
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  tenant_id UUID REFERENCES organizations(id)
);

CREATE INDEX IF NOT EXISTS idx_specimens_order ON specimens(lab_order_id);
CREATE INDEX IF NOT EXISTS idx_specimens_patient ON specimens(patient_id);
CREATE INDEX IF NOT EXISTS idx_specimens_barcode ON specimens(barcode);
CREATE INDEX IF NOT EXISTS idx_specimens_status ON specimens(status);

-- 1.2 Lab Results (header - one per order item)
CREATE TABLE IF NOT EXISTS lab_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_order_item_id UUID NOT NULL,  -- FK to lab_order_items
  specimen_id UUID REFERENCES specimens(id),
  
  -- Status
  status VARCHAR(30) DEFAULT 'pending' CHECK (status IN (
    'pending', 'partial', 'preliminary', 'final', 'amended', 
    'corrected', 'cancelled', 'entered-in-error'
  )),
  
  -- Overall result
  result_summary TEXT,
  interpretation VARCHAR(30) CHECK (interpretation IN ('normal', 'abnormal', 'critical', 'inconclusive')),
  clinical_significance TEXT,
  
  -- Verification
  performed_by UUID REFERENCES staff(id),
  performed_at TIMESTAMP,
  verified_by UUID REFERENCES staff(id),
  verified_at TIMESTAMP,
  
  -- Review
  reviewed_by UUID REFERENCES staff(id),
  reviewed_at TIMESTAMP,
  reviewer_comments TEXT,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  tenant_id UUID REFERENCES organizations(id)
);

CREATE INDEX IF NOT EXISTS idx_lab_results_item ON lab_results(lab_order_item_id);
CREATE INDEX IF NOT EXISTS idx_lab_results_status ON lab_results(status);
CREATE INDEX IF NOT EXISTS idx_lab_results_specimen ON lab_results(specimen_id);

-- 1.3 Lab Result Values (individual analytes within a result)
CREATE TABLE IF NOT EXISTS lab_result_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_result_id UUID NOT NULL REFERENCES lab_results(id) ON DELETE CASCADE,
  
  -- Analyte identification
  analyte_code VARCHAR(50),
  analyte_name VARCHAR(200) NOT NULL,
  
  -- Value (one of these)
  value_numeric DECIMAL(12, 4),
  value_text VARCHAR(1000),
  value_coded VARCHAR(100),    -- 'positive', 'negative', 'reactive', etc.
  
  -- Units & reference ranges
  unit VARCHAR(50),
  reference_low DECIMAL(12, 4),
  reference_high DECIMAL(12, 4),
  reference_text VARCHAR(200),   -- for non-numeric ranges
  
  -- Age/sex-specific reference ranges
  reference_age_min INTEGER,     -- months
  reference_age_max INTEGER,
  reference_sex VARCHAR(1),      -- 'M', 'F'
  
  -- Interpretation
  flag VARCHAR(20) CHECK (flag IN ('normal', 'high', 'low', 'critical-high', 'critical-low', 'abnormal', 'positive', 'negative')),
  is_critical BOOLEAN DEFAULT FALSE,
  
  -- Ordering within panel
  sequence_number INTEGER DEFAULT 0,
  is_panel_header BOOLEAN DEFAULT FALSE,  -- For grouping (e.g., "CBC" header)
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_result_values_result ON lab_result_values(lab_result_id);
CREATE INDEX IF NOT EXISTS idx_result_values_critical ON lab_result_values(is_critical) WHERE is_critical = TRUE;
CREATE INDEX IF NOT EXISTS idx_result_values_analyte ON lab_result_values(analyte_code);

-- ============================================
-- PART 2: PHARMACY STOCK MODEL
-- ============================================

-- 2.1 Drug Batches (lot tracking + expiry)
CREATE TABLE IF NOT EXISTS drug_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  drug_id UUID NOT NULL REFERENCES drugs(id) ON DELETE CASCADE,
  
  -- Batch details
  batch_number VARCHAR(100) NOT NULL,
  lot_number VARCHAR(100),
  
  -- Stock
  quantity_received INTEGER NOT NULL,
  quantity_remaining INTEGER NOT NULL,
  
  -- Dates
  manufacture_date DATE,
  expiry_date DATE NOT NULL,
  received_date DATE DEFAULT CURRENT_DATE,
  
  -- Cost
  unit_cost DECIMAL(10, 2),
  total_cost DECIMAL(12, 2),
  
  -- Supplier
  supplier_name VARCHAR(200),
  supplier_invoice VARCHAR(100),
  purchase_order VARCHAR(100),
  
  -- Storage
  storage_location VARCHAR(100),
  storage_condition VARCHAR(50),
  
  -- Status
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'quarantine', 'expired', 'recalled', 'depleted')),
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  tenant_id UUID REFERENCES organizations(id)
);

CREATE INDEX IF NOT EXISTS idx_batches_drug ON drug_batches(drug_id);
CREATE INDEX IF NOT EXISTS idx_batches_expiry ON drug_batches(expiry_date);
CREATE INDEX IF NOT EXISTS idx_batches_status ON drug_batches(status);
CREATE INDEX IF NOT EXISTS idx_batches_lot ON drug_batches(batch_number, lot_number);

-- 2.2 Stock Movements (every stock change tracked)
CREATE TABLE IF NOT EXISTS stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  drug_id UUID NOT NULL REFERENCES drugs(id),
  batch_id UUID REFERENCES drug_batches(id),
  
  -- Movement type
  movement_type VARCHAR(30) NOT NULL CHECK (movement_type IN (
    'purchase', 'return_to_supplier', 'dispensing', 'return_from_patient',
    'adjustment_increase', 'adjustment_decrease', 'transfer_in', 'transfer_out',
    'wastage', 'expired', 'damaged', 'opening_stock'
  )),
  
  -- Quantity (positive for increases, negative for decreases)
  quantity INTEGER NOT NULL,
  quantity_before INTEGER,   -- stock level before this movement
  quantity_after INTEGER,    -- stock level after this movement
  
  -- Cost
  unit_cost DECIMAL(10, 2),
  total_cost DECIMAL(12, 2),
  
  -- Reference (what triggered this movement)
  reference_type VARCHAR(50),   -- 'prescription', 'purchase_order', 'adjustment'
  reference_id UUID,            -- ID of the source document
  
  -- Context
  reason TEXT,
  notes TEXT,
  
  -- Audit
  performed_by UUID NOT NULL REFERENCES staff(id),
  performed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  approved_by UUID REFERENCES staff(id),
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  tenant_id UUID REFERENCES organizations(id)
);

CREATE INDEX IF NOT EXISTS idx_stock_mv_drug ON stock_movements(drug_id);
CREATE INDEX IF NOT EXISTS idx_stock_mv_batch ON stock_movements(batch_id);
CREATE INDEX IF NOT EXISTS idx_stock_mv_type ON stock_movements(movement_type);
CREATE INDEX IF NOT EXISTS idx_stock_mv_date ON stock_movements(performed_at);

-- 2.3 Dispensations (what was actually given to the patient)
CREATE TABLE IF NOT EXISTS dispensations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prescription_item_id UUID NOT NULL,  -- FK to prescription_items
  prescription_id UUID NOT NULL REFERENCES prescriptions(id),
  patient_id UUID NOT NULL REFERENCES patients(id),
  
  -- What was dispensed
  drug_id UUID NOT NULL REFERENCES drugs(id),
  batch_id UUID REFERENCES drug_batches(id),
  
  -- Quantities
  quantity_prescribed INTEGER NOT NULL,
  quantity_dispensed INTEGER NOT NULL,
  quantity_remaining INTEGER DEFAULT 0,  -- for partial dispensing
  
  -- Dispensing details
  dispensed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  dispensed_by UUID NOT NULL REFERENCES staff(id),
  verified_by UUID REFERENCES staff(id),
  
  -- Counseling
  counseling_provided BOOLEAN DEFAULT FALSE,
  counseling_notes TEXT,
  
  -- Patient acknowledgment
  patient_signature_ref VARCHAR(200),
  
  -- Substitution
  is_substitution BOOLEAN DEFAULT FALSE,
  substitution_reason TEXT,
  original_drug_id UUID REFERENCES drugs(id),
  
  -- Status
  status VARCHAR(20) DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'returned', 'cancelled')),
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  tenant_id UUID REFERENCES organizations(id)
);

CREATE INDEX IF NOT EXISTS idx_disp_prescription ON dispensations(prescription_id);
CREATE INDEX IF NOT EXISTS idx_disp_patient ON dispensations(patient_id);
CREATE INDEX IF NOT EXISTS idx_disp_drug ON dispensations(drug_id);
CREATE INDEX IF NOT EXISTS idx_disp_batch ON dispensations(batch_id);
CREATE INDEX IF NOT EXISTS idx_disp_date ON dispensations(dispensed_at);

-- ============================================
-- PART 3: POLYMORPHIC ATTACHMENTS (Object Storage)
-- ============================================

CREATE TABLE IF NOT EXISTS attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Polymorphic owner (what this is attached to)
  owner_type VARCHAR(50) NOT NULL,  -- 'encounter', 'lab_report', 'radiology_report', 'invoice', 'patient', 'clinical_note'
  owner_id UUID NOT NULL,
  
  -- File metadata
  file_name VARCHAR(500) NOT NULL,
  original_name VARCHAR(500),
  mime_type VARCHAR(100) NOT NULL,
  file_size_bytes BIGINT,
  
  -- Storage (MinIO/S3 compatible)
  storage_key VARCHAR(1000) NOT NULL,   -- Object key in bucket
  bucket VARCHAR(200) NOT NULL DEFAULT 'medimesh-files',
  storage_provider VARCHAR(30) DEFAULT 'minio' CHECK (storage_provider IN ('minio', 's3', 'nextcloud', 'local')),
  
  -- Integrity
  checksum VARCHAR(128),                -- SHA-256 hash
  checksum_algorithm VARCHAR(20) DEFAULT 'sha256',
  
  -- Security
  is_encrypted BOOLEAN DEFAULT FALSE,
  encryption_key_id VARCHAR(200),
  access_level VARCHAR(20) DEFAULT 'private' CHECK (access_level IN ('private', 'staff', 'patient', 'public')),
  
  -- Classification
  category VARCHAR(50),  -- 'lab-report', 'imaging', 'consent-form', 'prescription', 'referral', 'insurance'
  description TEXT,
  tags TEXT[],
  
  -- DICOM specific (for radiology)
  dicom_study_uid VARCHAR(200),
  dicom_series_uid VARCHAR(200),
  dicom_instance_uid VARCHAR(200),
  
  -- Versioning
  version INTEGER DEFAULT 1,
  previous_version_id UUID REFERENCES attachments(id),
  
  -- Audit
  uploaded_by UUID REFERENCES staff(id),
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Status
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'archived', 'deleted', 'quarantine')),
  deleted_at TIMESTAMP,
  deleted_by UUID REFERENCES staff(id),
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  tenant_id UUID REFERENCES organizations(id)
);

CREATE INDEX IF NOT EXISTS idx_attach_owner ON attachments(owner_type, owner_id);
CREATE INDEX IF NOT EXISTS idx_attach_category ON attachments(category);
CREATE INDEX IF NOT EXISTS idx_attach_storage ON attachments(bucket, storage_key);
CREATE INDEX IF NOT EXISTS idx_attach_dicom ON attachments(dicom_study_uid) WHERE dicom_study_uid IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_attach_tenant ON attachments(tenant_id);

-- ============================================
-- PART 4: IMAGING STUDIES (Radiology enhancement)
-- ============================================

CREATE TABLE IF NOT EXISTS imaging_studies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  radiology_order_id UUID REFERENCES radiology_orders(id),
  radiology_order_item_id UUID,
  patient_id UUID NOT NULL REFERENCES patients(id),
  encounter_id UUID REFERENCES encounters(id),
  
  -- Study identification
  study_instance_uid VARCHAR(200) UNIQUE,  -- DICOM Study Instance UID
  accession_number VARCHAR(100),
  
  -- Study details
  modality VARCHAR(20) NOT NULL,  -- 'CR', 'CT', 'MR', 'US', 'NM', 'PET'
  body_part VARCHAR(200),
  laterality VARCHAR(10),
  description TEXT,
  
  -- Timing
  study_date TIMESTAMP,
  number_of_series INTEGER DEFAULT 0,
  number_of_instances INTEGER DEFAULT 0,
  
  -- Status
  status VARCHAR(30) DEFAULT 'scheduled' CHECK (status IN (
    'scheduled', 'in-progress', 'completed', 'read', 'reported', 'cancelled'
  )),
  
  -- PACS reference
  pacs_url VARCHAR(500),
  viewer_url VARCHAR(500),
  
  -- Technologist
  performed_by UUID REFERENCES staff(id),
  performed_at TIMESTAMP,
  
  -- Interpretation
  interpreted_by UUID REFERENCES staff(id),
  interpreted_at TIMESTAMP,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  tenant_id UUID REFERENCES organizations(id)
);

CREATE INDEX IF NOT EXISTS idx_imaging_patient ON imaging_studies(patient_id);
CREATE INDEX IF NOT EXISTS idx_imaging_order ON imaging_studies(radiology_order_id);
CREATE INDEX IF NOT EXISTS idx_imaging_uid ON imaging_studies(study_instance_uid);
CREATE INDEX IF NOT EXISTS idx_imaging_modality ON imaging_studies(modality);
CREATE INDEX IF NOT EXISTS idx_imaging_date ON imaging_studies(study_date);
