const express = require('express');
const Joi = require('joi');
const router = express.Router();
const Encounter = require('../models/Encounter');
const QueueEntry = require('../models/QueueEntry');
const Patient = require('../models/Patient');
const { logger } = require('../utils/logger');
const { getDB } = require('../utils/database');
const { emitQueueUpdate, emitQueueRefresh } = require('../utils/websocket');
const { authorize } = require('../middleware/auth');
const { requireEncounterAccess } = require('../security/accessControl');
const { validate, validateParams, uuidSchema } = require('../utils/validation');

const QUEUE_READ_ROLES = ['admin', 'doctor', 'nurse', 'receptionist', 'lab-tech', 'pharmacist', 'billing', 'radiologist', 'radiographer'];
const QUEUE_REGISTER_ROLES = ['admin', 'doctor', 'nurse', 'receptionist'];
const QUEUE_PROCESS_ROLES = ['admin', 'doctor', 'nurse', 'lab-tech', 'pharmacist', 'billing', 'radiologist', 'radiographer'];
const ROLE_QUEUE_TYPES = Object.freeze({
  doctor: ['consultation'],
  nurse: ['triage'],
  receptionist: ['triage', 'consultation'],
  'lab-tech': ['lab'],
  pharmacist: ['pharmacy'],
  billing: ['billing'],
  radiologist: ['radiology'],
  radiographer: ['radiology']
});
const ROLE_QUEUE_REGISTER_TYPES = Object.freeze({
  doctor: ['consultation'],
  nurse: ['triage'],
  receptionist: ['triage', 'consultation']
});
const ROLE_QUEUE_PROCESS_TYPES = Object.freeze({
  doctor: ['consultation'],
  nurse: ['triage'],
  receptionist: [],
  'lab-tech': ['lab'],
  pharmacist: ['pharmacy'],
  billing: ['billing'],
  radiologist: ['radiology'],
  radiographer: ['radiology']
});
const canUseQueueType = (user, queueType) =>
  user.roles.includes('admin') ||
  user.roles.some(role => (ROLE_QUEUE_TYPES[role] || []).includes(queueType));
const canProcessQueueType = (user, queueType) =>
  user.roles.includes('admin') ||
  user.roles.some(role => (ROLE_QUEUE_PROCESS_TYPES[role] || []).includes(queueType));
const canRegisterQueueType = (user, queueType) =>
  user.roles.includes('admin') ||
  user.roles.some(role => (ROLE_QUEUE_REGISTER_TYPES[role] || []).includes(queueType));
const rejectQueueType = (req, res, queueType) => {
  if (canUseQueueType(req.user, queueType)) return false;
  res.status(403).json({ success: false, error: 'Queue access denied' });
  return true;
};
const assignedDoctorScope = (user, queueType) => (
  queueType === 'consultation' &&
  !user.roles.includes('admin') &&
  user.roles.includes('doctor')
    ? user.staffId || '__missing-provider-identity__'
    : null
);
const canProcessAssignedQueue = (user, queueEntry) => (
  canProcessQueueType(user, queueEntry.queue_type) &&
  (
    !assignedDoctorScope(user, queueEntry.queue_type) ||
    queueEntry.doctor_id === user.staffId
  )
);

const serializeQueueStatistics = (stats = {}) => ({
  totalWaiting: Number(stats.total_waiting) || 0,
  inService: Number(stats.in_service) || 0,
  completedToday: Number(stats.completed_today) || 0,
  emergencies: Number(stats.emergencies) || 0,
  averageWaitTime: Number(stats.average_wait_minutes) || 0,
  longestWaitTime: Number(stats.longest_wait_minutes) || 0,
});

const queueStatusParamsSchema = Joi.object({ id: uuidSchema });
const queueStatusSchema = Joi.object({
  status: Joi.string().valid(
    'waiting', 'called', 'in-service', 'completed', 'no-show', 'deferred', 'cancelled'
  ).required(),
  nextQueue: Joi.string().valid(
    'triage', 'consultation', 'lab', 'radiology', 'pharmacy', 'billing', 'discharge'
  ).allow(null)
}).unknown(false);
const triageCompletionSchema = Joi.object({
  triageLevel: Joi.string().valid('routine', 'urgent', 'emergency', 'critical').required(),
  vitals: Joi.object({
    bloodPressure: Joi.string().trim().max(30).allow(''),
    temperature: Joi.alternatives().try(Joi.number().min(25).max(50), Joi.string().allow('')),
    pulse: Joi.alternatives().try(Joi.number().integer().min(0).max(350), Joi.string().allow('')),
    respiratoryRate: Joi.alternatives().try(Joi.number().integer().min(0).max(150), Joi.string().allow('')),
    oxygenSaturation: Joi.alternatives().try(Joi.number().min(0).max(100), Joi.string().allow('')),
    weight: Joi.alternatives().try(Joi.number().min(0).max(1000), Joi.string().allow('')),
    height: Joi.alternatives().try(Joi.number().min(0).max(300), Joi.string().allow('')),
    bmi: Joi.alternatives().try(Joi.number().min(0).max(150), Joi.string().allow(''))
  }).unknown(false).required(),
  chiefComplaint: Joi.string().trim().min(1).max(4000).required(),
  historyPresentIllness: Joi.string().trim().max(12000).allow('', null),
  pastMedicalHistory: Joi.string().trim().max(12000).allow('', null),
  familyHistory: Joi.string().trim().max(8000).allow('', null),
  socialHistory: Joi.string().trim().max(8000).allow('', null),
  allergies: Joi.string().trim().max(8000).allow('', null),
  currentMedications: Joi.string().trim().max(12000).allow('', null),
  notes: Joi.string().trim().max(4000).allow('', null)
}).unknown(false);
const QUEUE_STATUS_TRANSITIONS = Object.freeze({
  waiting: ['called', 'in-service', 'no-show', 'cancelled'],
  called: ['in-service', 'no-show', 'cancelled'],
  'in-service': ['completed', 'cancelled'],
  deferred: ['waiting', 'cancelled'],
  completed: [],
  'no-show': [],
  cancelled: []
});

// Get all queue entries (for "all clinics" view)
router.get('/', authorize(QUEUE_READ_ROLES), async (req, res) => {
  try {
    const { queueType = 'consultation', status } = req.query;
    if (rejectQueueType(req, res, queueType)) return;
    
    const queue = await QueueEntry.getAll({
      queueType,
      status,
      doctorId: assignedDoctorScope(req.user, queueType)
    });
    
    res.json({
      success: true,
      data: queue,
      count: queue.length
    });
  } catch (error) {
    logger.error('Error fetching all queue entries:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get aggregate queue statistics for the all-clinics view.
router.get('/statistics', authorize(QUEUE_READ_ROLES), async (req, res) => {
  try {
    const { queueType = 'consultation' } = req.query;
    if (rejectQueueType(req, res, queueType)) return;
    const stats = await QueueEntry.getQueueStatistics(null, queueType);

    res.json({
      success: true,
      data: serializeQueueStatistics(stats)
    });
  } catch (error) {
    logger.error('Error fetching aggregate queue statistics:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get queue for a specific clinic
router.get('/clinic/:clinicId', authorize(QUEUE_READ_ROLES), async (req, res) => {
  try {
    const { clinicId } = req.params;
    const { queueType = 'consultation' } = req.query;
    
    if (rejectQueueType(req, res, queueType)) return;
    const queue = await QueueEntry.getClinicQueue(
      clinicId,
      queueType,
      assignedDoctorScope(req.user, queueType)
    );
    
    res.json({
      success: true,
      data: queue,
      count: queue.length
    });
  } catch (error) {
    logger.error('Error fetching clinic queue:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get queue statistics
router.get('/clinic/:clinicId/statistics', authorize(QUEUE_READ_ROLES), async (req, res) => {
  try {
    const { clinicId } = req.params;
    const { queueType = 'consultation' } = req.query;
    if (rejectQueueType(req, res, queueType)) return;
    const stats = await QueueEntry.getQueueStatistics(clinicId, queueType);
    
    res.json({
      success: true,
      data: serializeQueueStatistics(stats)
    });
  } catch (error) {
    logger.error('Error fetching queue statistics:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get doctor's queue
router.get('/doctor/:doctorId', authorize(QUEUE_READ_ROLES), async (req, res) => {
  try {
    const { doctorId } = req.params;
    if (
      !req.user.roles.some(role => ['admin', 'receptionist'].includes(role)) &&
      doctorId !== req.user.staffId
    ) {
      return res.status(403).json({ success: false, error: 'Doctor queue access denied' });
    }
    const queue = await QueueEntry.getDoctorQueue(doctorId);
    
    res.json({
      success: true,
      data: queue,
      count: queue.length
    });
  } catch (error) {
    logger.error('Error fetching doctor queue:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Add patient to queue
router.post(
  '/',
  authorize(QUEUE_REGISTER_ROLES),
  requireEncounterAccess({
    access: 'operational',
    encounterId: req => req.body.encounterId
  }),
  async (req, res) => {
  try {
    const { encounterId, patientId, clinicId, doctorId, queueType, isEmergency, waitingLocation } = req.body;
    if (patientId !== req.accessContext.patientId) {
      return res.status(409).json({ success: false, error: 'Encounter and patient do not match' });
    }
    if (!canRegisterQueueType(req.user, queueType || 'consultation')) {
      return res.status(403).json({ success: false, error: 'Queue registration denied' });
    }
    
    const queueEntry = await QueueEntry.create({
      encounterId,
      patientId,
      clinicId,
      doctorId,
      queueType: queueType || 'consultation',
      isEmergency: isEmergency || false,
      waitingLocation: waitingLocation || 'reception'
    });
    
    logger.info(`Patient ${patientId} added to queue`, { queueEntry: queueEntry.id });
    
    res.status(201).json({
      success: true,
      data: queueEntry
    });
  } catch (error) {
    logger.error('Error adding to queue:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update queue entry status with workflow logic
router.put(
  '/:id/status',
  authorize(QUEUE_PROCESS_ROLES),
  validateParams(queueStatusParamsSchema),
  validate(queueStatusSchema),
  async (req, res) => {
  let client;
  try {
    const { id } = req.validatedParams;
    const { status, nextQueue } = req.validatedData;
    client = await getDB().connect();
    await client.query('BEGIN');
    
    const queueEntry = await QueueEntry.findByPk(id, client);
    if (!queueEntry) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Queue entry not found' });
    }
    
    const db = client;
    const currentQueueType = queueEntry.queue_type;
    if (!canProcessAssignedQueue(req.user, queueEntry)) {
      await client.query('ROLLBACK');
      return res.status(403).json({
        success: false,
        error: 'This queue stage belongs to another clinical role or assigned clinician'
      });
    }

    if (status === queueEntry.status) {
      await client.query('COMMIT');
      return res.json({
        success: true,
        data: queueEntry,
        message: 'Queue status was already up to date'
      });
    }
    if (!(QUEUE_STATUS_TRANSITIONS[queueEntry.status] || []).includes(status)) {
      const error = new Error(`Queue cannot move from ${queueEntry.status} to ${status}`);
      error.status = 409;
      throw error;
    }
    if (currentQueueType === 'triage' && status === 'completed') {
      const error = new Error('Complete triage through the triage assessment so vitals and handoff are recorded');
      error.status = 409;
      throw error;
    }
    
    // Update timestamps based on status
    const updates = { status };
    if (status === 'called') updates.called_at = new Date();
    if (status === 'in-service') {
      updates.served_at = new Date();
      if (currentQueueType === 'triage') {
        await client.query(`
          UPDATE encounters
          SET status = 'triage', updated_at = NOW()
          WHERE id = $1
        `, [queueEntry.encounter_id]);
      }
      if (currentQueueType === 'consultation') {
        await client.query(`
          UPDATE encounters
          SET status = 'in-consultation',
              consultation_start_time = COALESCE(consultation_start_time, NOW()),
              updated_at = NOW()
          WHERE id = $1
        `, [queueEntry.encounter_id]);
        await client.query(`
          UPDATE appointments
          SET status = 'in-progress', updated_at = NOW()
          WHERE id = (
            SELECT appointment_id FROM encounters WHERE id = $1
          )
            AND status = 'checked-in'
        `, [queueEntry.encounter_id]);
      }
    }
    if (status === 'completed') {
      updates.completed_at = new Date();
      
      // HOSPITAL WORKFLOW LOGIC - Queue-Type Aware Routing
      // Determine where patient should go next based on current queue and user selection
      
      let targetQueue = null;
      let shouldCreateOrder = false;
      
      // Triage has a deterministic handoff. Diagnostic and pharmacy routes are
      // deliberately handled by their order-completion services so a patient
      // can return to the doctor for results instead of skipping to billing.
      if (currentQueueType === 'triage') {
        if (nextQueue && nextQueue !== 'consultation') {
          const error = new Error('Triage must hand the patient to consultation');
          error.status = 409;
          throw error;
        }
        targetQueue = 'consultation';
        shouldCreateOrder = false;
        logger.info('Auto-routing patient from triage to consultation');
        await client.query(`
          UPDATE encounters
          SET status = 'waiting',
              triage_time = COALESCE(triage_time, NOW()),
              waiting_location = 'consultation-waiting',
              updated_at = NOW()
          WHERE id = $1
        `, [queueEntry.encounter_id]);
      } else {
        const workspace = currentQueueType === 'consultation'
          ? 'consultation form'
          : `${currentQueueType} workspace`;
        const error = new Error(`Complete this service in the ${workspace}`);
        error.status = 409;
        throw error;
      }
      
      // Create queue entry for next stage if not discharging
      if (targetQueue && targetQueue !== 'discharge') {
        try {
          await QueueEntry.create({
            encounterId: queueEntry.encounter_id,
            patientId: queueEntry.patient_id,
            clinicId: queueEntry.clinic_id,
            doctorId: queueEntry.doctor_id,
            queueType: targetQueue,
            isEmergency: queueEntry.is_emergency,
            waitingLocation: targetQueue === 'pharmacy' ? 'pharmacy-waiting' : 
                            targetQueue === 'lab' ? 'lab-waiting' :
                            targetQueue === 'radiology' ? 'radiology-waiting' :
                            targetQueue === 'consultation' ? 'consultation-waiting' : 'billing-counter',
            priorityLevel: queueEntry.priority_level
          }, client);
          
          logger.info(`✅ Patient ${queueEntry.patient_id} added to ${targetQueue} queue`);
          
          // Auto-create orders ONLY when moving FROM consultation TO lab/pharmacy/radiology
          if (shouldCreateOrder) {
            try {
              if (targetQueue === 'lab') {
                const labOrderResult = await db.query(`
                  INSERT INTO lab_orders (
                    patient_id, encounter_id, ordering_doctor_id, 
                    order_date, status, priority, clinical_notes
                  ) VALUES ($1, $2, $3, NOW(), 'pending', $4, $5)
                  RETURNING id, lab_order_number
                `, [
                  queueEntry.patient_id,
                  queueEntry.encounter_id,
                  queueEntry.doctor_id,
                  queueEntry.is_emergency ? 'urgent' : 'routine',
                  'Lab tests ordered - awaiting test selection by lab technician'
                ]);
                
                logger.info(`✅ Auto-created lab order ${labOrderResult.rows[0].lab_order_number}`);
              } else if (targetQueue === 'pharmacy') {
                const prescriptionResult = await db.query(`
                  INSERT INTO prescriptions (
                    patient_id, encounter_id, doctor_id,
                    prescription_date, status, notes
                  ) VALUES ($1, $2, $3, NOW(), 'pending', $4)
                  RETURNING id, prescription_number
                `, [
                  queueEntry.patient_id,
                  queueEntry.encounter_id,
                  queueEntry.doctor_id,
                  'Prescription pending - awaiting medication entry by pharmacist'
                ]);
                
                logger.info(`✅ Auto-created prescription ${prescriptionResult.rows[0].prescription_number}`);
              } else if (targetQueue === 'radiology') {
                const radiologyOrderResult = await db.query(`
                  INSERT INTO radiology_orders (
                    patient_id, encounter_id, ordering_doctor_id,
                    order_date, status, priority, clinical_indication
                  ) VALUES ($1, $2, $3, NOW(), 'pending', $4, $5)
                  RETURNING id, order_number
                `, [
                  queueEntry.patient_id,
                  queueEntry.encounter_id,
                  queueEntry.doctor_id,
                  queueEntry.is_emergency ? 'urgent' : 'routine',
                  'Imaging ordered - awaiting study selection by radiology staff'
                ]);
                
                logger.info(`✅ Auto-created radiology order ${radiologyOrderResult.rows[0].radiology_order_number}`);
              }
            } catch (orderError) {
              // Log error but don't fail the queue movement
              logger.error(`⚠️ Failed to create order for ${targetQueue}, but patient still moved to queue:`, orderError);
            }
          }
          
          logger.info(`✅ Workflow: ${currentQueueType} → ${targetQueue} (Patient: ${queueEntry.patient_id})`);
        } catch (queueError) {
          logger.error(`❌ Failed to add patient to ${targetQueue} queue:`, queueError);
          throw queueError;
        }
      } else {
        logger.info(`✅ Patient ${queueEntry.patient_id} discharged from ${currentQueueType}`);
      }
    }
    
    const updatedEntry = await QueueEntry.update(id, updates, client);
    await client.query('COMMIT');
    
    // Emit real-time update via WebSocket
    if (updatedEntry.clinic_id) {
      emitQueueUpdate(updatedEntry.clinic_id, {
        action: status === 'completed' ? 'patient-completed' : 'status-updated',
        queueEntry: updatedEntry
      });
    }
    
    logger.info(`Queue entry ${id} status updated to ${status}`);
    
    res.json({
      success: true,
      data: updatedEntry,
      message: status === 'completed' && nextQueue ? 
        `Patient moved to ${nextQueue} queue` : 
        'Status updated successfully'
    });
  } catch (error) {
    if (client) await client.query('ROLLBACK');
    logger.error('Error updating queue status:', error);
    res.status(error.status || 500).json({
      success: false,
      error: error.status ? error.message : 'Unable to update queue status'
    });
  } finally {
    if (client) client.release();
  }
});

// Complete the nurse-owned triage assessment and hand the same visit to the
// assigned clinician. Clinical observations and the queue transition commit
// together so the patient cannot disappear between workstations.
router.post(
  '/:id/triage-complete',
  authorize(['admin', 'nurse']),
  validateParams(queueStatusParamsSchema),
  validate(triageCompletionSchema),
  async (req, res) => {
    let client;
    try {
      const { id } = req.validatedParams;
      const assessment = req.validatedData;
      client = await getDB().connect();
      await client.query('BEGIN');

      const queueEntry = await QueueEntry.findByPk(id, client);
      if (!queueEntry) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, error: 'Triage queue entry not found' });
      }
      if (queueEntry.queue_type !== 'triage') {
        await client.query('ROLLBACK');
        return res.status(409).json({ success: false, error: 'This entry is not in the triage queue' });
      }
      if (queueEntry.status !== 'in-service') {
        await client.query('ROLLBACK');
        return res.status(409).json({
          success: false,
          error: 'Start the triage service before completing its assessment'
        });
      }

      const assessmentResult = await client.query(`
        INSERT INTO triage_assessments (
          encounter_id, patient_id, performed_by, triage_level, vital_signs,
          chief_complaint, history_present_illness, past_medical_history,
          family_history, social_history, allergies, current_medications,
          notes, completed_at
        ) VALUES (
          $1, $2, $3, $4, $5::jsonb,
          $6, $7, $8, $9, $10, $11, $12, $13, NOW()
        )
        ON CONFLICT (encounter_id) DO UPDATE SET
          performed_by = EXCLUDED.performed_by,
          triage_level = EXCLUDED.triage_level,
          vital_signs = EXCLUDED.vital_signs,
          chief_complaint = EXCLUDED.chief_complaint,
          history_present_illness = EXCLUDED.history_present_illness,
          past_medical_history = EXCLUDED.past_medical_history,
          family_history = EXCLUDED.family_history,
          social_history = EXCLUDED.social_history,
          allergies = EXCLUDED.allergies,
          current_medications = EXCLUDED.current_medications,
          notes = EXCLUDED.notes,
          completed_at = NOW(),
          updated_at = NOW()
        RETURNING *
      `, [
        queueEntry.encounter_id,
        queueEntry.patient_id,
        req.user?.staffId || null,
        assessment.triageLevel,
        JSON.stringify(assessment.vitals),
        assessment.chiefComplaint || null,
        assessment.historyPresentIllness || null,
        assessment.pastMedicalHistory || null,
        assessment.familyHistory || null,
        assessment.socialHistory || null,
        assessment.allergies || null,
        assessment.currentMedications || null,
        assessment.notes || null
      ]);

      await client.query(`
        UPDATE encounters
        SET status = 'waiting',
            triage_level = $2,
            vital_signs = $3::jsonb,
            chief_complaint = $4,
            presenting_symptoms = $5,
            triage_time = NOW(),
            waiting_location = 'consultation-waiting',
            updated_at = NOW()
        WHERE id = $1
      `, [
        queueEntry.encounter_id,
        assessment.triageLevel,
        JSON.stringify(assessment.vitals),
        assessment.chiefComplaint || null,
        assessment.historyPresentIllness || null
      ]);

      const activeConsultation = await client.query(`
        SELECT *
        FROM queue_entries
        WHERE encounter_id = $1
          AND queue_type = 'consultation'
          AND status IN ('waiting', 'called', 'in-service', 'deferred')
        ORDER BY joined_at DESC
        LIMIT 1
        FOR UPDATE
      `, [queueEntry.encounter_id]);

      if (!activeConsultation.rows.length) {
        await QueueEntry.create({
          encounterId: queueEntry.encounter_id,
          patientId: queueEntry.patient_id,
          clinicId: queueEntry.clinic_id,
          doctorId: queueEntry.doctor_id,
          queueType: 'consultation',
          isEmergency: ['emergency', 'critical'].includes(assessment.triageLevel),
          waitingLocation: 'consultation-waiting',
          priorityLevel: ['emergency', 'critical'].includes(assessment.triageLevel) ? 1 : queueEntry.priority_level
        }, client);
      } else if (activeConsultation.rows[0].status === 'deferred') {
        await QueueEntry.update(activeConsultation.rows[0].id, {
          status: 'waiting',
          waiting_location: 'consultation-waiting'
        }, client);
      }

      const completedQueue = await QueueEntry.update(id, {
        status: 'completed',
        completed_at: new Date()
      }, client);

      await client.query('COMMIT');
      emitQueueRefresh(queueEntry.clinic_id, 'triage-handed-to-consultation');

      res.json({
        success: true,
        data: {
          assessment: assessmentResult.rows[0],
          queueEntry: completedQueue,
          nextQueue: 'consultation'
        },
        message: 'Triage completed and patient handed to consultation'
      });
    } catch (error) {
      if (client) await client.query('ROLLBACK');
      logger.error('Error completing triage assessment:', error);
      res.status(error.status || 500).json({
        success: false,
        error: error.status ? error.message : 'Unable to complete triage assessment'
      });
    } finally {
      if (client) client.release();
    }
  }
);

// Move patient in queue (reorder)
router.put('/:id/move', authorize(QUEUE_PROCESS_ROLES), async (req, res) => {
  try {
    const { id } = req.params;
    const { newPosition, priorityLevel } = req.body;
    
    const queueEntry = await QueueEntry.findByPk(id);
    if (!queueEntry) {
      return res.status(404).json({ success: false, error: 'Queue entry not found' });
    }
    if (!canProcessAssignedQueue(req.user, queueEntry)) {
      return res.status(403).json({
        success: false,
        error: 'This queue stage belongs to another clinical role or assigned clinician'
      });
    }
    
    const updates = {};
    if (newPosition) updates.queuePosition = newPosition;
    if (priorityLevel) updates.priorityLevel = priorityLevel;
    
    await queueEntry.update(updates);
    
    // Emit real-time update via WebSocket
    if (queueEntry.clinicId) {
      emitQueueUpdate(queueEntry.clinicId, {
        action: 'position-updated',
        queueEntry
      });
    }
    
    res.json({
      success: true,
      data: queueEntry
    });
  } catch (error) {
    logger.error('Error moving queue entry:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;

