import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Autocomplete,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Grid,
  CircularProgress,
  Alert,
  Box,
  Typography,
  Chip
} from '@mui/material';
import { useNotification } from '../../contexts/NotificationContext';
import API_CONFIG from '../../config/api';

const AddPatientToQueueDialog = ({ open, onClose, onSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [patients, setPatients] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [clinics, setClinics] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [encounterData, setEncounterData] = useState({
    encounterType: 'outpatient',
    chiefComplaint: '',
    clinicId: '',
    doctorId: '',
    paymentType: 'self-pay',
    triageLevel: 'routine'
  });

  const { notifySuccess, notifyError } = useNotification();

  // Fetch clinics and doctors on mount
  useEffect(() => {
    if (open) {
      fetchClinics();
      fetchDoctors();
    }
  }, [open]);

  // Search patients as user types
  useEffect(() => {
    if (searchTerm && searchTerm.length >= 2) {
      searchPatients(searchTerm);
    }
  }, [searchTerm]);

  const fetchClinics = async () => {
    try {
      const response = await fetch(`${API_CONFIG.endpoints.clinics}`, {
        headers: API_CONFIG.getAuthHeaders()
      });
      if (response.ok) {
        const data = await response.json();
        console.log('Clinics fetched:', data);
        setClinics(data.data || []);
      } else {
        console.error('Failed to fetch clinics:', response.status, response.statusText);
        const errorData = await response.json().catch(() => ({}));
        console.error('Error details:', errorData);
      }
    } catch (error) {
      console.error('Error fetching clinics:', error);
    }
  };

  const fetchDoctors = async () => {
    try {
      const response = await fetch(`${API_CONFIG.endpoints.staff}?role=doctor`, {
        headers: API_CONFIG.getAuthHeaders()
      });
      if (response.ok) {
        const data = await response.json();
        console.log('Doctors fetched:', data);
        setDoctors(data.data || []);
      } else {
        console.error('Failed to fetch doctors:', response.status, response.statusText);
        const errorData = await response.json().catch(() => ({}));
        console.error('Error details:', errorData);
      }
    } catch (error) {
      console.error('Error fetching doctors:', error);
    }
  };

  const searchPatients = async (term) => {
    setSearching(true);
    try {
      const response = await fetch(
        `${API_CONFIG.endpoints.patients}?search=${encodeURIComponent(term)}&limit=20`,
        {
          headers: API_CONFIG.getAuthHeaders()
        }
      );
      if (response.ok) {
        const data = await response.json();
        setPatients(data.data || []);
      }
    } catch (error) {
      console.error('Error searching patients:', error);
    } finally {
      setSearching(false);
    }
  };

  const handleSubmit = async () => {
    if (!selectedPatient) {
      notifyError('Please select a patient');
      return;
    }

    if (!encounterData.chiefComplaint) {
      notifyError('Please enter chief complaint');
      return;
    }

    setLoading(true);
    try {
      // Create encounter
      const encounterResponse = await fetch(`${API_CONFIG.endpoints.encounters}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...API_CONFIG.getAuthHeaders()
        },
        body: JSON.stringify({
          patientId: selectedPatient.id,
          encounterType: encounterData.encounterType,
          chiefComplaint: encounterData.chiefComplaint,
          clinicId: encounterData.clinicId || null,
          doctorId: encounterData.doctorId || null,
          paymentType: encounterData.paymentType,
          triageLevel: encounterData.triageLevel,
          status: 'registered'
        })
      });

      if (encounterResponse.ok) {
        const result = await encounterResponse.json();
        notifySuccess(`${selectedPatient.first_name} ${selectedPatient.last_name} added to queue successfully!`);
        handleClose();
        if (onSuccess) onSuccess();
      } else {
        const error = await encounterResponse.json();
        notifyError(error.error || 'Failed to add patient to queue');
      }
    } catch (error) {
      console.error('Error adding patient to queue:', error);
      notifyError('Failed to add patient to queue');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setSelectedPatient(null);
    setSearchTerm('');
    setPatients([]);
    setEncounterData({
      encounterType: 'outpatient',
      chiefComplaint: '',
      clinicId: '',
      doctorId: '',
      paymentType: 'self-pay',
      triageLevel: 'routine'
    });
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>Add Existing Patient to Queue</DialogTitle>
      <DialogContent>
        <Box sx={{ pt: 2 }}>
          <Alert severity="info" sx={{ mb: 3 }}>
            Search for an existing patient and register a new visit to add them to the consultation queue.
          </Alert>

          {/* Patient Search */}
          <Autocomplete
            options={patients}
            getOptionLabel={(option) => 
              `${option.first_name} ${option.last_name} - ${option.uhid || option.patient_id}`
            }
            value={selectedPatient}
            onChange={(event, newValue) => setSelectedPatient(newValue)}
            onInputChange={(event, newInputValue) => setSearchTerm(newInputValue)}
            loading={searching}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Search Patient"
                placeholder="Type name or UHID..."
                fullWidth
                InputProps={{
                  ...params.InputProps,
                  endAdornment: (
                    <>
                      {searching ? <CircularProgress color="inherit" size={20} /> : null}
                      {params.InputProps.endAdornment}
                    </>
                  ),
                }}
              />
            )}
            renderOption={(props, option) => (
              <li {...props}>
                <Box>
                  <Typography variant="body1">
                    {option.first_name} {option.last_name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {option.uhid || option.patient_id} • {option.phone || 'No phone'}
                  </Typography>
                </Box>
              </li>
            )}
            sx={{ mb: 3 }}
          />

          {/* Selected Patient Info */}
          {selectedPatient && (
            <Box sx={{ mb: 3, p: 2, bgcolor: 'primary.light', borderRadius: 1 }}>
              <Typography variant="subtitle2" gutterBottom>
                Selected Patient:
              </Typography>
              <Typography variant="h6">
                {selectedPatient.first_name} {selectedPatient.last_name}
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                <Chip label={selectedPatient.uhid || selectedPatient.patient_id} size="small" />
                <Chip label={selectedPatient.gender} size="small" />
                {selectedPatient.phone && <Chip label={selectedPatient.phone} size="small" />}
              </Box>
            </Box>
          )}

          {/* Encounter Details */}
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <FormControl fullWidth>
                <InputLabel>Encounter Type</InputLabel>
                <Select
                  value={encounterData.encounterType}
                  label="Encounter Type"
                  onChange={(e) => setEncounterData({ ...encounterData, encounterType: e.target.value })}
                >
                  <MenuItem value="outpatient">Outpatient</MenuItem>
                  <MenuItem value="emergency">Emergency</MenuItem>
                  <MenuItem value="follow-up">Follow-up</MenuItem>
                  <MenuItem value="inpatient">Inpatient</MenuItem>
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12} md={6}>
              <FormControl fullWidth>
                <InputLabel>Triage Level</InputLabel>
                <Select
                  value={encounterData.triageLevel}
                  label="Triage Level"
                  onChange={(e) => setEncounterData({ ...encounterData, triageLevel: e.target.value })}
                >
                  <MenuItem value="routine">Routine</MenuItem>
                  <MenuItem value="urgent">Urgent</MenuItem>
                  <MenuItem value="emergency">Emergency</MenuItem>
                  <MenuItem value="critical">Critical</MenuItem>
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Chief Complaint"
                placeholder="Main reason for visit..."
                value={encounterData.chiefComplaint}
                onChange={(e) => setEncounterData({ ...encounterData, chiefComplaint: e.target.value })}
                multiline
                rows={2}
                required
              />
            </Grid>

            <Grid item xs={12} md={6}>
              <FormControl fullWidth>
                <InputLabel>Clinic</InputLabel>
                <Select
                  value={encounterData.clinicId}
                  label="Clinic"
                  onChange={(e) => setEncounterData({ ...encounterData, clinicId: e.target.value })}
                >
                  <MenuItem value="">None</MenuItem>
                  {clinics.map((clinic) => (
                    <MenuItem key={clinic.id} value={clinic.id}>
                      {clinic.clinic_name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12} md={6}>
              <FormControl fullWidth>
                <InputLabel>Doctor</InputLabel>
                <Select
                  value={encounterData.doctorId}
                  label="Doctor"
                  onChange={(e) => setEncounterData({ ...encounterData, doctorId: e.target.value })}
                >
                  <MenuItem value="">None</MenuItem>
                  {doctors.map((doctor) => (
                    <MenuItem key={doctor.id} value={doctor.id}>
                      Dr. {doctor.first_name} {doctor.last_name}
                      {doctor.specialization && ` (${doctor.specialization})`}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12}>
              <FormControl fullWidth>
                <InputLabel>Payment Type</InputLabel>
                <Select
                  value={encounterData.paymentType}
                  label="Payment Type"
                  onChange={(e) => setEncounterData({ ...encounterData, paymentType: e.target.value })}
                >
                  <MenuItem value="self-pay">Self Pay</MenuItem>
                  <MenuItem value="insurance">Insurance</MenuItem>
                  <MenuItem value="corporate">Corporate</MenuItem>
                  <MenuItem value="government">Government</MenuItem>
                  <MenuItem value="ngo">NGO</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={loading}>
          Cancel
        </Button>
        <Button 
          onClick={handleSubmit} 
          variant="contained" 
          disabled={loading || !selectedPatient}
        >
          {loading ? <CircularProgress size={24} /> : 'Register Visit & Add to Queue'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default AddPatientToQueueDialog;

