const {
  buildOtpAuthUri, decryptSecret, encryptSecret, generateSecret, generateTotp, verifyTotp
} = require('../totp');

describe('TOTP MFA utilities', () => {
  const originalKey = process.env.MFA_ENCRYPTION_KEY;

  beforeAll(() => {
    process.env.MFA_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
  });

  afterAll(() => {
    if (originalKey === undefined) delete process.env.MFA_ENCRYPTION_KEY;
    else process.env.MFA_ENCRYPTION_KEY = originalKey;
  });

  test('generates and verifies a six digit code with small clock drift', () => {
    const secret = generateSecret();
    const at = Date.UTC(2026, 6, 22, 10, 0, 0);
    const code = generateTotp(secret, at);
    expect(code).toMatch(/^\d{6}$/);
    expect(verifyTotp(secret, code, at)).toBe(true);
    expect(verifyTotp(secret, code, at + 30000)).toBe(true);
    expect(verifyTotp(secret, '000000', at)).toBe(false);
  });

  test('encrypts secrets with authenticated encryption', () => {
    const secret = generateSecret();
    const encrypted = encryptSecret(secret);
    expect(encrypted).not.toContain(secret);
    expect(decryptSecret(encrypted)).toBe(secret);
  });

  test('creates a standards-compatible manual enrollment URI', () => {
    expect(buildOtpAuthUri({ secret: 'ABC234', username: 'cashier' }))
      .toContain('otpauth://totp/MediMesh%3Acashier?secret=ABC234');
  });
});
