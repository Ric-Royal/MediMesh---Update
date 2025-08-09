import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import apiService from '../services/api';
import { useAuth } from './AuthContext';

const SettingsContext = createContext();

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};

// Default system settings to prevent UI crashes when API fails
const defaultSystemSettings = {
  patientIdFormat: 'auto',
  sessionTimeout: 30,
  dataRetentionPeriod: 7,
  passwordPolicy: 'strong',
  maxFileSize: 52428800,
  autoBackup: true,
  auditLogging: true,
  twoFactorAuth: true,
  allowFileUpload: true,
  backupFrequency: 'daily',
  allowedFileTypes: ['pdf', 'jpg', 'jpeg', 'png', 'docx', 'doc', 'dicom', 'txt', 'csv'],
  emailEnabled: true,
  smsEnabled: false,
  maintenanceMode: false
};

// Helper function to flatten grouped system settings for UI consumption
const flattenSystemSettings = (groupedSettings) => {
  const flattened = {};
  
  // Specific key mappings for UI compatibility
  const keyMappings = {
    'patient_id_format': 'patientIdFormat',
    'session_timeout': 'sessionTimeout', 
    'data_retention_years': 'dataRetentionPeriod', // UI expects 'Period' not 'Years'
    'password_policy': 'passwordPolicy',
    'max_file_size': 'maxFileSize',
    'allowed_types': 'allowedFileTypes',
    'auto_backup': 'autoBackup',
    'frequency': 'backupFrequency',
    'audit_logging': 'auditLogging',
    'two_factor_auth': 'twoFactorAuth',
    'maintenance_mode': 'maintenanceMode',
    'email_enabled': 'emailEnabled',
    'sms_enabled': 'smsEnabled'
  };
  
  try {
    // Handle case where groupedSettings might be null or not an object
    if (!groupedSettings || typeof groupedSettings !== 'object') {
      console.warn('Invalid system settings data received, using defaults');
      return defaultSystemSettings;
    }

    // Flatten all settings from all categories
    Object.values(groupedSettings).flat().forEach(setting => {
      if (setting && setting.key && setting.hasOwnProperty('value')) {
        // Remove category prefix (e.g., "security.session_timeout" -> "session_timeout")
        const keyWithoutCategory = setting.key.split('.')[1];
        if (keyWithoutCategory) {
          // Use specific mapping if available, otherwise convert snake_case to camelCase
          const mappedKey = keyMappings[keyWithoutCategory] || 
                           keyWithoutCategory.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
          flattened[mappedKey] = setting.value;
        }
      }
    });

    // Merge with defaults to ensure all expected properties exist
    return { ...defaultSystemSettings, ...flattened };
  } catch (error) {
    console.error('Error flattening system settings:', error);
    return defaultSystemSettings;
  }
};

export const SettingsProvider = ({ children }) => {
  const [userSettings, setUserSettings] = useState(null);
  const [systemSettings, setSystemSettings] = useState(defaultSystemSettings);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { user, isAuthenticated, token, authLoading } = useAuth();

  // Default settings structure
  const defaultUserSettings = {
    profile: {
      displayName: user?.name || '',
      email: user?.email || '',
      phone: '',
      department: '',
      specialization: ''
    },
    preferences: {
      language: 'en',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Africa/Johannesburg',
      theme: 'light',
      dateFormat: 'MM/dd/yyyy',
      timeFormat: '12h'
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
      start: '09:00',
      end: '17:00',
      workDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
    }
  };

  // Load user settings
  const loadUserSettings = useCallback(async () => {
    // Only load if authenticated and have token
    if (!isAuthenticated || !token || authLoading) {
      console.log('Skipping user settings load - not authenticated or still loading auth');
      return;
    }

    try {
      const response = await apiService.settings.getUserSettings();
      setUserSettings({ ...defaultUserSettings, ...response.data });
      
      // Theme is now handled by ThemeContext
    } catch (err) {
      console.error('Error loading user settings:', err);
      
      // Set default settings if load fails
      setUserSettings(defaultUserSettings);
      
      // Theme is now handled by ThemeContext
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, token, authLoading]);

  // Load system settings (admin only)
  const loadSystemSettings = useCallback(async () => {
    // Only load if authenticated and have token
    if (!isAuthenticated || !token || authLoading) {
      console.log('Skipping system settings load - not authenticated or still loading auth');
      return;
    }

    try {
      setError(null); // Clear any previous errors
      console.log('Loading system settings for admin user...');
      
      const response = await apiService.settings.getSystemSettings();
      console.log('System settings API response:', response);
      
      // Flatten the grouped settings for UI consumption
      const flattenedSettings = flattenSystemSettings(response.data);
      console.log('Flattened system settings:', flattenedSettings);
      
      setSystemSettings(flattenedSettings);
    } catch (err) {
      console.error('Error loading system settings:', err);
      
      // Handle different error types with appropriate user feedback
      if (err.response?.status === 401) {
        console.log('System settings load failed - authentication required');
        setError('Please log in again to access system settings.');
        setSystemSettings(defaultSystemSettings);
      } else if (err.response?.status === 403) {
        console.log('System settings load failed - insufficient permissions');
        setError('Admin privileges required to view system settings.');
        setSystemSettings(defaultSystemSettings);
      } else if (err.response?.status >= 500) {
        console.log('System settings load failed - server error');
        setError('Server error loading system settings. Using default values.');
        setSystemSettings(defaultSystemSettings);
      } else {
        console.log('System settings load failed - network or other error');
        setError('Failed to load system settings. Using default values.');
        setSystemSettings(defaultSystemSettings);
      }
    }
  }, [isAuthenticated, token, authLoading]);

  // Update user settings
  const updateUserSettings = useCallback(async (settingsUpdate) => {
    // Check authentication before making API call
    if (!isAuthenticated || !token) {
      throw new Error('Authentication required to update settings');
    }

    try {
      setLoading(true);
      setError(null);
      
      const response = await apiService.settings.updateUserSettings(settingsUpdate);
      setUserSettings(response.data);
      
      // Theme updates are now handled by ThemeContext
      
      return response.data;
    } catch (err) {
      console.error('Error updating user settings:', err);
      setError('Failed to update settings');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, token]);

  // Helper function to convert UI property names back to database key format
  const getSystemSettingKey = (uiKey) => {
    const reverseKeyMappings = {
      'patientIdFormat': 'medical.patient_id_format',
      'sessionTimeout': 'security.session_timeout',
      'dataRetentionPeriod': 'medical.data_retention_years',
      'passwordPolicy': 'security.password_policy',
      'maxFileSize': 'files.max_file_size',
      'allowedFileTypes': 'files.allowed_types',
      'autoBackup': 'backup.auto_backup',
      'backupFrequency': 'backup.frequency',
      'auditLogging': 'security.audit_logging',
      'twoFactorAuth': 'security.two_factor_auth',
      'maintenanceMode': 'system.maintenance_mode',
      'emailEnabled': 'notifications.email_enabled',
      'smsEnabled': 'notifications.sms_enabled'
    };
    
    return reverseKeyMappings[uiKey] || uiKey;
  };

  // Update system setting
  const updateSystemSetting = useCallback(async (key, value) => {
    // Check authentication before making API call
    if (!isAuthenticated || !token) {
      throw new Error('Authentication required to update system settings');
    }

    try {
      setLoading(true);
      setError(null);
      
      // Convert UI key to database key format
      const databaseKey = getSystemSettingKey(key);
      console.log('Updating system setting:', databaseKey, 'to:', value);
      
      const response = await apiService.settings.updateSystemSetting(databaseKey, value);
      
      // Update local system settings using UI key
      setSystemSettings(prev => ({
        ...prev,
        [key]: value
      }));
      
      console.log('System setting updated successfully');
      return response.data;
    } catch (err) {
      console.error('Error updating system setting:', err);
      
      // Provide specific error messages
      if (err.response?.status === 403) {
        setError('Admin privileges required to update system settings');
      } else if (err.response?.status === 404) {
        setError(`System setting '${key}' not found`);
      } else {
        setError('Failed to update system setting');
      }
      throw err;
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, token]);

  // Reset user settings to defaults
  const resetUserSettings = useCallback(async () => {
    // Check authentication before making API call
    if (!isAuthenticated || !token) {
      throw new Error('Authentication required to reset settings');
    }

    try {
      setLoading(true);
      setError(null);
      
      const response = await apiService.settings.resetUserSettings();
      setUserSettings(response.data);
      
      // Theme is now handled by ThemeContext
      
      return response.data;
    } catch (err) {
      console.error('Error resetting user settings:', err);
      setError('Failed to reset settings');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, token]);

  // Theme handling moved to ThemeContext

  // Helper functions for getting specific settings
  const getSetting = useCallback((section, key, defaultValue = null) => {
    if (!userSettings || !userSettings[section]) {
      return defaultValue;
    }
    return userSettings[section][key] !== undefined ? userSettings[section][key] : defaultValue;
  }, [userSettings]);

  const getSystemSetting = useCallback((key, defaultValue = null) => {
    if (!systemSettings) {
      return defaultValue;
    }
    return systemSettings[key] !== undefined ? systemSettings[key] : defaultValue;
  }, [systemSettings]);

  // Helper function to check if medical features are enabled
  const isMedicalFeatureEnabled = useCallback((feature) => {
    if (!userSettings?.medical_defaults) {
      return false;
    }
    return userSettings.medical_defaults[feature] === true;
  }, [userSettings]);

  // Load settings when auth state changes
  useEffect(() => {
    if (!authLoading && isAuthenticated && token) {
      console.log('Auth state ready, loading settings...');
      loadUserSettings();
      
      // Only load system settings if user has admin role
      if (user?.roles?.includes('admin')) {
        console.log('User has admin role, loading system settings...');
        loadSystemSettings();
      } else {
        console.log('User does not have admin role, skipping system settings');
      }
    } else if (!authLoading && !isAuthenticated) {
      // Clear settings when not authenticated
      console.log('User not authenticated, clearing settings');
      setUserSettings(null);
      setSystemSettings(defaultSystemSettings);
      setLoading(false);
      setError(null);
    }
  }, [isAuthenticated, token, authLoading, user?.roles, loadUserSettings, loadSystemSettings]);

  // Memoize the context value to prevent unnecessary re-renders
  const value = useMemo(() => ({
    userSettings,
    systemSettings,
    loading,
    error,
    updateUserSettings,
    updateSystemSetting,
    resetUserSettings,
    getSetting,
    getSystemSetting,
    isMedicalFeatureEnabled,
    // Expose defaults for reference
    defaultUserSettings,
    defaultSystemSettings
  }), [
    userSettings,
    systemSettings,
    loading,
    error,
    updateUserSettings,
    updateSystemSetting,
    resetUserSettings,
    getSetting,
    getSystemSetting,
    isMedicalFeatureEnabled
  ]);

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}; 