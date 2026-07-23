const winston = require('winston');

const production = process.env.NODE_ENV === 'production';
const fileLogging = process.env.LOG_TO_FILES === 'true';
const jsonFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Containers log to stdout/stderr so the host can apply protected retention,
// rotation and forwarding. Optional files remain available for local installs.
const applicationTransports = [new winston.transports.Console({
  format: production
    ? jsonFormat
    : winston.format.combine(winston.format.colorize(), winston.format.simple())
})];
if (fileLogging) {
  applicationTransports.push(
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' })
  );
}

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: jsonFormat,
  defaultMeta: { service: 'medimesh-patient-api' },
  transports: applicationTransports
});

const auditTransports = [new winston.transports.Console({ format: jsonFormat })];
if (fileLogging) auditTransports.push(new winston.transports.File({ filename: 'logs/audit.log' }));
const auditLogger = winston.createLogger({
  level: 'info',
  format: jsonFormat,
  defaultMeta: { service: 'medimesh-audit', event_stream: 'audit' },
  transports: auditTransports
});

module.exports = { logger, auditLogger };
