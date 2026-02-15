const express = require('express');
const router = express.Router();
const { getDB } = require('../utils/database');
const { logger } = require('../utils/logger');
const { authorize } = require('../middleware/auth');

// =====================================================
// CREATE CONSULTATION WITH MULTIPLE ORDERS
// =====================================================
router.post('/', authorize(['doctor', 'admin']), async (req, res) => {
  const db = getDB();
  
  try {
    const {
      encounterId,
      patientId,
      doctorId,
      // Vitals
      vitals,
      // Clinical Information
      chiefComplaint,
      historyPresentIllness,
      pastMedicalHistory,
      familyHistory,
      socialHistory,
      allergies,
      currentMedications,
      // Physical Examination
      examination,
      // Assessment and Plan
      provisionalDiagnosis,
      differentialDiagnosis,
      finalDiagnosis,
      treatmentPlan,
      followUpInstructions,
      // Orders
      labOrders = [],
      radiologyOrders = [],
      prescriptions = []
    } = req.body;

    // Validate required fields
    if (!encounterId || !patientId || !doctorId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: encounterId, patientId, doctorId'
      });
    }

    // Start transaction
    await db.query('BEGIN');

    try {
      // 1. Create consultation record
      const consultationResult = await db.query(`
        INSERT INTO consultation_records (
          encounter_id, patient_id, doctor_id,
          blood_pressure, temperature, pulse, respiratory_rate, 
          oxygen_saturation, weight, height, bmi,
          chief_complaint, history_present_illness, past_medical_history,
          family_history, social_history, allergies, current_medications,
          general_appearance, cardiovascular_exam, respiratory_exam,
          abdominal_exam, neurological_exam, musculoskeletal_exam,
          skin_exam, other_findings,
          provisional_diagnosis, differential_diagnosis, final_diagnosis,
          treatment_plan, follow_up_instructions,
          has_lab_orders, has_radiology_orders, has_prescriptions,
          total_lab_orders, total_radiology_orders, total_prescriptions,
          status, completed_at, created_by
        ) VALUES (
          $1, $2, $3,
          $4, $5, $6, $7, $8, $9, $10, $11,
          $12, $13, $14, $15, $16, $17, $18,
          $19, $20, $21, $22, $23, $24, $25, $26,
          $27, $28, $29, $30, $31,
          $32, $33, $34, $35, $36, $37,
          $38, $39, $40
        )
        RETURNING id, consultation_date
      `, [
        encounterId, patientId, doctorId,
        vitals?.bloodPressure, vitals?.temperature, vitals?.pulse, vitals?.respiratoryRate,
        vitals?.oxygenSaturation, vitals?.weight, vitals?.height, vitals?.bmi,
        chiefComplaint, historyPresentIllness, pastMedicalHistory,
        familyHistory, socialHistory, allergies, currentMedications,
        examination?.generalAppearance, examination?.cardiovascular, examination?.respiratory,
        examination?.abdominal, examination?.neurological, examination?.musculoskeletal,
        examination?.skin, examination?.other,
        provisionalDiagnosis, differentialDiagnosis, finalDiagnosis,
        treatmentPlan, followUpInstructions,
        labOrders.length > 0, radiologyOrders.length > 0, prescriptions.length > 0,
        labOrders.length, radiologyOrders.length, prescriptions.length,
        'completed', new Date(), req.user?.id || 'system'
      ]);

      const consultationId = consultationResult.rows[0].id;
      const createdOrders = {
        labOrders: [],
        radiologyOrders: [],
        prescriptions: []
      };

      // 2. Create Lab Orders
      if (labOrders.length > 0) {
        const labOrderResult = await db.query(`
          INSERT INTO lab_orders (
            patient_id, encounter_id, ordering_doctor_id, consultation_record_id,
            order_date, status, priority, clinical_notes
          ) VALUES ($1, $2, $3, $4, NOW(), 'pending', $5, $6)
          RETURNING id, order_number
        `, [
          patientId, encounterId, doctorId, consultationId,
          labOrders[0]?.priority || 'routine',
          labOrders[0]?.clinicalNotes || provisionalDiagnosis
        ]);

        const labOrderId = labOrderResult.rows[0].id;
        const labOrderNumber = labOrderResult.rows[0].order_number;

        // Create lab order items
        for (const test of labOrders) {
          await db.query(`
            INSERT INTO lab_order_items (
              lab_order_id, test_id, status, price
            ) VALUES ($1, $2, 'pending', $3)
          `, [
            labOrderId, test.testId, test.price || 0
          ]);
        }

        // Add patient to lab queue
        await db.query(`
          INSERT INTO queue_entries (
            encounter_id, patient_id, clinic_id, doctor_id,
            queue_type, service_type, order_type,
            is_emergency, waiting_location, priority_level
          ) VALUES ($1, $2, $3, $4, 'lab', 'lab-collection', 'lab', $5, 'lab-waiting', $6)
        `, [
          encounterId, patientId, null, doctorId,
          labOrders[0]?.priority === 'urgent', 
          labOrders[0]?.priority === 'urgent' ? 1 : 3
        ]);

        createdOrders.labOrders.push({
          id: labOrderId,
          orderNumber: labOrderNumber,
          tests: labOrders
        });

        logger.info(`Created lab order ${labOrderNumber} with ${labOrders.length} tests`);
      }

      // 3. Create Radiology Orders
      if (radiologyOrders.length > 0) {
        const radiologyOrderResult = await db.query(`
          INSERT INTO radiology_orders (
            patient_id, encounter_id, ordering_doctor_id, consultation_record_id,
            order_date, status, priority, clinical_indication
          ) VALUES ($1, $2, $3, $4, NOW(), 'pending', $5, $6)
          RETURNING id, order_number
        `, [
          patientId, encounterId, doctorId, consultationId,
          radiologyOrders[0]?.priority || 'routine',
          radiologyOrders[0]?.reason || provisionalDiagnosis || 'Diagnostic imaging'
        ]);

        const radiologyOrderId = radiologyOrderResult.rows[0].id;
        const radiologyOrderNumber = radiologyOrderResult.rows[0].order_number;

        // Create radiology order items
        for (const study of radiologyOrders) {
          await db.query(`
            INSERT INTO radiology_order_items (
              radiology_order_id, test_id, body_part, status, price
            ) VALUES ($1, $2, $3, 'pending', $4)
          `, [
            radiologyOrderId, study.studyId || study.testId, 
            study.bodyPart || null, study.price || 0
          ]);
        }

        // Add patient to radiology queue
        await db.query(`
          INSERT INTO queue_entries (
            encounter_id, patient_id, clinic_id, doctor_id,
            queue_type, service_type, order_type,
            is_emergency, waiting_location, priority_level
          ) VALUES ($1, $2, $3, $4, 'radiology', 'radiology-imaging', 'radiology', $5, 'radiology-waiting', $6)
        `, [
          encounterId, patientId, null, doctorId,
          radiologyOrders[0]?.priority === 'urgent',
          radiologyOrders[0]?.priority === 'urgent' ? 1 : 3
        ]);

        createdOrders.radiologyOrders.push({
          id: radiologyOrderId,
          orderNumber: radiologyOrderNumber,
          studies: radiologyOrders
        });

        logger.info(`Created radiology order ${radiologyOrderNumber} with ${radiologyOrders.length} studies`);
      }

      // 4. Create Prescriptions
      if (prescriptions.length > 0) {
        const prescriptionResult = await db.query(`
          INSERT INTO prescriptions (
            patient_id, encounter_id, doctor_id, consultation_record_id,
            prescription_date, status, notes
          ) VALUES ($1, $2, $3, $4, NOW(), 'pending', $5)
          RETURNING id, prescription_number
        `, [
          patientId, encounterId, doctorId, consultationId,
          treatmentPlan || 'Medications as prescribed'
        ]);

        const prescriptionId = prescriptionResult.rows[0].id;
        const prescriptionNumber = prescriptionResult.rows[0].prescription_number;

        // Create prescription items
        for (const medication of prescriptions) {
          await db.query(`
            INSERT INTO prescription_items (
              prescription_id, drug_id, dosage, frequency,
              duration_days, quantity, notes, unit_price, total_price
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          `, [
            prescriptionId, medication.drugId, 
            medication.dosage, medication.frequency, 
            parseInt(medication.duration) || 0,
            medication.quantity, medication.instructions || null,
            medication.unitPrice || 0, medication.totalPrice || 0
          ]);
        }

        // Add patient to pharmacy queue
        await db.query(`
          INSERT INTO queue_entries (
            encounter_id, patient_id, clinic_id, doctor_id,
            queue_type, service_type, order_type,
            is_emergency, waiting_location, priority_level
          ) VALUES ($1, $2, $3, $4, 'pharmacy', 'pharmacy-dispensing', 'pharmacy', FALSE, 'pharmacy-waiting', 3)
        `, [encounterId, patientId, null, doctorId]);

        createdOrders.prescriptions.push({
          id: prescriptionId,
          prescriptionNumber,
          medications: prescriptions
        });

        logger.info(`Created prescription ${prescriptionNumber} with ${prescriptions.length} medications`);
      }

      // 5. Update encounter
      await db.query(`
        UPDATE encounters SET
          consultation_completed = TRUE,
          has_pending_orders = $1,
          pending_lab_orders = $2,
          pending_radiology_orders = $3,
          pending_prescriptions = $4
        WHERE id = $5
      `, [
        labOrders.length > 0 || radiologyOrders.length > 0 || prescriptions.length > 0,
        labOrders.length,
        radiologyOrders.length,
        prescriptions.length,
        encounterId
      ]);

      // 6. Update consultation queue entry status
      await db.query(`
        UPDATE queue_entries SET
          status = 'completed',
          completed_at = NOW()
        WHERE encounter_id = $1 AND queue_type = 'consultation' AND status != 'completed'
      `, [encounterId]);

      // Commit transaction
      await db.query('COMMIT');

      logger.info(`✅ Consultation created for patient ${patientId} with ${labOrders.length} lab orders, ${radiologyOrders.length} radiology orders, ${prescriptions.length} prescriptions`);

      res.json({
        success: true,
        data: {
          consultationId,
          consultationDate: consultationResult.rows[0].consultation_date,
          orders: createdOrders
        },
        message: 'Consultation completed and orders created successfully'
      });

    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    }

  } catch (error) {
    logger.error('Error creating consultation:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// =====================================================
// GET CONSULTATION BY ID
// =====================================================
router.get('/:id', authorize(['doctor', 'nurse', 'admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const db = getDB();

    const result = await db.query(`
      SELECT 
        cr.*,
        p.first_name || ' ' || p.last_name as patient_name,
        p.uhid,
        s.first_name || ' ' || s.last_name as doctor_name,
        s.specialization as doctor_specialization
      FROM consultation_records cr
      JOIN patients p ON cr.patient_id = p.id
      JOIN staff s ON cr.doctor_id = s.id
      WHERE cr.id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Consultation not found'
      });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });

  } catch (error) {
    logger.error('Error fetching consultation:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// =====================================================
// GET CONSULTATIONS BY ENCOUNTER
// =====================================================
router.get('/encounter/:encounterId', authorize(['doctor', 'nurse', 'admin']), async (req, res) => {
  try {
    const { encounterId } = req.params;
    const db = getDB();

    const result = await db.query(`
      SELECT 
        cr.*,
        s.first_name || ' ' || s.last_name as doctor_name,
        s.specialization as doctor_specialization
      FROM consultation_records cr
      JOIN staff s ON cr.doctor_id = s.id
      WHERE cr.encounter_id = $1
      ORDER BY cr.consultation_date DESC
    `, [encounterId]);

    res.json({
      success: true,
      data: result.rows
    });

  } catch (error) {
    logger.error('Error fetching consultations:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// =====================================================
// GET PENDING ORDERS FOR ENCOUNTER
// =====================================================
router.get('/encounter/:encounterId/pending-orders', authorize(['doctor', 'nurse', 'admin', 'lab-tech', 'pharmacist', 'radiologist']), async (req, res) => {
  try {
    const { encounterId } = req.params;
    const db = getDB();

    // Get pending lab orders
    const labOrders = await db.query(`
      SELECT 
        lo.id, lo.lab_order_number, lo.status, lo.priority, lo.order_date,
        json_agg(
          json_build_object(
            'id', loi.id,
            'testName', loi.test_name,
            'testCode', loi.test_code,
            'status', loi.status,
            'resultValue', loi.result_value,
            'isAbnormal', loi.is_abnormal
          )
        ) as tests
      FROM lab_orders lo
      LEFT JOIN lab_order_items loi ON lo.id = loi.lab_order_id
      WHERE lo.encounter_id = $1 AND lo.status IN ('pending', 'collected', 'processing')
      GROUP BY lo.id
    `, [encounterId]);

    // Get pending radiology orders
    const radiologyOrders = await db.query(`
      SELECT 
        ro.id, ro.radiology_order_number, ro.status, ro.priority, ro.order_date,
        json_agg(
          json_build_object(
            'id', roi.id,
            'studyName', roi.study_name,
            'studyCode', roi.study_code,
            'modality', roi.modality,
            'status', roi.status
          )
        ) as studies
      FROM radiology_orders ro
      LEFT JOIN radiology_order_items roi ON ro.id = roi.radiology_order_id
      WHERE ro.encounter_id = $1 AND ro.status IN ('pending', 'scheduled', 'in-progress')
      GROUP BY ro.id
    `, [encounterId]);

    // Get pending prescriptions
    const prescriptions = await db.query(`
      SELECT 
        p.id, p.prescription_number, p.status, p.prescription_date,
        json_agg(
          json_build_object(
            'id', pi.id,
            'drugName', pi.drug_name,
            'dosage', pi.dosage,
            'frequency', pi.frequency,
            'duration', pi.duration,
            'quantity', pi.quantity,
            'dispensedQuantity', pi.dispensed_quantity
          )
        ) as medications
      FROM prescriptions p
      LEFT JOIN prescription_items pi ON p.id = pi.prescription_id
      WHERE p.encounter_id = $1 AND p.status IN ('pending', 'processing')
      GROUP BY p.id
    `, [encounterId]);

    res.json({
      success: true,
      data: {
        labOrders: labOrders.rows,
        radiologyOrders: radiologyOrders.rows,
        prescriptions: prescriptions.rows
      }
    });

  } catch (error) {
    logger.error('Error fetching pending orders:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;

