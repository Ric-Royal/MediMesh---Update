const { DataTypes } = require('sequelize');
const { sequelize } = require('../utils/database');

const Encounter = sequelize.define('Encounter', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  encounterNumber: {
    type: DataTypes.STRING(50),
    unique: true,
    allowNull: false,
    field: 'encounter_number'
  },
  patientId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'patient_id',
    references: { model: 'patients', key: 'id' }
  },
  appointmentId: {
    type: DataTypes.UUID,
    field: 'appointment_id',
    references: { model: 'appointments', key: 'id' }
  },
  encounterType: {
    type: DataTypes.ENUM('outpatient', 'inpatient', 'emergency', 'day-case', 'follow-up'),
    allowNull: false,
    field: 'encounter_type'
  },
  status: {
    type: DataTypes.ENUM('registered', 'waiting', 'triage', 'in-consultation', 'pending-lab', 
                        'pending-radiology', 'pending-pharmacy', 'completed', 'cancelled', 'no-show'),
    defaultValue: 'registered'
  },
  triageLevel: {
    type: DataTypes.ENUM('routine', 'urgent', 'emergency', 'critical'),
    defaultValue: 'routine',
    field: 'triage_level'
  },
  departmentId: {
    type: DataTypes.UUID,
    field: 'department_id',
    references: { model: 'departments', key: 'id' }
  },
  clinicId: {
    type: DataTypes.UUID,
    field: 'clinic_id',
    references: { model: 'clinics', key: 'id' }
  },
  doctorId: {
    type: DataTypes.UUID,
    field: 'doctor_id',
    references: { model: 'staff', key: 'id' }
  },
  waitingLocation: {
    type: DataTypes.STRING(100),
    field: 'waiting_location'
  },
  currentLocationId: {
    type: DataTypes.UUID,
    field: 'current_location_id'
  },
  registrationTime: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    field: 'registration_time'
  },
  triageTime: {
    type: DataTypes.DATE,
    field: 'triage_time'
  },
  consultationStartTime: {
    type: DataTypes.DATE,
    field: 'consultation_start_time'
  },
  consultationEndTime: {
    type: DataTypes.DATE,
    field: 'consultation_end_time'
  },
  totalWaitingMinutes: {
    type: DataTypes.INTEGER,
    field: 'total_waiting_minutes'
  },
  chiefComplaint: {
    type: DataTypes.TEXT,
    field: 'chief_complaint'
  },
  presentingSymptoms: {
    type: DataTypes.TEXT,
    field: 'presenting_symptoms'
  },
  vitalSigns: {
    type: DataTypes.JSONB,
    field: 'vital_signs'
  },
  paymentStatus: {
    type: DataTypes.ENUM('unpaid', 'partial', 'paid', 'billed-later', 'waived'),
    defaultValue: 'unpaid',
    field: 'payment_status'
  },
  paymentType: {
    type: DataTypes.ENUM('self-pay', 'corporate', 'insurance', 'government', 'ngo'),
    defaultValue: 'self-pay',
    field: 'payment_type'
  },
  corporateScheme: {
    type: DataTypes.STRING(200),
    field: 'corporate_scheme'
  },
  referredFrom: {
    type: DataTypes.STRING(200),
    field: 'referred_from'
  },
  notes: DataTypes.TEXT,
  createdBy: {
    type: DataTypes.UUID,
    field: 'created_by'
  }
}, {
  tableName: 'encounters',
  timestamps: true,
  underscored: true
});

// Class methods
Encounter.getActiveEncounters = async function(clinicId) {
  return await this.findAll({
    where: {
      clinicId,
      status: ['waiting', 'in-consultation']
    },
    order: [['registrationTime', 'ASC']],
    include: ['patient', 'doctor']
  });
};

Encounter.getEncountersByDate = async function(date) {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);
  
  return await this.findAll({
    where: {
      registrationTime: {
        [sequelize.Sequelize.Op.between]: [startOfDay, endOfDay]
      }
    },
    order: [['registrationTime', 'ASC']]
  });
};

module.exports = Encounter;

