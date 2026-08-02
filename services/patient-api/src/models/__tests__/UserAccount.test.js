jest.mock('bcryptjs', () => ({
  hash: jest.fn(),
  compare: jest.fn()
}));
jest.mock('../../utils/database', () => ({ getDB: jest.fn() }));
jest.mock('../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
}));

const bcrypt = require('bcryptjs');
const { getDB } = require('../../utils/database');
const UserAccount = require('../UserAccount');

describe('UserAccount password lifecycle', () => {
  beforeEach(() => jest.clearAllMocks());

  test('administrative reset increments token_version', async () => {
    bcrypt.hash.mockResolvedValue('new-hash');
    const query = jest.fn().mockResolvedValue({ rows: [{
      id: '550e8400-e29b-41d4-a716-446655440001',
      username: 'doctor',
      roles: ['doctor'],
      token_version: 3,
      must_change_password: true,
      is_active: true
    }] });
    getDB.mockReturnValue({ query });

    const user = await UserAccount.resetPassword(
      '550e8400-e29b-41d4-a716-446655440001',
      'Temporary#2026',
      true
    );

    expect(query.mock.calls[0][0]).toContain('token_version = token_version + 1');
    expect(user.token_version).toBe(3);
    expect(user.must_change_password).toBe(true);
  });

  test('self-service change is transactional and returns the incremented version', async () => {
    bcrypt.compare.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    bcrypt.hash.mockResolvedValue('fresh-hash');
    const client = {
      query: jest.fn(async (sql) => {
        if (sql === 'BEGIN' || sql === 'COMMIT') return { rows: [] };
        if (sql.includes('SELECT * FROM app_users')) {
          return { rows: [{ id: '550e8400-e29b-41d4-a716-446655440001', password_hash: 'old-hash' }] };
        }
        if (sql.includes('UPDATE app_users')) {
          return { rows: [{
            id: '550e8400-e29b-41d4-a716-446655440001',
            username: 'doctor',
            roles: ['doctor'],
            token_version: 8,
            must_change_password: false,
            is_active: true
          }] };
        }
        throw new Error(`Unexpected SQL: ${sql}`);
      }),
      release: jest.fn()
    };
    getDB.mockReturnValue({ connect: jest.fn().mockResolvedValue(client) });

    const result = await UserAccount.changePassword(
      '550e8400-e29b-41d4-a716-446655440001',
      'Current#2026',
      'FreshPass#2026'
    );

    const updateSql = client.query.mock.calls.find(([sql]) => sql.includes('UPDATE app_users'))[0];
    expect(updateSql).toContain('must_change_password = FALSE');
    expect(updateSql).toContain('token_version = token_version + 1');
    expect(result).toMatchObject({ status: 'changed', user: { token_version: 8 } });
    expect(client.query).toHaveBeenCalledWith('COMMIT');
    expect(client.release).toHaveBeenCalled();
  });
});
