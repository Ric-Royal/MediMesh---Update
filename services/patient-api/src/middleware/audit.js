const { auditLogger: auditLoggerUtil } = require('../utils/logger');
const { getDB } = require('../utils/database');

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
  return 'unknown';
};

const extractResourceId = (url, params) => {
  return params?.id || params?.patientId || null;
};

const sanitizeRequestBody = (body) => {
  if (!body) return null;
  
  // Remove sensitive fields from logging
  const sanitized = { ...body };
  const sensitiveFields = ['password', 'ssn', 'social_security_number'];
  
  sensitiveFields.forEach(field => {
    if (sanitized[field]) {
      sanitized[field] = '[REDACTED]';
    }
  });
  
  return sanitized;
};

const shouldLogToDatabase = (url) => {
  // Always log medical data access
  return url.includes('/patients') || url.includes('/records');
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
    console.error('Failed to store audit log in database:', error);
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

module.exports = {
  auditLogger,
  captureDataChanges
}; 