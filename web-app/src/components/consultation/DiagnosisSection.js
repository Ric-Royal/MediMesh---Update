import React from 'react';
import {
  Grid,
  TextField,
  Typography,
  Box,
  Alert,
} from '@mui/material';

const DiagnosisSection = ({
  provisionalDiagnosis,
  differentialDiagnosis,
  finalDiagnosis,
  treatmentPlan,
  followUpInstructions,
  onChange,
}) => {
  const handleChange = (field, value) => {
    onChange({
      provisionalDiagnosis: field === 'provisionalDiagnosis' ? value : provisionalDiagnosis,
      differentialDiagnosis: field === 'differentialDiagnosis' ? value : differentialDiagnosis,
      finalDiagnosis: field === 'finalDiagnosis' ? value : finalDiagnosis,
      treatmentPlan: field === 'treatmentPlan' ? value : treatmentPlan,
      followUpInstructions: field === 'followUpInstructions' ? value : followUpInstructions,
    });
  };

  return (
    <Box>
      <Typography variant="h6" gutterBottom sx={{ mb: 3 }}>
        Assessment & Plan
      </Typography>

      <Alert severity="info" sx={{ mb: 3 }}>
        <strong>Required:</strong> At least one diagnosis (provisional or final) must be entered before ordering services.
      </Alert>

      <Grid container spacing={3}>
        <Grid item xs={12}>
          <TextField
            fullWidth
            required
            label="Provisional Diagnosis"
            value={provisionalDiagnosis}
            onChange={(e) => handleChange('provisionalDiagnosis', e.target.value)}
            multiline
            rows={2}
            placeholder="Initial diagnosis based on history and examination..."
            helperText="Working diagnosis that may be confirmed with investigations"
          />
        </Grid>

        <Grid item xs={12}>
          <TextField
            fullWidth
            label="Differential Diagnosis"
            value={differentialDiagnosis}
            onChange={(e) => handleChange('differentialDiagnosis', e.target.value)}
            multiline
            rows={2}
            placeholder="Other possible diagnoses to consider..."
            helperText="Alternative diagnoses that should be ruled out"
          />
        </Grid>

        <Grid item xs={12}>
          <TextField
            fullWidth
            label="Final Diagnosis"
            value={finalDiagnosis}
            onChange={(e) => handleChange('finalDiagnosis', e.target.value)}
            multiline
            rows={2}
            placeholder="Confirmed diagnosis after investigations (if available)..."
            helperText="Leave blank if awaiting investigation results"
          />
        </Grid>

        <Grid item xs={12}>
          <TextField
            fullWidth
            required
            label="Treatment Plan"
            value={treatmentPlan}
            onChange={(e) => handleChange('treatmentPlan', e.target.value)}
            multiline
            rows={4}
            placeholder="Detailed treatment plan including medications, procedures, lifestyle modifications..."
            helperText="Include all aspects of patient management"
          />
        </Grid>

        <Grid item xs={12}>
          <TextField
            fullWidth
            label="Follow-up Instructions"
            value={followUpInstructions}
            onChange={(e) => handleChange('followUpInstructions', e.target.value)}
            multiline
            rows={3}
            placeholder="When to return, warning signs to watch for, follow-up appointments..."
            helperText="Clear instructions for patient on next steps"
          />
        </Grid>
      </Grid>

      <Box sx={{ mt: 3, p: 2, bgcolor: 'warning.light', borderRadius: 1 }}>
        <Typography variant="body2">
          ⚠️ <strong>Important:</strong> After entering diagnosis, proceed to the next tabs to order lab tests, radiology studies, or medications as needed.
        </Typography>
      </Box>
    </Box>
  );
};

export default DiagnosisSection;

