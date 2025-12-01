const express = require('express');
const router = express.Router();
const { getDB } = require('../utils/database');
const { logger } = require('../utils/logger');

// ============================================
// DRUGS MANAGEMENT
// ============================================

// Get all drugs (with filters)
router.get('/drugs', async (req, res) => {
  try {
    const { search, category, inStock, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT d.*, dc.category_name,
             CASE WHEN d.current_stock <= d.reorder_level THEN true ELSE false END as needs_reorder
      FROM drugs d
      LEFT JOIN drug_categories dc ON d.category_id = dc.id
      WHERE d.is_active = true
    `;
    const params = [];
    let paramIndex = 1;
    
    if (search) {
      query += ` AND (d.generic_name ILIKE $${paramIndex} OR d.brand_name ILIKE $${paramIndex} OR d.drug_code ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }
    
    if (category) {
      query += ` AND d.category_id = $${paramIndex}`;
      params.push(category);
      paramIndex++;
    }
    
    if (inStock === 'true') {
      query += ` AND d.current_stock > 0`;
    } else if (inStock === 'false') {
      query += ` AND d.current_stock = 0`;
    }
    
    query += ` ORDER BY d.generic_name LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);
    
    const result = await getDB().query(query, params);
    
    // Get total count
    const countQuery = query.replace(/SELECT .* FROM/, 'SELECT COUNT(*) FROM').split('ORDER BY')[0];
    const countResult = await getDB().query(countQuery, params.slice(0, -2));
    
    res.json({
      success: true,
      data: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].count)
      }
    });
  } catch (error) {
    logger.error('Error fetching drugs:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get drug by ID
router.get('/drugs/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const query = `
      SELECT d.*, dc.category_name,
             (SELECT COUNT(*) FROM prescription_items WHERE drug_id = d.id) as prescription_count,
             (SELECT SUM(quantity) FROM drug_stock_movements WHERE drug_id = d.id AND movement_type = 'purchase') as total_purchased
      FROM drugs d
      LEFT JOIN drug_categories dc ON d.category_id = dc.id
      WHERE d.id = $1
    `;
    const result = await getDB().query(query, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Drug not found' });
    }
    
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Error fetching drug:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create drug
router.post('/drugs', async (req, res) => {
  try {
    const {
      generic_name, brand_name, category_id, dosage_form, strength,
      unit_of_measure, manufacturer, description, reorder_level,
      current_stock, unit_price, selling_price, is_controlled_substance,
      requires_prescription, storage_requirements
    } = req.body;
    
    const query = `
      INSERT INTO drugs (
        generic_name, brand_name, category_id, dosage_form, strength,
        unit_of_measure, manufacturer, description, reorder_level,
        current_stock, unit_price, selling_price, is_controlled_substance,
        requires_prescription, storage_requirements
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *
    `;
    
    const result = await getDB().query(query, [
      generic_name, brand_name, category_id, dosage_form, strength,
      unit_of_measure, manufacturer, description, reorder_level || 50,
      current_stock || 0, unit_price, selling_price, is_controlled_substance || false,
      requires_prescription !== false, storage_requirements
    ]);
    
    logger.info(`Drug created: ${result.rows[0].drug_code}`);
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Error creating drug:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update drug stock
router.post('/drugs/:id/stock', async (req, res) => {
  try {
    const { id } = req.params;
    const { movement_type, quantity, unit_cost, batch_number, expiry_date, reference_number, notes } = req.body;
    
    const query = `
      INSERT INTO drug_stock_movements (
        drug_id, movement_type, quantity, unit_cost, batch_number,
        expiry_date, reference_number, notes, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;
    
    const result = await getDB().query(query, [
      id, movement_type, quantity, unit_cost, batch_number,
      expiry_date, reference_number, notes, req.user?.userId
    ]);
    
    logger.info(`Stock movement recorded for drug ${id}: ${movement_type} ${quantity}`);
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Error recording stock movement:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get drugs needing reorder
router.get('/drugs/alerts/reorder', async (req, res) => {
  try {
    const query = `
      SELECT d.*, dc.category_name
      FROM drugs d
      LEFT JOIN drug_categories dc ON d.category_id = dc.id
      WHERE d.current_stock <= d.reorder_level AND d.is_active = true
      ORDER BY d.current_stock ASC
    `;
    const result = await getDB().query(query);
    res.json({ success: true, data: result.rows, count: result.rows.length });
  } catch (error) {
    logger.error('Error fetching reorder alerts:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// PRESCRIPTIONS
// ============================================

// Get all prescriptions (with filters)
router.get('/prescriptions', async (req, res) => {
  try {
    const { patient_id, doctor_id, status, date_from, date_to, page = 1, limit = 25 } = req.query;
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT p.*, 
             pat.first_name || ' ' || pat.last_name as patient_name,
             pat.uhid,
             s.first_name || ' ' || s.last_name as doctor_name,
             c.clinic_name,
             (SELECT COUNT(*) FROM prescription_items WHERE prescription_id = p.id) as item_count
      FROM prescriptions p
      LEFT JOIN patients pat ON p.patient_id = pat.id
      LEFT JOIN staff s ON p.doctor_id = s.id
      LEFT JOIN clinics c ON p.clinic_id = c.id
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;
    
    if (patient_id) {
      query += ` AND p.patient_id = $${paramIndex}`;
      params.push(patient_id);
      paramIndex++;
    }
    
    if (doctor_id) {
      query += ` AND p.doctor_id = $${paramIndex}`;
      params.push(doctor_id);
      paramIndex++;
    }
    
    if (status) {
      query += ` AND p.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }
    
    if (date_from) {
      query += ` AND p.prescription_date >= $${paramIndex}`;
      params.push(date_from);
      paramIndex++;
    }
    
    if (date_to) {
      query += ` AND p.prescription_date <= $${paramIndex}`;
      params.push(date_to);
      paramIndex++;
    }
    
    query += ` ORDER BY p.prescription_date DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);
    
    const result = await getDB().query(query, params);
    res.json({ success: true, data: result.rows, count: result.rows.length });
  } catch (error) {
    logger.error('Error fetching prescriptions:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get prescription by ID (with items)
router.get('/prescriptions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get prescription
    const prescriptionQuery = `
      SELECT p.*, 
             pat.first_name || ' ' || pat.last_name as patient_name,
             pat.uhid, pat.date_of_birth, pat.gender, pat.phone_number,
             s.first_name || ' ' || s.last_name as doctor_name,
             c.clinic_name
      FROM prescriptions p
      LEFT JOIN patients pat ON p.patient_id = pat.id
      LEFT JOIN staff s ON p.doctor_id = s.id
      LEFT JOIN clinics c ON p.clinic_id = c.id
      WHERE p.id = $1
    `;
    const prescriptionResult = await getDB().query(prescriptionQuery, [id]);
    
    if (prescriptionResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Prescription not found' });
    }
    
    // Get items
    const itemsQuery = `
      SELECT pi.*, 
             d.generic_name, d.brand_name, d.dosage_form, d.strength,
             d.current_stock,
             s.first_name || ' ' || s.last_name as dispensed_by_name
      FROM prescription_items pi
      LEFT JOIN drugs d ON pi.drug_id = d.id
      LEFT JOIN staff s ON pi.dispensed_by = s.id
      WHERE pi.prescription_id = $1
      ORDER BY pi.id
    `;
    const itemsResult = await getDB().query(itemsQuery, [id]);
    
    const prescription = prescriptionResult.rows[0];
    prescription.items = itemsResult.rows;
    
    res.json({ success: true, data: prescription });
  } catch (error) {
    logger.error('Error fetching prescription:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create prescription
router.post('/prescriptions', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    const {
      patient_id, encounter_id, doctor_id, clinic_id,
      diagnosis, notes, special_instructions, items
    } = req.body;
    
    // Create prescription
    const prescriptionQuery = `
      INSERT INTO prescriptions (
        patient_id, encounter_id, doctor_id, clinic_id,
        diagnosis, notes, special_instructions
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;
    const prescriptionResult = await client.query(prescriptionQuery, [
      patient_id, encounter_id, doctor_id, clinic_id,
      diagnosis, notes, special_instructions
    ]);
    
    const prescription = prescriptionResult.rows[0];
    
    // Add items
    const itemPromises = items.map(item => {
      const itemQuery = `
        INSERT INTO prescription_items (
          prescription_id, drug_id, quantity, dosage, duration_days,
          frequency, route, unit_price, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *
      `;
      return client.query(itemQuery, [
        prescription.id, item.drug_id, item.quantity, item.dosage,
        item.duration_days, item.frequency, item.route, item.unit_price, item.notes
      ]);
    });
    
    await Promise.all(itemPromises);
    await client.query('COMMIT');
    
    logger.info(`Prescription created: ${prescription.prescription_number}`);
    res.status(201).json({ success: true, data: prescription });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error creating prescription:', error);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    client.release();
  }
});

// Dispense prescription item
router.post('/prescriptions/:id/items/:itemId/dispense', async (req, res) => {
  try {
    const { id, itemId } = req.params;
    const { quantity_dispensed, batch_number } = req.body;
    
    const query = `
      UPDATE prescription_items
      SET status = 'dispensed',
          quantity_dispensed = $1,
          dispensed_date = CURRENT_TIMESTAMP,
          dispensed_by = $2,
          batch_number = $3
      WHERE id = $4 AND prescription_id = $5
      RETURNING *
    `;
    
    const result = await getDB().query(query, [
      quantity_dispensed, req.user?.userId, batch_number, itemId, id
    ]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Prescription item not found' });
    }
    
    logger.info(`Prescription item ${itemId} dispensed`);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Error dispensing prescription item:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get pending prescriptions (for pharmacy queue)
router.get('/prescriptions/queue/pending', async (req, res) => {
  try {
    const query = `
      SELECT p.*,
             pat.first_name || ' ' || pat.last_name as patient_name,
             pat.uhid,
             (SELECT COUNT(*) FROM prescription_items WHERE prescription_id = p.id AND status = 'pending') as pending_items,
             EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - p.prescription_date))/60 as waiting_minutes
      FROM prescriptions p
      LEFT JOIN patients pat ON p.patient_id = pat.id
      WHERE p.status IN ('pending', 'partially-dispensed')
      ORDER BY p.prescription_date ASC
    `;
    const result = await getDB().query(query);
    res.json({ success: true, data: result.rows, count: result.rows.length });
  } catch (error) {
    logger.error('Error fetching pharmacy queue:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get pharmacy statistics
router.get('/statistics', async (req, res) => {
  try {
    const query = `
      SELECT
        (SELECT COUNT(*) FROM prescriptions WHERE status = 'pending') as pending_prescriptions,
        (SELECT COUNT(*) FROM prescriptions WHERE status = 'partially-dispensed') as partial_prescriptions,
        (SELECT COUNT(*) FROM prescriptions WHERE DATE(prescription_date) = CURRENT_DATE AND status = 'fully-dispensed') as dispensed_today,
        (SELECT COUNT(*) FROM drugs WHERE current_stock <= reorder_level) as drugs_needing_reorder,
        (SELECT COALESCE(SUM(final_amount), 0) FROM pharmacy_transactions WHERE DATE(transaction_date) = CURRENT_DATE) as sales_today,
        (SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (dispensed_date - prescription_date))/60), 0) FROM prescriptions WHERE DATE(prescription_date) = CURRENT_DATE AND dispensed_date IS NOT NULL) as avg_wait_time_minutes
    `;
    const result = await getDB().query(query);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Error fetching pharmacy statistics:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;

