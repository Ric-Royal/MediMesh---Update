const jwt = require('jsonwebtoken');
const { logger } = require('../utils/logger');
const { getDB } = require('../utils/database');
const { csrfProtection, parseCookies } = require('../security/csrf');

const getJwtSecret = () => {
  const secret = String(process.env.JWT_SECRET || '');
  if (Buffer.byteLength(secret) < 32) {
    throw new Error('JWT_SECRET must contain at least 32 bytes');
  }
  return secret;
};

const verifyAccessToken = (token) => {
  if (!token || typeof token !== 'string') {
    throw new Error('Access token is required');
  }

  const decoded = jwt.verify(token, getJwtSecret(), {
    algorithms: ['HS256'],
    audience: 'medimesh-client',
    issuer: 'medimesh'
  });

  return {
    id: decoded.sub,
    username: decoded.preferred_username,
    email: decoded.email,
    roles: decoded.realm_access?.roles || [],
    scope: decoded.scope,
    tokenVersion: decoded.token_version,
    mfa: decoded.mfa === true,
    authenticationType: 'jwt'
  };
};

const loadPersistedIdentity = async (tokenUser) => {
  const result = await getDB().query(
    `SELECT
       u.roles,
       COALESCE(u.department_id, s.department_id) AS department_id,
       u.is_active,
       u.must_change_password,
       u.token_version,
       u.mfa_enabled,
       s.id AS staff_id,
       s.staff_number AS provider_identifier,
       s.role AS staff_role,
       s.status AS staff_status,
       s.license_number,
       s.license_expiry,
       s.primary_clinic_id
     FROM app_users u
     LEFT JOIN staff s ON s.id = u.id
     WHERE u.id = $1
     LIMIT 1`,
    [tokenUser.id]
  );

  if (result.rows.length === 0) {
    throw new Error('Account is not active');
  }

  const account = result.rows[0];
  if (!account.is_active) throw new Error('Account is not active');

  if (tokenUser.authenticationType === 'jwt') {
    const tokenVersion = Number(tokenUser.tokenVersion);
    const currentVersion = Number(account.token_version) || 0;
    if (!Number.isSafeInteger(tokenVersion) || tokenVersion < 0 || tokenVersion !== currentVersion) {
      throw new Error('Token has been revoked');
    }
  }

  return {
    ...tokenUser,
    roles: Array.isArray(account.roles) ? account.roles : [],
    departmentId: account.department_id || null,
    staffId: account.staff_id || null,
    providerIdentifier: account.provider_identifier || null,
    staffRole: account.staff_role || null,
    staffStatus: account.staff_status || null,
    licenseNumber: account.license_number || null,
    licenseExpiry: account.license_expiry || null,
    primaryClinicId: account.primary_clinic_id || null,
    mustChangePassword: account.must_change_password === true,
    mfaEnabled: account.mfa_enabled === true,
    mfa: tokenUser.mfa === true,
    tokenVersion: Number(account.token_version) || 0
  };
};

const extractAccessToken = req => {
  const authHeader = String(req.headers.authorization || '').trim();
  if (authHeader) {
    const match = authHeader.match(/^Bearer ([^\s]+)$/);
    if (!match) throw new Error('Authorization header must use the Bearer scheme');
    req.authenticationSource = 'bearer';
    return match[1];
  }

  const token = parseCookies(req.headers.cookie).medimesh_session;
  if (token) req.authenticationSource = 'cookie';
  return token;
};

const authenticateToken = async (req, res, next) => {
  try {
    const token = extractAccessToken(req);
    if (!token) {
      logger.warn('Access denied: No session provided', {
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });
      return res.status(401).json({ error: 'Authentication is required.' });
    }

    req.user = await loadPersistedIdentity(verifyAccessToken(token));

    const originalUrl = String(req.originalUrl || '');
    const passwordChangePath = originalUrl.startsWith('/api/auth/change-password') ||
      originalUrl.startsWith('/api/auth/logout') ||
      originalUrl.startsWith('/api/auth/me');
    if (req.user.mustChangePassword && !passwordChangePath) {
      return res.status(428).json({
        error: 'Password change is required before continuing.',
        code: 'PASSWORD_CHANGE_REQUIRED'
      });
    }

    const mfaRequired = process.env.REQUIRE_MFA !== 'false';
    const enrollmentPath = originalUrl.startsWith('/api/auth/mfa/') ||
      originalUrl.startsWith('/api/auth/me') ||
      originalUrl.startsWith('/api/auth/change-password') ||
      originalUrl.startsWith('/api/auth/logout');
    if (mfaRequired && !enrollmentPath && (!req.user.mfaEnabled || !req.user.mfa)) {
      return res.status(428).json({
        error: 'Multi-factor authentication enrollment is required.',
        code: 'MFA_ENROLLMENT_REQUIRED'
      });
    }

    logger.info('User authenticated', {
      userId: req.user.id,
      username: req.user.username,
      authenticationType: req.user.authenticationType,
      ip: req.ip
    });

    return csrfProtection(req, res, next);
  } catch (error) {
    logger.warn('Invalid token', {
      error: error.message,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });
    return res.status(403).json({ error: 'Invalid token.' });
  }
};

const authorize = (requiredRoles = []) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'User not authenticated.' });
    }

    const userRoles = req.user.roles || [];
    const hasRequiredRole = requiredRoles.some(role => userRoles.includes(role));

    if (requiredRoles.length > 0 && !hasRequiredRole) {
      logger.warn('Access denied: Insufficient permissions', {
        userId: req.user.id,
        userRoles,
        requiredRoles,
        ip: req.ip
      });
      return res.status(403).json({ 
        error: 'Access denied. Insufficient permissions.',
        required: requiredRoles,
        current: userRoles
      });
    }

    next();
  };
};

// Data Loss Prevention middleware - limits export records
const dlpMiddleware = (req, res, next) => {
  const exportLimit = parseInt(process.env.DLP_EXPORT_LIMIT) || 20;
  const isExport = req.query.export === 'true' ||
    String(req.headers.accept || '').includes('text/csv') ||
    /\/export(?:\/|$)/.test(req.path);

  if (isExport) {
    const purpose = String(req.get('X-Export-Purpose') || '').trim();
    if (purpose.length < 20 || purpose.length > 500) {
      return res.status(400).json({
        error: 'An export purpose between 20 and 500 characters is required'
      });
    }
    req.exportLimit = exportLimit;
    req.accessContext = { ...(req.accessContext || {}), purpose };
    logger.info('DLP: Export request detected', {
      userId: req.user?.id,
      limit: exportLimit,
      ip: req.ip
    });
  }
  
  return next();
};

module.exports = {
  authenticateToken,
  extractAccessToken,
  verifyAccessToken,
  loadPersistedIdentity,
  authorize,
  dlpMiddleware
};
