const { v4: uuidv4 } = require('uuid');
const { getDB } = require('../utils/database');
const { patientScope } = require('../security/accessControl');

const UPDATEABLE_FIELDS = new Set([
  'status',
  'triage_level',
  'department_id',
  'clinic_id',
  'doctor_id',
  'waiting_location',
  'current_location_id',
  'triage_time',
  'consultation_start_time',
  'consultation_end_time',
  'total_waiting_minutes',
  'chief_complaint',
  'presenting_symptoms',
  'vital_signs',
  'payment_status',
  'payment_type',
  'corporate_scheme',
  'referred_from',
  'notes'
]);

class Encounter {
  static async create(encounterData, executor = getDB()) {
    const id = uuidv4();
    const query = `
      INSERT INTO encounters (
        id, patient_id, appointment_id, encounter_type, status, triage_level,
        department_id, clinic_id, doctor_id, waiting_location,
        chief_complaint, payment_type, payment_status, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *
    `;
    
    const values = [
      id,
      encounterData.patientId || encounterData.patient_id,
      encounterData.appointmentId || encounterData.appointment_id || null,
      encounterData.encounterType || encounterData.encounter_type || encounterData.visit_type || 'outpatient',
      encounterData.status || 'registered',
      encounterData.triageLevel || encounterData.triage_level || 'routine',
      encounterData.departmentId || encounterData.department_id || null,
      encounterData.clinicId || encounterData.clinic_id || null,
      encounterData.doctorId || encounterData.doctor_id || null,
      encounterData.waitingLocation || encounterData.waiting_location || 'reception',
      encounterData.chiefComplaint || encounterData.chief_complaint || null,
      encounterData.paymentType || encounterData.payment_type || 'self-pay',
      encounterData.paymentStatus || encounterData.payment_status || 'unpaid',
      encounterData.createdBy || encounterData.created_by || null
    ];
    
    const result = await executor.query(query, values);
    return result.rows[0];
  }
  
  static async findByPk(id) {
    const query = `
      SELECT e.*, 
             p.first_name, p.last_name, p.uhid,
             s.first_name as doctor_first_name, s.last_name as doctor_last_name
      FROM encounters e
      LEFT JOIN patients p ON e.patient_id = p.id
      LEFT JOIN staff s ON e.doctor_id = s.id
      WHERE e.id = $1
    `;
    const result = await getDB().query(query, [id]);
    return result.rows[0];
  }
  
  static async getActiveEncounters(clinicId, user = null) {
    let query = `
      SELECT e.*, 
             p.first_name, p.last_name, p.uhid,
             s.first_name as doctor_first_name, s.last_name as doctor_last_name
      FROM encounters e
      LEFT JOIN patients p ON e.patient_id = p.id
      LEFT JOIN staff s ON e.doctor_id = s.id
      WHERE e.clinic_id = $1 
        AND e.status IN ('waiting', 'in-consultation')
      ORDER BY e.registration_time ASC
    `;
    const params = [clinicId];
    if (user) {
      const scope = patientScope(user, {
        alias: 'p',
        access: 'demographics',
        parameterOffset: params.length
      });
      query = query.replace(
        'ORDER BY e.registration_time ASC',
        `AND (${scope.clause}) ORDER BY e.registration_time ASC`
      );
      params.push(...scope.params);
    }
    const result = await getDB().query(query, params);
    return result.rows;
  }
  
  static async getEncountersByDate(date, user = null) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
    
    let query = `
      SELECT e.*, 
             p.first_name, p.last_name, p.uhid
      FROM encounters e
      LEFT JOIN patients p ON e.patient_id = p.id
      WHERE e.registration_time BETWEEN $1 AND $2
      ORDER BY e.registration_time ASC
    `;
    const params = [startOfDay, endOfDay];
    if (user) {
      const scope = patientScope(user, {
        alias: 'p',
        access: 'demographics',
        parameterOffset: params.length
      });
      query = query.replace(
        'ORDER BY e.registration_time ASC',
        `AND (${scope.clause}) ORDER BY e.registration_time ASC`
      );
      params.push(...scope.params);
    }
    const result = await getDB().query(query, params);
    return result.rows;
  }
  
  static async update(id, updateData) {
    if (!updateData || typeof updateData !== 'object' || Array.isArray(updateData)) {
      const error = new Error('Encounter update must be an object');
      error.status = 400;
      throw error;
    }

    const entries = Object.entries(updateData).filter(([, value]) => value !== undefined);
    const invalidFields = entries
      .map(([key]) => key)
      .filter(key => !UPDATEABLE_FIELDS.has(key));

    if (invalidFields.length > 0) {
      const error = new Error(`Unsupported encounter fields: ${invalidFields.join(', ')}`);
      error.status = 400;
      throw error;
    }
    if (entries.length === 0) {
      const error = new Error('At least one encounter field is required');
      error.status = 400;
      throw error;
    }

    const fields = [];
    const values = [];
    let paramCount = 1;
    
    entries.forEach(([key, value]) => {
      fields.push(`${key} = $${paramCount}`);
      values.push(value);
      paramCount++;
    });
    
    values.push(id);
    const query = `
      UPDATE encounters 
      SET ${fields.join(', ')}, updated_at = NOW()
      WHERE id = $${paramCount}
      RETURNING *
    `;
    
    const result = await getDB().query(query, values);
    return result.rows[0];
  }
}

module.exports = Encounter;

