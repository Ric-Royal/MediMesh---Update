const { getDB } = require('../utils/database');
const { logger } = require('../utils/logger');
const { cache } = require('../utils/redis');

class UserSettings {
  constructor(data) {
    this.user_id = data.user_id;
    this.profile = data.profile || {};
    this.preferences = data.preferences || {};
    this.notifications = data.notifications || {};
    this.medical_defaults = data.medical_defaults || {};
    this.working_hours = data.working_hours || {};
    this.created_at = data.created_at;
    this.updated_at = data.updated_at;
  }

  // Get default settings structure
  static getDefaultSettings() {
    return {
      profile: {
        displayName: '',
        email: '',
        phone: '',
        department: '',
        specialization: ''
      },
      preferences: {
        language: 'en',
        timezone: 'UTC',
        theme: 'light',
        dateFormat: 'YYYY-MM-DD',
        timeFormat: '24h'
      },
      notifications: {
        emailNotifications: true,
        smsNotifications: false,
        pushNotifications: true,
        emergencyAlerts: true,
        appointmentReminders: true,
        systemUpdates: false
      },
      medical_defaults: {
        defaultRecordType: 'consultation',
        autoSaveDrafts: true,
        requireDiagnosis: false,
        enableTemplates: true,
        showICD10Codes: false,
        drugInteractionAlerts: true,
        allergyWarnings: true,
        vitalSignsUnits: 'metric',
        defaultExamDuration: '30'
      },
      working_hours: {
        start: '08:00',
        end: '17:00',
        workDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
        timezone: 'UTC'
      }
    };
  }

  // Create user settings table
  static async createTable() {
    const query = `
      CREATE TABLE IF NOT EXISTS user_settings (
        user_id UUID PRIMARY KEY,
        profile JSONB DEFAULT '{}',
        preferences JSONB DEFAULT '{}',
        notifications JSONB DEFAULT '{}',
        medical_defaults JSONB DEFAULT '{}',
        working_hours JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      -- Create indexes for performance
      CREATE INDEX IF NOT EXISTS idx_user_settings_updated ON user_settings(updated_at DESC);
    `;

    try {
      const db = getDB();
      await db.query(query);
      logger.info('User settings table created/verified');
    } catch (error) {
      logger.error('Error creating user settings table:', error);
      throw error;
    }
  }

  // Get user settings by user ID
  static async findByUserId(userId) {
    try {
      // Try cache first
      const cacheKey = `user_settings:${userId}`;
      let settings = await cache.get(cacheKey);
      
      if (settings) {
        logger.info('User settings found in cache', { userId });
        return new UserSettings(settings);
      }

      const db = getDB();
      const result = await db.query('SELECT * FROM user_settings WHERE user_id = $1', [userId]);
      
      if (result.rows.length === 0) {
        // Create default settings for new user
        const defaultSettings = this.getDefaultSettings();
        const newSettings = await this.create(userId, defaultSettings);
        return newSettings;
      }

      settings = new UserSettings(result.rows[0]);
      
      // Cache for 1 hour
      await cache.set(cacheKey, result.rows[0], 3600);
      
      return settings;
    } catch (error) {
      logger.error('Error finding user settings:', error);
      throw error;
    }
  }

  // Create new user settings
  static async create(userId, settingsData) {
    try {
      const defaults = this.getDefaultSettings();
      const mergedSettings = {
        profile: { ...defaults.profile, ...settingsData.profile },
        preferences: { ...defaults.preferences, ...settingsData.preferences },
        notifications: { ...defaults.notifications, ...settingsData.notifications },
        medical_defaults: { ...defaults.medical_defaults, ...settingsData.medical_defaults },
        working_hours: { ...defaults.working_hours, ...settingsData.working_hours }
      };

      const db = getDB();
      const query = `
        INSERT INTO user_settings (
          user_id, profile, preferences, notifications, medical_defaults, working_hours
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `;

      const result = await db.query(query, [
        userId,
        JSON.stringify(mergedSettings.profile),
        JSON.stringify(mergedSettings.preferences),
        JSON.stringify(mergedSettings.notifications),
        JSON.stringify(mergedSettings.medical_defaults),
        JSON.stringify(mergedSettings.working_hours)
      ]);

      const settings = new UserSettings(result.rows[0]);
      
      // Cache the new settings
      const cacheKey = `user_settings:${userId}`;
      await cache.set(cacheKey, result.rows[0], 3600);
      
      logger.info('User settings created', { userId });
      return settings;
    } catch (error) {
      logger.error('Error creating user settings:', error);
      throw error;
    }
  }

  // Update user settings (with UPSERT logic)
  static async update(userId, settingsData) {
    try {
      const db = getDB();
      
      // First, try to get existing settings to merge with
      let existing;
      try {
        existing = await this.findByUserId(userId);
      } catch (err) {
        // If not found, use defaults
        existing = this.getDefaultSettings();
      }
      
      // Merge with existing settings
      const merged = {
        profile: { ...existing.profile, ...(settingsData.profile || {}) },
        preferences: { ...existing.preferences, ...(settingsData.preferences || {}) },
        notifications: { ...existing.notifications, ...(settingsData.notifications || {}) },
        medical_defaults: { ...existing.medical_defaults, ...(settingsData.medical_defaults || {}) },
        working_hours: { ...existing.working_hours, ...(settingsData.working_hours || {}) }
      };

      // Use UPSERT query (INSERT ... ON CONFLICT UPDATE)
      const query = `
        INSERT INTO user_settings (
          user_id, profile, preferences, notifications, medical_defaults, working_hours, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
        ON CONFLICT (user_id) 
        DO UPDATE SET 
          profile = EXCLUDED.profile,
          preferences = EXCLUDED.preferences,
          notifications = EXCLUDED.notifications,
          medical_defaults = EXCLUDED.medical_defaults,
          working_hours = EXCLUDED.working_hours,
          updated_at = NOW()
        RETURNING *
      `;

      const values = [
        userId,
        JSON.stringify(merged.profile),
        JSON.stringify(merged.preferences),
        JSON.stringify(merged.notifications),
        JSON.stringify(merged.medical_defaults),
        JSON.stringify(merged.working_hours)
      ];

      const result = await db.query(query, values);
      const settings = new UserSettings(result.rows[0]);
      
      // Update cache
      const cacheKey = `user_settings:${userId}`;
      await cache.set(cacheKey, result.rows[0], 3600);
      
      logger.info('User settings updated/created', { userId });
      return settings;
    } catch (error) {
      logger.error('Error updating user settings:', error);
      throw error;
    }
  }

  // Reset user settings to defaults
  static async resetToDefaults(userId) {
    try {
      const defaults = this.getDefaultSettings();
      return await this.update(userId, defaults);
    } catch (error) {
      logger.error('Error resetting user settings:', error);
      throw error;
    }
  }

  // Get setting by specific path (e.g., 'preferences.theme')
  getSetting(path) {
    const parts = path.split('.');
    let value = this;
    
    for (const part of parts) {
      if (value && typeof value === 'object' && part in value) {
        value = value[part];
      } else {
        return null;
      }
    }
    
    return value;
  }

  // Convert to JSON for API responses
  toJSON() {
    return {
      user_id: this.user_id,
      profile: this.profile,
      preferences: this.preferences,
      notifications: this.notifications,
      medical_defaults: this.medical_defaults,
      working_hours: this.working_hours,
      created_at: this.created_at,
      updated_at: this.updated_at
    };
  }
}

module.exports = UserSettings; 