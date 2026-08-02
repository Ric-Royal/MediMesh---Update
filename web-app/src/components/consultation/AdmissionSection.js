import React, { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  CircularProgress,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import API_CONFIG from '../../config/api';

const AdmissionSection = ({ patientDisposition, admission, canAdmit, onChange }) => {
  const [wards, setWards] = useState([]);
  const [beds, setBeds] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (patientDisposition !== 'admit') return;
    let active = true;
    setLoading(true);
    fetch(API_CONFIG.endpoints.wards, { headers: API_CONFIG.getAuthHeaders() })
      .then(async response => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Unable to load wards');
        if (active) setWards(result.data || []);
      })
      .catch(fetchError => active && setError(fetchError.message))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [patientDisposition]);

  useEffect(() => {
    if (patientDisposition !== 'admit' || !admission.wardId) {
      setBeds([]);
      return;
    }
    let active = true;
    setLoading(true);
    setError('');
    fetch(`${API_CONFIG.endpoints.wards}/${admission.wardId}/occupancy`, {
      headers: API_CONFIG.getAuthHeaders(),
    })
      .then(async response => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Unable to load ward beds');
        if (active) setBeds((result.data || []).filter(bed => bed.status === 'available'));
      })
      .catch(fetchError => active && setError(fetchError.message))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [admission.wardId, patientDisposition]);

  const updateAdmission = patch => onChange({
    patientDisposition,
    admission: { ...admission, ...patch },
  });

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h6">Patient disposition</Typography>
        <Typography variant="body2" color="text.secondary">
          Choose whether the patient continues as an outpatient or is handed over to an inpatient ward.
        </Typography>
      </Box>

      <FormControl fullWidth>
        <InputLabel id="patient-disposition-label">Disposition</InputLabel>
        <Select
          labelId="patient-disposition-label"
          value={patientDisposition}
          label="Disposition"
          onChange={event => onChange({
            patientDisposition: event.target.value,
            admission: event.target.value === 'admit' ? admission : {
              wardId: '', bedId: '', admissionType: 'elective', reason: '', expectedDischargeDate: '',
            },
          })}
        >
          <MenuItem value="outpatient">Outpatient / continue to billing</MenuItem>
          <MenuItem value="admit">Admit to ward</MenuItem>
        </Select>
      </FormControl>

      {patientDisposition === 'admit' && (
        <>
          {!canAdmit && (
            <Alert severity="info">
              Record the final diagnosis and select “Final diagnosis established” before assigning a ward bed.
            </Alert>
          )}
          {error && <Alert severity="error">{error}</Alert>}
          {loading && <CircularProgress size={24} />}
          <FormControl fullWidth disabled={!canAdmit || loading} required>
            <InputLabel id="ward-label">Ward</InputLabel>
            <Select
              labelId="ward-label"
              value={admission.wardId}
              label="Ward"
              onChange={event => updateAdmission({ wardId: event.target.value, bedId: '' })}
            >
              {wards.map(ward => (
                <MenuItem key={ward.id} value={ward.id}>
                  {ward.ward_name} ({Number(ward.total_beds) - Number(ward.occupied_beds || 0)} available)
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl fullWidth disabled={!canAdmit || !admission.wardId || loading} required>
            <InputLabel id="bed-label">Available bed</InputLabel>
            <Select
              labelId="bed-label"
              value={admission.bedId}
              label="Available bed"
              onChange={event => updateAdmission({ bedId: event.target.value })}
            >
              {beds.map(bed => (
                <MenuItem key={bed.id} value={bed.id}>
                  Bed {bed.bed_number}{bed.bed_type ? ` - ${bed.bed_type}` : ''}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          {admission.wardId && !loading && beds.length === 0 && (
            <Alert severity="warning">This ward currently has no available bed.</Alert>
          )}
          <FormControl fullWidth disabled={!canAdmit} required>
            <InputLabel id="admission-type-label">Admission type</InputLabel>
            <Select
              labelId="admission-type-label"
              value={admission.admissionType}
              label="Admission type"
              onChange={event => updateAdmission({ admissionType: event.target.value })}
            >
              <MenuItem value="elective">Elective</MenuItem>
              <MenuItem value="emergency">Emergency</MenuItem>
              <MenuItem value="observation">Observation</MenuItem>
              <MenuItem value="day-case">Day case</MenuItem>
              <MenuItem value="transfer">Transfer</MenuItem>
            </Select>
          </FormControl>
          <TextField
            fullWidth
            required
            multiline
            minRows={3}
            disabled={!canAdmit}
            label="Clinical reason for admission"
            value={admission.reason}
            onChange={event => updateAdmission({ reason: event.target.value })}
          />
          <TextField
            fullWidth
            type="date"
            disabled={!canAdmit}
            label="Expected discharge date (optional)"
            InputLabelProps={{ shrink: true }}
            value={admission.expectedDischargeDate}
            onChange={event => updateAdmission({ expectedDischargeDate: event.target.value })}
          />
        </>
      )}
    </Stack>
  );
};

export default AdmissionSection;
