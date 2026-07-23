const express = require('express');
const router = express.Router();
const { getDB } = require('../utils/database');
const { logger } = require('../utils/logger');
const { authorize } = require('../middleware/auth');

// ============================================
// GET /api/schedules - List all doctor schedules
// ============================================
router.get('/', authorize(['doctor', 'nurse', 'admin', 'receptionist']), async (req, res) => {
  try {
    const { doctor_id, clinic_id, day_of_week, is_active, date } = req.query;

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
      values.push(is_active === 'true');
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
router.get('/:id', authorize(['doctor', 'nurse', 'admin', 'receptionist']), async (req, res) => {
  try {
    const { id } = req.params;

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

    const result = await pool.query(query, [id]);

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
router.post('/', authorize(['admin', 'doctor']), async (req, res) => {
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
    } = req.body;

    // Validate required fields
    if (!doctor_id || !start_time || !end_time) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: doctor_id, start_time, end_time'
      });
    }

    // Validate schedule type requirements
    if (schedule_type === 'regular' && day_of_week === undefined) {
      return res.status(400).json({
        success: false,
        error: 'day_of_week is required for regular schedules'
      });
    }

    if (['one-time', 'override', 'leave'].includes(schedule_type) && !specific_date) {
      return res.status(400).json({
        success: false,
        error: 'specific_date is required for one-time, override, and leave schedules'
      });
    }

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
      day_of_week || null,
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
      req.user?.id
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
router.put('/:id', authorize(['admin', 'doctor']), async (req, res) => {
  try {
    const { id } = req.params;
    const {
      start_time,
      end_time,
      slot_duration_minutes,
      max_appointments_per_slot,
      is_available,
      is_active,
      notes,
      unavailable_reason
    } = req.body;

    // Check if schedule exists
    const checkQuery = 'SELECT * FROM doctor_schedules WHERE id = $1';
    const checkResult = await pool.query(checkQuery, [id]);

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
router.delete('/:id', authorize(['admin', 'doctor']), async (req, res) => {
  try {
    const { id } = req.params;

    const query = 'DELETE FROM doctor_schedules WHERE id = $1 RETURNING *';
    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Schedule not found' });
    }

    logger.info(`Doctor schedule deleted`, {
      scheduleId: id,
      deletedBy: req.user?.id
    });

    res.json({ success: true, message: 'Schedule deleted successfully' });
  } catch (error) {
    logger.error('Error deleting schedule:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;

