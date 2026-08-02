import {
  CLINICAL_OUTCOMES,
  buildConsultationPayload,
  createInitialConsultationForm,
  formatConsultationApiError,
  mergeClinicalContextIntoForm,
  validateConsultationForm,
} from './consultationWorkflow';

const baseForm = {
  chiefComplaint: '',
  examination: { generalAppearance: '' },
  provisionalDiagnosis: '',
  differentialDiagnosis: '',
  finalDiagnosis: '',
  treatmentPlan: '',
  followUpInstructions: '',
  investigationReason: '',
  clinicalOutcome: CLINICAL_OUTCOMES.NO_TREATMENT_REQUIRED,
  labOrders: [],
  radiologyOrders: [],
  prescriptions: [],
};

test('permits investigations without inventing a diagnosis', () => {
  const form = {
    ...baseForm,
    clinicalOutcome: CLINICAL_OUTCOMES.INVESTIGATIONS_PENDING,
    investigationReason: 'Unexplained fatigue and pallor',
    labOrders: [{ testId: 4, testName: 'Full blood count', priority: 'routine', clinicalNotes: '' }],
  };

  expect(validateConsultationForm(form)).toEqual({});
});

test('permits confirmed diagnosis with no medication', () => {
  const form = {
    ...baseForm,
    clinicalOutcome: CLINICAL_OUTCOMES.DIAGNOSIS_CONFIRMED,
    finalDiagnosis: 'Self-limiting viral illness',
  };

  expect(validateConsultationForm(form)).toEqual({});
});

test('permits no-treatment outcome without diagnosis or medication', () => {
  expect(validateConsultationForm(baseForm)).toEqual({});
});

test('blocks medication until final diagnosis and investigations are complete', () => {
  const form = {
    ...baseForm,
    clinicalOutcome: CLINICAL_OUTCOMES.INVESTIGATIONS_PENDING,
    investigationReason: 'Exclude infection',
    labOrders: [{ testId: 4 }],
    prescriptions: [{
      drugId: 2,
      dosage: '500 mg',
      frequency: 'TID',
      durationDays: 7,
      quantity: 21,
    }],
  };
  const errors = validateConsultationForm(form);

  expect(errors.prescriptions).toMatch(/wait until investigations/i);
});

test('builds an API-safe payload with null optionals and numeric medication fields', () => {
  const form = {
    ...baseForm,
    clinicalOutcome: CLINICAL_OUTCOMES.DIAGNOSIS_CONFIRMED,
    finalDiagnosis: 'Bacterial tonsillitis',
    prescriptions: [{
      drugId: '2',
      drugName: 'Example medicine',
      drugCode: 'DISPLAY-ONLY',
      genericName: 'Display only',
      dosage: '500 mg',
      frequency: 'TID',
      durationDays: '7',
      quantity: '21',
      instructions: '',
      unitPrice: 5,
      totalPrice: 105,
    }],
  };
  const payload = buildConsultationPayload({
    formData: form,
    encounter: { id: 'encounter-1', doctor_id: 'doctor-1' },
    patient: { id: 'patient-1' },
    doctorId: 'fallback-doctor',
  });

  expect(payload.provisionalDiagnosis).toBeNull();
  expect(payload.examination.generalAppearance).toBeNull();
  expect(payload.prescriptions[0]).toEqual({
    drugId: 2,
    drugName: 'Example medicine',
    dosage: '500 mg',
    frequency: 'TID',
    durationDays: 7,
    quantity: 21,
    instructions: null,
  });
});

test('shows field-level API validation details to the clinician', () => {
  expect(formatConsultationApiError({
    error: 'Validation failed',
    details: [
      { field: 'clinicalOutcome', message: 'Select the current clinical outcome.' },
      { field: 'durationDays', message: 'Duration must be a whole number of days.' },
    ],
  })).toBe('Select the current clinical outcome. Duration must be a whole number of days.');
});

test('restores triage and clinician data for results review without duplicating prior orders', () => {
  const initial = createInitialConsultationForm({ chief_complaint: 'Initial complaint' });
  const restored = mergeClinicalContextIntoForm(initial, {
    triage: {
      vital_signs: { temperature: 38.2, pulse: 96 },
      chief_complaint: 'Fever',
      history_present_illness: 'Three days of fever',
      allergies: 'Penicillin',
    },
    consultations: [{
      general_appearance: 'Tired but stable',
      provisional_diagnosis: 'Possible infection',
      clinical_outcome: CLINICAL_OUTCOMES.INVESTIGATIONS_PENDING,
    }],
  }, { resultsReview: true });

  expect(restored.vitals.temperature).toBe('38.2');
  expect(restored.historyPresentIllness).toBe('Three days of fever');
  expect(restored.examination.generalAppearance).toBe('Tired but stable');
  expect(restored.provisionalDiagnosis).toBe('Possible infection');
  expect(restored.clinicalOutcome).toBe('');
  expect(restored.labOrders).toEqual([]);
});

test('requires a final decision and a real ward bed before admission', () => {
  const form = {
    ...createInitialConsultationForm({}),
    clinicalOutcome: CLINICAL_OUTCOMES.DIAGNOSIS_CONFIRMED,
    finalDiagnosis: 'Severe community acquired pneumonia',
    patientDisposition: 'admit',
    admission: { wardId: '', bedId: '', admissionType: 'emergency', reason: '' },
  };

  expect(validateConsultationForm(form).admission).toMatch(/ward and bed/i);
});
