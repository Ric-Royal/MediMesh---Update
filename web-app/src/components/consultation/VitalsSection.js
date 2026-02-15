import React from 'react';
import {
  Grid,
  TextField,
  Typography,
  Box,
  InputAdornment,
  Paper,
} from '@mui/material';
import {
  Favorite as HeartIcon,
  Thermostat as TempIcon,
  Air as RespiratoryIcon,
  MonitorHeart as OxygenIcon,
  FitnessCenter as WeightIcon,
  Height as HeightIcon,
} from '@mui/icons-material';

const VitalsSection = ({
  vitals,
  chiefComplaint,
  historyPresentIllness,
  pastMedicalHistory,
  familyHistory,
  socialHistory,
  allergies,
  currentMedications,
  onChange,
}) => {
  const handleVitalChange = (field, value) => {
    onChange({
      vitals: { ...vitals, [field]: value },
      chiefComplaint,
      historyPresentIllness,
      pastMedicalHistory,
      familyHistory,
      socialHistory,
      allergies,
      currentMedications,
    });
  };

  const handleFieldChange = (field, value) => {
    onChange({
      vitals,
      [field]: value,
      chiefComplaint: field === 'chiefComplaint' ? value : chiefComplaint,
      historyPresentIllness: field === 'historyPresentIllness' ? value : historyPresentIllness,
      pastMedicalHistory: field === 'pastMedicalHistory' ? value : pastMedicalHistory,
      familyHistory: field === 'familyHistory' ? value : familyHistory,
      socialHistory: field === 'socialHistory' ? value : socialHistory,
      allergies: field === 'allergies' ? value : allergies,
      currentMedications: field === 'currentMedications' ? value : currentMedications,
    });
  };

  return (
    <Box>
      <Typography variant="h6" gutterBottom sx={{ mb: 3 }}>
        Vital Signs
      </Typography>

      <Paper elevation={1} sx={{ p: 3, mb: 3, bgcolor: 'background.default' }}>
        <Grid container spacing={3}>
          <Grid item xs={12} sm={6} md={4}>
            <TextField
              fullWidth
              label="Blood Pressure"
              value={vitals.bloodPressure}
              onChange={(e) => handleVitalChange('bloodPressure', e.target.value)}
              placeholder="120/80"
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <HeartIcon color="error" />
                  </InputAdornment>
                ),
                endAdornment: <InputAdornment position="end">mmHg</InputAdornment>,
              }}
            />
          </Grid>

          <Grid item xs={12} sm={6} md={4}>
            <TextField
              fullWidth
              label="Temperature"
              type="number"
              value={vitals.temperature}
              onChange={(e) => handleVitalChange('temperature', e.target.value)}
              placeholder="37.0"
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <TempIcon color="warning" />
                  </InputAdornment>
                ),
                endAdornment: <InputAdornment position="end">°C</InputAdornment>,
              }}
            />
          </Grid>

          <Grid item xs={12} sm={6} md={4}>
            <TextField
              fullWidth
              label="Pulse Rate"
              type="number"
              value={vitals.pulse}
              onChange={(e) => handleVitalChange('pulse', e.target.value)}
              placeholder="80"
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <HeartIcon color="primary" />
                  </InputAdornment>
                ),
                endAdornment: <InputAdornment position="end">bpm</InputAdornment>,
              }}
            />
          </Grid>

          <Grid item xs={12} sm={6} md={4}>
            <TextField
              fullWidth
              label="Respiratory Rate"
              type="number"
              value={vitals.respiratoryRate}
              onChange={(e) => handleVitalChange('respiratoryRate', e.target.value)}
              placeholder="18"
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <RespiratoryIcon color="info" />
                  </InputAdornment>
                ),
                endAdornment: <InputAdornment position="end">/min</InputAdornment>,
              }}
            />
          </Grid>

          <Grid item xs={12} sm={6} md={4}>
            <TextField
              fullWidth
              label="Oxygen Saturation"
              type="number"
              value={vitals.oxygenSaturation}
              onChange={(e) => handleVitalChange('oxygenSaturation', e.target.value)}
              placeholder="98"
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <OxygenIcon color="success" />
                  </InputAdornment>
                ),
                endAdornment: <InputAdornment position="end">%</InputAdornment>,
              }}
            />
          </Grid>

          <Grid item xs={12} sm={6} md={4}>
            <TextField
              fullWidth
              label="Weight"
              type="number"
              value={vitals.weight}
              onChange={(e) => handleVitalChange('weight', e.target.value)}
              placeholder="70.5"
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <WeightIcon color="primary" />
                  </InputAdornment>
                ),
                endAdornment: <InputAdornment position="end">kg</InputAdornment>,
              }}
            />
          </Grid>

          <Grid item xs={12} sm={6} md={4}>
            <TextField
              fullWidth
              label="Height"
              type="number"
              value={vitals.height}
              onChange={(e) => handleVitalChange('height', e.target.value)}
              placeholder="175"
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <HeightIcon color="primary" />
                  </InputAdornment>
                ),
                endAdornment: <InputAdornment position="end">cm</InputAdornment>,
              }}
            />
          </Grid>

          <Grid item xs={12} sm={6} md={4}>
            <TextField
              fullWidth
              label="BMI"
              value={vitals.bmi}
              disabled
              InputProps={{
                endAdornment: <InputAdornment position="end">kg/m²</InputAdornment>,
              }}
              helperText={
                vitals.bmi 
                  ? vitals.bmi < 18.5 ? 'Underweight' 
                    : vitals.bmi < 25 ? 'Normal' 
                    : vitals.bmi < 30 ? 'Overweight' 
                    : 'Obese'
                  : ''
              }
            />
          </Grid>
        </Grid>
      </Paper>

      <Typography variant="h6" gutterBottom sx={{ mt: 4, mb: 2 }}>
        Clinical History
      </Typography>

      <Grid container spacing={3}>
        <Grid item xs={12}>
          <TextField
            fullWidth
            label="Chief Complaint"
            value={chiefComplaint}
            onChange={(e) => handleFieldChange('chiefComplaint', e.target.value)}
            multiline
            rows={2}
            placeholder="Patient's main reason for visit"
          />
        </Grid>

        <Grid item xs={12}>
          <TextField
            fullWidth
            label="History of Present Illness"
            value={historyPresentIllness}
            onChange={(e) => handleFieldChange('historyPresentIllness', e.target.value)}
            multiline
            rows={3}
            placeholder="Detailed description of current illness..."
          />
        </Grid>

        <Grid item xs={12} sm={6}>
          <TextField
            fullWidth
            label="Past Medical History"
            value={pastMedicalHistory}
            onChange={(e) => handleFieldChange('pastMedicalHistory', e.target.value)}
            multiline
            rows={2}
            placeholder="Previous illnesses, surgeries, hospitalizations..."
          />
        </Grid>

        <Grid item xs={12} sm={6}>
          <TextField
            fullWidth
            label="Family History"
            value={familyHistory}
            onChange={(e) => handleFieldChange('familyHistory', e.target.value)}
            multiline
            rows={2}
            placeholder="Family medical history..."
          />
        </Grid>

        <Grid item xs={12} sm={6}>
          <TextField
            fullWidth
            label="Social History"
            value={socialHistory}
            onChange={(e) => handleFieldChange('socialHistory', e.target.value)}
            multiline
            rows={2}
            placeholder="Smoking, alcohol, occupation..."
          />
        </Grid>

        <Grid item xs={12} sm={6}>
          <TextField
            fullWidth
            label="Allergies"
            value={allergies}
            onChange={(e) => handleFieldChange('allergies', e.target.value)}
            multiline
            rows={2}
            placeholder="Drug allergies, food allergies..."
            error={allergies?.toLowerCase().includes('penicillin')}
            helperText={allergies?.toLowerCase().includes('penicillin') ? '⚠️ Penicillin allergy noted!' : ''}
          />
        </Grid>

        <Grid item xs={12}>
          <TextField
            fullWidth
            label="Current Medications"
            value={currentMedications}
            onChange={(e) => handleFieldChange('currentMedications', e.target.value)}
            multiline
            rows={2}
            placeholder="Medications patient is currently taking..."
          />
        </Grid>
      </Grid>
    </Box>
  );
};

export default VitalsSection;

