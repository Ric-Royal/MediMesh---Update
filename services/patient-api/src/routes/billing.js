const express = require('express');
const router = express.Router();
const { getDB } = require('../utils/database');
const { logger } = require('../utils/logger');
const { authorize } = require('../middleware/auth');

router.use(authorize(['admin', 'billing']));

class BillingRequestError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

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
             i.total_amount as total,
             p.first_name || ' ' || p.last_name as patient_name,
             p.uhid,
             e.encounter_type,
             (SELECT COUNT(*) FROM invoice_line_items WHERE invoice_id = i.id) as item_count
      FROM invoices i
      LEFT JOIN patients p ON i.patient_id = p.id
      LEFT JOIN encounters e ON i.encounter_id = e.id
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
    
    const result = await getDB().query(query, params);
    res.json({ success: true, data: result.rows, count: result.rows.length });
  } catch (error) {
    logger.error('Error fetching invoices:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get invoice by encounter ID (real-time invoice for patient journey)
// NOTE: This must come BEFORE /invoices/:id to avoid route collision
router.get('/invoices/encounter/:encounterId', async (req, res) => {
  try {
    const { encounterId } = req.params;
    
    // Get invoice with all details
    const invoiceQuery = `
      SELECT i.*,
             p.first_name || ' ' || p.last_name as patient_name,
             p.uhid, p.phone as phone_number,
             e.encounter_type, e.status as encounter_status
      FROM invoices i
      LEFT JOIN patients p ON i.patient_id = p.id
      LEFT JOIN encounters e ON i.encounter_id = e.id
      WHERE i.encounter_id = $1
    `;
    const invoiceResult = await getDB().query(invoiceQuery, [encounterId]);
    
    if (invoiceResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Invoice not found for this encounter' });
    }
    
    // Get line items with detailed breakdown
    const lineItemsQuery = `
      SELECT ili.*,
             s.first_name || ' ' || s.last_name as provider_name
      FROM invoice_line_items ili
      LEFT JOIN staff s ON ili.provider_id = s.id
      WHERE ili.invoice_id = $1
      ORDER BY ili.billed_at
    `;
    const lineItemsResult = await getDB().query(lineItemsQuery, [invoiceResult.rows[0].id]);
    
    const invoice = invoiceResult.rows[0];
    invoice.line_items = lineItemsResult.rows;
    
    res.json({ success: true, data: invoice });
  } catch (error) {
    logger.error('Error fetching invoice by encounter:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get pending invoices for billing queue
// NOTE: This must come BEFORE /invoices/:id to avoid route collision
router.get('/invoices/pending-payment', async (req, res) => {
  try {
    const query = `
      SELECT i.*,
             i.total_amount as total,
             p.first_name || ' ' || p.last_name as patient_name,
             p.uhid,
             e.encounter_type,
             (SELECT COUNT(*) FROM invoice_line_items WHERE invoice_id = i.id) as item_count
      FROM invoices i
      LEFT JOIN patients p ON i.patient_id = p.id
      LEFT JOIN encounters e ON i.encounter_id = e.id
      WHERE i.status IN ('draft', 'issued', 'partially-paid', 'overdue')
        AND i.balance_due > 0
      ORDER BY i.invoice_date DESC
    `;
    const result = await getDB().query(query);
    res.json({ success: true, data: result.rows, count: result.rows.length });
  } catch (error) {
    logger.error('Error fetching pending invoices:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get invoice by ID (with items)
// NOTE: This must come AFTER specific routes like /invoices/pending-payment
router.get('/invoices/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get invoice
    const invoiceQuery = `
      SELECT i.*,
             i.total_amount as total,
             p.first_name || ' ' || p.last_name as patient_name,
             p.uhid, p.phone as phone_number,
             e.encounter_type,
             s.first_name || ' ' || s.last_name as billed_by_name
      FROM invoices i
      LEFT JOIN patients p ON i.patient_id = p.id
      LEFT JOIN encounters e ON i.encounter_id = e.id
      LEFT JOIN staff s ON i.billed_by = s.id
      WHERE i.id = $1
    `;
    const invoiceResult = await getDB().query(invoiceQuery, [id]);
    
    if (invoiceResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Invoice not found' });
    }
    
    // Get line items (from automatic invoicing system)
    const lineItemsQuery = `
      SELECT ili.*,
             s.first_name || ' ' || s.last_name as provider_name
      FROM invoice_line_items ili
      LEFT JOIN staff s ON ili.provider_id = s.id
      WHERE ili.invoice_id = $1
      ORDER BY ili.billed_at
    `;
    const lineItemsResult = await getDB().query(lineItemsQuery, [id]);
    
    const invoice = invoiceResult.rows[0];
    invoice.line_items = lineItemsResult.rows;
    
    res.json({ success: true, data: invoice });
  } catch (error) {
    logger.error('Error fetching invoice:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Prices and providers are derived from completed clinical services by the
// automatic invoicing triggers. Arbitrary client-authored invoices are blocked.
router.post('/invoices', (req, res) => {
  res.status(405).json({
    success: false,
    error: 'Invoices are generated from verified service catalog entries'
  });
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
    const result = await getDB().query(query, [status, id]);
    
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
    
    const result = await getDB().query(query, params);
    res.json({ success: true, data: result.rows, count: result.rows.length });
  } catch (error) {
    logger.error('Error fetching payments:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Record and allocate a manual payment. M-Pesa is intentionally excluded:
// only a reconciled Daraja callback may write an M-Pesa ledger entry.
router.post('/payments', authorize(['admin', 'billing']), async (req, res) => {
  const client = await getDB().connect();
  try {
    await client.query('BEGIN');

    const {
      patient_id, invoice_id, payment_method, amount,
      card_last_4, cheque_number,
      bank_reference, notes, allocations
    } = req.body;

    const allowedMethods = ['cash', 'card', 'bank-transfer', 'cheque', 'insurance', 'corporate', 'waiver'];
    const numericAmount = Number(amount);
    if (!patient_id) throw new BillingRequestError('Patient is required');
    if (!allowedMethods.includes(payment_method)) {
      throw new BillingRequestError(
        payment_method === 'mpesa'
          ? 'Use the M-Pesa STK request action; M-Pesa cannot be recorded manually'
          : 'Unsupported payment method'
      );
    }
    if (
      !Number.isFinite(numericAmount) || numericAmount <= 0 ||
      Math.abs(numericAmount * 100 - Math.round(numericAmount * 100)) > 1e-7
    ) {
      throw new BillingRequestError('Payment amount must be positive and use no more than two decimal places');
    }

    const requestedAllocations = Array.isArray(allocations) && allocations.length
      ? allocations
      : invoice_id
        ? [{ invoice_id, allocated_amount: numericAmount }]
        : [];
    if (!requestedAllocations.length) {
      throw new BillingRequestError('At least one invoice allocation is required');
    }

    const normalizedAllocations = requestedAllocations.map((allocation) => ({
      invoice_id: allocation.invoice_id,
      allocated_amount: Number(allocation.allocated_amount)
    }));
    if (normalizedAllocations.some((allocation) =>
      !allocation.invoice_id || !Number.isFinite(allocation.allocated_amount) ||
      allocation.allocated_amount <= 0 ||
      Math.abs(allocation.allocated_amount * 100 - Math.round(allocation.allocated_amount * 100)) > 1e-7
    )) {
      throw new BillingRequestError('Every allocation needs an invoice and a positive amount');
    }

    const invoiceIds = normalizedAllocations.map((allocation) => allocation.invoice_id);
    if (new Set(invoiceIds).size !== invoiceIds.length) {
      throw new BillingRequestError('An invoice may only appear once in a payment allocation');
    }
    const allocatedTotal = normalizedAllocations.reduce(
      (total, allocation) => total + Math.round(allocation.allocated_amount * 100),
      0
    );
    if (allocatedTotal !== Math.round(numericAmount * 100)) {
      throw new BillingRequestError('Allocated amounts must equal the payment amount');
    }

    // Lock invoices in a stable order so simultaneous cashiers cannot overpay
    // an invoice or deadlock when applying split payments.
    const invoiceResult = await client.query(`
      SELECT * FROM invoices
      WHERE id = ANY($1::uuid[])
      ORDER BY id
      FOR UPDATE
    `, [invoiceIds]);
    if (invoiceResult.rows.length !== invoiceIds.length) {
      throw new BillingRequestError('One or more invoices were not found', 404);
    }
    const invoicesById = new Map(invoiceResult.rows.map((invoice) => [invoice.id, invoice]));
    const reservationsResult = await client.query(`
      SELECT invoice_id, COALESCE(SUM(amount), 0) AS reserved
      FROM payments
      WHERE invoice_id = ANY($1::uuid[])
        AND payment_method = 'mpesa'
        AND status = 'pending'
        AND created_at >= NOW() - INTERVAL '30 minutes'
      GROUP BY invoice_id
    `, [invoiceIds]);
    const reservationsByInvoice = new Map(
      reservationsResult.rows.map((reservation) => [reservation.invoice_id, Number(reservation.reserved)])
    );
    for (const allocation of normalizedAllocations) {
      const invoice = invoicesById.get(allocation.invoice_id);
      if (invoice.patient_id !== patient_id) {
        throw new BillingRequestError('Every allocated invoice must belong to the selected patient');
      }
      if (['paid', 'cancelled', 'refunded'].includes(invoice.status)) {
        throw new BillingRequestError(`Invoice ${invoice.invoice_number} cannot receive payment while ${invoice.status}`, 409);
      }
      const balance = Number(invoice.balance_due ?? (Number(invoice.total_amount) - Number(invoice.amount_paid || 0)));
      const available = balance - (reservationsByInvoice.get(invoice.id) || 0);
      if (!Number.isFinite(balance) || allocation.allocated_amount > available + 0.005) {
        throw new BillingRequestError(
          available < balance
            ? `Invoice ${invoice.invoice_number} has an active M-Pesa request for part of its balance`
            : `Allocation exceeds the balance for invoice ${invoice.invoice_number}`,
          409
        );
      }
    }

    const ledgerInvoiceId = normalizedAllocations.length === 1
      ? normalizedAllocations[0].invoice_id
      : null;
    const paymentQuery = `
      INSERT INTO billing_payments (
        patient_id, invoice_id, payment_method, amount,
        card_last_4, cheque_number,
        bank_reference, notes, received_by, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'completed')
      RETURNING *
    `;
    const paymentResult = await client.query(paymentQuery, [
      patient_id, ledgerInvoiceId, payment_method, numericAmount,
      card_last_4, cheque_number, bank_reference, notes, req.user.id
    ]);

    const payment = paymentResult.rows[0];

    for (const allocation of normalizedAllocations) {
      await client.query(`
        INSERT INTO payment_allocations (payment_id, invoice_id, allocated_amount)
        VALUES ($1, $2, $3)
      `, [payment.id, allocation.invoice_id, allocation.allocated_amount]);
      await client.query(`
        UPDATE invoices SET payment_method = $2, updated_at = NOW()
        WHERE id = $1
      `, [allocation.invoice_id, payment_method]);
    }

    await client.query('COMMIT');

    logger.info('Manual billing payment recorded', {
      paymentId: payment.id,
      paymentNumber: payment.payment_number,
      amount: numericAmount,
      invoiceIds,
      userId: req.user.id
    });
    res.status(201).json({ success: true, data: payment });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error recording payment:', error);
    res.status(error.status || 500).json({
      success: false,
      error: error instanceof BillingRequestError ? error.message : 'Payment could not be recorded'
    });
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
        (SELECT COUNT(*) FROM invoices WHERE status IN ('issued', 'partially-paid', 'overdue')) as open_invoices,
        (SELECT COUNT(*) FROM invoices WHERE status = 'overdue') as invoices_overdue,
        (SELECT COALESCE(SUM(balance_due), 0) FROM invoices WHERE status IN ('issued', 'partially-paid', 'overdue')) as total_outstanding,
        (SELECT COALESCE(SUM(amount), 0) FROM billing_payments WHERE DATE(payment_date) = CURRENT_DATE AND status = 'completed') as payments_today,
        (SELECT COALESCE(SUM(total_amount), 0) FROM invoices WHERE DATE(invoice_date) = CURRENT_DATE) as invoiced_today,
        (SELECT COUNT(*) FROM insurance_claims WHERE status = 'pending') as pending_claims
    `;
    const result = await getDB().query(query);
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
    const result = await getDB().query(query, [patientId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Patient not found' });
    }
    
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Error fetching patient billing summary:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// REAL-TIME INVOICE MANAGEMENT
// ============================================

// Finalize invoice (mark ready for payment)
router.put('/invoices/:id/finalize', async (req, res) => {
  try {
    const { id } = req.params;
    
    const query = `
      UPDATE invoices
      SET status = 'issued', last_updated = NOW()
      WHERE id = $1
      RETURNING *
    `;
    const result = await getDB().query(query, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Invoice not found' });
    }
    
    logger.info(`Invoice ${id} finalized for payment`);
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Error finalizing invoice:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Process payment for invoice
router.post('/invoices/:id/payment', authorize(['admin', 'billing']), async (req, res) => {
  const client = await getDB().connect();
  try {
    await client.query('BEGIN');
    
    const { id } = req.params;
    const { payment_method, amount, reference_number, notes } = req.body;
    const allowedMethods = ['cash', 'card', 'bank-transfer', 'cheque', 'insurance', 'corporate', 'waiver'];
    const numericAmount = Number(amount);
    if (payment_method === 'mpesa') {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, error: 'Use the M-Pesa STK request action; M-Pesa cannot be recorded manually' });
    }
    if (!allowedMethods.includes(payment_method)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, error: 'Unsupported payment method' });
    }
    if (
      !Number.isFinite(numericAmount) || numericAmount <= 0 ||
      Math.abs(numericAmount * 100 - Math.round(numericAmount * 100)) > 1e-7
    ) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, error: 'Payment amount must be positive and use no more than two decimal places' });
    }
    
    // Get invoice
    const invoiceResult = await client.query('SELECT * FROM invoices WHERE id = $1 FOR UPDATE', [id]);
    if (invoiceResult.rows.length === 0) {
      throw new BillingRequestError('Invoice not found', 404);
    }
    
    const invoice = invoiceResult.rows[0];
    if (['paid', 'cancelled', 'refunded'].includes(invoice.status)) {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, error: `Invoice cannot receive payment while ${invoice.status}` });
    }
    const balanceDue = Number(invoice.balance_due ?? (Number(invoice.total_amount) - Number(invoice.amount_paid || 0)));
    const reservationResult = await client.query(`
      SELECT COALESCE(SUM(amount), 0) AS reserved
      FROM payments
      WHERE invoice_id = $1
        AND payment_method = 'mpesa'
        AND status = 'pending'
        AND created_at >= NOW() - INTERVAL '30 minutes'
    `, [id]);
    const availableBalance = balanceDue - Number(reservationResult.rows[0].reserved || 0);
    if (numericAmount > availableBalance + 0.005) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        error: availableBalance < balanceDue
          ? 'An active M-Pesa request reserves part of this invoice balance'
          : 'Payment amount exceeds invoice balance'
      });
    }
    
    // Create payment record
    const paymentQuery = `
      INSERT INTO billing_payments (
        patient_id, invoice_id, payment_method, amount,
        bank_reference, notes, received_by, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'completed')
      RETURNING *
    `;
    const paymentResult = await client.query(paymentQuery, [
      invoice.patient_id, id, payment_method, amount,
      reference_number, notes, req.user?.id
    ]);

    // The allocation trigger is the single source of truth for amount_paid and
    // invoice payment status across cash, card and M-Pesa payments.
    await client.query(`
      INSERT INTO payment_allocations (payment_id, invoice_id, allocated_amount)
      VALUES ($1, $2, $3)
    `, [paymentResult.rows[0].id, id, numericAmount]);

    await client.query(`
      UPDATE invoices SET payment_method = $2, last_updated = NOW(), updated_at = NOW()
      WHERE id = $1
    `, [id, payment_method]);
    
    // Update encounter status to completed if all services done
    await client.query(`
      UPDATE encounters
      SET status = 'completed', updated_at = NOW()
      WHERE id = $1
        AND pending_lab_orders = 0
        AND pending_prescriptions = 0
        AND pending_radiology_orders = 0
        AND EXISTS (
          SELECT 1 FROM invoices paid_invoice
          WHERE paid_invoice.id = $2 AND paid_invoice.payment_status = 'paid'
        )
    `, [invoice.encounter_id, id]);

    await client.query(`
      UPDATE queue_entries
      SET status = 'completed',
          completed_at = COALESCE(completed_at, NOW()),
          updated_at = NOW(),
          notes = 'Payment completed; visit closed'
      WHERE encounter_id = $1
        AND queue_type = 'billing'
        AND status IN ('waiting', 'called', 'in-service', 'deferred')
        AND EXISTS (
          SELECT 1 FROM invoices paid_invoice
          WHERE paid_invoice.id = $2 AND paid_invoice.payment_status = 'paid'
        )
    `, [invoice.encounter_id, id]);
    
    await client.query('COMMIT');
    
    logger.info(`Payment processed for invoice ${id}: ${amount} via ${payment_method}`);
    res.json({ success: true, data: paymentResult.rows[0], message: 'Payment processed successfully' });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error processing payment:', error);
    res.status(error.status || 500).json({
      success: false,
      error: error instanceof BillingRequestError ? error.message : 'Payment could not be processed'
    });
  } finally {
    client.release();
  }
});

module.exports = router;

