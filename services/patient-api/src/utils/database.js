const { Pool } = require('pg');
const { logger } = require('./logger');

let pool;

const connectDB = async () => {
  try {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL || 'postgresql://medimesh_user:MediMeshDB2024!@localhost:5432/medimesh',
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      max: 20, // maximum number of clients in the pool
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    // Test the connection
    const client = await pool.connect();
    await client.query('SELECT NOW()');
    client.release();

    logger.info('Successfully connected to PostgreSQL database');
    return pool;
  } catch (error) {
    logger.error('Failed to connect to database:', error);
    throw error;
  }
};

const getDB = () => {
  if (!pool) {
    throw new Error('Database not initialized. Call connectDB first.');
  }
  return pool;
};

const closeDB = async () => {
  if (pool) {
    await pool.end();
    logger.info('Database connection closed');
  }
};

module.exports = {
  connectDB,
  getDB,
  closeDB
}; 