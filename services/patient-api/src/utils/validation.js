const Joi = require('joi');

// Patient validation schemas
const patientCreateSchema = Joi.object({
  patient_id: Joi.string().optional().max(50),
  first_name: Joi.string().required().min(1).max(100).trim(),
  last_name: Joi.string().required().min(1).max(100).trim(),
  date_of_birth: Joi.date().required().max('now'),
  gender: Joi.string().valid('M', 'F', 'Other', '').optional(),
  phone: Joi.string().optional().allow('').max(20).pattern(/^[\+]?[\d\s\-\(\)]*$/),
  email: Joi.string().email().optional().allow('').max(100),
  address: Joi.object({
    street: Joi.string().optional().allow('').max(200),
    city: Joi.string().optional().allow('').max(100),
    state: Joi.string().optional().allow('').max(50),
    zip_code: Joi.string().optional().allow('').max(20),
    country: Joi.string().optional().allow('').max(50)
  }).optional(),
  emergency_contact: Joi.object({
    name: Joi.string().optional().allow('').max(100),
    relationship: Joi.string().optional().allow('').max(50),
    phone: Joi.string().optional().allow('').max(20).pattern(/^[\+]?[\d\s\-\(\)]*$/)
  }).optional(),
  insurance: Joi.object({
    provider: Joi.string().optional().allow('').max(100),
    policy_number: Joi.string().optional().allow('').max(50),
    group_number: Joi.string().optional().allow('').max(50)
  }).optional()
});

const patientUpdateSchema = Joi.object({
  first_name: Joi.string().optional().min(1).max(100).trim(),
  last_name: Joi.string().optional().min(1).max(100).trim(),
  date_of_birth: Joi.date().optional().max('now'),
  gender: Joi.string().valid('M', 'F', 'Other', '').optional(),
  phone: Joi.string().optional().allow('').max(20).pattern(/^[\+]?[\d\s\-\(\)]*$/),
  email: Joi.string().email().optional().allow('').max(100),
  address: Joi.object({
    street: Joi.string().optional().allow('').max(200),
    city: Joi.string().optional().allow('').max(100),
    state: Joi.string().optional().allow('').max(50),
    zip_code: Joi.string().optional().allow('').max(20),
    country: Joi.string().optional().allow('').max(50)
  }).optional(),
  emergency_contact: Joi.object({
    name: Joi.string().optional().allow('').max(100),
    relationship: Joi.string().optional().allow('').max(50),
    phone: Joi.string().optional().allow('').max(20).pattern(/^[\+]?[\d\s\-\(\)]*$/)
  }).optional(),
  insurance: Joi.object({
    provider: Joi.string().optional().allow('').max(100),
    policy_number: Joi.string().optional().allow('').max(50),
    group_number: Joi.string().optional().allow('').max(50)
  }).optional()
});

// Medical record validation schemas
const medicalRecordCreateSchema = Joi.object({
  patient_id: Joi.string().uuid().required(),
  record_type: Joi.string().required().valid(
    'consultation', 'diagnosis', 'treatment', 'lab_result', 
    'imaging', 'prescription', 'vaccination', 'surgery', 
    'emergency', 'discharge', 'referral', 'other'
  ),
  record_date: Joi.date().required().max('now'),
  provider_name: Joi.string().required().min(1).max(100).trim(),
  notes: Joi.string().optional().allow('', null).max(5000),
  diagnosis: Joi.string().optional().allow('', null).max(2000),
  treatment_plan: Joi.string().optional().allow('', null).max(2000),
  medications: Joi.string().optional().allow('', null).max(2000),
  lab_results: Joi.string().optional().allow('', null).max(2000),
  vital_signs: Joi.object({
    blood_pressure: Joi.string().optional().allow('', null).max(50),
    heart_rate: Joi.string().optional().allow('', null).max(50),
    temperature: Joi.string().optional().allow('', null).max(50),
    weight: Joi.string().optional().allow('', null).max(50),
    height: Joi.string().optional().allow('', null).max(50)
  }).optional(),
  follow_up_date: Joi.date().optional().min('now').allow(null),
  attachments: Joi.array().optional()
});

const medicalRecordUpdateSchema = Joi.object({
  record_type: Joi.string().optional().valid(
    'consultation', 'diagnosis', 'treatment', 'lab_result', 
    'imaging', 'prescription', 'vaccination', 'surgery', 
    'emergency', 'discharge', 'referral', 'other'
  ),
  record_date: Joi.date().optional().max('now'),
  provider_name: Joi.string().optional().min(1).max(100).trim(),
  notes: Joi.string().optional().allow('', null).max(5000),
  diagnosis: Joi.string().optional().allow('', null).max(2000),
  treatment_plan: Joi.string().optional().allow('', null).max(2000),
  medications: Joi.string().optional().allow('', null).max(2000),
  lab_results: Joi.string().optional().allow('', null).max(2000),
  vital_signs: Joi.object({
    blood_pressure: Joi.string().optional().allow('', null).max(50),
    heart_rate: Joi.string().optional().allow('', null).max(50),
    temperature: Joi.string().optional().allow('', null).max(50),
    weight: Joi.string().optional().allow('', null).max(50),
    height: Joi.string().optional().allow('', null).max(50)
  }).optional(),
  follow_up_date: Joi.date().optional().min('now').allow(null),
  attachments: Joi.array().optional()
});

// Query parameter validation schemas
const paginationSchema = Joi.object({
  limit: Joi.number().integer().min(1).max(100).default(50),
  offset: Joi.number().integer().min(0).default(0),
  page: Joi.number().integer().min(1).optional()
});

const patientSearchSchema = paginationSchema.keys({
  search: Joi.string().optional().allow('').max(100),
  gender: Joi.string().valid('M', 'F', 'Other').optional(),
  age_min: Joi.number().integer().min(0).max(150).optional(),
  age_max: Joi.number().integer().min(0).max(150).optional()
});

const medicalRecordSearchSchema = paginationSchema.keys({
  search: Joi.string().optional().allow('').max(100),
  record_type: Joi.string().optional(),
  provider_name: Joi.string().optional().max(100),
  date_from: Joi.date().optional(),
  date_to: Joi.date().optional()
});

// UUID validation
const uuidSchema = Joi.string().uuid().required();

// Validation middleware
const validate = (schema) => {
  return (req, res, next) => {
    const { logger } = require('./logger');
    
    // Helper function to convert empty strings to null for optional fields
    const convertEmptyStringsToNull = (obj) => {
      if (obj === null || obj === undefined || typeof obj !== 'object') {
        return obj;
      }
      
      const result = {};
      for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'string' && value.trim() === '') {
          result[key] = null;
        } else if (typeof value === 'object' && value !== null) {
          result[key] = convertEmptyStringsToNull(value);
        } else {
          result[key] = value;
        }
      }
      return result;
    };
    
    // Convert empty strings to null before validation
    const processedBody = convertEmptyStringsToNull(req.body);
    
    // Debug: Log the incoming request data
    logger.info('=== VALIDATION DEBUG ===', {
      originalBody: req.body,
      processedBody: processedBody,
      requestHeaders: req.headers,
      url: req.url,
      method: req.method
    });
    
    const { error, value } = schema.validate(processedBody, { 
      abortEarly: false,
      stripUnknown: true 
    });

    if (error) {
      const errorDetails = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context?.value
      }));

      logger.error('=== VALIDATION ERROR ===', {
        errorDetails,
        originalBody: req.body,
        processedBody: processedBody
      });

      return res.status(400).json({
        error: 'Validation failed',
        details: errorDetails
      });
    }

    req.validatedData = value;
    next();
  };
};

const validateQuery = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.query, { 
      abortEarly: false,
      stripUnknown: true 
    });

    if (error) {
      const errorDetails = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context?.value
      }));

      return res.status(400).json({
        error: 'Query validation failed',
        details: errorDetails
      });
    }

    req.validatedQuery = value;
    next();
  };
};

const validateParams = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.params, { 
      abortEarly: false,
      stripUnknown: true 
    });

    if (error) {
      const errorDetails = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context?.value
      }));

      return res.status(400).json({
        error: 'Parameter validation failed',
        details: errorDetails
      });
    }

    req.validatedParams = value;
    next();
  };
};

module.exports = {
  // Schemas
  patientCreateSchema,
  patientUpdateSchema,
  medicalRecordCreateSchema,
  medicalRecordUpdateSchema,
  paginationSchema,
  patientSearchSchema,
  medicalRecordSearchSchema,
  uuidSchema,
  
  // Middleware
  validate,
  validateQuery,
  validateParams
}; 