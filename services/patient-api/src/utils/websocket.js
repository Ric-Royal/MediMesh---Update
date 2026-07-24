const { Server } = require('socket.io');
const { logger } = require('./logger');
const { getDB } = require('./database');
const { verifyAccessToken, loadPersistedIdentity } = require('../middleware/auth');
const { parseCookies } = require('../security/csrf');

let io;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const QUEUE_ROOM_ROLES = ['admin', 'doctor', 'nurse', 'receptionist', 'lab-tech', 'pharmacist', 'billing', 'radiologist', 'radiographer'];
const WARD_ROOM_ROLES = ['admin', 'doctor', 'nurse'];

const configuredOrigins = () => {
  const value = process.env.SOCKET_ALLOWED_ORIGINS || process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://localhost';
  return value.split(',').map(origin => origin.trim()).filter(Boolean);
};

const getHandshakeToken = (socket) => {
  const cookieToken = parseCookies(socket.handshake.headers?.cookie).medimesh_session;
  if (cookieToken) return cookieToken;
  const authToken = socket.handshake.auth?.token;
  if (typeof authToken === 'string' && authToken.trim()) return authToken.trim();

  const authorization = socket.handshake.headers?.authorization;
  if (typeof authorization === 'string' && authorization.startsWith('Bearer ')) {
    return authorization.slice(7).trim();
  }
  return null;
};

const hasAnyRole = (user, requiredRoles) => {
  const roles = Array.isArray(user?.roles) ? user.roles : [];
  return requiredRoles.some(role => roles.includes(role));
};

const canAccessDepartmentResource = async (socket, table, id) => {
  if (socket.user.roles.includes('admin') || !socket.user.departmentId) return true;
  const result = await getDB().query(
    `SELECT 1 FROM ${table} WHERE id = $1 AND (department_id = $2 OR department_id IS NULL) LIMIT 1`,
    [id, socket.user.departmentId]
  );
  return result.rows.length > 0;
};

const rejectRoomJoin = (socket, roomType, reason, acknowledge) => {
  logger.warn('WebSocket room join denied', {
    userId: socket.user?.id,
    roomType,
    reason
  });
  if (typeof acknowledge === 'function') acknowledge({ success: false, error: reason });
  socket.emit('room-error', { roomType, error: reason });
};

const initializeWebSocket = (server) => {
  const allowedOrigins = configuredOrigins();
  io = new Server(server, {
    cors: {
      origin: allowedOrigins,
      methods: ['GET', 'POST'],
      credentials: true
    },
    allowRequest: (request, callback) => {
      const origin = request.headers.origin;
      callback(null, !origin || allowedOrigins.includes(origin));
    },
    maxHttpBufferSize: 1e6,
    perMessageDeflate: false
  });

  io.use(async (socket, next) => {
    try {
      const token = getHandshakeToken(socket);
      socket.user = await loadPersistedIdentity(verifyAccessToken(token));
      next();
    } catch (error) {
      logger.warn('WebSocket authentication failed', { error: error.message });
      next(new Error('Authentication required'));
    }
  });

  io.on('connection', (socket) => {
    logger.info('WebSocket client connected', { socketId: socket.id, userId: socket.user.id });

    // Join a specific queue room
    socket.on('join-queue', async (data = {}, acknowledge) => {
      const { clinicId } = data;
      if (!hasAnyRole(socket.user, QUEUE_ROOM_ROLES)) {
        return rejectRoomJoin(socket, 'queue', 'Insufficient permissions', acknowledge);
      }
      if (!UUID_PATTERN.test(String(clinicId || ''))) {
        return rejectRoomJoin(socket, 'queue', 'Invalid clinic', acknowledge);
      }
      try {
        if (!(await canAccessDepartmentResource(socket, 'clinics', clinicId))) {
          return rejectRoomJoin(socket, 'queue', 'Clinic access denied', acknowledge);
        }
        await socket.join(`queue-clinic-${clinicId}`);
        logger.info('WebSocket queue room joined', { socketId: socket.id, userId: socket.user.id, clinicId });
        if (typeof acknowledge === 'function') acknowledge({ success: true });
      } catch (error) {
        logger.error('WebSocket queue room join failed', { userId: socket.user.id, error: error.message });
        rejectRoomJoin(socket, 'queue', 'Unable to join clinic queue', acknowledge);
      }
    });

    // Leave a queue room
    socket.on('leave-queue', (data = {}) => {
      const { clinicId } = data;
      if (UUID_PATTERN.test(String(clinicId || ''))) {
        socket.leave(`queue-clinic-${clinicId}`);
      }
    });

    // Join a ward room
    socket.on('join-ward', async (data = {}, acknowledge) => {
      const { wardId } = data;
      if (!hasAnyRole(socket.user, WARD_ROOM_ROLES)) {
        return rejectRoomJoin(socket, 'ward', 'Insufficient permissions', acknowledge);
      }
      if (!UUID_PATTERN.test(String(wardId || ''))) {
        return rejectRoomJoin(socket, 'ward', 'Invalid ward', acknowledge);
      }
      try {
        if (!(await canAccessDepartmentResource(socket, 'wards', wardId))) {
          return rejectRoomJoin(socket, 'ward', 'Ward access denied', acknowledge);
        }
        await socket.join(`ward-${wardId}`);
        logger.info('WebSocket ward room joined', { socketId: socket.id, userId: socket.user.id, wardId });
        if (typeof acknowledge === 'function') acknowledge({ success: true });
      } catch (error) {
        logger.error('WebSocket ward room join failed', { userId: socket.user.id, error: error.message });
        rejectRoomJoin(socket, 'ward', 'Unable to join ward', acknowledge);
      }
    });

    // Leave a ward room
    socket.on('leave-ward', (data = {}) => {
      const { wardId } = data;
      if (UUID_PATTERN.test(String(wardId || ''))) {
        socket.leave(`ward-${wardId}`);
      }
    });

    socket.on('disconnect', () => {
      logger.info('WebSocket client disconnected', { socketId: socket.id, userId: socket.user.id });
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

