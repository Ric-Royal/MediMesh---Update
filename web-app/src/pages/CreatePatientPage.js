import React, { useState } from 'react';
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
  Divider
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  Save as SaveIcon,
  Person as PersonIcon
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { apiService } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

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
  
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  // Check permissions
  if (!hasRole('doctor') && !hasRole('nurse') && !hasRole('admin')) {
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
    if (formData.phone && !/^\+?[\d\s\-\(\)]+$/.test(formData.phone)) {
      newErrors['phone'] = 'Please enter a valid phone number';
    }

    // Emergency contact phone validation
    if (formData.emergency_contact.phone && !/^\+?[\d\s\-\(\)]+$/.test(formData.emergency_contact.phone)) {
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
      console.log('Request data:', cleanData);
      
      const response = await apiService.patients.create(cleanData);
      
      // Navigate to the new patient's detail page
      navigate(`/patients/${response.data.id}`, {
        replace: true,
        state: { message: 'Patient created successfully!' }
      });
    } catch (err) {
      console.error('Error creating patient:', err);
      console.log('Error response:', err.response?.data);
      console.log('Error status:', err.response?.status);
      
      if (err.response?.data?.details) {
        // Handle validation errors from server
        const serverErrors = {};
        err.response.data.details.forEach(error => {
          serverErrors[error.field] = error.message;
        });
        setErrors(serverErrors);
      } else {
        setSubmitError(err.response?.data?.error || err.response?.data?.message || 'Failed to create patient. Please try again.');
      }
    } finally {
      setLoading(false);
    }
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
                      placeholder="+1 (555) 123-4567"
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
                      placeholder="+1 (555) 123-4567"
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
                      placeholder="e.g., Blue Cross, Aetna, United Healthcare"
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
    </Box>
  );
};

export default CreatePatientPage; 