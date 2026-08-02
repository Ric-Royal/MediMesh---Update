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
  Chip
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  Save as SaveIcon,
  Person as PersonIcon
} from '@mui/icons-material';
import { useParams, useNavigate } from '../routerCompat';
import apiService from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import LoadingSpinner from '../components/common/LoadingSpinner';
import FileUpload from '../components/common/FileUpload';
import FilePreview from '../components/common/FilePreview';

const EditPatientPage = () => {
  const { id } = useParams();
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
      country: 'USA'
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
  
  const [originalData, setOriginalData] = useState(null);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [hasUploadedFiles, setHasUploadedFiles] = useState(false);

  // Check permissions
  const hasEditPermission = hasRole('doctor') || hasRole('nurse') || hasRole('admin');

  const fetchPatientData = useCallback(async () => {
    try {
      setLoading(true);
      const response = await apiService.patients.getById(id);
      const patient = response.data;
      
      // Transform patient data to match form structure
      const transformedData = {
        first_name: patient.first_name || '',
        last_name: patient.last_name || '',
        date_of_birth: patient.date_of_birth || '',
        gender: patient.gender || '',
        phone: patient.phone || '',
        email: patient.email || '',
        address: {
          street: patient.address?.street || '',
          city: patient.address?.city || '',
          state: patient.address?.state || '',
          zip_code: patient.address?.zip_code || '',
          country: patient.address?.country || 'USA'
        },
        emergency_contact: {
          name: patient.emergency_contact?.name || '',
          relationship: patient.emergency_contact?.relationship || '',
          phone: patient.emergency_contact?.phone || ''
        },
        insurance: {
          provider: patient.insurance?.provider || '',
          policy_number: patient.insurance?.policy_number || '',
          group_number: patient.insurance?.group_number || ''
        }
      };
      
      setFormData(transformedData);
      setOriginalData(transformedData);
    } catch (err) {
      console.error('Error fetching patient data:', err);
      setSubmitError('Failed to load patient information. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchPatientData();
  }, [fetchPatientData]);

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

  const hasChanges = () => {
    if (!originalData) return false;
    return JSON.stringify(formData) !== JSON.stringify(originalData) || hasUploadedFiles;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    if (!hasChanges()) {
      navigate(`/patients/${id}`, {
        state: { message: 'No changes were made to the patient information.' }
      });
      return;
    }

    try {
      setSaving(true);
      setSubmitError(null);

      // Clean up the data before sending
      const cleanData = {
        ...formData,
        // Remove empty nested objects
        address: Object.values(formData.address).some(v => v.trim()) ? formData.address : undefined,
        emergency_contact: Object.values(formData.emergency_contact).some(v => v.trim()) ? formData.emergency_contact : undefined,
        insurance: Object.values(formData.insurance).some(v => v.trim()) ? formData.insurance : undefined
      };

      await apiService.patients.update(id, cleanData);
      
      // Navigate back to patient detail page
      navigate(`/patients/${id}`, {
        replace: true,
        state: { message: 'Patient information updated successfully!' }
      });
    } catch (err) {
      console.error('Error updating patient:', err);
      
      if (err.response?.data?.details) {
        // Handle validation errors from server
        const serverErrors = {};
        err.response.data.details.forEach(error => {
          serverErrors[error.field] = error.message;
        });
        setErrors(serverErrors);
      } else {
        setSubmitError(err.response?.data?.error || err.response?.data?.message || 'Failed to update patient. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (hasChanges()) {
      if (window.confirm('You have unsaved changes. Are you sure you want to leave?')) {
        navigate(`/patients/${id}`);
      }
    } else {
      navigate(`/patients/${id}`);
    }
  };

  if (loading) {
    return <LoadingSpinner message="Loading patient information..." />;
  }

  if (!hasEditPermission) {
    return (
      <Box>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate(`/patients/${id}`)}
          variant="outlined"
          sx={{ mb: 2 }}
        >
          Back to Patient
        </Button>
        <Alert severity="error">
          You don't have permission to edit patient information.
        </Alert>
      </Box>
    );
  }

  if (!originalData) {
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
          Patient not found or failed to load patient information.
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
            Back to Patient
          </Button>
          <Typography variant="h4">
            Edit Patient
          </Typography>
        </Box>
        
        <Typography variant="body2" color="text.secondary">
          Patient ID: {originalData?.patient_id || id}
        </Typography>
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
            <Card sx={{ border: '2px dashed', borderColor: 'secondary.main', bgcolor: 'secondary.50' }}>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                  <Typography variant="h6" color="secondary">
                    🆔 Patient Documents
                  </Typography>
                  <Chip label="Upload ID Cards, Insurance Cards, etc." size="small" color="secondary" variant="outlined" />
                </Box>
                
                {/* Existing Files */}
                <FilePreview
                  patientId={id}
                  category="patient-documents"
                  onFileDeleted={(fileId) => {
                    // Handle file deletion - could refresh file list
                  }}
                />
                
                {/* Upload New Files */}
                <Box sx={{ mt: 3, p: 2, bgcolor: 'background.paper', borderRadius: 2 }}>
                  <FileUpload
                    category="patient-documents"
                    patientId={id}
                    onUploadSuccess={(files) => {
                      setHasUploadedFiles(true); // Mark that files have been uploaded
                    }}
                    onUploadError={(error) => {
                      console.error('Patient document upload error:', error);
                      // Handle upload error
                    }}
                    maxFiles={10}
                    label="Upload Patient Documents"
                    description="Drag and drop ID cards, insurance cards, consent forms, and other patient documents here"
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

export default EditPatientPage;
