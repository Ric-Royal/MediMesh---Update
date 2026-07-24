const crypto = require('crypto');
const { appendAuditEvent } = require('../security/auditEvents');
const { logger } = require('../utils/logger');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const resourceFromPath = (path, params = {}) => {
  const segments = String(path || '').split('/').filter(Boolean);
  const apiIndex = segments.indexOf('api');
  const resourceType = segments[apiIndex + 1] || segments[0] || 'unknown';
  const candidates = [
    params.fileId,
    params.itemId,
    params.patientId,
    params.encounterId,
    params.id,
    ...segments
  ];
  const resourceId = candidates.find(value => UUID_PATTERN.test(String(value || ''))) || null;
  return { resourceType, resourceId };
};

const auditMetadata = req => ({
  changed_fields: ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)
    ? Object.keys(req.body || {}).filter(field => !/password|secret|token|code/i.test(field))
    : [],
  query_fields: Object.keys(req.query || {}),
  authentication_source: req.authenticationSource || null,
  department_id: req.user?.departmentId || null,
  staff_role: req.user?.staffRole || null
});

const buildAuditEvent = (req, res) => {
  const requestPath = (req.originalUrl || req.url || '').split('?')[0];
  const resource = resourceFromPath(requestPath, req.params);
  return {
    requestId: req.auditContext.requestId,
    occurredAt: req.auditContext.startedAt,
    userId: req.user?.id || null,
    providerIdentifier: req.user?.providerIdentifier || null,
    username: req.user?.username || null,
    action: `${req.method} ${requestPath}`,
    method: req.method,
    path: requestPath,
    statusCode: res.statusCode,
    outcome: res.statusCode < 400 ? 'success' : 'denied_or_error',
    resourceType: resource.resourceType,
    resourceId: resource.resourceId,
    patientId: req.accessContext?.patientId || null,
    purpose: req.accessContext?.purpose || req.get('X-Access-Purpose') || null,
    breakGlass: req.accessContext?.breakGlass === true,
    sourceIp: req.ip || req.socket?.remoteAddress || null,
    userAgent: req.get('User-Agent') || null,
    metadata: auditMetadata(req)
  };
};

const auditLogger = (req, res, next) => {
  req.auditContext = {
    requestId: req.get('X-Request-ID') || crypto.randomUUID(),
    startedAt: new Date().toISOString()
  };
  res.setHeader('X-Request-ID', req.auditContext.requestId);

  const originalEnd = res.end.bind(res);
  let endStarted = false;

  res.end = function auditedEnd(chunk, encoding, callback) {
    if (endStarted) return originalEnd(chunk, encoding, callback);
    endStarted = true;

    const finish = () => originalEnd(chunk, encoding, callback);
    appendAuditEvent(buildAuditEvent(req, res))
      .then(finish)
      .catch(error => {
        logger.error('Mandatory audit persistence failed', {
          error: error.message,
          requestId: req.auditContext.requestId,
          method: req.method,
          path: req.path,
          userId: req.user?.id
        });

        if (process.env.AUDIT_FAIL_CLOSED !== 'false' && !res.headersSent) {
          res.statusCode = 503;
          res.removeHeader('Set-Cookie');
          res.setHeader('Content-Type', 'application/json');
          return originalEnd(JSON.stringify({
            error: 'The request could not be completed because audit recording is unavailable.',
            request_id: req.auditContext.requestId
          }), 'utf8', callback);
        }
        return finish();
      });
    return res;
  };

  next();
};

// Retained for route compatibility. Before/after values are versioned in the
// clinical history tables rather than copied into general application logs.
const captureDataChanges = () => (req, res, next) => next();

module.exports = {
  auditLogger,
  buildAuditEvent,
  captureDataChanges,
  resourceFromPath
};
