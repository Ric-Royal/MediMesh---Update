export const CLINICAL_OUTCOMES = Object.freeze({
  INVESTIGATIONS_PENDING: 'investigations-pending',
  DIAGNOSIS_CONFIRMED: 'diagnosis-confirmed',
  NO_TREATMENT_REQUIRED: 'no-treatment-required',
});

const hasText = value => typeof value === 'string' && value.trim().length > 0;
const nullableText = value => hasText(value) ? value.trim() : null;

const textValue = value => value === null || value === undefined ? '' : String(value);

export const createInitialConsultationForm = encounter => ({
  vitals: {
    bloodPressure: '', temperature: '', pulse: '', respiratoryRate: '',
    oxygenSaturation: '', weight: '', height: '', bmi: '',
  },
  chiefComplaint: encounter?.chief_complaint || '',
  historyPresentIllness: '',
  pastMedicalHistory: '',
  familyHistory: '',
  socialHistory: '',
  allergies: '',
  currentMedications: '',
  examination: {
    generalAppearance: '', cardiovascular: '', respiratory: '', abdominal: '',
    neurological: '', musculoskeletal: '', skin: '', other: '',
  },
  provisionalDiagnosis: '',
  differentialDiagnosis: '',
  finalDiagnosis: '',
  treatmentPlan: '',
  followUpInstructions: '',
  clinicalOutcome: '',
  investigationReason: '',
  patientDisposition: 'outpatient',
  admission: {
    wardId: '', bedId: '', admissionType: 'elective', reason: '',
    expectedDischargeDate: '',
  },
  labOrders: [],
  radiologyOrders: [],
  prescriptions: [],
});

export const mergeClinicalContextIntoForm = (current, context, { resultsReview = false } = {}) => {
  const triage = context?.triage || {};
  const latest = context?.consultations?.[0] || {};
  const triageVitals = triage.vital_signs || {};
  const previousVitals = {
    bloodPressure: latest.blood_pressure,
    temperature: latest.temperature,
    pulse: latest.pulse,
    respiratoryRate: latest.respiratory_rate,
    oxygenSaturation: latest.oxygen_saturation,
    weight: latest.weight,
    height: latest.height,
    bmi: latest.bmi,
  };
  const persisted = (consultationKey, triageKey, fallback = '') =>
    textValue(latest[consultationKey] ?? triage[triageKey] ?? fallback);

  return {
    ...current,
    vitals: Object.fromEntries(Object.keys(current.vitals).map(key => [
      key,
      textValue(previousVitals[key] ?? triageVitals[key] ?? current.vitals[key]),
    ])),
    chiefComplaint: persisted('chief_complaint', 'chief_complaint', current.chiefComplaint),
    historyPresentIllness: persisted('history_present_illness', 'history_present_illness'),
    pastMedicalHistory: persisted('past_medical_history', 'past_medical_history'),
    familyHistory: persisted('family_history', 'family_history'),
    socialHistory: persisted('social_history', 'social_history'),
    allergies: persisted('allergies', 'allergies'),
    currentMedications: persisted('current_medications', 'current_medications'),
    examination: {
      generalAppearance: textValue(latest.general_appearance),
      cardiovascular: textValue(latest.cardiovascular_exam),
      respiratory: textValue(latest.respiratory_exam),
      abdominal: textValue(latest.abdominal_exam),
      neurological: textValue(latest.neurological_exam),
      musculoskeletal: textValue(latest.musculoskeletal_exam),
      skin: textValue(latest.skin_exam),
      other: textValue(latest.other_findings),
    },
    provisionalDiagnosis: textValue(latest.provisional_diagnosis),
    differentialDiagnosis: textValue(latest.differential_diagnosis),
    finalDiagnosis: textValue(latest.final_diagnosis),
    treatmentPlan: textValue(latest.treatment_plan),
    followUpInstructions: textValue(latest.follow_up_instructions),
    investigationReason: textValue(latest.investigation_reason),
    clinicalOutcome: resultsReview ? '' : textValue(latest.clinical_outcome),
    patientDisposition: 'outpatient',
    admission: { ...current.admission },
    // Existing orders are history, not new orders to be submitted twice.
    labOrders: [],
    radiologyOrders: [],
    prescriptions: [],
  };
};

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

  if (formData.patientDisposition === 'admit') {
    if (
      formData.clinicalOutcome !== CLINICAL_OUTCOMES.DIAGNOSIS_CONFIRMED ||
      !hasText(formData.finalDiagnosis)
    ) {
      errors.patientDisposition = 'Admission requires a recorded final diagnosis.';
    }
    if (!formData.admission?.wardId || !formData.admission?.bedId) {
      errors.admission = 'Select an available ward and bed.';
    } else if (!hasText(formData.admission?.reason)) {
      errors.admission = 'Enter the clinical reason for admission.';
    }
    if (hasDiagnostics) {
      errors.patientDisposition = 'Complete investigations and results review before admitting the patient.';
    }
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
  vitals: Object.fromEntries(
    Object.entries(formData.vitals || {}).map(([key, value]) => [key, nullableText(String(value ?? ''))])
  ),
  chiefComplaint: nullableText(formData.chiefComplaint),
  historyPresentIllness: nullableText(formData.historyPresentIllness),
  pastMedicalHistory: nullableText(formData.pastMedicalHistory),
  familyHistory: nullableText(formData.familyHistory),
  socialHistory: nullableText(formData.socialHistory),
  allergies: nullableText(formData.allergies),
  currentMedications: nullableText(formData.currentMedications),
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
  patientDisposition: formData.patientDisposition || 'outpatient',
  admission: formData.patientDisposition === 'admit' ? {
    wardId: formData.admission.wardId,
    bedId: formData.admission.bedId,
    admissionType: formData.admission.admissionType || 'elective',
    reason: nullableText(formData.admission.reason),
    expectedDischargeDate: nullableText(formData.admission.expectedDischargeDate),
  } : null,
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
