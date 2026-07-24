-- ============================================
-- MediMesh: Appointments & Scheduling Module
-- ============================================
-- Description: Comprehensive appointment booking and scheduling system
-- Features: Patient appointments, doctor availability, calendar management
-- Version: 1.0
-- Date: December 1, 2025

\c medimesh;

-- ============================================
-- 1. APPOINTMENTS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    appointment_number VARCHAR(50) UNIQUE NOT NULL,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,

    -- Type and timing
    appointment_type VARCHAR(50) NOT NULL,
    scheduled_date DATE NOT NULL,
    scheduled_time TIME NOT NULL,
    duration_minutes INTEGER DEFAULT 30,

    -- Status tracking
    status VARCHAR(20) DEFAULT 'scheduled',

    -- Clinical context
    department_id UUID REFERENCES departments(id),
    clinic_id UUID REFERENCES clinics(id),
    doctor_id UUID REFERENCES staff(id),
    location_id UUID REFERENCES locations(id),

    -- Clinical information
    reason_for_visit TEXT,
    notes TEXT,
    cancellation_reason TEXT,
    rescheduled_from UUID REFERENCES appointments(id),

    -- Administrative
    payment_type VARCHAR(20) DEFAULT 'self-pay',
    corporate_scheme VARCHAR(200),

    -- Reminders and confirmations
    reminder_sent BOOLEAN DEFAULT FALSE,
    reminder_sent_at TIMESTAMP,
    confirmed_at TIMESTAMP,
    confirmed_by UUID REFERENCES staff(id),

    -- Check-in tracking
    checked_in_at TIMESTAMP,
    checked_in_by UUID REFERENCES staff(id),

    -- Completion
    completed_at TIMESTAMP,
    encounter_id UUID REFERENCES encounters(id),

    -- Audit trail
    created_by UUID REFERENCES staff(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    updated_by UUID REFERENCES staff(id),

    -- Constraints
    CHECK (appointment_type IN ('consultation', 'follow-up', 'procedure', 'checkup',
                                'vaccination', 'screening', 'therapy', 'diagnostic')),
    CHECK (status IN ('scheduled', 'confirmed', 'checked-in', 'in-progress',
                      'completed', 'cancelled', 'no-show', 'rescheduled')),
    CHECK (payment_type IN ('self-pay', 'corporate', 'insurance', 'government')),
    CHECK (duration_minutes > 0 AND duration_minutes <= 480)
);

-- Indexes for appointments
CREATE INDEX idx_appointments_number ON appointments(appointment_number);
CREATE INDEX idx_appointments_patient ON appointments(patient_id);
CREATE INDEX idx_appointments_doctor ON appointments(doctor_id);
CREATE INDEX idx_appointments_clinic ON appointments(clinic_id);
CREATE INDEX idx_appointments_department ON appointments(department_id);
CREATE INDEX idx_appointments_date ON appointments(scheduled_date);
CREATE INDEX idx_appointments_status ON appointments(status);
CREATE INDEX idx_appointments_datetime ON appointments(scheduled_date, scheduled_time);
CREATE INDEX idx_appointments_created ON appointments(created_at DESC);

-- ============================================
-- 2. APPOINTMENT NUMBER AUTO-GENERATION
-- ============================================

-- Sequence for appointment numbers
CREATE SEQUENCE IF NOT EXISTS appointment_number_sequence START 1000;

-- Function to generate appointment number: APT-YYYYMMDD-XXXX
CREATE OR REPLACE FUNCTION generate_appointment_number()
RETURNS TRIGGER AS $$
DECLARE
    new_appointment_number TEXT;
    date_string TEXT;
    attempt INTEGER := 0;
    max_attempts INTEGER := 10;
BEGIN
    IF NEW.appointment_number IS NULL OR NEW.appointment_number = '' THEN
        date_string := TO_CHAR(NOW(), 'YYYYMMDD');

        LOOP
            attempt := attempt + 1;
            IF attempt > max_attempts THEN
                RAISE EXCEPTION 'Failed to generate unique appointment number after % attempts', max_attempts;
            END IF;

            new_appointment_number := 'APT-' || date_string || '-' ||
                                     LPAD(NEXTVAL('appointment_number_sequence')::TEXT, 4, '0');

            IF NOT EXISTS (SELECT 1 FROM appointments WHERE appointment_number = new_appointment_number) THEN
                NEW.appointment_number := new_appointment_number;
                EXIT;
            END IF;
        END LOOP;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for appointment number generation
DROP TRIGGER IF EXISTS set_appointment_number ON appointments;
CREATE TRIGGER set_appointment_number
    BEFORE INSERT ON appointments
    FOR EACH ROW
    EXECUTE FUNCTION generate_appointment_number();

-- ============================================
-- 3. DOCTOR AVAILABILITY / SCHEDULES
-- ============================================

CREATE TABLE IF NOT EXISTS doctor_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doctor_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,

    -- Schedule type
    schedule_type VARCHAR(20) DEFAULT 'regular',

    -- Day of week (0 = Sunday, 6 = Saturday)
    day_of_week INTEGER,

    -- Specific date (for one-time schedules or overrides)
    specific_date DATE,

    -- Time slots
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,

    -- Appointment settings
    slot_duration_minutes INTEGER DEFAULT 30,
    max_appointments_per_slot INTEGER DEFAULT 1,

    -- Location
    clinic_id UUID REFERENCES clinics(id),
    location_id UUID REFERENCES locations(id),

    -- Status
    is_available BOOLEAN DEFAULT TRUE,
    is_active BOOLEAN DEFAULT TRUE,

    -- Notes
    notes TEXT,
    unavailable_reason TEXT,

    -- Effective dates (for regular schedules)
    effective_from DATE,
    effective_until DATE,

    -- Audit
    created_by UUID REFERENCES staff(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),

    -- Constraints
    CHECK (schedule_type IN ('regular', 'one-time', 'override', 'leave')),
    CHECK (day_of_week IS NULL OR (day_of_week >= 0 AND day_of_week <= 6)),
    CHECK (start_time < end_time),
    CHECK (slot_duration_minutes > 0 AND slot_duration_minutes <= 240),
    CHECK (max_appointments_per_slot > 0),
    CHECK (
        (schedule_type = 'regular' AND day_of_week IS NOT NULL AND specific_date IS NULL) OR
        (schedule_type IN ('one-time', 'override', 'leave') AND specific_date IS NOT NULL)
    )
);

-- Indexes for doctor schedules
CREATE INDEX idx_doctor_schedules_doctor ON doctor_schedules(doctor_id);
CREATE INDEX idx_doctor_schedules_day ON doctor_schedules(day_of_week);
CREATE INDEX idx_doctor_schedules_date ON doctor_schedules(specific_date);
CREATE INDEX idx_doctor_schedules_clinic ON doctor_schedules(clinic_id);
CREATE INDEX idx_doctor_schedules_active ON doctor_schedules(is_active, is_available);

-- ============================================
-- 4. APPOINTMENT REMINDERS LOG
-- ============================================

CREATE TABLE IF NOT EXISTS appointment_reminders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    appointment_id UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,

    -- Reminder details
    reminder_type VARCHAR(20) NOT NULL,
    reminder_method VARCHAR(20) NOT NULL,

    -- Recipient
    recipient_phone VARCHAR(20),
    recipient_email VARCHAR(255),

    -- Status
    status VARCHAR(20) DEFAULT 'pending',
    sent_at TIMESTAMP,
    delivered_at TIMESTAMP,

    -- Content
    message_content TEXT,

    -- Response tracking
    response_received BOOLEAN DEFAULT FALSE,
    response_content TEXT,
    response_at TIMESTAMP,

    -- Error handling
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,

    created_at TIMESTAMP DEFAULT NOW(),

    CHECK (reminder_type IN ('confirmation', '24-hour', '1-hour', 'follow-up')),
    CHECK (reminder_method IN ('sms', 'email', 'push', 'call')),
    CHECK (status IN ('pending', 'sent', 'delivered', 'failed', 'cancelled'))
);

CREATE INDEX idx_appointment_reminders_appointment ON appointment_reminders(appointment_id);
CREATE INDEX idx_appointment_reminders_status ON appointment_reminders(status);
CREATE INDEX idx_appointment_reminders_sent ON appointment_reminders(sent_at);

-- ============================================
-- 5. APPOINTMENT CONFLICTS VIEW
-- ============================================

CREATE OR REPLACE VIEW appointment_conflicts AS
SELECT
    a1.id as appointment1_id,
    a1.appointment_number as appointment1_number,
    a2.id as appointment2_id,
    a2.appointment_number as appointment2_number,
    a1.doctor_id,
    a1.scheduled_date,
    a1.scheduled_time as start_time1,
    (a1.scheduled_time + (a1.duration_minutes || ' minutes')::INTERVAL) as end_time1,
    a2.scheduled_time as start_time2,
    (a2.scheduled_time + (a2.duration_minutes || ' minutes')::INTERVAL) as end_time2
FROM appointments a1
JOIN appointments a2 ON
    a1.doctor_id = a2.doctor_id AND
    a1.scheduled_date = a2.scheduled_date AND
    a1.id < a2.id AND
    a1.status NOT IN ('cancelled', 'no-show', 'rescheduled') AND
    a2.status NOT IN ('cancelled', 'no-show', 'rescheduled')
WHERE
    -- Check for time overlap
    a1.scheduled_time < (a2.scheduled_time + (a2.duration_minutes || ' minutes')::INTERVAL) AND
    (a1.scheduled_time + (a1.duration_minutes || ' minutes')::INTERVAL) > a2.scheduled_time;

-- ============================================
-- 6. APPOINTMENT STATISTICS VIEW
-- ============================================

CREATE OR REPLACE VIEW appointment_statistics AS
SELECT
    scheduled_date,
    doctor_id,
    clinic_id,
    COUNT(*) as total_appointments,
    COUNT(*) FILTER (WHERE status = 'scheduled') as scheduled_count,
    COUNT(*) FILTER (WHERE status = 'confirmed') as confirmed_count,
    COUNT(*) FILTER (WHERE status = 'completed') as completed_count,
    COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled_count,
    COUNT(*) FILTER (WHERE status = 'no-show') as no_show_count,
    ROUND(AVG(duration_minutes), 0) as avg_duration_minutes,
    MIN(scheduled_time) as first_appointment,
    MAX(scheduled_time) as last_appointment
FROM appointments
GROUP BY scheduled_date, doctor_id, clinic_id;

-- ============================================
-- 7. SAMPLE DATA
-- ============================================

-- Sample doctor schedules (using existing doctors from staff table)
INSERT INTO doctor_schedules (doctor_id, schedule_type, day_of_week, start_time, end_time, slot_duration_minutes, clinic_id, effective_from)
SELECT
    s.id,
    'regular',
    generate_series(1, 5) as day_of_week,  -- Monday to Friday
    '09:00'::TIME,
    '17:00'::TIME,
    30,
    (SELECT id FROM clinics LIMIT 1),
    CURRENT_DATE
FROM staff s
WHERE s.role = 'doctor'
LIMIT 3
ON CONFLICT DO NOTHING;

-- ============================================
-- 8. HELPER FUNCTIONS
-- ============================================

-- Function to check if a time slot is available
CREATE OR REPLACE FUNCTION is_time_slot_available(
    p_doctor_id UUID,
    p_date DATE,
    p_time TIME,
    p_duration INTEGER
) RETURNS BOOLEAN AS $$
DECLARE
    conflict_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO conflict_count
    FROM appointments
    WHERE doctor_id = p_doctor_id
      AND scheduled_date = p_date
      AND status NOT IN ('cancelled', 'no-show', 'rescheduled')
      AND (
          -- Check for overlap
          scheduled_time < (p_time + (p_duration || ' minutes')::INTERVAL) AND
          (scheduled_time + (duration_minutes || ' minutes')::INTERVAL) > p_time
      );

    RETURN conflict_count = 0;
END;
$$ LANGUAGE plpgsql;

-- Function to get available time slots for a doctor on a specific date
CREATE OR REPLACE FUNCTION get_available_time_slots(
    p_doctor_id UUID,
    p_date DATE
) RETURNS TABLE(
    time_slot TIME,
    is_available BOOLEAN,
    clinic_id UUID,
    location_id UUID
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        generate_series(ds.start_time, ds.end_time - (ds.slot_duration_minutes || ' minutes')::INTERVAL,
                       (ds.slot_duration_minutes || ' minutes')::INTERVAL) as time_slot,
        is_time_slot_available(p_doctor_id, p_date,
                               generate_series(ds.start_time, ds.end_time - (ds.slot_duration_minutes || ' minutes')::INTERVAL,
                                             (ds.slot_duration_minutes || ' minutes')::INTERVAL),
                               ds.slot_duration_minutes) as is_available,
        ds.clinic_id,
        ds.location_id
    FROM doctor_schedules ds
    WHERE ds.doctor_id = p_doctor_id
      AND ds.is_active = TRUE
      AND ds.is_available = TRUE
      AND (
          (ds.schedule_type = 'regular' AND EXTRACT(DOW FROM p_date) = ds.day_of_week) OR
          (ds.schedule_type IN ('one-time', 'override') AND ds.specific_date = p_date)
      )
      AND (ds.effective_from IS NULL OR ds.effective_from <= p_date)
      AND (ds.effective_until IS NULL OR ds.effective_until >= p_date);
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 9. UPDATED_AT TRIGGER
-- ============================================

CREATE OR REPLACE FUNCTION update_appointments_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_appointments_timestamp ON appointments;
CREATE TRIGGER update_appointments_timestamp
    BEFORE UPDATE ON appointments
    FOR EACH ROW
    EXECUTE FUNCTION update_appointments_timestamp();

DROP TRIGGER IF EXISTS update_doctor_schedules_timestamp ON doctor_schedules;
CREATE TRIGGER update_doctor_schedules_timestamp
    BEFORE UPDATE ON doctor_schedules
    FOR EACH ROW
    EXECUTE FUNCTION update_appointments_timestamp();

-- ============================================
-- 10. PERMISSIONS
-- ============================================

GRANT ALL PRIVILEGES ON TABLE appointments TO medimesh_user;
GRANT ALL PRIVILEGES ON TABLE doctor_schedules TO medimesh_user;
GRANT ALL PRIVILEGES ON TABLE appointment_reminders TO medimesh_user;
GRANT USAGE, SELECT ON SEQUENCE appointment_number_sequence TO medimesh_user;

-- ============================================
-- COMPLETION MESSAGE
-- ============================================

DO $$
BEGIN
    RAISE NOTICE '✅ Appointments & Scheduling module initialized successfully';
    RAISE NOTICE '   - Appointments table created';
    RAISE NOTICE '   - Doctor schedules table created';
    RAISE NOTICE '   - Appointment reminders table created';
    RAISE NOTICE '   - Auto-generation for appointment numbers configured';
    RAISE NOTICE '   - Helper functions for slot availability created';
END $$;
