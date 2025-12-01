const { v4: uuidv4 } = require('uuid');
const { getDB } = require('../utils/database');

class QueueEntry {
  static async create(queueData) {
    const id = uuidv4();
    const query = `
      INSERT INTO queue_entries (
        id, encounter_id, patient_id, clinic_id, doctor_id,
        queue_type, is_emergency, waiting_location, priority_level
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;
    
    const values = [
      id,
      queueData.encounterId,
      queueData.patientId,
      queueData.clinicId,
      queueData.doctorId,
      queueData.queueType || 'consultation',
      queueData.isEmergency || false,
      queueData.waitingLocation || 'reception',
      queueData.priorityLevel || 5
    ];
    
    const result = await getDB().query(query, values);
    return result.rows[0];
  }
  
  static async getAll({ queueType, status } = {}) {
    let query = `
      SELECT q.*,
             p.first_name, p.last_name, p.uhid,
             e.triage_level, e.payment_type, e.chief_complaint,
             s.first_name as doctor_first_name, s.last_name as doctor_last_name,
             c.clinic_name,
             CONCAT(p.first_name, ' ', p.last_name) as patient_name,
             EXTRACT(EPOCH FROM (NOW() - q.joined_at)) / 60 as waiting_minutes
      FROM queue_entries q
      LEFT JOIN patients p ON q.patient_id = p.id
      LEFT JOIN encounters e ON q.encounter_id = e.id
      LEFT JOIN staff s ON q.doctor_id = s.id
      LEFT JOIN clinics c ON q.clinic_id = c.id
      WHERE 1=1
    `;
    
    const values = [];
    let paramCount = 1;
    
    if (queueType) {
      query += ` AND q.queue_type = $${paramCount++}`;
      values.push(queueType);
    }
    
    if (status) {
      query += ` AND q.status = $${paramCount++}`;
      values.push(status);
    } else {
      // Default to active statuses
      query += ` AND q.status IN ('waiting', 'called', 'in-service')`;
    }
    
    query += ` ORDER BY q.priority_level ASC, q.queue_position ASC, q.joined_at ASC`;
    
    const result = await getDB().query(query, values);
    return result.rows;
  }
  
  static async findByPk(id) {
    const query = `
      SELECT q.*,
             p.first_name, p.last_name, p.uhid,
             e.triage_level, e.payment_type, e.chief_complaint,
             s.first_name as doctor_first_name, s.last_name as doctor_last_name,
             c.clinic_name,
             CONCAT(p.first_name, ' ', p.last_name) as patient_name,
             EXTRACT(EPOCH FROM (NOW() - q.joined_at)) / 60 as waiting_minutes
      FROM queue_entries q
      LEFT JOIN patients p ON q.patient_id = p.id
      LEFT JOIN encounters e ON q.encounter_id = e.id
      LEFT JOIN staff s ON q.doctor_id = s.id
      LEFT JOIN clinics c ON q.clinic_id = c.id
      WHERE q.id = $1
    `;
    const result = await getDB().query(query, [id]);
    return result.rows[0];
  }
  
  static async getClinicQueue(clinicId, queueType = 'consultation') {
    const query = `
      SELECT q.*,
             p.first_name, p.last_name, p.uhid,
             e.triage_level, e.payment_type, e.chief_complaint,
             s.first_name as doctor_first_name, s.last_name as doctor_last_name,
             c.clinic_name,
             CONCAT(p.first_name, ' ', p.last_name) as patient_name,
             EXTRACT(EPOCH FROM (NOW() - q.joined_at)) / 60 as waiting_minutes
      FROM queue_entries q
      LEFT JOIN patients p ON q.patient_id = p.id
      LEFT JOIN encounters e ON q.encounter_id = e.id
      LEFT JOIN staff s ON q.doctor_id = s.id
      LEFT JOIN clinics c ON q.clinic_id = c.id
      WHERE q.clinic_id = $1 
        AND q.queue_type = $2
        AND q.status IN ('waiting', 'called', 'in-service')
      ORDER BY q.priority_level ASC, q.queue_position ASC
    `;
    const result = await getDB().query(query, [clinicId, queueType]);
    return result.rows;
  }
  
  static async getDoctorQueue(doctorId) {
    const query = `
      SELECT q.*,
             p.first_name, p.last_name, p.uhid,
             e.triage_level, e.payment_type, e.chief_complaint,
             s.first_name as doctor_first_name, s.last_name as doctor_last_name,
             c.clinic_name,
             CONCAT(p.first_name, ' ', p.last_name) as patient_name,
             EXTRACT(EPOCH FROM (NOW() - q.joined_at)) / 60 as waiting_minutes
      FROM queue_entries q
      LEFT JOIN patients p ON q.patient_id = p.id
      LEFT JOIN encounters e ON q.encounter_id = e.id
      LEFT JOIN staff s ON q.doctor_id = s.id
      LEFT JOIN clinics c ON q.clinic_id = c.id
      WHERE q.doctor_id = $1 
        AND q.status IN ('waiting', 'called', 'in-service')
      ORDER BY q.priority_level ASC, q.queue_position ASC
    `;
    const result = await getDB().query(query, [doctorId]);
    return result.rows;
  }
  
  static async getQueueStatistics(clinicId) {
    const query = `
      SELECT 
        COUNT(*) as total_in_queue,
        COUNT(*) FILTER (WHERE is_emergency = true) as emergencies,
        FLOOR(AVG(EXTRACT(EPOCH FROM (NOW() - joined_at)) / 60))::int as average_wait_minutes,
        MAX(EXTRACT(EPOCH FROM (NOW() - joined_at)) / 60)::int as longest_wait_minutes
      FROM queue_entries
      WHERE clinic_id = $1 
        AND status IN ('waiting', 'called')
    `;
    const result = await getDB().query(query, [clinicId]);
    return result.rows[0];
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
      UPDATE queue_entries 
      SET ${fields.join(', ')}, updated_at = NOW()
      WHERE id = $${paramCount}
      RETURNING *
    `;
    
    const result = await getDB().query(query, values);
    return result.rows[0];
  }
}

module.exports = QueueEntry;

