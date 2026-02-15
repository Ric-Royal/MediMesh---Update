const express = require('express');
const router = express.Router();
const { getDB } = require('../utils/database');
const { logger } = require('../utils/logger');
const { authorize } = require('../middleware/auth');

// ============================================
// RADIOLOGY STUDY CATALOG (For Ordering)
// ============================================

// Get radiology study catalog
router.get('/study-catalog', authorize(['doctor', 'nurse', 'radiologist', 'admin']), async (req, res) => {
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
router.get('/tests', authorize(['doctor', 'nurse', 'radiologist', 'admin']), async (req, res) => {
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
router.get('/modalities', authorize(['doctor', 'nurse', 'radiologist', 'admin']), async (req, res) => {
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
router.get('/orders', authorize(['doctor', 'nurse', 'radiologist', 'admin']), async (req, res) => {
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
router.get('/orders/:id', authorize(['doctor', 'nurse', 'radiologist', 'admin']), async (req, res) => {
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
router.post('/orders', authorize(['doctor', 'admin']), async (req, res) => {
  const client = await getDB().connect();
  try {
    await client.query('BEGIN');
    
    const {
      patient_id, encounter_id, ordering_doctor_id, clinic_id,
      clinical_indication, provisional_diagnosis, priority, tests
    } = req.body;
    
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
      const testQuery = 'SELECT price FROM radiology_tests WHERE id = $1';
      const testResult = await client.query(testQuery, [test.test_id]);
      const testPrice = testResult.rows[0]?.price || 0;
      
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

// Get radiology queue
router.get('/queue', authorize(['radiologist', 'nurse', 'admin']), async (req, res) => {
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
router.get('/statistics', authorize(['radiologist', 'admin', 'manager']), async (req, res) => {
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

