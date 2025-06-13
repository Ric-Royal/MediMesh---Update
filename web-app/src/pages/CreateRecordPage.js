import React, { useState, useEffect } from 'react';
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
  Autocomplete,
  Chip,
  Avatar
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  Save as SaveIcon,
  Description as DescriptionIcon,
  Person as PersonIcon
} from '@mui/icons-material';
import { useNavigate, useLocation } from 'react-router-dom';
import { apiService } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import LoadingSpinner from '../components/common/LoadingSpinner';

const CreateRecordPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { hasRole, user } = useAuth();
  
  const [formData, setFormData] = useState({
    patient_id: location.state?.patientId || '',
    record_type: '',
    record_date: new Date().toISOString().split('T')[0],
    provider_name: user?.name || '',
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
    follow_up_date: '',
    attachments: []
  });
  
  const [patients, setPatients] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [loadingPatients, setLoadingPatients] = useState(false);
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

  useEffect(() => {
    fetchPatients();
    
    // If patient ID is provided, fetch patient details
    if (formData.patient_id) {
      fetchPatientDetails(formData.patient_id);
    }
  }, [formData.patient_id]);

  const fetchPatients = async (search = '') => {
    try {
      setLoadingPatients(true);
      const response = await apiService.patients.getAll({
        search,
        limit: 50
      });
      setPatients(response.data || []);
    } catch (err) {
      console.error('Error fetching patients:', err);
    } finally {
      setLoadingPatients(false);
    }
  };

  const fetchPatientDetails = async (patientId) => {
    try {
      const response = await apiService.patients.getById(patientId);
      setSelectedPatient(response.data);
    } catch (err) {
      console.error('Error fetching patient details:', err);
    }
  };

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

  const handlePatientChange = (event, patient) => {
    if (patient) {
      setFormData(prev => ({
        ...prev,
        patient_id: patient.id
      }));
      setSelectedPatient(patient);
    } else {
      setFormData(prev => ({
        ...prev,
        patient_id: ''
      }));
      setSelectedPatient(null);
    }
  };

  const validateForm = () => {
    const newErrors = {};

    // Required fields
    if (!formData.patient_id) {
      newErrors['patient_id'] = 'Patient is required';
    }
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

  const handleSubmit = async (event) => {
    event.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    try {
      setLoading(true);
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

      const response = await apiService.medicalRecords.create(cleanData);
      
      // Navigate to the new record's detail page
      navigate(`/records/${response.data.id}`, {
        replace: true,
        state: { message: 'Medical record created successfully!' }
      });
    } catch (err) {
      console.error('Error creating medical record:', err);
      
      if (err.response?.data?.errors) {
        // Handle validation errors from server
        const serverErrors = {};
        err.response.data.errors.forEach(error => {
          serverErrors[error.field] = error.message;
        });
        setErrors(serverErrors);
      } else {
        setSubmitError(err.response?.data?.message || 'Failed to create medical record. Please try again.');
      }
    } finally {
      setLoading(false);
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

  // Check permissions after all hooks
  if (!hasRole('doctor') && !hasRole('nurse') && !hasRole('admin')) {
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
          You don't have permission to create medical records.
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
            onClick={() => navigate('/records')}
            variant="outlined"
          >
            Back to Records
          </Button>
          <Typography variant="h4">
            Create Medical Record
          </Typography>
        </Box>
      </Box>

      {/* Error Alert */}
      {submitError && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setSubmitError(null)}>
          {submitError}
        </Alert>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit}>
        <Grid container spacing={3}>
          {/* Patient Selection */}
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                  <PersonIcon color="primary" />
                  <Typography variant="h6">Patient Information</Typography>
                </Box>
                
                <Grid container spacing={2}>
                  <Grid item xs={12} md={8}>
                    <Autocomplete
                      options={patients}
                      getOptionLabel={(option) => `${option.full_name} (ID: ${option.patient_id})`}
                      value={selectedPatient}
                      onChange={handlePatientChange}
                      onInputChange={(event, value) => {
                        if (value.length > 2) {
                          fetchPatients(value);
                        }
                      }}
                      loading={loadingPatients}
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          label="Select Patient"
                          error={!!errors.patient_id}
                          helperText={errors.patient_id}
                          required
                        />
                      )}
                      renderOption={(props, option) => (
                        <Box component="li" {...props} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Avatar sx={{ width: 32, height: 32 }}>
                            {option.first_name?.[0]}{option.last_name?.[0]}
                          </Avatar>
                          <Box>
                            <Typography variant="body2" fontWeight="medium">
                              {option.full_name}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              ID: {option.patient_id} | Age: {calculateAge(option.date_of_birth)} | {option.gender === 'M' ? 'Male' : option.gender === 'F' ? 'Female' : 'Other'}
                            </Typography>
                          </Box>
                        </Box>
                      )}
                    />
                  </Grid>
                  
                  {selectedPatient && (
                    <Grid item xs={12} md={4}>
                      <Paper sx={{ p: 2, bgcolor: 'grey.50' }}>
                        <Typography variant="subtitle2" gutterBottom>
                          Selected Patient
                        </Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Avatar>
                            {selectedPatient.first_name?.[0]}{selectedPatient.last_name?.[0]}
                          </Avatar>
                          <Box>
                            <Typography variant="body2" fontWeight="medium">
                              {selectedPatient.full_name}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {selectedPatient.date_of_birth && `Age: ${calculateAge(selectedPatient.date_of_birth)}`}
                            </Typography>
                          </Box>
                        </Box>
                      </Paper>
                    </Grid>
                  )}
                </Grid>
              </CardContent>
            </Card>
          </Grid>

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

          {/* Submit Buttons */}
          <Grid item xs={12}>
            <Paper sx={{ p: 2 }}>
              <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
                <Button
                  variant="outlined"
                  onClick={() => navigate('/records')}
                  disabled={loading}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="contained"
                  startIcon={<SaveIcon />}
                  disabled={loading}
                >
                  {loading ? 'Creating Record...' : 'Create Record'}
                </Button>
              </Box>
            </Paper>
          </Grid>
        </Grid>
      </form>
    </Box>
  );
};

export default CreateRecordPage; 