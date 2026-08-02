const { getPasswordPolicyError } = require('./passwordPolicy');
const crypto = require('crypto');

const MIN_JWT_SECRET_BYTES = 32;
const KNOWN_JWT_SECRET_HASHES = new Set([
  'a288df15c5fcbca80827fb045b9fddabbd850683d560b8e472d83944f70fca3a',
  '141cf4ed2c03dc620ac12ecdcf6a374ab89e441b3ecb24d6e6fd1204cc0ff909',
  '868fa3a90dadb3c1f4f579d7e1644e387d1d0b03f1762743d6f2ccf25f435755',
  '103ab5dd9769664c34bb4dcecdbe1aa52a55f75a4a62243238c9abb3bc3d9e02',
  'da9863e9a4488abc90c7f43c625a6d50bff8a9a0a23d98938fbbd8658d35b2e2',
  '10de0d5d096d8fbd1f3eb5ea7ccdb43f136a8214565e89db86d91f4bb7ce47e6'
]);
const secretHash = value => crypto.createHash('sha256').update(value).digest('hex');

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
    if (KNOWN_JWT_SECRET_HASHES.has(secretHash(jwtSecret.toLowerCase()))) {
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
    if (!String(env.DATABASE_HOST || '').trim()) issues.push('DATABASE_URL or DATABASE_HOST is required');
  }
  ['REDIS_PASSWORD', 'MINIO_ACCESS_KEY', 'MINIO_SECRET_KEY'].forEach(name => {
    if (!String(env[name] || '').trim()) issues.push(`${name} is required`);
  });

  if (env.DATABASE_SSL !== 'true') {
    issues.push('DATABASE_SSL must be true');
  }
  if (!String(env.REDIS_URL || '').startsWith('rediss://')) {
    issues.push('REDIS_URL must use rediss://');
  }
  if (!String(env.MINIO_ENDPOINT || '').startsWith('https://')) {
    issues.push('MINIO_ENDPOINT must use https://');
  }
  if (env.AUDIT_FAIL_CLOSED === 'false') {
    issues.push('AUDIT_FAIL_CLOSED must not be false');
  }
  if (Number(env.SESSION_TTL_SECONDS || 900) > 1800) {
    issues.push('SESSION_TTL_SECONDS must not exceed 1800 seconds');
  }
  const allowedOrigins = String(env.ALLOWED_ORIGINS || '').split(',').filter(Boolean);
  if (!allowedOrigins.length || allowedOrigins.some(origin => !origin.startsWith('https://'))) {
    issues.push('ALLOWED_ORIGINS must contain only https:// origins');
  }

  ['FILE_ENCRYPTION_KEY'].forEach(name => {
    const configured = String(env[name] || '').trim();
    const decoded = /^[a-f0-9]{64}$/i.test(configured)
      ? Buffer.from(configured, 'hex')
      : Buffer.from(configured, 'base64');
    if (decoded.length !== 32) issues.push(`${name} must decode to exactly 32 bytes`);
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
  KNOWN_JWT_SECRET_HASHES,
  MIN_JWT_SECRET_BYTES,
  RuntimeConfigurationError,
  validateRuntimeConfiguration
};
