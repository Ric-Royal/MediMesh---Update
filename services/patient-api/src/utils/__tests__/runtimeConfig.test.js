const {
  MIN_JWT_SECRET_BYTES,
  RuntimeConfigurationError,
  validateRuntimeConfiguration
} = require('../runtimeConfig');

describe('production runtime configuration', () => {
  const validProduction = (overrides = {}) => ({
    NODE_ENV: 'production',
    JWT_SECRET: 'xR8#vP2!mQ7@cL4$zN9&bT6*wK3_yH5+',
    ALLOW_DEMO_AUTH: 'false',
    ALLOW_INSECURE_DEV_TOKENS: 'false',
    REQUIRE_MFA: 'true',
    MFA_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString('base64'),
    PUBLIC_BASE_URL: 'https://clinic.example.org',
    DATABASE_URL: 'postgresql://medimesh:secret@postgres:5432/medimesh',
    DATABASE_SSL: 'true',
    REDIS_URL: 'rediss://redis:6379',
    REDIS_PASSWORD: 'redis-secret',
    MINIO_ENDPOINT: 'https://objects.example.internal',
    MINIO_ACCESS_KEY: 'storage-user',
    MINIO_SECRET_KEY: 'storage-secret',
    FILE_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
    ALLOWED_ORIGINS: 'https://clinic.example.org',
    BOOTSTRAP_ADMIN_PASSWORD: '',
    MPESA_ENVIRONMENT: 'sandbox',
    MPESA_CALLBACK_TOKEN: '',
    ...overrides
  });

  const issuesFor = env => {
    try {
      validateRuntimeConfiguration(env);
      return [];
    } catch (error) {
      expect(error).toBeInstanceOf(RuntimeConfigurationError);
      return error.issues;
    }
  };

  test('does not change development behavior', () => {
    expect(validateRuntimeConfiguration({
      NODE_ENV: 'development',
      JWT_SECRET: '',
      ALLOW_DEMO_AUTH: 'true',
      ALLOW_INSECURE_DEV_TOKENS: 'true',
      BOOTSTRAP_ADMIN_PASSWORD: 'admin123',
      MPESA_ENVIRONMENT: 'production'
    })).toEqual({ environment: 'development', validated: false });
  });

  test('accepts a safe production configuration with no bootstrap account', () => {
    expect(validateRuntimeConfiguration(validProduction())).toEqual({
      environment: 'production',
      validated: true
    });
  });

  test('accepts a strong explicit bootstrap password', () => {
    expect(validateRuntimeConfiguration(validProduction({
      BOOTSTRAP_ADMIN_PASSWORD: 'InitialAdmin#2026'
    })).validated).toBe(true);
  });

  test('rejects a missing JWT signing secret', () => {
    expect(issuesFor(validProduction({ JWT_SECRET: '' }))).toContain('JWT_SECRET is required');
  });

  test('rejects a short JWT signing secret', () => {
    expect(issuesFor(validProduction({ JWT_SECRET: 'short-secret' })).join(' '))
      .toContain(`at least ${MIN_JWT_SECRET_BYTES} bytes`);
  });

  test.each([
    'fallback-secret',
    'medimesh-development-only-secret',
    'your-super-secret-jwt-key-change-this-in-production-12345',
    'CHANGE_THIS_TO_A_STRONG_SECRET_KEY_MINIMUM_32_CHARS'
  ])('rejects known JWT default %s', JWT_SECRET => {
    expect(issuesFor(validProduction({ JWT_SECRET })).join(' ')).toContain('known default');
  });

  test('rejects demo authentication in production', () => {
    expect(issuesFor(validProduction({ ALLOW_DEMO_AUTH: 'TrUe' })))
      .toContain('ALLOW_DEMO_AUTH must be false');
  });

  test('rejects insecure development tokens in production', () => {
    expect(issuesFor(validProduction({ ALLOW_INSECURE_DEV_TOKENS: 'true' })))
      .toContain('ALLOW_INSECURE_DEV_TOKENS must be false');
  });

  test('requires MFA, its encryption key and an HTTPS public URL', () => {
    const issues = issuesFor(validProduction({
      REQUIRE_MFA: 'false', MFA_ENCRYPTION_KEY: 'short', PUBLIC_BASE_URL: 'http://clinic.example.org'
    }));
    expect(issues.join(' ')).toContain('REQUIRE_MFA must be true');
    expect(issues.join(' ')).toContain('exactly 32 bytes');
    expect(issues.join(' ')).toContain('https:// URL');
  });

  test('rejects a weak non-empty bootstrap password', () => {
    expect(issuesFor(validProduction({ BOOTSTRAP_ADMIN_PASSWORD: 'admin123' })).join(' '))
      .toContain('BOOTSTRAP_ADMIN_PASSWORD is unsafe');
  });

  test('requires callback authentication for production M-Pesa', () => {
    expect(issuesFor(validProduction({
      MPESA_ENVIRONMENT: 'production',
      MPESA_CALLBACK_TOKEN: '   '
    }))).toContain('MPESA_CALLBACK_TOKEN is required when MPESA_ENVIRONMENT=production');
  });

  test('accepts production M-Pesa with callback authentication', () => {
    expect(validateRuntimeConfiguration(validProduction({
      MPESA_ENVIRONMENT: 'production',
      MPESA_CALLBACK_TOKEN: 'callback-auth-secret',
      MPESA_CONSUMER_KEY: 'consumer-key',
      MPESA_CONSUMER_SECRET: 'consumer-secret',
      MPESA_PASSKEY: 'passkey',
      MPESA_SHORTCODE: '123456',
      MPESA_CALLBACK_URL: 'https://clinic.example.org/api/payments/mpesa/callback'
    })).validated).toBe(true);
  });

  test('reports every unsafe setting in one startup failure', () => {
    const issues = issuesFor(validProduction({
      JWT_SECRET: 'short',
      ALLOW_DEMO_AUTH: 'true',
      ALLOW_INSECURE_DEV_TOKENS: 'true',
      BOOTSTRAP_ADMIN_PASSWORD: 'admin123',
      MPESA_ENVIRONMENT: 'production',
      MPESA_CALLBACK_TOKEN: ''
    }));

    expect(issues).toEqual(expect.arrayContaining([
      expect.stringContaining('JWT_SECRET'),
      'ALLOW_DEMO_AUTH must be false',
      'ALLOW_INSECURE_DEV_TOKENS must be false',
      expect.stringContaining('BOOTSTRAP_ADMIN_PASSWORD'),
      'MPESA_CALLBACK_TOKEN is required when MPESA_ENVIRONMENT=production'
    ]));
  });
});
