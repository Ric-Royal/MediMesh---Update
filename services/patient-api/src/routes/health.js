const express = require('express');
const { getDB } = require('../utils/database');
const { getRedis } = require('../utils/redis');

const router = express.Router();

router.get('/', async (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'medimesh-patient-api',
    version: '1.0.0',
    checks: {}
  };

  try {
    // Database health check
    try {
      const db = getDB();
      await db.query('SELECT 1');
      health.checks.database = { status: 'healthy', message: 'Connected' };
    } catch (error) {
      health.checks.database = { status: 'unhealthy', message: error.message };
      health.status = 'unhealthy';
    }

    // Redis health check
    try {
      const redis = getRedis();
      await redis.ping();
      health.checks.redis = { status: 'healthy', message: 'Connected' };
    } catch (error) {
      health.checks.redis = { status: 'unhealthy', message: error.message };
      health.status = 'unhealthy';
    }

    // Memory usage check
    const memoryUsage = process.memoryUsage();
    health.checks.memory = {
      status: 'healthy',
      usage: {
        rss: `${Math.round(memoryUsage.rss / 1024 / 1024)} MB`,
        heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)} MB`,
        heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)} MB`
      }
    };

    res.status(health.status === 'healthy' ? 200 : 503).json(health);

  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

// Readiness probe
router.get('/ready', async (req, res) => {
  try {
    const db = getDB();
    await db.query('SELECT 1');
    res.status(200).json({ status: 'ready' });
  } catch (error) {
    res.status(503).json({ status: 'not ready', error: error.message });
  }
});

// Liveness probe
router.get('/live', (req, res) => {
  res.status(200).json({ status: 'alive' });
});

module.exports = router; 