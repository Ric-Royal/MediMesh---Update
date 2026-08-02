jest.mock('../../middleware/auth', () => ({ authorize: () => (req, res, next) => next() }));
jest.mock('../../models/Patient', () => ({ findById: jest.fn() }));
jest.mock('../../models/Payment', () => ({
  create: jest.fn(),
  findById: jest.fn(),
  findByCheckoutRequestId: jest.fn(),
  search: jest.fn(),
  getStatistics: jest.fn(),
}));
jest.mock('../../utils/database', () => ({ getDB: jest.fn() }));
jest.mock('../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('../../utils/mpesa', () => ({
  formatPhoneNumber: jest.fn(value => String(value)),
  validateConfig: jest.fn(),
  stkPush: jest.fn(),
  parseCallback: jest.fn(),
  queryTransaction: jest.fn(),
}));

const Payment = require('../../models/Payment');
const { getDB } = require('../../utils/database');
const paymentsRouter = require('../payments');

const requestData = {
  patient_id: 'patient-1',
  invoice_id: 'invoice-1',
  amount: 500,
  phone_number: '254712345678',
  transaction_type: 'invoice',
};

function baseClient(overrides = {}) {
  const query = jest.fn(async (sql) => {
    const normalized = String(sql).replace(/\s+/g, ' ').trim();
    if (normalized.startsWith('SELECT * FROM invoices')) {
      return { rows: [{ id: 'invoice-1', patient_id: 'patient-1', status: 'issued', balance_due: 500 }] };
    }
    if (normalized.startsWith('SELECT COALESCE(SUM(amount)')) {
      return { rows: [overrides.activePrompt || { reserved: 0, active_payment_id: null, retry_after_seconds: 0 }] };
    }
    if (normalized.startsWith('SELECT COALESCE(MAX(mpesa_attempt)')) {
      return { rows: [{ previous_attempt: overrides.previousAttempt || 0, previous_payment_id: overrides.previousPaymentId || null }] };
    }
    return { rows: [] };
  });
  return { query, release: jest.fn() };
}

describe('M-Pesa prompt reservations', () => {
  beforeEach(() => jest.clearAllMocks());

  test('expires unanswered prompts at 60 seconds and creates a numbered retry', async () => {
    const client = baseClient({ previousAttempt: 1, previousPaymentId: 'payment-old' });
    getDB.mockReturnValue({ connect: jest.fn().mockResolvedValue(client) });
    Payment.create.mockImplementation(async data => ({ id: 'payment-new', ...data }));

    const payment = await paymentsRouter.__test.reserveInvoicePayment(requestData, 'cashier-1');

    const expirySql = client.query.mock.calls.find(([sql]) => String(sql).includes('M-Pesa prompt unanswered'))[0];
    expect(expirySql).toContain("INTERVAL '60 seconds'");
    expect(Payment.create).toHaveBeenCalledWith(expect.objectContaining({
      mpesa_attempt: 2,
      metadata: expect.objectContaining({ retry_of_payment_id: 'payment-old' })
    }), 'cashier-1', client);
    expect(new Date(payment.mpesa_prompt_expires_at).getTime() - new Date(payment.mpesa_prompt_sent_at).getTime()).toBe(60000);
    expect(client.query).toHaveBeenCalledWith('COMMIT');
  });

  test('blocks a second prompt only for the remaining active countdown', async () => {
    const client = baseClient({
      activePrompt: { reserved: 500, active_payment_id: 'payment-active', retry_after_seconds: 17 }
    });
    getDB.mockReturnValue({ connect: jest.fn().mockResolvedValue(client) });

    await expect(paymentsRouter.__test.reserveInvoicePayment(requestData, 'cashier-1')).rejects.toMatchObject({
      status: 409,
      details: { active_payment_id: 'payment-active', retry_after_seconds: 17 }
    });
    expect(Payment.create).not.toHaveBeenCalled();
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
  });

  test('uses an exact one-minute product retry window', () => {
    expect(paymentsRouter.__test.MPESA_PROMPT_TTL_SECONDS).toBe(60);
  });
});
