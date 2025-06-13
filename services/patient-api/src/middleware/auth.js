const jwt = require('jsonwebtoken');
const { logger } = require('../utils/logger');

const authenticateToken = (req, res, next) => {
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
    // In a real implementation, this would verify against Keycloak
    // For now, using a simple JWT verification
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret');
    
    req.user = {
      id: decoded.sub,
      username: decoded.preferred_username,
      email: decoded.email,
      roles: decoded.realm_access?.roles || [],
      scope: decoded.scope
    };

    logger.info('User authenticated', {
      userId: req.user.id,
      username: req.user.username,
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
  authorize,
  dlpMiddleware
};