-- ============================================
-- MediMesh Phase 3: Comprehensive Billing Module
-- Database Schema
-- ============================================
-- Priority: Important for Business Operations
-- Coverage: 20% → 90%
-- Timeline: Weeks 13-16
-- ============================================

-- 1. Billing Accounts (Patient financial account)
CREATE TABLE IF NOT EXISTS billing_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id),
  account_number VARCHAR(50) UNIQUE NOT NULL, -- Auto: ACC-YYYYMMDD-XXXX
  
  -- Financial Summary
  total_charges DECIMAL(12, 2) DEFAULT 0.00,
  total_payments DECIMAL(12, 2) DEFAULT 0.00,
  total_adjustments DECIMAL(12, 2) DEFAULT 0.00,
  balance DECIMAL(12, 2) GENERATED ALWAYS AS (total_charges - total_payments - total_adjustments) STORED,
  
  -- Account Status
  account_status VARCHAR(20) DEFAULT 'active' CHECK (account_status IN ('active', 'suspended', 'closed', 'collections')),
  credit_limit DECIMAL(10, 2) DEFAULT 0.00,
  
  -- Insurance
  primary_insurance_id INTEGER,
  secondary_insurance_id INTEGER,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Invoices (Bills)
CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number VARCHAR(50) UNIQUE NOT NULL, -- Auto: INV-YYYYMMDD-XXXX
  patient_id UUID NOT NULL REFERENCES patients(id),
  billing_account_id UUID REFERENCES billing_accounts(id),
  encounter_id UUID REFERENCES encounters(id),
  
  -- Invoice Details
  invoice_date DATE DEFAULT CURRENT_DATE,
  due_date DATE,
  invoice_type VARCHAR(30) DEFAULT 'service' CHECK (invoice_type IN ('service', 'pharmacy', 'lab', 'radiology', 'admission', 'emergency')),
  
  -- Financial
  subtotal DECIMAL(10, 2) DEFAULT 0.00,
  tax_amount DECIMAL(10, 2) DEFAULT 0.00,
  discount_amount DECIMAL(10, 2) DEFAULT 0.00,
  total_amount DECIMAL(10, 2) DEFAULT 0.00,
  amount_paid DECIMAL(10, 2) DEFAULT 0.00,
  balance_due DECIMAL(10, 2) GENERATED ALWAYS AS (total_amount - amount_paid) STORED,
  
  -- Status
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'issued', 'partially-paid', 'paid', 'overdue', 'cancelled', 'refunded')),
  payment_status VARCHAR(20) DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'partially-paid', 'paid', 'refunded')),
  
  -- Payment Terms
  payment_method VARCHAR(30), -- cash, mpesa, card, insurance, corporate
  payment_terms VARCHAR(50), -- immediate, 30-days, installment
  
  -- Insurance/Corporate
  insurance_company VARCHAR(200),
  insurance_claim_number VARCHAR(100),
  corporate_scheme VARCHAR(200),
  
  -- Notes
  notes TEXT,
  internal_notes TEXT,
  
  -- Personnel
  billed_by UUID REFERENCES staff(id),
  approved_by UUID REFERENCES staff(id),
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Invoice Line Items
CREATE TABLE IF NOT EXISTS invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  
  -- Item Details
  item_type VARCHAR(30) NOT NULL CHECK (item_type IN ('consultation', 'procedure', 'lab-test', 'drug', 'radiology', 'bed-charge', 'equipment', 'service', 'other')),
  item_code VARCHAR(50),
  item_description TEXT NOT NULL,
  
  -- Reference IDs (link to source)
  reference_id UUID, -- Could be lab_order_id, prescription_id, etc.
  reference_type VARCHAR(50),
  
  -- Pricing
  quantity DECIMAL(10, 2) DEFAULT 1,
  unit_price DECIMAL(10, 2) NOT NULL,
  discount_percentage DECIMAL(5, 2) DEFAULT 0.00,
  discount_amount DECIMAL(10, 2) DEFAULT 0.00,
  tax_percentage DECIMAL(5, 2) DEFAULT 0.00,
  tax_amount DECIMAL(10, 2) DEFAULT 0.00,
  subtotal DECIMAL(10, 2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  total_amount DECIMAL(10, 2) GENERATED ALWAYS AS (quantity * unit_price - discount_amount + tax_amount) STORED,
  
  -- Insurance Coverage
  insurance_covered BOOLEAN DEFAULT false,
  insurance_percentage DECIMAL(5, 2) DEFAULT 0.00,
  insurance_amount DECIMAL(10, 2) DEFAULT 0.00,
  patient_responsibility DECIMAL(10, 2),
  
  -- Service Details
  service_date DATE,
  provider_id UUID REFERENCES staff(id),
  department_id UUID REFERENCES departments(id),
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Payments (Receipt of payments)
CREATE TABLE IF NOT EXISTS billing_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_number VARCHAR(50) UNIQUE NOT NULL, -- Auto: PAY-YYYYMMDD-XXXX
  invoice_id UUID REFERENCES invoices(id),
  patient_id UUID NOT NULL REFERENCES patients(id),
  billing_account_id UUID REFERENCES billing_accounts(id),
  
  -- Payment Details
  payment_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  payment_method VARCHAR(30) NOT NULL CHECK (payment_method IN ('cash', 'mpesa', 'card', 'bank-transfer', 'cheque', 'insurance', 'corporate', 'waiver')),
  
  -- Amount
  amount DECIMAL(10, 2) NOT NULL CHECK (amount > 0),
  currency VARCHAR(3) DEFAULT 'KSh',
  
  -- Payment Method Specific
  mpesa_transaction_id VARCHAR(100),
  card_last_4 VARCHAR(4),
  cheque_number VARCHAR(50),
  bank_reference VARCHAR(100),
  
  -- Status
  status VARCHAR(20) DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed', 'refunded', 'cancelled')),
  
  -- Personnel
  received_by UUID REFERENCES staff(id),
  verified_by UUID REFERENCES staff(id),
  
  -- Notes
  notes TEXT,
  receipt_printed BOOLEAN DEFAULT false,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. Payment Allocations (How payment is split across invoices)
CREATE TABLE IF NOT EXISTS payment_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL REFERENCES billing_payments(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES invoices(id),
  
  allocated_amount DECIMAL(10, 2) NOT NULL CHECK (allocated_amount > 0),
  allocation_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. Insurance Claims
CREATE TABLE IF NOT EXISTS insurance_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_number VARCHAR(50) UNIQUE NOT NULL, -- Auto: CLM-YYYYMMDD-XXXX
  invoice_id UUID REFERENCES invoices(id),
  patient_id UUID NOT NULL REFERENCES patients(id),
  
  -- Insurance Details
  insurance_company VARCHAR(200) NOT NULL,
  policy_number VARCHAR(100),
  member_number VARCHAR(100),
  
  -- Claim Details
  claim_date DATE DEFAULT CURRENT_DATE,
  service_date DATE,
  diagnosis_code VARCHAR(20),
  diagnosis_description TEXT,
  
  -- Financial
  claim_amount DECIMAL(10, 2) NOT NULL,
  approved_amount DECIMAL(10, 2),
  paid_amount DECIMAL(10, 2) DEFAULT 0.00,
  rejected_amount DECIMAL(10, 2) DEFAULT 0.00,
  
  -- Status
  status VARCHAR(30) DEFAULT 'pending' CHECK (status IN ('draft', 'submitted', 'pending', 'under-review', 'approved', 'partially-approved', 'rejected', 'paid')),
  
  -- Dates
  submission_date DATE,
  approval_date DATE,
  payment_date DATE,
  
  -- Rejection
  rejection_reason TEXT,
  rejection_code VARCHAR(20),
  
  -- Documents
  supporting_documents JSONB, -- [{name: "...", url: "..."}]
  
  -- Personnel
  submitted_by UUID REFERENCES staff(id),
  
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 7. Price List (Service catalog with pricing)
CREATE TABLE IF NOT EXISTS price_list (
  id SERIAL PRIMARY KEY,
  item_code VARCHAR(50) UNIQUE NOT NULL,
  item_name VARCHAR(200) NOT NULL,
  item_type VARCHAR(30) NOT NULL,
  
  -- Pricing
  standard_price DECIMAL(10, 2) NOT NULL,
  insurance_price DECIMAL(10, 2),
  cash_price DECIMAL(10, 2),
  
  -- Categorization
  category VARCHAR(100),
  department_id UUID REFERENCES departments(id),
  
  -- Tax
  taxable BOOLEAN DEFAULT true,
  tax_percentage DECIMAL(5, 2) DEFAULT 16.00,
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  effective_date DATE DEFAULT CURRENT_DATE,
  expiry_date DATE,
  
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- AUTO-NUMBERING SEQUENCES & FUNCTIONS
-- ============================================

-- Billing Account Number
CREATE SEQUENCE IF NOT EXISTS billing_account_seq START 1;

CREATE OR REPLACE FUNCTION generate_billing_account_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.account_number IS NULL OR NEW.account_number = '' THEN
    NEW.account_number := 'ACC-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-' || LPAD(nextval('billing_account_seq')::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_billing_account_number
BEFORE INSERT ON billing_accounts
FOR EACH ROW EXECUTE FUNCTION generate_billing_account_number();

-- Invoice Number
CREATE SEQUENCE IF NOT EXISTS invoice_number_seq START 1;

CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.invoice_number IS NULL OR NEW.invoice_number = '' THEN
    NEW.invoice_number := 'INV-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-' || LPAD(nextval('invoice_number_seq')::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_invoice_number
BEFORE INSERT ON invoices
FOR EACH ROW EXECUTE FUNCTION generate_invoice_number();

-- Payment Number
CREATE SEQUENCE IF NOT EXISTS payment_number_seq START 1;

CREATE OR REPLACE FUNCTION generate_payment_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.payment_number IS NULL OR NEW.payment_number = '' THEN
    NEW.payment_number := 'PAY-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-' || LPAD(nextval('payment_number_seq')::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_payment_number
BEFORE INSERT ON billing_payments
FOR EACH ROW EXECUTE FUNCTION generate_payment_number();

-- Claim Number
CREATE SEQUENCE IF NOT EXISTS claim_number_seq START 1;

CREATE OR REPLACE FUNCTION generate_claim_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.claim_number IS NULL OR NEW.claim_number = '' THEN
    NEW.claim_number := 'CLM-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-' || LPAD(nextval('claim_number_seq')::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_claim_number
BEFORE INSERT ON insurance_claims
FOR EACH ROW EXECUTE FUNCTION generate_claim_number();

-- ============================================
-- BUSINESS LOGIC TRIGGERS
-- ============================================

-- Update invoice totals from items
CREATE OR REPLACE FUNCTION update_invoice_totals()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE invoices
  SET subtotal = (SELECT COALESCE(SUM(subtotal), 0) FROM invoice_items WHERE invoice_id = NEW.invoice_id),
      tax_amount = (SELECT COALESCE(SUM(tax_amount), 0) FROM invoice_items WHERE invoice_id = NEW.invoice_id),
      discount_amount = (SELECT COALESCE(SUM(discount_amount), 0) FROM invoice_items WHERE invoice_id = NEW.invoice_id),
      total_amount = (SELECT COALESCE(SUM(total_amount), 0) FROM invoice_items WHERE invoice_id = NEW.invoice_id)
  WHERE id = NEW.invoice_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_invoice_amount
AFTER INSERT OR UPDATE ON invoice_items
FOR EACH ROW EXECUTE FUNCTION update_invoice_totals();

-- Update invoice payment status
CREATE OR REPLACE FUNCTION update_invoice_payment_status()
RETURNS TRIGGER AS $$
DECLARE
  v_total DECIMAL(10, 2);
  v_paid DECIMAL(10, 2);
BEGIN
  SELECT total_amount INTO v_total FROM invoices WHERE id = NEW.invoice_id;
  SELECT COALESCE(SUM(allocated_amount), 0) INTO v_paid FROM payment_allocations WHERE invoice_id = NEW.invoice_id;
  
  UPDATE invoices
  SET amount_paid = v_paid,
      payment_status = CASE
        WHEN v_paid = 0 THEN 'unpaid'
        WHEN v_paid >= v_total THEN 'paid'
        ELSE 'partially-paid'
      END,
      status = CASE
        WHEN v_paid >= v_total THEN 'paid'
        WHEN v_paid > 0 THEN 'partially-paid'
        WHEN CURRENT_DATE > due_date THEN 'overdue'
        ELSE status
      END
  WHERE id = NEW.invoice_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_payment_status
AFTER INSERT ON payment_allocations
FOR EACH ROW EXECUTE FUNCTION update_invoice_payment_status();

-- Update billing account balance
CREATE OR REPLACE FUNCTION update_billing_account_balance()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_TABLE_NAME = 'invoices' THEN
    UPDATE billing_accounts
    SET total_charges = (SELECT COALESCE(SUM(total_amount), 0) FROM invoices WHERE billing_account_id = NEW.billing_account_id)
    WHERE id = NEW.billing_account_id;
  ELSIF TG_TABLE_NAME = 'billing_payments' THEN
    UPDATE billing_accounts
    SET total_payments = (SELECT COALESCE(SUM(amount), 0) FROM billing_payments WHERE billing_account_id = NEW.billing_account_id AND status = 'completed')
    WHERE id = NEW.billing_account_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_account_charges
AFTER INSERT OR UPDATE ON invoices
FOR EACH ROW
WHEN (NEW.billing_account_id IS NOT NULL)
EXECUTE FUNCTION update_billing_account_balance();

CREATE TRIGGER update_account_payments
AFTER INSERT OR UPDATE ON billing_payments
FOR EACH ROW
WHEN (NEW.billing_account_id IS NOT NULL)
EXECUTE FUNCTION update_billing_account_balance();

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_billing_accounts_patient ON billing_accounts(patient_id);
CREATE INDEX IF NOT EXISTS idx_billing_accounts_status ON billing_accounts(account_status);

CREATE INDEX IF NOT EXISTS idx_invoices_patient ON invoices(patient_id);
CREATE INDEX IF NOT EXISTS idx_invoices_account ON invoices(billing_account_id);
CREATE INDEX IF NOT EXISTS idx_invoices_encounter ON invoices(encounter_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_payment_status ON invoices(payment_status);
CREATE INDEX IF NOT EXISTS idx_invoices_date ON invoices(invoice_date);
CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON invoices(due_date);

CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_type ON invoice_items(item_type);
CREATE INDEX IF NOT EXISTS idx_invoice_items_provider ON invoice_items(provider_id);

CREATE INDEX IF NOT EXISTS idx_payments_patient ON billing_payments(patient_id);
CREATE INDEX IF NOT EXISTS idx_payments_invoice ON billing_payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_account ON billing_payments(billing_account_id);
CREATE INDEX IF NOT EXISTS idx_payments_date ON billing_payments(payment_date);
CREATE INDEX IF NOT EXISTS idx_payments_method ON billing_payments(payment_method);
CREATE INDEX IF NOT EXISTS idx_payments_status ON billing_payments(status);

CREATE INDEX IF NOT EXISTS idx_payment_allocations_payment ON payment_allocations(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_allocations_invoice ON payment_allocations(invoice_id);

CREATE INDEX IF NOT EXISTS idx_claims_patient ON insurance_claims(patient_id);
CREATE INDEX IF NOT EXISTS idx_claims_invoice ON insurance_claims(invoice_id);
CREATE INDEX IF NOT EXISTS idx_claims_status ON insurance_claims(status);
CREATE INDEX IF NOT EXISTS idx_claims_company ON insurance_claims(insurance_company);

CREATE INDEX IF NOT EXISTS idx_price_list_code ON price_list(item_code);
CREATE INDEX IF NOT EXISTS idx_price_list_type ON price_list(item_type);
CREATE INDEX IF NOT EXISTS idx_price_list_active ON price_list(is_active);

COMMENT ON TABLE billing_accounts IS 'Patient financial accounts with running balances';
COMMENT ON TABLE invoices IS 'Itemized bills for services rendered';
COMMENT ON TABLE invoice_items IS 'Individual line items on invoices';
COMMENT ON TABLE billing_payments IS 'Payments received from patients/insurance';
COMMENT ON TABLE payment_allocations IS 'How payments are applied to specific invoices';
COMMENT ON TABLE insurance_claims IS 'Insurance claim submissions and tracking';
COMMENT ON TABLE price_list IS 'Master price catalog for all billable services';

