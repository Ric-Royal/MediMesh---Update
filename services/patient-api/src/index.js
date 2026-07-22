require('dotenv').config();
const { loadFileSecrets } = require('./utils/fileSecrets');
const { validateRuntimeConfiguration } = require('./utils/runtimeConfig');

// Fail before importing services with startup side effects, opening database
// connections, or binding a listener when production configuration is unsafe.
loadFileSecrets(process.env);
validateRuntimeConfiguration(process.env);

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');

const { logger } = require('./utils/logger');
const { connectDB } = require('./utils/database');
const { connectRedis } = require('./utils/redis');
const { initializeWebSocket } = require('./utils/websocket');
const { authenticateToken } = require('./middleware/auth');
const { auditLogger } = require('./middleware/audit');
const { sanitizeServerErrorResponses } = require('./middleware/sanitizeErrors');
const FileAttachment = require('./models/FileAttachment');
const UserSettings = require('./models/UserSettings');
const SystemSettings = require('./models/SystemSettings');
const Payment = require('./models/Payment');
const UserAccount = require('./models/UserAccount');

// Import routes
const authRoutes = require('./routes/auth');
const patientRoutes = require('./routes/patients');
const recordRoutes = require('./routes/records');
const healthRoutes = require('./routes/health');
const seedRoutes = require('./routes/seed');
const fileRoutes = require('./routes/files');
const settingsRoutes = require('./routes/settings');
const paymentRoutes = require('./routes/payments');
const encounterRoutes = require('./routes/encounters');
const queueRoutes = require('./routes/queue');
const wardRoutes = require('./routes/wards');
const pharmacyRoutes = require('./routes/pharmacy');
const labRoutes = require('./routes/lab');
const billingRoutes = require('./routes/billing');
const radiologyRoutes = require('./routes/radiology');
const appointmentRoutes = require('./routes/appointments');
const scheduleRoutes = require('./routes/schedules');
const clinicRoutes = require('./routes/clinics');
const staffRoutes = require('./routes/staff');
const consultationRoutes = require('./routes/consultations');
const dashboardRoutes = require('./routes/dashboard');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;

// The API is only exposed through the in-stack nginx/Traefik proxy. Trust one
// hop so rate limiting and audit logs use the real client address without
// accepting an arbitrary forwarded chain.
app.set('trust proxy', 1);

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

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'development' ? 50 : 10,
  message: { error: 'Too many sign-in attempts. Please wait before trying again.' },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
});

// Do not persist query strings: webhook secrets and search terms may be present.
morgan.token('safe-url', req => (req.originalUrl || req.url || '').split('?')[0]);
app.use(morgan(':remote-addr - :remote-user [:date[clf]] ":method :safe-url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent"', {
  stream: { write: message => logger.info(message.trim()) }
}));

// Route handlers log diagnostic details internally, but a 5xx response must
// never expose database, storage, or upstream-provider errors to clients.
app.use(sanitizeServerErrorResponses);

// Body parsing
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Audit logging middleware
app.use(auditLogger);

// Health check (no auth required)
app.use('/health', healthRoutes);

// Clinical and administrative responses can contain PHI or credentials. Keep
// them out of browser and intermediary caches regardless of route behavior.
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store, private');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

// Authentication is required in every environment. Development may bootstrap
// demo accounts, but the same persisted account and JWT path is exercised.
app.use('/api/auth/login', loginLimiter);
app.use('/api/auth/mfa/verify', loginLimiter);
app.use('/api/auth', authRoutes);

// Development-only data seeding route.
if (process.env.NODE_ENV === 'development') {
  app.use('/api/seed', authenticateToken, seedRoutes); // Data seeding for authorized testing
}

// Conditional auth middleware - skip auth for M-Pesa callback
const conditionalAuth = (req, res, next) => {
  // Skip authentication for M-Pesa callback webhook
  if (req.path === '/mpesa/callback' && req.method === 'POST') {
    return next();
  }
  // Apply authentication for all other routes
  return authenticateToken(req, res, next);
};

// Protected routes (with exception for M-Pesa callback)
app.use('/api/patients', authenticateToken, patientRoutes);
app.use('/api/records', authenticateToken, recordRoutes);
app.use('/api/files', authenticateToken, fileRoutes);
app.use('/api/settings', authenticateToken, settingsRoutes);
app.use('/api/payments', conditionalAuth, paymentRoutes);
app.use('/api/encounters', authenticateToken, encounterRoutes);
app.use('/api/queue', authenticateToken, queueRoutes);
app.use('/api/wards', authenticateToken, wardRoutes);
app.use('/api/pharmacy', authenticateToken, pharmacyRoutes);
app.use('/api/lab', authenticateToken, labRoutes);
app.use('/api/billing', authenticateToken, billingRoutes);
app.use('/api/radiology', authenticateToken, radiologyRoutes);
app.use('/api/appointments', authenticateToken, appointmentRoutes);
app.use('/api/schedules', authenticateToken, scheduleRoutes);
app.use('/api/clinics', authenticateToken, clinicRoutes);
app.use('/api/staff', authenticateToken, staffRoutes);
app.use('/api/consultations', authenticateToken, consultationRoutes);
app.use('/api/dashboard', authenticateToken, dashboardRoutes);
app.use('/api/admin', authenticateToken, adminRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', {
    error: err.message,
    stack: err.stack,
    type: err.type,
    status: err.status,
    path: req.path,
    method: req.method
  });
  
  // Handle JSON parsing errors
  if (err.type === 'entity.parse.failed' || err.name === 'SyntaxError') {
    return res.status(400).json({
      error: 'Invalid JSON in request body',
      message: err.message
    });
  }
  
  res.status(err.status || 500).json({
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
    
    // Initialize database tables
    await FileAttachment.createTable();
    await UserSettings.createTable();
    await SystemSettings.createTable();
    await Payment.createTable();
    await UserAccount.createTable();
    
    const server = app.listen(PORT, () => {
      logger.info(`MediMesh Patient API server running on port ${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
      if (process.env.NODE_ENV === 'development') {
        logger.info('Development mode: Auth and seed endpoints available');
        logger.info('Rate limiting: Relaxed for development (1000 req/15min)');
      }
    });

    // Initialize WebSocket
    initializeWebSocket(server);
    logger.info('✅ WebSocket server initialized');
    
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
