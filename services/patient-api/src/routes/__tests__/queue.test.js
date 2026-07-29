jest.mock('../../middleware/auth', () => ({
  authorize: () => (req, res, next) => {
    req.user = {
      id: 'admin-id',
      staffId: '550e8400-e29b-41d4-a716-446655440024',
      roles: (req.get('x-test-roles') || 'admin').split(','),
    };
    next();
  },
}));
jest.mock('../../models/QueueEntry', () => ({
  getAll: jest.fn(),
  getQueueStatistics: jest.fn(),
  findByPk: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
}));
jest.mock('../../models/Encounter', () => ({}));
jest.mock('../../models/Patient', () => ({}));
jest.mock('../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('../../utils/websocket', () => ({
  emitQueueUpdate: jest.fn(),
  emitQueueRefresh: jest.fn(),
}));
jest.mock('../../utils/database', () => ({ getDB: jest.fn() }));

const express = require('express');
const request = require('supertest');
const QueueEntry = require('../../models/QueueEntry');
const { getDB } = require('../../utils/database');
const queueRouter = require('../queue');

describe('queue statistics routes', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/queue', queueRouter);

  beforeEach(() => jest.clearAllMocks());

  test('serves normalized all-clinic statistics for the selected queue', async () => {
    QueueEntry.getQueueStatistics.mockResolvedValue({
      total_waiting: '2',
      in_service: '1',
      completed_today: '8',
      emergencies: '1',
      average_wait_minutes: '14',
      longest_wait_minutes: '27',
    });

    const response = await request(app).get('/api/queue/statistics?queueType=lab');

    expect(response.status).toBe(200);
    expect(QueueEntry.getQueueStatistics).toHaveBeenCalledWith(null, 'lab');
    expect(response.body.data).toEqual({
      totalWaiting: 2,
      inService: 1,
      completedToday: 8,
      emergencies: 1,
      averageWaitTime: 14,
      longestWaitTime: 27,
    });
  });

  test('scopes clinic statistics and defaults to the consultation queue', async () => {
    QueueEntry.getQueueStatistics.mockResolvedValue({});

    const response = await request(app).get('/api/queue/clinic/clinic-01/statistics');

    expect(response.status).toBe(200);
    expect(QueueEntry.getQueueStatistics).toHaveBeenCalledWith('clinic-01', 'consultation');
    expect(response.body.data.averageWaitTime).toBe(0);
  });

  test('limits a nurse queue board to the triage stage', async () => {
    const response = await request(app)
      .get('/api/queue?queueType=consultation')
      .set('x-test-roles', 'nurse');

    expect(response.status).toBe(403);
    expect(response.body.error).toMatch(/access denied/i);
  });

  test('shows a doctor only consultation entries assigned to that provider', async () => {
    QueueEntry.getAll.mockResolvedValue([]);

    const response = await request(app)
      .get('/api/queue?queueType=consultation')
      .set('x-test-roles', 'doctor');

    expect(response.status).toBe(200);
    expect(QueueEntry.getAll).toHaveBeenCalledWith({
      queueType: 'consultation',
      status: undefined,
      doctorId: '550e8400-e29b-41d4-a716-446655440024'
    });
  });

  test('records triage and hands the encounter to consultation in one transaction', async () => {
    const client = {
      query: jest.fn(async sql => (
        String(sql).includes('INSERT INTO triage_assessments')
          ? { rows: [{ id: 'assessment-1' }] }
          : { rows: [] }
      )),
      release: jest.fn()
    };
    getDB.mockReturnValue({ connect: jest.fn().mockResolvedValue(client) });
    QueueEntry.findByPk.mockResolvedValue({
      id: '550e8400-e29b-41d4-a716-446655440021',
      encounter_id: '550e8400-e29b-41d4-a716-446655440022',
      patient_id: '550e8400-e29b-41d4-a716-446655440023',
      doctor_id: '550e8400-e29b-41d4-a716-446655440024',
      queue_type: 'triage',
      status: 'in-service',
      priority_level: 3,
      is_emergency: false
    });
    QueueEntry.create.mockResolvedValue({ id: 'next-queue' });
    QueueEntry.update.mockResolvedValue({
      id: '550e8400-e29b-41d4-a716-446655440021',
      queue_type: 'triage',
      status: 'completed'
    });

    const response = await request(app)
      .post('/api/queue/550e8400-e29b-41d4-a716-446655440021/triage-complete')
      .set('x-test-roles', 'nurse')
      .send({
        triageLevel: 'routine',
        vitals: {
          bloodPressure: '120/80',
          temperature: 36.7,
          pulse: 74,
          respiratoryRate: 16,
          oxygenSaturation: 98,
          weight: 70,
          height: 175,
          bmi: 22.9
        },
        chiefComplaint: 'Headache',
        historyPresentIllness: 'Started this morning'
      });

    expect(response.status).toBe(200);
    expect(QueueEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({ queueType: 'consultation' }),
      client
    );
    expect(QueueEntry.update).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ status: 'completed' }),
      client
    );
    expect(client.query.mock.calls.map(([sql]) => String(sql)).join('\n'))
      .toMatch(/INSERT INTO triage_assessments/);
    expect(client.query).toHaveBeenCalledWith('COMMIT');
  });

  test('does not permit generic completion to bypass the triage assessment', async () => {
    const client = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
      release: jest.fn()
    };
    getDB.mockReturnValue({ connect: jest.fn().mockResolvedValue(client) });
    QueueEntry.findByPk.mockResolvedValue({
      id: '550e8400-e29b-41d4-a716-446655440031',
      queue_type: 'triage',
      status: 'in-service'
    });

    const response = await request(app)
      .put('/api/queue/550e8400-e29b-41d4-a716-446655440031/status')
      .send({ status: 'completed', nextQueue: 'billing' });

    expect(response.status).toBe(409);
    expect(response.body.error).toMatch(/triage assessment/i);
    expect(QueueEntry.create).not.toHaveBeenCalled();
  });

  test('does not let front-office staff process a clinical queue stage', async () => {
    const client = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
      release: jest.fn()
    };
    getDB.mockReturnValue({ connect: jest.fn().mockResolvedValue(client) });
    QueueEntry.findByPk.mockResolvedValue({
      id: '550e8400-e29b-41d4-a716-446655440051',
      queue_type: 'triage',
      status: 'waiting'
    });

    const response = await request(app)
      .put('/api/queue/550e8400-e29b-41d4-a716-446655440051/status')
      .set('x-test-roles', 'receptionist')
      .send({ status: 'called' });

    expect(response.status).toBe(403);
    expect(response.body.error).toMatch(/another clinical role/i);
    expect(QueueEntry.update).not.toHaveBeenCalled();
  });

  test('does not let a doctor start another clinician assigned consultation', async () => {
    const client = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
      release: jest.fn()
    };
    getDB.mockReturnValue({ connect: jest.fn().mockResolvedValue(client) });
    QueueEntry.findByPk.mockResolvedValue({
      id: '550e8400-e29b-41d4-a716-446655440061',
      doctor_id: '550e8400-e29b-41d4-a716-446655440099',
      queue_type: 'consultation',
      status: 'waiting'
    });

    const response = await request(app)
      .put('/api/queue/550e8400-e29b-41d4-a716-446655440061/status')
      .set('x-test-roles', 'doctor')
      .send({ status: 'in-service' });

    expect(response.status).toBe(403);
    expect(response.body.error).toMatch(/assigned clinician/i);
    expect(QueueEntry.update).not.toHaveBeenCalled();
  });

  test('starting consultation synchronizes the encounter and appointment states', async () => {
    const client = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
      release: jest.fn()
    };
    getDB.mockReturnValue({ connect: jest.fn().mockResolvedValue(client) });
    QueueEntry.findByPk.mockResolvedValue({
      id: '550e8400-e29b-41d4-a716-446655440041',
      encounter_id: '550e8400-e29b-41d4-a716-446655440042',
      queue_type: 'consultation',
      status: 'called'
    });
    QueueEntry.update.mockResolvedValue({
      id: '550e8400-e29b-41d4-a716-446655440041',
      queue_type: 'consultation',
      status: 'in-service'
    });

    const response = await request(app)
      .put('/api/queue/550e8400-e29b-41d4-a716-446655440041/status')
      .send({ status: 'in-service' });

    expect(response.status).toBe(200);
    const sqlCalls = client.query.mock.calls
      .map(([sql]) => String(sql))
      .join('\n');
    expect(sqlCalls).toMatch(/status = 'in-consultation'/);
    expect(sqlCalls).toMatch(/SET status = 'in-progress'/);
    expect(client.query).toHaveBeenCalledWith('COMMIT');
  });
});
