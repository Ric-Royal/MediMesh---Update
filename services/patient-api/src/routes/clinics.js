const express = require('express');
const router = express.Router();
const { getDB } = require('../utils/database');
const { logger } = require('../utils/logger');
const { authorize } = require('../middleware/auth');

const CLINIC_DIRECTORY_ROLES = ['admin', 'doctor', 'nurse', 'receptionist', 'lab-tech', 'pharmacist', 'billing', 'radiologist', 'radiographer'];

// GET /api/clinics - Get all clinics
router.get('/', authorize(CLINIC_DIRECTORY_ROLES), async (req, res) => {
  try {
    const db = getDB();
    const query = `
      SELECT c.*, d.department_name
      FROM clinics c
      LEFT JOIN departments d ON c.department_id = d.id
      WHERE c.is_active = true
      ORDER BY c.clinic_name
    `;
    
    const result = await db.query(query);
    
    logger.info(`Fetched ${result.rows.length} clinics`);
    
    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length
    });
  } catch (error) {
    logger.error('Error fetching clinics:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/clinics/:id - Get single clinic
router.get('/:id', authorize(CLINIC_DIRECTORY_ROLES), async (req, res) => {
  try {
    const { id } = req.params;
    
    const query = `
      SELECT c.*, d.department_name
      FROM clinics c
      LEFT JOIN departments d ON c.department_id = d.id
      WHERE c.id = $1
    `;
    
    const result = await getDB().query(query, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Clinic not found' });
    }
    
    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    logger.error('Error fetching clinic:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;

