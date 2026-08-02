import React from 'react';
import {
  Grid,
  TextField,
  Typography,
  Box,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';
import { CLINICAL_OUTCOMES } from '../../utils/consultationWorkflow';

const DiagnosisSection = ({
  provisionalDiagnosis,
  differentialDiagnosis,
  finalDiagnosis,
  treatmentPlan,
  followUpInstructions,
  clinicalOutcome,
  investigationReason,
  hasDiagnostics,
  onChange,
}) => {
  const handleChange = (field, value) => {
    onChange({
      provisionalDiagnosis: field === 'provisionalDiagnosis' ? value : provisionalDiagnosis,
      differentialDiagnosis: field === 'differentialDiagnosis' ? value : differentialDiagnosis,
      finalDiagnosis: field === 'finalDiagnosis' ? value : finalDiagnosis,
      treatmentPlan: field === 'treatmentPlan' ? value : treatmentPlan,
      followUpInstructions: field === 'followUpInstructions' ? value : followUpInstructions,
      clinicalOutcome: field === 'clinicalOutcome' ? value : clinicalOutcome,
      investigationReason: field === 'investigationReason' ? value : investigationReason,
    });
  };

  return (
    <Box>
      <Typography variant="h6" gutterBottom sx={{ mb: 3 }}>
        Assessment & Plan
      </Typography>

      <Alert severity="info" sx={{ mb: 3 }}>
        A final diagnosis is not required to request investigations. Record the clinical reason,
        then review the results before prescribing medication.
      </Alert>

      <Grid container spacing={3}>
        <Grid item xs={12}>
          <FormControl fullWidth required>
            <InputLabel>Clinical Outcome</InputLabel>
            <Select
              value={clinicalOutcome}
              onChange={(e) => handleChange('clinicalOutcome', e.target.value)}
              label="Clinical Outcome"
            >
              <MenuItem value={CLINICAL_OUTCOMES.INVESTIGATIONS_PENDING}>
                Awaiting laboratory or imaging results
              </MenuItem>
              <MenuItem value={CLINICAL_OUTCOMES.DIAGNOSIS_CONFIRMED} disabled={hasDiagnostics}>
                Final diagnosis established
              </MenuItem>
              <MenuItem value={CLINICAL_OUTCOMES.NO_TREATMENT_REQUIRED} disabled={hasDiagnostics}>
                No treatment or medication required
              </MenuItem>
            </Select>
          </FormControl>
        </Grid>

        {(hasDiagnostics || clinicalOutcome === CLINICAL_OUTCOMES.INVESTIGATIONS_PENDING) && (
          <Grid item xs={12}>
            <TextField
              fullWidth
              required
              label="Reason for Investigation"
              value={investigationReason}
              onChange={(e) => handleChange('investigationReason', e.target.value)}
              multiline
              rows={2}
              placeholder="Symptoms, examination findings, clinical impression, or question to be answered..."
              helperText="A clinical indication is required; a confirmed diagnosis is not."
            />
          </Grid>
        )}

        <Grid item xs={12}>
          <TextField
            fullWidth
            label="Provisional Diagnosis or Clinical Impression"
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
            required={clinicalOutcome === CLINICAL_OUTCOMES.DIAGNOSIS_CONFIRMED}
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
          <strong>Workflow:</strong> Investigations return to the doctor for results review.
          Medication becomes available only after the final diagnosis is recorded. If the
          patient needs no treatment, select that outcome and proceed without medication.
        </Typography>
      </Box>
    </Box>
  );
};

export default DiagnosisSection;

