const express = require('express');
const Joi = require('joi');
const router = express.Router();

const Payment = require('../models/Payment');
const Patient = require('../models/Patient');
const { authorize } = require('../middleware/auth');
const { validate, validateQuery, validateParams, uuidSchema } = require('../utils/validation');
const { logger } = require('../utils/logger');
const mpesaService = require('../utils/mpesa');

/**
 * Payment validation schemas
 */
const paymentCreateSchema = Joi.object({
  patient_id: uuidSchema.required(),
  medical_record_id: uuidSchema.optional().allow(null),
  amount: Joi.number().positive().precision(2).required(),
  phone_number: Joi.string().pattern(/^(0|254|\+254)?[17]\d{8}$/).required(),
  payment_method: Joi.string().valid('mpesa', 'cash', 'card', 'insurance').required(),
  transaction_type: Joi.string().required(),
  description: Joi.string().max(500).optional()
});

const mpesaPaymentSchema = Joi.object({
  patient_id: uuidSchema.required(),
  medical_record_id: uuidSchema.optional().allow(null),
  amount: Joi.number().positive().precision(2).required(),
  phone_number: Joi.string().pattern(/^(0|254|\+254)?[17]\d{8}$/).required(),
  transaction_type: Joi.string().required(),
  description: Joi.string().max(500).optional()
});

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
  authorize(['doctor', 'admin', 'nurse']),
  validateQuery(paymentSearchSchema),
  async (req, res) => {
    try {
      const filters = req.validatedQuery;
      
      logger.info('Payments retrieved', {
        userId: req.user.id,
        filters
      });

      // TODO: Implement comprehensive search in Payment model
      res.json({
        message: 'Payment search endpoint - implementation pending',
        filters
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
  authorize(['doctor', 'admin']),
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
  authorize(['doctor', 'nurse', 'admin']),
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
  authorize(['doctor', 'nurse', 'admin']),
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
  authorize(['doctor', 'admin']),
  validate(paymentCreateSchema),
  async (req, res) => {
    try {
      const paymentData = req.validatedData;
      
      // Verify patient exists
      const patient = await Patient.findById(paymentData.patient_id);
      if (!patient) {
        return res.status(404).json({
          error: 'Patient not found'
        });
      }

      const payment = await Payment.create(paymentData, req.user.id);

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
      logger.error('Error creating payment:', error);
      res.status(500).json({
        error: 'Failed to create payment',
        message: error.message
      });
    }
  }
);

/**
 * POST /api/payments/mpesa/stk-push - Initiate M-Pesa STK Push
 */
router.post('/mpesa/stk-push',
  authorize(['doctor', 'admin', 'nurse']),
  validate(mpesaPaymentSchema),
  async (req, res) => {
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

      // Create payment record with pending status
      const payment = await Payment.create({
        ...paymentData,
        payment_method: 'mpesa',
        status: 'pending'
      }, req.user.id);

      // Initiate STK Push
      const accountReference = `PAT-${patient.patient_id || patient.id.substring(0, 8)}`;
      const transactionDesc = paymentData.description || `Payment for ${paymentData.transaction_type}`;

      const mpesaResponse = await mpesaService.stkPush({
        phoneNumber: paymentData.phone_number,
        amount: paymentData.amount,
        accountReference,
        transactionDesc
      });

      if (mpesaResponse.success) {
        // Update payment with checkout request ID
        await payment.updateStatus('pending', {
          checkout_request_id: mpesaResponse.checkoutRequestId,
          merchant_request_id: mpesaResponse.merchantRequestId
        });

        logger.info('STK Push initiated successfully', {
          userId: req.user.id,
          paymentId: payment.id,
          checkoutRequestId: mpesaResponse.checkoutRequestId
        });

        res.status(200).json({
          success: true,
          message: mpesaResponse.message,
          data: {
            payment_id: payment.id,
            checkout_request_id: mpesaResponse.checkoutRequestId,
            status: 'pending'
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
      logger.error('Error initiating M-Pesa payment:', error);
      res.status(500).json({
        error: 'Failed to initiate payment',
        message: error.message
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
      logger.info('M-Pesa callback received', { body: req.body });

      // Parse the callback data
      const callbackData = mpesaService.parseCallback(req.body);

      // Find the payment by checkout request ID
      const payment = await Payment.findByCheckoutRequestId(callbackData.checkoutRequestId);

      if (!payment) {
        logger.warn('Payment not found for callback', {
          checkoutRequestId: callbackData.checkoutRequestId
        });
        // Still return 200 to acknowledge receipt
        return res.status(200).json({ message: 'Callback received' });
      }

      // Update payment status based on result
      if (callbackData.success) {
        await payment.updateStatus('completed', {
          receipt_number: callbackData.receiptNumber,
          transaction_date: callbackData.transactionDate,
          phone_number: callbackData.phoneNumber,
          amount_paid: callbackData.amount
        });

        logger.info('Payment completed successfully', {
          paymentId: payment.id,
          receiptNumber: callbackData.receiptNumber,
          amount: callbackData.amount
        });
      } else {
        await payment.updateStatus('failed', {
          result_code: callbackData.resultCode,
          result_desc: callbackData.resultDesc
        });

        logger.warn('Payment failed', {
          paymentId: payment.id,
          resultCode: callbackData.resultCode,
          resultDesc: callbackData.resultDesc
        });
      }

      // Always return 200 to M-Pesa to acknowledge callback
      res.status(200).json({
        ResultCode: 0,
        ResultDesc: 'Success'
      });

    } catch (error) {
      logger.error('Error processing M-Pesa callback:', error);
      // Still return 200 to prevent M-Pesa from retrying
      res.status(200).json({
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
  authorize(['doctor', 'admin']),
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

      // Update payment status if needed
      if (mpesaStatus.success && payment.status === 'pending') {
        await payment.updateStatus('completed');
      } else if (!mpesaStatus.success && payment.status === 'pending') {
        await payment.updateStatus('failed', {
          result_code: mpesaStatus.resultCode,
          result_desc: mpesaStatus.resultDesc
        });
      }

      logger.info('M-Pesa status queried', {
        userId: req.user.id,
        paymentId: payment.id,
        status: mpesaStatus.success ? 'completed' : 'failed'
      });

      res.json({
        data: {
          payment_id: payment.id,
          status: mpesaStatus.success ? 'completed' : 'failed',
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

module.exports = router;

