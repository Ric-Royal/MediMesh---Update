const express = require('express');
const router = express.Router();
const { getDB } = require('../utils/database');
const { logger } = require('../utils/logger');
const { authorize } = require('../middleware/auth');
const { auditWrite } = require('../middleware/audit');

// ============================================
// OBSERVATIONS (vitals, exam findings, measurements)
// ============================================

// Get observations for an encounter
router.get('/encounter/:encounterId', authorize(['doctor', 'nurse', 'admin']), async (req, res) => {
  try {
    const { encounterId } = req.params;
    const { category } = req.query;
    const db = getDB();
    
    let query = `
      SELECT o.*,
             s.first_name || ' ' || s.last_name as taken_by_name,
             vs.first_name || ' ' || vs.last_name as verified_by_name
      FROM observations o
      LEFT JOIN staff s ON o.taken_by = s.id
      LEFT JOIN staff vs ON o.verified_by = vs.id
      WHERE o.encounter_id = $1 AND o.parent_observation_id IS NULL
    `;
    const params = [encounterId];
    
    if (category) {
      query += ` AND o.obs_category = $2`;
      params.push(category);
    }
    
    query += ` ORDER BY o.taken_at DESC`;
    
    const result = await db.query(query, params);
    
    // Get components for composite observations
    for (const obs of result.rows) {
      const components = await db.query(
        'SELECT * FROM observations WHERE parent_observation_id = $1 ORDER BY component_name',
        [obs.id]
      );
      obs.components = components.rows;
    }
    
    res.json({ success: true, data: result.rows, count: result.rows.length });
  } catch (error) {
    logger.error('Error fetching observations:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get patient vital sign history
router.get('/patient/:patientId/vitals', authorize(['doctor', 'nurse', 'admin']), async (req, res) => {
  try {
    const { patientId } = req.params;
    const { limit = 50 } = req.query;
    const db = getDB();
    
    const result = await db.query(`
      SELECT o.*, e.encounter_number
      FROM observations o
      JOIN encounters e ON o.encounter_id = e.id
      WHERE o.patient_id = $1 
        AND o.obs_category = 'vital-signs'
        AND o.parent_observation_id IS NULL
      ORDER BY o.taken_at DESC
      LIMIT $2
    `, [patientId, limit]);
    
    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('Error fetching vital history:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Record observation(s)
router.post('/', authorize(['doctor', 'nurse', 'admin']), auditWrite('observation'), async (req, res) => {
  try {
    const db = getDB();
    const {
      encounter_id, patient_id, observations
    } = req.body;
    
    if (!observations || observations.length === 0) {
      return res.status(400).json({ success: false, error: 'No observations provided' });
    }
    
    const results = [];
    
    for (const obs of observations) {
      const result = await db.query(`
        INSERT INTO observations (
          encounter_id, patient_id,
          obs_category, obs_type, code_system, code, display,
          value_numeric, value_text, value_boolean, value_code,
          unit, reference_low, reference_high, reference_text,
          interpretation, is_abnormal,
          body_site, method, device,
          taken_by, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, 'final')
        RETURNING *
      `, [
        encounter_id, patient_id,
        obs.obs_category || 'vital-signs', obs.obs_type,
        obs.code_system || 'LOCAL', obs.code, obs.display || obs.obs_type,
        obs.value_numeric, obs.value_text, obs.value_boolean, obs.value_code,
        obs.unit, obs.reference_low, obs.reference_high, obs.reference_text,
        obs.interpretation, obs.is_abnormal || false,
        obs.body_site, obs.method, obs.device,
        req.user?.id
      ]);
      
      const savedObs = result.rows[0];
      
      // Save components (e.g., systolic/diastolic for BP)
      if (obs.components && obs.components.length > 0) {
        for (const comp of obs.components) {
          await db.query(`
            INSERT INTO observations (
              encounter_id, patient_id,
              obs_category, obs_type, display,
              value_numeric, value_text, unit,
              reference_low, reference_high,
              parent_observation_id, component_name,
              taken_by, status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'final')
          `, [
            encounter_id, patient_id,
            obs.obs_category || 'vital-signs', obs.obs_type, comp.display || comp.component_name,
            comp.value_numeric, comp.value_text, comp.unit,
            comp.reference_low, comp.reference_high,
            savedObs.id, comp.component_name,
            req.user?.id
          ]);
        }
      }
      
      results.push(savedObs);
    }
    
    logger.info(`${results.length} observations recorded for encounter ${encounter_id}`);
    res.status(201).json({ success: true, data: results, count: results.length });
  } catch (error) {
    logger.error('Error recording observations:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
