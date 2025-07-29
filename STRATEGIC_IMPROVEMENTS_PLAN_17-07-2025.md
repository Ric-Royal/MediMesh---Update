# MediMesh Strategic Improvements Plan

**Date**: 17 July 2025  
**Analysis By**: Development Team  
**Current Version**: 1.0.0  
**Priority**: High Impact UI/UX and System Enhancements

---

## 🎯 **Strategic Issues Analysis**

### **1. Patient Deletion Functionality**
**Current State**: The backend has the delete endpoint, but the frontend lacks the UI for admin users to delete patients.

**Implementation Strategy**:
- Add delete button to PatientDetailPage (admin-only)
- Implement confirmation dialog with warnings about medical records
- Add audit logging for patient deletions
- Consider soft delete vs hard delete for compliance

### **2. Emergency Contact & Insurance Display**
**Current State**: Data is collected but not displayed in PatientDetailPage.

**Impact**: Critical patient information is hidden from clinicians.

### **3. Settings Page Implementation**
**Current State**: Placeholder content only.

**Priority**: High - Admins need system configuration capabilities.

### **4. Record Type Specialization**
**Current State**: All record types use the same generic form structure.

**Opportunity**: Create specialized forms for different medical scenarios.

### **5. File Upload System**
**Current State**: No file attachment capability.

**Business Impact**: Essential for medical documents, images, lab results.

---

## 🚀 **Comprehensive Implementation Strategy**

### **Phase 1: Critical UI/UX Improvements (Week 1-2)**

#### **1.1 Patient Deletion Functionality**
```javascript
// Add to PatientDetailPage.js
{(hasRole('admin')) && (
  <Button
    variant="outlined"
    color="error"
    startIcon={<DeleteIcon />}
    onClick={() => setDeleteDialogOpen(true)}
  >
    Delete Patient
  </Button>
)}

// Add deletion confirmation dialog
<Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
  <DialogTitle>Delete Patient</DialogTitle>
  <DialogContent>
    <Alert severity="warning" sx={{ mb: 2 }}>
      This action cannot be undone. All associated medical records will also be deleted.
    </Alert>
    <Typography>
      Are you sure you want to permanently delete patient {patient.full_name}?
    </Typography>
  </DialogContent>
  <DialogActions>
    <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
    <Button 
      onClick={handleDeletePatient} 
      color="error" 
      variant="contained"
      disabled={deleting}
    >
      {deleting ? 'Deleting...' : 'Delete Patient'}
    </Button>
  </DialogActions>
</Dialog>
```

#### **1.2 Emergency Contact & Insurance Display**
```javascript
// Add to PatientDetailPage.js in the tabs section
const TabPanel = ({ children, value, index }) => (
  <div hidden={value !== index}>
    {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
  </div>
);

// Add Emergency Contact tab
<TabPanel value={activeTab} index={2}>
  <Grid container spacing={3}>
    <Grid item xs={12} md={6}>
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Emergency Contact
          </Typography>
          {patient.emergency_contact ? (
            <List>
              <ListItem>
                <ListItemIcon><PersonIcon /></ListItemIcon>
                <ListItemText 
                  primary={patient.emergency_contact.name}
                  secondary={patient.emergency_contact.relationship}
                />
              </ListItem>
              <ListItem>
                <ListItemIcon><PhoneIcon /></ListItemIcon>
                <ListItemText primary={patient.emergency_contact.phone} />
              </ListItem>
            </List>
          ) : (
            <Typography color="text.secondary">No emergency contact information</Typography>
          )}
        </CardContent>
      </Card>
    </Grid>
    <Grid item xs={12} md={6}>
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Insurance Information
          </Typography>
          {patient.insurance ? (
            <List>
              <ListItem>
                <ListItemIcon><BusinessIcon /></ListItemIcon>
                <ListItemText 
                  primary={patient.insurance.provider}
                  secondary="Insurance Provider"
                />
              </ListItem>
              <ListItem>
                <ListItemIcon><ConfirmationNumberIcon /></ListItemIcon>
                <ListItemText 
                  primary={patient.insurance.policy_number}
                  secondary="Policy Number"
                />
              </ListItem>
              <ListItem>
                <ListItemIcon><GroupIcon /></ListItemIcon>
                <ListItemText 
                  primary={patient.insurance.group_number}
                  secondary="Group Number"
                />
              </ListItem>
            </List>
          ) : (
            <Typography color="text.secondary">No insurance information</Typography>
          )}
        </CardContent>
      </Card>
    </Grid>
  </Grid>
</TabPanel>
```

### **Phase 2: File Upload System Architecture (Week 3-4)**

#### **2.1 Database Schema Enhancement**
```sql
-- File attachments table
CREATE TABLE file_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    medical_record_id UUID NOT NULL REFERENCES medical_records(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    file_name VARCHAR(255) NOT NULL,
    file_type VARCHAR(100) NOT NULL,
    file_size BIGINT NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    file_data BYTEA, -- For small files (<1MB)
    file_path TEXT, -- For large files stored externally
    upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    uploaded_by UUID NOT NULL REFERENCES users(id),
    metadata JSONB, -- Additional file metadata
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Full-text search index for file contents (if storing text extracts)
CREATE INDEX idx_file_attachments_search ON file_attachments 
USING GIN (to_tsvector('english', file_name || ' ' || COALESCE(metadata->>'description', '')));

-- Performance indexes
CREATE INDEX idx_file_attachments_medical_record ON file_attachments(medical_record_id);
CREATE INDEX idx_file_attachments_patient ON file_attachments(patient_id);
CREATE INDEX idx_file_attachments_type ON file_attachments(file_type);
```

#### **2.2 Backend File Upload Implementation**
```javascript
// services/patient-api/src/routes/files.js
const express = require('express');
const multer = require('multer');
const router = express.Router();
const FileAttachment = require('../models/FileAttachment');

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow common medical file types
    const allowedTypes = [
      'image/jpeg', 'image/png', 'image/gif',
      'application/pdf', 'text/plain',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('File type not allowed'), false);
    }
  }
});

// Upload files to medical record
router.post('/medical-records/:recordId/files', 
  authorize(['doctor', 'nurse', 'admin']),
  upload.array('files', 10), // Allow up to 10 files
  async (req, res) => {
    try {
      const { recordId } = req.params;
      const files = req.files;
      
      const fileAttachments = [];
      
      for (const file of files) {
        const attachment = await FileAttachment.create({
          medical_record_id: recordId,
          patient_id: req.body.patient_id,
          file_name: file.originalname,
          file_type: file.mimetype,
          file_size: file.size,
          mime_type: file.mimetype,
          file_data: file.buffer, // Store in BYTEA for small files
          uploaded_by: req.user.id,
          metadata: {
            description: req.body.description || '',
            upload_timestamp: new Date().toISOString()
          }
        });
        
        fileAttachments.push(attachment);
      }
      
      res.status(201).json({
        data: fileAttachments,
        message: 'Files uploaded successfully'
      });
    } catch (error) {
      logger.error('File upload error:', error);
      res.status(500).json({
        error: 'Failed to upload files',
        message: error.message
      });
    }
  }
);

// Get files for medical record
router.get('/medical-records/:recordId/files',
  authorize(['doctor', 'nurse', 'admin']),
  async (req, res) => {
    try {
      const { recordId } = req.params;
      
      const files = await FileAttachment.findByRecordId(recordId);
      
      res.json({
        data: files,
        message: 'Files retrieved successfully'
      });
    } catch (error) {
      logger.error('File retrieval error:', error);
      res.status(500).json({
        error: 'Failed to retrieve files',
        message: error.message
      });
    }
  }
);

// Download specific file
router.get('/files/:fileId/download',
  authorize(['doctor', 'nurse', 'admin']),
  async (req, res) => {
    try {
      const { fileId } = req.params;
      
      const file = await FileAttachment.findById(fileId);
      
      if (!file) {
        return res.status(404).json({ error: 'File not found' });
      }
      
      res.setHeader('Content-Type', file.mime_type);
      res.setHeader('Content-Disposition', `attachment; filename="${file.file_name}"`);
      res.send(file.file_data);
    } catch (error) {
      logger.error('File download error:', error);
      res.status(500).json({
        error: 'Failed to download file',
        message: error.message
      });
    }
  }
);

module.exports = router;
```

#### **2.3 Frontend File Upload Component**
```javascript
// web-app/src/components/FileUpload.js
import React, { useState, useCallback } from 'react';
import {
  Box,
  Button,
  Typography,
  Card,
  CardContent,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  IconButton,
  LinearProgress,
  Alert,
  Chip
} from '@mui/material';
import {
  CloudUpload as UploadIcon,
  Description as FileIcon,
  Delete as DeleteIcon,
  Download as DownloadIcon
} from '@mui/icons-material';
import { useDropzone } from 'react-dropzone';
import { apiService } from '../services/api';

const FileUpload = ({ recordId, patientId, onFilesUploaded }) => {
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  const onDrop = useCallback((acceptedFiles) => {
    setFiles(prev => [...prev, ...acceptedFiles]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.gif'],
      'application/pdf': ['.pdf'],
      'text/plain': ['.txt'],
      'application/msword': ['.doc'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx']
    },
    maxSize: 50 * 1024 * 1024, // 50MB
    multiple: true
  });

  const handleUpload = async () => {
    if (files.length === 0) return;

    try {
      setUploading(true);
      setError(null);
      setUploadProgress(0);

      const formData = new FormData();
      files.forEach(file => {
        formData.append('files', file);
      });
      formData.append('patient_id', patientId);

      const response = await apiService.files.upload(recordId, formData, {
        onUploadProgress: (progressEvent) => {
          const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setUploadProgress(progress);
        }
      });

      setFiles([]);
      setUploadProgress(0);
      onFilesUploaded(response.data);
    } catch (error) {
      setError('Failed to upload files. Please try again.');
      console.error('Upload error:', error);
    } finally {
      setUploading(false);
    }
  };

  const removeFile = (index) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          File Attachments
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Box
          {...getRootProps()}
          sx={{
            border: '2px dashed',
            borderColor: isDragActive ? 'primary.main' : 'grey.300',
            borderRadius: 2,
            p: 3,
            textAlign: 'center',
            cursor: 'pointer',
            mb: 2,
            '&:hover': {
              borderColor: 'primary.main'
            }
          }}
        >
          <input {...getInputProps()} />
          <UploadIcon sx={{ fontSize: 48, color: 'grey.400', mb: 1 }} />
          <Typography variant="body1" gutterBottom>
            {isDragActive ? 'Drop files here' : 'Drag & drop files here or click to select'}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Supported: PDF, Images, Word documents, Text files (Max 50MB each)
          </Typography>
        </Box>

        {files.length > 0 && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle2" gutterBottom>
              Selected Files:
            </Typography>
            <List dense>
              {files.map((file, index) => (
                <ListItem key={index} sx={{ px: 0 }}>
                  <ListItemIcon>
                    <FileIcon />
                  </ListItemIcon>
                  <ListItemText 
                    primary={file.name}
                    secondary={formatFileSize(file.size)}
                  />
                  <IconButton 
                    onClick={() => removeFile(index)}
                    size="small"
                    color="error"
                  >
                    <DeleteIcon />
                  </IconButton>
                </ListItem>
              ))}
            </List>
          </Box>
        )}

        {uploading && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="body2" gutterBottom>
              Uploading... {uploadProgress}%
            </Typography>
            <LinearProgress variant="determinate" value={uploadProgress} />
          </Box>
        )}

        <Button
          variant="contained"
          startIcon={<UploadIcon />}
          onClick={handleUpload}
          disabled={files.length === 0 || uploading}
          fullWidth
        >
          {uploading ? 'Uploading...' : `Upload ${files.length} file(s)`}
        </Button>
      </CardContent>
    </Card>
  );
};

export default FileUpload;
```

### **Phase 3: Record Type Specialization (Week 5-6)**

#### **3.1 Specialized Record Forms**
```javascript
// web-app/src/components/recordForms/ConsultationForm.js
const ConsultationForm = ({ formData, onChange, errors }) => (
  <Grid container spacing={3}>
    <Grid item xs={12}>
      <TextField
        name="chief_complaint"
        label="Chief Complaint"
        value={formData.chief_complaint || ''}
        onChange={onChange}
        error={!!errors.chief_complaint}
        helperText={errors.chief_complaint}
        multiline
        rows={2}
        fullWidth
        required
      />
    </Grid>
    <Grid item xs={12} md={6}>
      <TextField
        name="history_present_illness"
        label="History of Present Illness"
        value={formData.history_present_illness || ''}
        onChange={onChange}
        multiline
        rows={3}
        fullWidth
      />
    </Grid>
    <Grid item xs={12} md={6}>
      <TextField
        name="past_medical_history"
        label="Past Medical History"
        value={formData.past_medical_history || ''}
        onChange={onChange}
        multiline
        rows={3}
        fullWidth
      />
    </Grid>
    <Grid item xs={12} md={6}>
      <TextField
        name="assessment"
        label="Assessment"
        value={formData.assessment || ''}
        onChange={onChange}
        multiline
        rows={3}
        fullWidth
        required
      />
    </Grid>
    <Grid item xs={12} md={6}>
      <TextField
        name="plan"
        label="Treatment Plan"
        value={formData.plan || ''}
        onChange={onChange}
        multiline
        rows={3}
        fullWidth
        required
      />
    </Grid>
  </Grid>
);

// web-app/src/components/recordForms/LabResultForm.js
const LabResultForm = ({ formData, onChange, errors }) => (
  <Grid container spacing={3}>
    <Grid item xs={12} md={6}>
      <TextField
        name="lab_name"
        label="Laboratory Name"
        value={formData.lab_name || ''}
        onChange={onChange}
        error={!!errors.lab_name}
        helperText={errors.lab_name}
        fullWidth
        required
      />
    </Grid>
    <Grid item xs={12} md={6}>
      <TextField
        name="test_type"
        label="Test Type"
        value={formData.test_type || ''}
        onChange={onChange}
        error={!!errors.test_type}
        helperText={errors.test_type}
        fullWidth
        required
      />
    </Grid>
    <Grid item xs={12} md={6}>
      <TextField
        name="specimen_type"
        label="Specimen Type"
        value={formData.specimen_type || ''}
        onChange={onChange}
        fullWidth
      />
    </Grid>
    <Grid item xs={12} md={6}>
      <TextField
        name="collection_date"
        label="Collection Date"
        type="date"
        value={formData.collection_date || ''}
        onChange={onChange}
        fullWidth
        InputLabelProps={{ shrink: true }}
      />
    </Grid>
    <Grid item xs={12}>
      <TextField
        name="results"
        label="Results"
        value={formData.results || ''}
        onChange={onChange}
        error={!!errors.results}
        helperText={errors.results}
        multiline
        rows={4}
        fullWidth
        required
      />
    </Grid>
    <Grid item xs={12} md={6}>
      <TextField
        name="reference_range"
        label="Reference Range"
        value={formData.reference_range || ''}
        onChange={onChange}
        fullWidth
      />
    </Grid>
    <Grid item xs={12} md={6}>
      <FormControl fullWidth>
        <InputLabel>Status</InputLabel>
        <Select
          name="status"
          value={formData.status || 'normal'}
          onChange={onChange}
        >
          <MenuItem value="normal">Normal</MenuItem>
          <MenuItem value="abnormal">Abnormal</MenuItem>
          <MenuItem value="critical">Critical</MenuItem>
          <MenuItem value="pending">Pending</MenuItem>
        </Select>
      </FormControl>
    </Grid>
  </Grid>
);

// web-app/src/components/recordForms/PrescriptionForm.js
const PrescriptionForm = ({ formData, onChange, errors }) => (
  <Grid container spacing={3}>
    <Grid item xs={12} md={6}>
      <TextField
        name="medication_name"
        label="Medication Name"
        value={formData.medication_name || ''}
        onChange={onChange}
        error={!!errors.medication_name}
        helperText={errors.medication_name}
        fullWidth
        required
      />
    </Grid>
    <Grid item xs={12} md={6}>
      <TextField
        name="dosage"
        label="Dosage"
        value={formData.dosage || ''}
        onChange={onChange}
        error={!!errors.dosage}
        helperText={errors.dosage}
        fullWidth
        required
      />
    </Grid>
    <Grid item xs={12} md={6}>
      <TextField
        name="frequency"
        label="Frequency"
        value={formData.frequency || ''}
        onChange={onChange}
        fullWidth
        required
        placeholder="e.g., Twice daily, Every 8 hours"
      />
    </Grid>
    <Grid item xs={12} md={6}>
      <TextField
        name="duration"
        label="Duration"
        value={formData.duration || ''}
        onChange={onChange}
        fullWidth
        placeholder="e.g., 7 days, 2 weeks"
      />
    </Grid>
    <Grid item xs={12} md={6}>
      <TextField
        name="quantity"
        label="Quantity"
        type="number"
        value={formData.quantity || ''}
        onChange={onChange}
        fullWidth
      />
    </Grid>
    <Grid item xs={12} md={6}>
      <TextField
        name="refills"
        label="Refills"
        type="number"
        value={formData.refills || '0'}
        onChange={onChange}
        fullWidth
        inputProps={{ min: 0, max: 10 }}
      />
    </Grid>
    <Grid item xs={12}>
      <TextField
        name="instructions"
        label="Instructions for Use"
        value={formData.instructions || ''}
        onChange={onChange}
        multiline
        rows={3}
        fullWidth
        placeholder="e.g., Take with food, Avoid alcohol"
      />
    </Grid>
  </Grid>
);
```

#### **3.2 Dynamic Form Rendering**
```javascript
// In CreateRecordPage.js
import ConsultationForm from '../components/recordForms/ConsultationForm';
import LabResultForm from '../components/recordForms/LabResultForm';
import PrescriptionForm from '../components/recordForms/PrescriptionForm';
import ImagingForm from '../components/recordForms/ImagingForm';
import GenericRecordForm from '../components/recordForms/GenericRecordForm';

const getRecordTypeForm = (recordType) => {
  switch (recordType) {
    case 'consultation':
      return <ConsultationForm formData={formData} onChange={handleInputChange} errors={errors} />;
    case 'lab_result':
      return <LabResultForm formData={formData} onChange={handleInputChange} errors={errors} />;
    case 'prescription':
      return <PrescriptionForm formData={formData} onChange={handleInputChange} errors={errors} />;
    case 'imaging':
      return <ImagingForm formData={formData} onChange={handleInputChange} errors={errors} />;
    case 'surgery':
      return <SurgeryForm formData={formData} onChange={handleInputChange} errors={errors} />;
    case 'vaccination':
      return <VaccinationForm formData={formData} onChange={handleInputChange} errors={errors} />;
    default:
      return <GenericRecordForm formData={formData} onChange={handleInputChange} errors={errors} />;
  }
};

// Add this to the form section
<Card>
  <CardContent>
    <Typography variant="h6" gutterBottom>
      {formData.record_type ? `${formData.record_type.replace('_', ' ').toUpperCase()} Details` : 'Record Details'}
    </Typography>
    
    {/* Show specialized form based on record type */}
    {formData.record_type && getRecordTypeForm(formData.record_type)}
    
    {/* Common fields for all record types */}
    <Box sx={{ mt: 3 }}>
      <Typography variant="subtitle1" gutterBottom>
        Additional Information
      </Typography>
      <Grid container spacing={3}>
        <Grid item xs={12}>
          <TextField
            name="notes"
            label="Additional Notes"
            value={formData.notes}
            onChange={handleInputChange}
            multiline
            rows={3}
            fullWidth
          />
        </Grid>
        <Grid item xs={12} md={6}>
          <TextField
            name="follow_up_date"
            label="Follow-up Date"
            type="date"
            value={formData.follow_up_date}
            onChange={handleInputChange}
            fullWidth
            InputLabelProps={{ shrink: true }}
          />
        </Grid>
      </Grid>
    </Box>
  </CardContent>
</Card>
```

### **Phase 4: Advanced Settings Page (Week 7-8)**

#### **4.1 Comprehensive Settings Page Implementation**
```javascript
// web-app/src/pages/SettingsPage.js
import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Switch,
  FormControlLabel,
  Button,
  Divider,
  Alert,
  Tabs,
  Tab,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions
} from '@mui/material';
import {
  Settings as SettingsIcon,
  Security as SecurityIcon,
  Notifications as NotificationsIcon,
  Storage as StorageIcon,
  People as PeopleIcon,
  Edit as EditIcon,
  Add as AddIcon,
  Delete as DeleteIcon
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import { apiService } from '../services/api';

const SettingsPage = () => {
  const { hasRole } = useAuth();
  const [activeTab, setActiveTab] = useState(0);
  const [settings, setSettings] = useState({
    system: {
      timezone: 'UTC',
      date_format: 'MM/DD/YYYY',
      time_format: '12',
      language: 'en',
      default_records_per_page: 25,
      enable_notifications: true,
      enable_audit_logging: true
    },
    security: {
      session_timeout: 30,
      password_expiry: 90,
      failed_login_attempts: 5,
      require_2fa: false,
      password_complexity: 'medium',
      enable_ip_restrictions: false
    },
    audit: {
      log_retention_days: 365,
      audit_level: 'detailed',
      log_successful_logins: true,
      log_failed_logins: true,
      log_data_access: true,
      log_data_changes: true
    },
    backup: {
      auto_backup_enabled: true,
      backup_frequency: 'daily',
      backup_retention_days: 30,
      backup_location: 'local'
    }
  });
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [users, setUsers] = useState([]);
  const [userDialogOpen, setUserDialogOpen] = useState(false);

  useEffect(() => {
    fetchSettings();
    if (hasRole('admin')) {
      fetchUsers();
    }
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const response = await apiService.settings.get();
      setSettings(response.data);
    } catch (error) {
      setError('Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const response = await apiService.users.getAll();
      setUsers(response.data);
    } catch (error) {
      console.error('Failed to load users:', error);
    }
  };

  const handleSettingChange = (category, field, value) => {
    setSettings(prev => ({
      ...prev,
      [category]: {
        ...prev[category],
        [field]: value
      }
    }));
  };

  const handleSaveSettings = async () => {
    try {
      setLoading(true);
      setError(null);
      
      await apiService.settings.update(settings);
      setSuccess('Settings saved successfully!');
      
      setTimeout(() => setSuccess(null), 3000);
    } catch (error) {
      setError('Failed to save settings. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const TabPanel = ({ children, value, index }) => (
    <div hidden={value !== index}>
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );

  if (!hasRole('admin')) {
    return (
      <Box>
        <Typography variant="h4" gutterBottom>
          Settings
        </Typography>
        <Alert severity="warning">
          You don't have permission to access system settings.
        </Alert>
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        System Settings
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {success && (
        <Alert severity="success" sx={{ mb: 2 }}>
          {success}
        </Alert>
      )}

      <Card>
        <Tabs value={activeTab} onChange={(e, newValue) => setActiveTab(newValue)}>
          <Tab icon={<SettingsIcon />} label="General" />
          <Tab icon={<SecurityIcon />} label="Security" />
          <Tab icon={<NotificationsIcon />} label="Audit & Logging" />
          <Tab icon={<StorageIcon />} label="Backup" />
          <Tab icon={<PeopleIcon />} label="Users" />
        </Tabs>

        <TabPanel value={activeTab} index={0}>
          <Typography variant="h6" gutterBottom>
            General Settings
          </Typography>
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <FormControl fullWidth>
                <InputLabel>Timezone</InputLabel>
                <Select
                  value={settings.system.timezone}
                  onChange={(e) => handleSettingChange('system', 'timezone', e.target.value)}
                >
                  <MenuItem value="UTC">UTC</MenuItem>
                  <MenuItem value="America/New_York">Eastern Time</MenuItem>
                  <MenuItem value="America/Chicago">Central Time</MenuItem>
                  <MenuItem value="America/Denver">Mountain Time</MenuItem>
                  <MenuItem value="America/Los_Angeles">Pacific Time</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={6}>
              <FormControl fullWidth>
                <InputLabel>Date Format</InputLabel>
                <Select
                  value={settings.system.date_format}
                  onChange={(e) => handleSettingChange('system', 'date_format', e.target.value)}
                >
                  <MenuItem value="MM/DD/YYYY">MM/DD/YYYY</MenuItem>
                  <MenuItem value="DD/MM/YYYY">DD/MM/YYYY</MenuItem>
                  <MenuItem value="YYYY-MM-DD">YYYY-MM-DD</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={6}>
              <FormControl fullWidth>
                <InputLabel>Time Format</InputLabel>
                <Select
                  value={settings.system.time_format}
                  onChange={(e) => handleSettingChange('system', 'time_format', e.target.value)}
                >
                  <MenuItem value="12">12 Hour</MenuItem>
                  <MenuItem value="24">24 Hour</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                label="Default Records Per Page"
                type="number"
                value={settings.system.default_records_per_page}
                onChange={(e) => handleSettingChange('system', 'default_records_per_page', parseInt(e.target.value))}
                fullWidth
                inputProps={{ min: 10, max: 100 }}
              />
            </Grid>
            <Grid item xs={12}>
              <FormControlLabel
                control={
                  <Switch
                    checked={settings.system.enable_notifications}
                    onChange={(e) => handleSettingChange('system', 'enable_notifications', e.target.checked)}
                  />
                }
                label="Enable System Notifications"
              />
            </Grid>
          </Grid>
        </TabPanel>

        <TabPanel value={activeTab} index={1}>
          <Typography variant="h6" gutterBottom>
            Security Settings
          </Typography>
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <TextField
                label="Session Timeout (minutes)"
                type="number"
                value={settings.security.session_timeout}
                onChange={(e) => handleSettingChange('security', 'session_timeout', parseInt(e.target.value))}
                fullWidth
                inputProps={{ min: 5, max: 480 }}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                label="Password Expiry (days)"
                type="number"
                value={settings.security.password_expiry}
                onChange={(e) => handleSettingChange('security', 'password_expiry', parseInt(e.target.value))}
                fullWidth
                inputProps={{ min: 30, max: 365 }}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                label="Max Failed Login Attempts"
                type="number"
                value={settings.security.failed_login_attempts}
                onChange={(e) => handleSettingChange('security', 'failed_login_attempts', parseInt(e.target.value))}
                fullWidth
                inputProps={{ min: 3, max: 10 }}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <FormControl fullWidth>
                <InputLabel>Password Complexity</InputLabel>
                <Select
                  value={settings.security.password_complexity}
                  onChange={(e) => handleSettingChange('security', 'password_complexity', e.target.value)}
                >
                  <MenuItem value="low">Low</MenuItem>
                  <MenuItem value="medium">Medium</MenuItem>
                  <MenuItem value="high">High</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12}>
              <FormControlLabel
                control={
                  <Switch
                    checked={settings.security.require_2fa}
                    onChange={(e) => handleSettingChange('security', 'require_2fa', e.target.checked)}
                  />
                }
                label="Require Two-Factor Authentication"
              />
            </Grid>
            <Grid item xs={12}>
              <FormControlLabel
                control={
                  <Switch
                    checked={settings.security.enable_ip_restrictions}
                    onChange={(e) => handleSettingChange('security', 'enable_ip_restrictions', e.target.checked)}
                  />
                }
                label="Enable IP Address Restrictions"
              />
            </Grid>
          </Grid>
        </TabPanel>

        <TabPanel value={activeTab} index={2}>
          <Typography variant="h6" gutterBottom>
            Audit & Logging Settings
          </Typography>
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <TextField
                label="Log Retention (days)"
                type="number"
                value={settings.audit.log_retention_days}
                onChange={(e) => handleSettingChange('audit', 'log_retention_days', parseInt(e.target.value))}
                fullWidth
                inputProps={{ min: 30, max: 2555 }}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <FormControl fullWidth>
                <InputLabel>Audit Level</InputLabel>
                <Select
                  value={settings.audit.audit_level}
                  onChange={(e) => handleSettingChange('audit', 'audit_level', e.target.value)}
                >
                  <MenuItem value="basic">Basic</MenuItem>
                  <MenuItem value="detailed">Detailed</MenuItem>
                  <MenuItem value="comprehensive">Comprehensive</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12}>
              <Typography variant="subtitle2" gutterBottom>
                Logging Options
              </Typography>
              <FormControlLabel
                control={
                  <Switch
                    checked={settings.audit.log_successful_logins}
                    onChange={(e) => handleSettingChange('audit', 'log_successful_logins', e.target.checked)}
                  />
                }
                label="Log Successful Logins"
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={settings.audit.log_failed_logins}
                    onChange={(e) => handleSettingChange('audit', 'log_failed_logins', e.target.checked)}
                  />
                }
                label="Log Failed Logins"
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={settings.audit.log_data_access}
                    onChange={(e) => handleSettingChange('audit', 'log_data_access', e.target.checked)}
                  />
                }
                label="Log Data Access"
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={settings.audit.log_data_changes}
                    onChange={(e) => handleSettingChange('audit', 'log_data_changes', e.target.checked)}
                  />
                }
                label="Log Data Changes"
              />
            </Grid>
          </Grid>
        </TabPanel>

        <TabPanel value={activeTab} index={3}>
          <Typography variant="h6" gutterBottom>
            Backup Settings
          </Typography>
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <FormControlLabel
                control={
                  <Switch
                    checked={settings.backup.auto_backup_enabled}
                    onChange={(e) => handleSettingChange('backup', 'auto_backup_enabled', e.target.checked)}
                  />
                }
                label="Enable Automatic Backups"
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <FormControl fullWidth>
                <InputLabel>Backup Frequency</InputLabel>
                <Select
                  value={settings.backup.backup_frequency}
                  onChange={(e) => handleSettingChange('backup', 'backup_frequency', e.target.value)}
                  disabled={!settings.backup.auto_backup_enabled}
                >
                  <MenuItem value="hourly">Hourly</MenuItem>
                  <MenuItem value="daily">Daily</MenuItem>
                  <MenuItem value="weekly">Weekly</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                label="Backup Retention (days)"
                type="number"
                value={settings.backup.backup_retention_days}
                onChange={(e) => handleSettingChange('backup', 'backup_retention_days', parseInt(e.target.value))}
                fullWidth
                inputProps={{ min: 1, max: 365 }}
                disabled={!settings.backup.auto_backup_enabled}
              />
            </Grid>
            <Grid item xs={12}>
              <Button
                variant="outlined"
                onClick={() => {/* Implement manual backup */}}
                disabled={loading}
              >
                Create Manual Backup
              </Button>
            </Grid>
          </Grid>
        </TabPanel>

        <TabPanel value={activeTab} index={4}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6">
              User Management
            </Typography>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => setUserDialogOpen(true)}
            >
              Add User
            </Button>
          </Box>
          
          <List>
            {users.map((user) => (
              <ListItem key={user.id} divider>
                <ListItemText
                  primary={user.full_name}
                  secondary={`${user.email} • ${user.role}`}
                />
                <ListItemSecondaryAction>
                  <IconButton onClick={() => {/* Edit user */}}>
                    <EditIcon />
                  </IconButton>
                  <IconButton onClick={() => {/* Delete user */}} color="error">
                    <DeleteIcon />
                  </IconButton>
                </ListItemSecondaryAction>
              </ListItem>
            ))}
          </List>
        </TabPanel>

        <Divider />
        
        <Box sx={{ p: 2, display: 'flex', justifyContent: 'flex-end' }}>
          <Button
            variant="contained"
            onClick={handleSaveSettings}
            disabled={loading}
          >
            {loading ? 'Saving...' : 'Save Settings'}
          </Button>
        </Box>
      </Card>
    </Box>
  );
};

export default SettingsPage;
```

---

## 🗄️ **PostgreSQL Unstructured Data Strategy**

### **1. Enhanced Schema for Unstructured Data**
```sql
-- Enhanced medical_records table with unstructured data support
ALTER TABLE medical_records ADD COLUMN IF NOT EXISTS unstructured_data JSONB;
ALTER TABLE medical_records ADD COLUMN IF NOT EXISTS full_text_content TEXT;
ALTER TABLE medical_records ADD COLUMN IF NOT EXISTS extracted_text TEXT;

-- Full-text search indexes
CREATE INDEX idx_medical_records_fts ON medical_records 
USING GIN (to_tsvector('english', COALESCE(notes, '') || ' ' || COALESCE(diagnosis, '') || ' ' || COALESCE(extracted_text, '')));

-- JSONB indexes for unstructured data
CREATE INDEX idx_medical_records_unstructured ON medical_records USING GIN (unstructured_data);

-- Trigram extension for fuzzy search
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_medical_records_trigram ON medical_records 
USING GIN (notes gin_trgm_ops, diagnosis gin_trgm_ops);
```

### **2. File Storage Strategy**
```sql
-- Hybrid storage approach
CREATE TABLE medical_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    medical_record_id UUID NOT NULL REFERENCES medical_records(id),
    file_name VARCHAR(255) NOT NULL,
    file_type VARCHAR(100) NOT NULL,
    file_size BIGINT NOT NULL,
    
    -- Small files (<1MB) stored in BYTEA
    file_data BYTEA,
    
    -- Large files stored externally with path reference
    external_path TEXT,
    
    -- Extracted text content for search
    extracted_text TEXT,
    
    -- Metadata as JSONB
    metadata JSONB,
    
    -- Full-text search
    search_vector TSVECTOR GENERATED ALWAYS AS (
        to_tsvector('english', file_name || ' ' || COALESCE(extracted_text, ''))
    ) STORED,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_medical_files_search ON medical_files USING GIN (search_vector);
CREATE INDEX idx_medical_files_record ON medical_files(medical_record_id);
CREATE INDEX idx_medical_files_metadata ON medical_files USING GIN (metadata);
```

### **3. Advanced Search Implementation**
```javascript
// Advanced search with full-text and fuzzy matching
const searchMedicalRecords = async (query, options = {}) => {
  const {
    fuzzy = false,
    recordTypes = [],
    dateRange = {},
    patientId = null
  } = options;
  
  let searchQuery = `
    SELECT mr.*, p.first_name, p.last_name,
           ts_rank(to_tsvector('english', mr.notes || ' ' || mr.diagnosis), query) as relevance
    FROM medical_records mr
    JOIN patients p ON mr.patient_id = p.id
    WHERE 1=1
  `;
  
  const params = [];
  
  if (query) {
    if (fuzzy) {
      // Fuzzy search using trigrams
      searchQuery += ` AND (mr.notes % $${params.length + 1} OR mr.diagnosis % $${params.length + 1})`;
      params.push(query);
    } else {
      // Full-text search
      searchQuery += ` AND to_tsvector('english', mr.notes || ' ' || mr.diagnosis) @@ plainto_tsquery('english', $${params.length + 1})`;
      params.push(query);
    }
  }
  
  if (recordTypes.length > 0) {
    searchQuery += ` AND mr.record_type = ANY($${params.length + 1})`;
    params.push(recordTypes);
  }
  
  if (patientId) {
    searchQuery += ` AND mr.patient_id = $${params.length + 1}`;
    params.push(patientId);
  }
  
  searchQuery += ` ORDER BY relevance DESC, mr.record_date DESC`;
  
  const result = await db.query(searchQuery, params);
  return result.rows;
};
```

### **4. File Processing Pipeline**
```javascript
// File processing with text extraction
const processUploadedFile = async (fileBuffer, fileName, mimeType) => {
  let extractedText = '';
  
  try {
    switch (mimeType) {
      case 'application/pdf':
        extractedText = await extractTextFromPDF(fileBuffer);
        break;
      case 'image/jpeg':
      case 'image/png':
        extractedText = await extractTextFromImage(fileBuffer); // OCR
        break;
      case 'text/plain':
        extractedText = fileBuffer.toString('utf-8');
        break;
      default:
        extractedText = '';
    }
    
    return {
      file_data: fileBuffer,
      extracted_text: extractedText,
      metadata: {
        processed_at: new Date().toISOString(),
        text_extracted: extractedText.length > 0,
        file_type: mimeType
      }
    };
  } catch (error) {
    logger.error('File processing error:', error);
    return {
      file_data: fileBuffer,
      extracted_text: '',
      metadata: {
        processed_at: new Date().toISOString(),
        processing_error: error.message
      }
    };
  }
};
```

### **5. Performance Optimization**
```sql
-- Regular maintenance for performance
-- Run these as scheduled jobs

-- Update statistics
ANALYZE medical_records;
ANALYZE medical_files;

-- Vacuum to reclaim space
VACUUM ANALYZE medical_records;
VACUUM ANALYZE medical_files;

-- Update full-text search vectors
UPDATE medical_records SET 
  full_text_content = to_tsvector('english', 
    COALESCE(notes, '') || ' ' || 
    COALESCE(diagnosis, '') || ' ' || 
    COALESCE(extracted_text, '')
  )
WHERE full_text_content IS NULL;
```

---

## 📊 **Implementation Timeline**

| Phase | Duration | Priority | Features |
|-------|----------|----------|----------|
| **Phase 1** | 2 weeks | High | Patient deletion, emergency contact display, basic settings |
| **Phase 2** | 2 weeks | High | File upload system, database schema |
| **Phase 3** | 2 weeks | Medium | Record type specialization, advanced forms |
| **Phase 4** | 2 weeks | Medium | Complete settings page, advanced search |

## 🎯 **Success Metrics**

- **User Experience**: Reduced clicks to access patient information
- **Data Management**: Improved file attachment rates
- **System Administration**: Enhanced configuration capabilities
- **Search Performance**: Faster and more accurate medical record searches
- **Compliance**: Better audit trails and data governance

## 🔧 **Technical Considerations**

### **Security**
- All file uploads must be scanned for malware
- HIPAA-compliant audit logging for all file operations
- Role-based access control for file downloads
- Encryption at rest for sensitive files

### **Performance**
- Implement file size limits and compression
- Use CDN for static file serving
- Database connection pooling for file operations
- Async processing for large file uploads

### **Scalability**
- Consider external file storage (S3, MinIO) for large files
- Implement file archiving for old records
- Database partitioning for large datasets
- Load balancing for file operations

---

## 📝 **Next Steps**

1. **Start with Phase 1** - Address the immediate UI/UX issues
2. **Implement file upload system** - Critical for medical document management
3. **Enhance database schema** - Add unstructured data support
4. **Test thoroughly** - Ensure all new features work with existing data

Your PostgreSQL strategy is excellent for healthcare data management. The combination of BYTEA for small files, external storage for large files, and full-text search with JSONB will provide excellent performance and flexibility for managing diverse medical data types.

**Recommendation**: Begin with patient deletion functionality and emergency contact display as these are quick wins that will immediately improve user experience, then proceed with the file upload system implementation. 