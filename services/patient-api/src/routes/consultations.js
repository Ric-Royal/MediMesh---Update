const express = require('express');
const Joi = require('joi');
const router = express.Router();
const { getDB } = require('../utils/database');
const { logger } = require('../utils/logger');
const { authorize } = require('../middleware/auth');
const { validate } = require('../utils/validation');
const {
  isAdmin,
  requireConsultationAccess,
  requireEncounterAccess,
  requireProviderIdentity
} = require('../security/accessControl');

const CONSULTATION_READ_ROLES = ['admin', 'doctor', 'nurse'];
const CONSULTATION_WRITE_ROLES = ['admin', 'doctor'];
const MedicalRecord = require('../models/MedicalRecord');
const orderId = Joi.string().uuid().required();
const catalogId = Joi.number().integer().positive().required();
const consultationSchema = Joi.object({
  encounterId: orderId,
  patientId: orderId,
  doctorId: Joi.string().uuid(),
  vitals: Joi.object().max(20),
  chiefComplaint: Joi.string().allow('').max(4000),
  historyPresentIllness: Joi.string().allow('').max(12000),
  pastMedicalHistory: Joi.string().allow('').max(12000),
  familyHistory: Joi.string().allow('').max(8000),
  socialHistory: Joi.string().allow('').max(8000),
  allergies: Joi.string().allow('').max(8000),
  currentMedications: Joi.string().allow('').max(12000),
  examination: Joi.object().max(20),
  provisionalDiagnosis: Joi.string().allow('').max(8000),
  differentialDiagnosis: Joi.string().allow('').max(8000),
  finalDiagnosis: Joi.string().allow('').max(8000),
  treatmentPlan: Joi.string().allow('').max(12000),
  followUpInstructions: Joi.string().allow('').max(8000),
  labOrders: Joi.array().max(25).items(Joi.object({
    testId: catalogId,
    testName: Joi.string().max(250),
    priority: Joi.string().valid('routine', 'urgent', 'stat', 'emergency'),
    clinicalNotes: Joi.string().allow('').max(4000),
    price: Joi.any().strip()
  }).unknown(false)).default([]),
  radiologyOrders: Joi.array().max(25).items(Joi.object({
    studyId: Joi.number().integer().positive(),
    testId: Joi.number().integer().positive(),
    testName: Joi.string().max(250),
    bodyPart: Joi.string().allow('').max(250),
    reason: Joi.string().allow('').max(4000),
    priority: Joi.string().valid('routine', 'urgent', 'stat', 'emergency'),
    price: Joi.any().strip()
  }).or('studyId', 'testId').unknown(false)).default([]),
  prescriptions: Joi.array().max(50).items(Joi.object({
    drugId: catalogId,
    drugName: Joi.string().max(250),
    dosage: Joi.string().max(250).required(),
    frequency: Joi.string().max(100).required(),
    duration: Joi.number().integer().min(1).max(365).required(),
    quantity: Joi.number().integer().min(1).max(10000).required(),
    instructions: Joi.string().allow('').max(2000),
    unitPrice: Joi.any().strip(),
    totalPrice: Joi.any().strip()
  }).unknown(false)).default([])
}).unknown(false);

// =====================================================
// CREATE CONSULTATION WITH MULTIPLE ORDERS
// =====================================================
router.post('/',
  authorize(CONSULTATION_WRITE_ROLES),
  validate(consultationSchema),
  requireProviderIdentity('doctor'),
  requireEncounterAccess({ encounterId: req => req.validatedData.encounterId }),
  async (req, res) => {
  const db = await getDB().connect();
  
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
    } = req.validatedData;

    // Validate required fields
    if (!encounterId || !patientId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required patient or encounter context'
      });
    }

    // Helper: convert empty strings to null (PostgreSQL rejects '' for numeric columns)
    const emptyToNull = (v) => (v === '' || v === undefined ? null : v);
    const toNum = (v) => { const n = parseFloat(v); return isNaN(n) ? null : n; };

    // Start transaction
    await db.query('BEGIN');

    try {
      const encounterCheck = await db.query(`
        SELECT id, doctor_id
        FROM encounters
        WHERE id = $1 AND patient_id = $2
        FOR UPDATE
      `, [encounterId, patientId]);
      if (!encounterCheck.rows.length) {
        const error = new Error('Encounter does not belong to the supplied patient');
        error.status = 409;
        throw error;
      }

      const assignedDoctorId = encounterCheck.rows[0].doctor_id;
      let resolvedDoctorId;

      if (isAdmin(req.user)) {
        if (assignedDoctorId && doctorId && assignedDoctorId !== doctorId) {
          const error = new Error('Selected clinician does not match the clinician assigned to this visit');
          error.status = 409;
          throw error;
        }
        resolvedDoctorId = assignedDoctorId || doctorId;
      } else {
        resolvedDoctorId = req.user.staffId;
        if (doctorId && doctorId !== resolvedDoctorId) {
          const error = new Error('A clinician cannot record a consultation under another provider');
          error.status = 403;
          throw error;
        }
        if (assignedDoctorId && assignedDoctorId !== resolvedDoctorId) {
          const error = new Error('This visit is assigned to another clinician');
          error.status = 403;
          throw error;
        }
      }

      if (!resolvedDoctorId) {
        const error = new Error('Assign an active clinician to the visit before completing the consultation');
        error.status = 409;
        throw error;
      }

      const providerCheck = await db.query(`
        SELECT id
        FROM staff
        WHERE id = $1
          AND role = 'doctor'
          AND status = 'active'
          AND NULLIF(TRIM(staff_number), '') IS NOT NULL
      `, [resolvedDoctorId]);
      if (!providerCheck.rows.length) {
        const error = new Error('The assigned clinician is not an active provider');
        error.status = 409;
        throw error;
      }

      if (!assignedDoctorId) {
        await db.query(
          'UPDATE encounters SET doctor_id = $2, updated_at = NOW() WHERE id = $1',
          [encounterId, resolvedDoctorId]
        );
      }

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
        encounterId, patientId, resolvedDoctorId,
        emptyToNull(vitals?.bloodPressure), toNum(vitals?.temperature), toNum(vitals?.pulse), toNum(vitals?.respiratoryRate),
        toNum(vitals?.oxygenSaturation), toNum(vitals?.weight), toNum(vitals?.height), toNum(vitals?.bmi),
        emptyToNull(chiefComplaint), emptyToNull(historyPresentIllness), emptyToNull(pastMedicalHistory),
        emptyToNull(familyHistory), emptyToNull(socialHistory), emptyToNull(allergies), emptyToNull(currentMedications),
        emptyToNull(examination?.generalAppearance), emptyToNull(examination?.cardiovascular), emptyToNull(examination?.respiratory),
        emptyToNull(examination?.abdominal), emptyToNull(examination?.neurological), emptyToNull(examination?.musculoskeletal),
        emptyToNull(examination?.skin), emptyToNull(examination?.other),
        emptyToNull(provisionalDiagnosis), emptyToNull(differentialDiagnosis), emptyToNull(finalDiagnosis),
        emptyToNull(treatmentPlan), emptyToNull(followUpInstructions),
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

      // 1b. Auto-create Medical Record for this consultation
      try {
        // Look up doctor name
        const doctorResult = await db.query(
          "SELECT first_name || ' ' || last_name as name FROM staff WHERE id = $1",
          [resolvedDoctorId]
        );
        const doctorName = doctorResult.rows[0]?.name || 'Unknown Provider';

        // Build vitals JSON
        const vitalsJson = vitals ? JSON.stringify({
          bloodPressure: vitals.bloodPressure,
          temperature: vitals.temperature,
          pulse: vitals.pulse,
          respiratoryRate: vitals.respiratoryRate,
          oxygenSaturation: vitals.oxygenSaturation,
          weight: vitals.weight,
          height: vitals.height,
          bmi: vitals.bmi,
        }) : null;

        // Build medications summary
        const medsJson = prescriptions.length > 0
          ? JSON.stringify(prescriptions.map(m => ({
              drug: m.drugName || m.drugId,
              dosage: m.dosage,
              frequency: m.frequency,
              duration: m.duration,
            })))
          : null;

        // Build lab summary
        const labJson = labOrders.length > 0
          ? JSON.stringify(labOrders.map(t => ({
              test: t.testName || t.testId,
              priority: t.priority || 'routine',
            })))
          : null;

        await MedicalRecord.create({
          patient_id: patientId,
          record_type: 'consultation',
          record_date: new Date(),
          provider_name: doctorName,
          diagnosis: finalDiagnosis || provisionalDiagnosis || null,
          treatment_plan: treatmentPlan || null,
          medications: medsJson,
          lab_results: labJson,
          notes: [
            chiefComplaint ? `Chief Complaint: ${chiefComplaint}` : null,
            historyPresentIllness ? `HPI: ${historyPresentIllness}` : null,
            followUpInstructions ? `Follow-up: ${followUpInstructions}` : null,
          ].filter(Boolean).join('\n') || null,
          vital_signs: vitalsJson,
          follow_up_date: null,
        }, req.user.id, db);

        logger.info(`Auto-created medical record for consultation ${consultationId}`);
      } catch (mrError) {
        logger.error('Failed to create the consultation medical record:', mrError);
        throw mrError;
      }

      // 2. Create Lab Orders
      if (labOrders.length > 0) {
        const labOrderResult = await db.query(`
          INSERT INTO lab_orders (
            patient_id, encounter_id, ordering_doctor_id, consultation_record_id,
            order_date, status, priority, clinical_notes
          ) VALUES ($1, $2, $3, $4, NOW(), 'pending', $5, $6)
          RETURNING id, order_number
        `, [
          patientId, encounterId, resolvedDoctorId, consultationId,
          labOrders[0]?.priority || 'routine',
          labOrders[0]?.clinicalNotes || provisionalDiagnosis
        ]);

        const labOrderId = labOrderResult.rows[0].id;
        const labOrderNumber = labOrderResult.rows[0].order_number;

        // Create lab order items (look up real prices from catalog)
        for (const test of labOrders) {
          const priceResult = await db.query(
            'SELECT price FROM lab_tests WHERE id = $1 AND is_active = TRUE',
            [test.testId]
          );
          const testPrice = Number(priceResult.rows[0]?.price);
          if (!priceResult.rows.length || !Number.isFinite(testPrice) || testPrice < 0) {
            throw new Error('A selected laboratory test is unavailable or has no valid catalog price');
          }
          await db.query(`
            INSERT INTO lab_order_items (
              lab_order_id, test_id, status, price
            ) VALUES ($1, $2, 'pending', $3)
          `, [
            labOrderId, test.testId, testPrice
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
          encounterId, patientId, null, resolvedDoctorId,
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
          patientId, encounterId, resolvedDoctorId, consultationId,
          radiologyOrders[0]?.priority || 'routine',
          radiologyOrders[0]?.reason || provisionalDiagnosis || 'Diagnostic imaging'
        ]);

        const radiologyOrderId = radiologyOrderResult.rows[0].id;
        const radiologyOrderNumber = radiologyOrderResult.rows[0].order_number;

        // Create radiology order items (look up real prices from catalog)
        for (const study of radiologyOrders) {
          const priceResult = await db.query(
            'SELECT price FROM radiology_tests WHERE id = $1 AND is_active = TRUE',
            [study.studyId || study.testId]
          );
          const studyPrice = Number(priceResult.rows[0]?.price);
          if (!priceResult.rows.length || !Number.isFinite(studyPrice) || studyPrice < 0) {
            throw new Error('A selected imaging study is unavailable or has no valid catalog price');
          }
          await db.query(`
            INSERT INTO radiology_order_items (
              radiology_order_id, test_id, body_part, status, price
            ) VALUES ($1, $2, $3, 'pending', $4)
          `, [
            radiologyOrderId, study.studyId || study.testId, 
            study.bodyPart || null, studyPrice
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
          encounterId, patientId, null, resolvedDoctorId,
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
          patientId, encounterId, resolvedDoctorId, consultationId,
          treatmentPlan || 'Medications as prescribed'
        ]);

        const prescriptionId = prescriptionResult.rows[0].id;
        const prescriptionNumber = prescriptionResult.rows[0].prescription_number;

        // Create prescription items (look up real prices from drug catalog)
        for (const medication of prescriptions) {
          const priceResult = await db.query(
            'SELECT selling_price FROM drugs WHERE id = $1 AND is_active = TRUE',
            [medication.drugId]
          );
          const unitPrice = Number(priceResult.rows[0]?.selling_price);
          if (!priceResult.rows.length || !Number.isFinite(unitPrice) || unitPrice < 0) {
            throw new Error('A selected medicine is unavailable or has no valid catalog price');
          }
          const totalPrice = Math.round(unitPrice * medication.quantity * 100) / 100;
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
            unitPrice, totalPrice
          ]);
        }

        // Add patient to pharmacy queue
        await db.query(`
          INSERT INTO queue_entries (
            encounter_id, patient_id, clinic_id, doctor_id,
            queue_type, service_type, order_type,
            is_emergency, waiting_location, priority_level
          ) VALUES ($1, $2, $3, $4, 'pharmacy', 'pharmacy-dispensing', 'pharmacy', FALSE, 'pharmacy-waiting', 3)
        `, [encounterId, patientId, null, resolvedDoctorId]);

        createdOrders.prescriptions.push({
          id: prescriptionId,
          prescriptionNumber,
          medications: prescriptions
        });

        logger.info(`Created prescription ${prescriptionNumber} with ${prescriptions.length} medications`);
      }

      // 5. Recount the entire encounter. A results-review consultation can
      // create another order, so counts from only this form submission would
      // erase work that another department is still processing.
      const pendingCountsResult = await db.query(`
        SELECT
          (SELECT COUNT(*) FROM lab_orders
           WHERE encounter_id = $1 AND status NOT IN ('completed', 'cancelled', 'rejected'))::int AS lab,
          (SELECT COUNT(*) FROM radiology_orders
           WHERE encounter_id = $1 AND status NOT IN ('completed', 'reported', 'cancelled'))::int AS radiology,
          (SELECT COUNT(*) FROM prescriptions
           WHERE encounter_id = $1 AND status NOT IN ('fully-dispensed', 'cancelled'))::int AS pharmacy
      `, [encounterId]);
      const pendingCounts = pendingCountsResult.rows[0];
      const hasPendingOrders = pendingCounts.lab > 0 || pendingCounts.radiology > 0 || pendingCounts.pharmacy > 0;

      await db.query(`
        UPDATE encounters SET
          status = CASE
            WHEN $2::int > 0 THEN 'pending-lab'
            WHEN $3::int > 0 THEN 'pending-radiology'
            WHEN $4::int > 0 THEN 'pending-pharmacy'
            ELSE 'waiting'
          END,
          consultation_completed = TRUE,
          consultation_end_time = COALESCE(consultation_end_time, NOW()),
          has_pending_orders = $1,
          pending_lab_orders = $2,
          pending_radiology_orders = $3,
          pending_prescriptions = $4,
          all_services_completed = NOT $1,
          updated_at = NOW()
        WHERE id = $5
      `, [
        hasPendingOrders,
        pendingCounts.lab,
        pendingCounts.radiology,
        pendingCounts.pharmacy,
        encounterId
      ]);

      await db.query(`
        UPDATE appointments
        SET status = CASE WHEN $2 THEN 'in-progress' ELSE 'completed' END,
            completed_at = CASE WHEN $2 THEN NULL ELSE COALESCE(completed_at, NOW()) END,
            updated_at = NOW()
        WHERE id = (
          SELECT appointment_id FROM encounters WHERE id = $1
        )
          AND status IN ('checked-in', 'in-progress')
      `, [encounterId, hasPendingOrders]);

      // 6. Update consultation queue entry status
      await db.query(`
        UPDATE queue_entries SET
          status = 'completed',
          completed_at = NOW()
        WHERE encounter_id = $1 AND queue_type = 'consultation' AND status != 'completed'
      `, [encounterId]);

      if (hasPendingOrders) {
        // Cashier handoff is deferred until diagnostics have returned to the
        // clinician and every final service has been completed.
        await db.query(`
          UPDATE queue_entries
          SET status = 'deferred', updated_at = NOW(),
              notes = CONCAT_WS(' ', NULLIF(notes, ''), 'Awaiting clinical services.')
          WHERE encounter_id = $1
            AND queue_type = 'billing'
            AND status IN ('waiting', 'called', 'in-service')
        `, [encounterId]);
      } else {
        const billingInsert = await db.query(`
          INSERT INTO queue_entries (
            encounter_id, patient_id, clinic_id, doctor_id, queue_type,
            service_type, waiting_location, priority_level, is_emergency, notes
          )
          SELECT $1, $2, e.clinic_id, $3, 'billing',
                 'billing-payment', 'billing-counter',
                 CASE WHEN e.triage_level IN ('urgent', 'emergency', 'critical') THEN 1 ELSE 5 END,
                 e.triage_level IN ('emergency', 'critical'),
                 'Clinical services complete; ready for cashier'
          FROM encounters e
          WHERE e.id = $1
            AND NOT EXISTS (
              SELECT 1 FROM queue_entries qe
              WHERE qe.encounter_id = $1
                AND qe.queue_type = 'billing'
                AND qe.status IN ('waiting', 'called', 'in-service', 'deferred')
            )
          RETURNING id
        `, [encounterId, patientId, resolvedDoctorId]);

        if (!billingInsert.rows.length) {
          await db.query(`
            UPDATE queue_entries
            SET status = 'waiting', updated_at = NOW(), notes = 'Clinical services complete; ready for cashier'
            WHERE id = (
              SELECT id FROM queue_entries
              WHERE encounter_id = $1 AND queue_type = 'billing' AND status = 'deferred'
              ORDER BY joined_at DESC LIMIT 1
            )
          `, [encounterId]);
        }
      }

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
    res.status(error.status || 500).json({
      success: false,
      error: error.status ? error.message : 'Unable to complete consultation'
    });
  } finally {
    db.release();
  }
});

// =====================================================
// GET ROLE-OWNED CLINICAL CONTEXT FOR A VISIT
// =====================================================
router.get(
  '/encounter/:encounterId/clinical-context',
  authorize(CONSULTATION_READ_ROLES),
  requireEncounterAccess(),
  async (req, res) => {
    try {
      const { encounterId } = req.params;
      const db = getDB();

      const [triage, consultations, labResults, radiologyResults, prescriptions] = await Promise.all([
        db.query(`
          SELECT ta.*, CONCAT(s.first_name, ' ', s.last_name) AS performed_by_name
          FROM triage_assessments ta
          LEFT JOIN staff s ON s.id = ta.performed_by
          WHERE ta.encounter_id = $1
          LIMIT 1
        `, [encounterId]),
        db.query(`
          SELECT
            cr.id, cr.consultation_date, cr.status,
            cr.chief_complaint, cr.provisional_diagnosis,
            cr.differential_diagnosis, cr.final_diagnosis,
            cr.treatment_plan, cr.follow_up_instructions,
            CONCAT(s.first_name, ' ', s.last_name) AS doctor_name
          FROM consultation_records cr
          JOIN staff s ON s.id = cr.doctor_id
          WHERE cr.encounter_id = $1
          ORDER BY cr.consultation_date DESC
        `, [encounterId]),
        db.query(`
          SELECT
            lo.id AS order_id, lo.order_number, lo.status AS order_status,
            lo.order_date, lt.test_name, lt.test_code,
            loi.status, loi.result_value, loi.result_unit, loi.result_flag,
            loi.reference_min, loi.reference_max, loi.result_notes,
            loi.result_entered_at
          FROM lab_orders lo
          JOIN lab_order_items loi ON loi.lab_order_id = lo.id
          JOIN lab_tests lt ON lt.id = loi.test_id
          WHERE lo.encounter_id = $1
          ORDER BY lo.order_date DESC, lt.test_name
        `, [encounterId]),
        db.query(`
          SELECT
            ro.id AS order_id, ro.order_number, ro.status AS order_status,
            ro.order_date, rt.test_name, rt.test_code,
            roi.status, roi.body_part, roi.laterality,
            rr.findings, rr.impression, rr.recommendations,
            rr.critical_finding, rr.released_at
          FROM radiology_orders ro
          JOIN radiology_order_items roi ON roi.radiology_order_id = ro.id
          JOIN radiology_tests rt ON rt.id = roi.test_id
          LEFT JOIN LATERAL (
            SELECT report.*
            FROM radiology_reports report
            WHERE report.radiology_order_item_id = roi.id
            ORDER BY report.version DESC, report.created_at DESC
            LIMIT 1
          ) rr ON TRUE
          WHERE ro.encounter_id = $1
          ORDER BY ro.order_date DESC, rt.test_name
        `, [encounterId]),
        db.query(`
          SELECT
            p.id AS prescription_id, p.prescription_number,
            p.status AS prescription_status, p.prescription_date,
            d.generic_name, d.brand_name, pi.dosage, pi.frequency,
            pi.duration_days, pi.quantity, pi.quantity_dispensed,
            pi.status, pi.notes
          FROM prescriptions p
          JOIN prescription_items pi ON pi.prescription_id = p.id
          JOIN drugs d ON d.id = pi.drug_id
          WHERE p.encounter_id = $1
          ORDER BY p.prescription_date DESC, d.generic_name
        `, [encounterId])
      ]);

      res.json({
        success: true,
        data: {
          triage: triage.rows[0] || null,
          consultations: consultations.rows,
          labResults: labResults.rows,
          radiologyResults: radiologyResults.rows,
          prescriptions: prescriptions.rows
        }
      });
    } catch (error) {
      logger.error('Error fetching visit clinical context:', error);
      res.status(500).json({
        success: false,
        error: 'Unable to load the visit clinical context'
      });
    }
  }
);

// =====================================================
// GET CONSULTATION BY ID
// =====================================================
router.get('/:id', authorize(CONSULTATION_READ_ROLES), requireConsultationAccess(), async (req, res) => {
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
router.get(
  '/encounter/:encounterId',
  authorize(CONSULTATION_READ_ROLES),
  requireEncounterAccess(),
  async (req, res) => {
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
router.get(
  '/encounter/:encounterId/pending-orders',
  authorize(CONSULTATION_READ_ROLES),
  requireEncounterAccess(),
  async (req, res) => {
  try {
    const { encounterId } = req.params;
    const db = getDB();

    // Get pending lab orders
    const labOrders = await db.query(`
      SELECT 
        lo.id, lo.order_number, lo.status, lo.priority, lo.order_date,
        json_agg(
          json_build_object(
            'id', loi.id,
            'testName', lt.test_name,
            'testCode', lt.test_code,
            'status', loi.status,
            'resultValue', loi.result_value,
            'isAbnormal', loi.is_abnormal
          )
        ) as tests
      FROM lab_orders lo
      LEFT JOIN lab_order_items loi ON lo.id = loi.lab_order_id
      LEFT JOIN lab_tests lt ON loi.test_id = lt.id
      WHERE lo.encounter_id = $1 AND lo.status IN ('pending', 'collected', 'processing')
      GROUP BY lo.id
    `, [encounterId]);

    // Get pending radiology orders
    const radiologyOrders = await db.query(`
      SELECT 
        ro.id, ro.order_number, ro.status, ro.priority, ro.order_date,
        json_agg(
          json_build_object(
            'id', roi.id,
            'studyName', rt.test_name,
            'studyCode', rt.test_code,
            'modality', im.modality_name,
            'status', roi.status
          )
        ) as studies
      FROM radiology_orders ro
      LEFT JOIN radiology_order_items roi ON ro.id = roi.radiology_order_id
      LEFT JOIN radiology_tests rt ON roi.test_id = rt.id
      LEFT JOIN imaging_modalities im ON rt.modality_id = im.id
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
            'duration', pi.duration_days,
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
