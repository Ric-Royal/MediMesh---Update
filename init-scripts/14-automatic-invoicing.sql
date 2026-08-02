-- =====================================================
-- 14. AUTOMATIC INVOICING SYSTEM
-- =====================================================
-- Purpose: Real-time invoice generation as services are delivered
-- Author: MediMesh Development Team
-- Date: December 1, 2025

\c medimesh;

-- =====================================================
-- INVOICE LINE ITEMS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS invoice_line_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,

    -- Service Details
    service_type VARCHAR(50) NOT NULL, -- 'consultation', 'lab', 'radiology', 'pharmacy', 'ward', 'procedure'
    service_id TEXT, -- Links to consultation_records, lab_orders, radiology_orders, prescriptions (TEXT to handle both UUID and integer PKs)
    service_code VARCHAR(100),
    service_name VARCHAR(255) NOT NULL,
    service_description TEXT,

    -- Pricing
    quantity INTEGER DEFAULT 1,
    unit_price DECIMAL(10,2) NOT NULL,
    discount_percentage DECIMAL(5,2) DEFAULT 0,
    discount_amount DECIMAL(10,2) DEFAULT 0,
    tax_percentage DECIMAL(5,2) DEFAULT 0,
    tax_amount DECIMAL(10,2) DEFAULT 0,
    subtotal DECIMAL(10,2) NOT NULL,
    total DECIMAL(10,2) NOT NULL,

    -- Provider Info
    provider_id UUID REFERENCES staff(id),
    provider_name VARCHAR(255),

    -- Status
    status VARCHAR(50) DEFAULT 'pending', -- pending, completed, cancelled
    billed_at TIMESTAMP DEFAULT NOW(),

    -- Metadata
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- =====================================================
-- ENHANCE INVOICES TABLE
-- =====================================================
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS auto_generated BOOLEAN DEFAULT TRUE;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS last_updated TIMESTAMP DEFAULT NOW();
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS consultation_fee DECIMAL(10,2) DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS lab_charges DECIMAL(10,2) DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS radiology_charges DECIMAL(10,2) DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS pharmacy_charges DECIMAL(10,2) DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS ward_charges DECIMAL(10,2) DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS procedure_charges DECIMAL(10,2) DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS other_charges DECIMAL(10,2) DEFAULT 0;

-- =====================================================
-- FUNCTION: AUTO-CREATE INVOICE FOR ENCOUNTER
-- =====================================================
CREATE OR REPLACE FUNCTION auto_create_invoice_for_encounter(p_encounter_id UUID)
RETURNS UUID AS $$
DECLARE
    v_invoice_id UUID;
    v_patient_id UUID;
    v_encounter_type VARCHAR(50);
BEGIN
    -- Get encounter details
    SELECT patient_id, encounter_type INTO v_patient_id, v_encounter_type
    FROM encounters WHERE id = p_encounter_id;

    -- Check if invoice already exists
    SELECT id INTO v_invoice_id FROM invoices WHERE encounter_id = p_encounter_id;

    -- If no invoice exists, create one
    IF v_invoice_id IS NULL THEN
        INSERT INTO invoices (
            patient_id, encounter_id, invoice_date, status,
            subtotal, tax_amount, discount_amount, total_amount, auto_generated
        ) VALUES (
            v_patient_id, p_encounter_id, NOW(), 'draft',
            0, 0, 0, 0, TRUE
        ) RETURNING id INTO v_invoice_id;

        RAISE NOTICE 'Auto-created invoice % for encounter %', v_invoice_id, p_encounter_id;
    END IF;

    RETURN v_invoice_id;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- FUNCTION: ADD CONSULTATION CHARGE TO INVOICE
-- =====================================================
CREATE OR REPLACE FUNCTION add_consultation_charge()
RETURNS TRIGGER AS $$
DECLARE
    v_invoice_id UUID;
    v_consultation_fee DECIMAL(10,2) := 50.00; -- Default consultation fee
    v_doctor_name VARCHAR(255);
BEGIN
    -- Get invoice (create if doesn't exist)
    v_invoice_id := auto_create_invoice_for_encounter(NEW.encounter_id);

    -- Get consultation price from service_pricing
    SELECT base_price INTO v_consultation_fee FROM service_pricing WHERE service_code = 'CONSULT-GEN' LIMIT 1;
    IF v_consultation_fee IS NULL THEN
        v_consultation_fee := 50.00;
    END IF;

    -- Get doctor name
    SELECT first_name || ' ' || last_name INTO v_doctor_name
    FROM staff WHERE id = NEW.doctor_id;

    -- Add consultation charge
    INSERT INTO invoice_line_items (
        invoice_id, service_type, service_id, service_code, service_name,
        service_description, quantity, unit_price, subtotal, total,
        provider_id, provider_name, status, billed_at
    ) VALUES (
        v_invoice_id, 'consultation', NEW.id, 'CONSULT', 'Medical Consultation',
        'Consultation with ' || COALESCE(v_doctor_name, 'Doctor'), 1, v_consultation_fee,
        v_consultation_fee, v_consultation_fee,
        NEW.doctor_id, v_doctor_name, 'completed', NOW()
    );

    -- Update invoice totals
    UPDATE invoices SET
        consultation_fee = consultation_fee + v_consultation_fee,
        subtotal = subtotal + v_consultation_fee,
        total_amount = total_amount + v_consultation_fee,
        last_updated = NOW()
    WHERE id = v_invoice_id;

    RAISE NOTICE 'Added consultation charge $% to invoice %', v_consultation_fee, v_invoice_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- FUNCTION: ADD LAB CHARGES TO INVOICE
-- =====================================================
CREATE OR REPLACE FUNCTION add_lab_charges()
RETURNS TRIGGER AS $$
DECLARE
    v_invoice_id UUID;
    v_total_charges DECIMAL(10,2) := 0;
BEGIN
    -- Only add charges when order is completed
    IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
        -- Get invoice (create if doesn't exist)
        v_invoice_id := auto_create_invoice_for_encounter(NEW.encounter_id);

        -- Calculate total from lab order items
        SELECT COALESCE(SUM(price), 0) INTO v_total_charges
        FROM lab_order_items
        WHERE lab_order_id = NEW.id;

        -- Add lab charge
        INSERT INTO invoice_line_items (
            invoice_id, service_type, service_id, service_code, service_name,
            service_description, quantity, unit_price, subtotal, total,
            status, billed_at
        ) VALUES (
            v_invoice_id, 'lab', NEW.id, NEW.order_number, 'Laboratory Tests',
            'Lab Order: ' || NEW.order_number, 1, v_total_charges,
            v_total_charges, v_total_charges,
            'completed', NOW()
        );

        -- Update invoice totals
        UPDATE invoices SET
            lab_charges = lab_charges + v_total_charges,
            subtotal = subtotal + v_total_charges,
            total_amount = total_amount + v_total_charges,
            last_updated = NOW()
        WHERE id = v_invoice_id;

        RAISE NOTICE 'Added lab charges $% to invoice %', v_total_charges, v_invoice_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- FUNCTION: ADD RADIOLOGY CHARGES TO INVOICE
-- =====================================================
CREATE OR REPLACE FUNCTION add_radiology_charges()
RETURNS TRIGGER AS $$
DECLARE
    v_invoice_id UUID;
    v_total_charges DECIMAL(10,2) := 0;
BEGIN
    -- Only add charges when order is completed
    IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
        -- Get invoice (create if doesn't exist)
        v_invoice_id := auto_create_invoice_for_encounter(NEW.encounter_id);

        -- Calculate total from radiology order items
        SELECT COALESCE(SUM(price), 0) INTO v_total_charges
        FROM radiology_order_items
        WHERE radiology_order_id = NEW.id;

        -- Add radiology charge
        INSERT INTO invoice_line_items (
            invoice_id, service_type, service_id, service_code, service_name,
            service_description, quantity, unit_price, subtotal, total,
            status, billed_at
        ) VALUES (
            v_invoice_id, 'radiology', NEW.id, NEW.order_number, 'Radiology/Imaging',
            'Radiology Order: ' || NEW.order_number, 1, v_total_charges,
            v_total_charges, v_total_charges,
            'completed', NOW()
        );

        -- Update invoice totals
        UPDATE invoices SET
            radiology_charges = radiology_charges + v_total_charges,
            subtotal = subtotal + v_total_charges,
            total_amount = total_amount + v_total_charges,
            last_updated = NOW()
        WHERE id = v_invoice_id;

        RAISE NOTICE 'Added radiology charges $% to invoice %', v_total_charges, v_invoice_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- FUNCTION: ADD PHARMACY CHARGES TO INVOICE
-- =====================================================
CREATE OR REPLACE FUNCTION add_pharmacy_charges()
RETURNS TRIGGER AS $$
DECLARE
    v_invoice_id UUID;
    v_total_charges DECIMAL(10,2) := 0;
BEGIN
    -- Only add charges when prescription is fully dispensed
    IF NEW.status = 'fully-dispensed' AND (OLD.status IS NULL OR OLD.status != 'fully-dispensed') THEN
        -- Get invoice (create if doesn't exist)
        v_invoice_id := auto_create_invoice_for_encounter(NEW.encounter_id);

        -- Calculate total from prescription items
        SELECT COALESCE(SUM(total_price), 0) INTO v_total_charges
        FROM prescription_items
        WHERE prescription_id = NEW.id;

        -- Add pharmacy charge
        INSERT INTO invoice_line_items (
            invoice_id, service_type, service_id, service_code, service_name,
            service_description, quantity, unit_price, subtotal, total,
            status, billed_at
        ) VALUES (
            v_invoice_id, 'pharmacy', NEW.id::TEXT, NEW.prescription_number, 'Pharmacy/Medications',
            'Prescription: ' || NEW.prescription_number, 1, v_total_charges,
            v_total_charges, v_total_charges,
            'completed', NOW()
        );

        -- Update invoice totals
        UPDATE invoices SET
            pharmacy_charges = pharmacy_charges + v_total_charges,
            subtotal = subtotal + v_total_charges,
            total_amount = total_amount + v_total_charges,
            last_updated = NOW()
        WHERE id = v_invoice_id;

        RAISE NOTICE 'Added pharmacy charges $% to invoice %', v_total_charges, v_invoice_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- CREATE TRIGGERS FOR AUTOMATIC INVOICING
-- =====================================================

-- Trigger: Add consultation charge when consultation is created
DROP TRIGGER IF EXISTS trg_auto_invoice_consultation ON consultation_records;
CREATE TRIGGER trg_auto_invoice_consultation
    AFTER INSERT ON consultation_records
    FOR EACH ROW
    EXECUTE FUNCTION add_consultation_charge();

-- Trigger: Add lab charges when lab order is completed
DROP TRIGGER IF EXISTS trg_auto_invoice_lab ON lab_orders;
CREATE TRIGGER trg_auto_invoice_lab
    AFTER UPDATE OF status ON lab_orders
    FOR EACH ROW
    EXECUTE FUNCTION add_lab_charges();

-- Trigger: Add radiology charges when radiology order is completed
DROP TRIGGER IF EXISTS trg_auto_invoice_radiology ON radiology_orders;
CREATE TRIGGER trg_auto_invoice_radiology
    AFTER UPDATE OF status ON radiology_orders
    FOR EACH ROW
    EXECUTE FUNCTION add_radiology_charges();

-- Trigger: Add pharmacy charges when prescription is dispensed
DROP TRIGGER IF EXISTS trg_auto_invoice_pharmacy ON prescriptions;
CREATE TRIGGER trg_auto_invoice_pharmacy
    AFTER UPDATE OF status ON prescriptions
    FOR EACH ROW
    EXECUTE FUNCTION add_pharmacy_charges();

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_invoice_line_items_invoice ON invoice_line_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_line_items_service_type ON invoice_line_items(service_type);
CREATE INDEX IF NOT EXISTS idx_invoice_line_items_service_id ON invoice_line_items(service_id);
CREATE INDEX IF NOT EXISTS idx_invoice_line_items_status ON invoice_line_items(status);

CREATE INDEX IF NOT EXISTS idx_invoices_encounter ON invoices(encounter_id);
CREATE INDEX IF NOT EXISTS idx_invoices_patient ON invoices(patient_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_date ON invoices(invoice_date);

-- =====================================================
-- GRANT PERMISSIONS
-- =====================================================
GRANT ALL PRIVILEGES ON TABLE invoice_line_items TO medimesh_user;

-- =====================================================
-- SEED DATA: SERVICE PRICING
-- =====================================================
CREATE TABLE IF NOT EXISTS service_pricing (
    id SERIAL PRIMARY KEY,
    service_code VARCHAR(50) UNIQUE NOT NULL,
    service_name VARCHAR(255) NOT NULL,
    service_category VARCHAR(100), -- consultation, procedure, ward, emergency
    base_price DECIMAL(10,2) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO service_pricing (service_code, service_name, service_category, base_price, description) VALUES
('CONSULT-GEN', 'General Consultation', 'consultation', 50.00, 'Standard outpatient consultation'),
('CONSULT-SPEC', 'Specialist Consultation', 'consultation', 100.00, 'Consultation with specialist'),
('CONSULT-EMERG', 'Emergency Consultation', 'consultation', 150.00, 'Emergency department consultation'),
('CONSULT-FOLLOW', 'Follow-up Consultation', 'consultation', 30.00, 'Follow-up visit'),
('WARD-GENERAL', 'General Ward (per day)', 'ward', 100.00, 'General ward accommodation per day'),
('WARD-PRIVATE', 'Private Ward (per day)', 'ward', 300.00, 'Private room accommodation per day'),
('WARD-ICU', 'ICU (per day)', 'ward', 500.00, 'Intensive care unit per day'),
('NURSING-CARE', 'Nursing Care (per day)', 'ward', 50.00, 'Daily nursing care'),
('PROC-MINOR', 'Minor Procedure', 'procedure', 200.00, 'Minor surgical procedure'),
('PROC-MAJOR', 'Major Procedure', 'procedure', 1000.00, 'Major surgical procedure'),
('EMERG-TRIAGE', 'Emergency Triage', 'emergency', 25.00, 'Emergency triage assessment')
ON CONFLICT (service_code) DO NOTHING;

GRANT ALL PRIVILEGES ON TABLE service_pricing TO medimesh_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO medimesh_user;

-- =====================================================
-- COMPLETION MESSAGE
-- =====================================================
DO $$
BEGIN
    RAISE NOTICE '✅ Automatic Invoicing System Complete';
    RAISE NOTICE '   - invoice_line_items table created';
    RAISE NOTICE '   - invoices table enhanced with service breakdowns';
    RAISE NOTICE '   - Automatic invoicing triggers installed';
    RAISE NOTICE '   - Service pricing catalog with % items', (SELECT COUNT(*) FROM service_pricing);
    RAISE NOTICE '   - Charges will be added automatically as services are delivered';
END $$;
