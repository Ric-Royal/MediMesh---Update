import {
  CLINICAL_OUTCOMES,
  buildConsultationPayload,
  formatConsultationApiError,
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
