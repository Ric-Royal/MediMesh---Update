jest.mock('../database', () => ({ getDB: jest.fn() }));
jest.mock('../logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const { getDB } = require('../database');
const { completeDepartmentService } = require('../workflow');

const encounter = {
  id: 'encounter-1',
  patient_id: 'patient-1',
  clinic_id: 'clinic-1',
  doctor_id: 'doctor-1',
  triage_level: 'routine',
};

function makeClient({ counts, resultReviewCreated = true, activeConsultation = false } = {}) {
  const query = jest.fn(async (sql) => {
    const normalized = String(sql).replace(/\s+/g, ' ').trim();
    if (normalized.startsWith('SELECT * FROM encounters')) return { rows: [encounter] };
    if (normalized.includes('AS lab') && normalized.includes('AS radiology')) return { rows: [counts] };
    if (normalized.includes("INSERT INTO queue_entries") && normalized.includes("'results-review'")) {
      return { rows: resultReviewCreated ? [{ id: 'review-queue' }] : [] };
    }
    if (normalized.startsWith('SELECT 1 FROM queue_entries')) {
      return { rows: activeConsultation ? [{ '?column?': 1 }] : [] };
    }
    if (normalized.includes("INSERT INTO queue_entries") && normalized.includes("'billing-payment'")) {
      return { rows: [{ id: 'billing-queue' }] };
    }
    return { rows: [] };
  });
  return { query, release: jest.fn() };
}

describe('repeatable patient journey routing', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns completed diagnostics to the doctor instead of billing', async () => {
    const client = makeClient({ counts: { lab: 0, radiology: 0, pharmacy: 0 } });
    getDB.mockReturnValue({ connect: jest.fn().mockResolvedValue(client) });

    const result = await completeDepartmentService('encounter-1', 'lab');

    expect(result.nextQueue).toBe('consultation');
    expect(client.query.mock.calls.some(([sql]) => String(sql).includes("'results-review'"))).toBe(true);
    expect(client.query.mock.calls.some(([sql]) => String(sql).includes("'billing-payment'"))).toBe(false);
    expect(client.query).toHaveBeenCalledWith('COMMIT');
    expect(client.release).toHaveBeenCalled();
  });

  test('does not duplicate an already active results-review queue', async () => {
    const client = makeClient({
      counts: { lab: 0, radiology: 0, pharmacy: 0 },
      resultReviewCreated: false,
      activeConsultation: true,
    });
    getDB.mockReturnValue({ connect: jest.fn().mockResolvedValue(client) });

    const result = await completeDepartmentService('encounter-1', 'radiology');

    expect(result.nextQueue).toBeNull();
    expect(client.query.mock.calls.some(([sql]) => String(sql).includes("'billing-payment'"))).toBe(false);
  });

  test('routes to billing only after pharmacy and all clinical work are complete', async () => {
    const client = makeClient({ counts: { lab: 0, radiology: 0, pharmacy: 0 } });
    getDB.mockReturnValue({ connect: jest.fn().mockResolvedValue(client) });

    const result = await completeDepartmentService('encounter-1', 'pharmacy');

    expect(result.nextQueue).toBe('billing');
    expect(client.query.mock.calls.some(([sql]) => String(sql).includes("'billing-payment'"))).toBe(true);
    expect(client.query.mock.calls.some(([sql]) => String(sql).includes("'results-review'"))).toBe(false);
  });
});
