const { getDB } = require('../utils/database');
const { v4: uuidv4 } = require('uuid');
const { logger } = require('../utils/logger');
const { cache } = require('../utils/redis');

class MedicalRecord {
  constructor(data) {
    this.id = data.id;
    this.patient_id = data.patient_id;
    this.record_type = data.record_type;
    this.record_date = data.record_date;
    this.provider_name = data.provider_name;
    this.diagnosis = data.diagnosis;
    this.treatment_plan = data.treatment_plan;
    this.medications = data.medications;
    this.lab_results = data.lab_results;
    this.notes = data.notes;
    this.vital_signs = data.vital_signs;
    this.follow_up_date = data.follow_up_date;
    this.created_at = data.created_at;
    this.created_by = data.created_by;
  }

  static async findByPatientId(patientId, limit = 50, offset = 0) {
    try {
      const db = getDB();
      const query = `
        SELECT mr.*, p.first_name, p.last_name, p.patient_id as patient_number
        FROM medical_records mr
        JOIN patients p ON mr.patient_id = p.id
        WHERE mr.patient_id = $1
        ORDER BY mr.record_date DESC, mr.created_at DESC
        LIMIT $2 OFFSET $3
      `;

      const result = await db.query(query, [patientId, limit, offset]);
      return result.rows.map(row => {
        const record = new MedicalRecord(row);
        record.patient_info = {
          first_name: row.first_name,
          last_name: row.last_name,
          patient_number: row.patient_number
        };
        return record;
      });
    } catch (error) {
      logger.error('Error finding medical records by patient ID:', error);
      throw error;
    }
  }

  static async findById(id) {
    try {
      const cacheKey = `medical_record:${id}`;
      let record = await cache.get(cacheKey);
      
      if (record) {
        logger.info('Medical record found in cache', { recordId: id });
        return new MedicalRecord(record);
      }

      const db = getDB();
      const query = `
        SELECT mr.*, p.first_name, p.last_name, p.patient_id as patient_number
        FROM medical_records mr
        JOIN patients p ON mr.patient_id = p.id
        WHERE mr.id = $1
      `;

      const result = await db.query(query, [id]);
      
      if (result.rows.length === 0) {
        return null;
      }

      const recordData = result.rows[0];
      record = new MedicalRecord(recordData);
      record.patient_info = {
        first_name: recordData.first_name,
        last_name: recordData.last_name,
        patient_number: recordData.patient_number
      };
      
      // Cache for 30 minutes
      await cache.set(cacheKey, recordData, 1800);
      
      return record;
    } catch (error) {
      logger.error('Error finding medical record by ID:', error);
      throw error;
    }
  }

  static async findAll(limit = 50, offset = 0, filters = {}) {
    try {
      const db = getDB();
      let query = `
        SELECT mr.*, p.first_name, p.last_name, p.patient_id as patient_number
        FROM medical_records mr
        JOIN patients p ON mr.patient_id = p.id
        WHERE 1=1
      `;
      const params = [];

      // Add filters
      if (filters.recordType) {
        query += ` AND mr.record_type = $${params.length + 1}`;
        params.push(filters.recordType);
      }

      if (filters.providerName) {
        query += ` AND mr.provider_name ILIKE $${params.length + 1}`;
        params.push(`%${filters.providerName}%`);
      }

      if (filters.dateFrom) {
        query += ` AND mr.record_date >= $${params.length + 1}`;
        params.push(filters.dateFrom);
      }

      if (filters.dateTo) {
        query += ` AND mr.record_date <= $${params.length + 1}`;
        params.push(filters.dateTo);
      }

      if (filters.search) {
        query += ` AND (
          p.first_name ILIKE $${params.length + 1} OR 
          p.last_name ILIKE $${params.length + 1} OR 
          p.patient_id ILIKE $${params.length + 1} OR
          mr.notes ILIKE $${params.length + 1}
        )`;
        params.push(`%${filters.search}%`);
      }

      query += ` ORDER BY mr.record_date DESC, mr.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(limit, offset);

      const result = await db.query(query, params);
      return result.rows.map(row => {
        const record = new MedicalRecord(row);
        record.patient_info = {
          first_name: row.first_name,
          last_name: row.last_name,
          patient_number: row.patient_number
        };
        return record;
      });
    } catch (error) {
      logger.error('Error finding medical records:', error);
      throw error;
    }
  }

  static async create(data, createdBy) {
    try {
      const db = getDB();
      const id = uuidv4();

      const query = `
        INSERT INTO medical_records (
          id, patient_id, record_type, record_date, provider_name,
          diagnosis, treatment_plan, medications, lab_results, notes, 
          vital_signs, follow_up_date, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING *
      `;

      const values = [
        id,
        data.patient_id,
        data.record_type,
        data.record_date,
        data.provider_name,
        data.diagnosis || null,
        data.treatment_plan || null,
        data.medications || null,
        data.lab_results || null,
        data.notes || null,
        data.vital_signs || null,
        data.follow_up_date || null,
        createdBy
      ];

      const result = await db.query(query, values);
      
      const record = new MedicalRecord(result.rows[0]);
      
      logger.info('Medical record created', { 
        recordId: record.id, 
        patientId: record.patient_id,
        recordType: record.record_type,
        createdBy 
      });
      
      return record;
    } catch (error) {
      logger.error('Error creating medical record:', error);
      throw error;
    }
  }

  async update(data, updatedBy) {
    try {
      const db = getDB();
      
      const query = `
        UPDATE medical_records 
        SET record_type = $1, record_date = $2, provider_name = $3,
            diagnosis = $4, treatment_plan = $5, medications = $6,
            lab_results = $7, notes = $8, vital_signs = $9, follow_up_date = $10,
            updated_at = NOW(), updated_by = $11
        WHERE id = $12
        RETURNING *
      `;

      const values = [
        data.record_type || this.record_type,
        data.record_date || this.record_date,
        data.provider_name || this.provider_name,
        data.diagnosis || this.diagnosis,
        data.treatment_plan || this.treatment_plan,
        data.medications || this.medications,
        data.lab_results || this.lab_results,
        data.notes || this.notes,
        data.vital_signs || this.vital_signs,
        data.follow_up_date || this.follow_up_date,
        updatedBy,
        this.id
      ];

      const result = await db.query(query, values);
      
      if (result.rows.length === 0) {
        throw new Error('Medical record not found');
      }

      // Update instance properties
      Object.assign(this, result.rows[0]);
      
      // Clear cache
      await cache.del(`medical_record:${this.id}`);
      
      logger.info('Medical record updated', { 
        recordId: this.id,
        updatedBy 
      });
      
      return this;
    } catch (error) {
      logger.error('Error updating medical record:', error);
      throw error;
    }
  }

  async delete() {
    try {
      const db = getDB();
      
      const result = await db.query('DELETE FROM medical_records WHERE id = $1', [this.id]);
      
      if (result.rowCount === 0) {
        throw new Error('Medical record not found');
      }

      // Clear cache
      await cache.del(`medical_record:${this.id}`);
      
      logger.info('Medical record deleted', { recordId: this.id });
      
      return true;
    } catch (error) {
      logger.error('Error deleting medical record:', error);
      throw error;
    }
  }

  static async getStatistics() {
    try {
      const db = getDB();
      const query = `
        SELECT 
          COUNT(*) as total_records,
          COUNT(CASE WHEN created_at >= NOW() - INTERVAL '30 days' THEN 1 END) as new_records_30d,
          COUNT(DISTINCT patient_id) as unique_patients,
          COUNT(DISTINCT record_type) as record_types_count,
          COUNT(CASE WHEN record_date >= NOW() - INTERVAL '7 days' THEN 1 END) as recent_records
        FROM medical_records
      `;
      
      const result = await db.query(query);
      return result.rows[0];
    } catch (error) {
      logger.error('Error getting medical record statistics:', error);
      throw error;
    }
  }

  static async getRecordTypes() {
    try {
      const db = getDB();
      const query = `
        SELECT DISTINCT record_type, COUNT(*) as count
        FROM medical_records 
        GROUP BY record_type 
        ORDER BY count DESC
      `;
      
      const result = await db.query(query);
      return result.rows;
    } catch (error) {
      logger.error('Error getting record types:', error);
      throw error;
    }
  }

  toJSON() {
    return {
      id: this.id,
      patient_id: this.patient_id,
      patient_info: this.patient_info,
      record_type: this.record_type,
      record_date: this.record_date,
      provider_name: this.provider_name,
      diagnosis: this.diagnosis,
      treatment_plan: this.treatment_plan,
      medications: this.medications,
      lab_results: this.lab_results,
      notes: this.notes,
      vital_signs: this.vital_signs,
      follow_up_date: this.follow_up_date,
      created_at: this.created_at,
      created_by: this.created_by
    };
  }
}

module.exports = MedicalRecord; 