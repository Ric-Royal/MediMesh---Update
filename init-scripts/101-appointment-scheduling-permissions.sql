\c medimesh;

-- Scheduling helpers are read-only application operations. The blanket
-- function revocation in 99-least-privilege-grants.sql intentionally removes
-- implicit PUBLIC execution; restore only the helpers used by the appointment
-- API to the non-owner application role.
REVOKE ALL ON FUNCTION is_time_slot_available(UUID, DATE, TIME, INTEGER)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION get_available_time_slots(UUID, DATE)
  FROM PUBLIC;

GRANT EXECUTE ON FUNCTION is_time_slot_available(UUID, DATE, TIME, INTEGER)
  TO medimesh_user;
GRANT EXECUTE ON FUNCTION get_available_time_slots(UUID, DATE)
  TO medimesh_user;
