const jwt = require('jsonwebtoken');
const { logger } = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');
const { getDB } = require('../utils/database');

const getJwtSecret = () => {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  if (process.env.NODE_ENV === 'development') return 'medimesh-development-only-secret';
  throw new Error('JWT authentication is not configured');
};

const developmentUserFromToken = (token) => {
  if (
    process.env.NODE_ENV !== 'development' ||
    process.env.ALLOW_INSECURE_DEV_TOKENS !== 'true' ||
    !token.startsWith('dev_token_')
  ) {
    return null;
  }

  const parts = token.split('_');
  const role = parts[2] || 'user';
  const staffId = parts.length > 3 ? parts.slice(3).join('_') : null;
  const devUserIds = {
    admin: '550e8400-e29b-41d4-a716-446655440000',
    doctor: '550e8400-e29b-41d4-a716-446655440001',
    nurse: '550e8400-e29b-41d4-a716-446655440002',
    receptionist: '550e8400-e29b-41d4-a716-446655440004',
    'lab-tech': '550e8400-e29b-41d4-a716-446655440005',
    pharmacist: '550e8400-e29b-41d4-a716-446655440006',
    radiologist: '550e8400-e29b-41d4-a716-446655440007',
    radiographer: '550e8400-e29b-41d4-a716-446655440007',
    billing: '550e8400-e29b-41d4-a716-446655440008',
    user: '550e8400-e29b-41d4-a716-446655440003'
  };
  const roleAliases = {
    labtech: 'lab-tech',
    lab: 'lab-tech',
    pharma: 'pharmacist',
    rad: 'radiologist',
    reception: 'receptionist'
  };
  const resolvedRole = roleAliases[role] || role;

  return {
    id: staffId || devUserIds[resolvedRole] || uuidv4(),
    username: resolvedRole,
    email: `${resolvedRole}@medimesh.dev`,
    roles: [resolvedRole, 'user'],
    scope: 'read write',
    authenticationType: 'development'
  };
};

const verifyAccessToken = (token) => {
  if (!token || typeof token !== 'string') {
    throw new Error('Access token is required');
  }

  const developmentUser = developmentUserFromToken(token);
  if (developmentUser) return developmentUser;

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
    'SELECT roles, department_id, is_active, must_change_password, token_version, mfa_enabled FROM app_users WHERE id = $1 LIMIT 1',
    [tokenUser.id]
  );

  if (result.rows.length === 0) {
    if (tokenUser.authenticationType === 'development') {
      return { ...tokenUser, departmentId: null, mustChangePassword: false };
    }
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
    mustChangePassword: account.must_change_password === true,
    mfaEnabled: account.mfa_enabled === true,
    mfa: tokenUser.authenticationType === 'development' ? true : tokenUser.mfa === true,
    tokenVersion: Number(account.token_version) || 0
  };
};

const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    logger.warn('Access denied: No token provided', {
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  try {
    req.user = await loadPersistedIdentity(verifyAccessToken(token));

    const mfaRequired = process.env.REQUIRE_MFA === 'true';
    const enrollmentPath = String(req.originalUrl || '').startsWith('/api/auth/mfa/') ||
      String(req.originalUrl || '').startsWith('/api/auth/me') ||
      String(req.originalUrl || '').startsWith('/api/auth/change-password') ||
      String(req.originalUrl || '').startsWith('/api/auth/logout');
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

    next();
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
  
  if (req.query.export === 'true' || req.headers['accept'] === 'text/csv') {
    req.exportLimit = exportLimit;
    logger.info('DLP: Export request detected', {
      userId: req.user?.id,
      limit: exportLimit,
      ip: req.ip
    });
  }
  
  next();
};

module.exports = {
  authenticateToken,
  verifyAccessToken,
  loadPersistedIdentity,
  authorize,
  dlpMiddleware
};
