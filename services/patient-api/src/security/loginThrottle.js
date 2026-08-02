const crypto = require('crypto');
const { getRedis } = require('../utils/redis');
const { logger } = require('../utils/logger');

const MAX_FAILURES = Math.max(3, Number(process.env.LOGIN_MAX_FAILURES) || 5);
const WINDOW_SECONDS = Math.max(60, Number(process.env.LOGIN_FAILURE_WINDOW_SECONDS) || 900);

const keyFor = (username, ip) => {
  const normalized = `${String(username || '').trim().toLowerCase()}|${String(ip || '')}`;
  return `auth:fail:${crypto.createHash('sha256').update(normalized).digest('hex')}`;
};

const checkLoginAllowed = async (req, res, next) => {
  try {
    const failures = Number(await getRedis().get(keyFor(req.body?.username, req.ip))) || 0;
    if (failures >= MAX_FAILURES) {
      res.set('Retry-After', String(WINDOW_SECONDS));
      return res.status(429).json({
        error: 'Sign-in is temporarily locked. Wait before trying again.'
      });
    }
    return next();
  } catch (error) {
    logger.error('Sign-in throttle check failed', { error: error.message, ip: req.ip });
    return res.status(503).json({ error: 'Sign-in is temporarily unavailable' });
  }
};

const recordLoginFailure = async (username, ip) => {
  const key = keyFor(username, ip);
  await getRedis().eval(`
    local count = redis.call('INCR', KEYS[1])
    if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
    return count
  `, {
    keys: [key],
    arguments: [String(WINDOW_SECONDS)]
  });
};

const clearLoginFailures = async (username, ip) => {
  await getRedis().del(keyFor(username, ip));
};

module.exports = {
  checkLoginAllowed,
  clearLoginFailures,
  recordLoginFailure
};
