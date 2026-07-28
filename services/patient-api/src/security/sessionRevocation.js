const crypto = require('crypto');
const { getRedis } = require('../utils/redis');

const revokedSessionKey = sessionId => {
  const digest = crypto.createHash('sha256').update(sessionId).digest('hex');
  return `security:revoked-session:${digest}`;
};

const revokeSession = async ({ sessionId, expiresAt }) => {
  if (!sessionId || !Number.isSafeInteger(Number(expiresAt))) {
    throw new Error('A valid session identifier and expiry are required');
  }

  const remainingSeconds = Math.max(1, Number(expiresAt) - Math.floor(Date.now() / 1000));
  await getRedis().setEx(revokedSessionKey(sessionId), remainingSeconds, '1');
};

const isSessionRevoked = async sessionId => {
  if (!sessionId) return true;
  return Boolean(await getRedis().get(revokedSessionKey(sessionId)));
};

module.exports = {
  isSessionRevoked,
  revokeSession
};
