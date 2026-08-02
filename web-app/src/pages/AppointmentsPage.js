import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  Paper,
  Grid,
  Card,
  CardContent,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  Tabs,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  InputAdornment,
  Tooltip
} from '@mui/material';
import {
  Add as AddIcon,
  Search as SearchIcon,
  Event as EventIcon,
  Person as PersonIcon,
  CheckCircle as CheckCircleIcon,
  Cancel as CancelIcon,
  Visibility as ViewIcon,
  CalendarToday as CalendarIcon,
  EditCalendar as RescheduleIcon
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import API_CONFIG from '../config/api';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { buildAppointmentListParams } from '../utils/appointmentQuery';
import { useNavigate } from '../routerCompat';

const AppointmentsPage = () => {
  const { hasRole } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState(0);
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [totalCount, setTotalCount] = useState(0);
  
  // Filters
  const [filters] = useState({
    status: '',
    doctor_id: '',
    clinic_id: '',
    date_from: '',
    date_to: '',
    appointment_type: ''
  });
  
  // Dialog states
  const [showBookingDialog, setShowBookingDialog] = useState(false);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [showRescheduleDialog, setShowRescheduleDialog] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState(null);
  const [rescheduleData, setRescheduleData] = useState({
    scheduled_date: '',
    scheduled_time: ''
  });
  
  // Form data for new appointment
  const [bookingData, setBookingData] = useState({
    patient_id: '',
    appointment_type: 'consultation',
    scheduled_date: '',
    scheduled_time: '',
    duration_minutes: 30,
    doctor_id: '',
    clinic_id: '',
    reason_for_visit: '',
    payment_type: 'self-pay'
  });
  
  // Reference data
  const [patients, setPatients] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [clinics, setClinics] = useState([]);
  const [availableSlots, setAvailableSlots] = useState([]);
  const [searchPatient, setSearchPatient] = useState('');

  const fetchAppointments = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const params = buildAppointmentListParams({
        activeTab,
        filters,
        page,
        rowsPerPage
      });

      const response = await fetch(`${API_CONFIG.baseURL}/api/appointments?${params}`, {
        headers: API_CONFIG.getAuthHeaders()
      });

      if (!response.ok) throw new Error('Failed to fetch appointments');

      const data = await response.json();
      setAppointments(data.data || []);
      setTotalCount(data.pagination?.total || 0);
    } catch (err) {
      console.error('Error fetching appointments:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [activeTab, filters, page, rowsPerPage]);

  const fetchReferenceData = useCallback(async () => {
    try {
      const [doctorsRes, clinicsRes] = await Promise.all([
        fetch(`${API_CONFIG.baseURL}/api/staff?role=doctor`, {
          headers: API_CONFIG.getAuthHeaders()
        }),
        fetch(`${API_CONFIG.baseURL}/api/clinics`, {
          headers: API_CONFIG.getAuthHeaders()
        })
      ]);

      if (doctorsRes.ok) {
        const doctorsData = await doctorsRes.json();
        setDoctors(doctorsData.data || []);
      }

      if (clinicsRes.ok) {
        const clinicsData = await clinicsRes.json();
        setClinics(clinicsData.data || []);
      }
    } catch (err) {
      console.error('Error fetching reference data:', err);
    }
  }, []);

  useEffect(() => {
    fetchAppointments();
    fetchReferenceData();
  }, [fetchAppointments, fetchReferenceData]);

  const searchPatients = async (query) => {
    if (!query || query.length < 2) {
      setPatients([]);
      return;
    }

    try {
      const response = await fetch(`${API_CONFIG.baseURL}/api/patients?search=${query}&limit=10`, {
        headers: API_CONFIG.getAuthHeaders()
      });

      if (response.ok) {
        const data = await response.json();
        setPatients(data.data || []);
      }
    } catch (err) {
      console.error('Error searching patients:', err);
    }
  };

  const fetchAvailableSlots = async (doctorId, date) => {
    if (!doctorId || !date) {
      setAvailableSlots([]);
      return;
    }

    try {
      setError(null);
      const response = await fetch(
        `${API_CONFIG.baseURL}/api/appointments/doctor/${doctorId}/available-slots?date=${date}`,
        { headers: API_CONFIG.getAuthHeaders() }
      );

      if (!response.ok) {
        throw new Error('Unable to load the doctor’s available times. Please try again.');
      }

      const data = await response.json();
      setAvailableSlots(data.data || []);
    } catch (err) {
      console.error('Error fetching available slots:', err);
      setAvailableSlots([]);
      setError(err.message);
    }
  };

  const handleBookAppointment = async () => {
    try {
      const response = await fetch(`${API_CONFIG.baseURL}/api/appointments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...API_CONFIG.getAuthHeaders()
        },
        body: JSON.stringify(bookingData)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to book appointment');
      }

      setShowBookingDialog(false);
      fetchAppointments();
      resetBookingForm();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleCheckIn = async (appointmentId) => {
    try {
      const response = await fetch(`${API_CONFIG.baseURL}/api/appointments/${appointmentId}/check-in`, {
        method: 'POST',
        headers: API_CONFIG.getAuthHeaders()
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to check in');

      navigate('/queue', {
        state: {
          queueType: result.data?.queueEntry?.queue_type || 'triage',
          encounterId: result.data?.encounter?.id,
          patientId: result.data?.appointment?.patient_id
        }
      });
    } catch (err) {
      setError(err.message);
    }
  };

  const handleConfirm = async (appointmentId) => {
    try {
      const response = await fetch(`${API_CONFIG.baseURL}/api/appointments/${appointmentId}/confirm`, {
        method: 'POST',
        headers: API_CONFIG.getAuthHeaders()
      });

      if (!response.ok) throw new Error('Failed to confirm');

      fetchAppointments();
    } catch (err) {
      setError(err.message);
    }
  };

  const openRescheduleDialog = (appointment) => {
    setSelectedAppointment(appointment);
    setRescheduleData({
      scheduled_date: String(appointment.scheduled_date || '').slice(0, 10),
      scheduled_time: String(appointment.scheduled_time || '').slice(0, 5)
    });
    setShowRescheduleDialog(true);
  };

  const handleReschedule = async () => {
    try {
      const response = await fetch(
        `${API_CONFIG.baseURL}/api/appointments/${selectedAppointment.id}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...API_CONFIG.getAuthHeaders()
          },
          body: JSON.stringify(rescheduleData)
        }
      );

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to reschedule appointment');

      setShowRescheduleDialog(false);
      setSelectedAppointment(null);
      fetchAppointments();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleCancel = async (appointmentId, reason) => {
    try {
      const response = await fetch(`${API_CONFIG.baseURL}/api/appointments/${appointmentId}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...API_CONFIG.getAuthHeaders()
        },
        body: JSON.stringify({ cancellation_reason: reason })
      });

      if (!response.ok) throw new Error('Failed to cancel');

      fetchAppointments();
    } catch (err) {
      setError(err.message);
    }
  };

  const resetBookingForm = () => {
    setBookingData({
      patient_id: '',
      appointment_type: 'consultation',
      scheduled_date: '',
      scheduled_time: '',
      duration_minutes: 30,
      doctor_id: '',
      clinic_id: '',
      reason_for_visit: '',
      payment_type: 'self-pay'
    });
    setSearchPatient('');
    setAvailableSlots([]);
  };

  const getStatusColor = (status) => {
    const colors = {
      scheduled: 'info',
      confirmed: 'primary',
      'checked-in': 'warning',
      'in-progress': 'secondary',
      completed: 'success',
      cancelled: 'error',
      'no-show': 'default'
    };
    return colors[status] || 'default';
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const formatTime = (time) => {
    return new Date(`2000-01-01T${time}`).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading && appointments.length === 0) {
    return <LoadingSpinner message="Loading appointments..." />;
  }

  return (
    <Box component="section" sx={{ width: '100%', minWidth: 0 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" gutterBottom fontWeight={700}>
            Appointments
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Manage patient appointments and schedules
          </Typography>
        </Box>
        {(hasRole('doctor') || hasRole('nurse') || hasRole('admin') || hasRole('receptionist')) && (
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setShowBookingDialog(true)}
          >
            Book Appointment
          </Button>
        )}
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Stats Cards */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography variant="h4" fontWeight={700}>
                    {appointments.filter(a => a.status === 'scheduled').length}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Scheduled
                  </Typography>
                </Box>
                <EventIcon sx={{ fontSize: 40, color: 'primary.main', opacity: 0.3 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography variant="h4" fontWeight={700}>
                    {appointments.filter(a => a.status === 'confirmed').length}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Confirmed
                  </Typography>
                </Box>
                <CheckCircleIcon sx={{ fontSize: 40, color: 'success.main', opacity: 0.3 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography variant="h4" fontWeight={700}>
                    {appointments.filter(a => a.status === 'checked-in').length}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Checked In
                  </Typography>
                </Box>
                <PersonIcon sx={{ fontSize: 40, color: 'warning.main', opacity: 0.3 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography variant="h4" fontWeight={700}>
                    {totalCount}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Total
                  </Typography>
                </Box>
                <CalendarIcon sx={{ fontSize: 40, color: 'info.main', opacity: 0.3 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Filters and Tabs */}
      <Paper sx={{ mb: 3 }}>
        <Tabs value={activeTab} onChange={(e, newValue) => setActiveTab(newValue)}>
          <Tab label="All" />
          <Tab label="Scheduled" />
          <Tab label="Confirmed" />
          <Tab label="Checked In" />
          <Tab label="Completed" />
          <Tab label="Cancelled" />
        </Tabs>
      </Paper>

      {/* Appointments Table */}
      <Paper>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Appointment #</TableCell>
                <TableCell>Patient</TableCell>
                <TableCell>Date & Time</TableCell>
                <TableCell>Doctor</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {appointments.map((appointment) => (
                <TableRow key={appointment.id} hover>
                  <TableCell>
                    <Typography variant="body2" fontWeight={600}>
                      {appointment.appointment_number}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Box>
                      <Typography variant="body2" fontWeight={600}>
                        {appointment.patient_first_name} {appointment.patient_last_name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {appointment.patient_uhid}
                      </Typography>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <CalendarIcon fontSize="small" color="action" />
                      <Box>
                        <Typography variant="body2">
                          {formatDate(appointment.scheduled_date)}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {formatTime(appointment.scheduled_time)}
                        </Typography>
                      </Box>
                    </Box>
                  </TableCell>
                  <TableCell>
                    {appointment.doctor_first_name ? (
                      <Typography variant="body2">
                        Dr. {appointment.doctor_first_name} {appointment.doctor_last_name}
                      </Typography>
                    ) : (
                      <Typography variant="body2" color="text.secondary">
                        Not assigned
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={appointment.appointment_type}
                      size="small"
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={appointment.status}
                      size="small"
                      color={getStatusColor(appointment.status)}
                    />
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                      {appointment.status === 'scheduled' && (
                        <Tooltip title="Confirm">
                          <IconButton
                            size="small"
                            color="primary"
                            onClick={() => handleConfirm(appointment.id)}
                          >
                            <CheckCircleIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                      {(appointment.status === 'scheduled' || appointment.status === 'confirmed') && (
                        <>
                          <Tooltip title="Reschedule">
                            <IconButton
                              size="small"
                              color="primary"
                              onClick={() => openRescheduleDialog(appointment)}
                            >
                              <RescheduleIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Check In">
                            <IconButton
                              size="small"
                              color="success"
                              onClick={() => handleCheckIn(appointment.id)}
                            >
                              <PersonIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </>
                      )}
                      {appointment.status !== 'cancelled' && appointment.status !== 'completed' && (
                        <Tooltip title="Cancel">
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => handleCancel(appointment.id, 'Cancelled by staff')}
                          >
                            <CancelIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                      <Tooltip title="View Details">
                        <IconButton
                          size="small"
                          onClick={() => {
                            setSelectedAppointment(appointment);
                            setShowDetailsDialog(true);
                          }}
                        >
                          <ViewIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          component="div"
          count={totalCount}
          page={page}
          onPageChange={(e, newPage) => setPage(newPage)}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={(e) => {
            setRowsPerPage(parseInt(e.target.value, 10));
            setPage(0);
          }}
        />
      </Paper>

      {/* Booking Dialog */}
      <Dialog
        open={showBookingDialog}
        onClose={() => setShowBookingDialog(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Book New Appointment</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            {/* Patient Search */}
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Search Patient"
                value={searchPatient}
                onChange={(e) => {
                  setSearchPatient(e.target.value);
                  searchPatients(e.target.value);
                }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon />
                    </InputAdornment>
                  )
                }}
              />
              {patients.length > 0 && (
                <Paper sx={{ mt: 1, maxHeight: 200, overflow: 'auto' }}>
                  {patients.map((patient) => (
                    <Box
                      key={patient.id}
                      sx={{
                        p: 1.5,
                        cursor: 'pointer',
                        '&:hover': { bgcolor: 'action.hover' },
                        borderBottom: '1px solid',
                        borderColor: 'divider'
                      }}
                      onClick={() => {
                        setBookingData({ ...bookingData, patient_id: patient.id });
                        setSearchPatient(`${patient.first_name} ${patient.last_name} (${patient.uhid})`);
                        setPatients([]);
                      }}
                    >
                      <Typography variant="body2" fontWeight={600}>
                        {patient.first_name} {patient.last_name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {patient.uhid} | {patient.phone}
                      </Typography>
                    </Box>
                  ))}
                </Paper>
              )}
            </Grid>

            {/* Appointment Type */}
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Appointment Type</InputLabel>
                <Select
                  value={bookingData.appointment_type}
                  onChange={(e) => setBookingData({ ...bookingData, appointment_type: e.target.value })}
                  label="Appointment Type"
                >
                  <MenuItem value="consultation">Consultation</MenuItem>
                  <MenuItem value="follow-up">Follow-up</MenuItem>
                  <MenuItem value="procedure">Procedure</MenuItem>
                  <MenuItem value="checkup">Checkup</MenuItem>
                  <MenuItem value="vaccination">Vaccination</MenuItem>
                  <MenuItem value="screening">Screening</MenuItem>
                </Select>
              </FormControl>
            </Grid>

            {/* Duration */}
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Duration</InputLabel>
                <Select
                  value={bookingData.duration_minutes}
                  onChange={(e) => setBookingData({ ...bookingData, duration_minutes: e.target.value })}
                  label="Duration"
                >
                  <MenuItem value={15}>15 minutes</MenuItem>
                  <MenuItem value={30}>30 minutes</MenuItem>
                  <MenuItem value={45}>45 minutes</MenuItem>
                  <MenuItem value={60}>1 hour</MenuItem>
                  <MenuItem value={90}>1.5 hours</MenuItem>
                  <MenuItem value={120}>2 hours</MenuItem>
                </Select>
              </FormControl>
            </Grid>

            {/* Doctor */}
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Doctor</InputLabel>
                <Select
                  value={bookingData.doctor_id}
                  onChange={(e) => {
                    setBookingData({ ...bookingData, doctor_id: e.target.value });
                    if (bookingData.scheduled_date) {
                      fetchAvailableSlots(e.target.value, bookingData.scheduled_date);
                    }
                  }}
                  label="Doctor"
                >
                  <MenuItem value="">
                    <em>None</em>
                  </MenuItem>
                  {doctors.map((doctor) => (
                    <MenuItem key={doctor.id} value={doctor.id}>
                      Dr. {doctor.first_name} {doctor.last_name}
                      {doctor.specialization && ` - ${doctor.specialization}`}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            {/* Clinic */}
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Clinic</InputLabel>
                <Select
                  value={bookingData.clinic_id}
                  onChange={(e) => setBookingData({ ...bookingData, clinic_id: e.target.value })}
                  label="Clinic"
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

            {/* Date */}
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                type="date"
                label="Date"
                value={bookingData.scheduled_date}
                onChange={(e) => {
                  setBookingData({ ...bookingData, scheduled_date: e.target.value });
                  if (bookingData.doctor_id) {
                    fetchAvailableSlots(bookingData.doctor_id, e.target.value);
                  }
                }}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>

            {/* Time */}
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                type="time"
                label="Time"
                value={bookingData.scheduled_time}
                onChange={(e) => setBookingData({ ...bookingData, scheduled_time: e.target.value })}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>

            {/* Available Slots */}
            {availableSlots.length > 0 && (
              <Grid item xs={12}>
                <Typography variant="subtitle2" gutterBottom>
                  Available Time Slots:
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                  {availableSlots
                    .filter(slot => slot.is_available)
                    .map((slot, index) => (
                      <Chip
                        key={index}
                        label={formatTime(slot.time_slot)}
                        onClick={() => setBookingData({ ...bookingData, scheduled_time: slot.time_slot })}
                        color={bookingData.scheduled_time === slot.time_slot ? 'primary' : 'default'}
                        variant={bookingData.scheduled_time === slot.time_slot ? 'filled' : 'outlined'}
                      />
                    ))}
                </Box>
              </Grid>
            )}

            {/* Reason */}
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Reason for Visit"
                value={bookingData.reason_for_visit}
                onChange={(e) => setBookingData({ ...bookingData, reason_for_visit: e.target.value })}
                multiline
                rows={3}
              />
            </Grid>

            {/* Payment Type */}
            <Grid item xs={12}>
              <FormControl fullWidth>
                <InputLabel>Payment Type</InputLabel>
                <Select
                  value={bookingData.payment_type}
                  onChange={(e) => setBookingData({ ...bookingData, payment_type: e.target.value })}
                  label="Payment Type"
                >
                  <MenuItem value="self-pay">Self Pay</MenuItem>
                  <MenuItem value="insurance">Insurance</MenuItem>
                  <MenuItem value="corporate">Corporate</MenuItem>
                  <MenuItem value="government">Government</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowBookingDialog(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleBookAppointment}
            disabled={!bookingData.patient_id || !bookingData.scheduled_date || !bookingData.scheduled_time}
          >
            Book Appointment
          </Button>
        </DialogActions>
      </Dialog>

      {/* Reschedule Dialog */}
      <Dialog
        open={showRescheduleDialog}
        onClose={() => setShowRescheduleDialog(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Reschedule Appointment</DialogTitle>
        <DialogContent>
          <Alert severity="info" sx={{ mt: 1, mb: 2 }}>
            Rescheduling does not check the patient in. Use Check In when the patient is ready to begin the visit.
          </Alert>
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                type="date"
                label="New Date"
                value={rescheduleData.scheduled_date}
                onChange={(event) => setRescheduleData(current => ({
                  ...current,
                  scheduled_date: event.target.value
                }))}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                type="time"
                label="New Time"
                value={rescheduleData.scheduled_time}
                onChange={(event) => setRescheduleData(current => ({
                  ...current,
                  scheduled_time: event.target.value
                }))}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowRescheduleDialog(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleReschedule}
            disabled={!rescheduleData.scheduled_date || !rescheduleData.scheduled_time}
          >
            Save New Date & Time
          </Button>
        </DialogActions>
      </Dialog>

      {/* Details Dialog */}
      <Dialog
        open={showDetailsDialog}
        onClose={() => setShowDetailsDialog(false)}
        maxWidth="sm"
        fullWidth
      >
        {selectedAppointment && (
          <>
            <DialogTitle>Appointment Details</DialogTitle>
            <DialogContent>
              <Grid container spacing={2} sx={{ mt: 1 }}>
                <Grid item xs={12}>
                  <Typography variant="subtitle2" color="text.secondary">
                    Appointment Number
                  </Typography>
                  <Typography variant="body1" fontWeight={600}>
                    {selectedAppointment.appointment_number}
                  </Typography>
                </Grid>
                <Grid item xs={12}>
                  <Typography variant="subtitle2" color="text.secondary">
                    Patient
                  </Typography>
                  <Typography variant="body1">
                    {selectedAppointment.patient_first_name} {selectedAppointment.patient_last_name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {selectedAppointment.patient_uhid}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="subtitle2" color="text.secondary">
                    Date
                  </Typography>
                  <Typography variant="body1">
                    {formatDate(selectedAppointment.scheduled_date)}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="subtitle2" color="text.secondary">
                    Time
                  </Typography>
                  <Typography variant="body1">
                    {formatTime(selectedAppointment.scheduled_time)}
                  </Typography>
                </Grid>
                <Grid item xs={12}>
                  <Typography variant="subtitle2" color="text.secondary">
                    Doctor
                  </Typography>
                  <Typography variant="body1">
                    {selectedAppointment.doctor_first_name
                      ? `Dr. ${selectedAppointment.doctor_first_name} ${selectedAppointment.doctor_last_name}`
                      : 'Not assigned'}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="subtitle2" color="text.secondary">
                    Type
                  </Typography>
                  <Typography variant="body1">
                    {selectedAppointment.appointment_type}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="subtitle2" color="text.secondary">
                    Status
                  </Typography>
                  <Chip
                    label={selectedAppointment.status}
                    size="small"
                    color={getStatusColor(selectedAppointment.status)}
                  />
                </Grid>
                {selectedAppointment.reason_for_visit && (
                  <Grid item xs={12}>
                    <Typography variant="subtitle2" color="text.secondary">
                      Reason for Visit
                    </Typography>
                    <Typography variant="body1">
                      {selectedAppointment.reason_for_visit}
                    </Typography>
                  </Grid>
                )}
              </Grid>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setShowDetailsDialog(false)}>Close</Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </Box>
  );
};

export default AppointmentsPage;

