\c medimesh;

-- Automatic billing runs from triggers under a dedicated, non-login role.
-- The application role cannot execute these routines directly.
SELECT 'CREATE ROLE medimesh_billing_engine NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION'
WHERE NOT EXISTS (
  SELECT FROM pg_catalog.pg_roles WHERE rolname = 'medimesh_billing_engine'
)\gexec

ALTER ROLE medimesh_billing_engine
  NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;

GRANT USAGE ON SCHEMA public TO medimesh_billing_engine;
GRANT SELECT ON
  encounters,
  staff,
  service_pricing,
  lab_order_items,
  radiology_order_items,
  prescription_items
TO medimesh_billing_engine;
GRANT SELECT, INSERT, UPDATE ON invoices TO medimesh_billing_engine;
GRANT INSERT ON invoice_line_items TO medimesh_billing_engine;
GRANT USAGE, SELECT ON SEQUENCE invoice_number_seq TO medimesh_billing_engine;

ALTER FUNCTION auto_create_invoice_for_encounter(UUID)
  OWNER TO medimesh_billing_engine;
ALTER FUNCTION add_consultation_charge()
  OWNER TO medimesh_billing_engine;
ALTER FUNCTION add_lab_charges()
  OWNER TO medimesh_billing_engine;
ALTER FUNCTION add_radiology_charges()
  OWNER TO medimesh_billing_engine;
ALTER FUNCTION add_pharmacy_charges()
  OWNER TO medimesh_billing_engine;

ALTER FUNCTION auto_create_invoice_for_encounter(UUID)
  SECURITY DEFINER
  SET search_path = pg_catalog, public;
ALTER FUNCTION add_consultation_charge()
  SECURITY DEFINER
  SET search_path = pg_catalog, public;
ALTER FUNCTION add_lab_charges()
  SECURITY DEFINER
  SET search_path = pg_catalog, public;
ALTER FUNCTION add_radiology_charges()
  SECURITY DEFINER
  SET search_path = pg_catalog, public;
ALTER FUNCTION add_pharmacy_charges()
  SECURITY DEFINER
  SET search_path = pg_catalog, public;

REVOKE ALL ON FUNCTION auto_create_invoice_for_encounter(UUID)
  FROM PUBLIC, medimesh_user;
REVOKE ALL ON FUNCTION add_consultation_charge()
  FROM PUBLIC, medimesh_user;
REVOKE ALL ON FUNCTION add_lab_charges()
  FROM PUBLIC, medimesh_user;
REVOKE ALL ON FUNCTION add_radiology_charges()
  FROM PUBLIC, medimesh_user;
REVOKE ALL ON FUNCTION add_pharmacy_charges()
  FROM PUBLIC, medimesh_user;
