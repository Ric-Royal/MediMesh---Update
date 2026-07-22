import React, { useState, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  Grid,
  Card,
  CardContent,
  CardHeader,
  Switch,
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
  Assessment as ReportIcon,
  Tune as OperationsIcon
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { useTheme } from '../contexts/ThemeContext';
import LoadingSpinner from '../components/common/LoadingSpinner';
import AdminOperationsSettings from '../components/settings/AdminOperationsSettings';

const SettingsPage = () => {
  const {
    user,
    hasRole,
    changePassword,
    setupMfa,
    enableMfa,
    disableMfa,
    developmentMode,
    openAccountManagement,
  } = useAuth();
  const { 
    systemSettings, 
    loading, 
    error,
    updateUserSettings,
    updateSystemSetting,
    getSetting
  } = useSettings();
  const { updateTheme } = useTheme();
  
  const changeTheme = useCallback(async (newTheme) => {
    updateTheme(newTheme);
    try {
      await updateUserSettings({
        preferences: { theme: newTheme }
      });
    } catch (error) {
      console.error('Failed to save theme preference:', error);
    }
  }, [updateTheme, updateUserSettings]);
  
  const [activeTab, setActiveTab] = useState(0);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [localError, setLocalError] = useState(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [pendingChanges, setPendingChanges] = useState({});
  const [localValues, setLocalValues] = useState({}); // For immediate UI updates
  const [saveLoading, setSaveLoading] = useState(false); // Track loading state for save operation
  
  const [changePasswordDialog, setChangePasswordDialog] = useState(false);
  const [passwordChanging, setPasswordChanging] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [mfaSetupData, setMfaSetupData] = useState(null);
  const [mfaCode, setMfaCode] = useState('');
  const [mfaPassword, setMfaPassword] = useState('');
  const [mfaLoading, setMfaLoading] = useState(false);
  const [mfaMessage, setMfaMessage] = useState(null);

  React.useEffect(() => {
    if (user?.mustChangePassword) setChangePasswordDialog(true);
  }, [user?.mustChangePassword]);

  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
  };

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
    setPasswordError('');
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setPasswordError('New passwords do not match');
      return;
    }
    if (passwordData.newPassword.length < 12 ||
        !/[a-z]/.test(passwordData.newPassword) ||
        !/[A-Z]/.test(passwordData.newPassword) ||
        !/[0-9]/.test(passwordData.newPassword) ||
        !/[^A-Za-z0-9\s]/.test(passwordData.newPassword)) {
      setPasswordError('Use at least 12 characters with uppercase, lowercase, a number and a symbol.');
      return;
    }

    try {
      setPasswordChanging(true);
      const result = await changePassword(passwordData.currentPassword, passwordData.newPassword);
      if (!result.success) {
        setPasswordError(result.error || 'Failed to change password');
        return;
      }
      setChangePasswordDialog(false);
      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setSaveSuccess(true);
    } catch (err) {
      setPasswordError('Failed to change password');
    } finally {
      setPasswordChanging(false);
    }
  };

  const handleStartMfa = async () => {
    setMfaLoading(true);
    setMfaMessage(null);
    const result = await setupMfa();
    if (result.success) setMfaSetupData(result.data);
    else setMfaMessage({ severity: 'error', text: result.error });
    setMfaLoading(false);
  };

  const handleEnableMfa = async () => {
    setMfaLoading(true);
    const result = await enableMfa(mfaCode);
    setMfaMessage({ severity: result.success ? 'success' : 'error', text: result.message || result.error });
    if (result.success) {
      setMfaSetupData(null);
      setMfaCode('');
    }
    setMfaLoading(false);
  };

  const handleDisableMfa = async () => {
    setMfaLoading(true);
    const result = await disableMfa(mfaPassword, mfaCode);
    setMfaMessage({ severity: result.success ? 'warning' : 'error', text: result.message || result.error });
    if (result.success) {
      setMfaPassword('');
      setMfaCode('');
    }
    setMfaLoading(false);
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
                onClick={() => developmentMode ? setChangePasswordDialog(true) : openAccountManagement()}
              >
                {developmentMode ? 'Change Password' : 'Manage Password'}
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
                  <InputLabel id="timezone-preference-label">Timezone</InputLabel>
                  <Select
                    labelId="timezone-preference-label"
                    label="Timezone"
                    value={getCurrentValue('preferences', 'timezone', 'Africa/Nairobi')}
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
                  <InputLabel id="theme-preference-label">Theme</InputLabel>
                  <Select
                    labelId="theme-preference-label"
                    label="Theme"
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

      <Grid item xs={12}>
        <Card>
          <CardHeader
            avatar={<Avatar sx={{ bgcolor: 'success.main' }}><ShieldIcon /></Avatar>}
            title="Multi-factor authentication"
            subheader="Protect this account with a time-based authenticator code"
            action={<Chip
              label={user?.mfaEnabled ? 'Enabled' : user?.mfaEnrollmentRequired ? 'Required' : 'Not enabled'}
              color={user?.mfaEnabled ? 'success' : 'warning'}
              size="small"
            />}
          />
          <CardContent>
            {mfaMessage && <Alert severity={mfaMessage.severity} sx={{ mb: 2 }}>{mfaMessage.text}</Alert>}
            {!user?.mfaEnabled && !mfaSetupData && <>
              {user?.mfaEnrollmentRequired && <Alert severity="warning" sx={{ mb: 2 }}>
                MFA enrollment is required before clinical workspaces can be opened.
              </Alert>}
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Use Microsoft Authenticator, Google Authenticator, 1Password, or another standards-compatible TOTP app.
              </Typography>
              <Button variant="contained" startIcon={<ShieldIcon />} onClick={handleStartMfa} disabled={mfaLoading}>
                Set up authenticator
              </Button>
            </>}

            {!user?.mfaEnabled && mfaSetupData && <Grid container spacing={2}>
              <Grid item xs={12}>
                <Alert severity="info">
                  In your authenticator app choose “enter setup key”. Use account <strong>{user?.username}</strong>, type “time based”, and enter the key below.
                </Alert>
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Manual setup key"
                  value={mfaSetupData.secret || ''}
                  InputProps={{ readOnly: true }}
                  inputProps={{ style: { fontFamily: 'monospace', letterSpacing: '0.12em' } }}
                  helperText="Keep this key private. It is shown only during enrollment."
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Six-digit authenticator code"
                  value={mfaCode}
                  onChange={(event) => setMfaCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                  inputProps={{ inputMode: 'numeric', maxLength: 6 }}
                />
              </Grid>
              <Grid item xs={12} sm={6} sx={{ display: 'flex', alignItems: 'center' }}>
                <Button variant="contained" onClick={handleEnableMfa} disabled={mfaLoading || mfaCode.length !== 6}>
                  Verify and enable
                </Button>
              </Grid>
            </Grid>}

            {user?.mfaEnabled && <Grid container spacing={2}>
              <Grid item xs={12}>
                <Alert severity="success">Authenticator verification is active for this account.</Alert>
              </Grid>
              <Grid item xs={12}>
                <Typography variant="body2" color="text.secondary">
                  To replace or remove the authenticator, confirm both your password and a current code. If facility policy requires MFA, access will remain restricted until you enroll again.
                </Typography>
              </Grid>
              <Grid item xs={12} sm={5}>
                <TextField fullWidth label="Current password" type="password" value={mfaPassword}
                  onChange={(event) => setMfaPassword(event.target.value)} />
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField fullWidth label="Authenticator code" value={mfaCode}
                  onChange={(event) => setMfaCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                  inputProps={{ inputMode: 'numeric', maxLength: 6 }} />
              </Grid>
              <Grid item xs={12} sm={3} sx={{ display: 'flex', alignItems: 'center' }}>
                <Button color="warning" variant="outlined" onClick={handleDisableMfa}
                  disabled={mfaLoading || !mfaPassword || mfaCode.length !== 6}>
                  Remove MFA
                </Button>
              </Grid>
            </Grid>}
          </CardContent>
        </Card>
      </Grid>

      {/* Notification Settings */}
      <Grid item xs={12}>
        <Card>
          <CardHeader
            avatar={<Avatar sx={{ bgcolor: 'warning.main' }}><NotificationsIcon /></Avatar>}
            title="Notification delivery"
            subheader="Delivery channels available to this deployment"
          />
          <CardContent>
            <Alert severity="info" sx={{ mb: 1.5 }}>
              Email, SMS, and browser notification providers are not configured. These channels are shown read-only so a saved preference cannot imply that messages will be delivered.
            </Alert>
            <List disablePadding aria-label="Notification delivery status">
              {[
                ['Email', 'Requires a configured transactional email provider'],
                ['SMS', 'Requires an SMS gateway and approved sender identity'],
                ['Browser push', 'Requires a push service and browser permission workflow'],
              ].map(([channel, requirement], index) => (
                <ListItem key={channel} divider={index < 2}>
                  <ListItemIcon><NotificationsIcon /></ListItemIcon>
                  <ListItemText primary={channel} secondary={requirement} />
                  <ListItemSecondaryAction>
                    <Chip size="small" label="Not connected" color="warning" variant="outlined" />
                  </ListItemSecondaryAction>
                </ListItem>
              ))}
            </List>
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
                    inputProps={{ 'aria-label': 'Auto-save drafts' }}
                  />
                </ListItemSecondaryAction>
              </ListItem>
              
              <ListItem>
                <ListItemIcon><SecurityIcon /></ListItemIcon>
                <ListItemText 
                  primary="Require Diagnosis"
                  secondary="Mandate diagnosis entry for all consultations"
                />
                <ListItemSecondaryAction><Chip size="small" label="Not connected" variant="outlined" /></ListItemSecondaryAction>
              </ListItem>
              
              <ListItem>
                <ListItemIcon><HistoryIcon /></ListItemIcon>
                <ListItemText 
                  primary="Enable Templates"
                  secondary="Use pre-defined templates for common procedures"
                />
                <ListItemSecondaryAction><Chip size="small" label="Not connected" variant="outlined" /></ListItemSecondaryAction>
              </ListItem>
              
              <ListItem>
                <ListItemIcon><VisibilityIcon /></ListItemIcon>
                <ListItemText 
                  primary="Show ICD-10 Codes"
                  secondary="Display ICD-10 diagnostic codes in records"
                />
                <ListItemSecondaryAction><Chip size="small" label="Not connected" variant="outlined" /></ListItemSecondaryAction>
              </ListItem>
              
              <ListItem>
                <ListItemIcon><NotificationsIcon /></ListItemIcon>
                <ListItemText 
                  primary="Drug Interaction Alerts"
                  secondary="Show warnings for potential drug interactions"
                />
                <ListItemSecondaryAction><Chip size="small" label="Not connected" variant="outlined" /></ListItemSecondaryAction>
              </ListItem>
              
              <ListItem>
                <ListItemIcon><MedicalIcon /></ListItemIcon>
                <ListItemText 
                  primary="Allergy Warnings"
                  secondary="Display patient allergy alerts prominently"
                />
                <ListItemSecondaryAction><Chip size="small" label="Not connected" variant="outlined" /></ListItemSecondaryAction>
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
              title="Policy registry"
              subheader="Recorded policy and deployment-controlled limits"
            />
            <CardContent>
              <Alert severity="info" sx={{ mb: 2 }}>
                Runtime authentication, identifiers, and upload limits are deployment controls. They are shown read-only here so a saved preference cannot imply enforcement that is not active.
              </Alert>
              <Grid container spacing={2}>
                <Grid item xs={12}>
                  <FormControl fullWidth>
                    <InputLabel id="patient-id-format-label">Patient ID Format</InputLabel>
                    <Select
                      labelId="patient-id-format-label"
                      label="Patient ID Format"
                      value={systemSettings.patientIdFormat}
                      disabled
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
                    disabled
                    helperText="Controlled by SESSION_TTL_SECONDS at deployment"
                  />
                </Grid>
                
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="Retention policy (years)"
                    type="number"
                    value={systemSettings.dataRetentionPeriod}
                    onChange={(e) => handleSystemSettingChange('dataRetentionPeriod', e.target.value)}
                    helperText="Policy record; deletion requires an approved retention job"
                  />
                </Grid>
                
                <Grid item xs={12} sm={6}>
                  <FormControl fullWidth>
                    <InputLabel id="password-policy-label">Password Policy</InputLabel>
                    <Select
                      labelId="password-policy-label"
                      label="Password Policy"
                      value={systemSettings.passwordPolicy}
                      disabled
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
                    value={Math.round(Number(systemSettings.maxFileSize || 52428800) / (1024 * 1024))}
                    disabled
                    helperText="Fixed at 50 MB in this deployment"
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
              title="Security controls"
              subheader="What is active in this deployment"
            />
            <CardContent>
              <Alert severity="info" sx={{ mb: 2 }}>
                Audit trails, authenticated file access, and account MFA are application controls. Off-site backup status must be verified by the deployment operator because it cannot be inferred from this browser.
              </Alert>
              <List>
                <ListItem>
                  <ListItemIcon><StorageIcon /></ListItemIcon>
                  <ListItemText 
                    primary="Automated backups"
                    secondary="Connect an encrypted off-site backup job and test restoration before production use"
                  />
                  <ListItemSecondaryAction>
                    <Chip size="small" label="Not connected" color="warning" variant="outlined" />
                  </ListItemSecondaryAction>
                </ListItem>
                
                <ListItem>
                  <ListItemIcon><HistoryIcon /></ListItemIcon>
                  <ListItemText 
                    primary="Audit Logging"
                    secondary="Clinical and administrative actions are recorded"
                  />
                  <ListItemSecondaryAction>
                    <Chip size="small" label="Active" color="success" variant="outlined" />
                  </ListItemSecondaryAction>
                </ListItem>
                
                <ListItem>
                  <ListItemIcon><LockIcon /></ListItemIcon>
                  <ListItemText 
                    primary="Multi-factor authentication"
                    secondary={user?.mfaEnabled ? 'Authenticator verification is enabled for this account' : 'Enroll an authenticator from the Personal tab'}
                  />
                  <ListItemSecondaryAction>
                    <Chip size="small" label={user?.mfaEnabled ? 'Active' : 'Required'} color={user?.mfaEnabled ? 'success' : 'warning'} variant="outlined" />
                  </ListItemSecondaryAction>
                </ListItem>
                
                <ListItem>
                  <ListItemIcon><StorageIcon /></ListItemIcon>
                  <ListItemText 
                    primary="Authenticated file access"
                    secondary="Medical documents require an authenticated application session"
                  />
                  <ListItemSecondaryAction>
                    <Chip size="small" label="Active" color="success" variant="outlined" />
                  </ListItemSecondaryAction>
                </ListItem>
              </List>
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
    <Box sx={{ width: '100%', minWidth: 0 }}>
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
        <Tabs
          value={activeTab}
          onChange={handleTabChange}
          variant="scrollable"
          scrollButtons="auto"
          allowScrollButtonsMobile
          aria-label="Settings sections"
        >
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
            <Tab label="System" icon={<AdminIcon />} iconPosition="start" />
          )}
          {hasRole('admin') && (
            <Tab label="Operations" icon={<OperationsIcon />} iconPosition="start" />
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

      {hasRole('admin') && (
        <TabPanel value={activeTab} index={3}>
          <AdminOperationsSettings />
        </TabPanel>
      )}

      {/* Change Password Dialog */}
      <Dialog
        open={changePasswordDialog}
        onClose={user?.mustChangePassword ? undefined : () => setChangePasswordDialog(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Change Password</DialogTitle>
        <DialogContent>
          {user?.mustChangePassword && (
            <Alert severity="warning" sx={{ mt: 1, mb: 2 }}>
              Your temporary password must be replaced before you can continue.
            </Alert>
          )}
          {passwordError && <Alert severity="error" sx={{ mt: 1, mb: 2 }}>{passwordError}</Alert>}
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
                helperText="At least 12 characters with uppercase, lowercase, a number and a symbol"
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
          {!user?.mustChangePassword && <Button onClick={() => setChangePasswordDialog(false)}>Cancel</Button>}
          <Button 
            onClick={handleChangePassword} 
            variant="contained"
            disabled={passwordChanging || !passwordData.currentPassword || !passwordData.newPassword || passwordData.newPassword !== passwordData.confirmPassword}
          >
            {passwordChanging ? 'Changing...' : 'Change Password'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default SettingsPage;
