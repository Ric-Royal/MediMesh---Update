-- ============================================
-- MediMesh Phase 2: Pharmacy Management Module
-- Database Schema Migration
-- ============================================
-- Priority: CRITICAL (from Gap Analysis)
-- Coverage: 0% → 90%
-- Timeline: Weeks 9-12
-- ============================================

-- Ensure we're connected to the medimesh database
\c medimesh;

-- 1. Drug Categories
CREATE TABLE IF NOT EXISTS drug_categories (
  id SERIAL PRIMARY KEY,
  category_name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create sequence for drug code generation
CREATE SEQUENCE IF NOT EXISTS drug_code_sequence START 1000;

-- 2. Drugs (Inventory Catalog)
CREATE TABLE IF NOT EXISTS drugs (
  id SERIAL PRIMARY KEY,
  drug_code VARCHAR(50) UNIQUE NOT NULL, -- Auto-generated: DRG-YYYYMMDD-XXXX
  generic_name VARCHAR(200) NOT NULL,
  brand_name VARCHAR(200),
  category_id INTEGER REFERENCES drug_categories(id),
  dosage_form VARCHAR(50), -- tablet, capsule, syrup, injection, etc.
  strength VARCHAR(50), -- e.g., "500mg", "10ml", "5%"
  unit_of_measure VARCHAR(20), -- tablet, bottle, vial, etc.
  manufacturer VARCHAR(200),
  description TEXT,

  -- Inventory
  reorder_level INTEGER DEFAULT 50,
  current_stock INTEGER DEFAULT 0,
  unit_price DECIMAL(10, 2) DEFAULT 0.00,
  selling_price DECIMAL(10, 2) DEFAULT 0.00,

  -- Clinical
  is_controlled_substance BOOLEAN DEFAULT false,
  requires_prescription BOOLEAN DEFAULT true,
  storage_requirements TEXT, -- refrigerate, room temp, etc.

  -- Status
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT chk_price CHECK (unit_price >= 0 AND selling_price >= unit_price)
);

-- Function to auto-generate drug_code with collision detection
CREATE OR REPLACE FUNCTION generate_drug_code()
RETURNS TRIGGER AS $$
DECLARE
    new_drug_code TEXT;
    max_attempts INTEGER := 10;
    attempt INTEGER := 0;
BEGIN
    IF NEW.drug_code IS NULL OR NEW.drug_code = '' THEN
        LOOP
            -- Generate drug_code: DRG-YYYYMMDD-XXXX
            new_drug_code := 'DRG-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' ||
                            LPAD(NEXTVAL('drug_code_sequence')::TEXT, 4, '0');

            -- Check if this drug_code already exists
            IF NOT EXISTS (SELECT 1 FROM drugs WHERE drug_code = new_drug_code) THEN
                NEW.drug_code := new_drug_code;
                EXIT; -- Success, exit loop
            END IF;

            -- Increment attempt counter
            attempt := attempt + 1;
            IF attempt >= max_attempts THEN
                RAISE EXCEPTION 'Failed to generate unique drug_code after % attempts', max_attempts;
            END IF;
        END LOOP;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS set_drug_code ON drugs;
CREATE TRIGGER set_drug_code
    BEFORE INSERT ON drugs
    FOR EACH ROW
    EXECUTE FUNCTION generate_drug_code();

-- 3. Drug Stock Movements
CREATE TABLE IF NOT EXISTS drug_stock_movements (
  id SERIAL PRIMARY KEY,
  drug_id INTEGER NOT NULL REFERENCES drugs(id),
  movement_type VARCHAR(20) NOT NULL CHECK (movement_type IN ('purchase', 'sale', 'adjustment', 'return', 'expired', 'transfer')),
  quantity INTEGER NOT NULL,
  unit_cost DECIMAL(10, 2),
  batch_number VARCHAR(100),
  expiry_date DATE,
  supplier_id INTEGER, -- Can link to suppliers table later
  reference_number VARCHAR(100), -- Invoice/PO number
  notes TEXT,
  movement_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create sequence for prescription number generation
CREATE SEQUENCE IF NOT EXISTS prescription_number_sequence START 1000;

-- 4. Prescriptions (E-Prescribing)
CREATE TABLE IF NOT EXISTS prescriptions (
  id SERIAL PRIMARY KEY,
  prescription_number VARCHAR(50) UNIQUE NOT NULL, -- Auto-generated: RX-YYYYMMDD-XXXX
  patient_id UUID NOT NULL REFERENCES patients(id),
  encounter_id UUID REFERENCES encounters(id),
  doctor_id UUID NOT NULL REFERENCES staff(id),
  clinic_id UUID REFERENCES clinics(id),

  -- Status
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'partially-dispensed', 'fully-dispensed', 'cancelled')),

  -- Dates
  prescription_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  dispensed_date TIMESTAMP,

  -- Clinical
  diagnosis TEXT,
  notes TEXT,
  special_instructions TEXT,

  -- Billing
  total_amount DECIMAL(10, 2) DEFAULT 0.00,
  payment_status VARCHAR(20) DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'partially-paid', 'paid')),
  amount_paid DECIMAL(10, 2) DEFAULT 0.00,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Function to auto-generate prescription_number with collision detection
CREATE OR REPLACE FUNCTION generate_prescription_number()
RETURNS TRIGGER AS $$
DECLARE
    new_prescription_number TEXT;
    max_attempts INTEGER := 10;
    attempt INTEGER := 0;
BEGIN
    IF NEW.prescription_number IS NULL OR NEW.prescription_number = '' THEN
        LOOP
            -- Generate prescription_number: RX-YYYYMMDD-XXXX
            new_prescription_number := 'RX-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' ||
                                      LPAD(NEXTVAL('prescription_number_sequence')::TEXT, 4, '0');

            -- Check if this prescription_number already exists
            IF NOT EXISTS (SELECT 1 FROM prescriptions WHERE prescription_number = new_prescription_number) THEN
                NEW.prescription_number := new_prescription_number;
                EXIT; -- Success, exit loop
            END IF;

            -- Increment attempt counter
            attempt := attempt + 1;
            IF attempt >= max_attempts THEN
                RAISE EXCEPTION 'Failed to generate unique prescription_number after % attempts', max_attempts;
            END IF;
        END LOOP;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS set_prescription_number ON prescriptions;
CREATE TRIGGER set_prescription_number
    BEFORE INSERT ON prescriptions
    FOR EACH ROW
    EXECUTE FUNCTION generate_prescription_number();

-- 5. Prescription Items (Drug Details)
CREATE TABLE IF NOT EXISTS prescription_items (
  id SERIAL PRIMARY KEY,
  prescription_id INTEGER NOT NULL REFERENCES prescriptions(id) ON DELETE CASCADE,
  drug_id INTEGER NOT NULL REFERENCES drugs(id),

  -- Dosage
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  dosage VARCHAR(100), -- e.g., "1 tablet twice daily"
  duration_days INTEGER,
  frequency VARCHAR(50), -- once daily, twice daily, PRN, etc.
  route VARCHAR(50), -- oral, IV, IM, topical, etc.

  -- Dispensing
  quantity_dispensed INTEGER DEFAULT 0,
  unit_price DECIMAL(10, 2) NOT NULL,
  subtotal DECIMAL(10, 2) GENERATED ALWAYS AS (quantity * unit_price) STORED,

  -- Status
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'dispensed', 'cancelled', 'out-of-stock')),
  dispensed_date TIMESTAMP,
  dispensed_by UUID REFERENCES staff(id),
  batch_number VARCHAR(100),

  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. Pharmacy Transactions (Dispensing Records)
CREATE TABLE IF NOT EXISTS pharmacy_transactions (
  id SERIAL PRIMARY KEY,
  transaction_number VARCHAR(50) UNIQUE NOT NULL, -- Auto-generated: PHR-YYYYMMDD-XXXX
  prescription_id INTEGER REFERENCES prescriptions(id),
  patient_id UUID NOT NULL REFERENCES patients(id),

  -- Transaction Type
  transaction_type VARCHAR(20) DEFAULT 'prescription' CHECK (transaction_type IN ('prescription', 'otc', 'refill', 'return')),

  -- Financial
  total_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  discount_amount DECIMAL(10, 2) DEFAULT 0.00,
  tax_amount DECIMAL(10, 2) DEFAULT 0.00,
  final_amount DECIMAL(10, 2) GENERATED ALWAYS AS (total_amount - discount_amount + tax_amount) STORED,
  payment_method VARCHAR(30),
  payment_status VARCHAR(20) DEFAULT 'unpaid',

  -- Staff
  dispensed_by UUID REFERENCES staff(id),
  verified_by UUID REFERENCES staff(id),

  -- Status
  status VARCHAR(20) DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'cancelled', 'returned')),

  -- Dates
  transaction_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- AUTO-NUMBERING SEQUENCES & FUNCTIONS
-- ============================================
-- Note: Drug code and prescription number generation functions
-- are defined above with collision detection

-- Pharmacy Transaction Number Sequence
CREATE SEQUENCE IF NOT EXISTS pharmacy_transaction_seq START 1;

CREATE OR REPLACE FUNCTION generate_pharmacy_transaction_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.transaction_number IS NULL OR NEW.transaction_number = '' THEN
    NEW.transaction_number := 'PHR-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-' || LPAD(nextval('pharmacy_transaction_seq')::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_pharmacy_transaction_number
BEFORE INSERT ON pharmacy_transactions
FOR EACH ROW EXECUTE FUNCTION generate_pharmacy_transaction_number();

-- ============================================
-- TRIGGERS FOR BUSINESS LOGIC
-- ============================================

-- Update drug stock on movements
CREATE OR REPLACE FUNCTION update_drug_stock()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.movement_type IN ('purchase', 'adjustment', 'return') THEN
    UPDATE drugs SET current_stock = current_stock + NEW.quantity WHERE id = NEW.drug_id;
  ELSIF NEW.movement_type IN ('sale', 'expired', 'transfer') THEN
    UPDATE drugs SET current_stock = current_stock - NEW.quantity WHERE id = NEW.drug_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_stock_on_movement
AFTER INSERT ON drug_stock_movements
FOR EACH ROW EXECUTE FUNCTION update_drug_stock();

-- Update prescription total amount
CREATE OR REPLACE FUNCTION update_prescription_total()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE prescriptions
  SET total_amount = (
    SELECT COALESCE(SUM(subtotal), 0)
    FROM prescription_items
    WHERE prescription_id = NEW.prescription_id
  )
  WHERE id = NEW.prescription_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_prescription_amount
AFTER INSERT OR UPDATE ON prescription_items
FOR EACH ROW EXECUTE FUNCTION update_prescription_total();

-- Update prescription status based on items
CREATE OR REPLACE FUNCTION update_prescription_status()
RETURNS TRIGGER AS $$
DECLARE
  total_items INTEGER;
  dispensed_items INTEGER;
BEGIN
  SELECT COUNT(*), COUNT(CASE WHEN status = 'dispensed' THEN 1 END)
  INTO total_items, dispensed_items
  FROM prescription_items
  WHERE prescription_id = NEW.prescription_id;

  IF dispensed_items = 0 THEN
    UPDATE prescriptions SET status = 'pending' WHERE id = NEW.prescription_id;
  ELSIF dispensed_items = total_items THEN
    UPDATE prescriptions SET status = 'fully-dispensed', dispensed_date = CURRENT_TIMESTAMP WHERE id = NEW.prescription_id;
  ELSE
    UPDATE prescriptions SET status = 'partially-dispensed' WHERE id = NEW.prescription_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_rx_status
AFTER UPDATE ON prescription_items
FOR EACH ROW EXECUTE FUNCTION update_prescription_status();

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================

CREATE INDEX IF NOT EXISTS idx_drugs_generic_name ON drugs(generic_name);
CREATE INDEX IF NOT EXISTS idx_drugs_brand_name ON drugs(brand_name);
CREATE INDEX IF NOT EXISTS idx_drugs_category ON drugs(category_id);
CREATE INDEX IF NOT EXISTS idx_drugs_active ON drugs(is_active);
CREATE INDEX IF NOT EXISTS idx_drugs_stock ON drugs(current_stock) WHERE current_stock < reorder_level;

CREATE INDEX IF NOT EXISTS idx_prescriptions_patient ON prescriptions(patient_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_doctor ON prescriptions(doctor_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_status ON prescriptions(status);
CREATE INDEX IF NOT EXISTS idx_prescriptions_date ON prescriptions(prescription_date);

CREATE INDEX IF NOT EXISTS idx_prescription_items_rx ON prescription_items(prescription_id);
CREATE INDEX IF NOT EXISTS idx_prescription_items_drug ON prescription_items(drug_id);
CREATE INDEX IF NOT EXISTS idx_prescription_items_status ON prescription_items(status);

CREATE INDEX IF NOT EXISTS idx_pharmacy_trans_patient ON pharmacy_transactions(patient_id);
CREATE INDEX IF NOT EXISTS idx_pharmacy_trans_date ON pharmacy_transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_pharmacy_trans_status ON pharmacy_transactions(status);

CREATE INDEX IF NOT EXISTS idx_stock_movements_drug ON drug_stock_movements(drug_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_date ON drug_stock_movements(movement_date);

-- ============================================
-- SAMPLE DATA
-- ============================================

-- Drug Categories
INSERT INTO drug_categories (category_name, description) VALUES
('Antibiotics', 'Antimicrobial medications'),
('Analgesics', 'Pain relief medications'),
('Antihypertensives', 'Blood pressure medications'),
('Antidiabetics', 'Diabetes management drugs'),
('Antipyretics', 'Fever reducers'),
('Antihistamines', 'Allergy medications'),
('Cardiovascular', 'Heart and circulation drugs'),
('Gastrointestinal', 'Digestive system medications'),
('Respiratory', 'Breathing and lung medications'),
('Vitamins & Supplements', 'Nutritional supplements')
ON CONFLICT (category_name) DO NOTHING;

-- Sample Drugs
INSERT INTO drugs (drug_code, generic_name, brand_name, category_id, dosage_form, strength, unit_of_measure, current_stock, unit_price, selling_price, requires_prescription) VALUES
('DRG-20251130-0001', 'Amoxicillin', 'Amoxil', 1, 'Capsule', '500mg', 'capsule', 1000, 0.50, 1.00, true),
('DRG-20251130-0002', 'Paracetamol', 'Panadol', 2, 'Tablet', '500mg', 'tablet', 2000, 0.10, 0.25, false),
('DRG-20251130-0003', 'Ibuprofen', 'Brufen', 2, 'Tablet', '400mg', 'tablet', 1500, 0.15, 0.35, false),
('DRG-20251130-0004', 'Metformin', 'Glucophage', 4, 'Tablet', '500mg', 'tablet', 800, 0.20, 0.50, true),
('DRG-20251130-0005', 'Amlodipine', 'Norvasc', 3, 'Tablet', '5mg', 'tablet', 600, 0.30, 0.75, true),
('DRG-20251130-0006', 'Omeprazole', 'Losec', 8, 'Capsule', '20mg', 'capsule', 500, 0.40, 1.00, true),
('DRG-20251130-0007', 'Cetirizine', 'Zyrtec', 6, 'Tablet', '10mg', 'tablet', 700, 0.12, 0.30, false),
('DRG-20251130-0008', 'Salbutamol', 'Ventolin', 9, 'Inhaler', '100mcg', 'inhaler', 150, 3.00, 7.50, true)
ON CONFLICT (drug_code) DO NOTHING;

COMMENT ON TABLE drugs IS 'Central drug catalog with inventory management';
COMMENT ON TABLE prescriptions IS 'E-prescribing system for doctors';
COMMENT ON TABLE prescription_items IS 'Individual drugs prescribed';
COMMENT ON TABLE pharmacy_transactions IS 'Dispensing and sales records';
COMMENT ON TABLE drug_stock_movements IS 'Inventory tracking and audit trail';
