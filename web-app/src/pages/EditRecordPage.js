import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  Paper,
  TextField,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  Card,
  CardContent,
  Avatar,
  Chip
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  Save as SaveIcon,
  Description as DescriptionIcon,
  Person as PersonIcon
} from '@mui/icons-material';
import { useParams, useNavigate } from '../routerCompat';
import apiService from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import LoadingSpinner from '../components/common/LoadingSpinner';
import FileUpload from '../components/common/FileUpload';
import FilePreview from '../components/common/FilePreview';

const EditRecordPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  
  const [formData, setFormData] = useState({
    patient_id: '',
    record_type: '',
    record_date: '',
    provider_name: '',
    notes: '',
    diagnosis: '',
    treatment_plan: '',
    medications: '',
    lab_results: '',
    vital_signs: {
      blood_pressure: '',
      heart_rate: '',
      temperature: '',
      weight: '',
      height: ''
    },
    follow_up_date: ''
  });
  
  const [originalData, setOriginalData] = useState(null);
  const [patient, setPatient] = useState(null);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  // Record types
  const recordTypes = [
    { value: 'consultation', label: 'Consultation' },
    { value: 'diagnosis', label: 'Diagnosis' },
    { value: 'treatment', label: 'Treatment' },
    { value: 'lab_result', label: 'Lab Result' },
    { value: 'imaging', label: 'Imaging' },
    { value: 'prescription', label: 'Prescription' },
    { value: 'vaccination', label: 'Vaccination' },
    { value: 'surgery', label: 'Surgery' },
    { value: 'emergency', label: 'Emergency' },
    { value: 'discharge', label: 'Discharge' },
    { value: 'referral', label: 'Referral' },
    { value: 'other', label: 'Other' }
  ];

  // Check permissions
  const hasEditPermission = hasRole('doctor') || hasRole('nurse') || hasRole('admin');

  const fetchRecordData = useCallback(async () => {
    try {
      setLoading(true);
      const recordResponse = await apiService.medicalRecords.getById(id);
      const record = recordResponse.data;
      
      // Transform record data to match form structure
      const transformedData = {
        patient_id: record.patient_id || '',
        record_type: record.record_type || '',
        record_date: record.record_date ? record.record_date.split('T')[0] : '',
        provider_name: record.provider_name || '',
        notes: record.notes || '',
        diagnosis: record.diagnosis || '',
        treatment_plan: record.treatment_plan || '',
        medications: record.medications || '',
        lab_results: record.lab_results || '',
        vital_signs: {
          blood_pressure: record.vital_signs?.blood_pressure || '',
          heart_rate: record.vital_signs?.heart_rate || '',
          temperature: record.vital_signs?.temperature || '',
          weight: record.vital_signs?.weight || '',
          height: record.vital_signs?.height || ''
        },
        follow_up_date: record.follow_up_date ? record.follow_up_date.split('T')[0] : ''
      };
      
      setFormData(transformedData);
      setOriginalData(transformedData);

      // Fetch patient details if we have a patient_id
      if (record.patient_id) {
        try {
          const patientResponse = await apiService.patients.getById(record.patient_id);
          setPatient(patientResponse.data);
        } catch (patientErr) {
          console.error('Error fetching patient data:', patientErr);
          // Don't fail completely if patient fetch fails
        }
      }
    } catch (err) {
      console.error('Error fetching record data:', err);
      setSubmitError('Failed to load medical record. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchRecordData();
  }, [fetchRecordData]);

  const handleInputChange = (field, value, section = null) => {
    if (section) {
      setFormData(prev => ({
        ...prev,
        [section]: {
          ...prev[section],
          [field]: value
        }
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [field]: value
      }));
    }
    
    // Clear error for this field
    const errorKey = section ? `${section}.${field}` : field;
    if (errors[errorKey]) {
      setErrors(prev => ({
        ...prev,
        [errorKey]: ''
      }));
    }
  };

  const validateForm = () => {
    const newErrors = {};

    // Required fields
    if (!formData.record_type) {
      newErrors['record_type'] = 'Record type is required';
    }
    if (!formData.record_date) {
      newErrors['record_date'] = 'Record date is required';
    }
    if (!formData.provider_name.trim()) {
      newErrors['provider_name'] = 'Provider name is required';
    }
    if (!formData.notes.trim()) {
      newErrors['notes'] = 'Notes are required';
    }

    // Date validation
    if (formData.record_date && new Date(formData.record_date) > new Date()) {
      newErrors['record_date'] = 'Record date cannot be in the future';
    }

    if (formData.follow_up_date && new Date(formData.follow_up_date) <= new Date()) {
      newErrors['follow_up_date'] = 'Follow-up date must be in the future';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const hasChanges = () => {
    if (!originalData) return false;
    return JSON.stringify(formData) !== JSON.stringify(originalData);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    if (!hasChanges()) {
      navigate(`/records/${id}`, {
        state: { message: 'No changes were made to the medical record.' }
      });
      return;
    }

    try {
      setSaving(true);
      setSubmitError(null);

      // Clean up the data before sending
      const cleanData = {
        ...formData,
        // Remove empty vital signs if none are provided
        vital_signs: Object.values(formData.vital_signs).some(v => v.trim()) 
          ? formData.vital_signs 
          : undefined,
        // Remove empty follow_up_date
        follow_up_date: formData.follow_up_date || undefined
      };

      await apiService.medicalRecords.update(id, cleanData);
      
      // Navigate back to record detail page
      navigate(`/records/${id}`, {
        replace: true,
        state: { message: 'Medical record updated successfully!' }
      });
    } catch (err) {
      console.error('Error updating medical record:', err);
      
      if (err.response?.data?.details) {
        // Handle validation errors from server
        const serverErrors = {};
        err.response.data.details.forEach(error => {
          serverErrors[error.field] = error.message;
        });
        setErrors(serverErrors);
      } else {
        setSubmitError(err.response?.data?.error || err.response?.data?.message || 'Failed to update medical record. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (hasChanges()) {
      if (window.confirm('You have unsaved changes. Are you sure you want to leave?')) {
        navigate(`/records/${id}`);
      }
    } else {
      navigate(`/records/${id}`);
    }
  };

  const calculateAge = (dateOfBirth) => {
    if (!dateOfBirth) return '';
    const today = new Date();
    const birthDate = new Date(dateOfBirth);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    
    return age;
  };

  const getRecordTypeColor = (type) => {
    const colors = {
      'consultation': 'primary',
      'diagnosis': 'secondary',
      'treatment': 'success',
      'lab_result': 'info',
      'imaging': 'warning',
      'prescription': 'error',
      'vaccination': 'success',
      'surgery': 'secondary',
      'emergency': 'error',
      'discharge': 'info',
      'referral': 'warning',
      'other': 'default'
    };
    return colors[type] || 'default';
  };

  if (loading) {
    return <LoadingSpinner message="Loading medical record..." />;
  }

  if (!hasEditPermission) {
    return (
      <Box>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate(`/records/${id}`)}
          variant="outlined"
          sx={{ mb: 2 }}
        >
          Back to Record
        </Button>
        <Alert severity="error">
          You don't have permission to edit medical records.
        </Alert>
      </Box>
    );
  }

  if (!originalData) {
    return (
      <Box>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate('/records')}
          variant="outlined"
          sx={{ mb: 2 }}
        >
          Back to Records
        </Button>
        <Alert severity="error">
          Medical record not found or failed to load record information.
        </Alert>
      </Box>
    );
  }

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Button
            startIcon={<ArrowBackIcon />}
            onClick={handleCancel}
            variant="outlined"
          >
            Back to Record
          </Button>
          <Typography variant="h4">
            Edit Medical Record
          </Typography>
        </Box>
        
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {originalData.record_type && (
            <Chip
              label={originalData.record_type.replace('_', ' ').toUpperCase()}
              color={getRecordTypeColor(originalData.record_type)}
              variant="outlined"
            />
          )}
          <Typography variant="body2" color="text.secondary">
            Record ID: {id}
          </Typography>
        </Box>
      </Box>

      {/* Error Alert */}
      {submitError && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setSubmitError(null)}>
          {submitError}
        </Alert>
      )}

      {/* Changes Alert */}
      {hasChanges() && (
        <Alert severity="info" sx={{ mb: 2 }}>
          You have unsaved changes. Remember to save your updates.
        </Alert>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit}>
        <Grid container spacing={3}>
          {/* Patient Information Display */}
          {patient && (
            <Grid item xs={12}>
              <Card>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                    <PersonIcon color="primary" />
                    <Typography variant="h6">Patient Information</Typography>
                  </Box>
                  
                  <Paper sx={{ p: 2, bgcolor: 'grey.50' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      <Avatar sx={{ width: 56, height: 56, bgcolor: 'primary.main' }}>
                        {patient.first_name?.[0]}{patient.last_name?.[0]}
                      </Avatar>
                      <Box>
                        <Typography variant="h6" fontWeight="bold">
                          {patient.full_name}
                        </Typography>
                        <Typography variant="body2" color="text.secondary" fontFamily="monospace">
                          ID: {patient.patient_id}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {patient.date_of_birth && `Age: ${calculateAge(patient.date_of_birth)} years`} | 
                          {patient.gender === 'M' ? ' Male' : patient.gender === 'F' ? ' Female' : ' Other'}
                        </Typography>
                      </Box>
                    </Box>
                  </Paper>
                </CardContent>
              </Card>
            </Grid>
          )}

          {/* Record Details */}
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                  <DescriptionIcon color="primary" />
                  <Typography variant="h6">Record Details</Typography>
                </Box>
                
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={6}>
                    <FormControl fullWidth error={!!errors.record_type} required>
                      <InputLabel>Record Type</InputLabel>
                      <Select
                        value={formData.record_type}
                        label="Record Type"
                        onChange={(e) => handleInputChange('record_type', e.target.value)}
                      >
                        {recordTypes.map(type => (
                          <MenuItem key={type.value} value={type.value}>
                            {type.label}
                          </MenuItem>
                        ))}
                      </Select>
                      {errors.record_type && (
                        <Typography variant="caption" color="error" sx={{ mt: 1, ml: 2 }}>
                          {errors.record_type}
                        </Typography>
                      )}
                    </FormControl>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Record Date"
                      type="date"
                      value={formData.record_date}
                      onChange={(e) => handleInputChange('record_date', e.target.value)}
                      error={!!errors.record_date}
                      helperText={errors.record_date}
                      InputLabelProps={{ shrink: true }}
                      required
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Provider Name"
                      value={formData.provider_name}
                      onChange={(e) => handleInputChange('provider_name', e.target.value)}
                      error={!!errors.provider_name}
                      helperText={errors.provider_name}
                      required
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Follow-up Date"
                      type="date"
                      value={formData.follow_up_date}
                      onChange={(e) => handleInputChange('follow_up_date', e.target.value)}
                      error={!!errors.follow_up_date}
                      helperText={errors.follow_up_date}
                      InputLabelProps={{ shrink: true }}
                    />
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          </Grid>

          {/* Clinical Information */}
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Clinical Information
                </Typography>
                
                <Grid container spacing={2}>
                  <Grid item xs={12}>
                    <TextField
                      fullWidth
                      label="Notes"
                      multiline
                      rows={4}
                      value={formData.notes}
                      onChange={(e) => handleInputChange('notes', e.target.value)}
                      error={!!errors.notes}
                      helperText={errors.notes || "Describe the patient's condition, symptoms, and observations"}
                      required
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Diagnosis"
                      multiline
                      rows={3}
                      value={formData.diagnosis}
                      onChange={(e) => handleInputChange('diagnosis', e.target.value)}
                      error={!!errors.diagnosis}
                      helperText={errors.diagnosis}
                      placeholder="Primary and secondary diagnoses"
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Treatment Plan"
                      multiline
                      rows={3}
                      value={formData.treatment_plan}
                      onChange={(e) => handleInputChange('treatment_plan', e.target.value)}
                      error={!!errors.treatment_plan}
                      helperText={errors.treatment_plan}
                      placeholder="Recommended treatment and interventions"
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Medications"
                      multiline
                      rows={3}
                      value={formData.medications}
                      onChange={(e) => handleInputChange('medications', e.target.value)}
                      error={!!errors.medications}
                      helperText={errors.medications}
                      placeholder="Prescribed medications and dosages"
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Lab Results"
                      multiline
                      rows={3}
                      value={formData.lab_results}
                      onChange={(e) => handleInputChange('lab_results', e.target.value)}
                      error={!!errors.lab_results}
                      helperText={errors.lab_results}
                      placeholder="Laboratory test results and values"
                    />
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          </Grid>

          {/* Vital Signs */}
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Vital Signs
                </Typography>
                
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={6} md={2.4}>
                    <TextField
                      fullWidth
                      label="Blood Pressure"
                      value={formData.vital_signs.blood_pressure}
                      onChange={(e) => handleInputChange('blood_pressure', e.target.value, 'vital_signs')}
                      error={!!errors['vital_signs.blood_pressure']}
                      helperText={errors['vital_signs.blood_pressure']}
                      placeholder="120/80"
                    />
                  </Grid>
                  <Grid item xs={12} sm={6} md={2.4}>
                    <TextField
                      fullWidth
                      label="Heart Rate"
                      value={formData.vital_signs.heart_rate}
                      onChange={(e) => handleInputChange('heart_rate', e.target.value, 'vital_signs')}
                      error={!!errors['vital_signs.heart_rate']}
                      helperText={errors['vital_signs.heart_rate']}
                      placeholder="72 bpm"
                    />
                  </Grid>
                  <Grid item xs={12} sm={6} md={2.4}>
                    <TextField
                      fullWidth
                      label="Temperature"
                      value={formData.vital_signs.temperature}
                      onChange={(e) => handleInputChange('temperature', e.target.value, 'vital_signs')}
                      error={!!errors['vital_signs.temperature']}
                      helperText={errors['vital_signs.temperature']}
                      placeholder="98.6°F"
                    />
                  </Grid>
                  <Grid item xs={12} sm={6} md={2.4}>
                    <TextField
                      fullWidth
                      label="Weight"
                      value={formData.vital_signs.weight}
                      onChange={(e) => handleInputChange('weight', e.target.value, 'vital_signs')}
                      error={!!errors['vital_signs.weight']}
                      helperText={errors['vital_signs.weight']}
                      placeholder="150 lbs"
                    />
                  </Grid>
                  <Grid item xs={12} sm={6} md={2.4}>
                    <TextField
                      fullWidth
                      label="Height"
                      value={formData.vital_signs.height}
                      onChange={(e) => handleInputChange('height', e.target.value, 'vital_signs')}
                      error={!!errors['vital_signs.height']}
                      helperText={errors['vital_signs.height']}
                      placeholder="5'8&quot;"
                    />
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          </Grid>

          {/* File Attachments */}
          <Grid item xs={12}>
            <Card sx={{ border: '2px dashed', borderColor: 'primary.main', bgcolor: 'primary.50' }}>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                  <Typography variant="h6" color="primary">
                    File Attachments
                  </Typography>
                  <Chip label="Upload Medical Documents" size="small" color="primary" variant="outlined" />
                </Box>
                
                {/* Existing Files */}
                <FilePreview
                  recordId={id}
                  patientId={formData.patient_id}
                  onFileDeleted={(fileId) => {
                    // Handle file deletion
                  }}
                />
                
                {/* Upload New Files */}
                <Box sx={{ mt: 3, p: 2, bgcolor: 'background.paper', borderRadius: 2 }}>
                  <FileUpload
                    category="medical-records"
                    recordId={id}
                    patientId={formData.patient_id}
                    onUploadSuccess={(files) => {
                      // Handle successful upload - could refresh file list
                    }}
                    onUploadError={(error) => {
                      console.error('Upload error:', error);
                      // Handle upload error
                    }}
                    maxFiles={10}
                    label="Upload Additional Files"
                    description="Drag and drop medical images, lab results, reports, and other related documents here"
                  />
                </Box>
              </CardContent>
            </Card>
          </Grid>

          {/* Submit Buttons */}
          <Grid item xs={12}>
            <Paper sx={{ p: 2 }}>
              <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
                <Button
                  variant="outlined"
                  onClick={handleCancel}
                  disabled={saving}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="contained"
                  startIcon={<SaveIcon />}
                  disabled={saving || !hasChanges()}
                >
                  {saving ? 'Saving Changes...' : 'Save Changes'}
                </Button>
              </Box>
            </Paper>
          </Grid>
        </Grid>
      </form>
    </Box>
  );
};

export default EditRecordPage;
