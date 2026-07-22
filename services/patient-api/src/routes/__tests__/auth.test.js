jest.mock('../../middleware/auth', () => ({
  authenticateToken: (req, res, next) => {
    req.user = { id: '550e8400-e29b-41d4-a716-446655440001' };
    next();
  }
}));
jest.mock('../../models/UserAccount', () => ({
  authenticate: jest.fn(),
  findById: jest.fn(),
  changePassword: jest.fn(),
  markLogin: jest.fn(),
  getSecurityRecord: jest.fn(),
  stageMfaSecret: jest.fn(),
  enableMfa: jest.fn(),
  disableMfa: jest.fn(),
  verifyPassword: jest.fn(),
  toSafeJSON: jest.fn(row => ({ ...row }))
}));
jest.mock('../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
}));

const express = require('express');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const UserAccount = require('../../models/UserAccount');
const authRouter = require('../auth');
const { encryptSecret, generateSecret, generateTotp } = require('../../utils/totp');

describe('POST /api/auth/change-password', () => {
  const secret = 'test-password-lifecycle-secret';
  const originalSecret = process.env.JWT_SECRET;
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);

  beforeAll(() => {
    process.env.JWT_SECRET = secret;
    process.env.MFA_ENCRYPTION_KEY = Buffer.alloc(32, 4).toString('base64');
  });

  afterAll(() => {
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
    delete process.env.MFA_ENCRYPTION_KEY;
  });

  beforeEach(() => jest.clearAllMocks());

  test('rejects a weak new password before updating the account', async () => {
    const response = await request(app)
      .post('/api/auth/change-password')
      .send({ currentPassword: 'Current#2026', newPassword: 'weak' });

    expect(response.status).toBe(400);
    expect(UserAccount.changePassword).not.toHaveBeenCalled();
  });

  test('rejects an incorrect current password', async () => {
    UserAccount.changePassword.mockResolvedValue({ status: 'invalid_current_password' });

    const response = await request(app)
      .post('/api/auth/change-password')
      .send({ currentPassword: 'Wrong#2026', newPassword: 'FreshPass#2026' });

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('Current password is incorrect');
  });

  test('returns a fresh versioned token and clears the forced-change flag', async () => {
    UserAccount.changePassword.mockResolvedValue({
      status: 'changed',
      user: {
        id: '550e8400-e29b-41d4-a716-446655440001',
        username: 'doctor',
        display_name: 'Dr. Test',
        email: 'doctor@example.test',
        roles: ['doctor', 'user'],
        must_change_password: false,
        token_version: 7
      }
    });

    const response = await request(app)
      .post('/api/auth/change-password')
      .send({ currentPassword: 'Current#2026', newPassword: 'FreshPass#2026' });

    expect(response.status).toBe(200);
    expect(response.body.user.mustChangePassword).toBe(false);
    expect(jwt.verify(response.body.access_token, secret, {
      algorithms: ['HS256'], audience: 'medimesh-client', issuer: 'medimesh'
    }).token_version).toBe(7);
  });

  test('requires and verifies a second factor for an enrolled account', async () => {
    const mfaSecret = generateSecret();
    const account = {
      id: '550e8400-e29b-41d4-a716-446655440001',
      username: 'doctor', display_name: 'Dr. Test', email: 'doctor@example.test',
      roles: ['doctor', 'user'], must_change_password: false, token_version: 3,
      is_active: true, mfa_enabled: true, mfa_secret_encrypted: encryptSecret(mfaSecret)
    };
    UserAccount.authenticate.mockResolvedValue(account);
    UserAccount.getSecurityRecord.mockResolvedValue(account);

    const firstStep = await request(app).post('/api/auth/login')
      .send({ username: 'doctor', password: 'Correct#2026' });
    expect(firstStep.status).toBe(202);
    expect(firstStep.body).toEqual(expect.objectContaining({ mfaRequired: true, expires_in: 300 }));
    expect(firstStep.body.access_token).toBeUndefined();

    const secondStep = await request(app).post('/api/auth/mfa/verify')
      .send({ mfaToken: firstStep.body.mfa_token, code: generateTotp(mfaSecret) });
    expect(secondStep.status).toBe(200);
    const claims = jwt.verify(secondStep.body.access_token, secret, {
      algorithms: ['HS256'], audience: 'medimesh-client', issuer: 'medimesh'
    });
    expect(claims.mfa).toBe(true);
    expect(UserAccount.markLogin).toHaveBeenCalledWith(account.id);
  });
});
