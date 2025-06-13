const { createClient } = require('redis');
const { logger } = require('./logger');

let redisClient;

const connectRedis = async () => {
  try {
    redisClient = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379',
      password: process.env.REDIS_PASSWORD || 'redis_password'
    });

    redisClient.on('error', (err) => {
      logger.error('Redis Client Error:', err);
    });

    redisClient.on('connect', () => {
      logger.info('Connected to Redis server');
    });

    redisClient.on('ready', () => {
      logger.info('Redis client ready to use');
    });

    redisClient.on('end', () => {
      logger.info('Redis connection closed');
    });

    await redisClient.connect();
    return redisClient;
  } catch (error) {
    logger.error('Failed to connect to Redis:', error);
    throw error;
  }
};

const getRedis = () => {
  if (!redisClient || !redisClient.isReady) {
    throw new Error('Redis not initialized or not ready. Call connectRedis first.');
  }
  return redisClient;
};

const closeRedis = async () => {
  if (redisClient) {
    await redisClient.quit();
    logger.info('Redis connection closed');
  }
};

// Cache helper functions
const cache = {
  async get(key) {
    try {
      const client = getRedis();
      const value = await client.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.error('Cache get error:', error);
      return null;
    }
  },

  async set(key, value, ttl = 3600) {
    try {
      const client = getRedis();
      await client.setEx(key, ttl, JSON.stringify(value));
      return true;
    } catch (error) {
      logger.error('Cache set error:', error);
      return false;
    }
  },

  async del(key) {
    try {
      const client = getRedis();
      await client.del(key);
      return true;
    } catch (error) {
      logger.error('Cache delete error:', error);
      return false;
    }
  }
};

// Event streaming helper
const eventStream = {
  async publish(stream, data) {
    try {
      const client = getRedis();
      await client.xAdd(stream, '*', data);
      logger.info(`Event published to stream ${stream}`);
    } catch (error) {
      logger.error('Event publish error:', error);
    }
  },

  async subscribe(stream, group, consumer, callback) {
    try {
      const client = getRedis();
      
      // Create consumer group if it doesn't exist
      try {
        await client.xGroupCreate(stream, group, '0', { MKSTREAM: true });
      } catch (err) {
        // Group already exists
      }

      while (true) {
        const messages = await client.xReadGroup(
          group,
          consumer,
          { key: stream, id: '>' },
          { COUNT: 10, BLOCK: 1000 }
        );

        if (messages && messages.length > 0) {
          for (const message of messages[0].messages) {
            await callback(message);
            await client.xAck(stream, group, message.id);
          }
        }
      }
    } catch (error) {
      logger.error('Event subscription error:', error);
    }
  }
};

module.exports = {
  connectRedis,
  getRedis,
  closeRedis,
  cache,
  eventStream
}; 