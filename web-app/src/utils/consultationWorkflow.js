export const CLINICAL_OUTCOMES = Object.freeze({
  INVESTIGATIONS_PENDING: 'investigations-pending',
  DIAGNOSIS_CONFIRMED: 'diagnosis-confirmed',
  NO_TREATMENT_REQUIRED: 'no-treatment-required',
});

const hasText = value => typeof value === 'string' && value.trim().length > 0;
const nullableText = value => hasText(value) ? value.trim() : null;

export const validateConsultationForm = formData => {
  const errors = {};
  const hasDiagnostics = formData.labOrders.length > 0 || formData.radiologyOrders.length > 0;
  const hasPrescriptions = formData.prescriptions.length > 0;

  if (!formData.clinicalOutcome) {
    errors.clinicalOutcome = 'Select the current clinical outcome.';
  }

  if (hasDiagnostics) {
    if (formData.clinicalOutcome !== CLINICAL_OUTCOMES.INVESTIGATIONS_PENDING) {
      errors.clinicalOutcome = 'Select “Awaiting investigation results” while laboratory tests or imaging are pending.';
    }
    if (!hasText(formData.investigationReason)) {
      errors.investigationReason = 'Enter the symptoms, clinical impression, or reason for the requested investigation.';
    }
    if (hasPrescriptions) {
      errors.prescriptions = 'Medication must wait until investigations are complete and a final diagnosis is recorded.';
    }
  } else if (formData.clinicalOutcome === CLINICAL_OUTCOMES.INVESTIGATIONS_PENDING) {
    errors.clinicalOutcome = 'Add a laboratory test or imaging study, or select the final clinical outcome.';
  }

  if (
    formData.clinicalOutcome === CLINICAL_OUTCOMES.DIAGNOSIS_CONFIRMED &&
    !hasText(formData.finalDiagnosis)
  ) {
    errors.finalDiagnosis = 'Enter the final diagnosis.';
  }

  if (hasPrescriptions && (
    formData.clinicalOutcome !== CLINICAL_OUTCOMES.DIAGNOSIS_CONFIRMED ||
    !hasText(formData.finalDiagnosis)
  ) && !errors.prescriptions) {
    errors.prescriptions = 'Medication requires a recorded final diagnosis.';
  }

  if (
    formData.clinicalOutcome === CLINICAL_OUTCOMES.NO_TREATMENT_REQUIRED &&
    hasPrescriptions &&
    !errors.prescriptions
  ) {
    errors.prescriptions = 'Remove medication when no treatment is required.';
  }

  formData.prescriptions.forEach((medication, index) => {
    const durationDays = Number(medication.durationDays);
    const quantity = Number(medication.quantity);
    if (!hasText(medication.dosage) || !hasText(medication.frequency)) {
      errors[`prescriptions.${index}`] = 'Each medication needs a dosage and frequency.';
    } else if (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 365) {
      errors[`prescriptions.${index}`] = 'Medication duration must be a whole number of days from 1 to 365.';
    } else if (!Number.isInteger(quantity) || quantity < 1) {
      errors[`prescriptions.${index}`] = 'Medication quantity must be at least 1.';
    }
  });

  return errors;
};

export const buildConsultationPayload = ({ formData, encounter, patient, doctorId }) => ({
  encounterId: encounter.id,
  patientId: patient.id,
  doctorId: encounter.doctor_id || doctorId || null,
  chiefComplaint: nullableText(formData.chiefComplaint),
  examination: Object.fromEntries(
    Object.entries(formData.examination || {}).map(([key, value]) => [key, nullableText(value)])
  ),
  provisionalDiagnosis: nullableText(formData.provisionalDiagnosis),
  differentialDiagnosis: nullableText(formData.differentialDiagnosis),
  finalDiagnosis: nullableText(formData.finalDiagnosis),
  treatmentPlan: nullableText(formData.treatmentPlan),
  followUpInstructions: nullableText(formData.followUpInstructions),
  investigationReason: nullableText(formData.investigationReason),
  clinicalOutcome: formData.clinicalOutcome,
  labOrders: formData.labOrders.map(test => ({
    testId: Number(test.testId),
    testName: nullableText(test.testName),
    priority: test.priority || 'routine',
    clinicalNotes: nullableText(test.clinicalNotes) || nullableText(formData.investigationReason),
  })),
  radiologyOrders: formData.radiologyOrders.map(study => ({
    studyId: Number(study.studyId || study.testId),
    testName: nullableText(study.studyName || study.testName),
    bodyPart: nullableText(study.bodyPart),
    reason: nullableText(study.reason) || nullableText(formData.investigationReason),
    priority: study.priority || 'routine',
  })),
  prescriptions: formData.prescriptions.map(medication => ({
    drugId: Number(medication.drugId),
    drugName: nullableText(medication.drugName),
    dosage: medication.dosage.trim(),
    frequency: medication.frequency.trim(),
    durationDays: Number(medication.durationDays),
    quantity: Number(medication.quantity),
    instructions: nullableText(medication.instructions),
  })),
});

export const formatConsultationApiError = (payload, fallback = 'Failed to create consultation') => {
  if (Array.isArray(payload?.details) && payload.details.length > 0) {
    return payload.details.map(detail => detail.message).join(' ');
  }
  return payload?.error || fallback;
};
