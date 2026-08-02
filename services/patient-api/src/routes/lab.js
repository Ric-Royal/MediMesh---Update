const express = require('express');
const Joi = require('joi');
const router = express.Router();
const { getDB } = require('../utils/database');
const { logger } = require('../utils/logger');
const { emitQueueUpdate } = require('../utils/websocket');
const { completeDepartmentService } = require('../utils/workflow');
const { authorize } = require('../middleware/auth');
const { validate } = require('../utils/validation');
const {
  requireEncounterAccess,
  patientScope,
  requirePatientResourceAccess,
  requireProviderIdentity
} = require('../security/accessControl');

const LAB_READ_ROLES = ['admin', 'doctor', 'nurse', 'lab-tech'];
const LAB_ORDER_ROLES = ['admin', 'doctor'];
const LAB_PROCESS_ROLES = ['admin', 'lab-tech'];
const labOrderSchema = Joi.object({
  patient_id: Joi.string().uuid().required(),
  encounter_id: Joi.string().uuid().required(),
  ordering_doctor_id: Joi.any().strip(),
  clinic_id: Joi.any().strip(),
  priority: Joi.string().valid('routine', 'urgent', 'stat', 'emergency').default('routine'),
  clinical_notes: Joi.string().allow('').max(4000),
  diagnosis: Joi.string().allow('').max(4000),
  tests: Joi.array().items(Joi.number().integer().positive()).min(1).max(25).unique().required()
}).unknown(false);

// ============================================
// LAB TEST CATALOG (For Ordering)
// ============================================

// Get lab test catalog
router.get('/test-catalog', authorize(LAB_READ_ROLES), async (req, res) => {
  try {
    const db = getDB();
    const result = await db.query(`
      SELECT * FROM lab_test_catalog
      WHERE is_active = TRUE
      ORDER BY test_category, test_name
    `);
    
    res.json({ success: true, data: result.rows, count: result.rows.length });
  } catch (error) {
    logger.error('Error fetching lab test catalog:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// LAB TESTS CATALOG
// ============================================

// Get all lab tests
router.get('/tests', authorize(LAB_READ_ROLES), async (req, res) => {
  try {
    const db = getDB();
    const { search, category, active = 'true' } = req.query;
    
    let query = `
      SELECT * FROM lab_tests
      WHERE is_active = $1
    `;
    const params = [active === 'true'];
    let paramIndex = 2;
    
    if (search) {
      query += ` AND (test_name ILIKE $${paramIndex} OR test_code ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }
    
    if (category) {
      query += ` AND test_category = $${paramIndex}`;
      params.push(category);
      paramIndex++;
    }
    
    query += ` ORDER BY test_name`;
    
    const result = await db.query(query, params);
    res.json({ success: true, data: result.rows, count: result.rows.length });
  } catch (error) {
    logger.error('Error fetching lab tests:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get test by ID
router.get('/tests/:id', authorize(LAB_READ_ROLES), async (req, res) => {
  try {
    const db = getDB();
    const { id } = req.params;
    const result = await db.query('SELECT * FROM lab_tests WHERE id = $1', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Test not found' });
    }
    
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Error fetching lab test:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// LAB ORDERS
// ============================================

// Get all lab orders (with filters)
router.get('/orders', authorize(LAB_READ_ROLES), async (req, res) => {
  try {
    const { patient_id, doctor_id, status, priority, date_from, date_to, page = 1, limit = 25 } = req.query;
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT lo.*,
             p.first_name || ' ' || p.last_name as patient_name,
             p.uhid,
             s.first_name || ' ' || s.last_name as doctor_name,
             c.clinic_name,
             (SELECT COUNT(*) FROM lab_order_items WHERE lab_order_id = lo.id) as item_count,
             (SELECT COUNT(*) FROM lab_order_items WHERE lab_order_id = lo.id AND status = 'completed') as completed_items
      FROM lab_orders lo
      LEFT JOIN patients p ON lo.patient_id = p.id
      LEFT JOIN staff s ON lo.ordering_doctor_id = s.id
      LEFT JOIN clinics c ON lo.clinic_id = c.id
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;
    if (!req.user.roles.some(role => ['admin', 'lab-tech'].includes(role))) {
      const scope = patientScope(req.user, { alias: 'p' });
      query += ` AND (${scope.clause})`;
      params.push(...scope.params);
      paramIndex = params.length + 1;
    }
    
    if (patient_id) {
      query += ` AND lo.patient_id = $${paramIndex}`;
      params.push(patient_id);
      paramIndex++;
    }
    
    if (doctor_id) {
      query += ` AND lo.ordering_doctor_id = $${paramIndex}`;
      params.push(doctor_id);
      paramIndex++;
    }
    
    if (status) {
      query += ` AND lo.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }
    
    if (priority) {
      query += ` AND lo.priority = $${paramIndex}`;
      params.push(priority);
      paramIndex++;
    }
    
    if (date_from) {
      query += ` AND lo.order_date >= $${paramIndex}`;
      params.push(date_from);
      paramIndex++;
    }
    
    if (date_to) {
      query += ` AND lo.order_date <= $${paramIndex}`;
      params.push(date_to);
      paramIndex++;
    }
    
    query += ` ORDER BY lo.order_date DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);
    
    const result = await getDB().query(query, params);
    res.json({ success: true, data: result.rows, count: result.rows.length });
  } catch (error) {
    logger.error('Error fetching lab orders:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get lab order by ID (with items)
router.get(
  '/orders/:id',
  authorize(LAB_READ_ROLES),
  requirePatientResourceAccess({ table: 'lab_orders', processRoles: ['lab-tech'] }),
  async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get order
    const orderQuery = `
      SELECT lo.*,
             p.first_name || ' ' || p.last_name as patient_name,
             p.uhid, p.date_of_birth, p.gender, p.phone as phone_number,
             s.first_name || ' ' || s.last_name as doctor_name,
             c.clinic_name
      FROM lab_orders lo
      LEFT JOIN patients p ON lo.patient_id = p.id
      LEFT JOIN staff s ON lo.ordering_doctor_id = s.id
      LEFT JOIN clinics c ON lo.clinic_id = c.id
      WHERE lo.id = $1
    `;
    const orderResult = await getDB().query(orderQuery, [id]);
    
    if (orderResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Lab order not found' });
    }
    
    // Get items
    const itemsQuery = `
      SELECT loi.*,
             lt.test_name, lt.test_code, lt.test_category, lt.specimen_type,
             lt.reference_ranges
      FROM lab_order_items loi
      LEFT JOIN lab_tests lt ON loi.test_id = lt.id
      WHERE loi.lab_order_id = $1
      ORDER BY loi.created_at
    `;
    const itemsResult = await getDB().query(itemsQuery, [id]);
    
    const order = orderResult.rows[0];
    order.items = itemsResult.rows;
    
    res.json({ success: true, data: order });
  } catch (error) {
    logger.error('Error fetching lab order:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create lab order
router.post(
  '/orders',
  authorize(LAB_ORDER_ROLES),
  validate(labOrderSchema),
  requireProviderIdentity('doctor'),
  requireEncounterAccess({ encounterId: req => req.validatedData.encounter_id }),
  async (req, res) => {
  const client = await getDB().connect();
  try {
    await client.query('BEGIN');
    
    const {
      patient_id, encounter_id,
      priority, clinical_notes, diagnosis, tests // array of test IDs
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
      INSERT INTO lab_orders (
        patient_id, encounter_id, ordering_doctor_id, clinic_id,
        priority, clinical_notes, diagnosis
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;
    const orderResult = await client.query(orderQuery, [
      patient_id, encounter_id, ordering_doctor_id, clinic_id,
      priority || 'routine', clinical_notes, diagnosis
    ]);
    
    const order = orderResult.rows[0];
    
    // Add test items
    for (const testId of tests) {
      // Get test details for pricing
      const testQuery = 'SELECT price FROM lab_tests WHERE id = $1 AND is_active = TRUE';
      const testResult = await client.query(testQuery, [testId]);
      const testPrice = Number(testResult.rows[0]?.price);
      if (!testResult.rows.length || !Number.isFinite(testPrice) || testPrice < 0) {
        throw new Error('A selected laboratory test is unavailable or has no valid catalog price');
      }
      
      const itemQuery = `
        INSERT INTO lab_order_items (
          lab_order_id, test_id, price
        ) VALUES ($1, $2, $3)
      `;
      await client.query(itemQuery, [order.id, testId, testPrice]);
    }
    
    // Add to lab queue
    const queueQuery = `
      INSERT INTO lab_queue (lab_order_id, patient_id)
      VALUES ($1, $2)
    `;
    await client.query(queueQuery, [order.id, patient_id]);
    
    await client.query('COMMIT');
    
    logger.info(`Lab order created: ${order.order_number}`);
    res.status(201).json({ success: true, data: order });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error creating lab order:', error);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    client.release();
  }
});

// Update lab order status
router.put(
  '/orders/:id/status',
  authorize(LAB_PROCESS_ROLES),
  requirePatientResourceAccess({ table: 'lab_orders', processRoles: ['lab-tech'] }),
  async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['pending', 'sample-collected', 'in-progress', 'completed', 'cancelled', 'rejected'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, error: `Invalid lab status: ${status}` });
    }
    
    const query = `
      UPDATE lab_orders
      SET status = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
    `;
    const result = await getDB().query(query, [status, id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Lab order not found' });
    }
    
    logger.info(`Lab order ${id} status updated to ${status}`);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Error updating lab order status:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// SAMPLE COLLECTION & TRACKING
// ============================================

// Collect sample (generate barcode)
router.post(
  '/orders/:id/collect',
  authorize(LAB_PROCESS_ROLES),
  requirePatientResourceAccess({ table: 'lab_orders', processRoles: ['lab-tech'] }),
  async (req, res) => {
  const client = await getDB().connect();
  try {
    await client.query('BEGIN');
    
    const { id } = req.params;
    const { item_ids, collection_site } = req.body; // array of lab_order_item IDs
    
    for (const itemId of item_ids) {
      // Update item status and generate barcode
      const updateQuery = `
        UPDATE lab_order_items
        SET sample_status = 'collected',
            sample_collected_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND lab_order_id = $2
        RETURNING *
      `;
      const result = await client.query(updateQuery, [itemId, id]);
      
      if (result.rows.length > 0) {
        const item = result.rows[0];
        
        // Create sample record
        const sampleQuery = `
          INSERT INTO lab_samples (
            lab_order_id, lab_order_item_id, specimen_type,
            collected_by, collection_site, barcode
          )
          SELECT $1, $2, lt.specimen_type, $3, $4, loi.sample_barcode
          FROM lab_order_items loi
          LEFT JOIN lab_tests lt ON loi.test_id = lt.id
          WHERE loi.id = $2
          RETURNING *
        `;
        await client.query(sampleQuery, [
          id,
          itemId,
          req.user.staffId || req.user.id,
          collection_site
        ]);
      }
    }
    
    // Update order status
    await client.query(
      'UPDATE lab_orders SET status = $1, sample_collection_date = CURRENT_TIMESTAMP WHERE id = $2',
      ['sample-collected', id]
    );
    
    // Update lab queue
    await client.query(
      'UPDATE lab_queue SET status = $1, called_at = CURRENT_TIMESTAMP WHERE lab_order_id = $2',
      ['sample-collection', id]
    );
    
    await client.query('COMMIT');
    
    logger.info(`Samples collected for lab order ${id}`);
    res.json({ success: true, message: 'Samples collected successfully' });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error collecting samples:', error);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    client.release();
  }
});

// Get sample by barcode
router.get('/samples/:barcode', authorize(LAB_PROCESS_ROLES), async (req, res) => {
  try {
    const { barcode } = req.params;
    
    const query = `
      SELECT ls.*,
             lo.order_number,
             p.first_name || ' ' || p.last_name as patient_name,
             p.uhid,
             lt.test_name
      FROM lab_samples ls
      LEFT JOIN lab_orders lo ON ls.lab_order_id = lo.id
      LEFT JOIN patients p ON lo.patient_id = p.id
      LEFT JOIN lab_order_items loi ON ls.lab_order_item_id = loi.id
      LEFT JOIN lab_tests lt ON loi.test_id = lt.id
      WHERE ls.barcode = $1
    `;
    const result = await getDB().query(query, [barcode]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Sample not found' });
    }
    
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Error fetching sample:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// RESULTS ENTRY
// ============================================

// Enter test result
router.post(
  '/orders/:id/items/:itemId/result',
  authorize(LAB_PROCESS_ROLES),
  requirePatientResourceAccess({ table: 'lab_orders', processRoles: ['lab-tech'] }),
  async (req, res) => {
  try {
    const { id, itemId } = req.params;
    const { result_value, result_unit, result_notes, reference_min, reference_max } = req.body;
    
    const query = `
      UPDATE lab_order_items
      SET result_value = $1,
          result_unit = $2,
          result_notes = $3,
          reference_min = $4,
          reference_max = $5,
          status = 'completed',
          result_entered_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $6 AND lab_order_id = $7
      RETURNING *
    `;
    
    const result = await getDB().query(query, [
      result_value, result_unit, result_notes,
      reference_min, reference_max, itemId, id
    ]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Lab order item not found' });
    }
    
    logger.info(`Result entered for lab order ${id}, item ${itemId}`);

    // Auto-complete the order when all items have results
    const pendingCheck = await getDB().query(
      `SELECT COUNT(*) as pending FROM lab_order_items
       WHERE lab_order_id = $1 AND status != 'completed'`,
      [id]
    );
    if (parseInt(pendingCheck.rows[0].pending) === 0) {
      const completedOrder = await getDB().query(
        `UPDATE lab_orders
         SET status = 'completed', result_date = COALESCE(result_date, CURRENT_TIMESTAMP),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
         RETURNING encounter_id`,
        [id]
      );
      try {
        await completeDepartmentService(completedOrder.rows[0]?.encounter_id, 'lab');
      } catch (workflowError) {
        logger.error('Lab result saved but journey synchronization failed:', workflowError);
      }
      logger.info(`Lab order ${id} auto-completed (all items have results)`);
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Error entering result:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// LAB QUEUE
// ============================================

// Get lab queue (pending sample collection)
router.get('/queue', authorize(LAB_READ_ROLES), async (req, res) => {
  try {
    const query = `
      SELECT lq.*,
             lo.order_number, lo.priority,
             p.first_name || ' ' || p.last_name as patient_name,
             p.uhid,
             (SELECT COUNT(*) FROM lab_order_items WHERE lab_order_id = lo.id) as test_count
      FROM lab_queue lq
      LEFT JOIN lab_orders lo ON lq.lab_order_id = lo.id
      LEFT JOIN patients p ON lq.patient_id = p.id
      WHERE lq.status IN ('waiting', 'sample-collection')
      ORDER BY lo.priority DESC, lq.joined_queue_at ASC
    `;
    const result = await getDB().query(query);
    res.json({ success: true, data: result.rows, count: result.rows.length });
  } catch (error) {
    logger.error('Error fetching lab queue:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get lab statistics
router.get('/statistics', authorize(LAB_READ_ROLES), async (req, res) => {
  try {
    const query = `
      SELECT
        (SELECT COUNT(*) FROM lab_orders WHERE status = 'pending') as pending_orders,
        (SELECT COUNT(*) FROM lab_orders WHERE status = 'sample-collected') as collected_today,
        (SELECT COUNT(*) FROM lab_orders WHERE status = 'in-progress') as in_progress,
        (SELECT COUNT(*) FROM lab_orders WHERE DATE(order_date) = CURRENT_DATE AND status = 'completed') as completed_today,
        (SELECT COUNT(*) FROM lab_order_items WHERE result_flag = 'high' OR result_flag = 'low') as abnormal_results,
        (SELECT COUNT(*) FROM lab_queue WHERE status = 'waiting') as queue_waiting,
        (SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (COALESCE(called_at, CURRENT_TIMESTAMP) - joined_queue_at))/60), 0) 
         FROM lab_queue WHERE DATE(joined_queue_at) = CURRENT_DATE) as avg_wait_time_minutes
    `;
    const result = await getDB().query(query);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Error fetching lab statistics:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
