const express = require('express');
const router = express.Router();
const Encounter = require('../models/Encounter');
const QueueEntry = require('../models/QueueEntry');
const Patient = require('../models/Patient');
const { logger } = require('../utils/logger');
const { getDB } = require('../utils/database');
const { authorize } = require('../middleware/auth');
const Joi = require('joi');
const { validate, validateParams, uuidSchema } = require('../utils/validation');
const {
  hasRole,
  isAdmin,
  requireEncounterAccess,
  requirePatientAccess
} = require('../security/accessControl');

const ENCOUNTER_READ_ROLES = ['admin', 'doctor', 'nurse', 'receptionist'];
const ENCOUNTER_CREATE_ROLES = ['admin', 'doctor', 'nurse', 'receptionist'];
const ENCOUNTER_UPDATE_ROLES = ['admin', 'doctor', 'nurse', 'receptionist'];
const encounterParamsSchema = Joi.object({ id: uuidSchema });
const encounterCreateSchema = Joi.object({
  patientId: Joi.string().uuid(),
  patient_id: Joi.string().uuid(),
  encounterType: Joi.string().valid('outpatient', 'inpatient', 'emergency', 'day-case', 'follow-up'),
  encounter_type: Joi.string().valid('outpatient', 'inpatient', 'emergency', 'day-case', 'follow-up'),
  visit_type: Joi.string().valid('outpatient', 'inpatient', 'emergency', 'day-case', 'follow-up'),
  status: Joi.string().valid('registered', 'waiting', 'triage', 'in-consultation', 'pending-lab', 'pending-radiology', 'pending-pharmacy', 'completed', 'cancelled', 'no-show'),
  triageLevel: Joi.string().valid('routine', 'urgent', 'emergency', 'critical'),
  triage_level: Joi.string().valid('routine', 'urgent', 'emergency', 'critical'),
  departmentId: Joi.string().uuid().allow(null),
  department_id: Joi.string().uuid().allow(null),
  clinicId: Joi.string().uuid().allow(null),
  clinic_id: Joi.string().uuid().allow(null),
  doctorId: Joi.string().uuid().allow(null),
  doctor_id: Joi.string().uuid().allow(null),
  initialQueue: Joi.string().valid('triage', 'consultation'),
  initial_queue: Joi.string().valid('triage', 'consultation'),
  waitingLocation: Joi.string().trim().max(100),
  waiting_location: Joi.string().trim().max(100),
  chiefComplaint: Joi.string().trim().max(2000).allow('', null),
  chief_complaint: Joi.string().trim().max(2000).allow('', null),
  paymentType: Joi.string().valid('self-pay', 'corporate', 'insurance', 'government', 'ngo'),
  payment_type: Joi.string().valid('self-pay', 'corporate', 'insurance', 'government', 'ngo'),
  paymentStatus: Joi.string().valid('unpaid', 'partial', 'paid', 'billed-later', 'waived'),
  payment_status: Joi.string().valid('unpaid', 'partial', 'paid', 'billed-later', 'waived')
}).custom((value, helpers) => {
  if (!value.patientId && !value.patient_id) return helpers.error('any.required');
  return value;
});
const encounterUpdateSchema = Joi.object({
  status: Joi.string().valid('registered', 'waiting', 'triage', 'in-consultation', 'pending-lab', 'pending-radiology', 'pending-pharmacy', 'completed', 'cancelled', 'no-show'),
  triage_level: Joi.string().valid('routine', 'urgent', 'emergency', 'critical'),
  department_id: Joi.string().uuid().allow(null),
  clinic_id: Joi.string().uuid().allow(null),
  doctor_id: Joi.string().uuid().allow(null),
  waiting_location: Joi.string().trim().max(100),
  current_location_id: Joi.string().uuid().allow(null),
  triage_time: Joi.date().iso().allow(null),
  consultation_start_time: Joi.date().iso().allow(null),
  consultation_end_time: Joi.date().iso().allow(null),
  total_waiting_minutes: Joi.number().integer().min(0).max(100000),
  chief_complaint: Joi.string().trim().max(2000).allow('', null),
  presenting_symptoms: Joi.string().trim().max(5000).allow('', null),
  vital_signs: Joi.object().max(25).allow(null),
  payment_status: Joi.string().valid('unpaid', 'partial', 'paid', 'billed-later', 'waived'),
  payment_type: Joi.string().valid('self-pay', 'corporate', 'insurance', 'government', 'ngo'),
  corporate_scheme: Joi.string().trim().max(200).allow('', null),
  referred_from: Joi.string().trim().max(200).allow('', null),
  notes: Joi.string().trim().max(5000).allow('', null)
}).min(1);

const minimizeEncounter = (encounter, user) => {
  if (!hasRole(user, 'receptionist') || isAdmin(user)) return encounter;
  const {
    chief_complaint,
    presenting_symptoms,
    vital_signs,
    notes,
    ...operational
  } = encounter;
  return operational;
};

const limitReceptionEncounterUpdate = (req, res, next) => {
  if (!hasRole(req.user, 'receptionist') || isAdmin(req.user)) return next();
  const allowed = new Set([
    'status', 'department_id', 'clinic_id', 'doctor_id',
    'waiting_location', 'current_location_id', 'payment_status',
    'payment_type', 'corporate_scheme'
  ]);
  if (Object.keys(req.validatedData).some(key => !allowed.has(key))) {
    return res.status(403).json({ success: false, error: 'Clinical encounter fields require clinical access' });
  }
  next();
};

// Get all encounters for today
router.get('/today', authorize(ENCOUNTER_READ_ROLES), async (req, res) => {
  try {
    const encounters = await Encounter.getEncountersByDate(new Date(), req.user);
    res.json({ success: true, data: encounters.map(item => minimizeEncounter(item, req.user)), count: encounters.length });
  } catch (error) {
    logger.error('Error fetching today encounters:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get encounters by clinic
router.get('/clinic/:clinicId', authorize(ENCOUNTER_READ_ROLES), validateParams(Joi.object({ clinicId: uuidSchema })), async (req, res) => {
  try {
    const { clinicId } = req.validatedParams;
    const encounters = await Encounter.getActiveEncounters(clinicId, req.user);
    res.json({ success: true, data: encounters.map(item => minimizeEncounter(item, req.user)), count: encounters.length });
  } catch (error) {
    logger.error('Error fetching clinic encounters:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create new encounter
router.post(
  '/',
  authorize(ENCOUNTER_CREATE_ROLES),
  validate(encounterCreateSchema),
  requirePatientAccess({
    access: 'demographics',
    patientId: req => req.validatedData.patientId || req.validatedData.patient_id,
    breakGlass: false
  }),
  async (req, res) => {
  let client;
  try {
    client = await getDB().connect();
    await client.query('BEGIN');
    const encounterData = { ...req.validatedData, createdBy: req.user?.staffId || null };
    
    const encounter = await Encounter.create(encounterData, client);
    
    const queueEligibleTypes = ['outpatient', 'emergency', 'follow-up', 'day-case'];
    const requestedInitialQueue =
      req.validatedData.initialQueue || req.validatedData.initial_queue;
    const initialQueue = requestedInitialQueue || (
      ['outpatient', 'emergency'].includes(encounter.encounter_type)
        ? 'triage'
        : 'consultation'
    );

    if (queueEligibleTypes.includes(encounter.encounter_type)) {
      await QueueEntry.create({
        encounterId: encounter.id,
        patientId: encounter.patient_id,
        clinicId: encounter.clinic_id || null,
        doctorId: encounter.doctor_id || null,
        queueType: initialQueue,
        isEmergency: ['emergency', 'critical'].includes(encounter.triage_level),
        waitingLocation: initialQueue === 'triage'
          ? 'triage-waiting'
          : 'consultation-waiting'
      }, client);
    }
    await client.query('COMMIT');
    
    logger.info(`Encounter created: ${encounter.encounter_number || encounter.encounterNumber}`);
    res.status(201).json({ success: true, data: encounter });
  } catch (error) {
    if (client) await client.query('ROLLBACK');
    logger.error('Error creating encounter:', error);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    if (client) client.release();
  }
});

// Get encounter by ID
router.get(
  '/:id',
  authorize(ENCOUNTER_READ_ROLES),
  validateParams(encounterParamsSchema),
  requireEncounterAccess({ access: 'operational' }),
  async (req, res) => {
  try {
    const encounter = await Encounter.findByPk(req.validatedParams.id);
    
    if (!encounter) {
      return res.status(404).json({ success: false, error: 'Encounter not found' });
    }
    
    res.json({ success: true, data: minimizeEncounter(encounter, req.user) });
  } catch (error) {
    logger.error('Error fetching encounter:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update encounter
router.put(
  '/:id',
  authorize(ENCOUNTER_UPDATE_ROLES),
  validateParams(encounterParamsSchema),
  validate(encounterUpdateSchema),
  requireEncounterAccess({ access: 'operational' }),
  limitReceptionEncounterUpdate,
  async (req, res) => {
  try {
    const existing = await Encounter.findByPk(req.validatedParams.id);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Encounter not found' });
    }
    
    const updated = await Encounter.update(req.validatedParams.id, req.validatedData);
    logger.info(`Encounter updated: ${updated.encounter_number}`);
    
    res.json({ success: true, data: updated });
  } catch (error) {
    logger.error('Error updating encounter:', error);
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
});

module.exports = router;

