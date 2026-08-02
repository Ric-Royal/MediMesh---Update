const {
  CLINICAL_OUTCOMES,
  consultationSchema,
  validateConsultationDecision
} = require('../consultationValidation');

const basePayload = {
  encounterId: '11111111-1111-4111-8111-111111111111',
  patientId: '22222222-2222-4222-8222-222222222222',
  doctorId: '33333333-3333-4333-8333-333333333333',
  clinicalOutcome: CLINICAL_OUTCOMES.NO_TREATMENT_REQUIRED,
  chiefComplaint: null,
  provisionalDiagnosis: null,
  differentialDiagnosis: null,
  finalDiagnosis: null,
  treatmentPlan: null,
  followUpInstructions: null,
  investigationReason: null,
  examination: { generalAppearance: null },
  labOrders: [],
  radiologyOrders: [],
  prescriptions: []
};

describe('consultation request contract', () => {
  test('accepts null optional clinical fields for a no-treatment outcome', () => {
    const result = consultationSchema.validate(basePayload, { abortEarly: false });

    expect(result.error).toBeUndefined();
    expect(validateConsultationDecision(result.value)).toEqual([]);
  });

  test('allows investigations without a provisional or final diagnosis', () => {
    const payload = {
      ...basePayload,
      clinicalOutcome: CLINICAL_OUTCOMES.INVESTIGATIONS_PENDING,
      investigationReason: 'Persistent abdominal pain; exclude acute pathology',
      labOrders: [{ testId: 1, testName: 'Full blood count', priority: 'routine', clinicalNotes: null }]
    };
    const result = consultationSchema.validate(payload, { abortEarly: false });

    expect(result.error).toBeUndefined();
    expect(validateConsultationDecision(result.value)).toEqual([]);
  });

  test('accepts a numeric medication duration after final diagnosis', () => {
    const payload = {
      ...basePayload,
      clinicalOutcome: CLINICAL_OUTCOMES.DIAGNOSIS_CONFIRMED,
      finalDiagnosis: 'Bacterial tonsillitis',
      prescriptions: [{
        drugId: 1,
        drugName: 'Medicine',
        dosage: '500 mg',
        frequency: 'TID',
        durationDays: 7,
        quantity: 21,
        instructions: null
      }]
    };
    const result = consultationSchema.validate(payload, { abortEarly: false });

    expect(result.error).toBeUndefined();
    expect(validateConsultationDecision(result.value)).toEqual([]);
  });

  test('rejects the old text duration contract', () => {
    const payload = {
      ...basePayload,
      clinicalOutcome: CLINICAL_OUTCOMES.DIAGNOSIS_CONFIRMED,
      finalDiagnosis: 'Bacterial tonsillitis',
      prescriptions: [{
        drugId: 1,
        dosage: '500 mg',
        frequency: 'TID',
        duration: '7 days',
        quantity: 21
      }]
    };
    const result = consultationSchema.validate(payload, { abortEarly: false });

    expect(result.error).toBeDefined();
    expect(result.error.details.map(detail => detail.path.join('.'))).toContain('prescriptions.0.durationDays');
  });
});

describe('clinical decision rules', () => {
  test('rejects medication while investigations are pending', () => {
    const details = validateConsultationDecision({
      ...basePayload,
      clinicalOutcome: CLINICAL_OUTCOMES.INVESTIGATIONS_PENDING,
      investigationReason: 'Investigate persistent fever',
      labOrders: [{ testId: 1 }],
      prescriptions: [{ drugId: 1 }]
    });

    expect(details.some(detail => detail.field === 'prescriptions')).toBe(true);
  });

  test('requires final diagnosis only for a diagnosis-confirmed outcome', () => {
    const details = validateConsultationDecision({
      ...basePayload,
      clinicalOutcome: CLINICAL_OUTCOMES.DIAGNOSIS_CONFIRMED
    });

    expect(details).toContainEqual(expect.objectContaining({ field: 'finalDiagnosis' }));
  });

  test('allows a final diagnosis with no medication', () => {
    const details = validateConsultationDecision({
      ...basePayload,
      clinicalOutcome: CLINICAL_OUTCOMES.DIAGNOSIS_CONFIRMED,
      finalDiagnosis: 'Self-limiting viral illness'
    });

    expect(details).toEqual([]);
  });
});
