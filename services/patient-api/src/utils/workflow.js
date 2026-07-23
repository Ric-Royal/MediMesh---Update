const { getDB } = require('./database');
const { logger } = require('./logger');

const ACTIVE_QUEUE_STATUSES = ['waiting', 'called', 'in-service', 'deferred'];

/**
 * Synchronize a completed department service and create the next safe handoff.
 * Diagnostics return to the ordering doctor for review; only a clinically
 * finished encounter is sent to billing. The same encounter may repeat this
 * cycle any number of times without creating duplicate active queue entries.
 */
async function completeDepartmentService(encounterId, queueType) {
  if (!encounterId || !['lab', 'radiology', 'pharmacy'].includes(queueType)) {
    return { nextQueue: null };
  }

  const client = await getDB().connect();
  try {
    await client.query('BEGIN');
    const encounterResult = await client.query(
      'SELECT * FROM encounters WHERE id = $1 FOR UPDATE',
      [encounterId]
    );
    if (!encounterResult.rows.length) {
      await client.query('ROLLBACK');
      return { nextQueue: null };
    }
    const encounter = encounterResult.rows[0];

    await client.query(`
      UPDATE queue_entries
      SET status = 'completed', completed_at = COALESCE(completed_at, NOW()), updated_at = NOW()
      WHERE id = (
        SELECT id
        FROM queue_entries
        WHERE encounter_id = $1
          AND queue_type = $2
          AND status = ANY($3::varchar[])
        ORDER BY joined_at
        LIMIT 1
        FOR UPDATE
      )
    `, [encounterId, queueType, ACTIVE_QUEUE_STATUSES]);

    const countsResult = await client.query(`
      SELECT
        (SELECT COUNT(*) FROM lab_orders
         WHERE encounter_id = $1 AND status NOT IN ('completed', 'cancelled', 'rejected'))::int AS lab,
        (SELECT COUNT(*) FROM radiology_orders
         WHERE encounter_id = $1 AND status NOT IN ('completed', 'reported', 'cancelled'))::int AS radiology,
        (SELECT COUNT(*) FROM prescriptions
         WHERE encounter_id = $1 AND status NOT IN ('fully-dispensed', 'cancelled'))::int AS pharmacy
    `, [encounterId]);

    const counts = countsResult.rows[0];
    const hasPendingOrders = counts.lab > 0 || counts.radiology > 0 || counts.pharmacy > 0;
    let nextQueue = null;

    await client.query(`
      UPDATE encounters
      SET pending_lab_orders = $2,
          pending_radiology_orders = $3,
          pending_prescriptions = $4,
          has_pending_orders = $5,
          all_services_completed = NOT $5,
          updated_at = NOW()
      WHERE id = $1
    `, [encounterId, counts.lab, counts.radiology, counts.pharmacy, hasPendingOrders]);

    const diagnosticsComplete = counts.lab === 0 && counts.radiology === 0;
    if (['lab', 'radiology'].includes(queueType) && diagnosticsComplete) {
      // Results are a clinical decision point, not a cashier handoff.
      await client.query(`
        UPDATE queue_entries
        SET status = 'deferred', updated_at = NOW(),
            notes = CONCAT_WS(' ', NULLIF(notes, ''), 'Awaiting diagnostic results review.')
        WHERE encounter_id = $1
          AND queue_type = 'billing'
          AND status = ANY($2::varchar[])
      `, [encounterId, ACTIVE_QUEUE_STATUSES]);

      const resultReview = await client.query(`
        INSERT INTO queue_entries (
          encounter_id, patient_id, clinic_id, doctor_id, queue_type,
          service_type, waiting_location, priority_level, is_emergency, notes
        )
        SELECT $1, $2, $3, $4, 'consultation', 'results-review',
               'consultation-waiting',
               CASE WHEN $5 IN ('urgent', 'emergency', 'critical') THEN 1 ELSE 3 END,
               $5 IN ('emergency', 'critical'),
               'Diagnostic results ready for clinician review'
        WHERE NOT EXISTS (
          SELECT 1 FROM queue_entries
          WHERE encounter_id = $1
            AND queue_type = 'consultation'
            AND status = ANY($6::varchar[])
        )
        RETURNING id
      `, [
        encounterId,
        encounter.patient_id,
        encounter.clinic_id,
        encounter.doctor_id,
        encounter.triage_level,
        ACTIVE_QUEUE_STATUSES
      ]);
      if (resultReview.rows.length) {
        nextQueue = 'consultation';
        await client.query(
          'UPDATE encounters SET all_services_completed = FALSE, updated_at = NOW() WHERE id = $1',
          [encounterId]
        );
      }
    }

    if (!nextQueue && !hasPendingOrders) {
      const activeConsultation = await client.query(`
        SELECT 1 FROM queue_entries
        WHERE encounter_id = $1
          AND queue_type = 'consultation'
          AND status = ANY($2::varchar[])
        LIMIT 1
      `, [encounterId, ACTIVE_QUEUE_STATUSES]);

      if (!activeConsultation.rows.length) {
        const billingQueue = await client.query(`
          INSERT INTO queue_entries (
            encounter_id, patient_id, clinic_id, doctor_id, queue_type,
            service_type, waiting_location, priority_level, is_emergency, notes
          )
          SELECT $1, $2, $3, $4, 'billing', 'billing-payment',
                 'billing-counter',
                 CASE WHEN $5 IN ('urgent', 'emergency', 'critical') THEN 1 ELSE 5 END,
                 $5 IN ('emergency', 'critical'),
                 'Clinical services complete; ready for cashier'
          WHERE NOT EXISTS (
            SELECT 1 FROM queue_entries
            WHERE encounter_id = $1
              AND queue_type = 'billing'
              AND status IN ('waiting', 'called', 'in-service', 'deferred')
          )
          RETURNING id
        `, [encounterId, encounter.patient_id, encounter.clinic_id,
          encounter.doctor_id, encounter.triage_level]);

        // A previously deferred cashier entry is preferable to a duplicate.
        if (!billingQueue.rows.length) {
          const resumed = await client.query(`
            UPDATE queue_entries
            SET status = 'waiting', updated_at = NOW(), notes = 'Clinical services complete; ready for cashier'
            WHERE id = (
              SELECT id FROM queue_entries
              WHERE encounter_id = $1 AND queue_type = 'billing' AND status = 'deferred'
              ORDER BY joined_at DESC LIMIT 1
            )
            RETURNING id
          `, [encounterId]);
          if (resumed.rows.length) nextQueue = 'billing';
        } else {
          nextQueue = 'billing';
        }
      }
    }

    await client.query('COMMIT');
    logger.info('Department service synchronized with patient journey', {
      encounterId,
      queueType,
      pendingOrders: counts,
      nextQueue
    });
    return { nextQueue, pendingOrders: counts };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { completeDepartmentService };
