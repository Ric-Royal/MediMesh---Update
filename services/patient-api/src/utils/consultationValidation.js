const Joi = require('joi');

const CLINICAL_OUTCOMES = Object.freeze({
  INVESTIGATIONS_PENDING: 'investigations-pending',
  DIAGNOSIS_CONFIRMED: 'diagnosis-confirmed',
  NO_TREATMENT_REQUIRED: 'no-treatment-required'
});

const nullableText = max => Joi.string().allow('', null).max(max);
const orderId = Joi.string().uuid().required();
const catalogId = Joi.number().integer().positive().required();

const consultationSchema = Joi.object({
  encounterId: orderId,
  patientId: orderId,
  doctorId: Joi.string().uuid().allow(null),
  vitals: Joi.object().allow(null).max(20),
  chiefComplaint: nullableText(4000),
  historyPresentIllness: nullableText(12000),
  pastMedicalHistory: nullableText(12000),
  familyHistory: nullableText(8000),
  socialHistory: nullableText(8000),
  allergies: nullableText(8000),
  currentMedications: nullableText(12000),
  examination: Joi.object().allow(null).max(20),
  provisionalDiagnosis: nullableText(8000),
  differentialDiagnosis: nullableText(8000),
  finalDiagnosis: nullableText(8000),
  treatmentPlan: nullableText(12000),
  followUpInstructions: nullableText(8000),
  investigationReason: nullableText(8000),
  clinicalOutcome: Joi.string().valid(...Object.values(CLINICAL_OUTCOMES)).required(),
  patientDisposition: Joi.string().valid('outpatient', 'admit').default('outpatient'),
  admission: Joi.object({
    wardId: orderId,
    bedId: orderId,
    admissionType: Joi.string().valid('emergency', 'elective', 'transfer', 'observation', 'day-case').required(),
    reason: Joi.string().trim().min(3).max(8000).required(),
    expectedDischargeDate: Joi.date().iso().allow(null)
  }).allow(null),
  labOrders: Joi.array().max(25).items(Joi.object({
    testId: catalogId,
    testName: nullableText(250),
    priority: Joi.string().valid('routine', 'urgent', 'stat', 'emergency'),
    clinicalNotes: nullableText(4000),
    price: Joi.any().strip()
  }).unknown(false)).default([]),
  radiologyOrders: Joi.array().max(25).items(Joi.object({
    studyId: Joi.number().integer().positive(),
    testId: Joi.number().integer().positive(),
    testName: nullableText(250),
    bodyPart: nullableText(250),
    reason: nullableText(4000),
    priority: Joi.string().valid('routine', 'urgent', 'stat', 'emergency'),
    price: Joi.any().strip()
  }).or('studyId', 'testId').unknown(false)).default([]),
  prescriptions: Joi.array().max(50).items(Joi.object({
    drugId: catalogId,
    drugName: nullableText(250),
    dosage: Joi.string().max(250).required(),
    frequency: Joi.string().max(100).required(),
    durationDays: Joi.number().integer().min(1).max(365).required(),
    quantity: Joi.number().integer().min(1).max(10000).required(),
    instructions: nullableText(2000),
    unitPrice: Joi.any().strip(),
    totalPrice: Joi.any().strip()
  }).unknown(false)).default([])
}).unknown(false);

const hasText = value => typeof value === 'string' && value.trim().length > 0;

function validateConsultationDecision(data) {
  const details = [];
  const labOrders = Array.isArray(data.labOrders) ? data.labOrders : [];
  const radiologyOrders = Array.isArray(data.radiologyOrders) ? data.radiologyOrders : [];
  const prescriptions = Array.isArray(data.prescriptions) ? data.prescriptions : [];
  const hasDiagnostics = labOrders.length > 0 || radiologyOrders.length > 0;
  const hasPrescriptions = prescriptions.length > 0;

  if (hasDiagnostics) {
    if (data.clinicalOutcome !== CLINICAL_OUTCOMES.INVESTIGATIONS_PENDING) {
      details.push({
        field: 'clinicalOutcome',
        message: 'Select “Awaiting investigation results” when ordering laboratory tests or imaging.'
      });
    }
    if (!hasText(data.investigationReason)) {
      details.push({
        field: 'investigationReason',
        message: 'Enter the symptoms, clinical impression, or other reason for the requested investigation.'
      });
    }
    if (hasPrescriptions) {
      details.push({
        field: 'prescriptions',
        message: 'Medication must wait until investigations are complete and a final diagnosis is recorded.'
      });
    }
  } else if (data.clinicalOutcome === CLINICAL_OUTCOMES.INVESTIGATIONS_PENDING) {
    details.push({
      field: 'clinicalOutcome',
      message: 'Add at least one laboratory test or imaging study, or select the final clinical outcome.'
    });
  }

  if (data.clinicalOutcome === CLINICAL_OUTCOMES.DIAGNOSIS_CONFIRMED && !hasText(data.finalDiagnosis)) {
    details.push({
      field: 'finalDiagnosis',
      message: 'A final diagnosis is required only when “Final diagnosis established” is selected.'
    });
  }

  if (hasPrescriptions && (
    data.clinicalOutcome !== CLINICAL_OUTCOMES.DIAGNOSIS_CONFIRMED ||
    !hasText(data.finalDiagnosis)
  )) {
    details.push({
      field: 'prescriptions',
      message: 'Medication requires a recorded final diagnosis.'
    });
  }

  if (data.clinicalOutcome === CLINICAL_OUTCOMES.NO_TREATMENT_REQUIRED && hasPrescriptions) {
    details.push({
      field: 'prescriptions',
      message: 'Remove medication when no treatment is required.'
    });
  }

  if (data.patientDisposition === 'admit') {
    if (data.clinicalOutcome !== CLINICAL_OUTCOMES.DIAGNOSIS_CONFIRMED || !hasText(data.finalDiagnosis)) {
      details.push({
        field: 'patientDisposition',
        message: 'Admission requires a recorded final diagnosis.'
      });
    }
    if (!data.admission) {
      details.push({
        field: 'admission',
        message: 'Select an available ward bed and enter the reason for admission.'
      });
    }
    if (hasDiagnostics) {
      details.push({
        field: 'patientDisposition',
        message: 'Complete the requested investigations and results review before the final admission decision.'
      });
    }
  } else if (data.admission) {
    details.push({
      field: 'admission',
      message: 'Select “Admit to ward” before entering admission details.'
    });
  }

  return details;
}

module.exports = {
  CLINICAL_OUTCOMES,
  consultationSchema,
  validateConsultationDecision
};
