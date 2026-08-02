import React from 'react';
import {
  Alert, Box, Card, CardContent, Chip, Divider, Grid, Stack, Typography,
} from '@mui/material';
import FilePreview from '../common/FilePreview';

const valueOrDash = (value, suffix = '') =>
  value === null || value === undefined || value === '' ? '—' : `${value}${suffix}`;

const Detail = ({ label, value }) => (
  <Box>
    <Typography variant="subtitle2">{label}</Typography>
    <Typography sx={{ whiteSpace: 'pre-wrap' }}>{valueOrDash(value)}</Typography>
  </Box>
);

const ClinicalContextSection = ({ encounterId, context, loading, error, isResultsReview }) => {
  if (loading) return <Alert severity="info">Loading the shared clinical record…</Alert>;
  if (error) return <Alert severity="error">{error}</Alert>;

  const triage = context?.triage;
  const vitals = triage?.vital_signs || {};
  const labResults = context?.labResults || [];
  const radiologyResults = context?.radiologyResults || [];
  const consultations = context?.consultations || [];
  const prescriptions = context?.prescriptions || [];
  const admissions = context?.admissions || [];

  return (
    <Stack spacing={3}>
      {isResultsReview && (
        <Alert severity="warning">
          Diagnostic results are ready. The earlier history and assessment have been restored
          into this form. Review the results, confirm the final diagnosis, and decide on treatment.
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
                {[
                  ['Blood pressure', vitals.bloodPressure, ' mmHg'],
                  ['Temperature', vitals.temperature, ' °C'],
                  ['Pulse', vitals.pulse, ' bpm'],
                  ['Oxygen saturation', vitals.oxygenSaturation, '%'],
                  ['Respiratory rate', vitals.respiratoryRate, ' /min'],
                  ['Weight', vitals.weight, ' kg'],
                  ['Height', vitals.height, ' cm'],
                  ['BMI', vitals.bmi, ''],
                ].map(([label, value, suffix]) => (
                  <Grid item xs={6} md={3} key={label}>
                    <Typography variant="caption" color="text.secondary">{label}</Typography>
                    <Typography>{valueOrDash(value, suffix)}</Typography>
                  </Grid>
                ))}
              </Grid>
              <Divider sx={{ my: 2 }} />
              <Grid container spacing={2}>
                {[
                  ['Chief complaint', triage.chief_complaint],
                  ['History of present illness', triage.history_present_illness],
                  ['Past medical history', triage.past_medical_history],
                  ['Family history', triage.family_history],
                  ['Social history', triage.social_history],
                  ['Allergies', triage.allergies],
                  ['Current medications', triage.current_medications],
                  ['Triage notes', triage.notes],
                ].map(([label, value]) => (
                  <Grid item xs={12} md={6} key={label}><Detail label={label} value={value} /></Grid>
                ))}
              </Grid>
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 2 }}>
                Recorded by {triage.performed_by_name || 'clinical staff'}
              </Typography>
            </>
          ) : (
            <Typography color="text.secondary">The visit has no completed nurse triage assessment.</Typography>
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
              {result.result_notes && <Typography variant="body2" sx={{ mt: 1 }}>{result.result_notes}</Typography>}
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
              <Detail label="Impression" value={result.impression} />
              {result.findings && <Detail label="Findings" value={result.findings} />}
            </CardContent>
          </Card>
        )) : <Typography color="text.secondary">No radiology report recorded.</Typography>}
      </Box>

      <Box>
        <Typography variant="h6" gutterBottom>Clinician assessments</Typography>
        {consultations.length ? consultations.map(item => (
          <Card variant="outlined" key={item.id} sx={{ mb: 1 }}>
            <CardContent sx={{ py: 1.5 }}>
              <Typography fontWeight={600}>
                {item.final_diagnosis || item.provisional_diagnosis || 'Assessment recorded'}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {item.doctor_name} · {new Date(item.consultation_date).toLocaleString()}
              </Typography>
              <Grid container spacing={2} sx={{ mt: 0.5 }}>
                <Grid item xs={12} md={6}><Detail label="Examination" value={[
                  item.general_appearance, item.cardiovascular_exam, item.respiratory_exam,
                  item.abdominal_exam, item.neurological_exam, item.musculoskeletal_exam,
                  item.skin_exam, item.other_findings,
                ].filter(Boolean).join('\n')} /></Grid>
                <Grid item xs={12} md={6}><Detail label="Treatment plan" value={item.treatment_plan} /></Grid>
                <Grid item xs={12} md={6}><Detail label="Follow-up" value={item.follow_up_instructions} /></Grid>
                <Grid item xs={12} md={6}><Detail label="Outcome" value={item.clinical_outcome} /></Grid>
              </Grid>
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
                <Chip size="small" label={(item.prescription_status || 'pending').replaceAll('-', ' ')} />
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

      <Box>
        <Typography variant="h6" gutterBottom>Ward admissions</Typography>
        {admissions.length ? admissions.map(admission => (
          <Card variant="outlined" key={admission.id} sx={{ mb: 1 }}>
            <CardContent sx={{ py: 1.5 }}>
              <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between">
                <Typography fontWeight={600}>{admission.admission_number}</Typography>
                <Chip size="small" label={(admission.status || 'admitted').replaceAll('-', ' ')} />
              </Stack>
              <Typography>{admission.ward_name} · Bed {admission.bed_number}</Typography>
              <Typography variant="body2">{valueOrDash(admission.reason_for_admission)}</Typography>
            </CardContent>
          </Card>
        )) : <Typography color="text.secondary">No ward admission recorded for this visit.</Typography>}
      </Box>

      {encounterId && (
        <Box>
          <Typography variant="h6" gutterBottom>Clinical files and result documents</Typography>
          <FilePreview encounterId={encounterId} allowDelete={false} />
        </Box>
      )}
    </Stack>
  );
};

export default ClinicalContextSection;
