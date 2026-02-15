const express = require('express');
const Joi = require('joi');
const router = express.Router();

const Patient = require('../models/Patient');
const { authorize, dlpMiddleware } = require('../middleware/auth');
const { captureDataChanges } = require('../middleware/audit');
const {
  validate,
  validateQuery,
  validateParams,
  patientCreateSchema,
  patientUpdateSchema,
  patientSearchSchema,
  uuidSchema
} = require('../utils/validation');
const { logger } = require('../utils/logger');

// GET /api/patients - List all patients with search and pagination
router.get('/',
  authorize(['doctor', 'nurse', 'admin', 'receptionist']),
  validateQuery(patientSearchSchema),
  dlpMiddleware,
  async (req, res) => {
    try {
      const { limit, offset, search, gender, age_min, age_max } = req.validatedQuery;
      
      // Apply DLP export limits
      const actualLimit = req.exportLimit ? Math.min(limit, req.exportLimit) : limit;
      
      const patients = await Patient.findAll(actualLimit, offset, search);
      
      // Get total count for pagination
      // In a real implementation, you'd want a separate count query
      const hasMore = patients.length === actualLimit;
      
      logger.info('Patients retrieved', {
        userId: req.user.id,
        count: patients.length,
        search: search || 'none',
        exportLimited: !!req.exportLimit
      });

      res.json({
        data: patients,
        pagination: {
          limit: actualLimit,
          offset,
          has_more: hasMore
        },
        meta: {
          total_returned: patients.length,
          export_limited: !!req.exportLimit
        }
      });

    } catch (error) {
      logger.error('Error retrieving patients:', error);
      res.status(500).json({
        error: 'Failed to retrieve patients',
        message: error.message
      });
    }
  }
);

// GET /api/patients/statistics - Get patient statistics
router.get('/statistics',
  authorize(['doctor', 'admin']),
  async (req, res) => {
    try {
      const stats = await Patient.getStatistics();
      
      logger.info('Patient statistics retrieved', {
        userId: req.user.id
      });

      res.json({
        data: stats
      });

    } catch (error) {
      logger.error('Error retrieving patient statistics:', error);
      res.status(500).json({
        error: 'Failed to retrieve patient statistics',
        message: error.message
      });
    }
  }
);

// GET /api/patients/:id - Get a specific patient
router.get('/:id',
  authorize(['doctor', 'nurse', 'admin', 'receptionist']),
  validateParams(Joi.object({ id: uuidSchema })),
  async (req, res) => {
    try {
      const { id } = req.validatedParams;
      
      const patient = await Patient.findById(id);
      
      if (!patient) {
        return res.status(404).json({
          error: 'Patient not found'
        });
      }

      logger.info('Patient retrieved', {
        userId: req.user.id,
        patientId: patient.id
      });

      res.json({
        data: patient
      });

    } catch (error) {
      logger.error('Error retrieving patient:', error);
      res.status(500).json({
        error: 'Failed to retrieve patient',
        message: error.message
      });
    }
  }
);

// POST /api/patients - Create a new patient
router.post('/',
  (req, res, next) => {
    logger.info('POST /api/patients - ENTRY POINT', {
      method: req.method,
      url: req.url,
      hasBody: !!req.body,
      bodyType: typeof req.body,
      bodyContent: JSON.stringify(req.body),
      contentType: req.headers['content-type'],
      userAgent: req.headers['user-agent']
    });
    next();
  },
  authorize(['doctor', 'nurse', 'admin', 'receptionist']),
  (req, res, next) => {
    logger.info('POST /api/patients - AFTER AUTH', {
      user: req.user,
      bodyExists: !!req.body,
      bodyContent: req.body
    });
    next();
  },
  validate(patientCreateSchema),
  async (req, res) => {
    try {
      const patientData = req.validatedData;
      
      // Check if patient_id already exists if provided
      if (patientData.patient_id) {
        const existingPatient = await Patient.findByPatientId(patientData.patient_id);
        if (existingPatient) {
          return res.status(409).json({
            error: 'Patient ID already exists',
            patient_id: patientData.patient_id
          });
        }
      }

      const patient = await Patient.create(patientData, req.user.id);

      logger.info('Patient created successfully', {
        userId: req.user.id,
        patientId: patient.id,
        patientNumber: patient.patient_id
      });

      res.status(201).json({
        data: patient,
        message: 'Patient created successfully'
      });

    } catch (error) {
      logger.error('Error creating patient:', error);
      
      if (error.code === '23505') { // PostgreSQL unique violation
        return res.status(409).json({
          error: 'Patient with this information already exists'
        });
      }

      res.status(500).json({
        error: 'Failed to create patient',
        message: error.message
      });
    }
  }
);

// PUT /api/patients/:id - Update a patient
router.put('/:id',
  authorize(['doctor', 'nurse', 'admin', 'receptionist']),
  validateParams(Joi.object({ id: uuidSchema })),
  validate(patientUpdateSchema),
  captureDataChanges('patient'),
  async (req, res) => {
    try {
      const { id } = req.validatedParams;
      const updateData = req.validatedData;
      
      const patient = await Patient.findById(id);
      
      if (!patient) {
        return res.status(404).json({
          error: 'Patient not found'
        });
      }

      const updatedPatient = await patient.update(updateData, req.user.id);

      logger.info('Patient updated successfully', {
        userId: req.user.id,
        patientId: patient.id,
        changes: Object.keys(updateData)
      });

      res.json({
        data: updatedPatient,
        message: 'Patient updated successfully'
      });

    } catch (error) {
      logger.error('Error updating patient:', error);
      res.status(500).json({
        error: 'Failed to update patient',
        message: error.message
      });
    }
  }
);

// DELETE /api/patients/:id - Delete a patient
router.delete('/:id',
  authorize(['admin']), // Only admins can delete patients
  validateParams(Joi.object({ id: uuidSchema })),
  async (req, res) => {
    try {
      const { id } = req.validatedParams;
      
      const patient = await Patient.findById(id);
      
      if (!patient) {
        return res.status(404).json({
          error: 'Patient not found'
        });
      }

      await patient.delete();

      logger.info('Patient deleted successfully', {
        userId: req.user.id,
        patientId: patient.id,
        patientNumber: patient.patient_id
      });

      res.json({
        message: 'Patient deleted successfully'
      });

    } catch (error) {
      logger.error('Error deleting patient:', error);
      
      if (error.message.includes('existing medical records')) {
        return res.status(409).json({
          error: 'Cannot delete patient with existing medical records',
          message: 'Please remove all medical records first'
        });
      }

      res.status(500).json({
        error: 'Failed to delete patient',
        message: error.message
      });
    }
  }
);

// GET /api/patients/:id/records - Get medical records for a patient
router.get('/:id/records',
  authorize(['doctor', 'nurse', 'admin', 'receptionist']),
  validateParams(Joi.object({ id: uuidSchema })),
  validateQuery(Joi.object({
    limit: Joi.number().integer().min(1).max(100).default(50),
    offset: Joi.number().integer().min(0).default(0)
  })),
  dlpMiddleware,
  async (req, res) => {
    try {
      const { id } = req.validatedParams;
      const { limit, offset } = req.validatedQuery;
      
      // Verify patient exists
      const patient = await Patient.findById(id);
      if (!patient) {
        return res.status(404).json({
          error: 'Patient not found'
        });
      }

      const MedicalRecord = require('../models/MedicalRecord');
      
      // Apply DLP export limits
      const actualLimit = req.exportLimit ? Math.min(limit, req.exportLimit) : limit;
      
      const records = await MedicalRecord.findByPatientId(id, actualLimit, offset);

      logger.info('Patient medical records retrieved', {
        userId: req.user.id,
        patientId: id,
        recordCount: records.length,
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
          patient_id: id,
          total_returned: records.length,
          export_limited: !!req.exportLimit
        }
      });

    } catch (error) {
      logger.error('Error retrieving patient medical records:', error);
      res.status(500).json({
        error: 'Failed to retrieve medical records',
        message: error.message
      });
    }
  }
);

// Error handling middleware for this router
router.use((error, req, res, next) => {
  logger.error('Patient route error:', error);
  res.status(500).json({
    error: 'Internal server error in patient routes',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

module.exports = router; 