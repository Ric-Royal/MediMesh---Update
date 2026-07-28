jest.mock('../../middleware/auth', () => ({
  authorize: () => (req, res, next) => {
    req.user = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      roles: ['admin']
    };
    next();
  }
}));
jest.mock('../../security/accessControl', () => ({
  findPatientAccess: jest.fn(),
  hasAnyRole: jest.fn(() => true),
  hasRole: jest.fn((user, role) => user.roles.includes(role)),
  isAdmin: jest.fn(user => user.roles.includes('admin')),
  patientScope: jest.fn(() => ({ clause: 'TRUE', params: [] })),
  requirePatientResourceAccess: () => (req, res, next) => next(),
  requireProviderIdentity: () => (req, res, next) => next()
}));
jest.mock('../../utils/database', () => ({ getDB: jest.fn() }));
jest.mock('../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
}));
jest.mock('../../models/Encounter', () => ({ create: jest.fn() }));
jest.mock('../../models/QueueEntry', () => ({ create: jest.fn() }));
jest.mock('../../utils/websocket', () => ({ emitQueueRefresh: jest.fn() }));

const express = require('express');
const request = require('supertest');
const { getDB } = require('../../utils/database');
const Encounter = require('../../models/Encounter');
const QueueEntry = require('../../models/QueueEntry');
const { emitQueueRefresh } = require('../../utils/websocket');
const appointmentsRouter = require('../appointments');

describe('appointment scheduling routes', () => {
  const doctorId = '550e8400-e29b-41d4-a716-446655440013';
  const patientId = '550e8400-e29b-41d4-a716-446655440011';
  const database = { query: jest.fn() };
  const client = {
    query: jest.fn(),
    release: jest.fn()
  };
  const app = express();
  app.use(express.json());
  app.use('/api/appointments', appointmentsRouter);

  beforeEach(() => {
    jest.clearAllMocks();
    database.connect = jest.fn().mockResolvedValue(client);
    getDB.mockReturnValue(database);
  });

  test('accepts legacy empty optional list filters', async () => {
    database.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ count: '0' }] });

    const response = await request(app)
      .get('/api/appointments?page=1&limit=25&status=&doctor_id=&clinic_id=&date_from=&date_to=&appointment_type=');

    expect(response.status).toBe(200);
    expect(response.body.pagination.total).toBe(0);
  });

  test('returns available doctor slots from the scheduling helper', async () => {
    database.query.mockResolvedValue({
      rows: [{ time_slot: '09:00:00', is_available: true }]
    });

    const response = await request(app)
      .get(`/api/appointments/doctor/${doctorId}/available-slots?date=2026-07-29`);

    expect(response.status).toBe(200);
    expect(response.body.data[0].is_available).toBe(true);
    expect(database.query).toHaveBeenCalledWith(
      expect.stringContaining('get_available_time_slots'),
      [doctorId, '2026-07-29']
    );
  });

  test('books an available appointment', async () => {
    database.query
      .mockResolvedValueOnce({ rows: [{ is_available: true }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{
          id: '550e8400-e29b-41d4-a716-446655440099',
          appointment_number: 'APT-TEST-0001'
        }]
      });

    const response = await request(app).post('/api/appointments').send({
      patient_id: patientId,
      doctor_id: doctorId,
      appointment_type: 'consultation',
      scheduled_date: '2026-07-29',
      scheduled_time: '09:00',
      duration_minutes: 30,
      payment_type: 'self-pay'
    });

    expect(response.status).toBe(201);
    expect(response.body.data.appointment_number).toBe('APT-TEST-0001');
  });

  test('checks in by creating a linked encounter and triage queue atomically', async () => {
    const appointmentId = '550e8400-e29b-41d4-a716-446655440098';
    const encounter = {
      id: '550e8400-e29b-41d4-a716-446655440097',
      appointment_id: appointmentId
    };
    const queueEntry = {
      id: '550e8400-e29b-41d4-a716-446655440096',
      queue_type: 'triage'
    };
    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{
          id: appointmentId,
          appointment_number: 'APT-TEST-0002',
          patient_id: patientId,
          doctor_id: doctorId,
          clinic_id: null,
          appointment_type: 'consultation',
          payment_type: 'self-pay',
          status: 'confirmed',
          check_in_open: true,
          check_in_not_expired: true
        }]
      })
      .mockResolvedValueOnce({ rows: [{ id: '550e8400-e29b-41d4-a716-446655440000' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: appointmentId, patient_id: patientId, status: 'checked-in' }] })
      .mockResolvedValueOnce({ rows: [] });
    Encounter.create.mockResolvedValue(encounter);
    QueueEntry.create.mockResolvedValue(queueEntry);

    const response = await request(app)
      .post(`/api/appointments/${appointmentId}/check-in`);

    expect(response.status).toBe(200);
    expect(Encounter.create).toHaveBeenCalledWith(
      expect.objectContaining({
        appointmentId,
        patientId,
        status: 'waiting'
      }),
      client
    );
    expect(QueueEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        encounterId: encounter.id,
        queueType: 'triage'
      }),
      client
    );
    expect(client.query).toHaveBeenCalledWith('COMMIT');
    expect(emitQueueRefresh).toHaveBeenCalledWith(null, 'appointment-checked-in');
    expect(response.body.data.queueEntry.queue_type).toBe('triage');
  });

  test('rejects check-in before the configured early-arrival window', async () => {
    const appointmentId = '550e8400-e29b-41d4-a716-446655440095';
    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{
          id: appointmentId,
          status: 'scheduled',
          check_in_open: false,
          check_in_not_expired: true
        }]
      })
      .mockResolvedValueOnce({ rows: [] });

    const response = await request(app)
      .post(`/api/appointments/${appointmentId}/check-in`);

    expect(response.status).toBe(409);
    expect(response.body.error).toMatch(/60 minutes/i);
    expect(Encounter.create).not.toHaveBeenCalled();
    expect(QueueEntry.create).not.toHaveBeenCalled();
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
  });

  test('prevents direct status changes that would bypass patient-flow handoffs', async () => {
    const appointmentId = '550e8400-e29b-41d4-a716-446655440094';
    database.query.mockResolvedValue({
      rows: [{ id: appointmentId, status: 'confirmed' }]
    });

    const response = await request(app)
      .put(`/api/appointments/${appointmentId}`)
      .send({ status: 'checked-in' });

    expect(response.status).toBe(409);
    expect(response.body.error).toMatch(/check-in/i);
    expect(database.query).toHaveBeenCalledTimes(1);
  });

  test('cancels a linked visit and its active queues in the same transaction', async () => {
    const appointmentId = '550e8400-e29b-41d4-a716-446655440093';
    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: '550e8400-e29b-41d4-a716-446655440000' }] })
      .mockResolvedValueOnce({
        rows: [{
          id: appointmentId,
          appointment_number: 'APT-TEST-0003',
          clinic_id: null,
          status: 'cancelled'
        }]
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const response = await request(app)
      .post(`/api/appointments/${appointmentId}/cancel`)
      .send({ cancellation_reason: 'Patient requested cancellation' });

    expect(response.status).toBe(200);
    const sqlCalls = client.query.mock.calls
      .map(([sql]) => String(sql))
      .join('\n');
    expect(sqlCalls).toMatch(/UPDATE encounters/);
    expect(sqlCalls).toMatch(/UPDATE queue_entries/);
    expect(client.query).toHaveBeenCalledWith('COMMIT');
    expect(emitQueueRefresh).toHaveBeenCalledWith(null, 'appointment-cancelled');
  });
});
