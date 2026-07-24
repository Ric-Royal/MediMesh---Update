jest.mock('../../middleware/auth', () => ({
  authorize: () => (req, res, next) => {
    req.user = { id: 'admin-id', roles: ['admin'] };
    next();
  },
}));
jest.mock('../../models/QueueEntry', () => ({
  getQueueStatistics: jest.fn(),
}));
jest.mock('../../models/Encounter', () => ({}));
jest.mock('../../models/Patient', () => ({}));
jest.mock('../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('../../utils/websocket', () => ({ emitQueueUpdate: jest.fn() }));

const express = require('express');
const request = require('supertest');
const QueueEntry = require('../../models/QueueEntry');
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
});
