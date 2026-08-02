const crypto = require('crypto');

const CSRF_COOKIE = 'medimesh_csrf';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const parseCookies = header => Object.fromEntries(
  String(header || '')
    .split(';')
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => {
      const separator = part.indexOf('=');
      return separator < 0
        ? [part, '']
        : [part.slice(0, separator), decodeURIComponent(part.slice(separator + 1))];
    })
);

const timingSafeEqualText = (left, right) => {
  const leftBuffer = Buffer.from(String(left || ''));
  const rightBuffer = Buffer.from(String(right || ''));
  return leftBuffer.length === rightBuffer.length &&
    leftBuffer.length > 0 &&
    crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

const newCsrfToken = () => crypto.randomBytes(32).toString('base64url');

const csrfCookieOptions = () => ({
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  path: '/',
  maxAge: Number(process.env.SESSION_TTL_SECONDS || 900) * 1000
});

const setCsrfCookie = (res) => {
  const token = newCsrfToken();
  res.cookie(CSRF_COOKIE, token, csrfCookieOptions());
  return token;
};

const clearCsrfCookie = res => res.clearCookie(CSRF_COOKIE, {
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  path: '/'
});

const csrfProtection = (req, res, next) => {
  if (SAFE_METHODS.has(req.method)) return next();
  if (req.authenticationSource === 'bearer') return next();

  const cookies = parseCookies(req.headers.cookie);
  const cookieToken = cookies[CSRF_COOKIE];
  const headerToken = req.get('X-CSRF-Token');
  if (!timingSafeEqualText(cookieToken, headerToken)) {
    return res.status(403).json({ error: 'CSRF validation failed' });
  }
  next();
};

module.exports = {
  CSRF_COOKIE,
  clearCsrfCookie,
  csrfProtection,
  newCsrfToken,
  parseCookies,
  setCsrfCookie,
  timingSafeEqualText
};
