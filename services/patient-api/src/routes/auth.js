const express = require('express');
const jwt = require('jsonwebtoken');
const UserAccount = require('../models/UserAccount');
const { authenticateToken } = require('../middleware/auth');
const { logger } = require('../utils/logger');
const { getPasswordPolicyError } = require('../utils/passwordPolicy');
const {
  buildOtpAuthUri, decryptSecret, encryptSecret, generateSecret, verifyTotp
} = require('../utils/totp');

const router = express.Router();

const getJwtSecret = () => {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  if (process.env.NODE_ENV === 'development') return 'medimesh-development-only-secret';
  throw new Error('JWT_SECRET is required outside development');
};

const getSessionTtlSeconds = () => Math.max(900, Number(process.env.SESSION_TTL_SECONDS) || 28800);

const publicUser = (user) => ({
  id: user.id,
  username: user.username,
  name: user.display_name,
  fullName: user.display_name,
  email: user.email,
  roles: user.roles,
  mustChangePassword: user.must_change_password,
  mfaEnabled: user.mfa_enabled === true,
  mfaEnrollmentRequired: process.env.REQUIRE_MFA === 'true' && user.mfa_enabled !== true
});

const createSession = (user, { mfaAuthenticated = false } = {}) => {
  const expiresInSeconds = getSessionTtlSeconds();
  const tokenVersion = Number(user.token_version) || 0;
  const token = jwt.sign({
    sub: user.id,
    preferred_username: user.username,
    name: user.display_name,
    email: user.email,
    realm_access: { roles: user.roles },
    scope: 'openid profile email',
    token_version: tokenVersion,
    mfa: mfaAuthenticated === true,
    iss: 'medimesh',
    aud: 'medimesh-client'
  }, getJwtSecret(), { expiresIn: expiresInSeconds, algorithm: 'HS256' });

  return {
    access_token: token,
    token_type: 'Bearer',
    expires_in: expiresInSeconds,
    user: publicUser(user)
  };
};

const createMfaChallenge = user => jwt.sign({
  sub: user.id,
  preferred_username: user.username,
  token_version: Number(user.token_version) || 0,
  purpose: 'mfa-login',
  iss: 'medimesh',
  aud: 'medimesh-mfa'
}, getJwtSecret(), { expiresIn: 300, algorithm: 'HS256' });

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const user = await UserAccount.authenticate(username, password);
    if (!user) {
      logger.warn('Login failed', { username: String(username).slice(0, 80), ip: req.ip });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (user.mfa_enabled) {
      logger.info('Password accepted; MFA challenge issued', { userId: user.id, ip: req.ip });
      return res.status(202).json({
        mfaRequired: true,
        mfa_token: createMfaChallenge(user),
        expires_in: 300
      });
    }

    if (UserAccount.markLogin) await UserAccount.markLogin(user.id);
    logger.info('Login successful', { username: user.username, userId: user.id, roles: user.roles, ip: req.ip });
    res.json(createSession(user));
  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

router.post('/mfa/verify', async (req, res) => {
  try {
    const { mfaToken, code } = req.body || {};
    const challenge = jwt.verify(mfaToken, getJwtSecret(), {
      algorithms: ['HS256'], audience: 'medimesh-mfa', issuer: 'medimesh'
    });
    if (challenge.purpose !== 'mfa-login') return res.status(401).json({ error: 'Invalid MFA challenge' });

    const account = await UserAccount.getSecurityRecord(challenge.sub);
    if (!account || !account.mfa_enabled || Number(account.token_version || 0) !== Number(challenge.token_version)) {
      return res.status(401).json({ error: 'MFA challenge is no longer valid' });
    }
    if (!verifyTotp(decryptSecret(account.mfa_secret_encrypted), code)) {
      logger.warn('MFA verification failed', { userId: challenge.sub, ip: req.ip });
      return res.status(401).json({ error: 'Invalid or expired authenticator code' });
    }

    const user = UserAccount.toSafeJSON(account);
    await UserAccount.markLogin(user.id);
    logger.info('MFA login completed', { userId: user.id, ip: req.ip });
    return res.json(createSession(user, { mfaAuthenticated: true }));
  } catch (error) {
    const status = ['JsonWebTokenError', 'TokenExpiredError'].includes(error.name) ? 401 : 500;
    logger.warn('MFA login challenge rejected', { error: error.message, ip: req.ip });
    return res.status(status).json({ error: status === 401 ? 'MFA challenge expired; sign in again' : 'MFA verification failed' });
  }
});

router.post('/mfa/setup', authenticateToken, async (req, res) => {
  try {
    const account = await UserAccount.getSecurityRecord(req.user.id);
    if (!account) return res.status(404).json({ error: 'Account not found' });
    if (account.mfa_enabled) return res.status(409).json({ error: 'MFA is already enabled' });

    const secret = generateSecret();
    await UserAccount.stageMfaSecret(account.id, encryptSecret(secret));
    return res.json({
      secret,
      otpauthUri: buildOtpAuthUri({ secret, username: account.username, issuer: 'MediMesh' }),
      message: 'Add this key to an authenticator app, then enter its six-digit code to finish.'
    });
  } catch (error) {
    logger.error('MFA setup failed', { error: error.message, userId: req.user?.id });
    return res.status(500).json({ error: 'MFA setup failed' });
  }
});

router.post('/mfa/enable', authenticateToken, async (req, res) => {
  try {
    const account = await UserAccount.getSecurityRecord(req.user.id);
    if (!account?.mfa_pending_secret_encrypted) return res.status(409).json({ error: 'Start MFA setup first' });
    if (!verifyTotp(decryptSecret(account.mfa_pending_secret_encrypted), req.body?.code)) {
      return res.status(400).json({ error: 'Invalid or expired authenticator code' });
    }
    const user = await UserAccount.enableMfa(account.id);
    logger.info('MFA enabled and prior sessions revoked', { userId: account.id, ip: req.ip });
    return res.json({ message: 'MFA enabled successfully.', ...createSession(user, { mfaAuthenticated: true }) });
  } catch (error) {
    logger.error('MFA enable failed', { error: error.message, userId: req.user?.id });
    return res.status(500).json({ error: 'MFA could not be enabled' });
  }
});

router.post('/mfa/disable', authenticateToken, async (req, res) => {
  try {
    const { password, code } = req.body || {};
    const account = await UserAccount.getSecurityRecord(req.user.id);
    if (!account?.mfa_enabled) return res.status(409).json({ error: 'MFA is not enabled' });
    const passwordValid = await UserAccount.verifyPassword(account.id, password);
    const codeValid = verifyTotp(decryptSecret(account.mfa_secret_encrypted), code);
    if (!passwordValid || !codeValid) return res.status(401).json({ error: 'Password or authenticator code is incorrect' });
    const user = await UserAccount.disableMfa(account.id);
    logger.warn('MFA disabled and prior sessions revoked', { userId: account.id, ip: req.ip });
    return res.json({ message: 'MFA disabled.', ...createSession(user) });
  } catch (error) {
    logger.error('MFA disable failed', { error: error.message, userId: req.user?.id });
    return res.status(500).json({ error: 'MFA could not be disabled' });
  }
});

router.get('/me', authenticateToken, async (req, res) => {
  const user = await UserAccount.findById(req.user.id);
  if (!user || !user.is_active) return res.status(401).json({ error: 'Account is not active' });
  res.json({
    id: user.id,
    username: user.username,
    name: user.display_name,
    fullName: user.display_name,
    email: user.email,
    roles: user.roles,
    mustChangePassword: user.must_change_password,
    mfaEnabled: user.mfa_enabled === true,
    mfaEnrollmentRequired: process.env.REQUIRE_MFA === 'true' && user.mfa_enabled !== true
  });
});

router.post('/change-password', authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (typeof currentPassword !== 'string' || currentPassword.length === 0 || currentPassword.length > 128) {
      return res.status(400).json({ error: 'Current password is required' });
    }

    const policyError = getPasswordPolicyError(newPassword);
    if (policyError) return res.status(400).json({ error: policyError });

    const result = await UserAccount.changePassword(req.user.id, currentPassword, newPassword);
    if (result.status === 'invalid_current_password') {
      logger.warn('Password change rejected', { userId: req.user.id, reason: result.status, ip: req.ip });
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
    if (result.status === 'password_reused') {
      return res.status(400).json({ error: 'New password must be different from the current password' });
    }

    logger.info('Password changed and prior sessions revoked', { userId: req.user.id, ip: req.ip });
    return res.json({
      message: 'Password changed successfully. Other sessions have been signed out.',
      ...createSession(result.user, { mfaAuthenticated: req.user.mfa === true })
    });
  } catch (error) {
    logger.error('Password change failed', { error: error.message, userId: req.user?.id, ip: req.ip });
    return res.status(500).json({ error: 'Failed to change password' });
  }
});

router.post('/logout', authenticateToken, (req, res) => {
  logger.info('User logged out', { userId: req.user.id, ip: req.ip });
  res.json({ message: 'Logged out successfully' });
});

module.exports = router;
