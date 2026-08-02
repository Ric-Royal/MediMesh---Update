const { v4: uuidv4 } = require('uuid');
const { getDB } = require('../utils/database');
const { logger } = require('../utils/logger');

/**
 * Payment Model for handling M-Pesa transactions
 * Stores payment records for patient bills and consultations
 */
class Payment {
  constructor(data) {
    this.id = data.id;
    this.patient_id = data.patient_id;
    this.medical_record_id = data.medical_record_id || null;
    this.invoice_id = data.invoice_id || null;
    this.amount = parseFloat(data.amount);
    this.currency = data.currency || 'KES';
    this.phone_number = data.phone_number;
    this.payment_method = data.payment_method; // 'mpesa', 'cash', 'card', 'insurance'
    this.transaction_type = data.transaction_type; // 'consultation', 'lab', 'prescription', 'procedure'
    this.status = data.status; // 'pending', 'completed', 'failed', 'cancelled', 'refunded'
    this.mpesa_checkout_request_id = data.mpesa_checkout_request_id || null;
    this.mpesa_merchant_request_id = data.mpesa_merchant_request_id || null;
    this.mpesa_receipt_number = data.mpesa_receipt_number || null;
    this.mpesa_transaction_date = data.mpesa_transaction_date || null;
    this.mpesa_prompt_sent_at = data.mpesa_prompt_sent_at || null;
    this.mpesa_prompt_expires_at = data.mpesa_prompt_expires_at || null;
    this.mpesa_attempt = Number(data.mpesa_attempt || 1);
    this.description = data.description || null;
    this.metadata = data.metadata || {};
    this.created_at = data.created_at;
    this.updated_at = data.updated_at;
    this.created_by = data.created_by;
    this.patient_name = data.patient_name || null;
    this.uhid = data.uhid || null;
    this.invoice_number = data.invoice_number || null;
  }

  /**
   * Find payment by ID
   */
  static async findById(id) {
    try {
      const db = getDB();
      const query = 'SELECT * FROM payments WHERE id = $1';
      const result = await db.query(query, [id]);
      
      if (result.rows.length === 0) {
        return null;
      }
      
      return new Payment(result.rows[0]);
    } catch (error) {
      logger.error('Error finding payment by ID:', error);
      throw error;
    }
  }

  /**
   * Find payment by M-Pesa Checkout Request ID
   */
  static async findByCheckoutRequestId(checkoutRequestId) {
    try {
      const db = getDB();
      const query = 'SELECT * FROM payments WHERE mpesa_checkout_request_id = $1';
      const result = await db.query(query, [checkoutRequestId]);
      
      if (result.rows.length === 0) {
        return null;
      }
      
      return new Payment(result.rows[0]);
    } catch (error) {
      logger.error('Error finding payment by checkout request ID:', error);
      throw error;
    }
  }

  /**
   * Find all payments for a patient
   */
  static async findByPatientId(patientId, limit = 50, offset = 0) {
    try {
      const db = getDB();
      const query = `
        SELECT p.*, pat.first_name, pat.last_name
        FROM payments p
        LEFT JOIN patients pat ON p.patient_id = pat.id
        WHERE p.patient_id = $1
        ORDER BY p.created_at DESC
        LIMIT $2 OFFSET $3
      `;
      const result = await db.query(query, [patientId, limit, offset]);
      
      return result.rows.map(row => new Payment(row));
    } catch (error) {
      logger.error('Error finding payments by patient ID:', error);
      throw error;
    }
  }

  /**
   * Search payments with an explicit allowlist of filters and bounded paging.
   */
  static async search(filters = {}) {
    const db = getDB();
    const clauses = [];
    const values = [];
    const addFilter = (sql, value) => {
      values.push(value);
      clauses.push(sql.replace('?', `$${values.length}`));
    };

    if (filters.patient_id) addFilter('p.patient_id = ?', filters.patient_id);
    if (filters.status) addFilter('p.status = ?', filters.status);
    if (filters.payment_method) addFilter('p.payment_method = ?', filters.payment_method);
    if (filters.start_date) addFilter('p.created_at >= ?', filters.start_date);
    if (filters.end_date) addFilter('p.created_at <= ?', filters.end_date);

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const countResult = await db.query(`SELECT COUNT(*)::int AS total FROM payments p ${where}`, values);

    const limit = Math.min(100, Math.max(1, Number(filters.limit) || 50));
    const offset = Math.max(0, Number(filters.offset) || 0);
    const pageValues = [...values, limit, offset];
    const result = await db.query(`
      SELECT p.*,
             CONCAT_WS(' ', pat.first_name, pat.last_name) AS patient_name,
             pat.uhid,
             i.invoice_number
      FROM payments p
      LEFT JOIN patients pat ON pat.id = p.patient_id
      LEFT JOIN invoices i ON i.id = p.invoice_id
      ${where}
      ORDER BY p.created_at DESC, p.id DESC
      LIMIT $${values.length + 1} OFFSET $${values.length + 2}
    `, pageValues);

    return {
      items: result.rows.map(row => new Payment(row)),
      total: countResult.rows[0]?.total || 0,
      limit,
      offset,
    };
  }

  /**
   * Get payment statistics
   */
  static async getStatistics(filters = {}) {
    try {
      const db = getDB();
      
      let whereClause = '';
      const values = [];
      
      if (filters.start_date && filters.end_date) {
        values.push(filters.start_date, filters.end_date);
        whereClause = `WHERE created_at BETWEEN $1 AND $2`;
      }
      
      const query = `
        SELECT 
          COUNT(*) as total_transactions,
          SUM(CASE WHEN status = 'completed' THEN amount ELSE 0 END) as total_revenue,
          SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END) as pending_amount,
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as successful_transactions,
          COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_transactions,
          COUNT(CASE WHEN payment_method = 'mpesa' THEN 1 END) as mpesa_transactions
        FROM payments
        ${whereClause}
      `;
      
      const result = await db.query(query, values);
      return result.rows[0];
    } catch (error) {
      logger.error('Error getting payment statistics:', error);
      throw error;
    }
  }

  /**
   * Create a new payment record
   */
  static async create(data, createdBy, executor = getDB()) {
    try {
      const id = uuidv4();

      const query = `
        INSERT INTO payments (
          id, patient_id, medical_record_id, invoice_id, amount, currency, phone_number,
          payment_method, transaction_type, status, mpesa_checkout_request_id,
          mpesa_merchant_request_id, mpesa_prompt_sent_at, mpesa_prompt_expires_at,
          mpesa_attempt, description, metadata, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
        RETURNING *
      `;

      const values = [
        id,
        data.patient_id,
        data.medical_record_id || null,
        data.invoice_id || null,
        data.amount,
        data.currency || 'KES',
        data.phone_number,
        data.payment_method,
        data.transaction_type,
        data.status || 'pending',
        data.mpesa_checkout_request_id || null,
        data.mpesa_merchant_request_id || null,
        data.mpesa_prompt_sent_at || null,
        data.mpesa_prompt_expires_at || null,
        data.mpesa_attempt || 1,
        data.description || null,
        JSON.stringify(data.metadata || {}),
        createdBy
      ];

      const result = await executor.query(query, values);
      const payment = new Payment(result.rows[0]);
      
      logger.info('Payment record created', { 
        paymentId: payment.id, 
        patientId: payment.patient_id,
        amount: payment.amount,
        method: payment.payment_method,
        createdBy 
      });
      
      return payment;
    } catch (error) {
      logger.error('Error creating payment:', error);
      throw error;
    }
  }

  /**
   * Update payment status and M-Pesa details
   */
  async updateStatus(status, mpesaData = {}) {
    try {
      const db = getDB();
      
      const query = `
        UPDATE payments 
        SET 
          status = $1,
          mpesa_receipt_number = COALESCE($2, mpesa_receipt_number),
          mpesa_transaction_date = COALESCE($3, mpesa_transaction_date),
          mpesa_checkout_request_id = COALESCE($4, mpesa_checkout_request_id),
          mpesa_merchant_request_id = COALESCE($5, mpesa_merchant_request_id),
          mpesa_prompt_sent_at = COALESCE($6, mpesa_prompt_sent_at),
          mpesa_prompt_expires_at = COALESCE($7, mpesa_prompt_expires_at),
          metadata = $8,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $9
        RETURNING *
      `;

      const updatedMetadata = {
        ...this.metadata,
        ...mpesaData
      };

      const values = [
        status,
        mpesaData.receipt_number || null,
        mpesaData.transaction_date || null,
        mpesaData.checkout_request_id || null,
        mpesaData.merchant_request_id || null,
        mpesaData.prompt_sent_at || null,
        mpesaData.prompt_expires_at || null,
        JSON.stringify(updatedMetadata),
        this.id
      ];

      const result = await db.query(query, values);
      
      logger.info('Payment status updated', {
        paymentId: this.id,
        oldStatus: this.status,
        newStatus: status,
        mpesaReceipt: mpesaData.receipt_number
      });

      return new Payment(result.rows[0]);
    } catch (error) {
      logger.error('Error updating payment status:', error);
      throw error;
    }
  }

  /**
   * Create payments table
   */
  static async createTable() {
    try {
      const db = getDB();
      
      const query = `
        CREATE TABLE IF NOT EXISTS payments (
          id UUID PRIMARY KEY,
          patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
          medical_record_id UUID REFERENCES medical_records(id) ON DELETE SET NULL,
          invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
          amount DECIMAL(10, 2) NOT NULL,
          currency VARCHAR(3) DEFAULT 'KES',
          phone_number VARCHAR(20) NOT NULL,
          payment_method VARCHAR(20) NOT NULL CHECK (payment_method IN ('mpesa', 'cash', 'card', 'insurance')),
          transaction_type VARCHAR(50) NOT NULL,
          status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'cancelled', 'refunded')),
          mpesa_checkout_request_id VARCHAR(100) UNIQUE,
          mpesa_merchant_request_id VARCHAR(100),
          mpesa_receipt_number VARCHAR(50),
          mpesa_transaction_date TIMESTAMP,
          mpesa_prompt_sent_at TIMESTAMP,
          mpesa_prompt_expires_at TIMESTAMP,
          mpesa_attempt INTEGER NOT NULL DEFAULT 1 CHECK (mpesa_attempt > 0),
          description TEXT,
          metadata JSONB DEFAULT '{}',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          created_by VARCHAR(100) NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_payments_patient_id ON payments(patient_id);
        CREATE INDEX IF NOT EXISTS idx_payments_medical_record_id ON payments(medical_record_id);
        ALTER TABLE payments ADD COLUMN IF NOT EXISTS invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL;
        ALTER TABLE payments ADD COLUMN IF NOT EXISTS mpesa_merchant_request_id VARCHAR(100);
        ALTER TABLE payments ADD COLUMN IF NOT EXISTS mpesa_prompt_sent_at TIMESTAMP;
        ALTER TABLE payments ADD COLUMN IF NOT EXISTS mpesa_prompt_expires_at TIMESTAMP;
        ALTER TABLE payments ADD COLUMN IF NOT EXISTS mpesa_attempt INTEGER NOT NULL DEFAULT 1;
        CREATE INDEX IF NOT EXISTS idx_payments_invoice_id ON payments(invoice_id);
        CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
        CREATE INDEX IF NOT EXISTS idx_payments_checkout_request ON payments(mpesa_checkout_request_id);
        CREATE INDEX IF NOT EXISTS idx_payments_active_mpesa_prompt
          ON payments(invoice_id, mpesa_prompt_expires_at)
          WHERE payment_method = 'mpesa' AND status = 'pending';
        CREATE INDEX IF NOT EXISTS idx_payments_created_at ON payments(created_at DESC);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_mpesa_receipt_unique
          ON payments(mpesa_receipt_number) WHERE mpesa_receipt_number IS NOT NULL;
        CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_mpesa_merchant_request_unique
          ON payments(mpesa_merchant_request_id) WHERE mpesa_merchant_request_id IS NOT NULL;
        CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_payments_mpesa_transaction_unique
          ON billing_payments(mpesa_transaction_id) WHERE mpesa_transaction_id IS NOT NULL;
        CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_allocations_payment_invoice_unique
          ON payment_allocations(payment_id, invoice_id);

        -- Older billing writes stored invoice_id on the ledger row but did not
        -- create an allocation. Backfill only missing one-to-one allocations;
        -- the existing allocation trigger then reconciles invoice.amount_paid.
        INSERT INTO payment_allocations (payment_id, invoice_id, allocated_amount)
        SELECT bp.id, bp.invoice_id, bp.amount
        FROM billing_payments bp
        JOIN invoices i ON i.id = bp.invoice_id
        WHERE bp.invoice_id IS NOT NULL
          AND bp.status = 'completed'
          AND bp.amount <= i.balance_due
          AND NOT EXISTS (
            SELECT 1 FROM payment_allocations pa
            WHERE pa.payment_id = bp.id AND pa.invoice_id = bp.invoice_id
          );
      `;

      await db.query(query);
      logger.info('Payments table created successfully');
    } catch (error) {
      logger.error('Error creating payments table:', error);
      throw error;
    }
  }
}

module.exports = Payment;

