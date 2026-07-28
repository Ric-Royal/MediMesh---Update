jest.mock('../../utils/database', () => ({ getDB: jest.fn() }));
jest.mock('../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
}));

const jwt = require('jsonwebtoken');
const { getDB } = require('../../utils/database');
const { verifyAccessToken, loadPersistedIdentity } = require('../auth');

describe('versioned access tokens', () => {
  const secret = 'test-password-lifecycle-secret-32-bytes';
  const subject = '550e8400-e29b-41d4-a716-446655440008';
  const originalSecret = process.env.JWT_SECRET;

  beforeAll(() => {
    process.env.JWT_SECRET = secret;
  });

  afterAll(() => {
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
  });

  beforeEach(() => jest.clearAllMocks());

  const tokenForVersion = (tokenVersion) => jwt.sign({
    sub: subject,
    preferred_username: 'billing',
    realm_access: { roles: ['admin'] },
    token_version: tokenVersion,
    iss: 'medimesh',
    aud: 'medimesh-client'
  }, secret, { algorithm: 'HS256', expiresIn: 3600, jwtid: 'test-session-id' });

  test('reads the signed token version', () => {
    expect(verifyAccessToken(tokenForVersion(4)).tokenVersion).toBe(4);
    expect(verifyAccessToken(tokenForVersion(4)).sessionId).toBe('test-session-id');
  });

  test('uses persisted roles when the token version matches', async () => {
    getDB.mockReturnValue({
      query: jest.fn().mockResolvedValue({ rows: [{
        roles: ['billing', 'user'],
        department_id: null,
        is_active: true,
        must_change_password: false,
        token_version: 4
      }] })
    });

    const identity = await loadPersistedIdentity(verifyAccessToken(tokenForVersion(4)));
    expect(identity.roles).toEqual(['billing', 'user']);
    expect(identity.tokenVersion).toBe(4);
  });

  test('rejects a token after the persisted version advances', async () => {
    getDB.mockReturnValue({
      query: jest.fn().mockResolvedValue({ rows: [{
        roles: ['billing', 'user'],
        department_id: null,
        is_active: true,
        must_change_password: false,
        token_version: 5
      }] })
    });

    await expect(loadPersistedIdentity(verifyAccessToken(tokenForVersion(4))))
      .rejects.toThrow('Token has been revoked');
  });

  test('rejects legacy JWTs without a version claim', async () => {
    getDB.mockReturnValue({
      query: jest.fn().mockResolvedValue({ rows: [{
        roles: ['billing'],
        department_id: null,
        is_active: true,
        must_change_password: false,
        token_version: 0
      }] })
    });
    const legacyToken = jwt.sign({
      sub: subject,
      preferred_username: 'billing',
      iss: 'medimesh',
      aud: 'medimesh-client'
    }, secret, { algorithm: 'HS256', expiresIn: 3600 });

    await expect(loadPersistedIdentity(verifyAccessToken(legacyToken)))
      .rejects.toThrow('Token has been revoked');
  });
});
