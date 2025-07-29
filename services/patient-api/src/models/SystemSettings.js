const { getDB } = require('../utils/database');
const { logger } = require('../utils/logger');
const { cache } = require('../utils/redis');

class SystemSettings {
  constructor(data) {
    this.key = data.key;
    this.value = data.value;
    this.category = data.category;
    this.description = data.description;
    this.requires_restart = data.requires_restart || false;
    this.updated_by = data.updated_by;
    this.updated_at = data.updated_at;
  }

  // Get default system settings
  static getDefaultSettings() {
    return [
      {
        key: 'security.session_timeout',
        value: 30,
        category: 'security',
        description: 'Session timeout in minutes',
        requires_restart: false
      },
      {
        key: 'security.password_policy',
        value: 'strong',
        category: 'security',
        description: 'Password complexity requirement (basic|strong|complex)',
        requires_restart: false
      },
      {
        key: 'security.two_factor_auth',
        value: true,
        category: 'security',
        description: 'Require two-factor authentication for all users',
        requires_restart: false
      },
      {
        key: 'security.audit_logging',
        value: true,
        category: 'security',
        description: 'Enable comprehensive audit logging',
        requires_restart: false
      },
      {
        key: 'files.max_file_size',
        value: 52428800, // 50MB in bytes
        category: 'files',
        description: 'Maximum file upload size in bytes',
        requires_restart: false
      },
      {
        key: 'files.allowed_types',
        value: ['pdf', 'jpg', 'jpeg', 'png', 'docx', 'doc', 'dicom', 'txt', 'csv'],
        category: 'files',
        description: 'Allowed file extensions for upload',
        requires_restart: false
      },
      {
        key: 'backup.auto_backup',
        value: true,
        category: 'backup',
        description: 'Enable automatic system backups',
        requires_restart: false
      },
      {
        key: 'backup.frequency',
        value: 'daily',
        category: 'backup',
        description: 'Backup frequency (hourly|daily|weekly)',
        requires_restart: false
      },
      {
        key: 'medical.patient_id_format',
        value: 'auto',
        category: 'medical',
        description: 'Patient ID generation format (auto|sequential|custom)',
        requires_restart: false
      },
      {
        key: 'medical.data_retention_years',
        value: 7,
        category: 'medical',
        description: 'Data retention period in years for compliance',
        requires_restart: false
      },
      {
        key: 'system.maintenance_mode',
        value: false,
        category: 'system',
        description: 'Enable maintenance mode (blocks non-admin access)',
        requires_restart: false
      },
      {
        key: 'notifications.email_enabled',
        value: true,
        category: 'notifications',
        description: 'Enable email notification system',
        requires_restart: true
      },
      {
        key: 'notifications.sms_enabled',
        value: false,
        category: 'notifications',
        description: 'Enable SMS notification system',
        requires_restart: true
      }
    ];
  }

  // Create system settings table
  static async createTable() {
    const query = `
      CREATE TABLE IF NOT EXISTS system_settings (
        key VARCHAR(255) PRIMARY KEY,
        value JSONB NOT NULL,
        category VARCHAR(100) NOT NULL,
        description TEXT,
        requires_restart BOOLEAN DEFAULT FALSE,
        updated_by UUID,
        updated_at TIMESTAMP DEFAULT NOW()
      );

      -- Create setting change audit table
      CREATE TABLE IF NOT EXISTS setting_changes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        setting_type VARCHAR(50) NOT NULL,
        setting_key VARCHAR(255) NOT NULL,
        old_value JSONB,
        new_value JSONB NOT NULL,
        changed_at TIMESTAMP DEFAULT NOW(),
        ip_address INET,
        user_agent TEXT
      );

      -- Create indexes for performance
      CREATE INDEX IF NOT EXISTS idx_system_settings_category ON system_settings(category);
      CREATE INDEX IF NOT EXISTS idx_setting_changes_user ON setting_changes(user_id);
      CREATE INDEX IF NOT EXISTS idx_setting_changes_key ON setting_changes(setting_key);
      CREATE INDEX IF NOT EXISTS idx_setting_changes_date ON setting_changes(changed_at DESC);
    `;

    try {
      const db = getDB();
      await db.query(query);
      logger.info('System settings and audit tables created/verified');
      
      // Initialize default settings if table is empty
      await this.initializeDefaults();
    } catch (error) {
      logger.error('Error creating system settings table:', error);
      throw error;
    }
  }

  // Initialize default system settings
  static async initializeDefaults() {
    try {
      const db = getDB();
      const countResult = await db.query('SELECT COUNT(*) FROM system_settings');
      const count = parseInt(countResult.rows[0].count);

      if (count === 0) {
        logger.info('Initializing default system settings');
        const defaults = this.getDefaultSettings();
        
        for (const setting of defaults) {
          await db.query(
            'INSERT INTO system_settings (key, value, category, description, requires_restart) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (key) DO NOTHING',
            [setting.key, JSON.stringify(setting.value), setting.category, setting.description, setting.requires_restart]
          );
        }
        
        logger.info('Default system settings initialized');
      }
    } catch (error) {
      logger.error('Error initializing default settings:', error);
      throw error;
    }
  }

  // Get all system settings
  static async findAll() {
    try {
      // Try cache first
      const cacheKey = 'system_settings:all';
      let settings = await cache.get(cacheKey);
      
      if (settings) {
        logger.info('System settings found in cache');
        return settings.map(s => new SystemSettings(s));
      }

      const db = getDB();
      const result = await db.query('SELECT * FROM system_settings ORDER BY category, key');
      
      settings = result.rows.map(row => new SystemSettings(row));
      
      // Cache for 30 minutes
      await cache.set(cacheKey, result.rows, 1800);
      
      return settings;
    } catch (error) {
      logger.error('Error finding system settings:', error);
      throw error;
    }
  }

  // Get settings by category
  static async findByCategory(category) {
    try {
      const cacheKey = `system_settings:category:${category}`;
      let settings = await cache.get(cacheKey);
      
      if (settings) {
        return settings.map(s => new SystemSettings(s));
      }

      const db = getDB();
      const result = await db.query('SELECT * FROM system_settings WHERE category = $1 ORDER BY key', [category]);
      
      settings = result.rows.map(row => new SystemSettings(row));
      
      // Cache for 30 minutes
      await cache.set(cacheKey, result.rows, 1800);
      
      return settings;
    } catch (error) {
      logger.error('Error finding system settings by category:', error);
      throw error;
    }
  }

  // Get single setting by key
  static async findByKey(key) {
    try {
      const cacheKey = `system_settings:key:${key}`;
      let setting = await cache.get(cacheKey);
      
      if (setting) {
        return new SystemSettings(setting);
      }

      const db = getDB();
      const result = await db.query('SELECT * FROM system_settings WHERE key = $1', [key]);
      
      if (result.rows.length === 0) {
        return null;
      }

      setting = new SystemSettings(result.rows[0]);
      
      // Cache for 1 hour
      await cache.set(cacheKey, result.rows[0], 3600);
      
      return setting;
    } catch (error) {
      logger.error('Error finding system setting by key:', error);
      throw error;
    }
  }

  // Update system setting
  static async updateSetting(key, newValue, updatedBy, userInfo = {}) {
    try {
      const db = getDB();
      
      // Get current value for audit trail
      const currentSetting = await this.findByKey(key);
      const oldValue = currentSetting ? currentSetting.value : null;

      // Update the setting
      const result = await db.query(
        'UPDATE system_settings SET value = $1, updated_by = $2, updated_at = NOW() WHERE key = $3 RETURNING *',
        [JSON.stringify(newValue), updatedBy, key]
      );

      if (result.rows.length === 0) {
        throw new Error(`System setting '${key}' not found`);
      }

      const updatedSetting = new SystemSettings(result.rows[0]);

      // Log the change in audit table
      await this.logSettingChange({
        user_id: updatedBy,
        setting_type: 'system',
        setting_key: key,
        old_value: oldValue,
        new_value: newValue,
        ip_address: userInfo.ip,
        user_agent: userInfo.userAgent
      });

      // Clear relevant caches
      await cache.del('system_settings:all');
      await cache.del(`system_settings:key:${key}`);
      await cache.del(`system_settings:category:${updatedSetting.category}`);

      logger.info('System setting updated', { key, updatedBy, oldValue, newValue });
      return updatedSetting;
    } catch (error) {
      logger.error('Error updating system setting:', error);
      throw error;
    }
  }

  // Log setting change for audit trail
  static async logSettingChange(changeData) {
    try {
      const db = getDB();
      await db.query(
        'INSERT INTO setting_changes (user_id, setting_type, setting_key, old_value, new_value, ip_address, user_agent) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [
          changeData.user_id,
          changeData.setting_type,
          changeData.setting_key,
          changeData.old_value ? JSON.stringify(changeData.old_value) : null,
          JSON.stringify(changeData.new_value),
          changeData.ip_address,
          changeData.user_agent
        ]
      );
    } catch (error) {
      logger.error('Error logging setting change:', error);
      // Don't throw here as this is audit logging
    }
  }

  // Get setting change audit trail
  static async getAuditTrail(filters = {}) {
    try {
      const db = getDB();
      let query = 'SELECT * FROM setting_changes WHERE 1=1';
      const values = [];
      let paramCount = 0;

      if (filters.userId) {
        query += ` AND user_id = $${++paramCount}`;
        values.push(filters.userId);
      }

      if (filters.settingKey) {
        query += ` AND setting_key = $${++paramCount}`;
        values.push(filters.settingKey);
      }

      if (filters.dateFrom) {
        query += ` AND changed_at >= $${++paramCount}`;
        values.push(filters.dateFrom);
      }

      if (filters.dateTo) {
        query += ` AND changed_at <= $${++paramCount}`;
        values.push(filters.dateTo);
      }

      query += ` ORDER BY changed_at DESC LIMIT ${filters.limit || 100}`;

      const result = await db.query(query, values);
      return result.rows;
    } catch (error) {
      logger.error('Error getting setting audit trail:', error);
      throw error;
    }
  }

  // Get settings that require restart when changed
  static async getRestartRequiredSettings() {
    try {
      const db = getDB();
      const result = await db.query('SELECT key, value FROM system_settings WHERE requires_restart = true');
      return result.rows;
    } catch (error) {
      logger.error('Error getting restart-required settings:', error);
      throw error;
    }
  }

  // Convert to JSON for API responses
  toJSON() {
    return {
      key: this.key,
      value: this.value,
      category: this.category,
      description: this.description,
      requires_restart: this.requires_restart,
      updated_by: this.updated_by,
      updated_at: this.updated_at
    };
  }
}

module.exports = SystemSettings; 