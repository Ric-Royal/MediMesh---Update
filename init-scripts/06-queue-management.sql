-- =============================================================================
-- QUEUE MANAGEMENT - Real-time patient queue tracking
-- Migration 06: Critical for Kranium-style queue management
-- =============================================================================

-- Ensure we're connected to the medimesh database
\c medimesh;

CREATE TABLE IF NOT EXISTS queue_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    encounter_id UUID NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,

    -- Queue context
    clinic_id UUID REFERENCES clinics(id),  -- Made nullable - not all encounters have clinics
    doctor_id UUID REFERENCES staff(id),
    queue_type VARCHAR(20) NOT NULL,

    -- Position and priority
    queue_position INTEGER,
    priority_level INTEGER DEFAULT 5,

    -- Timing
    joined_at TIMESTAMP DEFAULT NOW(),
    called_at TIMESTAMP,
    served_at TIMESTAMP,
    completed_at TIMESTAMP,
    estimated_wait_minutes INTEGER,
    actual_wait_minutes INTEGER,

    -- Status
    status VARCHAR(20) DEFAULT 'waiting',
    waiting_location VARCHAR(100),

    -- Flags
    is_emergency BOOLEAN DEFAULT FALSE,
    requires_interpreter BOOLEAN DEFAULT FALSE,
    special_requirements TEXT,

    -- Metadata
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),

    CHECK (queue_type IN ('consultation', 'lab', 'radiology', 'pharmacy', 'billing', 'triage')),
    CHECK (status IN ('waiting', 'called', 'in-service', 'completed', 'no-show', 'deferred', 'cancelled')),
    CHECK (priority_level BETWEEN 1 AND 10)
);

CREATE INDEX IF NOT EXISTS idx_queue_encounter ON queue_entries(encounter_id);
CREATE INDEX IF NOT EXISTS idx_queue_patient ON queue_entries(patient_id);
CREATE INDEX IF NOT EXISTS idx_queue_clinic ON queue_entries(clinic_id);
CREATE INDEX IF NOT EXISTS idx_queue_doctor ON queue_entries(doctor_id);
CREATE INDEX IF NOT EXISTS idx_queue_status ON queue_entries(status);
CREATE INDEX IF NOT EXISTS idx_queue_type ON queue_entries(queue_type);
CREATE INDEX IF NOT EXISTS idx_queue_position ON queue_entries(queue_position);
CREATE INDEX IF NOT EXISTS idx_queue_priority ON queue_entries(priority_level);
CREATE INDEX IF NOT EXISTS idx_queue_joined_at ON queue_entries(joined_at);
CREATE INDEX IF NOT EXISTS idx_queue_emergency ON queue_entries(is_emergency);
CREATE INDEX IF NOT EXISTS idx_queue_clinic_status ON queue_entries(clinic_id, status);

-- Function to calculate actual wait time
CREATE OR REPLACE FUNCTION update_queue_wait_time()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.served_at IS NOT NULL AND NEW.joined_at IS NOT NULL THEN
        NEW.actual_wait_minutes := EXTRACT(EPOCH FROM
            (NEW.served_at - NEW.joined_at)) / 60;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS calculate_queue_wait_time ON queue_entries;
CREATE TRIGGER calculate_queue_wait_time
    BEFORE UPDATE ON queue_entries
    FOR EACH ROW
    EXECUTE FUNCTION update_queue_wait_time();

-- Function to auto-assign queue position
CREATE OR REPLACE FUNCTION assign_queue_position()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.queue_position IS NULL THEN
        SELECT COALESCE(MAX(queue_position), 0) + 1 INTO NEW.queue_position
        FROM queue_entries
        WHERE clinic_id = NEW.clinic_id
          AND queue_type = NEW.queue_type
          AND status IN ('waiting', 'called');
    END IF;

    -- Emergency patients get priority 1
    IF NEW.is_emergency = TRUE AND NEW.priority_level > 1 THEN
        NEW.priority_level := 1;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_queue_position ON queue_entries;
CREATE TRIGGER set_queue_position
    BEFORE INSERT ON queue_entries
    FOR EACH ROW
    EXECUTE FUNCTION assign_queue_position();

-- Create queue entries for existing encounters
INSERT INTO queue_entries (encounter_id, patient_id, clinic_id, doctor_id, queue_type, is_emergency, waiting_location)
SELECT
    e.id,
    e.patient_id,
    e.clinic_id,
    e.doctor_id,
    'consultation',
    CASE WHEN e.triage_level = 'emergency' THEN TRUE ELSE FALSE END,
    e.waiting_location
FROM encounters e
WHERE e.status = 'waiting'
ON CONFLICT DO NOTHING;

-- Success message
DO $$
DECLARE
    queue_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO queue_count FROM queue_entries WHERE status = 'waiting';
    RAISE NOTICE 'Migration 06 completed: Created queue_entries table with % patients in queue', queue_count;
END $$;
