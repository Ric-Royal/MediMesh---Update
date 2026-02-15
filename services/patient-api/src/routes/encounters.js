const express = require('express');
const router = express.Router();
const Encounter = require('../models/Encounter');
const QueueEntry = require('../models/QueueEntry');
const Patient = require('../models/Patient');
const { logger } = require('../utils/logger');
const { authorize } = require('../middleware/auth');

// Get all encounters for today
router.get('/today', authorize(['doctor', 'nurse', 'admin', 'receptionist']), async (req, res) => {
  try {
    const encounters = await Encounter.getEncountersByDate(new Date());
    res.json({ success: true, data: encounters, count: encounters.length });
  } catch (error) {
    logger.error('Error fetching today encounters:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get encounters by clinic
router.get('/clinic/:clinicId', authorize(['doctor', 'nurse', 'admin', 'receptionist']), async (req, res) => {
  try {
    const { clinicId } = req.params;
    const encounters = await Encounter.getActiveEncounters(clinicId);
    res.json({ success: true, data: encounters, count: encounters.length });
  } catch (error) {
    logger.error('Error fetching clinic encounters:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create new encounter
router.post('/', authorize(['doctor', 'nurse', 'admin', 'receptionist']), async (req, res) => {
  try {
    const encounterData = req.body;
    encounterData.createdBy = req.user?.id;
    
    const encounter = await Encounter.create(encounterData);
    
    // Auto-add to consultation queue if outpatient or emergency
    if (encounter.encounter_type === 'outpatient' || encounter.encounter_type === 'emergency') {
      await QueueEntry.create({
        encounterId: encounter.id,
        patientId: encounter.patient_id,
        clinicId: encounter.clinic_id || null,
        doctorId: encounter.doctor_id || null,
        queueType: 'consultation',
        isEmergency: encounter.triage_level === 'emergency',
        waitingLocation: encounter.waiting_location || 'reception'
      });
    }
    
    logger.info(`Encounter created: ${encounter.encounterNumber}`);
    res.status(201).json({ success: true, data: encounter });
  } catch (error) {
    logger.error('Error creating encounter:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get encounter by ID
router.get('/:id', authorize(['doctor', 'nurse', 'admin', 'receptionist', 'lab-tech', 'pharmacist', 'radiologist', 'billing']), async (req, res) => {
  try {
    const encounter = await Encounter.findByPk(req.params.id, {
      include: ['patient', 'doctor', 'clinic', 'department']
    });
    
    if (!encounter) {
      return res.status(404).json({ success: false, error: 'Encounter not found' });
    }
    
    res.json({ success: true, data: encounter });
  } catch (error) {
    logger.error('Error fetching encounter:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update encounter
router.put('/:id', authorize(['doctor', 'nurse', 'admin']), async (req, res) => {
  try {
    const encounter = await Encounter.findByPk(req.params.id);
    if (!encounter) {
      return res.status(404).json({ success: false, error: 'Encounter not found' });
    }
    
    await encounter.update(req.body);
    logger.info(`Encounter updated: ${encounter.encounterNumber}`);
    
    res.json({ success: true, data: encounter });
  } catch (error) {
    logger.error('Error updating encounter:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;

