import React, { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Typography,
} from '@mui/material';
import API_CONFIG from '../../config/api';
import { useNotification } from '../../contexts/NotificationContext';
import VitalsSection from '../consultation/VitalsSection';

const emptyVitals = {
  bloodPressure: '',
  temperature: '',
  pulse: '',
  respiratoryRate: '',
  oxygenSaturation: '',
  weight: '',
  height: '',
  bmi: '',
};

const TriageForm = ({ open, onClose, queueEntry, encounter, patient, onSuccess }) => {
  const { notifySuccess, notifyError } = useNotification();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    triageLevel: encounter?.triage_level || 'routine',
    vitals: encounter?.vital_signs || emptyVitals,
    chiefComplaint: encounter?.chief_complaint || '',
    historyPresentIllness: encounter?.presenting_symptoms || '',
    pastMedicalHistory: '',
    familyHistory: '',
    socialHistory: '',
    allergies: '',
    currentMedications: '',
    notes: '',
  });

  useEffect(() => {
    const weight = Number(formData.vitals.weight);
    const height = Number(formData.vitals.height);
    if (weight > 0 && height > 0) {
      const bmi = (weight / ((height / 100) ** 2)).toFixed(1);
      if (formData.vitals.bmi !== bmi) {
        setFormData(current => ({
          ...current,
          vitals: { ...current.vitals, bmi },
        }));
      }
    }
  }, [formData.vitals.bmi, formData.vitals.height, formData.vitals.weight]);

  const handleSubmit = async () => {
    if (!formData.chiefComplaint.trim()) {
      notifyError('Record the reason for this visit before completing triage.');
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(
        `${API_CONFIG.baseURL}/api/queue/${queueEntry.id}/triage-complete`,
        {
          method: 'POST',
          headers: API_CONFIG.getAuthHeaders(),
          body: JSON.stringify(formData),
        }
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to complete triage');

      notifySuccess('Triage recorded. The patient is now waiting for the assigned clinician.');
      onSuccess?.(result.data);
      onClose();
    } catch (error) {
      notifyError(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>
        <Typography variant="h5">
          Triage assessment — {patient?.first_name} {patient?.last_name}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Record the nurse-owned assessment before handing this visit to consultation.
        </Typography>
      </DialogTitle>
      <DialogContent dividers>
        <Alert severity="info" sx={{ mb: 3 }}>
          The assigned clinician will receive these observations as read-only clinical context.
        </Alert>
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={12} md={4}>
            <FormControl fullWidth>
              <InputLabel>Triage priority</InputLabel>
              <Select
                value={formData.triageLevel}
                label="Triage priority"
                onChange={event => setFormData(current => ({
                  ...current,
                  triageLevel: event.target.value,
                }))}
              >
                <MenuItem value="routine">Routine</MenuItem>
                <MenuItem value="urgent">Urgent</MenuItem>
                <MenuItem value="emergency">Emergency</MenuItem>
                <MenuItem value="critical">Critical</MenuItem>
              </Select>
            </FormControl>
          </Grid>
        </Grid>
        <VitalsSection
          vitals={formData.vitals}
          chiefComplaint={formData.chiefComplaint}
          historyPresentIllness={formData.historyPresentIllness}
          pastMedicalHistory={formData.pastMedicalHistory}
          familyHistory={formData.familyHistory}
          socialHistory={formData.socialHistory}
          allergies={formData.allergies}
          currentMedications={formData.currentMedications}
          onChange={data => setFormData(current => ({ ...current, ...data }))}
        />
        <Box sx={{ mt: 3 }}>
          <TextField
            fullWidth
            multiline
            rows={3}
            label="Triage notes"
            value={formData.notes}
            onChange={event => setFormData(current => ({ ...current, notes: event.target.value }))}
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={loading}>Close</Button>
        <Button variant="contained" onClick={handleSubmit} disabled={loading}>
          {loading ? <CircularProgress size={20} /> : 'Complete Triage & Hand to Clinician'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default TriageForm;
