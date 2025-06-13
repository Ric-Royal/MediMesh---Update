const { getDB } = require('../utils/database');
const { v4: uuidv4 } = require('uuid');
const { logger } = require('../utils/logger');
const { cache } = require('../utils/redis');

class Patient {
  constructor(data) {
    this.id = data.id;
    this.patient_id = data.patient_id;
    this.first_name = data.first_name;
    this.last_name = data.last_name;
    this.date_of_birth = data.date_of_birth;
    this.gender = data.gender;
    this.phone = data.phone;
    this.email = data.email;
    this.address = data.address;
    this.created_at = data.created_at;
    this.updated_at = data.updated_at;
    this.created_by = data.created_by;
    this.updated_by = data.updated_by;
  }

  static async findAll(limit = 50, offset = 0, search = '') {
    try {
      const db = getDB();
      let query = `
        SELECT * FROM patients 
        WHERE 1=1
      `;
      const params = [];
      
      if (search) {
        query += ` AND (
          first_name ILIKE $${params.length + 1} OR 
          last_name ILIKE $${params.length + 1} OR 
          patient_id ILIKE $${params.length + 1} OR 
          email ILIKE $${params.length + 1}
        )`;
        params.push(`%${search}%`);
      }
      
      query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(limit, offset);

      const result = await db.query(query, params);
      return result.rows.map(row => new Patient(row));
    } catch (error) {
      logger.error('Error finding patients:', error);
      throw error;
    }
  }

  static async findById(id) {
    try {
      // Try cache first
      const cacheKey = `patient:${id}`;
      let patient = await cache.get(cacheKey);
      
      if (patient) {
        logger.info('Patient found in cache', { patientId: id });
        return new Patient(patient);
      }

      const db = getDB();
      const result = await db.query('SELECT * FROM patients WHERE id = $1', [id]);
      
      if (result.rows.length === 0) {
        return null;
      }

      patient = new Patient(result.rows[0]);
      
      // Cache for 1 hour
      await cache.set(cacheKey, result.rows[0], 3600);
      
      return patient;
    } catch (error) {
      logger.error('Error finding patient by ID:', error);
      throw error;
    }
  }

  static async findByPatientId(patientId) {
    try {
      const db = getDB();
      const result = await db.query('SELECT * FROM patients WHERE patient_id = $1', [patientId]);
      
      if (result.rows.length === 0) {
        return null;
      }

      return new Patient(result.rows[0]);
    } catch (error) {
      logger.error('Error finding patient by patient_id:', error);
      throw error;
    }
  }

  static async create(data, createdBy) {
    try {
      const db = getDB();
      const id = uuidv4();
      
      // Generate patient ID if not provided
      if (!data.patient_id) {
        const timestamp = Date.now().toString().slice(-6);
        const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
        data.patient_id = `P${timestamp}${random}`;
      }

      const query = `
        INSERT INTO patients (
          id, patient_id, first_name, last_name, date_of_birth, 
          gender, phone, email, address, created_by, updated_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *
      `;

      const values = [
        id,
        data.patient_id,
        data.first_name,
        data.last_name,
        data.date_of_birth,
        data.gender,
        data.phone,
        data.email,
        data.address,
        createdBy,
        createdBy
      ];

      const result = await db.query(query, values);
      
      const patient = new Patient(result.rows[0]);
      
      // Clear cache
      await cache.del(`patient:${id}`);
      
      logger.info('Patient created', { 
        patientId: patient.id, 
        patientNumber: patient.patient_id,
        createdBy 
      });
      
      return patient;
    } catch (error) {
      logger.error('Error creating patient:', error);
      throw error;
    }
  }

  async update(data, updatedBy) {
    try {
      const db = getDB();
      
      const query = `
        UPDATE patients 
        SET first_name = $1, last_name = $2, date_of_birth = $3,
            gender = $4, phone = $5, email = $6, address = $7,
            updated_by = $8, updated_at = NOW()
        WHERE id = $9
        RETURNING *
      `;

      const values = [
        data.first_name || this.first_name,
        data.last_name || this.last_name,
        data.date_of_birth || this.date_of_birth,
        data.gender || this.gender,
        data.phone || this.phone,
        data.email || this.email,
        data.address || this.address,
        updatedBy,
        this.id
      ];

      const result = await db.query(query, values);
      
      if (result.rows.length === 0) {
        throw new Error('Patient not found');
      }

      // Update instance properties
      Object.assign(this, result.rows[0]);
      
      // Clear cache
      await cache.del(`patient:${this.id}`);
      
      logger.info('Patient updated', { 
        patientId: this.id, 
        updatedBy 
      });
      
      return this;
    } catch (error) {
      logger.error('Error updating patient:', error);
      throw error;
    }
  }

  async delete() {
    try {
      const db = getDB();
      
      // Check if patient has medical records
      const recordsResult = await db.query(
        'SELECT COUNT(*) FROM medical_records WHERE patient_id = $1', 
        [this.id]
      );
      
      const recordCount = parseInt(recordsResult.rows[0].count);
      
      if (recordCount > 0) {
        throw new Error('Cannot delete patient with existing medical records');
      }

      const result = await db.query('DELETE FROM patients WHERE id = $1', [this.id]);
      
      if (result.rowCount === 0) {
        throw new Error('Patient not found');
      }

      // Clear cache
      await cache.del(`patient:${this.id}`);
      
      logger.info('Patient deleted', { patientId: this.id });
      
      return true;
    } catch (error) {
      logger.error('Error deleting patient:', error);
      throw error;
    }
  }

  static async getStatistics() {
    try {
      const db = getDB();
      const query = `
        SELECT 
          COUNT(*) as total_patients,
          COUNT(CASE WHEN created_at >= NOW() - INTERVAL '30 days' THEN 1 END) as new_patients_30d,
          COUNT(CASE WHEN gender = 'M' THEN 1 END) as male_count,
          COUNT(CASE WHEN gender = 'F' THEN 1 END) as female_count,
          AVG(EXTRACT(YEAR FROM AGE(date_of_birth))) as avg_age
        FROM patients
      `;
      
      const result = await db.query(query);
      return result.rows[0];
    } catch (error) {
      logger.error('Error getting patient statistics:', error);
      throw error;
    }
  }

  toJSON() {
    return {
      id: this.id,
      patient_id: this.patient_id,
      first_name: this.first_name,
      last_name: this.last_name,
      full_name: `${this.first_name} ${this.last_name}`,
      date_of_birth: this.date_of_birth,
      gender: this.gender,
      phone: this.phone,
      email: this.email,
      address: this.address,
      created_at: this.created_at,
      updated_at: this.updated_at,
      created_by: this.created_by,
      updated_by: this.updated_by
    };
  }
}

module.exports = Patient; 