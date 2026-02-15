const { Server } = require('socket.io');
const { logger } = require('./logger');
const { pool } = require('./database');

let io;

const initializeWebSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: process.env.CORS_ORIGIN || '*',
      methods: ['GET', 'POST']
    }
  });

  io.on('connection', (socket) => {
    logger.info(`WebSocket client connected: ${socket.id}`);

    // Join a specific queue room
    socket.on('join-queue', (data) => {
      const { clinicId } = data;
      if (clinicId) {
        socket.join(`queue-clinic-${clinicId}`);
        logger.info(`Socket ${socket.id} joined queue-clinic-${clinicId}`);
      }
    });

    // Leave a queue room
    socket.on('leave-queue', (data) => {
      const { clinicId } = data;
      if (clinicId) {
        socket.leave(`queue-clinic-${clinicId}`);
        logger.info(`Socket ${socket.id} left queue-clinic-${clinicId}`);
      }
    });

    // Join a ward room
    socket.on('join-ward', (data) => {
      const { wardId } = data;
      if (wardId) {
        socket.join(`ward-${wardId}`);
        logger.info(`Socket ${socket.id} joined ward-${wardId}`);
      }
    });

    // Leave a ward room
    socket.on('leave-ward', (data) => {
      const { wardId } = data;
      if (wardId) {
        socket.leave(`ward-${wardId}`);
        logger.info(`Socket ${socket.id} left ward-${wardId}`);
      }
    });

    socket.on('disconnect', () => {
      logger.info(`WebSocket client disconnected: ${socket.id}`);
    });
  });

  logger.info('WebSocket server initialized');
  return io;
};

// Emit queue update to specific clinic
const emitQueueUpdate = (clinicId, data) => {
  if (io) {
    io.to(`queue-clinic-${clinicId}`).emit('queue-update', data);
    logger.info(`Emitted queue update for clinic ${clinicId}`);
  }
};

// Emit ward update to specific ward
const emitWardUpdate = (wardId, data) => {
  if (io) {
    io.to(`ward-${wardId}`).emit('ward-update', data);
    logger.info(`Emitted ward update for ward ${wardId}`);
  }
};

// Broadcast emergency alert
const emitEmergencyAlert = (data) => {
  if (io) {
    io.emit('emergency-alert', data);
    logger.warn(`Emergency alert broadcast: ${JSON.stringify(data)}`);
  }
};

module.exports = {
  initializeWebSocket,
  emitQueueUpdate,
  emitWardUpdate,
  emitEmergencyAlert
};

