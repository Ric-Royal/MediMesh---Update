const { getPasswordPolicyError } = require('./passwordPolicy');

const MIN_JWT_SECRET_BYTES = 32;
const KNOWN_JWT_SECRETS = new Set([
  'fallback-secret',
  'development-secret',
  'medimesh-development-only-secret',
  'your-super-secret-jwt-key-change-this-in-production',
  'your-super-secret-jwt-key-change-this-in-production-12345',
  'change_this_to_a_strong_secret_key_minimum_32_chars'
]);

class RuntimeConfigurationError extends Error {
  constructor(issues) {
    super(`Unsafe production configuration: ${issues.join('; ')}`);
    this.name = 'RuntimeConfigurationError';
    this.issues = issues;
  }
}

const isEnabled = value => String(value || '').trim().toLowerCase() === 'true';

const validateRuntimeConfiguration = (env = process.env) => {
  const environment = String(env.NODE_ENV || '').trim().toLowerCase();
  if (environment !== 'production') {
    return { environment: environment || 'development', validated: false };
  }

  const issues = [];
  const jwtSecret = String(env.JWT_SECRET || '').trim();
  if (!jwtSecret) {
    issues.push('JWT_SECRET is required');
  } else {
    if (Buffer.byteLength(jwtSecret, 'utf8') < MIN_JWT_SECRET_BYTES) {
      issues.push(`JWT_SECRET must be at least ${MIN_JWT_SECRET_BYTES} bytes`);
    }
    if (KNOWN_JWT_SECRETS.has(jwtSecret.toLowerCase())) {
      issues.push('JWT_SECRET must not use a known default or placeholder');
    }
  }

  if (isEnabled(env.ALLOW_DEMO_AUTH)) {
    issues.push('ALLOW_DEMO_AUTH must be false');
  }
  if (isEnabled(env.ALLOW_INSECURE_DEV_TOKENS)) {
    issues.push('ALLOW_INSECURE_DEV_TOKENS must be false');
  }
  if (!isEnabled(env.REQUIRE_MFA)) {
    issues.push('REQUIRE_MFA must be true');
  }

  const mfaKey = String(env.MFA_ENCRYPTION_KEY || '').trim();
  if (!mfaKey) {
    issues.push('MFA_ENCRYPTION_KEY is required');
  } else {
    const decodedKey = /^[a-f0-9]{64}$/i.test(mfaKey)
      ? Buffer.from(mfaKey, 'hex')
      : Buffer.from(mfaKey, 'base64');
    if (decodedKey.length !== 32) issues.push('MFA_ENCRYPTION_KEY must decode to exactly 32 bytes');
  }

  const publicBaseUrl = String(env.PUBLIC_BASE_URL || '').trim();
  if (!/^https:\/\//i.test(publicBaseUrl)) {
    issues.push('PUBLIC_BASE_URL must be an https:// URL');
  }
  if (!String(env.DATABASE_URL || '').trim()) {
    issues.push('DATABASE_URL is required');
  }
  ['REDIS_PASSWORD', 'MINIO_ACCESS_KEY', 'MINIO_SECRET_KEY'].forEach(name => {
    if (!String(env[name] || '').trim()) issues.push(`${name} is required`);
  });

  const bootstrapPassword = String(env.BOOTSTRAP_ADMIN_PASSWORD || '');
  if (bootstrapPassword.length > 0) {
    const passwordError = getPasswordPolicyError(bootstrapPassword);
    if (passwordError) {
      issues.push(`BOOTSTRAP_ADMIN_PASSWORD is unsafe: ${passwordError}`);
    }
  }

  const mpesaEnvironment = String(env.MPESA_ENVIRONMENT || 'sandbox').trim().toLowerCase();
  if (mpesaEnvironment === 'production' && !String(env.MPESA_CALLBACK_TOKEN || '').trim()) {
    issues.push('MPESA_CALLBACK_TOKEN is required when MPESA_ENVIRONMENT=production');
  }
  if (mpesaEnvironment === 'production') {
    ['MPESA_CONSUMER_KEY', 'MPESA_CONSUMER_SECRET', 'MPESA_PASSKEY', 'MPESA_SHORTCODE'].forEach(name => {
      if (!String(env[name] || '').trim()) issues.push(`${name} is required when MPESA_ENVIRONMENT=production`);
    });
    if (!/^https:\/\//i.test(String(env.MPESA_CALLBACK_URL || '').trim())) {
      issues.push('MPESA_CALLBACK_URL must be an https:// URL when MPESA_ENVIRONMENT=production');
    }
  }

  if (issues.length > 0) throw new RuntimeConfigurationError(issues);
  return { environment: 'production', validated: true };
};

module.exports = {
  KNOWN_JWT_SECRETS,
  MIN_JWT_SECRET_BYTES,
  RuntimeConfigurationError,
  validateRuntimeConfiguration
};
