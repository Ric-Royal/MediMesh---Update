const express = require('express');
const router = express.Router();
const Encounter = require('../models/Encounter');
const QueueEntry = require('../models/QueueEntry');
const Patient = require('../models/Patient');
const { logger } = require('../utils/logger');
const { emitQueueUpdate } = require('../utils/websocket');

// Get queue for a specific clinic
router.get('/clinic/:clinicId', async (req, res) => {
  try {
    const { clinicId } = req.params;
    const { queueType = 'consultation' } = req.query;
    
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
router.get('/clinic/:clinicId/statistics', async (req, res) => {
  try {
    const { clinicId } = req.params;
    const stats = await QueueEntry.getQueueStatistics(clinicId);
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('Error fetching queue statistics:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get doctor's queue
router.get('/doctor/:doctorId', async (req, res) => {
  try {
    const { doctorId } = req.params;
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
router.post('/', async (req, res) => {
  try {
    const { encounterId, patientId, clinicId, doctorId, queueType, isEmergency, waitingLocation } = req.body;
    
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

// Update queue entry status
router.put('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    const queueEntry = await QueueEntry.findByPk(id);
    if (!queueEntry) {
      return res.status(404).json({ success: false, error: 'Queue entry not found' });
    }
    
    // Update timestamps based on status
    const updates = { status };
    if (status === 'called') updates.calledAt = new Date();
    if (status === 'in-service') updates.servedAt = new Date();
    if (status === 'completed') updates.completedAt = new Date();
    
    await queueEntry.update(updates);
    
    // Emit real-time update via WebSocket
    if (queueEntry.clinicId) {
      emitQueueUpdate(queueEntry.clinicId, {
        action: 'status-updated',
        queueEntry
      });
    }
    
    logger.info(`Queue entry ${id} status updated to ${status}`);
    
    res.json({
      success: true,
      data: queueEntry
    });
  } catch (error) {
    logger.error('Error updating queue status:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Move patient in queue (reorder)
router.put('/:id/move', async (req, res) => {
  try {
    const { id } = req.params;
    const { newPosition, priorityLevel } = req.body;
    
    const queueEntry = await QueueEntry.findByPk(id);
    if (!queueEntry) {
      return res.status(404).json({ success: false, error: 'Queue entry not found' });
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

