const Joi = require('joi');

// Patient validation schemas
const patientCreateSchema = Joi.object({
  patient_id: Joi.string().optional().max(50),
  first_name: Joi.string().required().min(1).max(100).trim(),
  last_name: Joi.string().required().min(1).max(100).trim(),
  date_of_birth: Joi.date().required().max('now'),
  gender: Joi.string().valid('M', 'F', 'Other').optional(),
  phone: Joi.string().optional().max(20).pattern(/^[\+]?[1-9][\d]{0,15}$/),
  email: Joi.string().email().optional().max(100),
  address: Joi.object({
    street: Joi.string().optional().max(200),
    city: Joi.string().optional().max(100),
    state: Joi.string().optional().max(50),
    zip_code: Joi.string().optional().max(20),
    country: Joi.string().optional().max(50)
  }).optional()
});

const patientUpdateSchema = Joi.object({
  first_name: Joi.string().optional().min(1).max(100).trim(),
  last_name: Joi.string().optional().min(1).max(100).trim(),
  date_of_birth: Joi.date().optional().max('now'),
  gender: Joi.string().valid('M', 'F', 'Other').optional(),
  phone: Joi.string().optional().max(20).pattern(/^[\+]?[1-9][\d]{0,15}$/),
  email: Joi.string().email().optional().max(100),
  address: Joi.object({
    street: Joi.string().optional().max(200),
    city: Joi.string().optional().max(100),
    state: Joi.string().optional().max(50),
    zip_code: Joi.string().optional().max(20),
    country: Joi.string().optional().max(50)
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
  diagnosis_codes: Joi.array().items(Joi.string().max(20)).optional(),
  procedure_codes: Joi.array().items(Joi.string().max(20)).optional(),
  medications: Joi.object({
    prescribed: Joi.array().items(Joi.object({
      name: Joi.string().required(),
      dosage: Joi.string().optional(),
      frequency: Joi.string().optional(),
      duration: Joi.string().optional(),
      instructions: Joi.string().optional()
    })).optional(),
    allergies: Joi.array().items(Joi.string()).optional()
  }).optional(),
  notes: Joi.string().optional().max(5000),
  attachments: Joi.object({
    files: Joi.array().items(Joi.object({
      filename: Joi.string().required(),
      url: Joi.string().uri().required(),
      type: Joi.string().required(),
      size: Joi.number().optional()
    })).optional(),
    images: Joi.array().items(Joi.object({
      filename: Joi.string().required(),
      url: Joi.string().uri().required(),
      description: Joi.string().optional()
    })).optional()
  }).optional()
});

const medicalRecordUpdateSchema = Joi.object({
  record_type: Joi.string().optional().valid(
    'consultation', 'diagnosis', 'treatment', 'lab_result', 
    'imaging', 'prescription', 'vaccination', 'surgery', 
    'emergency', 'discharge', 'referral', 'other'
  ),
  record_date: Joi.date().optional().max('now'),
  provider_name: Joi.string().optional().min(1).max(100).trim(),
  diagnosis_codes: Joi.array().items(Joi.string().max(20)).optional(),
  procedure_codes: Joi.array().items(Joi.string().max(20)).optional(),
  medications: Joi.object({
    prescribed: Joi.array().items(Joi.object({
      name: Joi.string().required(),
      dosage: Joi.string().optional(),
      frequency: Joi.string().optional(),
      duration: Joi.string().optional(),
      instructions: Joi.string().optional()
    })).optional(),
    allergies: Joi.array().items(Joi.string()).optional()
  }).optional(),
  notes: Joi.string().optional().max(5000),
  attachments: Joi.object({
    files: Joi.array().items(Joi.object({
      filename: Joi.string().required(),
      url: Joi.string().uri().required(),
      type: Joi.string().required(),
      size: Joi.number().optional()
    })).optional(),
    images: Joi.array().items(Joi.object({
      filename: Joi.string().required(),
      url: Joi.string().uri().required(),
      description: Joi.string().optional()
    })).optional()
  }).optional()
});

// Query parameter validation schemas
const paginationSchema = Joi.object({
  limit: Joi.number().integer().min(1).max(100).default(50),
  offset: Joi.number().integer().min(0).default(0),
  page: Joi.number().integer().min(1).optional()
});

const patientSearchSchema = paginationSchema.keys({
  search: Joi.string().optional().max(100),
  gender: Joi.string().valid('M', 'F', 'Other').optional(),
  age_min: Joi.number().integer().min(0).max(150).optional(),
  age_max: Joi.number().integer().min(0).max(150).optional()
});

const medicalRecordSearchSchema = paginationSchema.keys({
  search: Joi.string().optional().max(100),
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
    const { error, value } = schema.validate(req.body, { 
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