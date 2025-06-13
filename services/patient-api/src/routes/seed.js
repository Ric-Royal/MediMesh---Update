const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDB } = require('../utils/database');
const { logger } = require('../utils/logger');

const router = express.Router();

// Seed database with sample data
router.post('/seed', async (req, res) => {
  try {
    const db = getDB();
    
    // Sample patients
    const patients = [
      {
        id: uuidv4(),
        patient_id: 'PAT-001',
        first_name: 'John',
        last_name: 'Doe',
        date_of_birth: '1985-03-15',
        gender: 'M',
        phone: '+1 (555) 123-4567',
        email: 'john.doe@email.com',
        address: {
          street: '123 Main St',
          city: 'New York',
          state: 'NY',
          zip_code: '10001',
          country: 'USA'
        },
        emergency_contact: {
          name: 'Jane Doe',
          relationship: 'Spouse',
          phone: '+1 (555) 123-4568'
        },
        insurance: {
          provider: 'Blue Cross Blue Shield',
          policy_number: 'BC123456789',
          group_number: 'GRP001'
        }
      },
      {
        id: uuidv4(),
        patient_id: 'PAT-002',
        first_name: 'Sarah',
        last_name: 'Johnson',
        date_of_birth: '1990-07-22',
        gender: 'F',
        phone: '+1 (555) 234-5678',
        email: 'sarah.johnson@email.com',
        address: {
          street: '456 Oak Ave',
          city: 'Los Angeles',
          state: 'CA',
          zip_code: '90210',
          country: 'USA'
        },
        emergency_contact: {
          name: 'Michael Johnson',
          relationship: 'Brother',
          phone: '+1 (555) 234-5679'
        },
        insurance: {
          provider: 'Aetna',
          policy_number: 'AET987654321',
          group_number: 'GRP002'
        }
      },
      {
        id: uuidv4(),
        patient_id: 'PAT-003',
        first_name: 'Robert',
        last_name: 'Wilson',
        date_of_birth: '1975-12-08',
        gender: 'M',
        phone: '+1 (555) 345-6789',
        email: 'robert.wilson@email.com',
        address: {
          street: '789 Pine St',
          city: 'Chicago',
          state: 'IL',
          zip_code: '60601',
          country: 'USA'
        },
        emergency_contact: {
          name: 'Linda Wilson',
          relationship: 'Spouse',
          phone: '+1 (555) 345-6790'
        },
        insurance: {
          provider: 'United Healthcare',
          policy_number: 'UHC456789123',
          group_number: 'GRP003'
        }
      }
    ];
    
    // Insert patients
    for (const patient of patients) {
      await db.query(`
        INSERT INTO patients (
          id, patient_id, first_name, last_name, date_of_birth, gender, 
          phone, email, address, emergency_contact, insurance, created_by, updated_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        ON CONFLICT (patient_id) DO UPDATE SET
          first_name = EXCLUDED.first_name,
          last_name = EXCLUDED.last_name,
          updated_at = NOW()
      `, [
        patient.id, patient.patient_id, patient.first_name, patient.last_name,
        patient.date_of_birth, patient.gender, patient.phone, patient.email,
        JSON.stringify(patient.address), JSON.stringify(patient.emergency_contact),
        JSON.stringify(patient.insurance), 'system', 'system'
      ]);
    }
    
    // Sample medical records
    const records = [
      {
        id: uuidv4(),
        patient_id: patients[0].id,
        record_type: 'consultation',
        record_date: '2024-01-15',
        provider_name: 'Dr. Smith',
        diagnosis: 'Annual physical examination',
        treatment_plan: 'Continue current medication regimen',
        medications: 'Lisinopril 10mg daily',
        notes: 'Patient presents for annual physical. Blood pressure well controlled.',
        vital_signs: {
          blood_pressure: '120/80',
          heart_rate: '72',
          temperature: '98.6°F',
          weight: '175 lbs',
          height: '5\'10"'
        }
      },
      {
        id: uuidv4(),
        patient_id: patients[1].id,
        record_type: 'lab_result',
        record_date: '2024-01-20',
        provider_name: 'Dr. Johnson',
        diagnosis: 'Routine lab work',
        lab_results: 'CBC: Normal, Lipid panel: Cholesterol slightly elevated',
        notes: 'Patient advised to reduce dietary fat intake.',
        vital_signs: {
          blood_pressure: '115/75',
          heart_rate: '68',
          temperature: '98.4°F',
          weight: '140 lbs',
          height: '5\'6"'
        }
      },
      {
        id: uuidv4(),
        patient_id: patients[2].id,
        record_type: 'prescription',
        record_date: '2024-01-25',
        provider_name: 'Dr. Wilson',
        diagnosis: 'Hypertension',
        treatment_plan: 'Start antihypertensive medication',
        medications: 'Metoprolol 50mg twice daily',
        notes: 'New diagnosis of hypertension. Patient counseled on lifestyle modifications.',
        vital_signs: {
          blood_pressure: '150/95',
          heart_rate: '85',
          temperature: '98.7°F',
          weight: '190 lbs',
          height: '6\'0"'
        }
      }
    ];
    
    // Insert medical records
    for (const record of records) {
      await db.query(`
        INSERT INTO medical_records (
          id, patient_id, record_type, record_date, provider_name, diagnosis,
          treatment_plan, medications, lab_results, notes, vital_signs, created_by, updated_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        ON CONFLICT (id) DO NOTHING
      `, [
        record.id, record.patient_id, record.record_type, record.record_date,
        record.provider_name, record.diagnosis, record.treatment_plan,
        record.medications, record.lab_results, record.notes,
        JSON.stringify(record.vital_signs), 'system', 'system'
      ]);
    }
    
    logger.info('Database seeded with sample data');
    
    res.json({
      message: 'Database seeded successfully',
      patients: patients.length,
      records: records.length
    });
    
  } catch (error) {
    logger.error('Seeding error:', error);
    res.status(500).json({ error: 'Failed to seed database' });
  }
});

module.exports = router; 