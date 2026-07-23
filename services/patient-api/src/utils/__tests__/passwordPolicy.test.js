const {
  MIN_PASSWORD_LENGTH,
  MAX_BCRYPT_PASSWORD_BYTES,
  getPasswordPolicyError
} = require('../passwordPolicy');

describe('password policy', () => {
  test('accepts a password that satisfies every requirement', () => {
    expect(getPasswordPolicyError('CareTeam#2026')).toBeNull();
  });

  test.each([
    ['Short#1A', `at least ${MIN_PASSWORD_LENGTH}`],
    ['alllowercase#2026', 'uppercase letter'],
    ['ALLUPPERCASE#2026', 'lowercase letter'],
    ['NoNumbersHere#!', 'number'],
    ['NoSymbolHere2026', 'symbol']
  ])('rejects weak password %s', (password, expectedMessage) => {
    expect(getPasswordPolicyError(password)).toContain(expectedMessage);
  });

  test('rejects values bcrypt would silently truncate', () => {
    const password = `Aa1#${'x'.repeat(MAX_BCRYPT_PASSWORD_BYTES)}`;
    expect(getPasswordPolicyError(password)).toContain(`${MAX_BCRYPT_PASSWORD_BYTES} UTF-8 bytes`);
  });
});
