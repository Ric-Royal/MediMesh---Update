const MIN_PASSWORD_LENGTH = 12;
const MAX_BCRYPT_PASSWORD_BYTES = 72;

const getPasswordPolicyError = (password) => {
  if (typeof password !== 'string' || password.length === 0) {
    return 'Password is required';
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters long`;
  }

  // bcrypt only considers the first 72 UTF-8 bytes. Reject longer values so
  // two visually different passwords can never authenticate as the same one.
  if (Buffer.byteLength(password, 'utf8') > MAX_BCRYPT_PASSWORD_BYTES) {
    return `Password must be no more than ${MAX_BCRYPT_PASSWORD_BYTES} UTF-8 bytes`;
  }

  if (
    !/[a-z]/.test(password) ||
    !/[A-Z]/.test(password) ||
    !/[0-9]/.test(password) ||
    !/[^A-Za-z0-9\s]/.test(password)
  ) {
    return 'Password must include an uppercase letter, lowercase letter, number, and symbol';
  }

  return null;
};

module.exports = {
  MIN_PASSWORD_LENGTH,
  MAX_BCRYPT_PASSWORD_BYTES,
  getPasswordPolicyError
};
