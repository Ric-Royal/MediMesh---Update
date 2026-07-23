const express = require('express');
const Joi = require('joi');
const crypto = require('crypto');
const router = express.Router();

const Payment = require('../models/Payment');
const Patient = require('../models/Patient');
const { authorize } = require('../middleware/auth');
const { validate, validateQuery, validateParams, uuidSchema } = require('../utils/validation');
const { logger } = require('../utils/logger');
const mpesaService = require('../utils/mpesa');
const { getDB } = require('../utils/database');

/**
 * Payment validation schemas
 */
const paymentCreateSchema = Joi.object({
  patient_id: uuidSchema.required(),
  invoice_id: uuidSchema.required(),
  medical_record_id: uuidSchema.optional().allow(null),
  amount: Joi.number().positive().precision(2).required(),
  phone_number: Joi.string().pattern(/^(0|254|\+254)?[17]\d{8}$/).required(),
  payment_method: Joi.string().valid('cash', 'card', 'insurance').required(),
  transaction_type: Joi.string().required(),
  description: Joi.string().max(500).optional()
});

const mpesaPaymentSchema = Joi.object({
  patient_id: uuidSchema.required(),
  medical_record_id: uuidSchema.optional().allow(null),
  invoice_id: uuidSchema.required(),
  amount: Joi.number().integer().positive().required(),
  phone_number: Joi.string().pattern(/^(0|254|\+254)?[17]\d{8}$/).required(),
  transaction_type: Joi.string().required(),
  description: Joi.string().max(500).optional()
});

const MPESA_PROMPT_TTL_SECONDS = 60;

class PaymentRequestError extends Error {
  constructor(message, status = 400, details = {}) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

class CallbackReconciliationError extends Error {}

const normalizeCallbackPhone = (value) => {
  try {
    return mpesaService.formatPhoneNumber(String(value || ''));
  } catch (error) {
    throw new CallbackReconciliationError('M-Pesa callback phone number is invalid');
  }
};

const callbackTokenMatches = (expected, supplied) => {
  if (!expected || !supplied) return false;
  const expectedBuffer = Buffer.from(String(expected));
  const suppliedBuffer = Buffer.from(String(supplied));
  return expectedBuffer.length === suppliedBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, suppliedBuffer);
};

const maskIdentifier = (value) => value ? `***${String(value).slice(-6)}` : undefined;

const reserveInvoicePayment = async (paymentData, createdBy) => {
  const client = await getDB().connect();
  try {
    await client.query('BEGIN');
    const invoiceResult = await client.query(
      'SELECT * FROM invoices WHERE id = $1 FOR UPDATE',
      [paymentData.invoice_id]
    );
    if (!invoiceResult.rows.length) {
      throw new PaymentRequestError('Invoice not found', 404);
    }
    const invoice = invoiceResult.rows[0];
    if (invoice.patient_id !== paymentData.patient_id) {
      throw new PaymentRequestError('Invoice does not belong to this patient');
    }
    if (['paid', 'cancelled', 'refunded'].includes(invoice.status)) {
      throw new PaymentRequestError(`Invoice cannot receive payment while ${invoice.status}`, 409);
    }

    const balance = Number(invoice.balance_due ?? (Number(invoice.total_amount) - Number(invoice.amount_paid || 0)));
    // An unanswered STK prompt reserves the invoice for exactly one minute.
    // A late, authenticated success callback can still reconcile the expired
    // attempt, but staff are free to send a fresh prompt after this deadline.
    await client.query(`
      UPDATE payments
      SET status = 'failed',
          metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
            'failure_reason', 'M-Pesa prompt unanswered after 60 seconds',
            'expired_at', NOW()
          ),
          updated_at = NOW()
      WHERE invoice_id = $1
        AND payment_method = 'mpesa'
        AND status = 'pending'
        AND COALESCE(mpesa_prompt_expires_at, created_at + INTERVAL '60 seconds') <= NOW()
    `, [invoice.id]);
    const pendingResult = await client.query(
      `SELECT COALESCE(SUM(amount), 0) AS reserved,
              MIN(id::text) AS active_payment_id,
              GREATEST(0, CEIL(EXTRACT(EPOCH FROM (
                MIN(COALESCE(mpesa_prompt_expires_at, created_at + INTERVAL '60 seconds')) - NOW()
              ))))::int AS retry_after_seconds
       FROM payments
       WHERE invoice_id = $1
         AND payment_method = 'mpesa'
         AND status = 'pending'
         AND COALESCE(mpesa_prompt_expires_at, created_at + INTERVAL '60 seconds') > NOW()`,
      [invoice.id]
    );
    const available = balance - Number(pendingResult.rows[0].reserved || 0);
    if (paymentData.amount > available) {
      const activePrompt = pendingResult.rows[0];
      throw new PaymentRequestError(
        available > 0
          ? `Payment amount exceeds the unreserved invoice balance of KES ${available}`
          : `An M-Pesa prompt is active. It can be sent again in ${activePrompt.retry_after_seconds || 1} seconds.`,
        409,
        activePrompt.active_payment_id ? {
          active_payment_id: activePrompt.active_payment_id,
          retry_after_seconds: activePrompt.retry_after_seconds || 1
        } : {}
      );
    }

    const attemptResult = await client.query(`
      SELECT COALESCE(MAX(mpesa_attempt), 0)::int AS previous_attempt,
             (ARRAY_AGG(id ORDER BY created_at DESC))[1] AS previous_payment_id
      FROM payments
      WHERE invoice_id = $1 AND payment_method = 'mpesa'
    `, [invoice.id]);
    const attempt = Number(attemptResult.rows[0]?.previous_attempt || 0) + 1;
    const previousPaymentId = attemptResult.rows[0]?.previous_payment_id || null;
    const promptSentAt = new Date();
    const promptExpiresAt = new Date(promptSentAt.getTime() + MPESA_PROMPT_TTL_SECONDS * 1000);

    const payment = await Payment.create({
      ...paymentData,
      payment_method: 'mpesa',
      status: 'pending',
      mpesa_attempt: attempt,
      mpesa_prompt_sent_at: promptSentAt,
      mpesa_prompt_expires_at: promptExpiresAt,
      metadata: {
        attempt,
        ...(previousPaymentId ? { retry_of_payment_id: previousPaymentId } : {})
      }
    }, createdBy, client);
    await client.query('COMMIT');
    return payment;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const reconcileMpesaCallback = async (callbackData) => {
  const client = await getDB().connect();
  try {
    await client.query('BEGIN');
    const paymentResult = await client.query(
      'SELECT * FROM payments WHERE mpesa_checkout_request_id = $1 FOR UPDATE',
      [callbackData.checkoutRequestId]
    );
    if (!paymentResult.rows.length) {
      await client.query('ROLLBACK');
      return { outcome: 'not-found' };
    }

    const payment = paymentResult.rows[0];
    const expectedMerchantRequestId = payment.mpesa_merchant_request_id || payment.metadata?.merchant_request_id;
    if (!expectedMerchantRequestId || expectedMerchantRequestId !== callbackData.merchantRequestId) {
      throw new CallbackReconciliationError('M-Pesa merchant request ID did not reconcile');
    }

    if (payment.status === 'completed') {
      const repeatPhone = callbackData.success
        ? normalizeCallbackPhone(callbackData.phoneNumber)
        : null;
      if (
        callbackData.success &&
        payment.mpesa_receipt_number === callbackData.receiptNumber &&
        Number(payment.amount) === Number(callbackData.amount) &&
        mpesaService.formatPhoneNumber(payment.phone_number) === repeatPhone
      ) {
        await client.query('COMMIT');
        return { outcome: 'already-completed', paymentId: payment.id };
      }
      throw new CallbackReconciliationError('Completed payment received conflicting callback data');
    }
    if (payment.status === 'failed' && !callbackData.success) {
      await client.query('COMMIT');
      return { outcome: 'already-failed', paymentId: payment.id };
    }
    // An authenticated success callback is the financial source of truth. It
    // may arrive after a timeout/query marked the local request failed.
    if (!['pending', 'failed'].includes(payment.status)) {
      throw new CallbackReconciliationError(`Payment is not pending (status: ${payment.status})`);
    }

    if (!callbackData.success) {
      await client.query(`
        UPDATE payments
        SET status = 'failed',
            metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb,
            updated_at = NOW()
        WHERE id = $1 AND status = 'pending'
      `, [payment.id, JSON.stringify({
        result_code: callbackData.resultCode,
        result_desc: callbackData.resultDesc,
        merchant_request_id: callbackData.merchantRequestId,
        checkout_request_id: callbackData.checkoutRequestId
      })]);
      await client.query('COMMIT');
      return { outcome: 'failed', paymentId: payment.id };
    }

    // Only one prompt remains operationally active. A later success callback
    // from any superseded attempt is still accepted and becomes patient credit
    // if the invoice has already been settled by another attempt.
    await client.query(`
      UPDATE payments
      SET status = 'failed',
          metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
            'failure_reason', 'Superseded by a confirmed M-Pesa attempt',
            'superseded_by_payment_id', $2::text
          ),
          updated_at = NOW()
      WHERE invoice_id = $1
        AND id <> $2
        AND payment_method = 'mpesa'
        AND status = 'pending'
    `, [payment.invoice_id, payment.id]);

    const expectedPhone = mpesaService.formatPhoneNumber(payment.phone_number);
    const callbackPhone = normalizeCallbackPhone(callbackData.phoneNumber);
    const amount = Number(callbackData.amount);
    if (
      !Number.isSafeInteger(amount) || amount <= 0 ||
      amount !== Number(payment.amount) ||
      expectedPhone !== callbackPhone ||
      !callbackData.receiptNumber
    ) {
      throw new CallbackReconciliationError('M-Pesa amount, phone or receipt did not reconcile');
    }
    if (!payment.invoice_id) {
      throw new CallbackReconciliationError('M-Pesa payment is not linked to an invoice');
    }

    const invoiceResult = await client.query('SELECT * FROM invoices WHERE id = $1 FOR UPDATE', [payment.invoice_id]);
    if (!invoiceResult.rows.length) {
      throw new CallbackReconciliationError('Linked invoice was not found');
    }
    const invoice = invoiceResult.rows[0];
    if (invoice.patient_id !== payment.patient_id) {
      throw new CallbackReconciliationError('Payment patient does not match invoice patient');
    }
    const balance = Number(invoice.balance_due ?? (Number(invoice.total_amount) - Number(invoice.amount_paid || 0)));
    if (!Number.isFinite(balance) || balance < 0) {
      throw new CallbackReconciliationError('Linked invoice has an invalid balance');
    }
    // Another tender may have settled some or all of the bill while the prompt
    // was on the patient's phone. Never discard confirmed money: allocate what
    // remains and retain the rest as an unapplied patient credit for review.
    const allocatableAmount = Math.min(amount, balance);
    const unallocatedAmount = amount - allocatableAmount;

    const duplicatePayment = await client.query(
      'SELECT id FROM payments WHERE mpesa_receipt_number = $1 AND id <> $2 LIMIT 1',
      [callbackData.receiptNumber, payment.id]
    );
    if (duplicatePayment.rows.length) {
      throw new CallbackReconciliationError('M-Pesa receipt is already linked to another payment');
    }

    let billingPayment = await client.query(`
      INSERT INTO billing_payments (
        invoice_id, patient_id, payment_method, amount, currency,
        mpesa_transaction_id, status, received_by, notes
      ) VALUES ($1, $2, 'mpesa', $3, 'KES', $4, 'completed', $5, $6)
      ON CONFLICT (mpesa_transaction_id) WHERE mpesa_transaction_id IS NOT NULL DO NOTHING
      RETURNING id, invoice_id, patient_id, amount
    `, [invoice.id, invoice.patient_id, amount, callbackData.receiptNumber,
      payment.created_by, `M-Pesa checkout ${callbackData.checkoutRequestId}`]);

    if (!billingPayment.rows.length) {
      billingPayment = await client.query(
        `SELECT id, invoice_id, patient_id, amount
         FROM billing_payments WHERE mpesa_transaction_id = $1 FOR UPDATE`,
        [callbackData.receiptNumber]
      );
      const existing = billingPayment.rows[0];
      if (
        !existing || existing.invoice_id !== invoice.id ||
        existing.patient_id !== invoice.patient_id || Number(existing.amount) !== amount
      ) {
        throw new CallbackReconciliationError('M-Pesa receipt conflicts with an existing ledger payment');
      }
    }

    if (allocatableAmount > 0) {
      await client.query(`
        INSERT INTO payment_allocations (payment_id, invoice_id, allocated_amount)
        SELECT $1, $2, $3
        WHERE NOT EXISTS (
          SELECT 1 FROM payment_allocations WHERE payment_id = $1 AND invoice_id = $2
        )
      `, [billingPayment.rows[0].id, invoice.id, allocatableAmount]);
    }

    await client.query(`
      UPDATE invoices SET payment_method = 'mpesa', updated_at = NOW()
      WHERE id = $1 AND $2::numeric > 0
    `, [invoice.id, allocatableAmount]);

    await client.query(`
      UPDATE payments
      SET status = 'completed',
          mpesa_receipt_number = $2,
          mpesa_transaction_date = $3,
          metadata = COALESCE(metadata, '{}'::jsonb) || $4::jsonb,
          updated_at = NOW()
      WHERE id = $1 AND status IN ('pending', 'failed')
    `, [payment.id, callbackData.receiptNumber, callbackData.transactionDate,
      JSON.stringify({
        phone_number: callbackData.phoneNumber,
        amount_paid: amount,
        allocated_amount: allocatableAmount,
        unallocated_amount: unallocatedAmount,
        merchant_request_id: callbackData.merchantRequestId,
        checkout_request_id: callbackData.checkoutRequestId
      })]);

    if (invoice.encounter_id) {
      await client.query(`
        UPDATE encounters SET status = 'completed', updated_at = NOW()
        WHERE id = $1
          AND pending_lab_orders = 0
          AND pending_prescriptions = 0
          AND pending_radiology_orders = 0
          AND EXISTS (
            SELECT 1 FROM invoices paid_invoice
            WHERE paid_invoice.id = $2 AND paid_invoice.payment_status = 'paid'
          )
      `, [invoice.encounter_id, invoice.id]);
    }
    await client.query('COMMIT');
    return { outcome: 'completed', paymentId: payment.id, unallocatedAmount };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const paymentSearchSchema = Joi.object({
  patient_id: uuidSchema.optional(),
  status: Joi.string().valid('pending', 'completed', 'failed', 'cancelled', 'refunded').optional(),
  payment_method: Joi.string().valid('mpesa', 'cash', 'card', 'insurance').optional(),
  start_date: Joi.date().iso().optional(),
  end_date: Joi.date().iso().optional(),
  limit: Joi.number().integer().min(1).max(100).default(50),
  offset: Joi.number().integer().min(0).default(0)
});

/**
 * GET /api/payments - List all payments with filters
 */
router.get('/',
  authorize(['doctor', 'admin', 'nurse', 'billing']),
  validateQuery(paymentSearchSchema),
  async (req, res) => {
    try {
      const filters = req.validatedQuery;
      
      logger.info('Payments retrieved', {
        userId: req.user.id,
        filters
      });

      const result = await Payment.search(filters);
      res.json({
        success: true,
        data: result.items,
        pagination: {
          total: result.total,
          limit: result.limit,
          offset: result.offset,
          has_more: result.offset + result.items.length < result.total
        }
      });

    } catch (error) {
      logger.error('Error retrieving payments:', error);
      res.status(500).json({
        error: 'Failed to retrieve payments',
        message: error.message
      });
    }
  }
);

/**
 * GET /api/payments/statistics - Get payment statistics
 */
router.get('/statistics',
  authorize(['doctor', 'admin', 'billing']),
  async (req, res) => {
    try {
      const { start_date, end_date } = req.query;
      
      const stats = await Payment.getStatistics({ start_date, end_date });
      
      logger.info('Payment statistics retrieved', {
        userId: req.user.id
      });

      res.json({
        data: stats
      });

    } catch (error) {
      logger.error('Error retrieving payment statistics:', error);
      res.status(500).json({
        error: 'Failed to retrieve payment statistics',
        message: error.message
      });
    }
  }
);

/**
 * GET /api/payments/:id - Get a specific payment
 */
router.get('/:id',
  authorize(['doctor', 'nurse', 'admin', 'billing']),
  validateParams(Joi.object({ id: uuidSchema })),
  async (req, res) => {
    try {
      const { id } = req.validatedParams;
      
      const payment = await Payment.findById(id);
      
      if (!payment) {
        return res.status(404).json({
          error: 'Payment not found'
        });
      }

      logger.info('Payment retrieved', {
        userId: req.user.id,
        paymentId: payment.id
      });

      res.json({
        data: payment
      });

    } catch (error) {
      logger.error('Error retrieving payment:', error);
      res.status(500).json({
        error: 'Failed to retrieve payment',
        message: error.message
      });
    }
  }
);

/**
 * GET /api/payments/patient/:patientId - Get all payments for a patient
 */
router.get('/patient/:patientId',
  authorize(['doctor', 'nurse', 'admin', 'billing']),
  validateParams(Joi.object({ patientId: uuidSchema })),
  validateQuery(Joi.object({
    limit: Joi.number().integer().min(1).max(100).default(50),
    offset: Joi.number().integer().min(0).default(0)
  })),
  async (req, res) => {
    try {
      const { patientId } = req.validatedParams;
      const { limit, offset } = req.validatedQuery;
      
      // Verify patient exists
      const patient = await Patient.findById(patientId);
      if (!patient) {
        return res.status(404).json({
          error: 'Patient not found'
        });
      }

      const payments = await Payment.findByPatientId(patientId, limit, offset);

      logger.info('Patient payments retrieved', {
        userId: req.user.id,
        patientId,
        count: payments.length
      });

      res.json({
        data: payments,
        pagination: {
          limit,
          offset,
          has_more: payments.length === limit
        }
      });

    } catch (error) {
      logger.error('Error retrieving patient payments:', error);
      res.status(500).json({
        error: 'Failed to retrieve patient payments',
        message: error.message
      });
    }
  }
);

/**
 * POST /api/payments - Create a new payment record (manual payment)
 */
router.post('/',
  authorize(['admin', 'billing']),
  validate(paymentCreateSchema),
  async (req, res) => {
    const client = await getDB().connect();
    try {
      const paymentData = req.validatedData;
      await client.query('BEGIN');

      const invoiceResult = await client.query(
        'SELECT * FROM invoices WHERE id = $1 FOR UPDATE',
        [paymentData.invoice_id]
      );
      if (!invoiceResult.rows.length) {
        throw new PaymentRequestError('Invoice not found', 404);
      }
      const invoice = invoiceResult.rows[0];
      if (invoice.patient_id !== paymentData.patient_id) {
        throw new PaymentRequestError('Invoice does not belong to this patient');
      }
      if (['paid', 'cancelled', 'refunded'].includes(invoice.status)) {
        throw new PaymentRequestError(`Invoice cannot receive payment while ${invoice.status}`, 409);
      }

      const amount = Number(paymentData.amount);
      const balance = Number(invoice.balance_due ?? (Number(invoice.total_amount) - Number(invoice.amount_paid || 0)));
      await client.query(`
        UPDATE payments
        SET status = 'failed',
            metadata = COALESCE(metadata, '{}'::jsonb) ||
              '{"failure_reason":"M-Pesa prompt unanswered after 60 seconds"}'::jsonb,
            updated_at = NOW()
        WHERE invoice_id = $1
          AND payment_method = 'mpesa'
          AND status = 'pending'
          AND COALESCE(mpesa_prompt_expires_at, created_at + INTERVAL '60 seconds') <= NOW()
      `, [invoice.id]);
      const pendingResult = await client.query(`
        SELECT COALESCE(SUM(amount), 0) AS reserved
        FROM payments
        WHERE invoice_id = $1
          AND payment_method = 'mpesa'
          AND status = 'pending'
          AND COALESCE(mpesa_prompt_expires_at, created_at + INTERVAL '60 seconds') > NOW()
      `, [invoice.id]);
      const available = balance - Number(pendingResult.rows[0].reserved || 0);
      if (!Number.isFinite(balance) || amount > available + 0.005) {
        throw new PaymentRequestError(
          available < balance
            ? 'Payment amount conflicts with an active M-Pesa request for this invoice'
            : 'Payment amount exceeds the invoice balance',
          409
        );
      }

      const ledgerResult = await client.query(`
        INSERT INTO billing_payments (
          invoice_id, patient_id, payment_method, amount, currency,
          status, received_by, notes
        ) VALUES ($1, $2, $3, $4, 'KES', 'completed', $5, $6)
        RETURNING *
      `, [invoice.id, invoice.patient_id, paymentData.payment_method, amount,
        req.user.id, paymentData.description || null]);

      await client.query(`
        INSERT INTO payment_allocations (payment_id, invoice_id, allocated_amount)
        VALUES ($1, $2, $3)
      `, [ledgerResult.rows[0].id, invoice.id, amount]);

      const payment = await Payment.create({
        ...paymentData,
        amount,
        status: 'completed',
        metadata: { billing_payment_id: ledgerResult.rows[0].id }
      }, req.user.id, client);

      await client.query(`
        UPDATE invoices
        SET payment_method = $2, updated_at = NOW()
        WHERE id = $1
      `, [invoice.id, paymentData.payment_method]);

      if (invoice.encounter_id) {
        await client.query(`
          UPDATE encounters SET status = 'completed', updated_at = NOW()
          WHERE id = $1
            AND pending_lab_orders = 0
            AND pending_prescriptions = 0
            AND pending_radiology_orders = 0
            AND EXISTS (
              SELECT 1 FROM invoices paid_invoice
              WHERE paid_invoice.id = $2 AND paid_invoice.payment_status = 'paid'
            )
        `, [invoice.encounter_id, invoice.id]);
      }

      await client.query('COMMIT');

      logger.info('Payment record created', {
        userId: req.user.id,
        paymentId: payment.id,
        amount: payment.amount,
        method: payment.payment_method
      });

      res.status(201).json({
        data: payment,
        message: 'Payment record created successfully'
      });

    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error creating payment:', error);
      res.status(error.status || 500).json({
        error: 'Failed to create payment',
        message: error instanceof PaymentRequestError ? error.message : 'Payment could not be recorded'
      });
    } finally {
      client.release();
    }
  }
);

/**
 * POST /api/payments/mpesa/stk-push - Initiate M-Pesa STK Push
 */
router.post('/mpesa/stk-push',
  authorize(['doctor', 'admin', 'nurse', 'billing']),
  validate(mpesaPaymentSchema),
  async (req, res) => {
    let payment;
    try {
      const paymentData = req.validatedData;
      
      // Verify patient exists
      const patient = await Patient.findById(paymentData.patient_id);
      if (!patient) {
        return res.status(404).json({
          error: 'Patient not found'
        });
      }

      // Validate M-Pesa configuration
      try {
        mpesaService.validateConfig();
      } catch (error) {
        logger.error('M-Pesa configuration error:', error);
        return res.status(500).json({
          error: 'Payment service not configured',
          message: 'M-Pesa integration is not properly set up'
        });
      }

      // Lock the invoice while reserving this amount. Concurrent users cannot
      // send multiple prompts against the same remaining balance.
      payment = await reserveInvoicePayment(paymentData, req.user.id);

      // Initiate STK Push
      const accountReference = `INV-${paymentData.invoice_id.substring(0, 8)}`;
      const transactionDesc = paymentData.description || `Payment for ${paymentData.transaction_type}`;

      const mpesaResponse = await mpesaService.stkPush({
        phoneNumber: paymentData.phone_number,
        amount: paymentData.amount,
        accountReference,
        transactionDesc
      });

      if (mpesaResponse.success && mpesaResponse.checkoutRequestId && mpesaResponse.merchantRequestId) {
        const promptSentAt = new Date();
        const promptExpiresAt = new Date(promptSentAt.getTime() + MPESA_PROMPT_TTL_SECONDS * 1000);
        // Update payment with checkout request ID
        await payment.updateStatus('pending', {
          checkout_request_id: mpesaResponse.checkoutRequestId,
          merchant_request_id: mpesaResponse.merchantRequestId,
          prompt_sent_at: promptSentAt,
          prompt_expires_at: promptExpiresAt
        });

        logger.info('STK Push initiated successfully', {
          userId: req.user.id,
          paymentId: payment.id,
          checkoutRequestId: maskIdentifier(mpesaResponse.checkoutRequestId)
        });

        res.status(200).json({
          success: true,
          message: mpesaResponse.message,
          data: {
            payment_id: payment.id,
            checkout_request_id: mpesaResponse.checkoutRequestId,
            status: 'pending',
            attempt: payment.mpesa_attempt,
            prompt_expires_at: promptExpiresAt.toISOString(),
            retry_after_seconds: MPESA_PROMPT_TTL_SECONDS
          }
        });
      } else {
        // Update payment status to failed
        await payment.updateStatus('failed', {
          error_code: mpesaResponse.errorCode,
          error_message: mpesaResponse.message
        });

        res.status(400).json({
          success: false,
          error: 'Failed to initiate payment',
          message: mpesaResponse.message
        });
      }

    } catch (error) {
      if (payment?.id && !(error instanceof PaymentRequestError)) {
        try {
          await payment.updateStatus('failed', { error_message: error.message });
        } catch (statusError) {
          logger.error('Unable to mark failed M-Pesa initiation:', statusError);
        }
      }
      logger.error('Error initiating M-Pesa payment:', error);
      res.status(error.status || 500).json({
        error: 'Failed to initiate payment',
        message: error instanceof PaymentRequestError ? error.message : 'M-Pesa request could not be started',
        ...(error instanceof PaymentRequestError ? error.details : {})
      });
    }
  }
);

/**
 * POST /api/payments/mpesa/callback - M-Pesa callback endpoint
 * This endpoint receives payment confirmations from Safaricom
 */
router.post('/mpesa/callback',
  express.json(), // Parse raw JSON body
  async (req, res) => {
    try {
      const requiredToken = process.env.MPESA_CALLBACK_TOKEN;
      const suppliedToken = req.query.token || req.get('x-mpesa-callback-token');
      if (process.env.NODE_ENV !== 'development' && !requiredToken) {
        logger.error('Rejected M-Pesa callback because callback authentication is not configured');
        return res.status(503).json({ ResultCode: 1, ResultDesc: 'Callback authentication unavailable' });
      }
      if (requiredToken && !callbackTokenMatches(requiredToken, suppliedToken)) {
        logger.warn('Rejected M-Pesa callback with invalid token', { ip: req.ip });
        return res.status(401).json({ ResultCode: 1, ResultDesc: 'Unauthorized callback' });
      }

      logger.info('M-Pesa callback received', {
        merchantRequestId: maskIdentifier(req.body?.Body?.stkCallback?.MerchantRequestID),
        checkoutRequestId: maskIdentifier(req.body?.Body?.stkCallback?.CheckoutRequestID)
      });

      // Parse the callback data
      const callbackData = mpesaService.parseCallback(req.body);
      const result = await reconcileMpesaCallback(callbackData);

      if (result.outcome === 'not-found') {
        logger.warn('Payment not found for callback', {
          checkoutRequestId: maskIdentifier(callbackData.checkoutRequestId)
        });
        return res.status(404).json({ ResultCode: 1, ResultDesc: 'Payment request not found' });
      }

      if (callbackData.success) {
        logger.info('Payment completed successfully', {
          paymentId: result.paymentId,
          receiptNumber: maskIdentifier(callbackData.receiptNumber),
          amount: callbackData.amount,
          unallocatedAmount: result.unallocatedAmount || 0
        });
        if (result.unallocatedAmount > 0) {
          logger.warn('Confirmed M-Pesa payment has unapplied patient credit', {
            paymentId: result.paymentId,
            receiptNumber: maskIdentifier(callbackData.receiptNumber),
            unallocatedAmount: result.unallocatedAmount
          });
        }
      } else {
        logger.warn('Payment failed', {
          paymentId: result.paymentId,
          resultCode: callbackData.resultCode,
          resultDesc: callbackData.resultDesc
        });
      }

      res.status(200).json({
        ResultCode: 0,
        ResultDesc: 'Success'
      });

    } catch (error) {
      logger.error('Error processing M-Pesa callback:', error);
      if (error instanceof CallbackReconciliationError) {
        return res.status(200).json({
          ResultCode: 1,
          ResultDesc: 'Payment details did not reconcile'
        });
      }
      // A transient database or server failure must be retried. Returning a
      // non-2xx status prevents a confirmed payment from being silently lost.
      res.status(500).json({
        ResultCode: 1,
        ResultDesc: 'Failed to process callback'
      });
    }
  }
);

/**
 * GET /api/payments/mpesa/query/:id - Query M-Pesa transaction status
 */
router.get('/mpesa/query/:id',
  authorize(['doctor', 'admin', 'billing']),
  validateParams(Joi.object({ id: uuidSchema })),
  async (req, res) => {
    try {
      const { id } = req.validatedParams;
      
      const payment = await Payment.findById(id);
      
      if (!payment) {
        return res.status(404).json({
          error: 'Payment not found'
        });
      }

      if (!payment.mpesa_checkout_request_id) {
        return res.status(400).json({
          error: 'Not an M-Pesa transaction'
        });
      }

      // Query M-Pesa API for status
      const mpesaStatus = await mpesaService.queryTransaction(payment.mpesa_checkout_request_id);

      // A successful query does not include the receipt/amount metadata needed
      // to settle an invoice safely. Only a reconciled callback completes it.
      if (!mpesaStatus.success && payment.status === 'pending') {
        await payment.updateStatus('failed', {
          result_code: mpesaStatus.resultCode,
          result_desc: mpesaStatus.resultDesc
        });
      }

      logger.info('M-Pesa status queried', {
        userId: req.user.id,
        paymentId: payment.id,
        status: mpesaStatus.success ? payment.status : 'failed'
      });

      res.json({
        data: {
          payment_id: payment.id,
          status: mpesaStatus.success ? payment.status : 'failed',
          mpesa_status: mpesaStatus
        }
      });

    } catch (error) {
      logger.error('Error querying M-Pesa status:', error);
      res.status(500).json({
        error: 'Failed to query payment status',
        message: error.message
      });
    }
  }
);

/**
 * Error handling middleware
 */
router.use((error, req, res, next) => {
  logger.error('Payment route error:', error);
  res.status(500).json({
    error: 'Internal server error in payment routes',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

if (process.env.NODE_ENV === 'test') {
  router.__test = {
    reserveInvoicePayment,
    reconcileMpesaCallback,
    MPESA_PROMPT_TTL_SECONDS
  };
}

module.exports = router;

