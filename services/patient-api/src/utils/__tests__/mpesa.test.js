jest.mock('axios', () => ({
  get: jest.fn(),
  post: jest.fn()
}));

const axios = require('axios');
const mpesaService = require('../mpesa');

describe('M-Pesa payment safety', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NODE_ENV = 'production';
    mpesaService.consumerKey = 'consumer';
    mpesaService.consumerSecret = 'secret';
    mpesaService.passkey = 'passkey';
    mpesaService.shortCode = '174379';
    mpesaService.callbackUrl = 'https://payments.example.test/api/payments/mpesa/callback';
    mpesaService.callbackToken = 'callback-secret';
    mpesaService.accessToken = null;
    mpesaService.tokenExpiry = null;
  });

  afterAll(() => {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
  });

  test('requires callback authentication outside development', () => {
    mpesaService.callbackToken = '';
    expect(() => mpesaService.validateConfig()).toThrow('callbackToken');
  });

  test('adds the callback secret without discarding existing query values', () => {
    mpesaService.callbackUrl = 'https://payments.example.test/callback?source=daraja';
    const callback = new URL(mpesaService.getCallbackUrl());
    expect(callback.searchParams.get('source')).toBe('daraja');
    expect(callback.searchParams.get('token')).toBe('callback-secret');
  });

  test('rejects fractional shilling amounts before any network request', async () => {
    await expect(mpesaService.stkPush({
      phoneNumber: '0712345678',
      amount: 100.5,
      accountReference: 'INV-1234',
      transactionDesc: 'Invoice payment'
    })).rejects.toThrow('Failed to initiate M-Pesa payment');
    expect(axios.get).not.toHaveBeenCalled();
    expect(axios.post).not.toHaveBeenCalled();
  });
});
