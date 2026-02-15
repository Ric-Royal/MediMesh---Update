const express = require('express');
const router = express.Router();
const { getDB } = require('../utils/database');
const { logger } = require('../utils/logger');
const { authorize } = require('../middleware/auth');
const { auditWrite } = require('../middleware/audit');

// ============================================
// ENCOUNTER DIAGNOSES (coded, queryable)
// ============================================

// Get diagnoses for an encounter
router.get('/encounter/:encounterId', authorize(['doctor', 'nurse', 'admin']), async (req, res) => {
  try {
    const { encounterId } = req.params;
    const db = getDB();
    
    const result = await db.query(`
      SELECT ed.*,
             s.first_name || ' ' || s.last_name as recorded_by_name
      FROM encounter_diagnoses ed
      LEFT JOIN staff s ON ed.recorded_by = s.id
      WHERE ed.encounter_id = $1
      ORDER BY ed.is_primary DESC, ed.sequence_number
    `, [encounterId]);
    
    res.json({ success: true, data: result.rows, count: result.rows.length });
  } catch (error) {
    logger.error('Error fetching encounter diagnoses:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Add diagnosis to encounter
router.post('/', authorize(['doctor', 'admin']), auditWrite('encounter_diagnosis', { sensitive: true }), async (req, res) => {
  try {
    const {
      encounter_id, code_system, code, display,
      diagnosis_type, is_primary, severity, certainty,
      body_site, laterality, clinical_notes, onset_date
    } = req.body;
    
    const db = getDB();
    
    // If this is primary, unset other primaries for this encounter
    if (is_primary) {
      await db.query(
        'UPDATE encounter_diagnoses SET is_primary = FALSE WHERE encounter_id = $1',
        [encounter_id]
      );
    }
    
    const result = await db.query(`
      INSERT INTO encounter_diagnoses (
        encounter_id, code_system, code, display,
        diagnosis_type, is_primary, severity, certainty,
        body_site, laterality, clinical_notes, onset_date,
        recorded_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `, [
      encounter_id, code_system || 'ICD-10', code, display,
      diagnosis_type || 'provisional', is_primary || false,
      severity, certainty || 'suspected',
      body_site, laterality, clinical_notes, onset_date,
      req.user?.id
    ]);
    
    logger.info(`Diagnosis added: ${code} - ${display} for encounter ${encounter_id}`);
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Error adding diagnosis:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update diagnosis
router.put('/:id', authorize(['doctor', 'admin']), auditWrite('encounter_diagnosis', { sensitive: true }), async (req, res) => {
  try {
    const { id } = req.params;
    const {
      diagnosis_type, is_primary, severity, certainty,
      resolved_date, clinical_notes
    } = req.body;
    
    const db = getDB();
    
    const result = await db.query(`
      UPDATE encounter_diagnoses SET
        diagnosis_type = COALESCE($1, diagnosis_type),
        is_primary = COALESCE($2, is_primary),
        severity = COALESCE($3, severity),
        certainty = COALESCE($4, certainty),
        resolved_date = COALESCE($5, resolved_date),
        clinical_notes = COALESCE($6, clinical_notes),
        updated_by = $7,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $8
      RETURNING *
    `, [diagnosis_type, is_primary, severity, certainty, resolved_date, clinical_notes, req.user?.id, id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Diagnosis not found' });
    }
    
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Error updating diagnosis:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Search diagnoses by ICD code (for auto-complete)
router.get('/search', authorize(['doctor', 'nurse', 'admin']), async (req, res) => {
  try {
    const { q, code_system = 'ICD-10' } = req.query;
    if (!q || q.length < 2) {
      return res.json({ success: true, data: [] });
    }
    
    const db = getDB();
    
    // Search recent diagnoses used in this system (local cache)
    const result = await db.query(`
      SELECT DISTINCT code, display, code_system
      FROM encounter_diagnoses
      WHERE code_system = $1
        AND (code ILIKE $2 OR display ILIKE $2)
      ORDER BY display
      LIMIT 20
    `, [code_system, `%${q}%`]);
    
    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('Error searching diagnoses:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
