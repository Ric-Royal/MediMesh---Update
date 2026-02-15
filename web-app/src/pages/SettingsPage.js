import React, { useState, useCallback, useMemo } from 'react';
import {
  Box,
  Typography,
  Paper,
  Grid,
  Card,
  CardContent,
  CardHeader,
  Switch,
  FormControlLabel,
  TextField,
  Button,
  Alert,
  Chip,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  ListItemSecondaryAction,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Avatar,
  Tabs,
  Tab
} from '@mui/material';
import {
  Settings as SettingsIcon,
  Security as SecurityIcon,
  Notifications as NotificationsIcon,
  Person as PersonIcon,
  AdminPanelSettings as AdminIcon,
  LocalHospital as MedicalIcon,
  Storage as StorageIcon,
  Save as SaveIcon,
  Lock as LockIcon,
  Visibility as VisibilityIcon,
  VpnKey as KeyIcon,
  Shield as ShieldIcon,
  History as HistoryIcon,
  Assessment as ReportIcon
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { useTheme } from '../contexts/ThemeContext';
import LoadingSpinner from '../components/common/LoadingSpinner';

// Custom hook for debouncing values
const useDebounce = (value, delay) => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  React.useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
};

const SettingsPage = () => {
  const { user, hasRole } = useAuth();
  const { 
    systemSettings, 
    loading, 
    error,
    updateUserSettings,
    updateSystemSetting,
    getSetting
  } = useSettings();
  const { updateTheme } = useTheme();
  
  const changeTheme = async (newTheme) => {
    updateTheme(newTheme);
    try {
      await updateUserSettings({
        preferences: { theme: newTheme }
      });
    } catch (error) {
      console.error('Failed to save theme preference:', error);
    }
  };
  
  const [activeTab, setActiveTab] = useState(0);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [localError, setLocalError] = useState(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [pendingChanges, setPendingChanges] = useState({});
  const [localValues, setLocalValues] = useState({}); // For immediate UI updates
  const [fieldLoading, setFieldLoading] = useState({}); // Track loading state per field
  const [saveLoading, setSaveLoading] = useState(false); // Track loading state for save operation
  
  // Debounce pending changes to reduce rapid updates
  const debouncedPendingChanges = useDebounce(pendingChanges, 500);
  
  const [changePasswordDialog, setChangePasswordDialog] = useState(false);
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
  };

  // Helper function to set field loading state
  const setFieldLoadingState = useCallback((fieldKey, isLoading) => {
    setFieldLoading(prev => ({
      ...prev,
      [fieldKey]: isLoading
    }));
  }, []);

  // Helper function to check if field is loading
  const isFieldLoading = useCallback((section, field) => {
    const fieldKey = section === 'system' ? `system.${field}` : 
                     section === 'medical' ? `medical.${field}` : `${section}.${field}`;
    return fieldLoading[fieldKey] || false;
  }, [fieldLoading]);

  // Stage changes locally instead of auto-saving
  const handlePersonalSettingChange = useCallback((section, field, value) => {
    const changeKey = `${section}.${field}`;
    
    // Update local values immediately for UI responsiveness
    setLocalValues(prev => ({
      ...prev,
      [changeKey]: value
    }));
    
    // Debounced update to pending changes
    setTimeout(() => {
      setPendingChanges(prev => ({
        ...prev,
        [changeKey]: { section, field, value, type: 'personal' }
      }));
      setHasUnsavedChanges(true);
    }, 300);
    
    // Special handling for theme - apply immediately for preview
    if (section === 'preferences' && field === 'theme') {
      changeTheme(value);
    }
  }, [changeTheme]);

  const handleSystemSettingChange = useCallback((field, value) => {
    const changeKey = `system.${field}`;
    
    // Update local values immediately for UI responsiveness
    setLocalValues(prev => ({
      ...prev,
      [changeKey]: value
    }));
    
    // Debounced update to pending changes
    setTimeout(() => {
      setPendingChanges(prev => ({
        ...prev,
        [changeKey]: { field, value, type: 'system' }
      }));
      setHasUnsavedChanges(true);
    }, 300);
  }, []);

  const handleMedicalSettingChange = useCallback((field, value) => {
    const changeKey = `medical.${field}`;
    
    // Update local values immediately for UI responsiveness
    setLocalValues(prev => ({
      ...prev,
      [changeKey]: value
    }));
    
    // Debounced update to pending changes
    setTimeout(() => {
      setPendingChanges(prev => ({
        ...prev,
        [changeKey]: { field, value, type: 'medical' }
      }));
      setHasUnsavedChanges(true);
    }, 300);
  }, []);

  // Get current value (from local values, pending changes, or saved settings)
  const getCurrentValue = useCallback((section, field, defaultValue = '') => {
    const changeKey = section === 'system' ? `system.${field}` : 
                      section === 'medical' ? `medical.${field}` : `${section}.${field}`;
    
    // Priority order: local values (immediate) > pending changes > saved settings
    if (localValues[changeKey] !== undefined) {
      return localValues[changeKey];
    }
    
    if (pendingChanges[changeKey]) {
      return pendingChanges[changeKey].value;
    }
    
    if (section === 'system') {
      return systemSettings?.[field] || defaultValue;
    }
    
    return getSetting(section, field, defaultValue);
  }, [localValues, pendingChanges, systemSettings, getSetting]);

  // Save all pending changes
  const handleSaveAllChanges = async () => {
    if (!hasUnsavedChanges) return;
    
    setLocalError(null);
    setSaveLoading(true);
    
    try {
      // Group changes by type
      const personalChanges = {};
      const systemChanges = {};
      const medicalChanges = {};
      
      Object.values(pendingChanges).forEach(change => {
        if (change.type === 'personal') {
          if (!personalChanges[change.section]) {
            personalChanges[change.section] = {};
          }
          personalChanges[change.section][change.field] = change.value;
        } else if (change.type === 'system') {
          systemChanges[change.field] = change.value;
        } else if (change.type === 'medical') {
          if (!medicalChanges.medical_defaults) {
            medicalChanges.medical_defaults = {};
          }
          medicalChanges.medical_defaults[change.field] = change.value;
        }
      });
      
      // Save changes
      const promises = [];
      
      if (Object.keys(personalChanges).length > 0) {
        promises.push(updateUserSettings(personalChanges));
      }
      
      if (Object.keys(medicalChanges).length > 0) {
        promises.push(updateUserSettings(medicalChanges));
      }
      
      if (Object.keys(systemChanges).length > 0) {
        for (const [field, value] of Object.entries(systemChanges)) {
          promises.push(updateSystemSetting(field, value));
        }
      }
      
      await Promise.all(promises);
      
      // Clear pending changes and local values
      setPendingChanges({});
      setLocalValues({});
      setHasUnsavedChanges(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error('Failed to save settings:', err);
      setLocalError('Failed to save settings. Please try again.');
    } finally {
      setSaveLoading(false);
    }
  };
  
  // Discard pending changes
  const handleDiscardChanges = useCallback(() => {
    setPendingChanges({});
    setLocalValues({}); // Clear local values too
    setHasUnsavedChanges(false);
    
    // Revert theme to saved setting
    const savedTheme = getSetting('preferences', 'theme', 'light');
    changeTheme(savedTheme);
  }, [getSetting, changeTheme]);

  const handleChangePassword = async () => {
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setLocalError('New passwords do not match');
      return;
    }
    
    try {
      // API call to change password
      await new Promise(resolve => setTimeout(resolve, 1000));
      setChangePasswordDialog(false);
      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setSaveSuccess(true);
    } catch (err) {
      setLocalError('Failed to change password');
    }
  };

  const TabPanel = ({ children, value, index }) => (
    <div hidden={value !== index}>
      {value === index && <Box sx={{ py: 3 }}>{children}</Box>}
    </div>
  );

  const PersonalSettingsTab = () => (
    <Grid container spacing={3}>
      {/* Profile Information */}
      <Grid item xs={12} md={6}>
        <Card>
          <CardHeader
            avatar={<Avatar sx={{ bgcolor: 'primary.main' }}><PersonIcon /></Avatar>}
            title="Profile Information"
            subheader="Update your personal details"
            action={
              <Chip 
                label={user?.roles?.[0] || 'User'} 
                color="primary" 
                size="small"
                icon={<MedicalIcon />}
              />
            }
          />
          <CardContent>
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Display Name"
                  value={getCurrentValue('profile', 'displayName', '')}
                  onChange={(e) => handlePersonalSettingChange('profile', 'displayName', e.target.value)}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Email Address"
                  type="email"
                  value={getCurrentValue('profile', 'email', '')}
                  onChange={(e) => handlePersonalSettingChange('profile', 'email', e.target.value)}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Phone Number"
                  value={getCurrentValue('profile', 'phone', '')}
                  onChange={(e) => handlePersonalSettingChange('profile', 'phone', e.target.value)}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Department"
                  value={getCurrentValue('profile', 'department', '')}
                  onChange={(e) => handlePersonalSettingChange('profile', 'department', e.target.value)}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Specialization"
                  value={getCurrentValue('profile', 'specialization', '')}
                  onChange={(e) => handlePersonalSettingChange('profile', 'specialization', e.target.value)}
                />
              </Grid>
            </Grid>
            
            <Box sx={{ mt: 2 }}>
              <Button
                variant="outlined"
                startIcon={<KeyIcon />}
                onClick={() => setChangePasswordDialog(true)}
              >
                Change Password
              </Button>
            </Box>
          </CardContent>
        </Card>
      </Grid>

      {/* Preferences */}
      <Grid item xs={12} md={6}>
        <Card>
          <CardHeader
            avatar={<Avatar sx={{ bgcolor: 'secondary.main' }}><SettingsIcon /></Avatar>}
            title="Preferences"
            subheader="Customize your experience"
          />
          <CardContent>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth>
                  <InputLabel>Language</InputLabel>
                  <Select
                    value={getCurrentValue('preferences', 'language', 'en')}
                    onChange={(e) => handlePersonalSettingChange('preferences', 'language', e.target.value)}
                  >
                    <MenuItem value="en">English</MenuItem>
                    <MenuItem value="es">Spanish</MenuItem>
                    <MenuItem value="fr">French</MenuItem>
                    <MenuItem value="de">German</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth>
                  <InputLabel>Timezone</InputLabel>
                  <Select
                    value={getCurrentValue('preferences', 'timezone', 'Africa/Johannesburg')}
                    onChange={(e) => handlePersonalSettingChange('preferences', 'timezone', e.target.value)}
                  >
                    <MenuItem value="Africa/Cairo">Cairo (GMT+2)</MenuItem>
                    <MenuItem value="Africa/Lagos">Lagos (GMT+1)</MenuItem>
                    <MenuItem value="Africa/Johannesburg">Johannesburg (GMT+2)</MenuItem>
                    <MenuItem value="Africa/Nairobi">Nairobi (GMT+3)</MenuItem>
                    <MenuItem value="Africa/Casablanca">Casablanca (GMT+1)</MenuItem>
                    <MenuItem value="Africa/Addis_Ababa">Addis Ababa (GMT+3)</MenuItem>
                    <MenuItem value="Africa/Accra">Accra (GMT+0)</MenuItem>
                    <MenuItem value="Africa/Tunis">Tunis (GMT+1)</MenuItem>
                    <MenuItem value="Africa/Algiers">Algiers (GMT+1)</MenuItem>
                    <MenuItem value="Africa/Dar_es_Salaam">Dar es Salaam (GMT+3)</MenuItem>
                    <MenuItem value="Africa/Khartoum">Khartoum (GMT+2)</MenuItem>
                    <MenuItem value="Africa/Maputo">Maputo (GMT+2)</MenuItem>
                    <MenuItem value="UTC">UTC (GMT+0)</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12}>
                <FormControl fullWidth>
                  <InputLabel>Theme</InputLabel>
                  <Select
                    value={getCurrentValue('preferences', 'theme', 'light')}
                    onChange={(e) => handlePersonalSettingChange('preferences', 'theme', e.target.value)}
                  >
                    <MenuItem value="light">Light Mode</MenuItem>
                    <MenuItem value="dark">Dark Mode</MenuItem>
                    <MenuItem value="auto">Auto (System)</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      </Grid>

      {/* Notification Settings */}
      <Grid item xs={12}>
        <Card>
          <CardHeader
            avatar={<Avatar sx={{ bgcolor: 'warning.main' }}><NotificationsIcon /></Avatar>}
            title="Notification Preferences"
            subheader="Control when and how you receive notifications"
          />
          <CardContent>
            <Grid container spacing={2}>
              <Grid item xs={12} md={4}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={getSetting('notifications.emailNotifications', true)}
                      onChange={(e) => handlePersonalSettingChange('notifications', 'emailNotifications', e.target.checked)}
                    />
                  }
                  label="Email Notifications"
                />
                <Typography variant="body2" color="text.secondary">
                  Patient updates, system alerts, and reminders
                </Typography>
              </Grid>
              <Grid item xs={12} md={4}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={getSetting('notifications.smsNotifications', false)}
                      onChange={(e) => handlePersonalSettingChange('notifications', 'smsNotifications', e.target.checked)}
                    />
                  }
                  label="SMS Notifications"
                />
                <Typography variant="body2" color="text.secondary">
                  Emergency alerts and critical updates
                </Typography>
              </Grid>
              <Grid item xs={12} md={4}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={getSetting('notifications.pushNotifications', true)}
                      onChange={(e) => handlePersonalSettingChange('notifications', 'pushNotifications', e.target.checked)}
                    />
                  }
                  label="Push Notifications"
                />
                <Typography variant="body2" color="text.secondary">
                  Real-time browser notifications
                </Typography>
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  );

  const MedicalSettingsTab = () => (
    <Grid container spacing={3}>
      {/* Clinical Defaults */}
      <Grid item xs={12} md={6}>
        <Card>
          <CardHeader
            avatar={<Avatar sx={{ bgcolor: 'success.main' }}><MedicalIcon /></Avatar>}
            title="Clinical Defaults"
            subheader="Default values for medical records"
          />
          <CardContent>
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <FormControl fullWidth>
                  <InputLabel id="default-record-type-label">Default Record Type</InputLabel>
                  <Select
                    labelId="default-record-type-label"
                    label="Default Record Type"
                    value={getCurrentValue('medical_defaults', 'defaultRecordType', 'consultation')}
                    onChange={(e) => handleMedicalSettingChange('defaultRecordType', e.target.value)}
                  >
                    <MenuItem value="consultation">Consultation</MenuItem>
                    <MenuItem value="diagnosis">Diagnosis</MenuItem>
                    <MenuItem value="treatment">Treatment</MenuItem>
                    <MenuItem value="lab_result">Lab Result</MenuItem>
                    <MenuItem value="imaging">Imaging</MenuItem>
                    <MenuItem value="prescription">Prescription</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12}>
                <FormControl fullWidth>
                  <InputLabel id="vital-signs-units-label">Vital Signs Units</InputLabel>
                  <Select
                    labelId="vital-signs-units-label"
                    label="Vital Signs Units"
                    value={getCurrentValue('medical_defaults', 'vitalSignsUnits', 'metric')}
                    onChange={(e) => handleMedicalSettingChange('vitalSignsUnits', e.target.value)}
                  >
                    <MenuItem value="metric">Metric (°C, kg, cm)</MenuItem>
                    <MenuItem value="imperial">Imperial (°F, lbs, ft/in)</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Default Examination Duration (minutes)"
                  type="number"
                                      value={getCurrentValue('medical_defaults', 'defaultExamDuration', '30')}
                    onChange={(e) => handleMedicalSettingChange('defaultExamDuration', e.target.value)}
                />
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      </Grid>

      {/* Clinical Features */}
      <Grid item xs={12} md={6}>
        <Card>
          <CardHeader
            avatar={<Avatar sx={{ bgcolor: 'info.main' }}><ShieldIcon /></Avatar>}
            title="Clinical Features"
            subheader="Enable/disable clinical decision support"
          />
          <CardContent>
            <List>
              <ListItem>
                <ListItemIcon><ReportIcon /></ListItemIcon>
                <ListItemText 
                  primary="Auto-save Drafts"
                  secondary="Automatically save record drafts every 30 seconds"
                />
                <ListItemSecondaryAction>
                  <Switch
                    checked={getCurrentValue('medical_defaults', 'autoSaveDrafts', true)}
                    onChange={(e) => handleMedicalSettingChange('autoSaveDrafts', e.target.checked)}
                  />
                </ListItemSecondaryAction>
              </ListItem>
              
              <ListItem>
                <ListItemIcon><SecurityIcon /></ListItemIcon>
                <ListItemText 
                  primary="Require Diagnosis"
                  secondary="Mandate diagnosis entry for all consultations"
                />
                <ListItemSecondaryAction>
                  <Switch
                    checked={getCurrentValue('medical_defaults', 'requireDiagnosis', false)}
                    onChange={(e) => handleMedicalSettingChange('requireDiagnosis', e.target.checked)}
                  />
                </ListItemSecondaryAction>
              </ListItem>
              
              <ListItem>
                <ListItemIcon><HistoryIcon /></ListItemIcon>
                <ListItemText 
                  primary="Enable Templates"
                  secondary="Use pre-defined templates for common procedures"
                />
                <ListItemSecondaryAction>
                  <Switch
                    checked={getCurrentValue('medical_defaults', 'enableTemplates', true)}
                    onChange={(e) => handleMedicalSettingChange('enableTemplates', e.target.checked)}
                  />
                </ListItemSecondaryAction>
              </ListItem>
              
              <ListItem>
                <ListItemIcon><VisibilityIcon /></ListItemIcon>
                <ListItemText 
                  primary="Show ICD-10 Codes"
                  secondary="Display ICD-10 diagnostic codes in records"
                />
                <ListItemSecondaryAction>
                  <Switch
                    checked={getCurrentValue('medical_defaults', 'showICD10Codes', false)}
                    onChange={(e) => handleMedicalSettingChange('showICD10Codes', e.target.checked)}
                  />
                </ListItemSecondaryAction>
              </ListItem>
              
              <ListItem>
                <ListItemIcon><NotificationsIcon /></ListItemIcon>
                <ListItemText 
                  primary="Drug Interaction Alerts"
                  secondary="Show warnings for potential drug interactions"
                />
                <ListItemSecondaryAction>
                  <Switch
                    checked={getCurrentValue('medical_defaults', 'drugInteractionAlerts', true)}
                    onChange={(e) => handleMedicalSettingChange('drugInteractionAlerts', e.target.checked)}
                  />
                </ListItemSecondaryAction>
              </ListItem>
              
              <ListItem>
                <ListItemIcon><MedicalIcon /></ListItemIcon>
                <ListItemText 
                  primary="Allergy Warnings"
                  secondary="Display patient allergy alerts prominently"
                />
                <ListItemSecondaryAction>
                  <Switch
                    checked={getCurrentValue('medical_defaults', 'allergyWarnings', true)}
                    onChange={(e) => handleMedicalSettingChange('allergyWarnings', e.target.checked)}
                  />
                </ListItemSecondaryAction>
              </ListItem>
            </List>
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  );

  const SystemSettingsTab = () => {
    if (!hasRole('admin')) {
      return (
        <Alert severity="warning" sx={{ mt: 2 }}>
          <Typography variant="h6">Access Restricted</Typography>
          System settings are only available to administrators. Contact your system administrator if you need to modify system-wide settings.
        </Alert>
      );
    }

    return (
      <Grid container spacing={3}>
        {/* System Configuration */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardHeader
              avatar={<Avatar sx={{ bgcolor: 'error.main' }}><AdminIcon /></Avatar>}
              title="System Configuration"
              subheader="Core system settings (Admin only)"
            />
            <CardContent>
              <Grid container spacing={2}>
                <Grid item xs={12}>
                  <FormControl fullWidth>
                    <InputLabel id="patient-id-format-label">Patient ID Format</InputLabel>
                    <Select
                      labelId="patient-id-format-label"
                      label="Patient ID Format"
                      value={systemSettings.patientIdFormat}
                      onChange={(e) => handleSystemSettingChange('patientIdFormat', e.target.value)}
                    >
                      <MenuItem value="auto">Auto-generated UUID</MenuItem>
                      <MenuItem value="sequential">Sequential Numbers</MenuItem>
                      <MenuItem value="custom">Custom Format</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="Session Timeout (minutes)"
                    type="number"
                    value={systemSettings.sessionTimeout}
                    onChange={(e) => handleSystemSettingChange('sessionTimeout', e.target.value)}
                  />
                </Grid>
                
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="Data Retention (years)"
                    type="number"
                    value={systemSettings.dataRetentionPeriod}
                    onChange={(e) => handleSystemSettingChange('dataRetentionPeriod', e.target.value)}
                  />
                </Grid>
                
                <Grid item xs={12} sm={6}>
                  <FormControl fullWidth>
                    <InputLabel id="password-policy-label">Password Policy</InputLabel>
                    <Select
                      labelId="password-policy-label"
                      label="Password Policy"
                      value={systemSettings.passwordPolicy}
                      onChange={(e) => handleSystemSettingChange('passwordPolicy', e.target.value)}
                    >
                      <MenuItem value="basic">Basic (8+ characters)</MenuItem>
                      <MenuItem value="strong">Strong (12+ chars, mixed case, numbers, symbols)</MenuItem>
                      <MenuItem value="complex">Complex (16+ chars, all requirements)</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="Max File Size (MB)"
                    type="number"
                    value={systemSettings.maxFileSize}
                    onChange={(e) => handleSystemSettingChange('maxFileSize', e.target.value)}
                  />
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        {/* Security & Compliance */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardHeader
              avatar={<Avatar sx={{ bgcolor: 'warning.main' }}><SecurityIcon /></Avatar>}
              title="Security & Compliance"
              subheader="HIPAA and security settings"
            />
            <CardContent>
              <List>
                <ListItem>
                  <ListItemIcon><StorageIcon /></ListItemIcon>
                  <ListItemText 
                    primary="Automated Backups"
                    secondary="Daily encrypted backups to secure storage"
                  />
                  <ListItemSecondaryAction>
                    <Switch
                      checked={systemSettings.autoBackup}
                      onChange={(e) => handleSystemSettingChange('autoBackup', e.target.checked)}
                    />
                  </ListItemSecondaryAction>
                </ListItem>
                
                <ListItem>
                  <ListItemIcon><HistoryIcon /></ListItemIcon>
                  <ListItemText 
                    primary="Audit Logging"
                    secondary="Log all user actions for compliance"
                  />
                  <ListItemSecondaryAction>
                    <Switch
                      checked={systemSettings.auditLogging}
                      onChange={(e) => handleSystemSettingChange('auditLogging', e.target.checked)}
                    />
                  </ListItemSecondaryAction>
                </ListItem>
                
                <ListItem>
                  <ListItemIcon><LockIcon /></ListItemIcon>
                  <ListItemText 
                    primary="Two-Factor Authentication"
                    secondary="Require 2FA for all users"
                  />
                  <ListItemSecondaryAction>
                    <Switch
                      checked={systemSettings.twoFactorAuth}
                      onChange={(e) => handleSystemSettingChange('twoFactorAuth', e.target.checked)}
                    />
                  </ListItemSecondaryAction>
                </ListItem>
                
                <ListItem>
                  <ListItemIcon><StorageIcon /></ListItemIcon>
                  <ListItemText 
                    primary="File Upload Enabled"
                    secondary="Allow users to upload medical documents"
                  />
                  <ListItemSecondaryAction>
                    <Switch
                      checked={systemSettings.allowFileUpload}
                      onChange={(e) => handleSystemSettingChange('allowFileUpload', e.target.checked)}
                    />
                  </ListItemSecondaryAction>
                </ListItem>
              </List>
              
              {systemSettings.autoBackup && (
                <Box sx={{ mt: 2 }}>
                  <FormControl fullWidth>
                    <InputLabel>Backup Frequency</InputLabel>
                    <Select
                      value={systemSettings.backupFrequency}
                      onChange={(e) => handleSystemSettingChange('backupFrequency', e.target.value)}
                    >
                      <MenuItem value="hourly">Hourly</MenuItem>
                      <MenuItem value="daily">Daily</MenuItem>
                      <MenuItem value="weekly">Weekly</MenuItem>
                    </Select>
                  </FormControl>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* File Management */}
        <Grid item xs={12}>
          <Card>
            <CardHeader
              avatar={<Avatar sx={{ bgcolor: 'primary.main' }}><StorageIcon /></Avatar>}
              title="File Management"
              subheader="Configure file upload and storage settings"
            />
            <CardContent>
              <Typography variant="subtitle2" gutterBottom>
                Allowed File Types
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
                {['pdf', 'jpg', 'png', 'docx', 'dicom', 'txt', 'csv', 'xlsx'].map((type) => (
                  <Chip
                    key={type}
                    label={type.toUpperCase()}
                    color={systemSettings.allowedFileTypes.includes(type) ? 'primary' : 'default'}
                    onClick={() => {
                      const newTypes = systemSettings.allowedFileTypes.includes(type)
                        ? systemSettings.allowedFileTypes.filter(t => t !== type)
                        : [...systemSettings.allowedFileTypes, type];
                      handleSystemSettingChange('allowedFileTypes', newTypes);
                    }}
                    variant={systemSettings.allowedFileTypes.includes(type) ? 'filled' : 'outlined'}
                  />
                ))}
              </Box>
              <Typography variant="body2" color="text.secondary">
                Click file types to enable/disable them for uploads
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    );
  };

  if (loading && activeTab === 0) {
    return <LoadingSpinner message="Loading settings..." />;
  }

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" gutterBottom>
            Settings
            {hasUnsavedChanges && (
              <Chip 
                label="Unsaved changes" 
                color="warning" 
                size="small" 
                sx={{ ml: 2 }}
              />
            )}
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Manage your preferences and system configuration
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {hasUnsavedChanges && (
            <>
              <Button
                variant="outlined"
                color="error"
                onClick={handleDiscardChanges}
                size="small"
              >
                Discard Changes
              </Button>
              <Button
                variant="contained"
                color="primary"
                onClick={handleSaveAllChanges}
                size="small"
                startIcon={<SaveIcon />}
                disabled={saveLoading}
              >
                {saveLoading ? 'Saving...' : 'Save Changes'}
              </Button>
            </>
          )}
          <Chip 
            label={`Logged in as ${user?.name || 'User'}`}
            color="primary"
            avatar={<Avatar>{user?.name?.[0] || 'U'}</Avatar>}
          />
        </Box>
      </Box>

      {/* Success/Error Messages */}
      {saveSuccess && (
        <Alert severity="success" sx={{ mb: 2 }}>
          Settings saved successfully!
        </Alert>
      )}
      
      {(error || localError) && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setLocalError(null)}>
          <Typography variant="subtitle2" gutterBottom>Settings Error</Typography>
          {error || localError}
          {loading && (
            <Typography variant="body2" sx={{ mt: 1 }}>
              If this error persists, please refresh the page and try again.
            </Typography>
          )}
        </Alert>
      )}

      {/* Settings Tabs */}
      <Paper sx={{ mb: 2 }}>
        <Tabs value={activeTab} onChange={handleTabChange}>
          <Tab 
            label="Personal" 
            icon={<PersonIcon />}
            iconPosition="start"
          />
          <Tab 
            label="Medical" 
            icon={<MedicalIcon />}
            iconPosition="start"
          />
          {hasRole('admin') && (
            <Tab 
              label="System" 
              icon={<AdminIcon />}
              iconPosition="start"
            />
          )}
        </Tabs>
      </Paper>

      {/* Tab Content */}
      <TabPanel value={activeTab} index={0}>
        <PersonalSettingsTab />
      </TabPanel>
      
      <TabPanel value={activeTab} index={1}>
        <MedicalSettingsTab />
      </TabPanel>
      
      {hasRole('admin') && (
        <TabPanel value={activeTab} index={2}>
          <SystemSettingsTab />
        </TabPanel>
      )}

      {/* Change Password Dialog */}
      <Dialog open={changePasswordDialog} onClose={() => setChangePasswordDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Change Password</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Current Password"
                type="password"
                value={passwordData.currentPassword}
                onChange={(e) => setPasswordData({...passwordData, currentPassword: e.target.value})}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="New Password"
                type="password"
                value={passwordData.newPassword}
                onChange={(e) => setPasswordData({...passwordData, newPassword: e.target.value})}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Confirm New Password"
                type="password"
                value={passwordData.confirmPassword}
                onChange={(e) => setPasswordData({...passwordData, confirmPassword: e.target.value})}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setChangePasswordDialog(false)}>Cancel</Button>
          <Button 
            onClick={handleChangePassword} 
            variant="contained"
            disabled={loading || !passwordData.currentPassword || !passwordData.newPassword || passwordData.newPassword !== passwordData.confirmPassword}
          >
            Change Password
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default SettingsPage; 