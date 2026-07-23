const { v4: uuidv4 } = require('uuid');
const { logger } = require('../utils/logger');
const { getDB } = require('../utils/database');

class FileAttachment {
  constructor(data) {
    this.id = data.id;
    this.file_key = data.file_key || data.storage_key;
    this.bucket_name = data.bucket_name || data.storage_bucket;
    this.original_name = data.original_name || data.file_name;
    this.medical_record_id = data.medical_record_id;
    this.patient_id = data.patient_id;
    this.file_name = data.file_name || data.original_name;
    this.file_type = data.file_type;
    this.file_size = data.file_size;
    this.mime_type = data.mime_type;
    this.storage_path = data.storage_path;
    this.storage_bucket = data.storage_bucket || data.bucket_name;
    this.storage_key = data.storage_key || data.file_key;
    this.category = data.category;
    this.description = data.description;
    this.tags = data.tags;
    this.is_private = data.is_private;
    this.is_active = data.is_active;
    this.uploaded_by = data.uploaded_by;
    this.upload_date = data.upload_date;
    this.created_at = data.created_at;
    this.updated_at = data.updated_at;
  }

  static async create(data) {
    const id = uuidv4();
    const now = new Date();
    const storageKey = data.storage_key || data.file_key;
    const storageBucket = data.storage_bucket || data.bucket_name;
    const originalName = data.original_name || data.file_name;

    const query = `
      INSERT INTO file_attachments (
        id, file_key, bucket_name, original_name,
        medical_record_id, patient_id, file_name, file_type, file_size,
        mime_type, storage_path, storage_bucket, storage_key, category,
        description, tags, is_private, uploaded_by, upload_date,
        upload_url, etag, metadata, created_at, updated_at, created_by
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, $18, $19,
        $20, $21, $22::jsonb, $23, $24, $25
      )
      RETURNING *
    `;

    const values = [
      id,
      storageKey,
      storageBucket,
      originalName,
      data.medical_record_id || null,
      data.patient_id || null,
      originalName,
      data.file_type,
      data.file_size,
      data.mime_type,
      data.storage_path || storageKey,
      storageBucket,
      storageKey,
      data.category,
      data.description || null,
      data.tags || null,
      data.is_private === true,
      data.uploaded_by,
      data.upload_date || now,
      data.upload_url || null,
      data.etag || null,
      JSON.stringify(data.metadata || {}),
      now,
      now,
      String(data.uploaded_by)
    ];

    try {
      const pool = getDB();
      const result = await pool.query(query, values);
      return new FileAttachment(result.rows[0]);
    } catch (error) {
      logger.error('Error creating file attachment:', error);
      throw error;
    }
  }

  static async findById(id) {
    const query = 'SELECT * FROM file_attachments WHERE id = $1 AND is_active = true';
    
    try {
      const pool = getDB();
      const result = await pool.query(query, [id]);
      return result.rows.length > 0 ? new FileAttachment(result.rows[0]) : null;
    } catch (error) {
      logger.error('Error finding file attachment by ID:', error);
      throw error;
    }
  }

  static async findByRecordId(recordId) {
    const query = `
      SELECT * FROM file_attachments 
      WHERE medical_record_id = $1 AND is_active = true 
      ORDER BY upload_date DESC
    `;
    
    try {
      const pool = getDB();
      const result = await pool.query(query, [recordId]);
      return result.rows.map(row => new FileAttachment(row));
    } catch (error) {
      logger.error('Error finding file attachments by record ID:', error);
      throw error;
    }
  }

  static async findByPatientId(patientId) {
    const query = `
      SELECT * FROM file_attachments 
      WHERE patient_id = $1 AND is_active = true 
      ORDER BY upload_date DESC
    `;
    
    try {
      const pool = getDB();
      const result = await pool.query(query, [patientId]);
      return result.rows.map(row => new FileAttachment(row));
    } catch (error) {
      logger.error('Error finding file attachments by patient ID:', error);
      throw error;
    }
  }

  static async findByCategory(category, filters = {}) {
    let query = `
      SELECT * FROM file_attachments 
      WHERE category = $1 AND is_active = true
    `;
    const values = [category];
    let paramIndex = 2;

    if (filters.recordId) {
      query += ` AND medical_record_id = $${paramIndex}`;
      values.push(filters.recordId);
      paramIndex++;
    }

    if (filters.patientId) {
      query += ` AND patient_id = $${paramIndex}`;
      values.push(filters.patientId);
      paramIndex++;
    }

    query += ' ORDER BY upload_date DESC';

    if (filters.limit) {
      query += ` LIMIT $${paramIndex}`;
      values.push(filters.limit);
    }

    try {
      const pool = getDB();
      const result = await pool.query(query, values);
      return result.rows.map(row => new FileAttachment(row));
    } catch (error) {
      logger.error('Error finding file attachments by category:', error);
      throw error;
    }
  }

  async update(data) {
    const now = new Date();
    const fields = [];
    const values = [];
    let paramIndex = 1;

    // Build dynamic update query
    Object.keys(data).forEach(key => {
      if (key !== 'id' && data[key] !== undefined) {
        fields.push(`${key} = $${paramIndex}`);
        values.push(data[key]);
        paramIndex++;
      }
    });

    if (fields.length === 0) {
      return this;
    }

    fields.push(`updated_at = $${paramIndex}`);
    values.push(now);
    values.push(this.id);

    const query = `
      UPDATE file_attachments 
      SET ${fields.join(', ')} 
      WHERE id = $${paramIndex + 1} 
      RETURNING *
    `;

    try {
      const pool = getDB();
      const result = await pool.query(query, values);
      Object.assign(this, result.rows[0]);
      return this;
    } catch (error) {
      logger.error('Error updating file attachment:', error);
      throw error;
    }
  }

  async delete() {
    const query = `
      UPDATE file_attachments 
      SET is_active = false, updated_at = $1 
      WHERE id = $2 
      RETURNING *
    `;

    try {
      const pool = getDB();
      const result = await pool.query(query, [new Date(), this.id]);
      this.is_active = false;
      return result.rows[0];
    } catch (error) {
      logger.error('Error deleting file attachment:', error);
      throw error;
    }
  }

  // Create the file_attachments table if it doesn't exist
  static async createTable() {
    const query = `
      CREATE TABLE IF NOT EXISTS file_attachments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        file_key VARCHAR(500) NOT NULL,
        bucket_name VARCHAR(100) NOT NULL,
        original_name VARCHAR(255) NOT NULL,
        medical_record_id UUID REFERENCES medical_records(id) ON DELETE CASCADE,
        patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
        file_name VARCHAR(255) NOT NULL,
        file_type VARCHAR(100) NOT NULL,
        file_size BIGINT NOT NULL,
        mime_type VARCHAR(100) NOT NULL,
        storage_path TEXT,
        storage_bucket VARCHAR(100),
        storage_key VARCHAR(500),
        category VARCHAR(50) NOT NULL DEFAULT 'medical-records',
        description TEXT,
        tags TEXT,
        is_private BOOLEAN DEFAULT FALSE,
        is_active BOOLEAN DEFAULT TRUE,
        uploaded_by UUID NOT NULL,
        upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        upload_url TEXT,
        etag VARCHAR(100),
        metadata JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        created_by VARCHAR(100),
        updated_by VARCHAR(100)
      );

      ALTER TABLE file_attachments ADD COLUMN IF NOT EXISTS file_key VARCHAR(500);
      ALTER TABLE file_attachments ADD COLUMN IF NOT EXISTS bucket_name VARCHAR(100);
      ALTER TABLE file_attachments ADD COLUMN IF NOT EXISTS original_name VARCHAR(255);
      ALTER TABLE file_attachments ADD COLUMN IF NOT EXISTS upload_url TEXT;
      ALTER TABLE file_attachments ADD COLUMN IF NOT EXISTS etag VARCHAR(100);
      ALTER TABLE file_attachments ADD COLUMN IF NOT EXISTS metadata JSONB;
      ALTER TABLE file_attachments ADD COLUMN IF NOT EXISTS created_by VARCHAR(100);
      ALTER TABLE file_attachments ADD COLUMN IF NOT EXISTS updated_by VARCHAR(100);

      UPDATE file_attachments
      SET file_key = COALESCE(file_key, storage_key),
          bucket_name = COALESCE(bucket_name, storage_bucket),
          original_name = COALESCE(original_name, file_name)
      WHERE file_key IS NULL OR bucket_name IS NULL OR original_name IS NULL;

      -- Create indexes for performance
      CREATE INDEX IF NOT EXISTS idx_file_attachments_record ON file_attachments(medical_record_id);
      CREATE INDEX IF NOT EXISTS idx_file_attachments_patient ON file_attachments(patient_id);
      CREATE INDEX IF NOT EXISTS idx_file_attachments_category ON file_attachments(category);
      CREATE INDEX IF NOT EXISTS idx_file_attachments_active ON file_attachments(is_active);
      CREATE INDEX IF NOT EXISTS idx_file_attachments_upload_date ON file_attachments(upload_date DESC);
    `;

    try {
      const pool = getDB();
      await pool.query(query);
      logger.info('File attachments table created/verified');
    } catch (error) {
      logger.error('Error creating file attachments table:', error);
      throw error;
    }
  }
}

module.exports = FileAttachment;
