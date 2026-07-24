const express = require('express');
const { getDB } = require('../utils/database');
const { getRedis } = require('../utils/redis');
const { storageService } = require('../utils/storage');

const router = express.Router();

router.get('/', async (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString()
  };

  try {
    // Database health check
    try {
      const db = getDB();
      await db.query('SELECT 1');
    } catch (error) {
      health.status = 'unhealthy';
    }

    // Redis health check
    try {
      const redis = getRedis();
      await redis.ping();
    } catch (error) {
      health.status = 'unhealthy';
    }

    try {
      await storageService.checkReadiness();
    } catch (error) {
      health.status = 'unhealthy';
    }

    res.status(health.status === 'healthy' ? 200 : 503).json(health);

  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString()
    });
  }
});

// Readiness probe
router.get('/ready', async (req, res) => {
  try {
    const db = getDB();
    await db.query('SELECT 1');
    const redis = getRedis();
    await redis.ping();
    await storageService.checkReadiness();
    res.status(200).json({ status: 'ready' });
  } catch (error) {
    res.status(503).json({ status: 'not ready' });
  }
});

// Liveness probe
router.get('/live', (req, res) => {
  res.status(200).json({ status: 'alive' });
});

module.exports = router;
