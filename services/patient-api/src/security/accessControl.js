const { getDB } = require('../utils/database');
const { appendAuditEvent } = require('./auditEvents');
const { logger } = require('../utils/logger');

const CLINICAL_ROLES = new Set(['doctor', 'nurse']);
const PATIENT_RESOURCE_TABLES = new Set([
  'lab_orders',
  'radiology_orders',
  'prescriptions',
  'invoices',
  'billing_payments',
  'file_attachments',
  'appointments'
]);
const BREAK_GLASS_MIN_LENGTH = 20;
const BREAK_GLASS_MAX_LENGTH = 500;

const rolesOf = user => Array.isArray(user?.roles) ? user.roles : [];
const hasRole = (user, role) => rolesOf(user).includes(role);
const hasAnyRole = (user, roles) => roles.some(role => hasRole(user, role));
const isAdmin = user => hasRole(user, 'admin');

const patientScope = (user, options = {}) => {
  const alias = options.alias || 'p';
  const access = options.access || 'clinical';
  const parameterOffset = Number(options.parameterOffset || 0);
  const params = [];

  if (isAdmin(user)) return { clause: 'TRUE', params };
  if (access === 'demographics' && hasRole(user, 'receptionist')) {
    return { clause: 'TRUE', params };
  }
  if (!hasAnyRole(user, ['doctor', 'nurse'])) {
    return { clause: 'FALSE', params };
  }

  params.push(user.staffId || user.id);
  const staffParameter = `$${params.length + parameterOffset}`;
  params.push(user.departmentId || null);
  const departmentParameter = `$${params.length + parameterOffset}`;

  return {
    clause: `EXISTS (
      SELECT 1
      FROM encounters access_encounter
      LEFT JOIN clinics access_clinic ON access_clinic.id = access_encounter.clinic_id
      WHERE access_encounter.patient_id = ${alias}.id
        AND (
          access_encounter.doctor_id = ${staffParameter}
          OR (
            ${departmentParameter}::uuid IS NOT NULL
            AND access_clinic.department_id = ${departmentParameter}
          )
        )
    )`,
    params
  };
};

const findPatientAccess = async (user, patientId, access = 'clinical', executor = getDB()) => {
  const scope = patientScope(user, {
    alias: 'p',
    access,
    parameterOffset: 1
  });
  const result = await executor.query(
    `SELECT p.id FROM patients p WHERE p.id = $1 AND (${scope.clause}) LIMIT 1`,
    [patientId, ...scope.params]
  );
  return result.rows.length > 0;
};

const findEncounterAccess = async (user, encounterId, access = 'clinical', executor = getDB()) => {
  if (isAdmin(user)) {
    const exists = await executor.query('SELECT patient_id FROM encounters WHERE id = $1', [encounterId]);
    return exists.rows[0] || null;
  }

  const result = await executor.query(`
    SELECT e.patient_id, e.clinic_id, e.doctor_id
    FROM encounters e
    LEFT JOIN clinics c ON c.id = e.clinic_id
    WHERE e.id = $1
      AND (
        ($2::text = 'operational' AND $3::boolean)
        OR e.doctor_id = $4
        OR ($5::uuid IS NOT NULL AND c.department_id = $5)
        OR ($6::boolean AND EXISTS (
          SELECT 1 FROM lab_orders lo WHERE lo.encounter_id = e.id
        ))
        OR ($7::boolean AND EXISTS (
          SELECT 1 FROM radiology_orders ro WHERE ro.encounter_id = e.id
        ))
        OR ($8::boolean AND EXISTS (
          SELECT 1 FROM prescriptions pr WHERE pr.encounter_id = e.id
        ))
        OR ($9::boolean AND EXISTS (
          SELECT 1 FROM invoices inv WHERE inv.encounter_id = e.id
        ))
      )
    LIMIT 1
  `, [
    encounterId,
    access,
    hasRole(user, 'receptionist'),
    user.staffId || user.id,
    user.departmentId || null,
    hasRole(user, 'lab-tech'),
    hasAnyRole(user, ['radiologist', 'radiographer']),
    hasRole(user, 'pharmacist'),
    hasRole(user, 'billing')
  ]);
  return result.rows[0] || null;
};

const breakGlassReason = req => String(req.get('X-Break-Glass-Reason') || '').trim();

const recordBreakGlass = async (req, patientId, resourceType, resourceId) => {
  const reason = breakGlassReason(req);
  await appendAuditEvent({
    requestId: req.auditContext?.requestId,
    userId: req.user.id,
    providerIdentifier: req.user.providerIdentifier,
    username: req.user.username,
    action: 'BREAK_GLASS_ACCESS',
    method: req.method,
    path: req.path,
    statusCode: 200,
    outcome: 'authorized',
    resourceType,
    resourceId,
    patientId,
    purpose: reason,
    breakGlass: true,
    sourceIp: req.ip,
    userAgent: req.get('User-Agent')
  });
  req.accessContext = {
    ...(req.accessContext || {}),
    patientId,
    purpose: reason,
    breakGlass: true
  };
};

const allowBreakGlass = async (req, patientId, resourceType, resourceId) => {
  const reason = breakGlassReason(req);
  if (!hasAnyRole(req.user, [...CLINICAL_ROLES])) return false;
  if (reason.length < BREAK_GLASS_MIN_LENGTH || reason.length > BREAK_GLASS_MAX_LENGTH) return false;
  await recordBreakGlass(req, patientId, resourceType, resourceId);
  return true;
};

const requirePatientAccess = ({
  access = 'clinical',
  patientId = req => req.params.id || req.params.patientId || req.body?.patient_id,
  resourceType = 'patient',
  resourceId = req => req.params.id || req.params.patientId || null,
  breakGlass = access === 'clinical'
} = {}) => async (req, res, next) => {
  try {
    const id = patientId(req);
    if (!id) return res.status(400).json({ error: 'Patient context is required' });
    if (await findPatientAccess(req.user, id, access)) {
      req.accessContext = { ...(req.accessContext || {}), patientId: id, breakGlass: false };
      return next();
    }
    if (breakGlass && await allowBreakGlass(req, id, resourceType, resourceId(req))) {
      return next();
    }
    logger.warn('Patient access denied', {
      userId: req.user.id,
      patientId: id,
      access,
      resourceType,
      ip: req.ip
    });
    return res.status(403).json({ error: 'Patient access denied' });
  } catch (error) {
    logger.error('Patient authorization check failed', {
      error: error.message,
      userId: req.user?.id,
      patientId: patientId(req)
    });
    return res.status(503).json({ error: 'Unable to verify patient access' });
  }
};

const requireEncounterAccess = ({
  access = 'clinical',
  encounterId = req => req.params.encounterId || req.params.id || req.body?.encounter_id || req.body?.encounterId,
  breakGlass = access === 'clinical'
} = {}) => async (req, res, next) => {
  try {
    const id = encounterId(req);
    if (!id) return res.status(400).json({ error: 'Encounter context is required' });
    const encounter = await findEncounterAccess(req.user, id, access);
    if (encounter) {
      req.accessContext = {
        ...(req.accessContext || {}),
        encounterId: id,
        patientId: encounter.patient_id,
        breakGlass: false
      };
      return next();
    }
    const patientResult = await getDB().query('SELECT patient_id FROM encounters WHERE id = $1', [id]);
    const patientId = patientResult.rows[0]?.patient_id;
    if (patientId && breakGlass && await allowBreakGlass(req, patientId, 'encounter', id)) {
      req.accessContext.encounterId = id;
      return next();
    }
    return res.status(403).json({ error: 'Encounter access denied' });
  } catch (error) {
    logger.error('Encounter authorization check failed', {
      error: error.message,
      userId: req.user?.id,
      encounterId: encounterId(req)
    });
    return res.status(503).json({ error: 'Unable to verify encounter access' });
  }
};

const requireRecordAccess = ({
  access = 'clinical',
  breakGlass = access === 'clinical'
} = {}) => async (req, res, next) => {
  const recordId = req.params.id || req.params.recordId || req.body?.medical_record_id;
  try {
    const result = await getDB().query(
      'SELECT patient_id FROM medical_records WHERE id = $1 AND deleted_at IS NULL',
      [recordId]
    );
    const patientId = result.rows[0]?.patient_id;
    if (!patientId) return res.status(404).json({ error: 'Medical record not found' });
    if (await findPatientAccess(req.user, patientId, access)) {
      req.accessContext = {
        ...(req.accessContext || {}),
        patientId,
        recordId,
        breakGlass: false
      };
      return next();
    }
    if (breakGlass && await allowBreakGlass(req, patientId, 'medical_record', recordId)) {
      req.accessContext.recordId = recordId;
      return next();
    }
    return res.status(403).json({ error: 'Medical record access denied' });
  } catch (error) {
    logger.error('Medical record authorization check failed', {
      error: error.message,
      userId: req.user?.id,
      recordId
    });
    return res.status(503).json({ error: 'Unable to verify medical record access' });
  }
};

const requireConsultationAccess = () => async (req, res, next) => {
  const consultationId = req.params.id;
  try {
    const result = await getDB().query(
      'SELECT encounter_id FROM consultation_records WHERE id = $1',
      [consultationId]
    );
    const encounterId = result.rows[0]?.encounter_id;
    if (!encounterId) return res.status(404).json({ error: 'Consultation not found' });
    req.params.encounterId = encounterId;
    return requireEncounterAccess({ encounterId: request => request.params.encounterId })(
      req,
      res,
      next
    );
  } catch (error) {
    logger.error('Consultation authorization check failed', {
      error: error.message,
      consultationId,
      userId: req.user?.id
    });
    return res.status(503).json({ error: 'Unable to verify consultation access' });
  }
};

const requirePatientResourceAccess = ({
  table,
  processRoles = [],
  id = req => req.params.id
}) => {
  if (!PATIENT_RESOURCE_TABLES.has(table)) {
    throw new Error(`Unsupported patient resource table: ${table}`);
  }
  return async (req, res, next) => {
    const resourceId = id(req);
    try {
      const result = await getDB().query(
        `SELECT patient_id FROM ${table} WHERE id = $1`,
        [resourceId]
      );
      const patientId = result.rows[0]?.patient_id;
      if (!patientId) return res.status(404).json({ error: 'Resource not found' });
      if (
        isAdmin(req.user) ||
        hasAnyRole(req.user, processRoles) ||
        await findPatientAccess(req.user, patientId, 'clinical')
      ) {
        req.accessContext = {
          ...(req.accessContext || {}),
          patientId,
          resourceId,
          breakGlass: false
        };
        return next();
      }
      if (await allowBreakGlass(req, patientId, table, resourceId)) return next();
      return res.status(403).json({ error: 'Patient resource access denied' });
    } catch (error) {
      logger.error('Patient resource authorization check failed', {
        error: error.message,
        resourceId,
        table,
        userId: req.user?.id
      });
      return res.status(503).json({ error: 'Unable to verify patient resource access' });
    }
  };
};

const requireProviderIdentity = (...allowedStaffRoles) => (req, res, next) => {
  if (isAdmin(req.user)) return next();
  if (!req.user?.staffId || !req.user?.providerIdentifier || req.user.staffStatus !== 'active') {
    return res.status(403).json({ error: 'An active, linked staff identity is required' });
  }
  if (allowedStaffRoles.length && !allowedStaffRoles.includes(req.user.staffRole)) {
    return res.status(403).json({ error: 'The linked professional role is not authorized for this action' });
  }
  if (
    ['doctor', 'radiologist'].includes(req.user.staffRole) &&
    (!req.user.licenseNumber || (req.user.licenseExpiry && new Date(req.user.licenseExpiry) < new Date()))
  ) {
    return res.status(403).json({ error: 'A current professional licence is required for this action' });
  }
  next();
};

module.exports = {
  allowBreakGlass,
  findEncounterAccess,
  findPatientAccess,
  hasAnyRole,
  hasRole,
  isAdmin,
  patientScope,
  requireEncounterAccess,
  requireConsultationAccess,
  requirePatientAccess,
  requirePatientResourceAccess,
  requireRecordAccess,
  requireProviderIdentity,
  rolesOf
};
