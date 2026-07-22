import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  Paper,
  Grid,
  Card,
  CardContent,
  Avatar,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Alert,
  Tab,
  Tabs
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  Edit as EditIcon,
  Add as AddIcon,
  Visibility as ViewIcon,
  Email as EmailIcon,
  Phone as PhoneIcon,
  Home as HomeIcon,
  CalendarToday as CalendarIcon,
  Person as PersonIcon,
  Payment as PaymentIcon,
  Queue as QueueIcon
} from '@mui/icons-material';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import apiService from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import LoadingSpinner from '../components/common/LoadingSpinner';
import PaymentHistory from '../components/payments/PaymentHistory';
import AddPatientToQueueDialog from '../components/queue/AddPatientToQueueDialog';

const PatientDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { hasRole } = useAuth();
  
  const [patient, setPatient] = useState(null);
  const [medicalRecords, setMedicalRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState(0);
  const [successMessage, setSuccessMessage] = useState(location.state?.message || null);
  const paymentHistoryKey = 0;
  const [visitDialogOpen, setVisitDialogOpen] = useState(false);

  const fetchPatientData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch patient details and medical records in parallel
      const [patientResponse, recordsResponse] = await Promise.all([
        apiService.patients.getById(id),
        apiService.patients.getRecords(id, { limit: 50 })
      ]);

      setPatient(patientResponse.data);
      setMedicalRecords(recordsResponse.data || []);
    } catch (err) {
      console.error('Error fetching patient data:', err);
      setError('Failed to load patient information. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchPatientData();
  }, [fetchPatientData]);

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

  const calculateAge = (dateOfBirth) => {
    const today = new Date();
    const birthDate = new Date(dateOfBirth);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    
    return age;
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const getGenderColor = (gender) => {
    switch (gender) {
      case 'M': return 'primary';
      case 'F': return 'secondary';
      default: return 'default';
    }
  };

  const getGenderLabel = (gender) => {
    switch (gender) {
      case 'M': return 'Male';
      case 'F': return 'Female';
      default: return 'Other';
    }
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

  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
  };

  if (loading) {
    return <LoadingSpinner message="Loading patient information..." />;
  }

  if (error) {
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
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  if (!patient) {
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
        <Alert severity="warning">Patient not found.</Alert>
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
            onClick={() => navigate('/patients')}
            variant="outlined"
          >
            Back to Patients
          </Button>
          <Typography variant="h4">
            Patient Details
          </Typography>
        </Box>
        
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {(hasRole('doctor') || hasRole('nurse') || hasRole('admin') || hasRole('receptionist')) && (
            <>
              <Button
                variant="contained"
                startIcon={<QueueIcon />}
                onClick={() => setVisitDialogOpen(true)}
              >
                Register Visit
              </Button>
              {(hasRole('doctor') || hasRole('admin')) && (
                <>
                  <Button
                    variant="outlined"
                    color="success"
                    startIcon={<PaymentIcon />}
                    onClick={() => navigate('/billing', {
                      state: {
                        patientId: patient.id,
                        patientName: `${patient.first_name} ${patient.last_name}`,
                      },
                    })}
                  >
                    Open Billing
                  </Button>
                  <Button
                    variant="outlined"
                    startIcon={<AddIcon />}
                    onClick={() => navigate('/records/new', { state: { patientId: patient.id } })}
                  >
                    New Record
                  </Button>
                </>
              )}
              <Button
                variant="outlined"
                startIcon={<EditIcon />}
                onClick={() => navigate(`/patients/${patient.id}/edit`)}
              >
                Edit Patient
              </Button>
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

      {/* Patient Information Card */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={3}>
            <Grid item xs={12} md={4}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                <Avatar 
                  sx={{ 
                    width: 80, 
                    height: 80, 
                    bgcolor: 'primary.main',
                    fontSize: '2rem'
                  }}
                >
                  {patient.first_name?.[0]}{patient.last_name?.[0]}
                </Avatar>
                <Box>
                  <Typography variant="h5" fontWeight="bold">
                    {patient.full_name}
                  </Typography>
                  <Typography variant="body1" color="text.secondary" fontFamily="monospace">
                    ID: {patient.patient_id}
                  </Typography>
                  {patient.gender && (
                    <Chip
                      label={getGenderLabel(patient.gender)}
                      size="small"
                      color={getGenderColor(patient.gender)}
                      sx={{ mt: 1 }}
                    />
                  )}
                </Box>
              </Box>
            </Grid>
            
            <Grid item xs={12} md={8}>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                    <CalendarIcon color="action" />
                    <Box>
                      <Typography variant="body2" color="text.secondary">
                        Date of Birth
                      </Typography>
                      <Typography variant="body1">
                        {patient.date_of_birth ? formatDate(patient.date_of_birth) : 'Not provided'}
                      </Typography>
                      {patient.date_of_birth && (
                        <Typography variant="caption" color="text.secondary">
                          Age: {calculateAge(patient.date_of_birth)} years
                        </Typography>
                      )}
                    </Box>
                  </Box>
                </Grid>

                <Grid item xs={12} sm={6}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                    <PersonIcon color="action" />
                    <Box>
                      <Typography variant="body2" color="text.secondary">
                        Patient Since
                      </Typography>
                      <Typography variant="body1">
                        {formatDate(patient.created_at)}
                      </Typography>
                    </Box>
                  </Box>
                </Grid>

                {patient.phone && (
                  <Grid item xs={12} sm={6}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                      <PhoneIcon color="action" />
                      <Box>
                        <Typography variant="body2" color="text.secondary">
                          Phone
                        </Typography>
                        <Typography variant="body1">
                          {patient.phone}
                        </Typography>
                      </Box>
                    </Box>
                  </Grid>
                )}

                {patient.email && (
                  <Grid item xs={12} sm={6}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                      <EmailIcon color="action" />
                      <Box>
                        <Typography variant="body2" color="text.secondary">
                          Email
                        </Typography>
                        <Typography variant="body1">
                          {patient.email}
                        </Typography>
                      </Box>
                    </Box>
                  </Grid>
                )}

                {patient.address && (
                  <Grid item xs={12}>
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                      <HomeIcon color="action" sx={{ mt: 0.5 }} />
                      <Box>
                        <Typography variant="body2" color="text.secondary">
                          Address
                        </Typography>
                        <Typography variant="body1">
                          {typeof patient.address === 'string' 
                            ? patient.address 
                            : `${patient.address.street || ''}, ${patient.address.city || ''}, ${patient.address.state || ''} ${patient.address.zip_code || ''}`
                          }
                        </Typography>
                      </Box>
                    </Box>
                  </Grid>
                )}
              </Grid>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Paper sx={{ mb: 2 }}>
        <Tabs value={activeTab} onChange={handleTabChange}>
          <Tab label={`Medical Records (${medicalRecords.length})`} />
          <Tab label="Payments" />
          <Tab label="Summary" />
        </Tabs>
      </Paper>

      {/* Tab Content */}
      {activeTab === 0 && (
        <Paper>
          <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
            <Typography variant="h6">Medical Records</Typography>
          </Box>
          
          {medicalRecords.length === 0 ? (
            <Box sx={{ p: 4, textAlign: 'center' }}>
              <Typography color="text.secondary" gutterBottom>
                No medical records found for this patient.
              </Typography>
              {(hasRole('doctor') || hasRole('nurse') || hasRole('admin')) && (
                <Button
                  variant="contained"
                  startIcon={<AddIcon />}
                  onClick={() => navigate('/records/new', { state: { patientId: patient.id } })}
                  sx={{ mt: 2 }}
                >
                  Create First Record
                </Button>
              )}
            </Box>
          ) : (
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Date</TableCell>
                    <TableCell>Type</TableCell>
                    <TableCell>Provider</TableCell>
                    <TableCell>Notes</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {medicalRecords.map((record) => (
                    <TableRow 
                      key={record.id} 
                      hover
                      sx={{ cursor: 'pointer' }}
                      onClick={() => navigate(`/records/${record.id}`)}
                    >
                      <TableCell>
                        <Typography variant="body2">
                          {formatDate(record.record_date)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={record.record_type}
                          size="small"
                          color={getRecordTypeColor(record.record_type)}
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">
                          {record.provider_name}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography 
                          variant="body2" 
                          sx={{ 
                            maxWidth: 200,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          {record.notes || 'No notes'}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <IconButton
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/records/${record.id}`);
                          }}
                          size="small"
                        >
                          <ViewIcon />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Paper>
      )}

      {activeTab === 1 && (
        <Box>
          <PaymentHistory key={paymentHistoryKey} patientId={patient.id} />
        </Box>
      )}

      {activeTab === 2 && (
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>
            Patient Summary
          </Typography>
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <Typography variant="subtitle2" gutterBottom>
                Total Medical Records
              </Typography>
              <Typography variant="h4" color="primary.main" gutterBottom>
                {medicalRecords.length}
              </Typography>
            </Grid>
            
            <Grid item xs={12} md={6}>
              <Typography variant="subtitle2" gutterBottom>
                Recent Activity
              </Typography>
              <Typography variant="body1">
                {medicalRecords.length > 0 
                  ? `Last record: ${formatDate(medicalRecords[0]?.record_date)}`
                  : 'No recent activity'
                }
              </Typography>
            </Grid>

            {medicalRecords.length > 0 && (
              <Grid item xs={12}>
                <Typography variant="subtitle2" gutterBottom>
                  Record Types
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  {[...new Set(medicalRecords.map(r => r.record_type))].map(type => (
                    <Chip
                      key={type}
                      label={`${type} (${medicalRecords.filter(r => r.record_type === type).length})`}
                      size="small"
                      color={getRecordTypeColor(type)}
                      variant="outlined"
                    />
                  ))}
                </Box>
              </Grid>
            )}
          </Grid>
        </Paper>
      )}

      <AddPatientToQueueDialog
        open={visitDialogOpen}
        initialPatient={patient}
        onClose={() => setVisitDialogOpen(false)}
        onSuccess={() => {
          setVisitDialogOpen(false);
          setSuccessMessage('Visit registered and added to the consultation queue.');
        }}
      />
    </Box>
  );
};

export default PatientDetailPage;
