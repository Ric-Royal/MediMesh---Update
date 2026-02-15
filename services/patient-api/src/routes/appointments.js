const express = require('express');
const router = express.Router();
const { getDB } = require('../utils/database');
const { logger } = require('../utils/logger');
const { authorize } = require('../middleware/auth');

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
router.get('/', authorize(['doctor', 'nurse', 'admin', 'receptionist']), async (req, res) => {
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
    } = req.query;

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

    const countResult = await getDB().query(countQuery, countValues);
    const total = parseInt(countResult.rows[0].count);

    res.json({
      success: true,
      data: result.rows,
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
router.get('/:id', authorize(['doctor', 'nurse', 'admin', 'receptionist']), async (req, res) => {
  try {
    const { id } = req.params;

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

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Error fetching appointment:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// POST /api/appointments - Create new appointment
// ============================================
router.post('/', authorize(['doctor', 'nurse', 'admin', 'receptionist']), async (req, res) => {
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
    } = req.body;

    // Validate required fields
    if (!patient_id || !scheduled_date || !scheduled_time || !appointment_type) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: patient_id, scheduled_date, scheduled_time, appointment_type'
      });
    }

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
router.put('/:id', authorize(['doctor', 'nurse', 'admin', 'receptionist']), async (req, res) => {
  try {
    const { id } = req.params;
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
    } = req.body;

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
router.post('/:id/check-in', authorize(['nurse', 'admin', 'receptionist']), async (req, res) => {
  try {
    const { id } = req.params;
    const staffId = await resolveStaffId(req.user?.id);

    const query = `
      UPDATE appointments
      SET 
        status = 'checked-in',
        checked_in_at = NOW(),
        checked_in_by = $2
      WHERE id = $1
      RETURNING *
    `;

    const result = await getDB().query(query, [id, staffId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Appointment not found' });
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
router.post('/:id/confirm', authorize(['nurse', 'admin', 'receptionist']), async (req, res) => {
  try {
    const { id } = req.params;
    const staffId = await resolveStaffId(req.user?.id);

    const query = `
      UPDATE appointments
      SET 
        status = 'confirmed',
        confirmed_at = NOW(),
        confirmed_by = $2
      WHERE id = $1
      RETURNING *
    `;

    const result = await getDB().query(query, [id, staffId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Appointment not found' });
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
router.post('/:id/cancel', authorize(['doctor', 'nurse', 'admin', 'receptionist']), async (req, res) => {
  try {
    const { id } = req.params;
    const { cancellation_reason } = req.body;

    const query = `
      UPDATE appointments
      SET 
        status = 'cancelled',
        cancellation_reason = $2,
        updated_by = $3
      WHERE id = $1
      RETURNING *
    `;

    const staffId = await resolveStaffId(req.user?.id);
    const result = await getDB().query(query, [id, cancellation_reason, staffId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Appointment not found' });
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
router.get('/doctor/:doctor_id/available-slots', authorize(['doctor', 'nurse', 'admin', 'receptionist']), async (req, res) => {
  try {
    const { doctor_id } = req.params;
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({ success: false, error: 'Date parameter is required' });
    }

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

