const express = require('express');
const Joi = require('joi');
const router = express.Router();
const Encounter = require('../models/Encounter');
const QueueEntry = require('../models/QueueEntry');
const Patient = require('../models/Patient');
const { logger } = require('../utils/logger');
const { getDB } = require('../utils/database');
const { emitQueueUpdate } = require('../utils/websocket');
const { authorize } = require('../middleware/auth');
const { requireEncounterAccess } = require('../security/accessControl');
const { validate, validateParams, uuidSchema } = require('../utils/validation');

const QUEUE_READ_ROLES = ['admin', 'doctor', 'nurse', 'receptionist', 'lab-tech', 'pharmacist', 'billing', 'radiologist', 'radiographer'];
const QUEUE_REGISTER_ROLES = ['admin', 'doctor', 'nurse', 'receptionist'];
const QUEUE_PROCESS_ROLES = ['admin', 'doctor', 'nurse', 'receptionist', 'lab-tech', 'pharmacist', 'billing', 'radiologist', 'radiographer'];
const ROLE_QUEUE_TYPES = Object.freeze({
  doctor: ['consultation'],
  nurse: ['triage', 'consultation'],
  receptionist: ['triage', 'consultation'],
  'lab-tech': ['lab'],
  pharmacist: ['pharmacy'],
  billing: ['billing'],
  radiologist: ['radiology'],
  radiographer: ['radiology']
});
const canUseQueueType = (user, queueType) =>
  user.roles.includes('admin') ||
  user.roles.some(role => (ROLE_QUEUE_TYPES[role] || []).includes(queueType));
const rejectQueueType = (req, res, queueType) => {
  if (canUseQueueType(req.user, queueType)) return false;
  res.status(403).json({ success: false, error: 'Queue access denied' });
  return true;
};

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
    
    const queue = await QueueEntry.getAll({ queueType, status });
    
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
    const queue = await QueueEntry.getClinicQueue(clinicId, queueType);
    
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
    if (rejectQueueType(req, res, queueType || 'consultation')) return;
    
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
    if (rejectQueueType(req, res, currentQueueType)) {
      await client.query('ROLLBACK');
      return;
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
    
    // Update timestamps based on status
    const updates = { status };
    if (status === 'called') updates.called_at = new Date();
    if (status === 'in-service') updates.served_at = new Date();
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

// Move patient in queue (reorder)
router.put('/:id/move', authorize(QUEUE_PROCESS_ROLES), async (req, res) => {
  try {
    const { id } = req.params;
    const { newPosition, priorityLevel } = req.body;
    
    const queueEntry = await QueueEntry.findByPk(id);
    if (!queueEntry) {
      return res.status(404).json({ success: false, error: 'Queue entry not found' });
    }
    if (rejectQueueType(req, res, queueEntry.queue_type)) return;
    
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

