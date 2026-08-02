jest.mock('../../utils/database', () => ({ getDB: jest.fn() }));

const { getDB } = require('../../utils/database');
const QueueEntry = require('../QueueEntry');

describe('QueueEntry live operational window', () => {
  beforeEach(() => jest.clearAllMocks());

  test('excludes stale unfinished visits from the live all-clinics queue', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [] });
    getDB.mockReturnValue({ query });

    await QueueEntry.getAll({ queueType: 'consultation' });

    expect(query).toHaveBeenCalledWith(
      expect.stringMatching(/q\.status IN \('waiting', 'called', 'in-service'\)[\s\S]*q\.joined_at >= NOW\(\) - INTERVAL '24 hours'/),
      ['consultation']
    );
  });

  test('parameterizes the assigned clinician scope on consultation queues', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [] });
    getDB.mockReturnValue({ query });

    await QueueEntry.getAll({
      queueType: 'consultation',
      doctorId: 'doctor-1'
    });

    expect(query).toHaveBeenCalledWith(
      expect.stringMatching(/q\.queue_type = \$1[\s\S]*q\.doctor_id = \$2/),
      ['consultation', 'doctor-1']
    );
  });

  test('returns current aggregate statistics for a selected queue type', async () => {
    const row = {
      total_waiting: '2',
      in_service: '1',
      completed_today: '4',
      average_wait_minutes: 12,
    };
    const query = jest.fn().mockResolvedValue({ rows: [row] });
    getDB.mockReturnValue({ query });

    const result = await QueueEntry.getQueueStatistics(null, 'consultation');

    expect(query).toHaveBeenCalledWith(
      expect.stringMatching(/completed_at::date = CURRENT_DATE[\s\S]*joined_at >= NOW\(\) - INTERVAL '24 hours'/),
      ['consultation']
    );
    expect(result).toBe(row);
  });

  test('scopes clinic statistics with parameterized clinic and queue filters', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [{}] });
    getDB.mockReturnValue({ query });

    await QueueEntry.getQueueStatistics('clinic-01', 'laboratory');

    expect(query).toHaveBeenCalledWith(
      expect.stringMatching(/WHERE clinic_id = \$1 AND queue_type = \$2/),
      ['clinic-01', 'laboratory']
    );
  });
});
