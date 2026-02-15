const express = require('express');
const router = express.Router();
const { getDB } = require('../utils/database');
const { logger } = require('../utils/logger');
const { authorize } = require('../middleware/auth');

// Get all wards
router.get('/', authorize(['nurse', 'doctor', 'admin', 'receptionist']), async (req, res) => {
  try {
    const query = `
      SELECT w.*,
             d.department_name,
             (SELECT COUNT(*) FROM beds WHERE ward_id = w.id AND status = 'occupied') as occupied_beds
      FROM wards w
      LEFT JOIN departments d ON w.department_id = d.id
      WHERE w.is_active = true
      ORDER BY w.ward_name
    `;
    const result = await getDB().query(query);
    res.json({ success: true, data: result.rows, count: result.rows.length });
  } catch (error) {
    logger.error('Error fetching wards:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get ward occupancy details
router.get('/:wardId/occupancy', authorize(['nurse', 'doctor', 'admin']), async (req, res) => {
  try {
    const { wardId } = req.params;
    
    const query = `
      SELECT 
        b.*,
        a.admission_number,
        a.admission_date,
        a.status as admission_status,
        p.first_name,
        p.last_name,
        p.uhid,
        p.payment_type,
        s.first_name as doctor_first_name,
        s.last_name as doctor_last_name
      FROM beds b
      LEFT JOIN admissions a ON b.id = a.bed_id AND a.status IN ('admitted', 'under-care')
      LEFT JOIN patients p ON a.patient_id = p.id
      LEFT JOIN staff s ON b.assigned_doctor_id = s.id
      WHERE b.ward_id = $1 AND b.is_active = true
      ORDER BY b.bed_number
    `;
    const result = await getDB().query(query, [wardId]);
    res.json({ success: true, data: result.rows, count: result.rows.length });
  } catch (error) {
    logger.error('Error fetching ward occupancy:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get occupancy statistics
router.get('/:wardId/statistics', authorize(['nurse', 'admin', 'manager']), async (req, res) => {
  try {
    const { wardId } = req.params;
    
    const query = `
      SELECT 
        w.total_beds,
        COUNT(CASE WHEN b.status = 'occupied' THEN 1 END) as occupied,
        COUNT(CASE WHEN b.status = 'available' THEN 1 END) as available,
        COUNT(CASE WHEN b.status = 'isolation' THEN 1 END) as isolation,
        COUNT(CASE WHEN a.expected_discharge_date = CURRENT_DATE THEN 1 END) as discharges_today
      FROM wards w
      LEFT JOIN beds b ON w.id = b.ward_id
      LEFT JOIN admissions a ON b.id = a.bed_id AND a.status IN ('admitted', 'under-care', 'pending-discharge')
      WHERE w.id = $1
      GROUP BY w.id, w.total_beds
    `;
    const result = await getDB().query(query, [wardId]);
    res.json({ success: true, data: result.rows[0] || {} });
  } catch (error) {
    logger.error('Error fetching ward statistics:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;

