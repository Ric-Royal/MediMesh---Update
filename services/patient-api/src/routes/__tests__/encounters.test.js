jest.mock('../../middleware/auth', () => ({
  authorize: () => (req, res, next) => {
    req.user = { id: '550e8400-e29b-41d4-a716-446655440000', roles: ['admin'] };
    next();
  }
}));
jest.mock('../../security/accessControl', () => ({
  hasRole: jest.fn(() => false),
  isAdmin: jest.fn(() => true),
  requireEncounterAccess: () => (req, res, next) => next(),
  requirePatientAccess: () => (req, res, next) => next()
}));
jest.mock('../../models/Encounter', () => ({
  create: jest.fn()
}));
jest.mock('../../models/QueueEntry', () => ({
  create: jest.fn()
}));
jest.mock('../../models/Patient', () => ({}));
jest.mock('../../utils/database', () => ({ getDB: jest.fn() }));
jest.mock('../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
}));

const express = require('express');
const request = require('supertest');
const Encounter = require('../../models/Encounter');
const QueueEntry = require('../../models/QueueEntry');
const { getDB } = require('../../utils/database');
const encountersRouter = require('../encounters');

describe('encounter queue handoff', () => {
  const patientId = '550e8400-e29b-41d4-a716-446655440011';
  const encounterId = '550e8400-e29b-41d4-a716-446655440012';
  const doctorId = '550e8400-e29b-41d4-a716-446655440013';
  const client = {
    query: jest.fn().mockResolvedValue({ rows: [] }),
    release: jest.fn()
  };
  const app = express();
  app.use(express.json());
  app.use('/api/encounters', encountersRouter);

  beforeEach(() => {
    jest.clearAllMocks();
    getDB.mockReturnValue({ connect: jest.fn().mockResolvedValue(client) });
    Encounter.create.mockImplementation(async data => ({
      id: encounterId,
      patient_id: patientId,
      encounter_type: data.encounterType,
      doctor_id: data.doctorId,
      clinic_id: null,
      triage_level: data.triageLevel,
      encounterNumber: 'ENC-TEST'
    }));
    QueueEntry.create.mockResolvedValue({ id: 'queue-test' });
  });

  test('starts a new outpatient visit in triage by default', async () => {
    const response = await request(app).post('/api/encounters').send({
      patientId,
      doctorId,
      encounterType: 'outpatient',
      triageLevel: 'routine'
    });

    expect(response.status).toBe(201);
    expect(QueueEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        queueType: 'triage',
        waitingLocation: 'triage-waiting'
      }),
      client
    );
  });

  test('supports an explicit consultation handoff for an existing patient', async () => {
    const response = await request(app).post('/api/encounters').send({
      patientId,
      doctorId,
      encounterType: 'outpatient',
      triageLevel: 'routine',
      initialQueue: 'consultation'
    });

    expect(response.status).toBe(201);
    expect(QueueEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        queueType: 'consultation',
        waitingLocation: 'consultation-waiting'
      }),
      client
    );
  });
});
