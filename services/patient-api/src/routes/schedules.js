const express = require('express');
const router = express.Router();
const { getDB } = require('../utils/database');
const { logger } = require('../utils/logger');
const { authorize } = require('../middleware/auth');
const Joi = require('joi');
const { validate, validateParams, validateQuery, uuidSchema } = require('../utils/validation');
const { hasRole, requireProviderIdentity } = require('../security/accessControl');

const dateSchema = Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/);
const timeSchema = Joi.string().pattern(/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/);
const scheduleParamsSchema = Joi.object({ id: uuidSchema });
const scheduleQuerySchema = Joi.object({
  doctor_id: Joi.string().uuid(),
  clinic_id: Joi.string().uuid(),
  day_of_week: Joi.number().integer().min(0).max(6),
  is_active: Joi.boolean(),
  date: dateSchema
});
const scheduleCreateSchema = Joi.object({
  doctor_id: Joi.string().uuid().required(),
  schedule_type: Joi.string().valid('regular', 'one-time', 'override', 'leave').default('regular'),
  day_of_week: Joi.number().integer().min(0).max(6).allow(null),
  specific_date: dateSchema.allow(null),
  start_time: timeSchema.required(),
  end_time: timeSchema.required(),
  slot_duration_minutes: Joi.number().integer().min(1).max(240).default(30),
  max_appointments_per_slot: Joi.number().integer().min(1).max(100).default(1),
  clinic_id: Joi.string().uuid().allow(null),
  location_id: Joi.string().uuid().allow(null),
  is_available: Joi.boolean().default(true),
  notes: Joi.string().trim().max(1000).allow('', null),
  unavailable_reason: Joi.string().trim().max(500).allow('', null),
  effective_from: dateSchema.allow(null),
  effective_until: dateSchema.allow(null)
}).custom((value, helpers) => {
  if (value.start_time >= value.end_time) return helpers.error('any.invalid');
  if (value.schedule_type === 'regular' && value.day_of_week == null) return helpers.error('any.invalid');
  if (value.schedule_type !== 'regular' && !value.specific_date) return helpers.error('any.invalid');
  if (value.effective_from && value.effective_until && value.effective_until < value.effective_from) {
    return helpers.error('any.invalid');
  }
  return value;
});
const scheduleUpdateSchema = Joi.object({
  start_time: timeSchema,
  end_time: timeSchema,
  slot_duration_minutes: Joi.number().integer().min(1).max(240),
  max_appointments_per_slot: Joi.number().integer().min(1).max(100),
  is_available: Joi.boolean(),
  is_active: Joi.boolean(),
  notes: Joi.string().trim().max(1000).allow('', null),
  unavailable_reason: Joi.string().trim().max(500).allow('', null)
}).min(1);

const requireScheduleOwner = async (req, res, next) => {
  if (hasRole(req.user, 'admin')) return next();
  try {
    const result = await getDB().query(
      'SELECT doctor_id FROM doctor_schedules WHERE id = $1',
      [req.validatedParams.id]
    );
    if (!result.rows.length) return res.status(404).json({ success: false, error: 'Schedule not found' });
    if (!req.user.staffId || result.rows[0].doctor_id !== req.user.staffId) {
      return res.status(403).json({ success: false, error: 'Schedule access denied' });
    }
    next();
  } catch (error) {
    logger.error('Schedule authorization failed', { error: error.message, userId: req.user?.id });
    res.status(503).json({ success: false, error: 'Unable to verify schedule access' });
  }
};

const requireCreateOwnership = (req, res, next) => {
  if (hasRole(req.user, 'admin')) return next();
  if (!req.user.staffId || req.validatedData.doctor_id !== req.user.staffId) {
    return res.status(403).json({ success: false, error: 'Doctors may only manage their own schedule' });
  }
  next();
};

// ============================================
// GET /api/schedules - List all doctor schedules
// ============================================
router.get('/', authorize(['doctor', 'nurse', 'admin', 'receptionist']), validateQuery(scheduleQuerySchema), async (req, res) => {
  try {
    const { doctor_id, clinic_id, day_of_week, is_active, date } = req.validatedQuery;

    let query = `
      SELECT 
        ds.*,
        s.first_name as doctor_first_name,
        s.last_name as doctor_last_name,
        s.specialization as doctor_specialization,
        c.clinic_name,
        l.location_name
      FROM doctor_schedules ds
      LEFT JOIN staff s ON ds.doctor_id = s.id
      LEFT JOIN clinics c ON ds.clinic_id = c.id
      LEFT JOIN locations l ON ds.location_id = l.id
      WHERE 1=1
    `;

    const values = [];
    let paramCount = 1;

    if (doctor_id) {
      query += ` AND ds.doctor_id = $${paramCount++}`;
      values.push(doctor_id);
    }

    if (clinic_id) {
      query += ` AND ds.clinic_id = $${paramCount++}`;
      values.push(clinic_id);
    }

    if (day_of_week !== undefined) {
      query += ` AND ds.day_of_week = $${paramCount++}`;
      values.push(day_of_week);
    }

    if (is_active !== undefined) {
      query += ` AND ds.is_active = $${paramCount++}`;
      values.push(is_active);
    }

    if (date) {
      query += ` AND (
        (ds.schedule_type = 'regular' AND EXTRACT(DOW FROM $${paramCount}::DATE) = ds.day_of_week) OR
        (ds.schedule_type IN ('one-time', 'override', 'leave') AND ds.specific_date = $${paramCount})
      )`;
      values.push(date);
      paramCount++;
    }

    query += ` ORDER BY ds.day_of_week, ds.start_time`;

    const result = await getDB().query(query, values);

    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('Error fetching schedules:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// GET /api/schedules/:id - Get single schedule
// ============================================
router.get('/:id', authorize(['doctor', 'nurse', 'admin', 'receptionist']), validateParams(scheduleParamsSchema), async (req, res) => {
  try {
    const { id } = req.validatedParams;

    const query = `
      SELECT 
        ds.*,
        s.first_name as doctor_first_name,
        s.last_name as doctor_last_name,
        s.specialization as doctor_specialization,
        c.clinic_name,
        l.location_name
      FROM doctor_schedules ds
      LEFT JOIN staff s ON ds.doctor_id = s.id
      LEFT JOIN clinics c ON ds.clinic_id = c.id
      LEFT JOIN locations l ON ds.location_id = l.id
      WHERE ds.id = $1
    `;

    const result = await getDB().query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Schedule not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Error fetching schedule:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// POST /api/schedules - Create new schedule
// ============================================
router.post(
  '/',
  authorize(['admin', 'doctor']),
  requireProviderIdentity('doctor'),
  validate(scheduleCreateSchema),
  requireCreateOwnership,
  async (req, res) => {
  try {
    const {
      doctor_id,
      schedule_type = 'regular',
      day_of_week,
      specific_date,
      start_time,
      end_time,
      slot_duration_minutes = 30,
      max_appointments_per_slot = 1,
      clinic_id,
      location_id,
      is_available = true,
      notes,
      unavailable_reason,
      effective_from,
      effective_until
    } = req.validatedData;

    const query = `
      INSERT INTO doctor_schedules (
        doctor_id, schedule_type, day_of_week, specific_date,
        start_time, end_time, slot_duration_minutes, max_appointments_per_slot,
        clinic_id, location_id, is_available, notes, unavailable_reason,
        effective_from, effective_until, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING *
    `;

    const values = [
      doctor_id,
      schedule_type,
      day_of_week ?? null,
      specific_date || null,
      start_time,
      end_time,
      slot_duration_minutes,
      max_appointments_per_slot,
      clinic_id || null,
      location_id || null,
      is_available,
      notes || null,
      unavailable_reason || null,
      effective_from || null,
      effective_until || null,
      req.user?.staffId || null
    ];

    const result = await getDB().query(query, values);

    logger.info(`Doctor schedule created`, {
      scheduleId: result.rows[0].id,
      doctorId: doctor_id,
      createdBy: req.user?.id
    });

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Error creating schedule:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// PUT /api/schedules/:id - Update schedule
// ============================================
router.put(
  '/:id',
  authorize(['admin', 'doctor']),
  requireProviderIdentity('doctor'),
  validateParams(scheduleParamsSchema),
  validate(scheduleUpdateSchema),
  requireScheduleOwner,
  async (req, res) => {
  try {
    const { id } = req.validatedParams;
    const {
      start_time,
      end_time,
      slot_duration_minutes,
      max_appointments_per_slot,
      is_available,
      is_active,
      notes,
      unavailable_reason
    } = req.validatedData;

    // Check if schedule exists
    const checkQuery = 'SELECT * FROM doctor_schedules WHERE id = $1';
    const checkResult = await getDB().query(checkQuery, [id]);

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Schedule not found' });
    }

    // Build update query dynamically
    const updates = [];
    const values = [id];
    let paramCount = 2;

    if (start_time !== undefined) {
      updates.push(`start_time = $${paramCount++}`);
      values.push(start_time);
    }
    if (end_time !== undefined) {
      updates.push(`end_time = $${paramCount++}`);
      values.push(end_time);
    }
    if (slot_duration_minutes !== undefined) {
      updates.push(`slot_duration_minutes = $${paramCount++}`);
      values.push(slot_duration_minutes);
    }
    if (max_appointments_per_slot !== undefined) {
      updates.push(`max_appointments_per_slot = $${paramCount++}`);
      values.push(max_appointments_per_slot);
    }
    if (is_available !== undefined) {
      updates.push(`is_available = $${paramCount++}`);
      values.push(is_available);
    }
    if (is_active !== undefined) {
      updates.push(`is_active = $${paramCount++}`);
      values.push(is_active);
    }
    if (notes !== undefined) {
      updates.push(`notes = $${paramCount++}`);
      values.push(notes);
    }
    if (unavailable_reason !== undefined) {
      updates.push(`unavailable_reason = $${paramCount++}`);
      values.push(unavailable_reason);
    }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, error: 'No fields to update' });
    }

    const query = `
      UPDATE doctor_schedules
      SET ${updates.join(', ')}
      WHERE id = $1
      RETURNING *
    `;

    const result = await getDB().query(query, values);

    logger.info(`Doctor schedule updated`, {
      scheduleId: id,
      updatedBy: req.user?.id
    });

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Error updating schedule:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// DELETE /api/schedules/:id - Delete schedule
// ============================================
router.delete(
  '/:id',
  authorize(['admin', 'doctor']),
  requireProviderIdentity('doctor'),
  validateParams(scheduleParamsSchema),
  requireScheduleOwner,
  async (req, res) => {
  try {
    const { id } = req.validatedParams;
    const reason = String(req.get('X-Archive-Reason') || '').trim();
    if (reason.length < 10 || reason.length > 500) {
      return res.status(400).json({ success: false, error: 'An archive reason between 10 and 500 characters is required' });
    }

    const query = `
      UPDATE doctor_schedules
      SET is_active = false, is_available = false, unavailable_reason = $2
      WHERE id = $1
      RETURNING *
    `;
    const result = await getDB().query(query, [id, reason]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Schedule not found' });
    }

    logger.info(`Doctor schedule archived`, {
      scheduleId: id,
      deletedBy: req.user?.id
    });

    res.json({ success: true, message: 'Schedule archived successfully' });
  } catch (error) {
    logger.error('Error deleting schedule:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;

