const express = require('express');
const Joi = require('joi');
const fs = require('fs').promises;
const path = require('path');

const router = express.Router();
const UserSettings = require('../models/UserSettings');
const SystemSettings = require('../models/SystemSettings');
const { authorize } = require('../middleware/auth');
const { logger, auditLogger } = require('../utils/logger');

// Validation schemas
const userSettingsSchema = Joi.object({
  profile: Joi.object({
    displayName: Joi.string().max(100).optional(),
    email: Joi.string().email().optional(),
    phone: Joi.string().max(20).optional(),
    department: Joi.string().max(100).optional(),
    specialization: Joi.string().max(100).optional()
  }).optional(),
  preferences: Joi.object({
    language: Joi.string().valid('en', 'es', 'fr', 'de').optional(),
    timezone: Joi.string().optional(),
    theme: Joi.string().valid('light', 'dark', 'auto').optional(),
    dateFormat: Joi.string().optional(),
    timeFormat: Joi.string().valid('12h', '24h').optional()
  }).optional(),
  notifications: Joi.object({
    emailNotifications: Joi.boolean().optional(),
    smsNotifications: Joi.boolean().optional(),
    pushNotifications: Joi.boolean().optional(),
    emergencyAlerts: Joi.boolean().optional(),
    appointmentReminders: Joi.boolean().optional(),
    systemUpdates: Joi.boolean().optional()
  }).optional(),
  medical_defaults: Joi.object({
    defaultRecordType: Joi.string().valid('consultation', 'diagnosis', 'treatment', 'lab_result', 'imaging', 'prescription', 'vaccination', 'surgery', 'emergency', 'discharge', 'referral', 'other').optional(),
    autoSaveDrafts: Joi.boolean().optional(),
    requireDiagnosis: Joi.boolean().optional(),
    enableTemplates: Joi.boolean().optional(),
    showICD10Codes: Joi.boolean().optional(),
    drugInteractionAlerts: Joi.boolean().optional(),
    allergyWarnings: Joi.boolean().optional(),
    vitalSignsUnits: Joi.string().valid('metric', 'imperial').optional(),
    defaultExamDuration: Joi.string().optional()
  }).optional(),
  working_hours: Joi.object({
    start: Joi.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).optional(),
    end: Joi.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).optional(),
    workDays: Joi.array().items(Joi.string().valid('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday')).optional(),
    timezone: Joi.string().optional()
  }).optional()
});

const systemSettingUpdateSchema = Joi.object({
  value: Joi.alternatives().try(
    Joi.string(),
    Joi.number(),
    Joi.boolean(),
    Joi.array(),
    Joi.object()
  ).required()
});

const logQuerySchema = Joi.object({
  level: Joi.string().valid('info', 'warn', 'error', 'debug').optional(),
  limit: Joi.number().integer().min(1).max(1000).default(100),
  offset: Joi.number().integer().min(0).default(0),
  search: Joi.string().max(200).optional(),
  startDate: Joi.date().optional(),
  endDate: Joi.date().optional(),
  userId: Joi.string().uuid().optional()
});

// ====================
// USER SETTINGS ROUTES
// ====================

// GET /api/settings/user - Get current user's settings
router.get('/user', 
  authorize(['doctor', 'nurse', 'admin', 'user', 'receptionist', 'lab-tech', 'pharmacist', 'radiologist']),
  async (req, res) => {
    try {
      const settings = await UserSettings.findByUserId(req.user.id);
      
      auditLogger.info('User settings retrieved', {
        userId: req.user.id,
        timestamp: new Date().toISOString(),
        ip: req.ip
      });

      res.json({
        success: true,
        data: settings.toJSON()
      });
    } catch (error) {
      logger.error('Error retrieving user settings:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve user settings',
        message: error.message
      });
    }
  }
);

// PUT /api/settings/user - Update user settings
router.put('/user',
  authorize(['doctor', 'nurse', 'admin', 'user', 'receptionist', 'lab-tech', 'pharmacist', 'radiologist']),
  async (req, res) => {
    try {
      // Validate request body
      const { error, value } = userSettingsSchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.details.map(d => d.message)
        });
      }

      // Get current settings for audit
      const currentSettings = await UserSettings.findByUserId(req.user.id);
      
      // Update settings
      const updatedSettings = await UserSettings.update(req.user.id, value);

      // Log the change for audit
      await SystemSettings.logSettingChange({
        user_id: req.user.id,
        setting_type: 'user',
        setting_key: 'user_settings',
        old_value: currentSettings.toJSON(),
        new_value: value,
        ip_address: req.ip,
        user_agent: req.get('User-Agent')
      });

      auditLogger.info('User settings updated', {
        userId: req.user.id,
        changedFields: Object.keys(value),
        timestamp: new Date().toISOString(),
        ip: req.ip
      });

      res.json({
        success: true,
        data: updatedSettings.toJSON(),
        message: 'Settings updated successfully'
      });
    } catch (error) {
      logger.error('Error updating user settings:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update user settings',
        message: error.message
      });
    }
  }
);

// POST /api/settings/user/reset - Reset user settings to defaults
router.post('/user/reset',
  authorize(['doctor', 'nurse', 'admin', 'user', 'receptionist', 'lab-tech', 'pharmacist', 'radiologist']),
  async (req, res) => {
    try {
      const currentSettings = await UserSettings.findByUserId(req.user.id);
      const resetSettings = await UserSettings.resetToDefaults(req.user.id);

      // Log the reset for audit
      await SystemSettings.logSettingChange({
        user_id: req.user.id,
        setting_type: 'user',
        setting_key: 'user_settings_reset',
        old_value: currentSettings.toJSON(),
        new_value: resetSettings.toJSON(),
        ip_address: req.ip,
        user_agent: req.get('User-Agent')
      });

      auditLogger.info('User settings reset to defaults', {
        userId: req.user.id,
        timestamp: new Date().toISOString(),
        ip: req.ip
      });

      res.json({
        success: true,
        data: resetSettings.toJSON(),
        message: 'Settings reset to defaults successfully'
      });
    } catch (error) {
      logger.error('Error resetting user settings:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to reset user settings',
        message: error.message
      });
    }
  }
);

// GET /api/settings/user/schema - Get settings schema for UI
router.get('/user/schema',
  authorize(['doctor', 'nurse', 'admin', 'user', 'receptionist', 'lab-tech', 'pharmacist', 'radiologist']),
  async (req, res) => {
    try {
      const schema = {
        profile: {
          displayName: { type: 'string', label: 'Display Name', maxLength: 100 },
          email: { type: 'email', label: 'Email Address' },
          phone: { type: 'string', label: 'Phone Number', maxLength: 20 },
          department: { type: 'string', label: 'Department', maxLength: 100 },
          specialization: { type: 'string', label: 'Specialization', maxLength: 100 }
        },
        preferences: {
          language: { type: 'select', label: 'Language', options: ['en', 'es', 'fr', 'de'] },
          timezone: { type: 'string', label: 'Timezone' },
          theme: { type: 'select', label: 'Theme', options: ['light', 'dark', 'auto'] },
          dateFormat: { type: 'string', label: 'Date Format' },
          timeFormat: { type: 'select', label: 'Time Format', options: ['12h', '24h'] }
        },
        notifications: {
          emailNotifications: { type: 'boolean', label: 'Email Notifications' },
          smsNotifications: { type: 'boolean', label: 'SMS Notifications' },
          pushNotifications: { type: 'boolean', label: 'Push Notifications' },
          emergencyAlerts: { type: 'boolean', label: 'Emergency Alerts' },
          appointmentReminders: { type: 'boolean', label: 'Appointment Reminders' },
          systemUpdates: { type: 'boolean', label: 'System Updates' }
        },
        medical_defaults: {
          defaultRecordType: { type: 'select', label: 'Default Record Type', options: ['consultation', 'diagnosis', 'treatment', 'lab_result', 'imaging', 'prescription'] },
          autoSaveDrafts: { type: 'boolean', label: 'Auto-save Drafts' },
          requireDiagnosis: { type: 'boolean', label: 'Require Diagnosis' },
          enableTemplates: { type: 'boolean', label: 'Enable Templates' },
          showICD10Codes: { type: 'boolean', label: 'Show ICD-10 Codes' },
          drugInteractionAlerts: { type: 'boolean', label: 'Drug Interaction Alerts' },
          allergyWarnings: { type: 'boolean', label: 'Allergy Warnings' },
          vitalSignsUnits: { type: 'select', label: 'Vital Signs Units', options: ['metric', 'imperial'] },
          defaultExamDuration: { type: 'string', label: 'Default Exam Duration (minutes)' }
        }
      };

      res.json({
        success: true,
        data: schema
      });
    } catch (error) {
      logger.error('Error retrieving settings schema:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve settings schema'
      });
    }
  }
);

// =====================
// SYSTEM SETTINGS ROUTES (Admin Only)
// =====================

// GET /api/settings/system - Get all system settings
router.get('/system',
  authorize(['admin']),
  async (req, res) => {
    try {
      const settings = await SystemSettings.findAll();
      
      // Group by category for easier UI handling
      const groupedSettings = settings.reduce((acc, setting) => {
        if (!acc[setting.category]) {
          acc[setting.category] = [];
        }
        acc[setting.category].push(setting.toJSON());
        return acc;
      }, {});

      auditLogger.info('System settings retrieved', {
        userId: req.user.id,
        timestamp: new Date().toISOString(),
        ip: req.ip
      });

      res.json({
        success: true,
        data: groupedSettings
      });
    } catch (error) {
      logger.error('Error retrieving system settings:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve system settings',
        message: error.message
      });
    }
  }
);

// PUT /api/settings/system/:key - Update specific system setting
router.put('/system/:key',
  authorize(['admin']),
  async (req, res) => {
    try {
      const { key } = req.params;
      
      // Validate request body
      const { error, value } = systemSettingUpdateSchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.details.map(d => d.message)
        });
      }

      const updatedSetting = await SystemSettings.updateSetting(
        key, 
        value.value, 
        req.user.id,
        {
          ip: req.ip,
          userAgent: req.get('User-Agent')
        }
      );

      auditLogger.info('System setting updated', {
        userId: req.user.id,
        settingKey: key,
        newValue: value.value,
        timestamp: new Date().toISOString(),
        ip: req.ip
      });

      res.json({
        success: true,
        data: updatedSetting.toJSON(),
        message: 'System setting updated successfully'
      });
    } catch (error) {
      logger.error('Error updating system setting:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update system setting',
        message: error.message
      });
    }
  }
);

// GET /api/settings/system/audit - Get setting change audit trail
router.get('/system/audit',
  authorize(['admin']),
  async (req, res) => {
    try {
      const { error, value } = logQuerySchema.validate(req.query);
      if (error) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.details.map(d => d.message)
        });
      }

      const filters = {
        userId: value.userId,
        dateFrom: value.startDate,
        dateTo: value.endDate,
        limit: value.limit
      };

      const auditTrail = await SystemSettings.getAuditTrail(filters);

      res.json({
        success: true,
        data: auditTrail,
        pagination: {
          limit: value.limit,
          offset: value.offset
        }
      });
    } catch (error) {
      logger.error('Error retrieving audit trail:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve audit trail',
        message: error.message
      });
    }
  }
);

// =====================
// LOG MONITORING ROUTES (Admin Only)
// =====================

// GET /api/settings/logs/application - Get application logs
router.get('/logs/application',
  authorize(['admin']),
  async (req, res) => {
    try {
      const { error, value } = logQuerySchema.validate(req.query);
      if (error) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.details.map(d => d.message)
        });
      }

      const logFile = path.join(__dirname, '../../logs/combined.log');
      
      try {
        const logContent = await fs.readFile(logFile, 'utf8');
        let logs = logContent.split('\n')
          .filter(line => line.trim())
          .map(line => {
            try {
              return JSON.parse(line);
            } catch {
              return { message: line, timestamp: new Date().toISOString(), level: 'info' };
            }
          })
          .reverse(); // Most recent first

        // Apply filters
        if (value.level) {
          logs = logs.filter(log => log.level === value.level);
        }

        if (value.search) {
          const searchTerm = value.search.toLowerCase();
          logs = logs.filter(log => 
            JSON.stringify(log).toLowerCase().includes(searchTerm)
          );
        }

        if (value.startDate) {
          logs = logs.filter(log => new Date(log.timestamp) >= new Date(value.startDate));
        }

        if (value.endDate) {
          logs = logs.filter(log => new Date(log.timestamp) <= new Date(value.endDate));
        }

        // Pagination
        const paginatedLogs = logs.slice(value.offset, value.offset + value.limit);

        res.json({
          success: true,
          data: paginatedLogs,
          pagination: {
            limit: value.limit,
            offset: value.offset,
            total: logs.length,
            has_more: value.offset + value.limit < logs.length
          }
        });
      } catch (fileError) {
        res.json({
          success: true,
          data: [],
          message: 'Log file not found or empty',
          pagination: { limit: value.limit, offset: value.offset, total: 0, has_more: false }
        });
      }
    } catch (error) {
      logger.error('Error retrieving application logs:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve application logs',
        message: error.message
      });
    }
  }
);

// GET /api/settings/logs/audit - Get audit logs
router.get('/logs/audit',
  authorize(['admin']),
  async (req, res) => {
    try {
      const { error, value } = logQuerySchema.validate(req.query);
      if (error) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.details.map(d => d.message)
        });
      }

      const logFile = path.join(__dirname, '../../logs/audit.log');
      
      try {
        const logContent = await fs.readFile(logFile, 'utf8');
        let logs = logContent.split('\n')
          .filter(line => line.trim())
          .map(line => {
            try {
              return JSON.parse(line);
            } catch {
              return { message: line, timestamp: new Date().toISOString(), level: 'info' };
            }
          })
          .reverse(); // Most recent first

        // Apply filters (similar to application logs)
        if (value.userId) {
          logs = logs.filter(log => log.userId === value.userId);
        }

        if (value.search) {
          const searchTerm = value.search.toLowerCase();
          logs = logs.filter(log => 
            JSON.stringify(log).toLowerCase().includes(searchTerm)
          );
        }

        if (value.startDate) {
          logs = logs.filter(log => new Date(log.timestamp) >= new Date(value.startDate));
        }

        if (value.endDate) {
          logs = logs.filter(log => new Date(log.timestamp) <= new Date(value.endDate));
        }

        // Pagination
        const paginatedLogs = logs.slice(value.offset, value.offset + value.limit);

        res.json({
          success: true,
          data: paginatedLogs,
          pagination: {
            limit: value.limit,
            offset: value.offset,
            total: logs.length,
            has_more: value.offset + value.limit < logs.length
          }
        });
      } catch (fileError) {
        res.json({
          success: true,
          data: [],
          message: 'Audit log file not found or empty',
          pagination: { limit: value.limit, offset: value.offset, total: 0, has_more: false }
        });
      }
    } catch (error) {
      logger.error('Error retrieving audit logs:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve audit logs',
        message: error.message
      });
    }
  }
);

// GET /api/settings/logs/errors - Get error logs
router.get('/logs/errors',
  authorize(['admin']),
  async (req, res) => {
    try {
      const { error, value } = logQuerySchema.validate(req.query);
      if (error) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.details.map(d => d.message)
        });
      }

      const logFile = path.join(__dirname, '../../logs/error.log');
      
      try {
        const logContent = await fs.readFile(logFile, 'utf8');
        let logs = logContent.split('\n')
          .filter(line => line.trim())
          .map(line => {
            try {
              return JSON.parse(line);
            } catch {
              return { message: line, timestamp: new Date().toISOString(), level: 'error' };
            }
          })
          .reverse(); // Most recent first

        // Apply date filters
        if (value.startDate) {
          logs = logs.filter(log => new Date(log.timestamp) >= new Date(value.startDate));
        }

        if (value.endDate) {
          logs = logs.filter(log => new Date(log.timestamp) <= new Date(value.endDate));
        }

        if (value.search) {
          const searchTerm = value.search.toLowerCase();
          logs = logs.filter(log => 
            JSON.stringify(log).toLowerCase().includes(searchTerm)
          );
        }

        // Pagination
        const paginatedLogs = logs.slice(value.offset, value.offset + value.limit);

        res.json({
          success: true,
          data: paginatedLogs,
          pagination: {
            limit: value.limit,
            offset: value.offset,
            total: logs.length,
            has_more: value.offset + value.limit < logs.length
          }
        });
      } catch (fileError) {
        res.json({
          success: true,
          data: [],
          message: 'Error log file not found or empty',
          pagination: { limit: value.limit, offset: value.offset, total: 0, has_more: false }
        });
      }
    } catch (error) {
      logger.error('Error retrieving error logs:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve error logs',
        message: error.message
      });
    }
  }
);

// POST /api/settings/logs/export - Export logs
router.post('/logs/export',
  authorize(['admin']),
  async (req, res) => {
    try {
      const { logType, startDate, endDate, format = 'json' } = req.body;
      
      if (!logType || !['application', 'audit', 'errors'].includes(logType)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid log type. Must be: application, audit, or errors'
        });
      }

      const logFiles = {
        application: path.join(__dirname, '../../logs/combined.log'),
        audit: path.join(__dirname, '../../logs/audit.log'),
        errors: path.join(__dirname, '../../logs/error.log')
      };

      try {
        const logContent = await fs.readFile(logFiles[logType], 'utf8');
        let logs = logContent.split('\n')
          .filter(line => line.trim())
          .map(line => {
            try {
              return JSON.parse(line);
            } catch {
              return { message: line, timestamp: new Date().toISOString(), level: 'info' };
            }
          });

        // Apply date filters
        if (startDate) {
          logs = logs.filter(log => new Date(log.timestamp) >= new Date(startDate));
        }

        if (endDate) {
          logs = logs.filter(log => new Date(log.timestamp) <= new Date(endDate));
        }

        // Format response
        const filename = `${logType}_logs_${Date.now()}.${format}`;
        
        if (format === 'csv') {
          // Convert to CSV
          const csvHeaders = 'timestamp,level,message,service,userId\n';
          const csvData = logs.map(log => 
            `"${log.timestamp}","${log.level}","${log.message}","${log.service || ''}","${log.userId || ''}"`
          ).join('\n');
          
          res.setHeader('Content-Type', 'text/csv');
          res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
          res.send(csvHeaders + csvData);
        } else {
          // JSON format
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
          res.json({
            export_info: {
              logType,
              startDate,
              endDate,
              exportedAt: new Date().toISOString(),
              recordCount: logs.length
            },
            logs
          });
        }

        // Log the export for audit
        auditLogger.info('Logs exported', {
          userId: req.user.id,
          logType,
          startDate,
          endDate,
          format,
          recordCount: logs.length,
          timestamp: new Date().toISOString(),
          ip: req.ip
        });

      } catch (fileError) {
        res.status(404).json({
          success: false,
          error: 'Log file not found',
          message: `${logType} log file does not exist`
        });
      }
    } catch (error) {
      logger.error('Error exporting logs:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to export logs',
        message: error.message
      });
    }
  }
);

module.exports = router; 