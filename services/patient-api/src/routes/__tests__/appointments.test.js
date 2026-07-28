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

const express = require('express');
const request = require('supertest');
const { getDB } = require('../../utils/database');
const appointmentsRouter = require('../appointments');

describe('appointment scheduling routes', () => {
  const doctorId = '550e8400-e29b-41d4-a716-446655440013';
  const patientId = '550e8400-e29b-41d4-a716-446655440011';
  const database = { query: jest.fn() };
  const app = express();
  app.use(express.json());
  app.use('/api/appointments', appointmentsRouter);

  beforeEach(() => {
    jest.clearAllMocks();
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
});
