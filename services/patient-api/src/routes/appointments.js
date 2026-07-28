const express = require('express');
const router = express.Router();
const { getDB } = require('../utils/database');
const { logger } = require('../utils/logger');
const { authorize } = require('../middleware/auth');
const Joi = require('joi');
const { validate, validateParams, validateQuery, uuidSchema } = require('../utils/validation');
const {
  findPatientAccess,
  hasAnyRole,
  hasRole,
  isAdmin,
  patientScope,
  requirePatientResourceAccess,
  requireProviderIdentity
} = require('../security/accessControl');

const dateSchema = Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/);
const timeSchema = Joi.string().pattern(/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/);
const appointmentTypeSchema = Joi.string().valid(
  'consultation', 'follow-up', 'procedure', 'checkup',
  'vaccination', 'screening', 'therapy', 'diagnostic'
);
const appointmentStatusSchema = Joi.string().valid(
  'scheduled', 'confirmed', 'checked-in', 'in-progress',
  'completed', 'cancelled', 'no-show', 'rescheduled'
);
const appointmentParamsSchema = Joi.object({ id: uuidSchema });
const appointmentListSchema = Joi.object({
  patient_id: Joi.string().uuid().empty(''),
  doctor_id: Joi.string().uuid().empty(''),
  clinic_id: Joi.string().uuid().empty(''),
  status: appointmentStatusSchema.empty(''),
  date_from: dateSchema.empty(''),
  date_to: dateSchema.empty(''),
  appointment_type: appointmentTypeSchema.empty(''),
  page: Joi.number().integer().min(1).max(100000).default(1),
  limit: Joi.number().integer().min(1).max(100).default(50)
});
const appointmentCreateSchema = Joi.object({
  patient_id: Joi.string().uuid().required(),
  appointment_type: appointmentTypeSchema.required(),
  scheduled_date: dateSchema.required(),
  scheduled_time: timeSchema.required(),
  duration_minutes: Joi.number().integer().min(1).max(480).default(30),
  doctor_id: Joi.string().uuid().allow(null),
  clinic_id: Joi.string().uuid().allow(null),
  department_id: Joi.string().uuid().allow(null),
  location_id: Joi.string().uuid().allow(null),
  reason_for_visit: Joi.string().trim().max(1000).allow('', null),
  notes: Joi.string().trim().max(2000).allow('', null),
  payment_type: Joi.string().valid('self-pay', 'corporate', 'insurance', 'government').default('self-pay'),
  corporate_scheme: Joi.string().trim().max(200).allow('', null)
});
const appointmentUpdateSchema = Joi.object({
  scheduled_date: dateSchema,
  scheduled_time: timeSchema,
  duration_minutes: Joi.number().integer().min(1).max(480),
  status: appointmentStatusSchema,
  doctor_id: Joi.string().uuid().allow(null),
  clinic_id: Joi.string().uuid().allow(null),
  reason_for_visit: Joi.string().trim().max(1000).allow('', null),
  notes: Joi.string().trim().max(2000).allow('', null),
  cancellation_reason: Joi.string().trim().min(10).max(500).allow(null)
}).min(1);
const cancelSchema = Joi.object({
  cancellation_reason: Joi.string().trim().min(10).max(500).required()
});
const availableSlotParamsSchema = Joi.object({ doctor_id: uuidSchema });
const availableSlotQuerySchema = Joi.object({ date: dateSchema.required() });
const appointmentAccess = requirePatientResourceAccess({
  table: 'appointments',
  processRoles: ['receptionist']
});

const requireClinicalProviderWhenApplicable = (req, res, next) => {
  if (isAdmin(req.user) || hasRole(req.user, 'receptionist')) return next();
  return requireProviderIdentity('doctor', 'nurse')(req, res, next);
};

const requireAppointmentCreateAccess = async (req, res, next) => {
  try {
    if (isAdmin(req.user) || hasRole(req.user, 'receptionist')) return next();
    if (
      hasRole(req.user, 'doctor') &&
      req.user.staffId &&
      req.validatedData.doctor_id === req.user.staffId
    ) return next();
    if (await findPatientAccess(req.user, req.validatedData.patient_id, 'clinical')) return next();
    return res.status(403).json({ success: false, error: 'Patient access denied' });
  } catch (error) {
    logger.error('Appointment creation authorization failed', {
      error: error.message,
      userId: req.user?.id
    });
    return res.status(503).json({ success: false, error: 'Unable to verify patient access' });
  }
};

const limitReceptionUpdate = (req, res, next) => {
  if (
    hasRole(req.user, 'receptionist') &&
    !isAdmin(req.user) &&
    (Object.hasOwn(req.validatedData, 'notes') || Object.hasOwn(req.validatedData, 'reason_for_visit'))
  ) {
    return res.status(403).json({ success: false, error: 'Clinical appointment notes require clinical access' });
  }
  next();
};

const minimizeAppointment = (row, user) => {
  if (!hasRole(user, 'receptionist') || isAdmin(user)) return row;
  const {
    notes,
    reason_for_visit,
    patient_email,
    patient_dob,
    ...operational
  } = row;
  return operational;
};

// Helper: resolve req.user.id to a valid staff UUID (or null if not found)
async function resolveStaffId(userId) {
  if (!userId) return null;
  try {
    const result = await getDB().query(
      'SELECT id FROM staff WHERE keycloak_user_id = $1 OR id::text = $1 LIMIT 1',
      [userId]
    );
    return result.rows.length > 0 ? result.rows[0].id : null;
  } catch {
    return null;
  }
}

// ============================================
// GET /api/appointments - List all appointments with filters
// ============================================
router.get('/', authorize(['doctor', 'nurse', 'admin', 'receptionist']), validateQuery(appointmentListSchema), async (req, res) => {
  try {
    const {
      patient_id,
      doctor_id,
      clinic_id,
      status,
      date_from,
      date_to,
      appointment_type,
      page = 1,
      limit = 50
    } = req.validatedQuery;

    let query = `
      SELECT 
        a.*,
        p.first_name as patient_first_name,
        p.last_name as patient_last_name,
        p.uhid as patient_uhid,
        p.phone as patient_phone,
        s.first_name as doctor_first_name,
        s.last_name as doctor_last_name,
        s.specialization as doctor_specialization,
        c.clinic_name,
        d.department_name,
        l.location_name
      FROM appointments a
      LEFT JOIN patients p ON a.patient_id = p.id
      LEFT JOIN staff s ON a.doctor_id = s.id
      LEFT JOIN clinics c ON a.clinic_id = c.id
      LEFT JOIN departments d ON a.department_id = d.id
      LEFT JOIN locations l ON a.location_id = l.id
      WHERE 1=1
    `;

    const values = [];
    let paramCount = 1;

    if (patient_id) {
      query += ` AND a.patient_id = $${paramCount++}`;
      values.push(patient_id);
    }

    if (doctor_id) {
      query += ` AND a.doctor_id = $${paramCount++}`;
      values.push(doctor_id);
    }

    if (clinic_id) {
      query += ` AND a.clinic_id = $${paramCount++}`;
      values.push(clinic_id);
    }

    if (status) {
      query += ` AND a.status = $${paramCount++}`;
      values.push(status);
    }

    if (appointment_type) {
      query += ` AND a.appointment_type = $${paramCount++}`;
      values.push(appointment_type);
    }

    if (date_from) {
      query += ` AND a.scheduled_date >= $${paramCount++}`;
      values.push(date_from);
    }

    if (date_to) {
      query += ` AND a.scheduled_date <= $${paramCount++}`;
      values.push(date_to);
    }

    const scope = patientScope(req.user, {
      alias: 'p',
      access: hasRole(req.user, 'receptionist') ? 'demographics' : 'clinical',
      parameterOffset: values.length
    });
    query += ` AND (${scope.clause})`;
    values.push(...scope.params);
    paramCount += scope.params.length;

    query += ` ORDER BY a.scheduled_date DESC, a.scheduled_time DESC`;
    query += ` LIMIT $${paramCount++} OFFSET $${paramCount++}`;
    values.push(limit, (page - 1) * limit);

    const result = await getDB().query(query, values);

    // Get total count
    let countQuery = `SELECT COUNT(*) FROM appointments a WHERE 1=1`;
    const countValues = [];
    let countParamCount = 1;

    if (patient_id) {
      countQuery += ` AND a.patient_id = $${countParamCount++}`;
      countValues.push(patient_id);
    }
    if (doctor_id) {
      countQuery += ` AND a.doctor_id = $${countParamCount++}`;
      countValues.push(doctor_id);
    }
    if (clinic_id) {
      countQuery += ` AND a.clinic_id = $${countParamCount++}`;
      countValues.push(clinic_id);
    }
    if (status) {
      countQuery += ` AND a.status = $${countParamCount++}`;
      countValues.push(status);
    }
    if (appointment_type) {
      countQuery += ` AND a.appointment_type = $${countParamCount++}`;
      countValues.push(appointment_type);
    }
    if (date_from) {
      countQuery += ` AND a.scheduled_date >= $${countParamCount++}`;
      countValues.push(date_from);
    }
    if (date_to) {
      countQuery += ` AND a.scheduled_date <= $${countParamCount++}`;
      countValues.push(date_to);
    }
    const countScope = patientScope(req.user, {
      alias: 'a_patient',
      access: hasRole(req.user, 'receptionist') ? 'demographics' : 'clinical',
      parameterOffset: countValues.length
    });
    countQuery = countQuery.replace(
      'FROM appointments a WHERE 1=1',
      'FROM appointments a JOIN patients a_patient ON a_patient.id = a.patient_id WHERE 1=1'
    );
    countQuery += ` AND (${countScope.clause})`;
    countValues.push(...countScope.params);

    const countResult = await getDB().query(countQuery, countValues);
    const total = parseInt(countResult.rows[0].count);

    res.json({
      success: true,
      data: result.rows.map(row => minimizeAppointment(row, req.user)),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    logger.error('Error fetching appointments:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// GET /api/appointments/:id - Get single appointment
// ============================================
router.get(
  '/:id',
  authorize(['doctor', 'nurse', 'admin', 'receptionist']),
  validateParams(appointmentParamsSchema),
  appointmentAccess,
  async (req, res) => {
  try {
    const { id } = req.validatedParams;

    const query = `
      SELECT 
        a.*,
        p.first_name as patient_first_name,
        p.last_name as patient_last_name,
        p.uhid as patient_uhid,
        p.phone as patient_phone,
        p.email as patient_email,
        p.date_of_birth as patient_dob,
        s.first_name as doctor_first_name,
        s.last_name as doctor_last_name,
        s.specialization as doctor_specialization,
        c.clinic_name,
        d.department_name,
        l.location_name
      FROM appointments a
      LEFT JOIN patients p ON a.patient_id = p.id
      LEFT JOIN staff s ON a.doctor_id = s.id
      LEFT JOIN clinics c ON a.clinic_id = c.id
      LEFT JOIN departments d ON a.department_id = d.id
      LEFT JOIN locations l ON a.location_id = l.id
      WHERE a.id = $1
    `;

    const result = await getDB().query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Appointment not found' });
    }

    res.json({ success: true, data: minimizeAppointment(result.rows[0], req.user) });
  } catch (error) {
    logger.error('Error fetching appointment:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// POST /api/appointments - Create new appointment
// ============================================
router.post(
  '/',
  authorize(['doctor', 'nurse', 'admin', 'receptionist']),
  requireClinicalProviderWhenApplicable,
  validate(appointmentCreateSchema),
  requireAppointmentCreateAccess,
  async (req, res) => {
  try {
    const {
      patient_id,
      appointment_type,
      scheduled_date,
      scheduled_time,
      duration_minutes = 30,
      doctor_id,
      clinic_id,
      department_id,
      location_id,
      reason_for_visit,
      notes,
      payment_type = 'self-pay',
      corporate_scheme
    } = req.validatedData;

    // Check for conflicts
    if (doctor_id) {
      const conflictQuery = `
        SELECT is_time_slot_available($1, $2, $3, $4) as is_available
      `;
      const conflictResult = await getDB().query(conflictQuery, [
        doctor_id,
        scheduled_date,
        scheduled_time,
        duration_minutes
      ]);

      if (!conflictResult.rows[0].is_available) {
        return res.status(409).json({
          success: false,
          error: 'Time slot is not available. Please choose a different time.'
        });
      }
    }

    // Get staff_id for the current user if they exist in staff table
    let createdBy = null;
    if (req.user?.id) {
      const staffCheck = await getDB().query(
        'SELECT id FROM staff WHERE keycloak_user_id = $1 OR id::text = $1 LIMIT 1',
        [req.user.id]
      );
      if (staffCheck.rows.length > 0) {
        createdBy = staffCheck.rows[0].id;
      }
    }

    const query = `
      INSERT INTO appointments (
        patient_id, appointment_type, scheduled_date, scheduled_time,
        duration_minutes, doctor_id, clinic_id, department_id, location_id,
        reason_for_visit, notes, payment_type, corporate_scheme, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *
    `;

    const values = [
      patient_id,
      appointment_type,
      scheduled_date,
      scheduled_time,
      duration_minutes,
      doctor_id || null,
      clinic_id || null,
      department_id || null,
      location_id || null,
      reason_for_visit || null,
      notes || null,
      payment_type,
      corporate_scheme || null,
      createdBy
    ];

    const result = await getDB().query(query, values);

    logger.info(`Appointment created: ${result.rows[0].appointment_number}`, {
      appointmentId: result.rows[0].id,
      patientId: patient_id,
      createdBy: createdBy
    });

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Error creating appointment:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// PUT /api/appointments/:id - Update appointment
// ============================================
router.put(
  '/:id',
  authorize(['doctor', 'nurse', 'admin', 'receptionist']),
  requireClinicalProviderWhenApplicable,
  validateParams(appointmentParamsSchema),
  validate(appointmentUpdateSchema),
  appointmentAccess,
  limitReceptionUpdate,
  async (req, res) => {
  try {
    const { id } = req.validatedParams;
    const {
      scheduled_date,
      scheduled_time,
      duration_minutes,
      status,
      doctor_id,
      clinic_id,
      reason_for_visit,
      notes,
      cancellation_reason
    } = req.validatedData;

    // Check if appointment exists
    const checkQuery = 'SELECT * FROM appointments WHERE id = $1';
    const checkResult = await getDB().query(checkQuery, [id]);

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Appointment not found' });
    }

    // Build update query dynamically
    const updates = [];
    const values = [id];
    let paramCount = 2;

    if (scheduled_date !== undefined) {
      updates.push(`scheduled_date = $${paramCount++}`);
      values.push(scheduled_date);
    }
    if (scheduled_time !== undefined) {
      updates.push(`scheduled_time = $${paramCount++}`);
      values.push(scheduled_time);
    }
    if (duration_minutes !== undefined) {
      updates.push(`duration_minutes = $${paramCount++}`);
      values.push(duration_minutes);
    }
    if (status !== undefined) {
      updates.push(`status = $${paramCount++}`);
      values.push(status);
    }
    if (doctor_id !== undefined) {
      updates.push(`doctor_id = $${paramCount++}`);
      values.push(doctor_id);
    }
    if (clinic_id !== undefined) {
      updates.push(`clinic_id = $${paramCount++}`);
      values.push(clinic_id);
    }
    if (reason_for_visit !== undefined) {
      updates.push(`reason_for_visit = $${paramCount++}`);
      values.push(reason_for_visit);
    }
    if (notes !== undefined) {
      updates.push(`notes = $${paramCount++}`);
      values.push(notes);
    }
    if (cancellation_reason !== undefined) {
      updates.push(`cancellation_reason = $${paramCount++}`);
      values.push(cancellation_reason);
    }

    const staffId = await resolveStaffId(req.user?.id);
    updates.push(`updated_by = $${paramCount++}`);
    values.push(staffId);

    if (updates.length === 0) {
      return res.status(400).json({ success: false, error: 'No fields to update' });
    }

    const query = `
      UPDATE appointments
      SET ${updates.join(', ')}
      WHERE id = $1
      RETURNING *
    `;

    const result = await getDB().query(query, values);

    logger.info(`Appointment updated: ${result.rows[0].appointment_number}`, {
      appointmentId: id,
      updatedBy: req.user?.id
    });

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Error updating appointment:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// POST /api/appointments/:id/check-in - Check in patient
// ============================================
router.post(
  '/:id/check-in',
  authorize(['nurse', 'admin', 'receptionist']),
  validateParams(appointmentParamsSchema),
  appointmentAccess,
  async (req, res) => {
  try {
    const { id } = req.validatedParams;
    const staffId = await resolveStaffId(req.user?.id);

    const query = `
      UPDATE appointments
      SET 
        status = 'checked-in',
        checked_in_at = NOW(),
        checked_in_by = $2
      WHERE id = $1 AND status IN ('scheduled', 'confirmed')
      RETURNING *
    `;

    const result = await getDB().query(query, [id, staffId]);

    if (result.rows.length === 0) {
      return res.status(409).json({ success: false, error: 'Appointment is not in a check-in eligible state' });
    }

    logger.info(`Patient checked in for appointment: ${result.rows[0].appointment_number}`);

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Error checking in appointment:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// POST /api/appointments/:id/confirm - Confirm appointment
// ============================================
router.post(
  '/:id/confirm',
  authorize(['nurse', 'admin', 'receptionist']),
  validateParams(appointmentParamsSchema),
  appointmentAccess,
  async (req, res) => {
  try {
    const { id } = req.validatedParams;
    const staffId = await resolveStaffId(req.user?.id);

    const query = `
      UPDATE appointments
      SET 
        status = 'confirmed',
        confirmed_at = NOW(),
        confirmed_by = $2
      WHERE id = $1 AND status = 'scheduled'
      RETURNING *
    `;

    const result = await getDB().query(query, [id, staffId]);

    if (result.rows.length === 0) {
      return res.status(409).json({ success: false, error: 'Appointment is not in a confirmable state' });
    }

    logger.info(`Appointment confirmed: ${result.rows[0].appointment_number}`);

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Error confirming appointment:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// POST /api/appointments/:id/cancel - Cancel appointment
// ============================================
router.post(
  '/:id/cancel',
  authorize(['doctor', 'nurse', 'admin', 'receptionist']),
  requireClinicalProviderWhenApplicable,
  validateParams(appointmentParamsSchema),
  validate(cancelSchema),
  appointmentAccess,
  async (req, res) => {
  try {
    const { id } = req.validatedParams;
    const { cancellation_reason } = req.validatedData;

    const query = `
      UPDATE appointments
      SET 
        status = 'cancelled',
        cancellation_reason = $2,
        updated_by = $3
      WHERE id = $1 AND status NOT IN ('completed', 'cancelled')
      RETURNING *
    `;

    const staffId = await resolveStaffId(req.user?.id);
    const result = await getDB().query(query, [id, cancellation_reason, staffId]);

    if (result.rows.length === 0) {
      return res.status(409).json({ success: false, error: 'Appointment cannot be cancelled in its current state' });
    }

    logger.info(`Appointment cancelled: ${result.rows[0].appointment_number}`);

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Error cancelling appointment:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// GET /api/appointments/available-slots - Get available time slots
// ============================================
router.get(
  '/doctor/:doctor_id/available-slots',
  authorize(['doctor', 'nurse', 'admin', 'receptionist']),
  validateParams(availableSlotParamsSchema),
  validateQuery(availableSlotQuerySchema),
  async (req, res) => {
  try {
    const { doctor_id } = req.validatedParams;
    const { date } = req.validatedQuery;

    const query = `SELECT * FROM get_available_time_slots($1, $2)`;
    const result = await getDB().query(query, [doctor_id, date]);

    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('Error fetching available slots:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// GET /api/appointments/conflicts - Get appointment conflicts
// ============================================
router.get('/conflicts/list', authorize(['admin']), async (req, res) => {
  try {
    const query = `SELECT * FROM appointment_conflicts`;
    const result = await getDB().query(query);

    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('Error fetching appointment conflicts:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
