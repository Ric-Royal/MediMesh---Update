import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  Paper,
  Grid,
  Card,
  CardContent,
  Chip,
  Divider,
  Alert,
  Avatar,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableRow,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Person as PersonIcon,
  CalendarToday as CalendarIcon,
  Description as DescriptionIcon,
  LocalHospital as LocalHospitalIcon,
  Assignment as AssignmentIcon
} from '@mui/icons-material';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import apiService from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import LoadingSpinner from '../components/common/LoadingSpinner';

const RecordDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { hasRole } = useAuth();
  
  const [record, setRecord] = useState(null);
  const [patient, setPatient] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [successMessage, setSuccessMessage] = useState(location.state?.message || null);

  useEffect(() => {
    fetchRecordData();
  }, [id]);

  // Clear success message after showing it
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => {
        setSuccessMessage(null);
        // Clear the location state to prevent showing the message on refresh
        window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  const fetchRecordData = async () => {
    try {
      setLoading(true);
      setError(null);

      const recordResponse = await apiService.medicalRecords.getById(id);
      setRecord(recordResponse.data);

      // Fetch patient details if we have a patient_id
      if (recordResponse.data?.patient_id) {
        try {
          const patientResponse = await apiService.patients.getById(recordResponse.data.patient_id);
          setPatient(patientResponse.data);
        } catch (patientErr) {
          console.error('Error fetching patient data:', patientErr);
          // Don't fail completely if patient fetch fails
        }
      }
    } catch (err) {
      console.error('Error fetching record data:', err);
      setError('Failed to load medical record. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteRecord = async () => {
    if (!record) return;

    try {
      setDeleting(true);
      await apiService.medicalRecords.delete(record.id);
      
      navigate('/records', {
        replace: true,
        state: { message: 'Medical record deleted successfully!' }
      });
    } catch (err) {
      console.error('Error deleting record:', err);
      setError('Failed to delete record. Please try again.');
    } finally {
      setDeleting(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Not specified';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const formatDateTime = (dateString) => {
    if (!dateString) return 'Not specified';
    return new Date(dateString).toLocaleString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
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

  if (loading) {
    return <LoadingSpinner message="Loading medical record..." />;
  }

  if (error) {
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
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  if (!record) {
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
        <Alert severity="warning">Medical record not found.</Alert>
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
            Medical Record Details
          </Typography>
        </Box>
        
        <Box sx={{ display: 'flex', gap: 2 }}>
          {(hasRole('doctor') || hasRole('nurse') || hasRole('admin')) && (
            <>
              <Button
                variant="outlined"
                startIcon={<EditIcon />}
                onClick={() => navigate(`/records/${record.id}/edit`)}
              >
                Edit Record
              </Button>
              {(hasRole('doctor') || hasRole('admin')) && (
                <Button
                  variant="outlined"
                  color="error"
                  startIcon={<DeleteIcon />}
                  onClick={() => setDeleteDialogOpen(true)}
                >
                  Delete Record
                </Button>
              )}
            </>
          )}
        </Box>
      </Box>

      {/* Success Message */}
      {successMessage && (
        <Alert 
          severity="success" 
          sx={{ mb: 2 }} 
          onClose={() => setSuccessMessage(null)}
        >
          {successMessage}
        </Alert>
      )}

      <Grid container spacing={3}>
        {/* Record Overview */}
        <Grid item xs={12} md={8}>
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                <Box>
                  <Typography variant="h5" gutterBottom>
                    {record.record_type.replace('_', ' ').toUpperCase()} Record
                  </Typography>
                  <Chip
                    label={record.record_type.replace('_', ' ').toUpperCase()}
                    color={getRecordTypeColor(record.record_type)}
                    sx={{ mb: 2 }}
                  />
                </Box>
                <Typography variant="body2" color="text.secondary">
                  Record ID: {record.id}
                </Typography>
              </Box>

              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                    <CalendarIcon color="action" />
                    <Box>
                      <Typography variant="body2" color="text.secondary">
                        Record Date
                      </Typography>
                      <Typography variant="body1" fontWeight="medium">
                        {formatDate(record.record_date)}
                      </Typography>
                    </Box>
                  </Box>
                </Grid>

                <Grid item xs={12} sm={6}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                    <LocalHospitalIcon color="action" />
                    <Box>
                      <Typography variant="body2" color="text.secondary">
                        Provider
                      </Typography>
                      <Typography variant="body1" fontWeight="medium">
                        {record.provider_name}
                      </Typography>
                    </Box>
                  </Box>
                </Grid>

                <Grid item xs={12} sm={6}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                    <AssignmentIcon color="action" />
                    <Box>
                      <Typography variant="body2" color="text.secondary">
                        Created
                      </Typography>
                      <Typography variant="body1">
                        {formatDateTime(record.created_at)}
                      </Typography>
                    </Box>
                  </Box>
                </Grid>

                {record.follow_up_date && (
                  <Grid item xs={12} sm={6}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                      <CalendarIcon color="action" />
                      <Box>
                        <Typography variant="body2" color="text.secondary">
                          Follow-up Date
                        </Typography>
                        <Typography variant="body1">
                          {formatDate(record.follow_up_date)}
                        </Typography>
                      </Box>
                    </Box>
                  </Grid>
                )}
              </Grid>
            </CardContent>
          </Card>

          {/* Clinical Information */}
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Clinical Information
              </Typography>
              
              {record.notes && (
                <Box sx={{ mb: 3 }}>
                  <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                    Notes
                  </Typography>
                  <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap' }}>
                    {record.notes}
                  </Typography>
                </Box>
              )}

              <Grid container spacing={3}>
                {record.diagnosis && (
                  <Grid item xs={12} md={6}>
                    <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                      Diagnosis
                    </Typography>
                    <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap' }}>
                      {record.diagnosis}
                    </Typography>
                  </Grid>
                )}

                {record.treatment_plan && (
                  <Grid item xs={12} md={6}>
                    <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                      Treatment Plan
                    </Typography>
                    <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap' }}>
                      {record.treatment_plan}
                    </Typography>
                  </Grid>
                )}

                {record.medications && (
                  <Grid item xs={12} md={6}>
                    <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                      Medications
                    </Typography>
                    <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap' }}>
                      {record.medications}
                    </Typography>
                  </Grid>
                )}

                {record.lab_results && (
                  <Grid item xs={12} md={6}>
                    <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                      Lab Results
                    </Typography>
                    <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap' }}>
                      {record.lab_results}
                    </Typography>
                  </Grid>
                )}
              </Grid>
            </CardContent>
          </Card>

          {/* Vital Signs */}
          {record.vital_signs && Object.values(record.vital_signs).some(v => v) && (
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Vital Signs
                </Typography>
                
                <TableContainer>
                  <Table size="small">
                    <TableBody>
                      {record.vital_signs.blood_pressure && (
                        <TableRow>
                          <TableCell sx={{ fontWeight: 'medium' }}>Blood Pressure</TableCell>
                          <TableCell>{record.vital_signs.blood_pressure}</TableCell>
                        </TableRow>
                      )}
                      {record.vital_signs.heart_rate && (
                        <TableRow>
                          <TableCell sx={{ fontWeight: 'medium' }}>Heart Rate</TableCell>
                          <TableCell>{record.vital_signs.heart_rate}</TableCell>
                        </TableRow>
                      )}
                      {record.vital_signs.temperature && (
                        <TableRow>
                          <TableCell sx={{ fontWeight: 'medium' }}>Temperature</TableCell>
                          <TableCell>{record.vital_signs.temperature}</TableCell>
                        </TableRow>
                      )}
                      {record.vital_signs.weight && (
                        <TableRow>
                          <TableCell sx={{ fontWeight: 'medium' }}>Weight</TableCell>
                          <TableCell>{record.vital_signs.weight}</TableCell>
                        </TableRow>
                      )}
                      {record.vital_signs.height && (
                        <TableRow>
                          <TableCell sx={{ fontWeight: 'medium' }}>Height</TableCell>
                          <TableCell>{record.vital_signs.height}</TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              </CardContent>
            </Card>
          )}
        </Grid>

        {/* Patient Information Sidebar */}
        <Grid item xs={12} md={4}>
          {patient && (
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                  <PersonIcon color="primary" />
                  <Typography variant="h6">Patient Information</Typography>
                </Box>
                
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
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
                  </Box>
                </Box>

                <Divider sx={{ mb: 2 }} />

                <Grid container spacing={1}>
                  <Grid item xs={6}>
                    <Typography variant="body2" color="text.secondary">
                      Age
                    </Typography>
                    <Typography variant="body1">
                      {patient.date_of_birth ? `${calculateAge(patient.date_of_birth)} years` : 'Not provided'}
                    </Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="body2" color="text.secondary">
                      Gender
                    </Typography>
                    <Typography variant="body1">
                      {patient.gender === 'M' ? 'Male' : patient.gender === 'F' ? 'Female' : 'Other'}
                    </Typography>
                  </Grid>
                  {patient.phone && (
                    <Grid item xs={12}>
                      <Typography variant="body2" color="text.secondary">
                        Phone
                      </Typography>
                      <Typography variant="body1">
                        {patient.phone}
                      </Typography>
                    </Grid>
                  )}
                  {patient.email && (
                    <Grid item xs={12}>
                      <Typography variant="body2" color="text.secondary">
                        Email
                      </Typography>
                      <Typography variant="body1">
                        {patient.email}
                      </Typography>
                    </Grid>
                  )}
                </Grid>

                <Button
                  fullWidth
                  variant="outlined"
                  sx={{ mt: 2 }}
                  onClick={() => navigate(`/patients/${patient.id}`)}
                >
                  View Patient Details
                </Button>
              </CardContent>
            </Card>
          )}
        </Grid>
      </Grid>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Delete Medical Record</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete this medical record? This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button 
            onClick={handleDeleteRecord} 
            color="error" 
            variant="contained"
            disabled={deleting}
          >
            {deleting ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default RecordDetailPage; 