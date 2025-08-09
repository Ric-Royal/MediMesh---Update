const express = require('express');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { logger } = require('../utils/logger');

const router = express.Router();

// Simple login endpoint for development
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    // Development credentials and roles
    const devUsers = {
      'admin': {
        id: '550e8400-e29b-41d4-a716-446655440000',
        password: 'admin123',
        roles: ['admin', 'doctor', 'nurse', 'user'],
        name: 'System Administrator'
      },
      'doctor': {
        id: '550e8400-e29b-41d4-a716-446655440001',
        password: 'doctor123',
        roles: ['doctor', 'user'],
        name: 'Dr. John Smith'
      },
      'nurse': {
        id: '550e8400-e29b-41d4-a716-446655440002',
        password: 'nurse123',
        roles: ['nurse', 'user'],
        name: 'Nurse Jane Doe'
      },
      'user': {
        id: '550e8400-e29b-41d4-a716-446655440003',
        password: 'user123',
        roles: ['user'],
        name: 'Regular User'
      }
    };
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }
    
    // Check if user exists and password matches
    const user = devUsers[username.toLowerCase()];
    if (!user || user.password !== password) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Generate JWT token with proper user data
    const token = jwt.sign(
      {
        sub: user.id,
        preferred_username: username,
        name: user.name,
        email: `${username}@medimesh.dev`,
        realm_access: {
          roles: user.roles
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
      userId: user.id,
      roles: user.roles,
      ip: req.ip
    });
    
    res.json({
      access_token: token,
      token_type: 'Bearer',
      expires_in: 86400,
      user: {
        id: user.id,
        username,
        name: user.name,
        email: `${username}@medimesh.dev`,
        roles: user.roles
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