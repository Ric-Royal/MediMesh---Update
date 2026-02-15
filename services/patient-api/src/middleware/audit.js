const { auditLogger: auditLoggerUtil } = require('../utils/logger');
const { getDB } = require('../utils/database');
const crypto = require('crypto');

/**
 * Main audit logging middleware
 * Intercepts all API responses and logs audit events + data access
 */
const auditLogger = (req, res, next) => {
  const startTime = Date.now();
  const originalJson = res.json;

  res.json = function (data) {
    const elapsed = Date.now() - startTime;
    logAuditTrail(req, res, data, elapsed).catch(err =>
      console.error('Audit logging error:', err)
    );
    return originalJson.call(this, data);
  };

  next();
};

/**
 * Map HTTP method + URL to audit action
 */
const resolveAction = (method, statusCode) => {
  if (statusCode === 403) return 'access_denied';
  switch (method) {
    case 'GET': return 'read';
    case 'POST': return 'create';
    case 'PUT':
    case 'PATCH': return 'update';
    case 'DELETE': return 'delete';
    default: return 'read';
  }
};

/**
 * Determine the entity type from the URL
 */
const extractResourceType = (url) => {
  const segments = url.replace(/^\/api\//, '').split('/');
  const mapping = {
    patients: 'patient',
    records: 'medical_record',
    encounters: 'encounter',
    appointments: 'appointment',
    consultations: 'consultation',
    lab: 'lab_order',
    pharmacy: 'prescription',
    radiology: 'radiology_order',
    billing: 'invoice',
    payments: 'payment',
    queue: 'queue_entry',
    staff: 'staff',
    settings: 'settings',
    wards: 'ward',
    schedules: 'schedule',
    files: 'file',
    clinics: 'clinic'
  };
  return mapping[segments[0]] || segments[0] || 'unknown';
};

const extractResourceId = (_url, params) => {
  return params?.id || params?.patientId || params?.encounterId || params?.orderId || null;
};

/**
 * Sanitize request body — strip passwords, tokens, large payloads
 */
const sanitizeRequestBody = (body) => {
  if (!body || typeof body !== 'object') return null;
  const sanitized = { ...body };
  const sensitiveFields = ['password', 'ssn', 'social_security_number', 'token', 'secret', 'credit_card'];
  sensitiveFields.forEach(field => {
    if (sanitized[field]) sanitized[field] = '[REDACTED]';
  });
  // Truncate large payloads
  const str = JSON.stringify(sanitized);
  if (str.length > 5000) {
    return { _truncated: true, _size: str.length };
  }
  return sanitized;
};

/**
 * Hash a value for audit comparison (before/after)
 */
const hashValue = (value) => {
  if (!value) return null;
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
};

/**
 * Routes that should generate audit_events (write operations + sensitive reads)
 */
const shouldLogAuditEvent = (method, url) => {
  // Always log mutations
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return true;
  // Log reads on sensitive resources
  const sensitivePatterns = ['/patients/', '/records/', '/billing/', '/lab/', '/pharmacy/'];
  return sensitivePatterns.some(p => url.includes(p));
};

/**
 * Routes that should generate data_access_log entries
 */
const shouldLogDataAccess = (method, url) => {
  if (method !== 'GET') return false;
  const accessPatterns = ['/patients', '/records', '/encounters', '/lab/', '/pharmacy/', '/radiology/', '/billing/'];
  return accessPatterns.some(p => url.includes(p));
};

/**
 * Determine access type for data_access_log
 */
const resolveAccessType = (url) => {
  if (url.includes('/export')) return 'export';
  if (url.includes('/print')) return 'print';
  if (url.includes('search') || url.includes('?q=')) return 'search';
  if (url.match(/\/[0-9a-f-]{36}/i)) return 'view';
  return 'list';
};

/**
 * Core audit trail logger
 */
const logAuditTrail = async (req, res, responseData, elapsedMs) => {
  try {
    const action = resolveAction(req.method, res.statusCode);
    const entityType = extractResourceType(req.originalUrl);
    const entityId = extractResourceId(req.originalUrl, req.params);
    const severity = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warning' : 'info';

    const auditData = {
      timestamp: new Date().toISOString(),
      user_id: req.user?.id || 'anonymous',
      username: req.user?.username || 'anonymous',
      user_role: req.user?.roles?.[0] || 'unknown',
      action: `${req.method} ${req.originalUrl}`,
      entity_type: entityType,
      entity_id: entityId,
      status_code: res.statusCode,
      ip_address: req.ip || req.connection?.remoteAddress,
      user_agent: req.get('User-Agent'),
      elapsed_ms: elapsedMs,
      severity
    };

    // Log to Winston audit logger
    if (auditLoggerUtil) {
      auditLoggerUtil.info('API Access', auditData);
    }

    const db = getDB();

    // Store audit event for mutations and sensitive reads
    if (shouldLogAuditEvent(req.method, req.originalUrl)) {
      await storeAuditEvent(db, {
        user_id: req.user?.id,
        username: req.user?.username,
        user_role: req.user?.roles?.[0],
        ip_address: req.ip || req.connection?.remoteAddress,
        user_agent: req.get('User-Agent'),
        action,
        entity_type: entityType,
        entity_id: entityId,
        description: `${req.method} ${req.originalUrl}`,
        old_value_hash: req.oldData ? hashValue(req.oldData) : null,
        new_value_hash: req.method !== 'GET' ? hashValue(sanitizeRequestBody(req.body)) : null,
        changes: req.method !== 'GET' ? sanitizeRequestBody(req.body) : null,
        metadata: { status_code: res.statusCode, elapsed_ms: elapsedMs },
        severity
      });
    }

    // Store data access log for GET requests on clinical/financial data
    if (shouldLogDataAccess(req.method, req.originalUrl)) {
      await storeDataAccessLog(db, {
        user_id: req.user?.id,
        username: req.user?.username,
        user_role: req.user?.roles?.[0],
        ip_address: req.ip || req.connection?.remoteAddress,
        resource_type: entityType,
        resource_id: entityId || '',
        patient_id: req.params?.patientId || null,
        access_type: resolveAccessType(req.originalUrl),
        query_parameters: Object.keys(req.query).length > 0 ? req.query : null,
        session_id: req.headers['x-session-id'] || null
      });
    }
  } catch (error) {
    console.error('Audit logging error (non-fatal):', error.message);
  }
};

/**
 * Store an audit event in the audit_events table
 */
const storeAuditEvent = async (db, data) => {
  try {
    const query = `
      INSERT INTO audit_events (
        user_id, username, user_role, ip_address, user_agent,
        action, entity_type, entity_id,
        description, old_value_hash, new_value_hash, changes, metadata, severity
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    `;
    await db.query(query, [
      data.user_id, data.username, data.user_role, data.ip_address, data.user_agent,
      data.action, data.entity_type, data.entity_id,
      data.description, data.old_value_hash, data.new_value_hash,
      data.changes ? JSON.stringify(data.changes) : null,
      data.metadata ? JSON.stringify(data.metadata) : null,
      data.severity
    ]);
  } catch (error) {
    // Don't let audit failures break the request — just log
    console.error('Failed to store audit event:', error.message);
  }
};

/**
 * Store a data access log entry
 */
const storeDataAccessLog = async (db, data) => {
  try {
    const query = `
      INSERT INTO data_access_log (
        user_id, username, user_role, ip_address,
        resource_type, resource_id, patient_id,
        access_type, query_parameters, session_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `;
    await db.query(query, [
      data.user_id, data.username, data.user_role, data.ip_address,
      data.resource_type, data.resource_id, data.patient_id,
      data.access_type,
      data.query_parameters ? JSON.stringify(data.query_parameters) : null,
      data.session_id
    ]);
  } catch (error) {
    console.error('Failed to store data access log:', error.message);
  }
};

/**
 * Middleware to capture before-state for UPDATE operations
 */
const captureDataChanges = (resourceType) => {
  return async (req, res, next) => {
    if (req.method === 'PUT' || req.method === 'PATCH') {
      try {
        const resourceId = req.params.id;
        const db = getDB();

        const tableMap = {
          patient: 'patients',
          medical_record: 'medical_records',
          encounter: 'encounters',
          appointment: 'appointments',
          invoice: 'invoices',
          staff: 'staff',
          prescription: 'prescriptions',
          lab_order: 'lab_orders',
          radiology_order: 'radiology_orders'
        };

        const table = tableMap[resourceType];
        if (table && resourceId) {
          const result = await db.query(`SELECT * FROM ${table} WHERE id = $1`, [resourceId]);
          req.oldData = result.rows[0] || null;
        }
      } catch (error) {
        console.error('Failed to capture old data:', error.message);
      }
    }
    next();
  };
};

module.exports = {
  auditLogger,
  captureDataChanges
};
