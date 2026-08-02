jest.mock('../../utils/database', () => ({ getDB: jest.fn() }));
jest.mock('../../utils/logger', () => ({ logger: { info: jest.fn(), error: jest.fn() } }));

const { getDB } = require('../../utils/database');
const Payment = require('../Payment');

describe('Payment.search', () => {
  test('uses parameterized allowlisted filters and bounded pagination', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce({ rows: [{ total: 1 }] })
      .mockResolvedValueOnce({ rows: [{
        id: 'c7c62b62-47be-4a22-beb4-f1381fc10c8c',
        patient_id: '1274d928-8152-47d2-83f7-08e351598ee8',
        amount: '1250.00',
        currency: 'KES',
        phone_number: '254700000000',
        payment_method: 'mpesa',
        transaction_type: 'invoice',
        status: 'completed',
        patient_name: 'Amina Njeri',
        uhid: 'MM-1001',
        invoice_number: 'INV-1001'
      }] });
    getDB.mockReturnValue({ query });

    const result = await Payment.search({
      patient_id: '1274d928-8152-47d2-83f7-08e351598ee8',
      status: 'completed',
      payment_method: 'mpesa',
      limit: 500,
      offset: 5
    });

    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('p.patient_id = $1 AND p.status = $2 AND p.payment_method = $3'),
      ['1274d928-8152-47d2-83f7-08e351598ee8', 'completed', 'mpesa']
    );
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('LIMIT $4 OFFSET $5'),
      ['1274d928-8152-47d2-83f7-08e351598ee8', 'completed', 'mpesa', 100, 5]
    );
    expect(result).toEqual(expect.objectContaining({ total: 1, limit: 100, offset: 5 }));
    expect(result.items[0]).toEqual(expect.objectContaining({
      patient_name: 'Amina Njeri',
      invoice_number: 'INV-1001',
      amount: 1250
    }));
  });
});
