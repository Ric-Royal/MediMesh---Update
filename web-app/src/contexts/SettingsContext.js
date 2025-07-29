import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import apiService from '../services/api';

const SettingsContext = createContext();

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};

export const SettingsProvider = ({ children }) => {
  const [userSettings, setUserSettings] = useState(null);
  const [systemSettings, setSystemSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Default settings structure
  const defaultUserSettings = {
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

  // Load user settings from API
  const loadUserSettings = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await apiService.settings.getUserSettings();
      setUserSettings(response.data);
      
      // Apply theme immediately
      applyTheme(response.data.preferences?.theme || 'light');
      
    } catch (err) {
      console.error('Error loading user settings:', err);
      setError('Failed to load user settings');
      // Use default settings on error
      setUserSettings(defaultUserSettings);
      applyTheme('light');
    } finally {
      setLoading(false);
    }
  }, []);

  // Load system settings (admin only)
  const loadSystemSettings = useCallback(async () => {
    try {
      const response = await apiService.settings.getSystemSettings();
      setSystemSettings(response.data);
    } catch (err) {
      console.error('Error loading system settings:', err);
      // Not an error for non-admin users
      setSystemSettings(null);
    }
  }, []);

  // Update user settings
  const updateUserSettings = useCallback(async (settingsUpdate) => {
    try {
      setError(null);
      
      const response = await apiService.settings.updateUserSettings(settingsUpdate);
      setUserSettings(response.data);
      
      // Apply theme change immediately
      if (settingsUpdate.preferences?.theme) {
        applyTheme(settingsUpdate.preferences.theme);
      }
      
      return response.data;
    } catch (err) {
      console.error('Error updating user settings:', err);
      setError('Failed to update settings');
      throw err;
    }
  }, []);

  // Update system setting (admin only)
  const updateSystemSetting = useCallback(async (key, value) => {
    try {
      setError(null);
      
      const response = await apiService.settings.updateSystemSetting(key, value);
      
      // Update the system settings state
      setSystemSettings(prev => ({
        ...prev,
        [response.data.category]: prev[response.data.category]?.map(setting => 
          setting.key === key ? response.data : setting
        ) || [response.data]
      }));
      
      return response.data;
    } catch (err) {
      console.error('Error updating system setting:', err);
      setError('Failed to update system setting');
      throw err;
    }
  }, []);

  // Reset user settings to defaults
  const resetUserSettings = useCallback(async () => {
    try {
      setError(null);
      
      const response = await apiService.settings.resetUserSettings();
      setUserSettings(response.data);
      
      // Apply default theme
      applyTheme('light');
      
      return response.data;
    } catch (err) {
      console.error('Error resetting user settings:', err);
      setError('Failed to reset settings');
      throw err;
    }
  }, []);

  // Apply theme to the document
  const applyTheme = useCallback((theme) => {
    const root = document.documentElement;
    
    if (theme === 'dark') {
      root.classList.add('dark-theme');
      root.classList.remove('light-theme');
    } else if (theme === 'light') {
      root.classList.add('light-theme');
      root.classList.remove('dark-theme');
    } else if (theme === 'auto') {
      // Use system preference
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (prefersDark) {
        root.classList.add('dark-theme');
        root.classList.remove('light-theme');
      } else {
        root.classList.add('light-theme');
        root.classList.remove('dark-theme');
      }
    }
  }, []);

  // Get a specific setting value by path
  const getSetting = useCallback((path, defaultValue = null) => {
    if (!userSettings) return defaultValue;
    
    const parts = path.split('.');
    let value = userSettings;
    
    for (const part of parts) {
      if (value && typeof value === 'object' && part in value) {
        value = value[part];
      } else {
        return defaultValue;
      }
    }
    
    return value || defaultValue;
  }, [userSettings]);

  // Get system setting value by key
  const getSystemSetting = useCallback((key, defaultValue = null) => {
    if (!systemSettings) return defaultValue;
    
    for (const category of Object.values(systemSettings)) {
      const setting = category.find(s => s.key === key);
      if (setting) {
        return setting.value;
      }
    }
    
    return defaultValue;
  }, [systemSettings]);

  // Check if a medical feature is enabled
  const isMedicalFeatureEnabled = useCallback((feature) => {
    return getSetting(`medical_defaults.${feature}`, false);
  }, [getSetting]);

  // Get notification preference
  const isNotificationEnabled = useCallback((type) => {
    return getSetting(`notifications.${type}`, false);
  }, [getSetting]);

  // Note: useAutoSave moved to separate hook file to fix React hooks violation

  // Load settings on mount
  useEffect(() => {
    loadUserSettings();
    loadSystemSettings();
  }, [loadUserSettings, loadSystemSettings]);

  // Listen for theme changes
  useEffect(() => {
    if (userSettings?.preferences?.theme === 'auto') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleChange = () => applyTheme('auto');
      
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
  }, [userSettings?.preferences?.theme, applyTheme]);

  const contextValue = {
    // State
    userSettings,
    systemSettings,
    loading,
    error,
    
    // User settings functions
    updateUserSettings,
    resetUserSettings,
    loadUserSettings,
    
    // System settings functions (admin only)
    updateSystemSetting,
    loadSystemSettings,
    
    // Utility functions
    getSetting,
    getSystemSetting,
    isMedicalFeatureEnabled,
    isNotificationEnabled,
    applyTheme,
    useAutoSave,
    
    // Constants
    defaultUserSettings
  };

  return (
    <SettingsContext.Provider value={contextValue}>
      {children}
    </SettingsContext.Provider>
  );
}; 