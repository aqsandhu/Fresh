// ============================================================================
// SOCKET.IO SERVER CONFIGURATION - Real-time chat, order tracking, notifications
// ============================================================================

import { Server } from 'socket.io';
import { createServer } from 'http';
import { verifyAccessToken } from './jwt';
import { query } from './database';
import logger from '../utils/logger';
import { getAllowedOrigins } from '../utils/corsOrigins';
import { parseCookieHeader } from '../utils/authCookies';
import { SocketEventRateLimiter } from '../utils/socketRateLimit';

const MAX_CHAT_MESSAGE_LENGTH = 2000;
const chatRateLimiter = new SocketEventRateLimiter(30, 60_000);
const locationRateLimiter = new SocketEventRateLimiter(6, 10_000);
const typingRateLimiter = new SocketEventRateLimiter(20, 10_000);

let io: Server;

type ChatSenderType = 'customer' | 'rider' | 'admin';

function mapChatSenderType(role?: string): ChatSenderType | null {
  if (role === 'rider') return 'rider';
  if (role === 'admin' || role === 'super_admin') return 'admin';
  if (role === 'customer') return 'customer';
  return null;
}

/**
 * Verifies that the authenticated socket user is allowed to access an order.
 */
const canAccessOrder = async (
  orderId: string,
  userId: string,
  role?: string
): Promise<boolean> => {
  if (role === 'admin' || role === 'super_admin') return true;
  if (!orderId || !userId) return false;
  const result = await query(
    `SELECT o.id FROM orders o
     LEFT JOIN riders r ON o.rider_id = r.id
     WHERE o.id = $1 AND (o.user_id = $2 OR r.user_id = $2)`,
    [orderId, userId]
  );
  return result.rows.length > 0;
};

function extractSocketToken(socket: {
  handshake: {
    auth?: { token?: string };
    headers: { authorization?: string; cookie?: string };
  };
}): string | undefined {
  const fromAuth = socket.handshake.auth?.token;
  if (fromAuth) return fromAuth;

  const authHeader = socket.handshake.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  const cookies = parseCookieHeader(socket.handshake.headers.cookie);
  return cookies.token;
}

export const initializeSocket = (httpServer: ReturnType<typeof createServer>) => {
  const allowedOrigins = getAllowedOrigins();

  io = new Server(httpServer, {
    cors: {
      origin: allowedOrigins,
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  io.use(async (socket, next) => {
    try {
      const token = extractSocketToken(socket);
      if (!token) throw new Error('Authentication required');
      const decoded = verifyAccessToken(token);
      const userResult = await query(
        `SELECT id, phone, role, status
           FROM users
          WHERE id = $1 AND deleted_at IS NULL`,
        [decoded.userId]
      );
      const user = userResult.rows[0];
      if (!user || user.status !== 'active') {
        throw new Error('Account is not active');
      }

      if (user.role === 'rider') {
        const riderResult = await query(
          `SELECT id
             FROM riders
            WHERE user_id = $1
              AND deleted_at IS NULL
              AND verification_status = 'verified'`,
          [decoded.userId]
        );
        if (riderResult.rows.length === 0) {
          throw new Error('Rider account is not verified');
        }
      }

      socket.data.user = {
        ...decoded,
        phone: user.phone,
        role: user.role,
      };
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

    socket.join(`user:${userId}`);
    if (role === 'rider') socket.join('riders');
    if (role === 'admin' || role === 'super_admin') socket.join('admins');

    socket.on('chat:send', async (data: { orderId: string; message: string }) => {
      try {
        if (!chatRateLimiter.allow(socket.id, 'chat:send')) {
          socket.emit('chat:error', { message: 'Too many messages — please slow down' });
          return;
        }

        const allowed = await canAccessOrder(data.orderId, userId, role);
        if (!allowed) {
          logger.warn(
            `Unauthorized chat:send by user ${userId} on order ${data.orderId}`
          );
          socket.emit('chat:error', { message: 'Not authorized for this order' });
          return;
        }

        const senderType = mapChatSenderType(role);
        if (!senderType) {
          socket.emit('chat:error', { message: 'Invalid sender role' });
          return;
        }

        const message = data.message?.trim();
        if (!message) {
          socket.emit('chat:error', { message: 'Message cannot be empty' });
          return;
        }
        if (message.length > MAX_CHAT_MESSAGE_LENGTH) {
          socket.emit('chat:error', {
            message: `Message must be at most ${MAX_CHAT_MESSAGE_LENGTH} characters`,
          });
          return;
        }

        const result = await query(
          `INSERT INTO order_messages (order_id, sender_type, sender_id, message)
           VALUES ($1, $2, $3, $4) RETURNING id, message, sender_type, created_at`,
          [data.orderId, senderType, userId, message]
        );
        const newMessage = result.rows[0];

        const senderResult = await query(
          `SELECT full_name FROM users WHERE id = $1`,
          [userId]
        );
        newMessage.sender_name =
          senderResult.rows[0]?.full_name || 'Unknown';

        io.to(`order:${data.orderId}`).emit('chat:message', newMessage);
      } catch (err: any) {
        logger.error('Error handling chat:send:', err);
        socket.emit('chat:error', { message: 'Failed to send message' });
      }
    });

    socket.on(
      'chat:typing',
      async (data: { orderId: string; isTyping: boolean }) => {
        if (!typingRateLimiter.allow(socket.id, 'chat:typing')) return;
        const allowed = await canAccessOrder(data.orderId, userId, role);
        if (!allowed) return;
        socket.to(`order:${data.orderId}`).emit('chat:typing', {
          orderId: data.orderId,
          isTyping: data.isTyping,
          userId,
        });
      }
    );

    socket.on('order:subscribe', async (orderId: string) => {
      const allowed = await canAccessOrder(orderId, userId, role);
      if (!allowed) {
        logger.warn(
          `Unauthorized order:subscribe by user ${userId} on order ${orderId}`
        );
        socket.emit('order:error', { message: 'Not authorized for this order' });
        return;
      }
      socket.join(`order:${orderId}`);
      logger.debug(`Socket ${socket.id} subscribed to order:${orderId}`);
    });

    socket.on('order:unsubscribe', (orderId: string) => {
      socket.leave(`order:${orderId}`);
      logger.debug(`Socket ${socket.id} unsubscribed from order:${orderId}`);
    });

    socket.on(
      'rider:location',
      async (data: { riderId: string; latitude: number; longitude: number }) => {
        try {
          if (!locationRateLimiter.allow(socket.id, 'rider:location')) {
            return;
          }

          const ownership = await query(
            `SELECT id
               FROM riders
              WHERE id = $1
                AND user_id = $2
                AND deleted_at IS NULL
                AND verification_status = 'verified'`,
            [data.riderId, userId]
          );
          if (ownership.rows.length === 0) {
            logger.warn(
              `Rider location spoof attempt by user ${userId} for rider ${data.riderId}`
            );
            return;
          }
          await query(
            `UPDATE riders 
             SET current_location = ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
                 location_updated_at = NOW(),
                 updated_at = NOW()
             WHERE id = $3`,
            [data.longitude, data.latitude, data.riderId]
          );
          const payload = {
            riderId: data.riderId,
            latitude: data.latitude,
            longitude: data.longitude,
            updatedAt: new Date().toISOString(),
          };
          const activeOrders = await query(
            `SELECT id FROM orders
             WHERE rider_id = $1
               AND status IN ('confirmed', 'preparing', 'ready_for_pickup', 'out_for_delivery')
               AND deleted_at IS NULL`,
            [data.riderId]
          );
          for (const row of activeOrders.rows) {
            io.to(`order:${row.id}`).emit('rider:location', payload);
          }
        } catch (err: any) {
          logger.error('Error updating rider location:', err);
        }
      }
    );

    socket.on('disconnect', (reason) => {
      chatRateLimiter.cleanup(socket.id);
      locationRateLimiter.cleanup(socket.id);
      typingRateLimiter.cleanup(socket.id);
      logger.info(`Socket disconnected: ${socket.id}, reason: ${reason}`);
    });
  });

  return io;
};

export const getIO = () => {
  if (!io) throw new Error('Socket.IO not initialized');
  return io;
};

export const emitOrderUpdate = (orderId: string, data: any) => {
  try {
    getIO().to(`order:${orderId}`).emit('order:update', data);
  } catch (err) {
    logger.error('emitOrderUpdate error:', err);
  }
};

export const emitChatMessage = (orderId: string, message: any) => {
  try {
    getIO().to(`order:${orderId}`).emit('chat:message', message);
  } catch (err) {
    logger.error('emitChatMessage error:', err);
  }
};

export const emitToUser = (userId: string, event: string, data: any) => {
  try {
    getIO().to(`user:${userId}`).emit(event, data);
  } catch (err) {
    logger.error('emitToUser error:', err);
  }
};

export const emitToAdmins = (event: string, data: any) => {
  try {
    getIO().to('admins').emit(event, data);
  } catch (err) {
    logger.error('emitToAdmins error:', err);
  }
};

export const emitToRiders = (event: string, data: any) => {
  try {
    getIO().to('riders').emit(event, data);
  } catch (err) {
    logger.error('emitToRiders error:', err);
  }
};
