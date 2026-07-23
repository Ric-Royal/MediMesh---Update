const express = require('express');
const Joi = require('joi');
const router = express.Router();

const MedicalRecord = require('../models/MedicalRecord');
const Patient = require('../models/Patient');
const { authorize, dlpMiddleware } = require('../middleware/auth');
const { captureDataChanges } = require('../middleware/audit');
const {
  validate,
  validateQuery,
  validateParams,
  medicalRecordCreateSchema,
  medicalRecordUpdateSchema,
  medicalRecordSearchSchema,
  uuidSchema
} = require('../utils/validation');
const { logger } = require('../utils/logger');

// GET /api/records - List all medical records with filtering
router.get('/',
  authorize(['doctor', 'nurse', 'admin']),
  validateQuery(medicalRecordSearchSchema),
  dlpMiddleware,
  async (req, res) => {
    try {
      const { limit, offset, search, record_type, provider_name, date_from, date_to } = req.validatedQuery;
      
      // Apply DLP export limits
      const actualLimit = req.exportLimit ? Math.min(limit, req.exportLimit) : limit;
      
      const filters = {
        recordType: record_type,
        providerName: provider_name,
        dateFrom: date_from,
        dateTo: date_to,
        search
      };

      const records = await MedicalRecord.findAll(actualLimit, offset, filters);
      
      logger.info('Medical records retrieved', {
        userId: req.user.id,
        count: records.length,
        filters: JSON.stringify(filters),
        exportLimited: !!req.exportLimit
      });

      res.json({
        data: records,
        pagination: {
          limit: actualLimit,
          offset,
          has_more: records.length === actualLimit
        },
        meta: {
          total_returned: records.length,
          export_limited: !!req.exportLimit,
          filters_applied: filters
        }
      });

    } catch (error) {
      logger.error('Error retrieving medical records:', error);
      res.status(500).json({
        error: 'Failed to retrieve medical records',
        message: error.message
      });
    }
  }
);

// GET /api/records/statistics - Get medical record statistics
router.get('/statistics',
  authorize(['doctor', 'admin']),
  async (req, res) => {
    try {
      const stats = await MedicalRecord.getStatistics();
      
      logger.info('Medical record statistics retrieved', {
        userId: req.user.id
      });

      res.json({
        data: stats
      });

    } catch (error) {
      logger.error('Error retrieving medical record statistics:', error);
      res.status(500).json({
        error: 'Failed to retrieve medical record statistics',
        message: error.message
      });
    }
  }
);

// GET /api/records/types - Get available record types
router.get('/types',
  authorize(['doctor', 'nurse', 'admin']),
  async (req, res) => {
    try {
      const recordTypes = await MedicalRecord.getRecordTypes();
      
      logger.info('Record types retrieved', {
        userId: req.user.id
      });

      res.json({
        data: recordTypes
      });

    } catch (error) {
      logger.error('Error retrieving record types:', error);
      res.status(500).json({
        error: 'Failed to retrieve record types',
        message: error.message
      });
    }
  }
);

// GET /api/records/:id - Get a specific medical record
router.get('/:id',
  authorize(['doctor', 'nurse', 'admin']),
  validateParams(Joi.object({ id: uuidSchema })),
  async (req, res) => {
    try {
      const { id } = req.validatedParams;
      
      const record = await MedicalRecord.findById(id);
      
      if (!record) {
        return res.status(404).json({
          error: 'Medical record not found'
        });
      }

      logger.info('Medical record retrieved', {
        userId: req.user.id,
        recordId: record.id,
        patientId: record.patient_id
      });

      res.json({
        data: record
      });

    } catch (error) {
      logger.error('Error retrieving medical record:', error);
      res.status(500).json({
        error: 'Failed to retrieve medical record',
        message: error.message
      });
    }
  }
);

// POST /api/records - Create a new medical record
router.post('/',
  authorize(['doctor', 'nurse', 'admin']),
  validate(medicalRecordCreateSchema),
  async (req, res) => {
    try {
      const recordData = req.validatedData;
      
      // Verify patient exists
      const patient = await Patient.findById(recordData.patient_id);
      if (!patient) {
        return res.status(404).json({
          error: 'Patient not found',
          patient_id: recordData.patient_id
        });
      }

      const record = await MedicalRecord.create(recordData, req.user.id);

      logger.info('Medical record created successfully', {
        userId: req.user.id,
        recordId: record.id,
        patientId: record.patient_id,
        recordType: record.record_type
      });

      res.status(201).json({
        data: record,
        message: 'Medical record created successfully'
      });

    } catch (error) {
      logger.error('Error creating medical record:', error);
      res.status(500).json({
        error: 'Failed to create medical record',
        message: error.message
      });
    }
  }
);

// PUT /api/records/:id - Update a medical record
router.put('/:id',
  authorize(['doctor', 'nurse', 'admin']),
  validateParams(Joi.object({ id: uuidSchema })),
  validate(medicalRecordUpdateSchema),
  captureDataChanges('medical_record'),
  async (req, res) => {
    try {
      const { id } = req.validatedParams;
      const updateData = req.validatedData;
      
      const record = await MedicalRecord.findById(id);
      
      if (!record) {
        return res.status(404).json({
          error: 'Medical record not found'
        });
      }

      const updatedRecord = await record.update(updateData, req.user.id);

      logger.info('Medical record updated successfully', {
        userId: req.user.id,
        recordId: record.id,
        patientId: record.patient_id,
        changes: Object.keys(updateData)
      });

      res.json({
        data: updatedRecord,
        message: 'Medical record updated successfully'
      });

    } catch (error) {
      logger.error('Error updating medical record:', error);
      res.status(500).json({
        error: 'Failed to update medical record',
        message: error.message
      });
    }
  }
);

// DELETE /api/records/:id - Delete a medical record
router.delete('/:id',
  authorize(['doctor', 'admin']), // Only doctors and admins can delete records
  validateParams(Joi.object({ id: uuidSchema })),
  async (req, res) => {
    try {
      const { id } = req.validatedParams;
      
      const record = await MedicalRecord.findById(id);
      
      if (!record) {
        return res.status(404).json({
          error: 'Medical record not found'
        });
      }

      await record.delete();

      logger.info('Medical record deleted successfully', {
        userId: req.user.id,
        recordId: record.id,
        patientId: record.patient_id,
        recordType: record.record_type
      });

      res.json({
        message: 'Medical record deleted successfully'
      });

    } catch (error) {
      logger.error('Error deleting medical record:', error);
      res.status(500).json({
        error: 'Failed to delete medical record',
        message: error.message
      });
    }
  }
);

// POST /api/records/bulk - Create multiple medical records
router.post('/bulk',
  authorize(['doctor', 'admin']),
  validate(Joi.object({
    records: Joi.array().items(medicalRecordCreateSchema).min(1).max(10).required()
  })),
  async (req, res) => {
    try {
      const { records } = req.validatedData;
      const createdRecords = [];
      const errors = [];

      for (let i = 0; i < records.length; i++) {
        try {
          // Verify patient exists
          const patient = await Patient.findById(records[i].patient_id);
          if (!patient) {
            errors.push({
              index: i,
              error: 'Patient not found',
              patient_id: records[i].patient_id
            });
            continue;
          }

          const record = await MedicalRecord.create(records[i], req.user.id);
          createdRecords.push(record);

        } catch (error) {
          errors.push({
            index: i,
            error: error.message,
            record_data: records[i]
          });
        }
      }

      logger.info('Bulk medical records operation completed', {
        userId: req.user.id,
        totalRequested: records.length,
        successful: createdRecords.length,
        failed: errors.length
      });

      res.status(createdRecords.length > 0 ? 201 : 400).json({
        data: createdRecords,
        errors: errors,
        summary: {
          total_requested: records.length,
          successful: createdRecords.length,
          failed: errors.length
        }
      });

    } catch (error) {
      logger.error('Error in bulk medical record creation:', error);
      res.status(500).json({
        error: 'Failed to process bulk medical record creation',
        message: error.message
      });
    }
  }
);

// GET /api/records/export - Export medical records (CSV format)
router.get('/export',
  authorize(['doctor', 'admin']),
  validateQuery(medicalRecordSearchSchema),
  dlpMiddleware,
  async (req, res) => {
    try {
      const { limit, offset, search, record_type, provider_name, date_from, date_to } = req.validatedQuery;
      
      // Force DLP limit for exports
      const exportLimit = req.exportLimit || 20;
      const actualLimit = Math.min(limit, exportLimit);
      
      const filters = {
        recordType: record_type,
        providerName: provider_name,
        dateFrom: date_from,
        dateTo: date_to,
        search
      };

      const records = await MedicalRecord.findAll(actualLimit, offset, filters);
      
      // Generate CSV
      const csvHeaders = [
        'Record ID', 'Patient ID', 'Patient Name', 'Record Type', 
        'Record Date', 'Provider', 'Diagnosis Codes', 'Notes', 'Created Date'
      ];
      
      const csvRows = records.map(record => [
        record.id,
        record.patient_info?.patient_number || '',
        `${record.patient_info?.first_name || ''} ${record.patient_info?.last_name || ''}`.trim(),
        record.record_type,
        record.record_date,
        record.provider_name,
        Array.isArray(record.diagnosis_codes) ? record.diagnosis_codes.join(';') : '',
        (record.notes || '').replace(/"/g, '""'), // Escape quotes
        record.created_at
      ]);

      const csvContent = [
        csvHeaders.join(','),
        ...csvRows.map(row => row.map(field => `"${field}"`).join(','))
      ].join('\n');

      logger.info('Medical records exported', {
        userId: req.user.id,
        recordCount: records.length,
        exportLimit: actualLimit,
        filters: JSON.stringify(filters)
      });

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="medical_records_${Date.now()}.csv"`);
      res.send(csvContent);

    } catch (error) {
      logger.error('Error exporting medical records:', error);
      res.status(500).json({
        error: 'Failed to export medical records',
        message: error.message
      });
    }
  }
);

// Error handling middleware for this router
router.use((error, req, res, next) => {
  logger.error('Medical record route error:', error);
  res.status(500).json({
    error: 'Internal server error in medical record routes',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

module.exports = router;
