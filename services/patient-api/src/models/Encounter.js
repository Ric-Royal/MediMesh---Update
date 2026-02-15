const { v4: uuidv4 } = require('uuid');
const { getDB } = require('../utils/database');

class Encounter {
  static async create(encounterData) {
    const id = uuidv4();
    const query = `
      INSERT INTO encounters (
        id, patient_id, encounter_type, status, triage_level,
        department_id, clinic_id, doctor_id, waiting_location,
        chief_complaint, payment_type, payment_status, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `;
    
    const values = [
      id,
      encounterData.patientId,
      encounterData.encounterType || 'outpatient',
      encounterData.status || 'registered',
      encounterData.triageLevel || 'routine',
      encounterData.departmentId,
      encounterData.clinicId,
      encounterData.doctorId,
      encounterData.waitingLocation || 'reception',
      encounterData.chiefComplaint,
      encounterData.paymentType || 'self-pay',
      encounterData.paymentStatus || 'unpaid',
      encounterData.createdBy
    ];
    
    const result = await getDB().query(query, values);
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
    const result = await pool.query(query, [id]);
    return result.rows[0];
  }
  
  static async getActiveEncounters(clinicId) {
    const query = `
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
    const result = await pool.query(query, [clinicId]);
    return result.rows;
  }
  
  static async getEncountersByDate(date) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
    
    const query = `
      SELECT e.*, 
             p.first_name, p.last_name, p.uhid
      FROM encounters e
      LEFT JOIN patients p ON e.patient_id = p.id
      WHERE e.registration_time BETWEEN $1 AND $2
      ORDER BY e.registration_time ASC
    `;
    const result = await pool.query(query, [startOfDay, endOfDay]);
    return result.rows;
  }
  
  static async update(id, updateData) {
    const fields = [];
    const values = [];
    let paramCount = 1;
    
    Object.keys(updateData).forEach(key => {
      fields.push(`${key} = $${paramCount}`);
      values.push(updateData[key]);
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

