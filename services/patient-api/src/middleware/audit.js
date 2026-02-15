const { auditLogger: auditLoggerUtil } = require('../utils/logger');
const { getDB } = require('../utils/database');
const { logger } = require('../utils/logger');

// ============================================
// ORIGINAL AUDIT LOGGER (global request logging)
// ============================================

const auditLogger = (req, res, next) => {
  // Capture the original res.json function
  const originalJson = res.json;
  
  // Override res.json to capture response data
  res.json = function(data) {
    // Log the audit trail
    logAuditTrail(req, res, data);
    
    // Call the original res.json function
    return originalJson.call(this, data);
  };

  next();
};

const logAuditTrail = async (req, res, responseData) => {
  try {
    const auditData = {
      timestamp: new Date().toISOString(),
      user_id: req.user?.id || 'anonymous',
      username: req.user?.username || 'anonymous',
      action: `${req.method} ${req.originalUrl}`,
      resource_type: extractResourceType(req.originalUrl),
      resource_id: extractResourceId(req.originalUrl, req.params),
      status_code: res.statusCode,
      ip_address: req.ip || req.connection.remoteAddress,
      user_agent: req.get('User-Agent'),
      request_body: sanitizeRequestBody(req.body),
      response_status: res.statusCode < 400 ? 'success' : 'error'
    };

    // Log to Winston audit logger
    auditLoggerUtil.info('API Access', auditData);

    // Store in database for immutable audit trail
    if (shouldLogToDatabase(req.originalUrl)) {
      await storeAuditLog(auditData);
    }

  } catch (error) {
    console.error('Audit logging error:', error);
  }
};

const extractResourceType = (url) => {
  if (url.includes('/patients')) return 'patient';
  if (url.includes('/records')) return 'medical_record';
  if (url.includes('/auth')) return 'authentication';
  if (url.includes('/encounters')) return 'encounter';
  if (url.includes('/consultations')) return 'consultation';
  if (url.includes('/lab')) return 'lab_order';
  if (url.includes('/radiology')) return 'radiology_order';
  if (url.includes('/pharmacy')) return 'prescription';
  if (url.includes('/billing')) return 'invoice';
  if (url.includes('/appointments')) return 'appointment';
  if (url.includes('/settings')) return 'settings';
  return 'unknown';
};

const extractResourceId = (url, params) => {
  return params?.id || params?.patientId || null;
};

const sanitizeRequestBody = (body) => {
  if (!body) return null;
  
  // Remove sensitive fields from logging
  const sanitized = { ...body };
  const sensitiveFields = ['password', 'ssn', 'social_security_number', 'token', 'secret'];
  
  sensitiveFields.forEach(field => {
    if (sanitized[field]) {
      sanitized[field] = '[REDACTED]';
    }
  });
  
  return sanitized;
};

const shouldLogToDatabase = (url) => {
  // Always log medical data access and sensitive operations
  return url.includes('/patients') || 
         url.includes('/records') || 
         url.includes('/encounters') ||
         url.includes('/consultations') ||
         url.includes('/billing') ||
         url.includes('/lab') ||
         url.includes('/pharmacy') ||
         url.includes('/radiology');
};

const storeAuditLog = async (auditData) => {
  try {
    const db = getDB();
    const query = `
      INSERT INTO audit_logs (
        user_id, action, resource_type, resource_id, 
        old_values, new_values, ip_address, user_agent
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `;
    
    await db.query(query, [
      auditData.user_id,
      auditData.action,
      auditData.resource_type,
      auditData.resource_id,
      null, // old_values - would be populated for updates
      auditData.request_body,
      auditData.ip_address,
      auditData.user_agent
    ]);
  } catch (error) {
    // Silently fail if audit_logs table doesn't exist yet
    if (!error.message.includes('does not exist')) {
      console.error('Failed to store audit log in database:', error);
    }
  }
};

// Middleware to capture data changes for updates
const captureDataChanges = (resourceType) => {
  return async (req, res, next) => {
    if (req.method === 'PUT' || req.method === 'PATCH') {
      try {
        const resourceId = req.params.id;
        const db = getDB();
        
        let query;
        if (resourceType === 'patient') {
          query = 'SELECT * FROM patients WHERE id = $1';
        } else if (resourceType === 'medical_record') {
          query = 'SELECT * FROM medical_records WHERE id = $1';
        }
        
        if (query) {
          const result = await db.query(query, [resourceId]);
          req.oldData = result.rows[0];
        }
      } catch (error) {
        console.error('Failed to capture old data:', error);
      }
    }
    next();
  };
};

// ============================================
// NEW: P0 AUDIT MIDDLEWARE (structured audit events)
// ============================================

/**
 * Maps HTTP methods to audit actions
 */
const methodToAction = {
  'POST': 'create',
  'PUT': 'update',
  'PATCH': 'update',
  'DELETE': 'delete',
  'GET': 'read'
};

/**
 * Audit write operations (create, update, delete)
 * Logs to audit_events table for compliance
 * @param {string} entityType - e.g., 'patient', 'encounter', 'invoice'
 * @param {object} options - { sensitive: bool, extractEntityId: fn }
 */
const auditWrite = (entityType, options = {}) => {
  return async (req, res, next) => {
    // Capture the original response.json to intercept the response
    const originalJson = res.json.bind(res);
    
    res.json = async function (data) {
      try {
        const db = getDB();
        const action = methodToAction[req.method] || 'update';
        
        // Extract entity ID from params, body, or response
        let entityId = req.params.id || req.params.patientId || req.params.encounterId;
        if (options.extractEntityId) {
          entityId = options.extractEntityId(req, data);
        }
        if (!entityId && data?.data?.id) {
          entityId = data.data.id;
        }
        
        // Only log if status indicates success
        const isSuccess = res.statusCode >= 200 && res.statusCode < 400;
        
        if (isSuccess && req.user) {
          await db.query(`
            INSERT INTO audit_events (
              user_id, user_role, user_ip, user_agent,
              action, entity_type, entity_id,
              description, severity, is_sensitive,
              tenant_id, request_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          `, [
            req.user.id,
            (req.user.roles || [])[0] || 'unknown',
            req.ip,
            req.get('User-Agent'),
            action,
            entityType,
            entityId || null,
            `${req.method} ${req.originalUrl}`,
            options.sensitive ? 'warning' : 'info',
            options.sensitive || false,
            req.user.tenant_id || null,
            req.headers['x-request-id'] || null
          ]).catch(err => {
            // Don't fail the request if audit_events table doesn't exist yet
            if (!err.message.includes('does not exist')) {
              logger.error('Audit event logging failed:', err.message);
            }
          });
        }
      } catch (error) {
        logger.error('Audit middleware error:', error.message);
      }
      
      return originalJson(data);
    };
    
    next();
  };
};

/**
 * Audit read access to patient data
 * Used for compliance with Kenya health data regulations
 * @param {string} resourceType - e.g., 'patient_record', 'lab_result'
 */
const auditRead = (resourceType, options = {}) => {
  return async (req, res, next) => {
    const originalJson = res.json.bind(res);
    
    res.json = async function (data) {
      try {
        const db = getDB();
        const isSuccess = res.statusCode >= 200 && res.statusCode < 400;
        
        if (isSuccess && req.user) {
          const resourceId = req.params.id || req.params.patientId || null;
          let patientId = req.params.patientId || req.query.patient_id;
          
          if (!patientId && data?.data?.patient_id) {
            patientId = data.data.patient_id;
          }
          
          await db.query(`
            INSERT INTO data_access_log (
              user_id, user_role, user_ip,
              resource_type, resource_id, patient_id,
              access_type, endpoint, response_code,
              tenant_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          `, [
            req.user.id,
            (req.user.roles || [])[0] || 'unknown',
            req.ip,
            resourceType,
            resourceId,
            patientId || null,
            'view',
            req.originalUrl,
            res.statusCode,
            req.user.tenant_id || null
          ]).catch(err => {
            if (!err.message.includes('does not exist')) {
              logger.error('Data access logging failed:', err.message);
            }
          });
        }
      } catch (error) {
        logger.error('Audit read middleware error:', error.message);
      }
      
      return originalJson(data);
    };
    
    next();
  };
};

module.exports = {
  auditLogger,
  captureDataChanges,
  auditWrite,
  auditRead
};
