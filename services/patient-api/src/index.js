const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
require('dotenv').config();

const { logger } = require('./utils/logger');
const { connectDB } = require('./utils/database');
const { connectRedis } = require('./utils/redis');
const { authenticateToken } = require('./middleware/auth');
const { auditLogger } = require('./middleware/audit');

// Import routes
const authRoutes = require('./routes/auth');
const patientRoutes = require('./routes/patients');
const recordRoutes = require('./routes/records');
const healthRoutes = require('./routes/health');
const seedRoutes = require('./routes/seed');

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true
}));

// Rate limiting - adjusted for development but kept for production
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'development' ? 1000 : 100, // Higher limit for dev, normal for prod
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});
app.use(limiter);

// Logging
app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } }));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Audit logging middleware
app.use(auditLogger);

// Health check (no auth required)
app.use('/health', healthRoutes);

// Development-only routes (for testing)
if (process.env.NODE_ENV === 'development') {
  app.use('/api/auth', authRoutes); // Simple auth for development testing
  app.use('/api/seed', seedRoutes); // Data seeding for testing
}

// Protected routes
app.use('/api/patients', authenticateToken, patientRoutes);
app.use('/api/records', authenticateToken, recordRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Initialize database and Redis connections
async function initialize() {
  try {
    await connectDB();
    await connectRedis();
    
    app.listen(PORT, () => {
      logger.info(`MediMesh Patient API server running on port ${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
      if (process.env.NODE_ENV === 'development') {
        logger.info('Development mode: Auth and seed endpoints available');
        logger.info('Rate limiting: Relaxed for development (1000 req/15min)');
      }
    });
  } catch (error) {
    logger.error('Failed to initialize server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('Received SIGTERM, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('Received SIGINT, shutting down gracefully');
  process.exit(0);
});

initialize(); 