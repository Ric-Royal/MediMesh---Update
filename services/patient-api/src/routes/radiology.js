const express = require('express');
const Joi = require('joi');
const router = express.Router();
const { getDB } = require('../utils/database');
const { logger } = require('../utils/logger');
const { completeDepartmentService } = require('../utils/workflow');
const { authorize } = require('../middleware/auth');
const { validate } = require('../utils/validation');
const {
  requireEncounterAccess,
  patientScope,
  requirePatientResourceAccess,
  requireProviderIdentity
} = require('../security/accessControl');

const RADIOLOGY_READ_ROLES = ['admin', 'doctor', 'nurse', 'radiologist', 'radiographer'];
const RADIOLOGY_ORDER_ROLES = ['admin', 'doctor'];
const RADIOLOGY_PROCESS_ROLES = ['admin', 'radiologist', 'radiographer'];
const radiologyOrderSchema = Joi.object({
  patient_id: Joi.string().uuid().required(),
  encounter_id: Joi.string().uuid().required(),
  ordering_doctor_id: Joi.any().strip(),
  clinic_id: Joi.any().strip(),
  clinical_indication: Joi.string().max(4000).required(),
  provisional_diagnosis: Joi.string().allow('').max(4000),
  priority: Joi.string().valid('routine', 'urgent', 'stat', 'emergency').default('routine'),
  tests: Joi.array().items(Joi.object({
    test_id: Joi.number().integer().positive().required(),
    body_part: Joi.string().allow('').max(100),
    laterality: Joi.string().allow('').valid('', 'left', 'right', 'bilateral', 'not-applicable'),
    views_requested: Joi.string().allow('').max(250),
    price: Joi.any().strip()
  }).unknown(false)).min(1).max(25).required()
}).unknown(false);

// ============================================
// RADIOLOGY STUDY CATALOG (For Ordering)
// ============================================

// Get radiology study catalog
router.get('/study-catalog', authorize(RADIOLOGY_READ_ROLES), async (req, res) => {
  try {
    const db = getDB();
    const result = await db.query(`
      SELECT * FROM radiology_study_catalog
      WHERE is_active = TRUE
      ORDER BY modality, study_name
    `);
    
    res.json({ success: true, data: result.rows, count: result.rows.length });
  } catch (error) {
    logger.error('Error fetching radiology study catalog:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// RADIOLOGY TESTS CATALOG
// ============================================

// Get all radiology tests
router.get('/tests', authorize(RADIOLOGY_READ_ROLES), async (req, res) => {
  try {
    const { modality, search } = req.query;
    
    let query = `
      SELECT rt.*,
             im.modality_name, im.modality_code
      FROM radiology_tests rt
      LEFT JOIN imaging_modalities im ON rt.modality_id = im.id
      WHERE rt.is_active = true
    `;
    const params = [];
    let paramIndex = 1;
    
    if (modality) {
      query += ` AND rt.modality_id = $${paramIndex}`;
      params.push(modality);
      paramIndex++;
    }
    
    if (search) {
      query += ` AND (rt.test_name ILIKE $${paramIndex} OR rt.test_code ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }
    
    query += ` ORDER BY rt.test_name`;
    
    const result = await getDB().query(query, params);
    res.json({ success: true, data: result.rows, count: result.rows.length });
  } catch (error) {
    logger.error('Error fetching radiology tests:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get imaging modalities
router.get('/modalities', authorize(RADIOLOGY_READ_ROLES), async (req, res) => {
  try {
    const query = 'SELECT * FROM imaging_modalities WHERE is_active = true ORDER BY modality_name';
    const result = await getDB().query(query);
    res.json({ success: true, data: result.rows, count: result.rows.length });
  } catch (error) {
    logger.error('Error fetching modalities:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// RADIOLOGY ORDERS
// ============================================

// Get all radiology orders
router.get('/orders', authorize(RADIOLOGY_READ_ROLES), async (req, res) => {
  try {
    const { patient_id, status, priority, page = 1, limit = 25 } = req.query;
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT ro.*,
             p.first_name || ' ' || p.last_name as patient_name,
             p.uhid,
             s.first_name || ' ' || s.last_name as doctor_name,
             (SELECT COUNT(*) FROM radiology_order_items WHERE radiology_order_id = ro.id) as item_count,
             (SELECT COUNT(*) FROM radiology_order_items WHERE radiology_order_id = ro.id AND status = 'completed') as completed_items
      FROM radiology_orders ro
      LEFT JOIN patients p ON ro.patient_id = p.id
      LEFT JOIN staff s ON ro.ordering_doctor_id = s.id
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;
    if (!req.user.roles.some(role => ['admin', 'radiologist', 'radiographer'].includes(role))) {
      const scope = patientScope(req.user, { alias: 'p' });
      query += ` AND (${scope.clause})`;
      params.push(...scope.params);
      paramIndex = params.length + 1;
    }
    
    if (patient_id) {
      query += ` AND ro.patient_id = $${paramIndex}`;
      params.push(patient_id);
      paramIndex++;
    }
    
    if (status) {
      query += ` AND ro.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }
    
    if (priority) {
      query += ` AND ro.priority = $${paramIndex}`;
      params.push(priority);
      paramIndex++;
    }
    
    query += ` ORDER BY ro.order_date DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);
    
    const result = await getDB().query(query, params);
    res.json({ success: true, data: result.rows, count: result.rows.length });
  } catch (error) {
    logger.error('Error fetching radiology orders:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get radiology order by ID (with items & reports)
router.get(
  '/orders/:id',
  authorize(RADIOLOGY_READ_ROLES),
  requirePatientResourceAccess({
    table: 'radiology_orders',
    processRoles: ['radiologist', 'radiographer']
  }),
  async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get order
    const orderQuery = `
      SELECT ro.*,
             p.first_name || ' ' || p.last_name as patient_name,
             p.uhid, p.date_of_birth, p.gender,
             s.first_name || ' ' || s.last_name as doctor_name
      FROM radiology_orders ro
      LEFT JOIN patients p ON ro.patient_id = p.id
      LEFT JOIN staff s ON ro.ordering_doctor_id = s.id
      WHERE ro.id = $1
    `;
    const orderResult = await getDB().query(orderQuery, [id]);
    
    if (orderResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Radiology order not found' });
    }
    
    // Get items
    const itemsQuery = `
      SELECT roi.*,
             rt.test_name, rt.test_code,
             im.modality_name
      FROM radiology_order_items roi
      LEFT JOIN radiology_tests rt ON roi.test_id = rt.id
      LEFT JOIN imaging_modalities im ON rt.modality_id = im.id
      WHERE roi.radiology_order_id = $1
      ORDER BY roi.created_at
    `;
    const itemsResult = await getDB().query(itemsQuery, [id]);
    
    // Get reports
    const reportsQuery = `
      SELECT rr.*,
             s.first_name || ' ' || s.last_name as radiologist_name
      FROM radiology_reports rr
      LEFT JOIN staff s ON rr.radiologist_id = s.id
      WHERE rr.radiology_order_id = $1
      ORDER BY rr.created_at DESC
    `;
    const reportsResult = await getDB().query(reportsQuery, [id]);
    
    const order = orderResult.rows[0];
    order.items = itemsResult.rows;
    order.reports = reportsResult.rows;
    
    res.json({ success: true, data: order });
  } catch (error) {
    logger.error('Error fetching radiology order:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create radiology order
router.post(
  '/orders',
  authorize(RADIOLOGY_ORDER_ROLES),
  validate(radiologyOrderSchema),
  requireProviderIdentity('doctor'),
  requireEncounterAccess({ encounterId: req => req.validatedData.encounter_id }),
  async (req, res) => {
  const client = await getDB().connect();
  try {
    await client.query('BEGIN');
    
    const {
      patient_id, encounter_id,
      clinical_indication, provisional_diagnosis, priority, tests
    } = req.validatedData;
    const ordering_doctor_id = req.user.staffId || req.user.id;
    const encounterResult = await client.query(
      'SELECT clinic_id FROM encounters WHERE id = $1 AND patient_id = $2 FOR UPDATE',
      [encounter_id, patient_id]
    );
    if (!encounterResult.rows.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        error: 'Encounter does not belong to the supplied patient'
      });
    }
    const clinic_id = encounterResult.rows[0].clinic_id;
    
    // Create order
    const orderQuery = `
      INSERT INTO radiology_orders (
        patient_id, encounter_id, ordering_doctor_id, clinic_id,
        clinical_indication, provisional_diagnosis, priority
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;
    const orderResult = await client.query(orderQuery, [
      patient_id, encounter_id, ordering_doctor_id, clinic_id,
      clinical_indication, provisional_diagnosis, priority || 'routine'
    ]);
    
    const order = orderResult.rows[0];
    
    // Add test items
    for (const test of tests) {
      const testQuery = 'SELECT price FROM radiology_tests WHERE id = $1 AND is_active = TRUE';
      const testResult = await client.query(testQuery, [test.test_id]);
      const testPrice = Number(testResult.rows[0]?.price);
      if (!testResult.rows.length || !Number.isFinite(testPrice) || testPrice < 0) {
        throw new Error('A selected imaging study is unavailable or has no valid catalog price');
      }
      
      const itemQuery = `
        INSERT INTO radiology_order_items (
          radiology_order_id, test_id, body_part, laterality,
          views_requested, price
        ) VALUES ($1, $2, $3, $4, $5, $6)
      `;
      await client.query(itemQuery, [
        order.id, test.test_id, test.body_part,
        test.laterality, test.views_requested, testPrice
      ]);
    }
    
    // Add to radiology queue
    const queueQuery = `
      INSERT INTO radiology_queue (radiology_order_id, patient_id)
      VALUES ($1, $2)
    `;
    await client.query(queueQuery, [order.id, patient_id]);
    
    await client.query('COMMIT');
    
    logger.info(`Radiology order created: ${order.order_number}`);
    res.status(201).json({ success: true, data: order });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error creating radiology order:', error);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    client.release();
  }
});

// Update radiology order status (e.g., complete the order)
router.put(
  '/orders/:id/status',
  authorize(RADIOLOGY_PROCESS_ROLES),
  requirePatientResourceAccess({
    table: 'radiology_orders',
    processRoles: ['radiologist', 'radiographer']
  }),
  async (req, res) => {
  try {
    const { id } = req.params;
    const { status, report_notes } = req.body;

    const validStatuses = ['pending', 'scheduled', 'in-progress', 'completed', 'reported', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
      });
    }

    const updateFields = ['status = $1', 'updated_at = CURRENT_TIMESTAMP'];
    const values = [status, id];
    let paramIdx = 3;

    // no completed_at column; updated_at is already set above

    const query = `
      UPDATE radiology_orders SET ${updateFields.join(', ')}
      WHERE id = $2
      RETURNING *
    `;
    const result = await getDB().query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Radiology order not found' });
    }

    // Also update item statuses to match
    if (status === 'completed') {
      await getDB().query(
        `UPDATE radiology_order_items SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE radiology_order_id = $1`,
        [id]
      );
    }

    logger.info(`Radiology order ${id} status updated to ${status}`);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Error updating radiology order status:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Submit a structured report for every study in an order.
router.post(
  '/orders/:id/report',
  authorize(['admin', 'radiologist']),
  requireProviderIdentity('radiologist'),
  requirePatientResourceAccess({ table: 'radiology_orders', processRoles: ['radiologist'] }),
  async (req, res) => {
  const client = await getDB().connect();
  try {
    await client.query('BEGIN');
    const { id } = req.params;
    const { reports = [] } = req.body;

    if (!Array.isArray(reports) || reports.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, error: 'At least one study report is required' });
    }

    const orderResult = await client.query(`
      SELECT ro.*,
             CASE WHEN EXISTS (SELECT 1 FROM staff WHERE id = $2)
                  THEN $2::uuid ELSE ro.ordering_doctor_id END AS reporting_clinician_id
      FROM radiology_orders ro
      WHERE ro.id = $1
      FOR UPDATE
    `, [id, req.user.staffId || req.user.id]);

    if (orderResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Radiology order not found' });
    }

    const order = orderResult.rows[0];
    for (const report of reports) {
      if (!report.itemId || !report.findings?.trim() || !report.impression?.trim()) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          error: 'Every study requires findings and an impression'
        });
      }

      const itemResult = await client.query(`
        SELECT id FROM radiology_order_items
        WHERE id = $1 AND radiology_order_id = $2
      `, [report.itemId, id]);
      if (itemResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, error: 'A reported study does not belong to this order' });
      }

      const existingReport = await client.query(`
        SELECT id FROM radiology_reports
        WHERE radiology_order_id = $1 AND radiology_order_item_id = $2
        ORDER BY version DESC
        LIMIT 1
      `, [id, report.itemId]);

      if (existingReport.rows.length > 0 && !String(report.amendmentReason || '').trim()) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          error: 'An amendment reason is required when replacing a final report'
        });
      }
      await client.query(`
        INSERT INTO radiology_reports (
          radiology_order_id, radiology_order_item_id, findings, impression,
          recommendations, radiologist_id, status, dictated_at, verified_at,
          released_at, version, previous_report_id, amendment_reason
        )
        SELECT $1, $2, $3, $4, $5, $6,
               CASE WHEN previous.id IS NULL THEN 'final' ELSE 'amended' END,
               NOW(), NOW(), NOW(), COALESCE(previous.version, 0) + 1,
               previous.id, $7
        FROM (SELECT 1) seed
        LEFT JOIN radiology_reports previous ON previous.id = $8
      `, [
        id,
        report.itemId,
        report.findings.trim(),
        report.impression.trim(),
        report.notes || null,
        order.reporting_clinician_id,
        report.amendmentReason?.trim() || null,
        existingReport.rows[0]?.id || null
      ]);

      await client.query(`
        UPDATE radiology_order_items
        SET status = 'reported', reported_at = NOW(), updated_at = NOW()
        WHERE id = $1
      `, [report.itemId]);
    }

    const completedOrder = await client.query(`
      UPDATE radiology_orders
      SET status = 'reported', reported_at = NOW(), updated_at = NOW()
      WHERE id = $1
      RETURNING encounter_id
    `, [id]);

    await client.query('COMMIT');

    try {
      await completeDepartmentService(completedOrder.rows[0]?.encounter_id, 'radiology');
    } catch (workflowError) {
      logger.error('Radiology reported but journey synchronization failed:', workflowError);
    }

    res.json({ success: true, message: 'Radiology report finalized and released' });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error submitting radiology report:', error);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    client.release();
  }
});

// Get radiology queue
router.get('/queue', authorize(RADIOLOGY_READ_ROLES), async (req, res) => {
  try {
    const query = `
      SELECT rq.*,
             ro.order_number, ro.priority,
             p.first_name || ' ' || p.last_name as patient_name,
             p.uhid,
             im.modality_name
      FROM radiology_queue rq
      LEFT JOIN radiology_orders ro ON rq.radiology_order_id = ro.id
      LEFT JOIN patients p ON rq.patient_id = p.id
      LEFT JOIN imaging_modalities im ON rq.modality_id = im.id
      WHERE rq.status IN ('waiting', 'called', 'in-room')
      ORDER BY ro.priority DESC, rq.joined_queue_at ASC
    `;
    const result = await getDB().query(query);
    res.json({ success: true, data: result.rows, count: result.rows.length });
  } catch (error) {
    logger.error('Error fetching radiology queue:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get radiology statistics
router.get('/statistics', authorize(RADIOLOGY_READ_ROLES), async (req, res) => {
  try {
    const query = `
      SELECT
        (SELECT COUNT(*) FROM radiology_orders WHERE status = 'pending') as pending_orders,
        (SELECT COUNT(*) FROM radiology_orders WHERE status = 'in-progress') as in_progress,
        (SELECT COUNT(*) FROM radiology_orders WHERE DATE(order_date) = CURRENT_DATE AND status = 'completed') as completed_today,
        (SELECT COUNT(*) FROM radiology_reports WHERE critical_finding = true AND DATE(created_at) = CURRENT_DATE) as critical_findings_today,
        (SELECT COUNT(*) FROM radiology_queue WHERE status = 'waiting') as queue_waiting
    `;
    const result = await getDB().query(query);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Error fetching radiology statistics:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;

