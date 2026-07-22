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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  Save as SaveIcon,
  Person as PersonIcon,
  CheckCircle as CheckCircleIcon
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import apiService from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import FileUpload from '../components/common/FileUpload';
import API_CONFIG from '../config/api';

const CreatePatientPage = () => {
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    date_of_birth: '',
    gender: '',
    phone: '',
    email: '',
    address: {
      street: '',
      city: '',
      state: '',
      zip_code: '',
      country: 'Kenya'
    },
    emergency_contact: {
      name: '',
      relationship: '',
      phone: ''
    },
    insurance: {
      provider: '',
      policy_number: '',
      group_number: ''
    }
  });
  
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  
  // Encounter dialog state
  const [showEncounterDialog, setShowEncounterDialog] = useState(false);
  const [createdPatient, setCreatedPatient] = useState(null);
  const [clinics, setClinics] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [encounterData, setEncounterData] = useState({
    encounterType: 'outpatient',
    clinicId: '',
    doctorId: '',
    chiefComplaint: '',
    triageLevel: 'routine',
    paymentType: 'self-pay',
    waitingLocation: 'reception'
  });
  const [creatingEncounter, setCreatingEncounter] = useState(false);

  // Load clinics and doctors for encounter creation
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [clinicsRes, doctorsRes] = await Promise.all([
          fetch(`${API_CONFIG.baseURL}/api/clinics`, {
            headers: API_CONFIG.getAuthHeaders()
          }),
          fetch(`${API_CONFIG.baseURL}/api/staff?role=doctor`, {
            headers: API_CONFIG.getAuthHeaders()
          })
        ]);
        
        if (clinicsRes.ok) {
          const clinicsData = await clinicsRes.json();
          setClinics(clinicsData.data || []);
        }
        
        if (doctorsRes.ok) {
          const doctorsData = await doctorsRes.json();
          setDoctors(doctorsData.data || []);
        }
      } catch (error) {
        console.error('Error loading clinics/doctors:', error);
      }
    };
    
    fetchData();
  }, []);

  // Check permissions
  if (!hasRole('doctor') && !hasRole('nurse') && !hasRole('admin') && !hasRole('receptionist')) {
    return (
      <Box>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate('/patients')}
          variant="outlined"
          sx={{ mb: 2 }}
        >
          Back to Patients
        </Button>
        <Alert severity="error">
          You don't have permission to create patients.
        </Alert>
      </Box>
    );
  }

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
    if (errors[`${section ? `${section}.` : ''}${field}`]) {
      setErrors(prev => ({
        ...prev,
        [`${section ? `${section}.` : ''}${field}`]: ''
      }));
    }
  };

  const validateForm = () => {
    const newErrors = {};

    // Required fields
    if (!formData.first_name.trim()) {
      newErrors['first_name'] = 'First name is required';
    }
    if (!formData.last_name.trim()) {
      newErrors['last_name'] = 'Last name is required';
    }
    if (!formData.date_of_birth) {
      newErrors['date_of_birth'] = 'Date of birth is required';
    }
    if (!formData.gender) {
      newErrors['gender'] = 'Gender is required';
    }

    // Email validation
    if (formData.email && !/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors['email'] = 'Please enter a valid email address';
    }

    // Phone validation
    if (formData.phone && !/^\+?[\d\s\-()]+$/.test(formData.phone)) {
      newErrors['phone'] = 'Please enter a valid phone number';
    }

    // Emergency contact phone validation
    if (formData.emergency_contact.phone && !/^\+?[\d\s\-()]+$/.test(formData.emergency_contact.phone)) {
      newErrors['emergency_contact.phone'] = 'Please enter a valid phone number';
    }

    // Date of birth validation (not in future)
    if (formData.date_of_birth && new Date(formData.date_of_birth) > new Date()) {
      newErrors['date_of_birth'] = 'Date of birth cannot be in the future';
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
        ...formData
      };
      
      // Only include nested objects if they have content
      if (Object.values(formData.address).some(v => v.trim())) {
        cleanData.address = formData.address;
      }
      if (Object.values(formData.emergency_contact).some(v => v.trim())) {
        cleanData.emergency_contact = formData.emergency_contact;
      }
      if (Object.values(formData.insurance).some(v => v.trim())) {
        cleanData.insurance = formData.insurance;
      }

      // Log the request data before sending
      
      const response = await apiService.patients.create(cleanData);
      
      // Store the created patient and show encounter dialog
      setCreatedPatient(response.data);
      setShowEncounterDialog(true);
    } catch (err) {
      console.error('Error creating patient:', err);
      
      if (err.response?.data?.details) {
        // Handle validation errors from server
        const serverErrors = {};
        err.response.data.details.forEach(error => {
          serverErrors[error.field] = error.message;
        });
        setErrors(serverErrors);
        setSubmitError('Please fix the validation errors above.');
      } else {
        // Provide more specific error messages based on the error
        let errorMessage = 'Failed to create patient. Please try again.';
        
        if (err.response?.status === 409) {
          errorMessage = 'A patient with this information already exists. Please check the patient ID, email, or phone number.';
        } else if (err.response?.status === 400) {
          errorMessage = err.response?.data?.error || 'Invalid patient information. Please check all fields.';
        } else if (err.response?.status === 500) {
          errorMessage = 'Server error occurred. Please try again or contact support if the problem persists.';
        } else if (err.response?.data?.error) {
          errorMessage = err.response.data.error;
        } else if (err.response?.data?.message) {
          errorMessage = err.response.data.message;
        } else if (!navigator.onLine) {
          errorMessage = 'No internet connection. Please check your network and try again.';
        }
        
        setSubmitError(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCreateEncounter = async () => {
    try {
      setCreatingEncounter(true);
      
      const encounterPayload = {
        patientId: createdPatient.id,
        encounterType: encounterData.encounterType,
        clinicId: encounterData.clinicId || null,
        doctorId: encounterData.doctorId || null,
        chiefComplaint: encounterData.chiefComplaint || 'General consultation',
        triageLevel: encounterData.triageLevel,
        paymentType: encounterData.paymentType,
        waitingLocation: encounterData.waitingLocation
      };
      
      const response = await fetch(`${API_CONFIG.baseURL}/api/encounters`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...API_CONFIG.getAuthHeaders()
        },
        body: JSON.stringify(encounterPayload)
      });
      
      if (!response.ok) {
        throw new Error('Failed to create encounter');
      }
      
      // Navigate to patient detail page with success message
      navigate(`/patients/${createdPatient.id}`, {
        replace: true,
        state: { message: 'Patient created and added to queue successfully!' }
      });
    } catch (error) {
      console.error('Error creating encounter:', error);
      setSubmitError('Patient created but failed to add to queue. You can add them to the queue later.');
      // Still navigate to patient page after a delay
      setTimeout(() => {
        navigate(`/patients/${createdPatient.id}`, {
          replace: true
        });
      }, 2000);
    } finally {
      setCreatingEncounter(false);
    }
  };

  const handleSkipEncounter = () => {
    // Navigate directly to patient detail page
    navigate(`/patients/${createdPatient.id}`, {
      replace: true,
      state: { message: 'Patient created successfully! (Not added to queue)' }
    });
  };

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Button
            startIcon={<ArrowBackIcon />}
            onClick={() => navigate('/patients')}
            variant="outlined"
          >
            Back to Patients
          </Button>
          <Typography variant="h4">
            Create New Patient
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
          {/* Personal Information */}
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                  <PersonIcon color="primary" />
                  <Typography variant="h6">Personal Information</Typography>
                </Box>
                
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="First Name"
                      value={formData.first_name}
                      onChange={(e) => handleInputChange('first_name', e.target.value)}
                      error={!!errors.first_name}
                      helperText={errors.first_name}
                      required
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Last Name"
                      value={formData.last_name}
                      onChange={(e) => handleInputChange('last_name', e.target.value)}
                      error={!!errors.last_name}
                      helperText={errors.last_name}
                      required
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Date of Birth"
                      type="date"
                      value={formData.date_of_birth}
                      onChange={(e) => handleInputChange('date_of_birth', e.target.value)}
                      error={!!errors.date_of_birth}
                      helperText={errors.date_of_birth}
                      InputLabelProps={{ shrink: true }}
                      required
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <FormControl fullWidth error={!!errors.gender} required>
                      <InputLabel>Gender</InputLabel>
                      <Select
                        value={formData.gender}
                        label="Gender"
                        onChange={(e) => handleInputChange('gender', e.target.value)}
                      >
                        <MenuItem value="M">Male</MenuItem>
                        <MenuItem value="F">Female</MenuItem>
                        <MenuItem value="Other">Other</MenuItem>
                      </Select>
                      {errors.gender && (
                        <Typography variant="caption" color="error" sx={{ mt: 1, ml: 2 }}>
                          {errors.gender}
                        </Typography>
                      )}
                    </FormControl>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Phone Number"
                      value={formData.phone}
                      onChange={(e) => handleInputChange('phone', e.target.value)}
                      error={!!errors.phone}
                      helperText={errors.phone}
                      placeholder="+254 712 345 678"
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Email Address"
                      type="email"
                      value={formData.email}
                      onChange={(e) => handleInputChange('email', e.target.value)}
                      error={!!errors.email}
                      helperText={errors.email}
                    />
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          </Grid>

          {/* Address Information */}
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Address Information
                </Typography>
                
                <Grid container spacing={2}>
                  <Grid item xs={12}>
                    <TextField
                      fullWidth
                      label="Street Address"
                      value={formData.address.street}
                      onChange={(e) => handleInputChange('street', e.target.value, 'address')}
                      error={!!errors['address.street']}
                      helperText={errors['address.street']}
                    />
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <TextField
                      fullWidth
                      label="City"
                      value={formData.address.city}
                      onChange={(e) => handleInputChange('city', e.target.value, 'address')}
                      error={!!errors['address.city']}
                      helperText={errors['address.city']}
                    />
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <TextField
                      fullWidth
                      label="State/Province"
                      value={formData.address.state}
                      onChange={(e) => handleInputChange('state', e.target.value, 'address')}
                      error={!!errors['address.state']}
                      helperText={errors['address.state']}
                    />
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <TextField
                      fullWidth
                      label="ZIP/Postal Code"
                      value={formData.address.zip_code}
                      onChange={(e) => handleInputChange('zip_code', e.target.value, 'address')}
                      error={!!errors['address.zip_code']}
                      helperText={errors['address.zip_code']}
                    />
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          </Grid>

          {/* Emergency Contact */}
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Emergency Contact
                </Typography>
                
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={4}>
                    <TextField
                      fullWidth
                      label="Contact Name"
                      value={formData.emergency_contact.name}
                      onChange={(e) => handleInputChange('name', e.target.value, 'emergency_contact')}
                      error={!!errors['emergency_contact.name']}
                      helperText={errors['emergency_contact.name']}
                    />
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <TextField
                      fullWidth
                      label="Relationship"
                      value={formData.emergency_contact.relationship}
                      onChange={(e) => handleInputChange('relationship', e.target.value, 'emergency_contact')}
                      error={!!errors['emergency_contact.relationship']}
                      helperText={errors['emergency_contact.relationship']}
                      placeholder="e.g., Spouse, Parent, Sibling"
                    />
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <TextField
                      fullWidth
                      label="Phone Number"
                      value={formData.emergency_contact.phone}
                      onChange={(e) => handleInputChange('phone', e.target.value, 'emergency_contact')}
                      error={!!errors['emergency_contact.phone']}
                      helperText={errors['emergency_contact.phone']}
                      placeholder="+254 712 345 678"
                    />
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          </Grid>

          {/* Insurance Information */}
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Insurance Information
                </Typography>
                
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={4}>
                    <TextField
                      fullWidth
                      label="Insurance Provider"
                      value={formData.insurance.provider}
                      onChange={(e) => handleInputChange('provider', e.target.value, 'insurance')}
                      error={!!errors['insurance.provider']}
                      helperText={errors['insurance.provider']}
                      placeholder="e.g., SHIF, AAR, Jubilee"
                    />
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <TextField
                      fullWidth
                      label="Policy Number"
                      value={formData.insurance.policy_number}
                      onChange={(e) => handleInputChange('policy_number', e.target.value, 'insurance')}
                      error={!!errors['insurance.policy_number']}
                      helperText={errors['insurance.policy_number']}
                    />
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <TextField
                      fullWidth
                      label="Group Number"
                      value={formData.insurance.group_number}
                      onChange={(e) => handleInputChange('group_number', e.target.value, 'insurance')}
                      error={!!errors['insurance.group_number']}
                      helperText={errors['insurance.group_number']}
                    />
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          </Grid>

          {/* Patient Documents */}
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <FileUpload
                  category="patient-documents"
                  recordId={null}
                  patientId={null}
                  onUploadSuccess={(files) => {
                    // Handle successful upload
                  }}
                  onUploadError={(error) => {
                    console.error('Document upload error:', error);
                    // Handle upload error
                  }}
                  maxFiles={5}
                  label="Patient Documents"
                  description="Upload insurance cards, ID, consent forms, and other patient documents"
                />
              </CardContent>
            </Card>
          </Grid>

          {/* Submit Buttons */}
          <Grid item xs={12}>
            <Paper sx={{ p: 2 }}>
              <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
                <Button
                  variant="outlined"
                  onClick={() => navigate('/patients')}
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
                  {loading ? 'Creating Patient...' : 'Create Patient'}
                </Button>
              </Box>
            </Paper>
          </Grid>
        </Grid>
      </form>

      {/* Encounter Creation Dialog */}
      <Dialog 
        open={showEncounterDialog} 
        onClose={() => {}}
        maxWidth="sm"
        fullWidth
        disableEscapeKeyDown
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <CheckCircleIcon color="success" />
            <Typography variant="h6">Patient Created Successfully!</Typography>
          </Box>
        </DialogTitle>
        <DialogContent>
          <Alert severity="info" sx={{ mb: 3 }}>
            Would you like to register this patient's visit and add them to the queue?
          </Alert>
          
          {createdPatient && (
            <Box sx={{ mb: 3, p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
              <Typography variant="subtitle2" color="text.secondary">Patient Details</Typography>
              <Typography variant="body1" fontWeight={600}>
                {createdPatient.first_name} {createdPatient.last_name}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                UHID: {createdPatient.uhid} | ID: {createdPatient.patient_id}
              </Typography>
            </Box>
          )}

          <Grid container spacing={2}>
            <Grid item xs={12}>
              <FormControl fullWidth>
                <InputLabel>Encounter Type</InputLabel>
                <Select
                  value={encounterData.encounterType}
                  onChange={(e) => setEncounterData({ ...encounterData, encounterType: e.target.value })}
                  label="Encounter Type"
                >
                  <MenuItem value="outpatient">Outpatient</MenuItem>
                  <MenuItem value="emergency">Emergency</MenuItem>
                  <MenuItem value="inpatient">Inpatient</MenuItem>
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12}>
              <FormControl fullWidth>
                <InputLabel>Clinic/Department</InputLabel>
                <Select
                  value={encounterData.clinicId}
                  onChange={(e) => setEncounterData({ ...encounterData, clinicId: e.target.value })}
                  label="Clinic/Department"
                >
                  <MenuItem value="">
                    <em>None</em>
                  </MenuItem>
                  {clinics.map((clinic) => (
                    <MenuItem key={clinic.id} value={clinic.id}>
                      {clinic.clinic_name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12}>
              <FormControl fullWidth>
                <InputLabel>Assigned Doctor</InputLabel>
                <Select
                  value={encounterData.doctorId}
                  onChange={(e) => setEncounterData({ ...encounterData, doctorId: e.target.value })}
                  label="Assigned Doctor"
                >
                  <MenuItem value="">
                    <em>None</em>
                  </MenuItem>
                  {doctors.map((doctor) => (
                    <MenuItem key={doctor.id} value={doctor.id}>
                      Dr. {doctor.first_name} {doctor.last_name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Chief Complaint"
                value={encounterData.chiefComplaint}
                onChange={(e) => setEncounterData({ ...encounterData, chiefComplaint: e.target.value })}
                placeholder="e.g., Fever, Headache, Follow-up"
                multiline
                rows={2}
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Triage Level</InputLabel>
                <Select
                  value={encounterData.triageLevel}
                  onChange={(e) => setEncounterData({ ...encounterData, triageLevel: e.target.value })}
                  label="Triage Level"
                >
                  <MenuItem value="routine">Routine</MenuItem>
                  <MenuItem value="urgent">Urgent</MenuItem>
                  <MenuItem value="emergency">Emergency</MenuItem>
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Payment Type</InputLabel>
                <Select
                  value={encounterData.paymentType}
                  onChange={(e) => setEncounterData({ ...encounterData, paymentType: e.target.value })}
                  label="Payment Type"
                >
                  <MenuItem value="self-pay">Self Pay</MenuItem>
                  <MenuItem value="insurance">Insurance</MenuItem>
                  <MenuItem value="government">Government</MenuItem>
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12}>
              <FormControl fullWidth>
                <InputLabel>Waiting Location</InputLabel>
                <Select
                  value={encounterData.waitingLocation}
                  onChange={(e) => setEncounterData({ ...encounterData, waitingLocation: e.target.value })}
                  label="Waiting Location"
                >
                  <MenuItem value="reception">Reception</MenuItem>
                  <MenuItem value="waiting-room">Waiting Room</MenuItem>
                  <MenuItem value="triage">Triage</MenuItem>
                  <MenuItem value="emergency">Emergency Area</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>

          {submitError && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {submitError}
            </Alert>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2, gap: 1 }}>
          <Button
            onClick={handleSkipEncounter}
            disabled={creatingEncounter}
            variant="outlined"
          >
            Skip for Now
          </Button>
          <Button
            onClick={handleCreateEncounter}
            disabled={creatingEncounter}
            variant="contained"
            startIcon={creatingEncounter ? null : <CheckCircleIcon />}
          >
            {creatingEncounter ? 'Adding to Queue...' : 'Register Visit & Add to Queue'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default CreatePatientPage;
