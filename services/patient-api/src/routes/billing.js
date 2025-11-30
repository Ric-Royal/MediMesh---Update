const express = require('express');
const router = express.Router();
const { pool } = require('../utils/database');
const { logger } = require('../utils/logger');

// ============================================
// INVOICES
// ============================================

// Get all invoices (with filters)
router.get('/invoices', async (req, res) => {
  try {
    const { patient_id, status, payment_status, date_from, date_to, page = 1, limit = 25 } = req.query;
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT i.*,
             p.first_name || ' ' || p.last_name as patient_name,
             p.uhid,
             (SELECT COUNT(*) FROM invoice_items WHERE invoice_id = i.id) as item_count
      FROM invoices i
      LEFT JOIN patients p ON i.patient_id = p.id
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;
    
    if (patient_id) {
      query += ` AND i.patient_id = $${paramIndex}`;
      params.push(patient_id);
      paramIndex++;
    }
    
    if (status) {
      query += ` AND i.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }
    
    if (payment_status) {
      query += ` AND i.payment_status = $${paramIndex}`;
      params.push(payment_status);
      paramIndex++;
    }
    
    if (date_from) {
      query += ` AND i.invoice_date >= $${paramIndex}`;
      params.push(date_from);
      paramIndex++;
    }
    
    if (date_to) {
      query += ` AND i.invoice_date <= $${paramIndex}`;
      params.push(date_to);
      paramIndex++;
    }
    
    query += ` ORDER BY i.invoice_date DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);
    
    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows, count: result.rows.length });
  } catch (error) {
    logger.error('Error fetching invoices:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get invoice by ID (with items)
router.get('/invoices/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get invoice
    const invoiceQuery = `
      SELECT i.*,
             p.first_name || ' ' || p.last_name as patient_name,
             p.uhid, p.phone_number,
             s.first_name || ' ' || s.last_name as billed_by_name
      FROM invoices i
      LEFT JOIN patients p ON i.patient_id = p.id
      LEFT JOIN staff s ON i.billed_by = s.id
      WHERE i.id = $1
    `;
    const invoiceResult = await pool.query(invoiceQuery, [id]);
    
    if (invoiceResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Invoice not found' });
    }
    
    // Get items
    const itemsQuery = `
      SELECT ii.*,
             s.first_name || ' ' || s.last_name as provider_name,
             d.department_name
      FROM invoice_items ii
      LEFT JOIN staff s ON ii.provider_id = s.id
      LEFT JOIN departments d ON ii.department_id = d.id
      WHERE ii.invoice_id = $1
      ORDER BY ii.created_at
    `;
    const itemsResult = await pool.query(itemsQuery, [id]);
    
    const invoice = invoiceResult.rows[0];
    invoice.items = itemsResult.rows;
    
    res.json({ success: true, data: invoice });
  } catch (error) {
    logger.error('Error fetching invoice:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create invoice
router.post('/invoices', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    const {
      patient_id, encounter_id, invoice_type, payment_method,
      payment_terms, notes, items
    } = req.body;
    
    // Create invoice
    const invoiceQuery = `
      INSERT INTO invoices (
        patient_id, encounter_id, invoice_type, payment_method,
        payment_terms, notes, billed_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;
    const invoiceResult = await client.query(invoiceQuery, [
      patient_id, encounter_id, invoice_type, payment_method,
      payment_terms, notes, req.user?.userId
    ]);
    
    const invoice = invoiceResult.rows[0];
    
    // Add items
    for (const item of items) {
      const itemQuery = `
        INSERT INTO invoice_items (
          invoice_id, item_type, item_description, quantity, unit_price,
          discount_amount, tax_amount, provider_id, department_id, service_date
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `;
      await client.query(itemQuery, [
        invoice.id, item.item_type, item.item_description,
        item.quantity || 1, item.unit_price,
        item.discount_amount || 0, item.tax_amount || 0,
        item.provider_id, item.department_id, item.service_date
      ]);
    }
    
    await client.query('COMMIT');
    
    logger.info(`Invoice created: ${invoice.invoice_number}`);
    res.status(201).json({ success: true, data: invoice });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error creating invoice:', error);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    client.release();
  }
});

// Update invoice status
router.put('/invoices/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    const query = `
      UPDATE invoices
      SET status = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
    `;
    const result = await pool.query(query, [status, id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Invoice not found' });
    }
    
    logger.info(`Invoice ${id} status updated to ${status}`);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Error updating invoice status:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// PAYMENTS
// ============================================

// Get all payments
router.get('/payments', async (req, res) => {
  try {
    const { patient_id, payment_method, date_from, date_to, page = 1, limit = 25 } = req.query;
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT bp.*,
             p.first_name || ' ' || p.last_name as patient_name,
             p.uhid,
             s.first_name || ' ' || s.last_name as received_by_name
      FROM billing_payments bp
      LEFT JOIN patients p ON bp.patient_id = p.id
      LEFT JOIN staff s ON bp.received_by = s.id
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;
    
    if (patient_id) {
      query += ` AND bp.patient_id = $${paramIndex}`;
      params.push(patient_id);
      paramIndex++;
    }
    
    if (payment_method) {
      query += ` AND bp.payment_method = $${paramIndex}`;
      params.push(payment_method);
      paramIndex++;
    }
    
    if (date_from) {
      query += ` AND bp.payment_date >= $${paramIndex}`;
      params.push(date_from);
      paramIndex++;
    }
    
    if (date_to) {
      query += ` AND bp.payment_date <= $${paramIndex}`;
      params.push(date_to);
      paramIndex++;
    }
    
    query += ` ORDER BY bp.payment_date DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);
    
    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows, count: result.rows.length });
  } catch (error) {
    logger.error('Error fetching payments:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Record payment
router.post('/payments', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    const {
      patient_id, invoice_id, payment_method, amount,
      mpesa_transaction_id, card_last_4, cheque_number,
      bank_reference, notes, allocations
    } = req.body;
    
    // Create payment
    const paymentQuery = `
      INSERT INTO billing_payments (
        patient_id, invoice_id, payment_method, amount,
        mpesa_transaction_id, card_last_4, cheque_number,
        bank_reference, notes, received_by, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `;
    const paymentResult = await client.query(paymentQuery, [
      patient_id, invoice_id, payment_method, amount,
      mpesa_transaction_id, card_last_4, cheque_number,
      bank_reference, notes, req.user?.userId, 'completed'
    ]);
    
    const payment = paymentResult.rows[0];
    
    // Allocate to invoices
    if (allocations && allocations.length > 0) {
      for (const alloc of allocations) {
        const allocQuery = `
          INSERT INTO payment_allocations (payment_id, invoice_id, allocated_amount)
          VALUES ($1, $2, $3)
        `;
        await client.query(allocQuery, [payment.id, alloc.invoice_id, alloc.allocated_amount]);
      }
    } else if (invoice_id) {
      // Allocate full amount to single invoice
      const allocQuery = `
        INSERT INTO payment_allocations (payment_id, invoice_id, allocated_amount)
        VALUES ($1, $2, $3)
      `;
      await client.query(allocQuery, [payment.id, invoice_id, amount]);
    }
    
    await client.query('COMMIT');
    
    logger.info(`Payment recorded: ${payment.payment_number}, Amount: ${amount}`);
    res.status(201).json({ success: true, data: payment });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error recording payment:', error);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    client.release();
  }
});

// ============================================
// BILLING STATISTICS
// ============================================

router.get('/statistics', async (req, res) => {
  try {
    const query = `
      SELECT
        (SELECT COUNT(*) FROM invoices WHERE status = 'issued') as invoices_issued,
        (SELECT COUNT(*) FROM invoices WHERE status = 'overdue') as invoices_overdue,
        (SELECT COALESCE(SUM(balance_due), 0) FROM invoices WHERE status IN ('issued', 'partially-paid', 'overdue')) as total_outstanding,
        (SELECT COALESCE(SUM(amount), 0) FROM billing_payments WHERE DATE(payment_date) = CURRENT_DATE) as payments_today,
        (SELECT COALESCE(SUM(total_amount), 0) FROM invoices WHERE DATE(invoice_date) = CURRENT_DATE) as invoiced_today,
        (SELECT COUNT(*) FROM insurance_claims WHERE status = 'pending') as pending_claims
    `;
    const result = await pool.query(query);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Error fetching billing statistics:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get patient billing summary
router.get('/patients/:patientId/summary', async (req, res) => {
  try {
    const { patientId } = req.params;
    
    const query = `
      SELECT
        p.first_name || ' ' || p.last_name as patient_name,
        p.uhid,
        (SELECT COALESCE(SUM(total_amount), 0) FROM invoices WHERE patient_id = p.id) as total_billed,
        (SELECT COALESCE(SUM(amount), 0) FROM billing_payments WHERE patient_id = p.id AND status = 'completed') as total_paid,
        (SELECT COALESCE(SUM(balance_due), 0) FROM invoices WHERE patient_id = p.id AND status IN ('issued', 'partially-paid', 'overdue')) as balance_due,
        (SELECT COUNT(*) FROM invoices WHERE patient_id = p.id AND status = 'overdue') as overdue_invoices
      FROM patients p
      WHERE p.id = $1
    `;
    const result = await pool.query(query, [patientId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Patient not found' });
    }
    
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Error fetching patient billing summary:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;

