import React from 'react';
import {
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
  Divider,
  Grid,
  Stack,
  Typography,
} from '@mui/material';

const valueOrDash = (value, suffix = '') =>
  value === null || value === undefined || value === '' ? '—' : `${value}${suffix}`;

const ClinicalContextSection = ({ context, loading, error, isResultsReview }) => {
  if (loading) return <Alert severity="info">Loading the shared clinical record…</Alert>;
  if (error) return <Alert severity="error">{error}</Alert>;

  const triage = context?.triage;
  const vitals = triage?.vital_signs || {};
  const labResults = context?.labResults || [];
  const radiologyResults = context?.radiologyResults || [];
  const consultations = context?.consultations || [];
  const prescriptions = context?.prescriptions || [];

  return (
    <Stack spacing={3}>
      {isResultsReview && (
        <Alert severity="warning">
          Diagnostic results are ready. Review them here, update the diagnosis and plan,
          then place any final prescription or follow-up order.
        </Alert>
      )}

      <Card variant="outlined">
        <CardContent>
          <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
            <Typography variant="h6">Triage handoff</Typography>
            <Chip
              size="small"
              color={triage ? 'success' : 'warning'}
              label={triage ? `${triage.triage_level} priority` : 'No triage assessment'}
            />
          </Stack>
          {triage ? (
            <>
              <Grid container spacing={2}>
                <Grid item xs={6} md={3}>
                  <Typography variant="caption" color="text.secondary">Blood pressure</Typography>
                  <Typography>{valueOrDash(vitals.bloodPressure, ' mmHg')}</Typography>
                </Grid>
                <Grid item xs={6} md={3}>
                  <Typography variant="caption" color="text.secondary">Temperature</Typography>
                  <Typography>{valueOrDash(vitals.temperature, ' °C')}</Typography>
                </Grid>
                <Grid item xs={6} md={3}>
                  <Typography variant="caption" color="text.secondary">Pulse</Typography>
                  <Typography>{valueOrDash(vitals.pulse, ' bpm')}</Typography>
                </Grid>
                <Grid item xs={6} md={3}>
                  <Typography variant="caption" color="text.secondary">Oxygen saturation</Typography>
                  <Typography>{valueOrDash(vitals.oxygenSaturation, '%')}</Typography>
                </Grid>
                <Grid item xs={6} md={3}>
                  <Typography variant="caption" color="text.secondary">Respiratory rate</Typography>
                  <Typography>{valueOrDash(vitals.respiratoryRate, ' /min')}</Typography>
                </Grid>
                <Grid item xs={6} md={3}>
                  <Typography variant="caption" color="text.secondary">Weight</Typography>
                  <Typography>{valueOrDash(vitals.weight, ' kg')}</Typography>
                </Grid>
                <Grid item xs={6} md={3}>
                  <Typography variant="caption" color="text.secondary">Height</Typography>
                  <Typography>{valueOrDash(vitals.height, ' cm')}</Typography>
                </Grid>
                <Grid item xs={6} md={3}>
                  <Typography variant="caption" color="text.secondary">BMI</Typography>
                  <Typography>{valueOrDash(vitals.bmi)}</Typography>
                </Grid>
              </Grid>
              <Divider sx={{ my: 2 }} />
              <Typography variant="subtitle2">Chief complaint</Typography>
              <Typography sx={{ whiteSpace: 'pre-wrap' }}>
                {valueOrDash(triage.chief_complaint)}
              </Typography>
              <Typography variant="subtitle2" sx={{ mt: 2 }}>History of present illness</Typography>
              <Typography sx={{ whiteSpace: 'pre-wrap' }}>
                {valueOrDash(triage.history_present_illness)}
              </Typography>
              <Grid container spacing={2} sx={{ mt: 0.5 }}>
                {[
                  ['Past medical history', triage.past_medical_history],
                  ['Family history', triage.family_history],
                  ['Social history', triage.social_history],
                  ['Allergies', triage.allergies],
                  ['Current medications', triage.current_medications],
                  ['Triage notes', triage.notes],
                ].map(([label, value]) => (
                  <Grid item xs={12} md={6} key={label}>
                    <Typography variant="subtitle2">{label}</Typography>
                    <Typography sx={{ whiteSpace: 'pre-wrap' }}>
                      {valueOrDash(value)}
                    </Typography>
                  </Grid>
                ))}
              </Grid>
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 2 }}>
                Recorded by {triage.performed_by_name || 'clinical staff'}
              </Typography>
            </>
          ) : (
            <Typography color="text.secondary">
              The visit has no completed nurse triage assessment.
            </Typography>
          )}
        </CardContent>
      </Card>

      <Box>
        <Typography variant="h6" gutterBottom>Laboratory results</Typography>
        {labResults.length ? labResults.map(result => (
          <Card variant="outlined" key={`${result.order_id}-${result.test_code}`} sx={{ mb: 1 }}>
            <CardContent sx={{ py: 1.5 }}>
              <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between">
                <Box>
                  <Typography fontWeight={600}>{result.test_name}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {result.order_number} · {result.test_code}
                  </Typography>
                </Box>
                <Typography fontWeight={600}>
                  {valueOrDash(result.result_value, result.result_unit ? ` ${result.result_unit}` : '')}
                </Typography>
              </Stack>
              {result.result_notes && (
                <Typography variant="body2" sx={{ mt: 1 }}>{result.result_notes}</Typography>
              )}
            </CardContent>
          </Card>
        )) : <Typography color="text.secondary">No laboratory results recorded.</Typography>}
      </Box>

      <Box>
        <Typography variant="h6" gutterBottom>Radiology reports</Typography>
        {radiologyResults.length ? radiologyResults.map(result => (
          <Card variant="outlined" key={`${result.order_id}-${result.test_code}`} sx={{ mb: 1 }}>
            <CardContent sx={{ py: 1.5 }}>
              <Typography fontWeight={600}>{result.test_name}</Typography>
              <Typography variant="caption" color="text.secondary">
                {result.order_number} · {result.body_part || 'Body part not specified'}
              </Typography>
              <Typography variant="subtitle2" sx={{ mt: 1 }}>Impression</Typography>
              <Typography sx={{ whiteSpace: 'pre-wrap' }}>{valueOrDash(result.impression)}</Typography>
              {result.findings && (
                <>
                  <Typography variant="subtitle2" sx={{ mt: 1 }}>Findings</Typography>
                  <Typography sx={{ whiteSpace: 'pre-wrap' }}>{result.findings}</Typography>
                </>
              )}
            </CardContent>
          </Card>
        )) : <Typography color="text.secondary">No radiology report recorded.</Typography>}
      </Box>

      <Box>
        <Typography variant="h6" gutterBottom>Previous clinician assessments</Typography>
        {consultations.length ? consultations.map(item => (
          <Card variant="outlined" key={item.id} sx={{ mb: 1 }}>
            <CardContent sx={{ py: 1.5 }}>
              <Typography fontWeight={600}>
                {item.final_diagnosis || item.provisional_diagnosis || 'Assessment recorded'}
              </Typography>
              <Typography variant="body2">{valueOrDash(item.treatment_plan)}</Typography>
              <Typography variant="caption" color="text.secondary">
                {item.doctor_name} · {new Date(item.consultation_date).toLocaleString()}
              </Typography>
            </CardContent>
          </Card>
        )) : <Typography color="text.secondary">No previous clinician assessment.</Typography>}
      </Box>

      <Box>
        <Typography variant="h6" gutterBottom>Prescription fulfilment</Typography>
        {prescriptions.length ? prescriptions.map(item => (
          <Card variant="outlined" key={`${item.prescription_id}-${item.generic_name}`} sx={{ mb: 1 }}>
            <CardContent sx={{ py: 1.5 }}>
              <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between">
                <Typography fontWeight={600}>
                  {item.generic_name}{item.brand_name ? ` (${item.brand_name})` : ''}
                </Typography>
                <Chip
                  size="small"
                  label={(item.prescription_status || 'pending').replaceAll('-', ' ')}
                />
              </Stack>
              <Typography variant="body2">
                {item.dosage} · {item.frequency} · {item.duration_days} days
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Dispensed {item.quantity_dispensed || 0} of {item.quantity}
              </Typography>
            </CardContent>
          </Card>
        )) : <Typography color="text.secondary">No prescription recorded.</Typography>}
      </Box>
    </Stack>
  );
};

export default ClinicalContextSection;
