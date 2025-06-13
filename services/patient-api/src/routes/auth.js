const express = require('express');
const jwt = require('jsonwebtoken');
const { logger } = require('../utils/logger');

const router = express.Router();

// Simple login endpoint for development
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    // For development - accept any username/password
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }
    
    // Generate a mock JWT token
    const token = jwt.sign(
      {
        sub: '12345',
        preferred_username: username,
        email: `${username}@medimesh.com`,
        realm_access: {
          roles: ['doctor', 'nurse', 'admin'] // Give all roles for development
        },
        scope: 'openid profile email',
        iss: 'medimesh-dev',
        aud: 'medimesh-client',
        exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60), // 24 hours
        iat: Math.floor(Date.now() / 1000)
      },
      process.env.JWT_SECRET || 'fallback-secret'
    );
    
    logger.info('Development login successful', {
      username,
      ip: req.ip
    });
    
    res.json({
      access_token: token,
      token_type: 'Bearer',
      expires_in: 86400,
      user: {
        id: '12345',
        username,
        email: `${username}@medimesh.com`,
        roles: ['doctor', 'nurse', 'admin']
      }
    });
    
  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get current user info
router.get('/me', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret');
    
    res.json({
      id: decoded.sub,
      username: decoded.preferred_username,
      email: decoded.email,
      roles: decoded.realm_access?.roles || []
    });
    
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

// Logout endpoint
router.post('/logout', (req, res) => {
  // In a real implementation, this would invalidate the token
  logger.info('User logged out', {
    userId: req.user?.id,
    ip: req.ip
  });
  
  res.json({ message: 'Logged out successfully' });
});

module.exports = router; 