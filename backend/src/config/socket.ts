// ============================================================================
// SOCKET.IO SERVER CONFIGURATION - Real-time chat, order tracking, notifications
// ============================================================================

import { Server } from 'socket.io';
import { createServer } from 'http';
import { verifyAccessToken } from './jwt';
import logger from '../utils/logger';

let io: Server;

export const initializeSocket = (httpServer: ReturnType<typeof createServer>) => {
  io = new Server(httpServer, {
    cors: {
      origin: (process.env.CORS_ORIGIN || 'http://localhost:3000').split(','),
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // Auth middleware - verify JWT token from handshake
  io.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth.token ||
        socket.handshake.headers.authorization?.replace('Bearer ', '');
      if (!token) throw new Error('Authentication required');
      const decoded = verifyAccessToken(token);
      socket.data.user = decoded;
      next();
    } catch (err: any) {
      logger.warn(`Socket auth failed: ${err.message}`);
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.data.user?.userId;
    const role = socket.data.user?.role;
    logger.info(
      `Socket connected: ${socket.id}, user: ${userId}, role: ${role}`
    );

    // Join user-specific room for targeted messages
    socket.join(`user:${userId}`);
    if (role === 'rider') socket.join('riders');
    if (role === 'admin' || role === 'super_admin') socket.join('admins');

    // Handle chat messages
    socket.on('chat:send', async (data: { orderId: string; message: string }) => {
      try {
        const { query } = require('./database');
        const result = await query(
          `INSERT INTO order_messages (order_id, sender_type, sender_id, message)
           VALUES ($1, $2, $3, $4) RETURNING id, message, sender_type, created_at`,
          [data.orderId, role || 'customer', userId, data.message]
        );
        const newMessage = result.rows[0];

        // Fetch sender name
        const senderResult = await query(
          `SELECT full_name FROM users WHERE id = $1`,
          [userId]
        );
        newMessage.sender_name =
          senderResult.rows[0]?.full_name || 'Unknown';

        // Broadcast to all in the order room
        io.to(`order:${data.orderId}`).emit('chat:message', newMessage);
      } catch (err: any) {
        logger.error('Error handling chat:send:', err);
        socket.emit('chat:error', { message: 'Failed to send message' });
      }
    });

    // Handle typing indicators
    socket.on(
      'chat:typing',
      (data: { orderId: string; isTyping: boolean }) => {
        socket.to(`order:${data.orderId}`).emit('chat:typing', {
          orderId: data.orderId,
          isTyping: data.isTyping,
          userId,
        });
      }
    );

    // Handle order tracking subscription
    socket.on('order:subscribe', (orderId: string) => {
      socket.join(`order:${orderId}`);
      logger.debug(`Socket ${socket.id} subscribed to order:${orderId}`);
    });

    socket.on('order:unsubscribe', (orderId: string) => {
      socket.leave(`order:${orderId}`);
      logger.debug(`Socket ${socket.id} unsubscribed from order:${orderId}`);
    });

    // Handle rider location updates (from rider app)
    socket.on(
      'rider:location',
      async (data: { riderId: string; latitude: number; longitude: number }) => {
        try {
          const { query } = require('./database');
          await query(
            `UPDATE riders 
             SET current_location = ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
                 location_updated_at = NOW(),
                 updated_at = NOW()
             WHERE id = $3`,
            [data.longitude, data.latitude, data.riderId]
          );
          // Broadcast to order room if rider has active orders
          socket.to(`order:${data.riderId}`).emit('rider:location', {
            riderId: data.riderId,
            latitude: data.latitude,
            longitude: data.longitude,
            updatedAt: new Date().toISOString(),
          });
        } catch (err: any) {
          logger.error('Error updating rider location:', err);
        }
      }
    );

    socket.on('disconnect', (reason) => {
      logger.info(`Socket disconnected: ${socket.id}, reason: ${reason}`);
    });
  });

  return io;
};

export const getIO = () => {
  if (!io) throw new Error('Socket.IO not initialized');
  return io;
};

// Helper to emit to specific order room
export const emitOrderUpdate = (orderId: string, data: any) => {
  try {
    getIO().to(`order:${orderId}`).emit('order:update', data);
  } catch (err) {
    logger.error('emitOrderUpdate error:', err);
  }
};

// Helper to emit chat message to order room
export const emitChatMessage = (orderId: string, message: any) => {
  try {
    getIO().to(`order:${orderId}`).emit('chat:message', message);
  } catch (err) {
    logger.error('emitChatMessage error:', err);
  }
};

// Helper to emit to specific user
export const emitToUser = (userId: string, event: string, data: any) => {
  try {
    getIO().to(`user:${userId}`).emit(event, data);
  } catch (err) {
    logger.error('emitToUser error:', err);
  }
};

// Helper to emit to all admins
export const emitToAdmins = (event: string, data: any) => {
  try {
    getIO().to('admins').emit(event, data);
  } catch (err) {
    logger.error('emitToAdmins error:', err);
  }
};

// Helper to emit to all riders
export const emitToRiders = (event: string, data: any) => {
  try {
    getIO().to('riders').emit(event, data);
  } catch (err) {
    logger.error('emitToRiders error:', err);
  }
};
