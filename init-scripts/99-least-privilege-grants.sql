\c medimesh;

SELECT 'CREATE ROLE medimesh_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION'
WHERE NOT EXISTS (
  SELECT FROM pg_catalog.pg_roles WHERE rolname = 'medimesh_owner'
)\gexec

ALTER ROLE medimesh_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
REASSIGN OWNED BY medimesh_user TO medimesh_owner;
DO $$
BEGIN
  IF pg_has_role('medimesh_user', 'medimesh_owner', 'MEMBER') THEN
    EXECUTE 'REVOKE medimesh_owner FROM medimesh_user';
  END IF;
END;
$$;

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM medimesh_user;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM medimesh_user;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM medimesh_user;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM medimesh_user;

DO $$
DECLARE
  relation_name TEXT;
BEGIN
  FOR relation_name IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename NOT IN (
        'patients',
        'medical_records',
        'file_attachments',
        'radiology_reports',
        'audit_events',
        'clinical_change_history',
        'setting_changes'
      )
  LOOP
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO medimesh_user',
      relation_name
    );
  END LOOP;
END;
$$;

GRANT SELECT, INSERT, UPDATE ON
  patients,
  medical_records,
  file_attachments,
  radiology_reports
TO medimesh_user;

GRANT SELECT, INSERT ON
  audit_events,
  clinical_change_history,
  setting_changes
TO medimesh_user;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO medimesh_user;
