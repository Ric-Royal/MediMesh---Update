const { DataTypes } = require('sequelize');
const { sequelize } = require('../utils/database');

const QueueEntry = sequelize.define('QueueEntry', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  encounterId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'encounter_id',
    references: { model: 'encounters', key: 'id' }
  },
  patientId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'patient_id',
    references: { model: 'patients', key: 'id' }
  },
  clinicId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'clinic_id',
    references: { model: 'clinics', key: 'id' }
  },
  doctorId: {
    type: DataTypes.UUID,
    field: 'doctor_id',
    references: { model: 'staff', key: 'id' }
  },
  queueType: {
    type: DataTypes.ENUM('consultation', 'lab', 'radiology', 'pharmacy', 'billing', 'triage'),
    allowNull: false,
    field: 'queue_type'
  },
  queuePosition: {
    type: DataTypes.INTEGER,
    field: 'queue_position'
  },
  priorityLevel: {
    type: DataTypes.INTEGER,
    defaultValue: 5,
    field: 'priority_level',
    validate: { min: 1, max: 10 }
  },
  joinedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    field: 'joined_at'
  },
  calledAt: {
    type: DataTypes.DATE,
    field: 'called_at'
  },
  servedAt: {
    type: DataTypes.DATE,
    field: 'served_at'
  },
  completedAt: {
    type: DataTypes.DATE,
    field: 'completed_at'
  },
  estimatedWaitMinutes: {
    type: DataTypes.INTEGER,
    field: 'estimated_wait_minutes'
  },
  actualWaitMinutes: {
    type: DataTypes.INTEGER,
    field: 'actual_wait_minutes'
  },
  status: {
    type: DataTypes.ENUM('waiting', 'called', 'in-service', 'completed', 'no-show', 'deferred', 'cancelled'),
    defaultValue: 'waiting'
  },
  waitingLocation: {
    type: DataTypes.STRING(100),
    field: 'waiting_location'
  },
  isEmergency: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'is_emergency'
  },
  requiresInterpreter: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'requires_interpreter'
  },
  specialRequirements: {
    type: DataTypes.TEXT,
    field: 'special_requirements'
  },
  notes: DataTypes.TEXT
}, {
  tableName: 'queue_entries',
  timestamps: true,
  underscored: true
});

// Class methods
QueueEntry.getClinicQueue = async function(clinicId, queueType = 'consultation') {
  return await this.findAll({
    where: {
      clinicId,
      queueType,
      status: ['waiting', 'called']
    },
    order: [['priorityLevel', 'ASC'], ['queuePosition', 'ASC']],
    include: [
      { model: sequelize.models.Patient, as: 'patient' },
      { model: sequelize.models.Encounter, as: 'encounter' },
      { model: sequelize.models.Staff, as: 'doctor' }
    ]
  });
};

QueueEntry.getDoctorQueue = async function(doctorId) {
  return await this.findAll({
    where: {
      doctorId,
      status: ['waiting', 'called']
    },
    order: [['priorityLevel', 'ASC'], ['queuePosition', 'ASC']],
    include: ['patient', 'encounter']
  });
};

QueueEntry.getQueueStatistics = async function(clinicId) {
  const queue = await this.findAll({
    where: { clinicId, status: ['waiting', 'called'] }
  });
  
  const now = new Date();
  const waitTimes = queue.map(entry => 
    Math.floor((now - new Date(entry.joinedAt)) / 60000)
  );
  
  return {
    totalInQueue: queue.length,
    emergencies: queue.filter(e => e.isEmergency).length,
    averageWaitMinutes: waitTimes.length ? Math.floor(waitTimes.reduce((a,b) => a+b, 0) / waitTimes.length) : 0,
    longestWaitMinutes: waitTimes.length ? Math.max(...waitTimes) : 0
  };
};

module.exports = QueueEntry;

