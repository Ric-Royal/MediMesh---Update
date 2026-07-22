const express = require('express');
const router = express.Router();
const { getDB } = require('../utils/database');
const { logger } = require('../utils/logger');
const { authorize } = require('../middleware/auth');

const STAFF_DIRECTORY_ROLES = ['admin', 'doctor', 'nurse', 'receptionist'];

// GET /api/staff - Get all staff with optional role filter
router.get('/', authorize(STAFF_DIRECTORY_ROLES), async (req, res) => {
  try {
    const db = getDB();
    const { role, department_id, status = 'active' } = req.query;
    
    let query = `
      SELECT s.*, d.department_name
      FROM staff s
      LEFT JOIN departments d ON s.department_id = d.id
      WHERE 1=1
    `;
    
    const values = [];
    let paramCount = 1;
    
    if (role) {
      query += ` AND s.role = $${paramCount++}`;
      values.push(role);
    }
    
    if (department_id) {
      query += ` AND s.department_id = $${paramCount++}`;
      values.push(department_id);
    }
    
    if (status) {
      query += ` AND s.status = $${paramCount++}`;
      values.push(status);
    }
    
    query += ` ORDER BY s.first_name, s.last_name`;
    
    const result = await db.query(query, values);
    
    logger.info(`Fetched ${result.rows.length} staff members (role: ${role || 'all'})`);
    
    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length
    });
  } catch (error) {
    logger.error('Error fetching staff:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/staff/:id - Get single staff member
router.get('/:id', authorize(STAFF_DIRECTORY_ROLES), async (req, res) => {
  try {
    const { id } = req.params;
    
    const query = `
      SELECT s.*, d.department_name
      FROM staff s
      LEFT JOIN departments d ON s.department_id = d.id
      WHERE s.id = $1
    `;
    
    const result = await getDB().query(query, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Staff member not found' });
    }
    
    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    logger.error('Error fetching staff member:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;

